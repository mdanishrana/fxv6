// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

// Regression tests for shared plan-limit enforcement (server/utils/planLimits.js).
// Previously: cattle limits were FREE-tier-only (BASIC/STANDARD/PREMIUM farms could
// add unlimited animals), and user limits used a hardcoded map disconnected from the
// admin-editable subscription_plans.user_limit the Plans tab actually edits.

let tenant;
let originalBasicLimits = null;

async function registerTenant() {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: 'Plan Limits Test',
            email: `plan-limits-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: 'Plan Limits Test Farm'
        });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    // tenants.tier is constrained to BASIC/STANDARD/PREMIUM, and subscription_plans.code
    // is unique - so this exercises the real lookup path by temporarily tightening the
    // shared BASIC plan's limits for the duration of the test, then restoring them.
    // Tests run with --no-file-parallelism (single worker), so this doesn't race other files.
    const existing = await db.query(`SELECT user_limit, cattle_limit FROM subscription_plans WHERE code = 'BASIC'`);
    if (existing.rows.length > 0) {
        originalBasicLimits = existing.rows[0];
        await db.query(`UPDATE subscription_plans SET user_limit = 1, cattle_limit = '2' WHERE code = 'BASIC'`);
    } else {
        await db.query(`INSERT INTO subscription_plans (code, name, user_limit, cattle_limit) VALUES ('BASIC', 'Basic', 1, '2')`);
    }

    tenant = await registerTenant();
    await db.query('UPDATE tenants SET legacy_tag_scheme = true WHERE id = $1', [tenant.tenantId]);
});

afterAll(async () => {
    await db.query('DELETE FROM cattle WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    if (originalBasicLimits) {
        await db.query(`UPDATE subscription_plans SET user_limit = $1, cattle_limit = $2 WHERE code = 'BASIC'`, [originalBasicLimits.user_limit, originalBasicLimits.cattle_limit]);
    } else {
        await db.query(`DELETE FROM subscription_plans WHERE code = 'BASIC'`);
    }
    await db.pool.end();
});

describe('Cattle limit enforcement', () => {
    it('allows creating animals up to the plan cattle_limit', async () => {
        for (let i = 0; i < 2; i++) {
            const res = await request(app)
                .post('/api/cattle')
                .set('Authorization', `Bearer ${tenant.token}`)
                .send({ tagNumber: `LIMIT-${i}`, type: 'Cow', gender: 'Female', status: 'Active' });
            expect(res.status).toBe(201);
        }
    });

    it('rejects the animal that would exceed the plan cattle_limit', async () => {
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ tagNumber: 'LIMIT-OVER', type: 'Cow', gender: 'Female', status: 'Active' });
        expect(res.status).toBe(403);
        expect(res.body.limitReached).toBe(true);
    });
});

describe('User limit enforcement', () => {
    it('rejects inviting a user once the plan user_limit is reached', async () => {
        // The registering OWNER already counts as 1 user against this plan's
        // user_limit of 1, so any invite should be rejected immediately.
        const res = await request(app)
            .post(`/api/users/${tenant.tenantId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ name: 'Extra Manager', email: `extra-manager-${Date.now()}@example.com`, role: 'MANAGER' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/user limit/i);
    });
});
