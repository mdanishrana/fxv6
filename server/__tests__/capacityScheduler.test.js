// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';
import { runCapacityCheck } from '../jobs/capacityScheduler.js';

let tenant;
let originalBasicLimits = null;

async function registerTenant() {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Capacity Scheduler Test',
        email: `capacity-sched-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Capacity Scheduler Test Farm'
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    const existing = await db.query(`SELECT user_limit, cattle_limit FROM subscription_plans WHERE code = 'BASIC'`);
    if (existing.rows.length > 0) {
        originalBasicLimits = existing.rows[0];
        await db.query(`UPDATE subscription_plans SET user_limit = 5, cattle_limit = '2' WHERE code = 'BASIC'`);
    } else {
        await db.query(`INSERT INTO subscription_plans (code, name, user_limit, cattle_limit) VALUES ('BASIC', 'Basic', 5, '2')`);
    }

    tenant = await registerTenant();
    await db.query(`UPDATE tenants SET legacy_tag_scheme = true, owner_email = $1 WHERE id = $2`, [
        `capacity-owner-${Date.now()}@example.com`, tenant.tenantId
    ]);

    // 1 of 2 cattle = 50%, under the 90% warning threshold - too small to trigger.
    const res = await request(app)
        .post('/api/cattle')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({ tagNumber: 'CAPWARN-1', type: 'Cow', gender: 'Female', status: 'Active' });
    expect(res.status).toBe(201);
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

describe('runCapacityCheck', () => {
    it('does not warn a tenant under the threshold', async () => {
        await runCapacityCheck();
        const res = await db.query('SELECT capacity_notice_sent_at FROM tenants WHERE id = $1', [tenant.tenantId]);
        expect(res.rows[0].capacity_notice_sent_at).toBe(null);
    });

    it('warns once a tenant crosses the threshold, and stamps the notice time', async () => {
        // 2 of 2 cattle = 100%, over the 90% threshold.
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ tagNumber: 'CAPWARN-2', type: 'Cow', gender: 'Female', status: 'Active' });
        expect(res.status).toBe(201);

        await runCapacityCheck();
        const dbRes = await db.query('SELECT capacity_notice_sent_at FROM tenants WHERE id = $1', [tenant.tenantId]);
        expect(dbRes.rows[0].capacity_notice_sent_at).not.toBe(null);
    });

    it('does not re-warn immediately on a second run', async () => {
        const before = await db.query('SELECT capacity_notice_sent_at FROM tenants WHERE id = $1', [tenant.tenantId]);
        await runCapacityCheck();
        const after = await db.query('SELECT capacity_notice_sent_at FROM tenants WHERE id = $1', [tenant.tenantId]);
        expect(after.rows[0].capacity_notice_sent_at.getTime()).toBe(before.rows[0].capacity_notice_sent_at.getTime());
    });
});
