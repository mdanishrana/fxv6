// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant;

async function registerTenant() {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: 'Cattle CRUD Test',
            email: `cattle-crud-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: 'Cattle CRUD Test Farm'
        });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();
    // This file's assertions assume the client-supplied tagNumber is used as-is
    // (including the duplicate-tag collision fallback below) - that's the legacy
    // tag scheme's behavior. New tenants default to the new global-sequence scheme
    // (see tagGeneration.test.js), so pin this fixture to legacy explicitly.
    await db.query('UPDATE tenants SET legacy_tag_scheme = true WHERE id = $1', [tenant.tenantId]);
});

afterAll(async () => {
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('Cattle CRUD', () => {
    let cattleId;

    it('creates a cattle record with the fields that were sent', async () => {
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .set('x-tenant-id', tenant.tenantId)
            .send({
                tagNumber: 'CRUD-TEST-001',
                name: 'Test Bull',
                type: 'Bull',
                breed: 'Sahiwal',
                gender: 'Male',
                entryWeight: 200,
                currentWeight: 220,
                purchasePrice: 90000,
                ownerName: 'Farm Owned'
            });

        expect(res.status).toBe(201);
        expect(res.body.tagNumber).toBe('CRUD-TEST-001');
        expect(res.body.name).toBe('Test Bull');
        expect(parseFloat(res.body.currentWeight)).toBe(220);
        cattleId = res.body.id;
        expect(cattleId).toBeTruthy();
    });

    it('returns entryDate as the exact plain date sent, not shifted a day by timezone conversion', async () => {
        // node-postgres parses `date` columns to local-midnight JS Dates; serializing
        // that straight to JSON (res.json() calls toISOString()) converts to UTC first,
        // which silently shifts the date backward a day on this server's +3 timezone.
        // mapCattleRow must read it back through pgDateToStr(), not pass the raw Date.
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .set('x-tenant-id', tenant.tenantId)
            .send({
                tagNumber: 'CRUD-TEST-ENTRYDATE',
                type: 'Bull',
                breed: 'Sahiwal',
                gender: 'Male',
                entryDate: '2024-10-25',
                entryWeight: 200,
                currentWeight: 220
            });
        expect(res.status).toBe(201);
        expect(res.body.entryDate).toBe('2024-10-25');

        const getRes = await request(app)
            .get(`/api/cattle/${res.body.id}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .set('x-tenant-id', tenant.tenantId);
        expect(getRes.body.entryDate).toBe('2024-10-25');

        await db.query('DELETE FROM cattle WHERE id = $1', [res.body.id]);
    });

    it('rejects creating a second animal with the same tag by auto-suffixing rather than erroring', async () => {
        // cattle.js retries with a random suffix on a unique_violation instead of failing outright
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .set('x-tenant-id', tenant.tenantId)
            .send({ tagNumber: 'CRUD-TEST-001', type: 'Bull' });

        expect(res.status).toBe(201);
        expect(res.body.tagNumber).not.toBe('CRUD-TEST-001');
        expect(res.body.tagNumber.startsWith('CRUD-TEST-001-D')).toBe(true);

        // clean up this extra record immediately, it's not used by later tests
        await db.query('DELETE FROM cattle WHERE id = $1', [res.body.id]);
    });

    it('reads the created record back by id, scoped to the owning tenant', async () => {
        const res = await request(app)
            .get(`/api/cattle/${cattleId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .set('x-tenant-id', tenant.tenantId);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(cattleId);
        expect(res.body.tagNumber).toBe('CRUD-TEST-001');
    });

    it('updates only the fields sent, leaving the rest untouched (COALESCE semantics)', async () => {
        const res = await request(app)
            .put(`/api/cattle/${cattleId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .set('x-tenant-id', tenant.tenantId)
            .send({ currentWeight: 260 }); // only updating weight

        expect(res.status).toBe(200);
        expect(parseFloat(res.body.currentWeight)).toBe(260);
        // fields not sent in this PUT should be unchanged from creation
        expect(res.body.tagNumber).toBe('CRUD-TEST-001');
        expect(res.body.name).toBe('Test Bull');
    });

    it('cascade-deletes related cattle_costs when the animal is deleted', async () => {
        await db.query(
            `INSERT INTO cattle_costs (tenant_id, cattle_id, cost_type, amount, description, date)
             VALUES ($1, $2, 'MEDICAL', 500, 'Test vet visit', NOW())`,
            [tenant.tenantId, cattleId]
        );

        const costsBefore = await db.query('SELECT id FROM cattle_costs WHERE cattle_id = $1', [cattleId]);
        expect(costsBefore.rows.length).toBe(1);

        const res = await request(app)
            .delete(`/api/cattle/${cattleId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .set('x-tenant-id', tenant.tenantId);

        expect(res.status).toBe(200);

        const cattleAfter = await db.query('SELECT id FROM cattle WHERE id = $1', [cattleId]);
        expect(cattleAfter.rows.length).toBe(0);

        const costsAfter = await db.query('SELECT id FROM cattle_costs WHERE cattle_id = $1', [cattleId]);
        expect(costsAfter.rows.length).toBe(0);
    });
});
