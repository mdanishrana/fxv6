// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant;

async function registerTenant() {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: 'Billing Test',
            email: `billing-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: 'Billing Test Farm'
        });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();
    // Give the tenant an owner_email so the monthly report has somewhere to send to.
    const tRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tenant.token}`);
    await db.query('UPDATE tenants SET owner_email = $1 WHERE id = $2', [tRes.body.user.email, tenant.tenantId]);
});

afterAll(async () => {
    await db.query('DELETE FROM payment_action_tokens WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM payments WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('Billing: generate-monthly creates a prorated invoice and marks overdue', () => {
    let animalId;

    it('creates an active animal registered on the 1st of last month with monthly billing enabled', async () => {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        lastMonth.setDate(1);
        const entryDate = lastMonth.toISOString().split('T')[0];

        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                tagNumber: 'BILL-TEST-001',
                type: 'Cow',
                breed: 'Sahiwal',
                gender: 'Female',
                status: 'Active',
                currentWeight: 300,
                entryWeight: 300,
                entryDate,
                monthlyCharges: 15000
            });
        expect(res.status).toBe(201);
        animalId = res.body.id;
    });

    it('generates last month full invoice + this month invoice via /generate-monthly, and marks last month OVERDUE', async () => {
        const res = await request(app)
            .post('/api/payments/generate-monthly')
            .set('Authorization', `Bearer ${tenant.token}`);
        expect(res.status).toBe(200);

        const listRes = await request(app)
            .get(`/api/payments?cattleId=${animalId}`)
            .set('Authorization', `Bearer ${tenant.token}`);
        expect(listRes.status).toBe(200);
        // Registered on the 1st of last month -> full amount last month, no proration.
        // Exactly 2 invoices: last month + this month, no stray/duplicate records.
        expect(listRes.body.length).toBe(2);
        expect(listRes.body.every(p => parseFloat(p.amount) === 15000)).toBe(true);
        // Last month's invoice was due on the 1st of this month, which has passed -> OVERDUE.
        const overdue = listRes.body.find(p => p.status === 'OVERDUE');
        expect(overdue).toBeTruthy();
    });

    it('is idempotent: running generate-monthly again does not create duplicate invoices', async () => {
        const before = await request(app)
            .get(`/api/payments?cattleId=${animalId}`)
            .set('Authorization', `Bearer ${tenant.token}`);

        await request(app).post('/api/payments/generate-monthly').set('Authorization', `Bearer ${tenant.token}`);

        const after = await request(app)
            .get(`/api/payments?cattleId=${animalId}`)
            .set('Authorization', `Bearer ${tenant.token}`);

        expect(after.body.length).toBe(before.body.length);
    });

    afterAll(async () => {
        if (animalId) await db.query('DELETE FROM cattle WHERE id = $1', [animalId]);
    });
});

describe('Billing: public payment-action link (email one-click flow)', () => {
    let animalId, token;

    it('creates an animal with a pending invoice and a valid action token', async () => {
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                tagNumber: 'BILL-TEST-002',
                type: 'Cow',
                breed: 'Sahiwal',
                gender: 'Female',
                status: 'Active',
                currentWeight: 300,
                entryWeight: 300,
                entryDate: new Date().toISOString().split('T')[0],
                monthlyCharges: 20000
            });
        expect(res.status).toBe(201);
        animalId = res.body.id;

        await request(app).post('/api/payments/generate-monthly').set('Authorization', `Bearer ${tenant.token}`);

        const tokenRow = await db.query(
            `INSERT INTO payment_action_tokens (tenant_id, cattle_id, token, expires_at)
             VALUES ($1, $2, $3, NOW() + INTERVAL '45 days') RETURNING token`,
            [tenant.tenantId, animalId, `test-token-${Date.now()}`]
        );
        token = tokenRow.rows[0].token;
    });

    it('rejects an unknown token', async () => {
        const res = await request(app).get('/api/payment-actions?token=does-not-exist&action=received');
        expect(res.status).toBe(404);
        expect(res.body.ok).toBe(false);
        expect(res.body.reason).toBe('NOT_FOUND');
    });

    it('accepts a valid token and marks the action as received (no auth required)', async () => {
        const res = await request(app).get(`/api/payment-actions?token=${token}&action=received`);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.action).toBe('received');
        expect(res.body.animalTag).toBe('BILL-TEST-002');

        const listRes = await request(app)
            .get(`/api/payments?cattleId=${animalId}`)
            .set('Authorization', `Bearer ${tenant.token}`);
        expect(listRes.body.every(p => p.status === 'PAID')).toBe(true);
    });

    it('rejects the same token a second time (single-use)', async () => {
        const res = await request(app).get(`/api/payment-actions?token=${token}&action=pending`);
        expect(res.status).toBe(410);
        expect(res.body.ok).toBe(false);
        expect(res.body.reason).toBe('ALREADY_USED');
    });

    afterAll(async () => {
        if (animalId) await db.query('DELETE FROM cattle WHERE id = $1', [animalId]);
    });
});
