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
            name: 'Feed Processing Test',
            email: `feed-processing-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: 'Feed Processing Test Farm'
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

describe('Daily feed processing deducts every package item type', () => {
    let concentrateId, roughageId, packageId, animalId;

    it('sets up a concentrate ingredient, a roughage ingredient, and a mixed package', async () => {
        const concentrateRes = await request(app)
            .post('/api/feed/items')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ name: 'Test Maize Grain', quantityKg: 1000, costPerKg: 50 });
        expect(concentrateRes.status).toBe(201);
        concentrateId = concentrateRes.body.id;

        const roughageRes = await request(app)
            .post('/api/feed/items')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ name: 'Test Wheat Straw', quantityKg: 1000, costPerKg: 10 });
        expect(roughageRes.status).toBe(201);
        roughageId = roughageRes.body.id;

        const packageRes = await request(app)
            .post('/api/feed/packages')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                name: 'Test Mixed Ration',
                description: 'Concentrate + roughage',
                dailyIntakePercent: 2.5,
                items: [
                    { feedItemId: concentrateId, ratioPercent: 100, type: 'CONCENTRATE' },
                    { feedItemId: roughageId, type: 'ROUGHAGE', manualKgPerFeeding: 4, manualFeedings: 2, dryMatter: 90 }
                ]
            });
        expect(packageRes.status).toBe(201);
        packageId = packageRes.body.id;
    });

    it('creates an active animal on that package', async () => {
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                tagNumber: 'FEED-TEST-001',
                type: 'Cow',
                breed: 'Sahiwal',
                gender: 'Female',
                status: 'Active',
                currentWeight: 400,
                entryWeight: 400,
                monthlyPackageId: packageId
            });
        expect(res.status).toBe(201);
        animalId = res.body.id;
    });

    it('deducts both the ratio-based concentrate AND the fixed roughage from stock on process-daily', async () => {
        const res = await request(app)
            .post('/api/feed/process-daily')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({});
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        // Concentrate: 400kg animal * 2.5% intake = 10kg, 100% ratio -> all 10kg from concentrate
        // Roughage: 4kg/feeding * 2 feedings = 8kg, fixed regardless of weight/intake%
        const concentrateBreakdown = res.body.summary.feedBreakdown.find(f => f.feedName === 'Test Maize Grain');
        const roughageBreakdown = res.body.summary.feedBreakdown.find(f => f.feedName === 'Test Wheat Straw');

        expect(concentrateBreakdown).toBeTruthy();
        expect(concentrateBreakdown.consumedKg).toBeCloseTo(10, 1);

        expect(roughageBreakdown).toBeTruthy();
        expect(roughageBreakdown.consumedKg).toBeCloseTo(8, 1);

        const itemsRes = await request(app)
            .get('/api/feed/items')
            .set('Authorization', `Bearer ${tenant.token}`);
        const concentrateItem = itemsRes.body.find(f => f.id === concentrateId);
        const roughageItem = itemsRes.body.find(f => f.id === roughageId);

        expect(concentrateItem.quantityKg).toBeCloseTo(990, 1);
        expect(roughageItem.quantityKg).toBeCloseTo(992, 1);
    });

    afterAll(async () => {
        await db.query('DELETE FROM feed_usage_log WHERE tenant_id = $1', [tenant.tenantId]);
        if (animalId) await db.query('DELETE FROM cattle WHERE id = $1', [animalId]);
        if (packageId) await db.query('DELETE FROM feed_packages WHERE id = $1', [packageId]);
        if (concentrateId) await db.query('DELETE FROM feed_items WHERE id = $1', [concentrateId]);
        if (roughageId) await db.query('DELETE FROM feed_items WHERE id = $1', [roughageId]);
    });
});

describe('Feed item price history is actually persisted', () => {
    let itemId;

    afterAll(async () => {
        if (itemId) await db.query('DELETE FROM feed_items WHERE id = $1', [itemId]);
    });

    it('saves priceHistory sent on create, and round-trips it back on GET', async () => {
        const createRes = await request(app)
            .post('/api/feed/items')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                name: 'Test Price History Item',
                quantityKg: 100,
                costPerKg: 40,
                priceHistory: [{ date: '2026-01-01', price: 40 }]
            });
        expect(createRes.status).toBe(201);
        itemId = createRes.body.id;
        expect(createRes.body.priceHistory).toEqual([{ date: '2026-01-01', price: 40 }]);

        const getRes = await request(app)
            .get('/api/feed/items')
            .set('Authorization', `Bearer ${tenant.token}`);
        const item = getRes.body.find(f => f.id === itemId);
        expect(item.priceHistory).toEqual([{ date: '2026-01-01', price: 40 }]);
    });

    it('appends to priceHistory on update rather than discarding it', async () => {
        const updateRes = await request(app)
            .put(`/api/feed/items/${itemId}`)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                name: 'Test Price History Item',
                quantityKg: 100,
                costPerKg: 55,
                priceHistory: [
                    { date: '2026-01-01', price: 40 },
                    { date: '2026-02-01', price: 55 }
                ]
            });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.priceHistory).toEqual([
            { date: '2026-01-01', price: 40 },
            { date: '2026-02-01', price: 55 }
        ]);
    });
});
