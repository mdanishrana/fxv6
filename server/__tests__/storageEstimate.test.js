// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let admin;
let cattleId;

beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Storage Estimate Test',
        email: `storage-estimate-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Storage Estimate Farm'
    });
    expect(res.status).toBe(201);
    admin = { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [admin.userId]);

    const cattleRes = await request(app)
        .post('/api/cattle')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ tagNumber: `STORAGE-${Date.now()}`, type: 'Cow', gender: 'Female', status: 'Active' });
    expect(cattleRes.status).toBe(201);
    cattleId = cattleRes.body.id;
});

afterAll(async () => {
    if (cattleId) await db.query('DELETE FROM cattle WHERE id = $1', [cattleId]);
    await db.query('DELETE FROM audit_logs WHERE tenant_id = $1', [admin.tenantId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [admin.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [admin.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [admin.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [admin.tenantId]);
    await db.pool.end();
});

describe('Per-tenant storage estimate in capacity report', () => {
    it('includes a positive storageBytes for a tenant with data', async () => {
        const res = await request(app)
            .get('/api/tenants/capacity')
            .set('Authorization', `Bearer ${admin.token}`);
        expect(res.status).toBe(200);

        const row = res.body.find(r => r.tenantId === admin.tenantId);
        expect(row).toBeTruthy();
        expect(typeof row.storageBytes).toBe('number');
        // The tenant has at least a user row and a cattle row - real bytes, not zero.
        expect(row.storageBytes).toBeGreaterThan(0);
    });

    it('every farm in the report carries a numeric storage estimate', async () => {
        const res = await request(app)
            .get('/api/tenants/capacity')
            .set('Authorization', `Bearer ${admin.token}`);
        expect(res.status).toBe(200);
        for (const row of res.body) {
            expect(typeof row.storageBytes).toBe('number');
            expect(row.storageBytes).toBeGreaterThanOrEqual(0);
        }
    });
});
