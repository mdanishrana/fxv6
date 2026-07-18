// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';
import { runNightlyFeedProcessing } from '../jobs/scheduler.js';

let activeTenant, emptyTenant;

async function registerTenant(label) {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: `${label} Cron Test`,
            email: `${label}-cron-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: `${label} Cron Test Farm`
        });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

async function cleanupTenant(tenant) {
    if (!tenant) return;
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
}

beforeAll(async () => {
    activeTenant = await registerTenant('active');
    emptyTenant = await registerTenant('empty');
});

afterAll(async () => {
    await cleanupTenant(activeTenant);
    await cleanupTenant(emptyTenant);
    await db.pool.end();
});

describe('Nightly cron orchestration across tenants', () => {
    let feedItemId, packageId, animalId;

    it('sets up an active animal on a package for one tenant, leaves the other empty', async () => {
        const feedRes = await request(app)
            .post('/api/feed/items')
            .set('Authorization', `Bearer ${activeTenant.token}`)
            .send({ name: 'Cron Test Feed', quantityKg: 500, costPerKg: 30 });
        expect(feedRes.status).toBe(201);
        feedItemId = feedRes.body.id;

        const pkgRes = await request(app)
            .post('/api/feed/packages')
            .set('Authorization', `Bearer ${activeTenant.token}`)
            .send({
                name: 'Cron Test Package',
                dailyIntakePercent: 2.5,
                items: [{ feedItemId, ratioPercent: 100, type: 'CONCENTRATE' }]
            });
        expect(pkgRes.status).toBe(201);
        packageId = pkgRes.body.id;

        const animalRes = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${activeTenant.token}`)
            .send({
                tagNumber: 'CRON-TEST-001',
                type: 'Cow',
                breed: 'Sahiwal',
                gender: 'Female',
                status: 'Active',
                currentWeight: 300,
                entryWeight: 300,
                monthlyPackageId: packageId
            });
        expect(animalRes.status).toBe(201);
        animalId = animalRes.body.id;
    });

    it('processes the tenant with active animals and skips the empty tenant without throwing', async () => {
        await expect(runNightlyFeedProcessing([activeTenant.tenantId, emptyTenant.tenantId])).resolves.not.toThrow();

        const logRes = await request(app)
            .get('/api/feed/usage-log')
            .set('Authorization', `Bearer ${activeTenant.token}`);
        expect(logRes.status).toBe(200);
        expect(logRes.body.length).toBeGreaterThan(0);
        expect(logRes.body[0].totalAnimals).toBe(1);

        const emptyLogRes = await request(app)
            .get('/api/feed/usage-log')
            .set('Authorization', `Bearer ${emptyTenant.token}`);
        expect(emptyLogRes.status).toBe(200);
        expect(emptyLogRes.body.length).toBe(0);
    });

    it('does not double-process a tenant already processed today', async () => {
        const before = await request(app)
            .get('/api/feed/usage-log')
            .set('Authorization', `Bearer ${activeTenant.token}`);

        await runNightlyFeedProcessing([activeTenant.tenantId, emptyTenant.tenantId]);

        const after = await request(app)
            .get('/api/feed/usage-log')
            .set('Authorization', `Bearer ${activeTenant.token}`);

        expect(after.body.length).toBe(before.body.length);
    });

    afterAll(async () => {
        if (activeTenant) await db.query('DELETE FROM feed_usage_log WHERE tenant_id = $1', [activeTenant.tenantId]);
        if (animalId) await db.query('DELETE FROM cattle WHERE id = $1', [animalId]);
        if (packageId) await db.query('DELETE FROM feed_packages WHERE id = $1', [packageId]);
        if (feedItemId) await db.query('DELETE FROM feed_items WHERE id = $1', [feedItemId]);
    });
});
