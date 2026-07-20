// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant;
let subscriptionId;

async function registerTenant() {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Subscription Lifecycle Test',
        email: `sub-lifecycle-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Subscription Lifecycle Test Farm'
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    const subRes = await db.query(
        `INSERT INTO tenant_subscriptions (tenant_id, status, billing_cycle, amount, trial_end_date) VALUES ($1, 'TRIAL', 'MONTHLY', 3000, $2) RETURNING id`,
        [tenant.tenantId, trialEnd.toISOString().split('T')[0]]
    );
    subscriptionId = subRes.rows[0].id;
});

afterAll(async () => {
    await db.query('DELETE FROM tenant_subscriptions WHERE id = $1', [subscriptionId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('Extend Trial', () => {
    it('pushes trial_end_date forward via trialEndsAt', async () => {
        const before = await db.query('SELECT trial_end_date FROM tenant_subscriptions WHERE id = $1', [subscriptionId]);
        const newEnd = new Date(before.rows[0].trial_end_date);
        newEnd.setDate(newEnd.getDate() + 14);

        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ trialEndsAt: newEnd.toISOString().split('T')[0] });
        expect(res.status).toBe(200);

        const after = await db.query('SELECT trial_end_date FROM tenant_subscriptions WHERE id = $1', [subscriptionId]);
        expect(new Date(after.rows[0].trial_end_date).getTime()).toBeGreaterThan(new Date(before.rows[0].trial_end_date).getTime());
    });
});

describe('Pause / Resume', () => {
    it('activates the trial subscription, then pauses it', async () => {
        await request(app).put(`/api/subscriptions/${subscriptionId}`).set('Authorization', `Bearer ${tenant.token}`).send({ status: 'ACTIVE' });
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ status: 'PAUSED' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('PAUSED');
    });

    it('excludes a paused subscription from invoice generation', async () => {
        await db.query(`UPDATE tenant_subscriptions SET next_billing_date = CURRENT_DATE WHERE id = $1`, [subscriptionId]);
        const before = await db.query('SELECT COUNT(*) FROM subscription_invoices WHERE subscription_id = $1', [subscriptionId]);

        const res = await request(app)
            .post('/api/subscriptions/generate-invoices')
            .set('Authorization', `Bearer ${tenant.token}`);
        expect(res.status).toBe(200);

        const after = await db.query('SELECT COUNT(*) FROM subscription_invoices WHERE subscription_id = $1', [subscriptionId]);
        expect(after.rows[0].count).toBe(before.rows[0].count); // unchanged - still PAUSED, not ACTIVE
    });

    it('resumes the subscription back to ACTIVE', async () => {
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ status: 'ACTIVE' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ACTIVE');
    });
});

describe('Cancel', () => {
    it('cancels the subscription and stamps cancelled_at', async () => {
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ status: 'CANCELLED' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CANCELLED');
        expect(res.body.cancelled_at).toBeTruthy();
    });

    it('rejects non-admin callers', async () => {
        await db.query(`UPDATE users SET role = 'OWNER' WHERE id = $1`, [tenant.userId]);
        const res = await request(app)
            .put(`/api/subscriptions/${subscriptionId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ status: 'ACTIVE' });
        expect(res.status).toBe(403);
        await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);
    });
});
