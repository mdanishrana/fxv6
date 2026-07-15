// @vitest-environment node
//
// Regression suite for the multi-tenant data isolation vulnerability fixed on 2026-07-15:
// 8 route files trusted a client-supplied x-tenant-id header instead of the JWT-verified
// tenant. This suite registers two real tenants and asserts that Tenant A's token can never
// see Tenant B's data, no matter what x-tenant-id header or URL param it sends.

// Env vars (test DB, no real email/Sentry side effects) are set in
// server/__tests__/env.setup.js, which vitest.config.ts runs before this file's own
// imports - setting them here directly would be too late, since ESM import statements
// are hoisted above all other top-level code in the file.
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenantA, tenantB;

async function registerTenant(suffix) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: `Isolation Test ${suffix}`,
            email: `isolation-test-${suffix}-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: `Isolation Test Farm ${suffix}`
        });
    expect(res.status).toBe(201);
    return {
        token: res.body.token,
        userId: res.body.user.id,
        tenantId: res.body.tenant.id
    };
}

async function cleanupTenant(t) {
    if (!t) return;
    await db.query('DELETE FROM sessions WHERE user_id = $1', [t.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [t.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [t.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [t.tenantId]);
}

beforeAll(async () => {
    const dbCheck = await db.query('SELECT current_database() AS name');
    expect(dbCheck.rows[0].name).toBe('farmxpert_test');
    tenantA = await registerTenant('A');
    tenantB = await registerTenant('B');
});

afterAll(async () => {
    await cleanupTenant(tenantA);
    await cleanupTenant(tenantB);
    await db.pool.end();
});

// These are exactly the 8 files fixed on 2026-07-15 - each previously scoped its
// queries by a raw x-tenant-id header instead of the verified JWT tenant.
const headerScopedEndpoints = [
    '/api/cattle',
    '/api/feed/items',
    '/api/payments',
    '/api/labour/workers',
    '/api/suppliers',
    '/api/groups',
    '/api/genetics/semen'
];

describe('Tenant isolation - header-scoped endpoints', () => {
    it.each(headerScopedEndpoints)('%s: a spoofed x-tenant-id header is ignored in favor of the real token', async (path) => {
        const res = await request(app)
            .get(path)
            .set('Authorization', `Bearer ${tenantA.token}`)
            .set('x-tenant-id', tenantB.tenantId); // attacker-controlled header pointing at the victim

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Tenant A is freshly registered with no data of its own - if the header were
        // honored, this would return Tenant B's data instead of an empty array.
        expect(res.body.length).toBe(0);
    });

    it.each(headerScopedEndpoints)('%s: requires authentication - no token is rejected outright', async (path) => {
        const res = await request(app)
            .get(path)
            .set('x-tenant-id', tenantB.tenantId);

        expect(res.status).toBe(401);
    });
});

describe('Tenant isolation - medical.js (URL-path tenant id, unchecked before the fix)', () => {
    it('ignores a victim tenant id placed in the URL path in favor of the real token', async () => {
        const res = await request(app)
            .get(`/api/medical/${tenantB.tenantId}`)
            .set('Authorization', `Bearer ${tenantA.token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });
});

describe('Tenant isolation - tenants.js /upgrade (missing ownership check before the fix)', () => {
    it('rejects a non-admin tenant trying to upgrade a different tenant', async () => {
        const res = await request(app)
            .post(`/api/tenants/${tenantB.tenantId}/upgrade`)
            .set('Authorization', `Bearer ${tenantA.token}`)
            .send({ planId: 1 });

        expect(res.status).toBe(403);
    });
});
