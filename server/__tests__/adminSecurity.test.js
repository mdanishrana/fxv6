// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

// Regression tests for the admin-panel security holes: GET/POST /api/tenants used
// to be reachable without authentication (leaking SMTP settings, WhatsApp keys and
// owner contact data, and allowing anonymous farm creation), and "Login as Farm"
// impersonation now issues a real backend session.

let ownerToken, adminToken, ownerTenantId, otherTenantId;

const uniq = Date.now();

async function registerFarm(label) {
    const res = await request(app).post('/api/auth/register').send({
        name: `${label} Owner`,
        email: `${label}.${uniq}@test.local`,
        password: 'secret123',
        farmName: `${label} Farm ${uniq}`,
        tier: 'PREMIUM'
    });
    expect(res.status).toBe(201);
    return res.body;
}

beforeAll(async () => {
    const a = await registerFarm('adminsec-a');
    ownerToken = a.token;
    ownerTenantId = a.tenant.id;

    const b = await registerFarm('adminsec-b');
    otherTenantId = b.tenant.id;

    // Promote farm B's owner to SAAS_ADMIN; authMiddleware reads the role fresh
    // from the DB on every request, so the existing token becomes an admin token.
    await db.query(`UPDATE users SET role = 'SAAS_ADMIN' WHERE email = $1`, [`adminsec-b.${uniq}@test.local`]);
    adminToken = b.token;
});

afterAll(async () => {
    await db.query('DELETE FROM tenants WHERE id = ANY($1)', [[ownerTenantId, otherTenantId]]);
});

describe('GET /api/tenants', () => {
    it('rejects unauthenticated requests', async () => {
        const res = await request(app).get('/api/tenants');
        expect(res.status).toBe(401);
    });

    it('rejects non-admin authenticated users', async () => {
        const res = await request(app).get('/api/tenants').set('Authorization', `Bearer ${ownerToken}`);
        expect(res.status).toBe(403);
    });

    it('returns the full list to SAAS_ADMIN', async () => {
        const res = await request(app).get('/api/tenants').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.some(t => t.id === ownerTenantId)).toBe(true);
    });
});

describe('POST /api/tenants', () => {
    it('rejects unauthenticated farm creation', async () => {
        const res = await request(app).post('/api/tenants').send({ name: 'Anon Farm', tier: 'BASIC' });
        expect(res.status).toBe(401);
    });

    it('rejects non-admin farm creation', async () => {
        const res = await request(app).post('/api/tenants')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'Sneaky Farm', tier: 'BASIC' });
        expect(res.status).toBe(403);
    });
});

describe('POST /api/tenants/:tenantId/impersonate', () => {
    it('rejects non-admin users', async () => {
        const res = await request(app)
            .post(`/api/tenants/${otherTenantId}/impersonate`)
            .set('Authorization', `Bearer ${ownerToken}`);
        expect(res.status).toBe(403);
    });

    it('issues a working OWNER session for SAAS_ADMIN', async () => {
        const res = await request(app)
            .post(`/api/tenants/${ownerTenantId}/impersonate`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.tenant.id).toBe(ownerTenantId);
        expect(res.body.user.role).toBe('OWNER');

        // The issued token must be a real session scoped to the impersonated farm.
        const cattleRes = await request(app)
            .get('/api/cattle')
            .set('Authorization', `Bearer ${res.body.token}`);
        expect(cattleRes.status).toBe(200);
        expect(Array.isArray(cattleRes.body)).toBe(true);
    });
});
