// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';
import { runMonthlyBillingCheckAllTenants } from '../jobs/billingScheduler.js';

let billableTenant, emptyTenant;

async function registerTenant(label) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: `${label} Billing Cron Test`,
            email: `${label}-billing-cron-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: `${label} Billing Cron Farm`
        });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

async function cleanupTenant(tenant) {
    if (!tenant) return;
    await db.query('DELETE FROM payment_action_tokens WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM payment_review_tokens WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM payments WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
}

beforeAll(async () => {
    billableTenant = await registerTenant('billable');
    emptyTenant = await registerTenant('empty');

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${billableTenant.token}`);
    await db.query('UPDATE tenants SET owner_email = $1 WHERE id = $2', [meRes.body.user.email, billableTenant.tenantId]);
    // Pin to legacy scheme - this file isn't testing the new tag-generation feature
    // and expects its 'CRON-BILL-001' tag to persist as-is (see tagGeneration.test.js).
    await db.query('UPDATE tenants SET legacy_tag_scheme = true WHERE id = $1', [billableTenant.tenantId]);
});

afterAll(async () => {
    await cleanupTenant(billableTenant);
    await cleanupTenant(emptyTenant);
    await db.pool.end();
});

describe('Monthly billing cron across tenants', () => {
    let animalId;

    it('creates an overdue-by-now animal for one tenant, leaves the other empty', async () => {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        lastMonth.setDate(1);
        const entryDate = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${billableTenant.token}`)
            .send({
                tagNumber: 'CRON-BILL-001',
                type: 'Cow',
                breed: 'Sahiwal',
                gender: 'Female',
                status: 'Active',
                currentWeight: 300,
                entryWeight: 300,
                entryDate,
                monthlyCharges: 12000
            });
        expect(res.status).toBe(201);
        animalId = res.body.id;
    });

    it('processes the billable tenant and skips the empty one without throwing', async () => {
        await expect(runMonthlyBillingCheckAllTenants([billableTenant.tenantId, emptyTenant.tenantId])).resolves.not.toThrow();

        const listRes = await request(app)
            .get(`/api/payments?cattleId=${animalId}`)
            .set('Authorization', `Bearer ${billableTenant.token}`);
        expect(listRes.body.length).toBeGreaterThan(0);

        const emptyListRes = await request(app)
            .get('/api/payments/summary')
            .set('Authorization', `Bearer ${emptyTenant.token}`);
        expect(emptyListRes.body).toEqual([]);
    });

    it('mints a fresh review token each run for a tenant with animals still due', async () => {
        const before = await db.query('SELECT count(*) FROM payment_review_tokens WHERE tenant_id = $1', [billableTenant.tenantId]);
        await runMonthlyBillingCheckAllTenants([billableTenant.tenantId, emptyTenant.tenantId]);
        const after = await db.query('SELECT count(*) FROM payment_review_tokens WHERE tenant_id = $1', [billableTenant.tenantId]);
        expect(parseInt(after.rows[0].count, 10)).toBeGreaterThan(parseInt(before.rows[0].count, 10));
    });

    afterAll(async () => {
        if (animalId) await db.query('DELETE FROM cattle WHERE id = $1', [animalId]);
    });
});
