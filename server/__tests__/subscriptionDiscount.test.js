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
        name: 'Subscription Discount Test',
        email: `sub-discount-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Subscription Discount Test Farm'
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);

    const subRes = await db.query(
        `INSERT INTO tenant_subscriptions (tenant_id, status, billing_cycle, amount, next_billing_date) VALUES ($1, 'ACTIVE', 'MONTHLY', 5000, CURRENT_DATE) RETURNING id`,
        [tenant.tenantId]
    );
    subscriptionId = subRes.rows[0].id;
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

describe('Apply Discount', () => {
    it('rejects an invalid discount type', async () => {
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ discountType: 'HALF_OFF', discountValue: 50 });
        expect(res.status).toBe(400);
    });

    it('rejects a percentage discount over 100', async () => {
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ discountType: 'PERCENT', discountValue: 150 });
        expect(res.status).toBe(400);
    });

    it('applies a 20% discount and reflects it on the next generated invoice', async () => {
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ discountType: 'PERCENT', discountValue: 20 });
        expect(res.status).toBe(200);
        expect(res.body.discount_type).toBe('PERCENT');
        expect(parseFloat(res.body.discount_value)).toBe(20);

        const genRes = await request(app).post('/api/subscriptions/generate-invoices').set('Authorization', `Bearer ${tenant.token}`);
        expect(genRes.status).toBe(200);

        const invRes = await db.query('SELECT id, amount, discount_amount, total_amount FROM subscription_invoices WHERE subscription_id = $1', [subscriptionId]);
        expect(invRes.rows.length).toBe(1);
        invoiceIds.push(invRes.rows[0].id);
        expect(parseFloat(invRes.rows[0].amount)).toBe(5000);
        expect(parseFloat(invRes.rows[0].discount_amount)).toBe(1000); // 20% of 5000
        expect(parseFloat(invRes.rows[0].total_amount)).toBe(4000);
    });

    it('clamps a fixed discount larger than the subscription amount to zero, not negative', async () => {
        await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ discountType: 'FIXED', discountValue: 999999 });

        await db.query(`UPDATE tenant_subscriptions SET next_billing_date = CURRENT_DATE WHERE id = $1`, [subscriptionId]);
        const genRes = await request(app).post('/api/subscriptions/generate-invoices').set('Authorization', `Bearer ${tenant.token}`);
        expect(genRes.status).toBe(200);

        const invRes = await db.query(
            'SELECT id, total_amount FROM subscription_invoices WHERE subscription_id = $1 ORDER BY created_at DESC LIMIT 1',
            [subscriptionId]
        );
        invoiceIds.push(invRes.rows[0].id);
        expect(parseFloat(invRes.rows[0].total_amount)).toBe(0);
    });

    it('clears the discount', async () => {
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ clearDiscount: true });
        expect(res.status).toBe(200);
        expect(res.body.discount_type).toBe(null);
        expect(res.body.discount_value).toBe(null);
    });

    it('rejects non-admin callers', async () => {
        await db.query(`UPDATE users SET role = 'OWNER' WHERE id = $1`, [tenant.userId]);
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ discountType: 'PERCENT', discountValue: 10 });
        expect(res.status).toBe(403);
        await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);
    });
});
