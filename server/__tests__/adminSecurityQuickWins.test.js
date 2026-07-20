// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

// Two tenants: dataTenant is the farm being managed (keeps its OWNER role
// throughout, which the impersonate route requires), adminTenant's owner is
// promoted to SAAS_ADMIN once and used for every admin call. Toggling a single
// user's role between OWNER/SAAS_ADMIN mid-suite is fragile - a failed
// assertion skips the "revert role" cleanup line, leaving later tests running
// with the wrong role - so this file avoids that pattern entirely.

let dataTenant, adminTenant;
let managerUserId;

async function registerTenant(label) {
    const res = await request(app).post('/api/auth/register').send({
        name: `${label} Owner`,
        email: `${label}.${Date.now()}@example.com`,
        password: 'testpass123',
        farmName: `${label} Farm ${Date.now()}`
    });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id, email: res.body.user.email };
}

beforeAll(async () => {
    dataTenant = await registerTenant('secqw-data');
    adminTenant = await registerTenant('secqw-admin');
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE id = $1`, [adminTenant.userId]);

    const managerRes = await db.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, role, is_verified)
         VALUES ($1, 'Reset Target Manager', $2, 'x', 'MANAGER', true) RETURNING id`,
        [dataTenant.tenantId, `reset-target-${Date.now()}@example.com`]
    );
    managerUserId = managerRes.rows[0].id;
});

afterAll(async () => {
    await db.query('DELETE FROM password_reset_tokens WHERE user_id = ANY($1)', [[dataTenant.userId, managerUserId]]);
    await db.query('DELETE FROM sessions WHERE user_id = ANY($1)', [[dataTenant.userId, adminTenant.userId, managerUserId]]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = ANY($1)', [[dataTenant.userId, adminTenant.userId]]);
    await db.query('DELETE FROM users WHERE tenant_id = ANY($1)', [[dataTenant.tenantId, adminTenant.tenantId]]);
    await db.query('DELETE FROM tenants WHERE id = ANY($1)', [[dataTenant.tenantId, adminTenant.tenantId]]);
    await db.pool.end();
});

describe('GET /api/tenants/:tenantId/sessions', () => {
    it('rejects non-admin callers', async () => {
        const res = await request(app).get(`/api/tenants/${dataTenant.tenantId}/sessions`).set('Authorization', `Bearer ${dataTenant.token}`);
        expect(res.status).toBe(403);
    });

    it('lists the login session created at registration, with IP captured', async () => {
        const res = await request(app).get(`/api/tenants/${dataTenant.tenantId}/sessions`).set('Authorization', `Bearer ${adminTenant.token}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0].userEmail).toBe(dataTenant.email);
        expect(res.body[0].isImpersonation).toBe(false);
    });

    it('tags an impersonation session distinctly from a real login', async () => {
        const impRes = await request(app)
            .post(`/api/tenants/${dataTenant.tenantId}/impersonate`)
            .set('Authorization', `Bearer ${adminTenant.token}`);
        expect(impRes.status).toBe(200);

        const res = await request(app).get(`/api/tenants/${dataTenant.tenantId}/sessions`).set('Authorization', `Bearer ${adminTenant.token}`);
        const impersonationRow = res.body.find((s) => s.isImpersonation);
        expect(impersonationRow).toBeTruthy();
        expect(impersonationRow.userAgent).toMatch(/^Admin impersonation by/);
    });
});

describe('POST /api/tenants/:tenantId/users/:userId/reset-password', () => {
    it('rejects non-admin callers', async () => {
        const res = await request(app)
            .post(`/api/tenants/${dataTenant.tenantId}/users/${managerUserId}/reset-password`)
            .set('Authorization', `Bearer ${dataTenant.token}`);
        expect(res.status).toBe(403);
    });

    it('creates a usable password_reset_tokens row, targeting a user other than the admin caller', async () => {
        const res = await request(app)
            .post(`/api/tenants/${dataTenant.tenantId}/users/${managerUserId}/reset-password`)
            .set('Authorization', `Bearer ${adminTenant.token}`);
        expect(res.status).toBe(200);

        const tokenRes = await db.query(
            'SELECT token FROM password_reset_tokens WHERE user_id = $1 AND used = false ORDER BY created_at DESC LIMIT 1',
            [managerUserId]
        );
        expect(tokenRes.rows.length).toBe(1);

        // The token this route just minted must actually work through the normal
        // self-service reset-password endpoint - not just exist in the table.
        const resetRes = await request(app)
            .post('/api/auth/reset-password')
            .send({ token: tokenRes.rows[0].token, password: 'brandNewPass123' });
        expect(resetRes.status).toBe(200);
    });

    it('404s for a user not in the given tenant', async () => {
        const res = await request(app)
            .post(`/api/tenants/${dataTenant.tenantId}/users/00000000-0000-0000-0000-000000000000/reset-password`)
            .set('Authorization', `Bearer ${adminTenant.token}`);
        expect(res.status).toBe(404);
    });
});
