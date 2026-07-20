// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let adminToken, adminUserId, adminTenantId;
let planId;
const PLAN_CODE = `PF${Date.now().toString(36).toUpperCase()}`;

beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Plans Fields Test',
        email: `plans-fields-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Plans Fields Test Farm'
    });
    expect(res.status).toBe(201);
    adminToken = res.body.token;
    adminUserId = res.body.user.id;
    adminTenantId = res.body.tenant.id;
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [adminUserId]);
});

afterAll(async () => {
    if (planId) await db.query('DELETE FROM subscription_plans WHERE id = $1', [planId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [adminUserId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [adminUserId]);
    await db.query('DELETE FROM users WHERE id = $1', [adminUserId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [adminTenantId]);
    await db.pool.end();
});

describe('Plan annual price and support level', () => {
    it('creates a plan with an annual price and support level', async () => {
        const res = await request(app)
            .post('/api/plans')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ code: PLAN_CODE, name: 'Field Test Plan', pricePkr: 5000, annualPricePkr: 50000, supportLevel: 'Priority Email' });
        expect(res.status).toBe(201);
        planId = res.body.id;

        const listRes = await request(app).get('/api/plans');
        const plan = listRes.body.find(p => p.id === planId);
        expect(plan.annualPricePkr).toBe('50000.00');
        expect(plan.supportLevel).toBe('Priority Email');
    });

    it('updates a plan\'s annual price and support level', async () => {
        // price_pkr/contact_email are direct-assign (not COALESCE) in this route,
        // not merge-patch semantics - the only caller (the admin Plans form) always
        // resends the full form, same as this test does here for pricePkr.
        const res = await request(app)
            .put(`/api/plans/${planId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ pricePkr: 5000, annualPricePkr: 48000, supportLevel: 'Dedicated Support' });
        expect(res.status).toBe(200);
        expect(res.body.annual_price_pkr).toBe('48000.00');
        expect(res.body.support_level).toBe('Dedicated Support');
        expect(res.body.price_pkr).toBe('5000.00');
    });

    it('rejects non-admin plan creation', async () => {
        await db.query(`UPDATE users SET role = 'OWNER' WHERE id = $1`, [adminUserId]);
        const res = await request(app)
            .post('/api/plans')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ code: 'SHOULDFAIL', name: 'Should Fail' });
        expect(res.status).toBe(403);
        await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [adminUserId]);
    });
});
