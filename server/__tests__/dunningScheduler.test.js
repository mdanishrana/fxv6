// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';
import { runDunningCheck, stageForInvoice, daysBetween } from '../jobs/dunningScheduler.js';

describe('dunning stage logic (pure)', () => {
    it('computes days overdue/until-due', () => {
        expect(daysBetween('2026-01-10', '2026-01-10')).toBe(0);
        expect(daysBetween('2026-01-10', '2026-01-05')).toBe(5); // 5 days overdue
        expect(daysBetween('2026-01-10', '2026-01-13')).toBe(-3); // due in 3 days
    });

    it('stages a PENDING invoice as UPCOMING at T-3, DUE_TODAY at T-0, nothing earlier', () => {
        expect(stageForInvoice('PENDING', -3)).toBe('UPCOMING');
        expect(stageForInvoice('PENDING', -1)).toBe('UPCOMING');
        expect(stageForInvoice('PENDING', 0)).toBe('DUE_TODAY');
        expect(stageForInvoice('PENDING', -4)).toBe(null);
    });

    it('stages an OVERDUE invoice through OVERDUE -> FINAL_NOTICE -> SUSPENDED', () => {
        expect(stageForInvoice('OVERDUE', 1)).toBe('OVERDUE');
        expect(stageForInvoice('OVERDUE', 6)).toBe('OVERDUE');
        expect(stageForInvoice('OVERDUE', 7)).toBe('FINAL_NOTICE');
        expect(stageForInvoice('OVERDUE', 9)).toBe('FINAL_NOTICE');
        expect(stageForInvoice('OVERDUE', 10)).toBe('SUSPENDED');
        expect(stageForInvoice('OVERDUE', 30)).toBe('SUSPENDED');
    });

    it('has nothing to send for PAID/CANCELLED invoices', () => {
        expect(stageForInvoice('PAID', 30)).toBe(null);
        expect(stageForInvoice('CANCELLED', 30)).toBe(null);
    });
});

describe('runDunningCheck (integration)', () => {
    let tenant;
    let subscriptionId, invoiceId;

    async function registerTenant() {
        const res = await request(app).post('/api/auth/register').send({
            name: 'Dunning Test',
            email: `dunning-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: 'Dunning Test Farm'
        });
        expect(res.status).toBe(201);
        return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
    }

    beforeAll(async () => {
        tenant = await registerTenant();
        // Give the tenant a real owner_email (register doesn't set one on the
        // tenants row directly in every path) so the scheduler has somewhere to send.
        await db.query(`UPDATE tenants SET owner_email = $1 WHERE id = $2`, [
            `dunning-owner-${Date.now()}@example.com`, tenant.tenantId
        ]);

        const subRes = await db.query(
            `INSERT INTO tenant_subscriptions (tenant_id, status, billing_cycle, amount) VALUES ($1, 'ACTIVE', 'MONTHLY', 5000) RETURNING id`,
            [tenant.tenantId]
        );
        subscriptionId = subRes.rows[0].id;

        // Due 15 days ago and still PENDING - past the SUSPEND_AFTER_DAYS_OVERDUE
        // threshold once marked OVERDUE, so a single run should suspend the farm.
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() - 15);
        const invRes = await db.query(
            `INSERT INTO subscription_invoices (tenant_id, subscription_id, invoice_number, amount, total_amount, due_date, status)
             VALUES ($1, $2, $3, 5000, 5000, $4, 'PENDING') RETURNING id`,
            [tenant.tenantId, subscriptionId, `TEST-INV-${Date.now()}`, dueDate.toISOString().split('T')[0]]
        );
        invoiceId = invRes.rows[0].id;
    });

    afterAll(async () => {
        await db.query('DELETE FROM subscription_invoices WHERE id = $1', [invoiceId]);
        await db.query('DELETE FROM tenant_subscriptions WHERE id = $1', [subscriptionId]);
        await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
        await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
        await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
        await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
        await db.pool.end();
    });

    it('marks the invoice OVERDUE, suspends the farm, and stamps the SUSPENDED stage', async () => {
        await runDunningCheck();

        const invRes = await db.query('SELECT status, last_reminder_stage FROM subscription_invoices WHERE id = $1', [invoiceId]);
        expect(invRes.rows[0].status).toBe('OVERDUE');
        expect(invRes.rows[0].last_reminder_stage).toBe('SUSPENDED');

        const tenantRes = await db.query('SELECT status, suspended_by_dunning FROM tenants WHERE id = $1', [tenant.tenantId]);
        expect(tenantRes.rows[0].status).toBe('SUSPENDED');
        expect(tenantRes.rows[0].suspended_by_dunning).toBe(true);

        const subRes = await db.query('SELECT status FROM tenant_subscriptions WHERE id = $1', [subscriptionId]);
        expect(subRes.rows[0].status).toBe('PAST_DUE');
    });

    it('does not re-send the same stage on a second run', async () => {
        const before = await db.query('SELECT last_reminder_sent_at FROM subscription_invoices WHERE id = $1', [invoiceId]);
        await runDunningCheck();
        const after = await db.query('SELECT last_reminder_sent_at FROM subscription_invoices WHERE id = $1', [invoiceId]);
        expect(after.rows[0].last_reminder_sent_at.getTime()).toBe(before.rows[0].last_reminder_sent_at.getTime());
    });

    it('auto-reactivates the farm when the overdue invoice is marked PAID', async () => {
        const res = await request(app)
            .put(`/api/subscriptions/invoices/${invoiceId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ status: 'PAID', paidDate: new Date().toISOString().split('T')[0] });

        // The registering user is OWNER, not SAAS_ADMIN, so this route should reject -
        // reactivation is exercised via a direct admin-role call below instead.
        expect(res.status).toBe(403);

        await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);
        const adminRes = await request(app)
            .put(`/api/subscriptions/invoices/${invoiceId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ status: 'PAID', paidDate: new Date().toISOString().split('T')[0] });
        expect(adminRes.status).toBe(200);

        const tenantRes = await db.query('SELECT status, suspended_by_dunning FROM tenants WHERE id = $1', [tenant.tenantId]);
        expect(tenantRes.rows[0].status).toBe('ACTIVE');
        expect(tenantRes.rows[0].suspended_by_dunning).toBe(false);

        const subRes = await db.query('SELECT status FROM tenant_subscriptions WHERE id = $1', [subscriptionId]);
        expect(subRes.rows[0].status).toBe('ACTIVE');
    });
});
