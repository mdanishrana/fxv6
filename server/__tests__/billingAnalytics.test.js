// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant;
let subscriptionId;
const invoiceIds = [];

async function registerTenant() {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Billing Analytics Test',
        email: `billing-analytics-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Billing Analytics Test Farm'
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);

    const subRes = await db.query(
        `INSERT INTO tenant_subscriptions (tenant_id, status, billing_cycle, amount) VALUES ($1, 'ACTIVE', 'MONTHLY', 3000) RETURNING id`,
        [tenant.tenantId]
    );
    subscriptionId = subRes.rows[0].id;

    // First invoice (this tenant's first payment - not a renewal), paid today.
    const inv1 = await db.query(
        `INSERT INTO subscription_invoices (tenant_id, subscription_id, invoice_number, amount, total_amount, due_date, status, paid_date)
         VALUES ($1, $2, $3, 3000, 3000, CURRENT_DATE, 'PAID', CURRENT_DATE) RETURNING id`,
        [tenant.tenantId, subscriptionId, `TEST-BA-1-${Date.now()}`]
    );
    invoiceIds.push(inv1.rows[0].id);

    // Second invoice for the SAME subscription, paid today - this one IS a renewal.
    const inv2 = await db.query(
        `INSERT INTO subscription_invoices (tenant_id, subscription_id, invoice_number, amount, total_amount, due_date, status, paid_date, created_at)
         VALUES ($1, $2, $3, 3000, 3000, CURRENT_DATE, 'PAID', CURRENT_DATE, NOW() + INTERVAL '1 second') RETURNING id`,
        [tenant.tenantId, subscriptionId, `TEST-BA-2-${Date.now()}`]
    );
    invoiceIds.push(inv2.rows[0].id);
});

afterAll(async () => {
    for (const id of invoiceIds) {
        await db.query('DELETE FROM subscription_invoices WHERE id = $1', [id]);
    }
    await db.query('DELETE FROM tenant_subscriptions WHERE id = $1', [subscriptionId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('GET /api/subscriptions/analytics', () => {
    it('rejects non-admin callers', async () => {
        await db.query(`UPDATE users SET role = 'OWNER' WHERE id = $1`, [tenant.userId]);
        const res = await request(app).get('/api/subscriptions/analytics').set('Authorization', `Bearer ${tenant.token}`);
        expect(res.status).toBe(403);
        await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);
    });

    it('reports ARR derived from MRR, revenue windows, and counts', async () => {
        const res = await request(app).get('/api/subscriptions/analytics').set('Authorization', `Bearer ${tenant.token}`);
        expect(res.status).toBe(200);

        expect(res.body.mrr).toBeGreaterThanOrEqual(3000);
        expect(res.body.arr).toBe(Math.round(res.body.mrr * 12 * 100) / 100);
        expect(res.body.revenueToday).toBeGreaterThanOrEqual(6000);
        expect(res.body.revenueThisMonth).toBeGreaterThanOrEqual(6000);
        expect(res.body.newCustomersThisMonth).toBeGreaterThanOrEqual(1);
        // One of the two PAID invoices was this subscription's first payment (not a
        // renewal); the other was paid after an earlier PAID invoice, so it counts.
        expect(res.body.renewalsThisMonth).toBeGreaterThanOrEqual(1);
    });

    it('includes this month in the 12-month revenue and subscription-growth series', async () => {
        const res = await request(app).get('/api/subscriptions/analytics').set('Authorization', `Bearer ${tenant.token}`);
        const thisMonthKey = new Date().toISOString().slice(0, 7);

        expect(res.body.revenueByMonth).toHaveLength(12);
        expect(res.body.subscriptionGrowth).toHaveLength(12);

        const revBucket = res.body.revenueByMonth.find(b => b.month === thisMonthKey);
        expect(revBucket.revenue).toBeGreaterThanOrEqual(6000);

        const growthBucket = res.body.subscriptionGrowth.find(b => b.month === thisMonthKey);
        expect(growthBucket.active).toBeGreaterThanOrEqual(1);
    });

    it('breaks revenue down per farm', async () => {
        const res = await request(app).get('/api/subscriptions/analytics').set('Authorization', `Bearer ${tenant.token}`);
        const row = res.body.revenueByFarm.find(f => f.tenantId === tenant.tenantId);
        expect(row).toBeTruthy();
        expect(row.revenue).toBeGreaterThanOrEqual(6000);
        // Farms with no paid invoices shouldn't clutter the breakdown.
        expect(res.body.revenueByFarm.every(f => f.revenue > 0)).toBe(true);
    });
});
