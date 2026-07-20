// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant, adminToken;
let originalBasicLimits = null;

async function registerTenant() {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Capacity Test',
        email: `capacity-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Capacity Test Farm'
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    // tenants.tier is constrained to BASIC/STANDARD/PREMIUM, so - as in
    // planLimits.test.js - this temporarily tightens the shared BASIC plan's
    // limits rather than using a throwaway tier value. Tests run with
    // --no-file-parallelism (single worker), so this doesn't race other files.
    const existing = await db.query(`SELECT user_limit, cattle_limit FROM subscription_plans WHERE code = 'BASIC'`);
    if (existing.rows.length > 0) {
        originalBasicLimits = existing.rows[0];
        await db.query(`UPDATE subscription_plans SET user_limit = 3, cattle_limit = '5' WHERE code = 'BASIC'`);
    } else {
        await db.query(`INSERT INTO subscription_plans (code, name, user_limit, cattle_limit) VALUES ('BASIC', 'Basic', 3, '5')`);
    }

    tenant = await registerTenant();
    await db.query('UPDATE tenants SET legacy_tag_scheme = true WHERE id = $1', [tenant.tenantId]);

    for (let i = 0; i < 3; i++) {
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ tagNumber: `CAP-${i}`, type: 'Cow', gender: 'Female', status: 'Active' });
        expect(res.status).toBe(201);
    }

    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);
    adminToken = tenant.token; // authMiddleware re-reads role from DB per-request
});

afterAll(async () => {
    await db.query('DELETE FROM cattle WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    if (originalBasicLimits) {
        await db.query(`UPDATE subscription_plans SET user_limit = $1, cattle_limit = $2 WHERE code = 'BASIC'`, [originalBasicLimits.user_limit, originalBasicLimits.cattle_limit]);
    } else {
        await db.query(`DELETE FROM subscription_plans WHERE code = 'BASIC'`);
    }
    await db.pool.end();
});

describe('GET /api/tenants/capacity', () => {
    it('rejects non-admin callers', async () => {
        await db.query(`UPDATE users SET role = 'OWNER' WHERE id = $1`, [tenant.userId]);
        const res = await request(app).get('/api/tenants/capacity').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(403);
        await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);
    });

    it('reports usage and utilization against the plan limit', async () => {
        const res = await request(app).get('/api/tenants/capacity').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const row = res.body.find(r => r.tenantId === tenant.tenantId);
        expect(row).toBeTruthy();
        expect(row.cattleCount).toBe(3);
        expect(row.cattleLimit).toBe(5);
        expect(row.cattleUtilizationPct).toBe(60);
        // All 3 test cattle were just created, so they count toward this month's growth.
        expect(row.animalsAddedThisMonth).toBe(3);
    });
});

describe('PUT /api/tenants/:id/capacity-override', () => {
    it('rejects non-admin callers', async () => {
        await db.query(`UPDATE users SET role = 'OWNER' WHERE id = $1`, [tenant.userId]);
        const res = await request(app)
            .put(`/api/tenants/${tenant.tenantId}/capacity-override`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ cattleLimitOverride: '100' });
        expect(res.status).toBe(403);
        await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [tenant.userId]);
    });

    it('raises the effective cattle limit above the plan limit', async () => {
        const res = await request(app)
            .put(`/api/tenants/${tenant.tenantId}/capacity-override`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ cattleLimitOverride: '100' });
        expect(res.status).toBe(200);

        const capRes = await request(app).get('/api/tenants/capacity').set('Authorization', `Bearer ${adminToken}`);
        const row = capRes.body.find(r => r.tenantId === tenant.tenantId);
        expect(row.cattleLimit).toBe(100);
    });

    it('clears the override (sending null) and falls back to the plan limit again', async () => {
        // Regression check: an earlier draft of this route used COALESCE, which
        // cannot tell "clear this field" from "field omitted" - both arrive as a
        // SQL NULL - so a null payload silently kept the old override forever.
        const res = await request(app)
            .put(`/api/tenants/${tenant.tenantId}/capacity-override`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ cattleLimitOverride: null });
        expect(res.status).toBe(200);
        expect(res.body.cattle_limit_override).toBe(null);

        const capRes = await request(app).get('/api/tenants/capacity').set('Authorization', `Bearer ${adminToken}`);
        const row = capRes.body.find(r => r.tenantId === tenant.tenantId);
        expect(row.cattleLimit).toBe(5);
    });

    it('rejects a garbage override value', async () => {
        const res = await request(app)
            .put(`/api/tenants/${tenant.tenantId}/capacity-override`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ cattleLimitOverride: 'not-a-number' });
        expect(res.status).toBe(400);
    });
});
