// @vitest-environment node
//
// Global sequential animal tagging (PREFIX+4-digit, one running counter per farm
// across every species/type, never reset). New tenants default to this scheme;
// existing tenants keep their old client-controlled tagging (legacy_tag_scheme=true,
// covered by the other suites' own fixtures, not here).

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant;

async function registerTenant() {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: 'Tag Generation Test',
            email: `tag-generation-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: 'Tag Generation Test Farm'
        });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();
});

afterAll(async () => {
    await db.query('DELETE FROM cattle WHERE tenant_id = $1', [tenant.tenantId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('New tenants default to the new global-sequence tag scheme', () => {
    it('a freshly registered tenant has legacy_tag_scheme = false', async () => {
        const res = await db.query('SELECT legacy_tag_scheme, next_animal_seq FROM tenants WHERE id = $1', [tenant.tenantId]);
        expect(res.rows[0].legacy_tag_scheme).toBe(false);
        expect(res.rows[0].next_animal_seq).toBe(1);
    });
});

describe('Server ignores client-supplied tag and assigns PREFIX+4-digit atomically', () => {
    const create = (type, tagNumber) => request(app)
        .post('/api/cattle')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({ tagNumber, type, gender: 'Male', breed: 'Sahiwal', currentWeight: 100, entryWeight: 100 });

    it('never uses the client-supplied tagNumber, regardless of what is sent', async () => {
        const res = await create('Bull', 'WHATEVER-I-TYPE');
        expect(res.status).toBe(201);
        expect(res.body.tagNumber).not.toBe('WHATEVER-I-TYPE');
    });

    it('the sequence is global across every type, not per-type', async () => {
        // Sequence is already at 2 after the Bull above. Mix species/types deliberately.
        const cow = await create('Cow', 'x');
        const buck = await create('Buck', 'x');
        const ram = await create('Ram', 'x');
        const femaleCalf = await create('Female Calf', 'x');
        const heifer = await create('Heifer', 'x');

        expect(cow.body.tagNumber).toBe('C0002');
        expect(buck.body.tagNumber).toBe('BK0003');
        expect(ram.body.tagNumber).toBe('R0004');
        expect(femaleCalf.body.tagNumber).toBe('CF0005');
        expect(heifer.body.tagNumber).toBe('HF0006');
    });

    it('zero-pads to 4 digits and uses the exact prefix per type', async () => {
        const cases = [
            ['Doe', 'D'], ['Male Kid', 'KM'], ['Female Kid', 'KF'], ['Ewe', 'E'], ['Male Lamb', 'LM'], ['Female Lamb', 'LF']
        ];
        for (const [type, prefix] of cases) {
            const res = await create(type, 'x');
            expect(res.status).toBe(201);
            expect(res.body.tagNumber).toMatch(new RegExp(`^${prefix}\\d{4}$`));
        }
    });

    it('never produces a duplicate tag across many rapid registrations', async () => {
        const results = await Promise.all(
            Array.from({ length: 5 }, () => create('Bull', 'x'))
        );
        const tags = results.map(r => r.body.tagNumber);
        expect(new Set(tags).size).toBe(tags.length);
    });
});

describe('respectProvidedTag lets bulk CSV import keep its own tags', () => {
    it('uses the client-supplied tag as-is when respectProvidedTag is set, unlike the interactive form', async () => {
        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ tagNumber: 'MY-OWN-EAR-TAG-001', type: 'Bull', gender: 'Male', breed: 'Sahiwal', currentWeight: 100, entryWeight: 100, respectProvidedTag: true });
        expect(res.status).toBe(201);
        expect(res.body.tagNumber).toBe('MY-OWN-EAR-TAG-001');
    });

    it('leaves the counter alone when the respected tag has no trailing number', async () => {
        const before = await db.query('SELECT next_animal_seq FROM tenants WHERE id = $1', [tenant.tenantId]);
        await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ tagNumber: 'MY-OWN-EAR-TAG-NO-NUMBER', type: 'Bull', gender: 'Male', breed: 'Sahiwal', currentWeight: 100, entryWeight: 100, respectProvidedTag: true });
        const after = await db.query('SELECT next_animal_seq FROM tenants WHERE id = $1', [tenant.tenantId]);
        expect(after.rows[0].next_animal_seq).toBe(before.rows[0].next_animal_seq);
    });

    it('advances the counter past a respected tag\'s number, so the next auto-generated tag continues the single sequence rather than colliding with the imported range', async () => {
        // Fresh tenant so this isn't order-dependent on prior tests' effect on the shared one.
        const freshTenant = await registerTenant();
        try {
            for (const tag of ['B0001', 'C0037', 'KF0072']) {
                const res = await request(app)
                    .post('/api/cattle')
                    .set('Authorization', `Bearer ${freshTenant.token}`)
                    .send({ tagNumber: tag, type: 'Bull', gender: 'Male', breed: 'Sahiwal', currentWeight: 100, entryWeight: 100, respectProvidedTag: true });
                expect(res.body.tagNumber).toBe(tag);
            }

            const nextTag = await request(app)
                .post('/api/cattle')
                .set('Authorization', `Bearer ${freshTenant.token}`)
                .send({ tagNumber: 'ignored', type: 'Bull', gender: 'Male', breed: 'Sahiwal', currentWeight: 100, entryWeight: 100 });
            expect(nextTag.body.tagNumber).toBe('B0073');
        } finally {
            await db.query('DELETE FROM cattle WHERE tenant_id = $1', [freshTenant.tenantId]);
            await db.query('DELETE FROM sessions WHERE user_id = $1', [freshTenant.userId]);
            await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [freshTenant.userId]);
            await db.query('DELETE FROM users WHERE id = $1', [freshTenant.userId]);
            await db.query('DELETE FROM tenants WHERE id = $1', [freshTenant.tenantId]);
        }
    });
});

describe('GET /api/cattle/next-tag previews without consuming the sequence', () => {
    it('returns the same preview twice if nothing is registered in between', async () => {
        const first = await request(app)
            .get('/api/cattle/next-tag?type=Bull')
            .set('Authorization', `Bearer ${tenant.token}`);
        const second = await request(app)
            .get('/api/cattle/next-tag?type=Bull')
            .set('Authorization', `Bearer ${tenant.token}`);

        expect(first.status).toBe(200);
        expect(first.body.legacyTagScheme).toBe(false);
        expect(first.body.preview).toBe(second.body.preview);
    });

    it('the preview matches what registration actually assigns next', async () => {
        const preview = await request(app)
            .get('/api/cattle/next-tag?type=Cow')
            .set('Authorization', `Bearer ${tenant.token}`);

        const created = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({ tagNumber: 'x', type: 'Cow', gender: 'Female', breed: 'Sahiwal', currentWeight: 100, entryWeight: 100 });

        expect(created.body.tagNumber).toBe(preview.body.preview);
    });
});

describe('Legacy-scheme tenants are unaffected', () => {
    let legacyTenant;

    it('a tenant explicitly flagged legacy keeps client-controlled tags', async () => {
        legacyTenant = await registerTenant();
        await db.query('UPDATE tenants SET legacy_tag_scheme = true WHERE id = $1', [legacyTenant.tenantId]);

        const res = await request(app)
            .post('/api/cattle')
            .set('Authorization', `Bearer ${legacyTenant.token}`)
            .send({ tagNumber: 'LEGACY-CUSTOM-001', type: 'Bull', gender: 'Male', breed: 'Sahiwal', currentWeight: 100, entryWeight: 100 });

        expect(res.status).toBe(201);
        expect(res.body.tagNumber).toBe('LEGACY-CUSTOM-001');

        const previewRes = await request(app)
            .get('/api/cattle/next-tag?type=Bull')
            .set('Authorization', `Bearer ${legacyTenant.token}`);
        expect(previewRes.body.legacyTagScheme).toBe(true);
    });

    afterAll(async () => {
        if (legacyTenant) {
            await db.query('DELETE FROM cattle WHERE tenant_id = $1', [legacyTenant.tenantId]);
            await db.query('DELETE FROM sessions WHERE user_id = $1', [legacyTenant.userId]);
            await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [legacyTenant.userId]);
            await db.query('DELETE FROM users WHERE id = $1', [legacyTenant.userId]);
            await db.query('DELETE FROM tenants WHERE id = $1', [legacyTenant.tenantId]);
        }
    });
});
