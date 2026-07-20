// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant;

async function registerTenant() {
    const res = await request(app).post('/api/auth/register').send({
        name: 'Quick Additions Test',
        email: `quick-additions-test-${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: 'Quick Additions Test Farm'
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();
});

afterAll(async () => {
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('Tenant country/timezone', () => {
    it('saves and returns country and timezone', async () => {
        const res = await request(app)
            .put(`/api/tenants/${tenant.tenantId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ country: 'Pakistan', timezone: 'Asia/Karachi' });
        expect(res.status).toBe(200);
        expect(res.body.country).toBe('Pakistan');
        expect(res.body.timezone).toBe('Asia/Karachi');
    });
});

describe('Last login surfaced in users list', () => {
    it('includes lastLogin, null until the user actually logs in via /login', async () => {
        // Registration issues a token directly without going through the /login
        // route, so last_login stays unset until an explicit login happens.
        const before = await request(app).get(`/api/tenants/${tenant.tenantId}/users`).set('Authorization', `Bearer ${tenant.token}`);
        const beforeUser = before.body.find(u => u.id === tenant.userId);
        expect(beforeUser.lastLogin).toBeFalsy();

        const loginRes = await request(app).post('/api/auth/login').send({ email: beforeUser.email, password: 'testpass123' });
        expect(loginRes.status).toBe(200);

        const after = await request(app).get(`/api/tenants/${tenant.tenantId}/users`).set('Authorization', `Bearer ${tenant.token}`);
        const afterUser = after.body.find(u => u.id === tenant.userId);
        expect(afterUser.lastLogin).toBeTruthy();
    });
});
