// @vitest-environment node
//
// Regression suite for the calving create/delete cascade documented in design.md:
// creating a CALVING event must close the current lactation, open a new one, and
// register a calf; deleting that event must undo all of it and restore the prior state.

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import db from '../db.js';

let tenant;
let cowId;
let cowTag;

async function registerTenant() {
    const res = await request(app)
        .post('/api/auth/register')
        .send({
            name: 'Breeding Cascade Test',
            email: `breeding-cascade-test-${Date.now()}@example.com`,
            password: 'testpass123',
            farmName: 'Breeding Cascade Test Farm'
        });
    expect(res.status).toBe(201);
    return { token: res.body.token, userId: res.body.user.id, tenantId: res.body.tenant.id };
}

beforeAll(async () => {
    tenant = await registerTenant();

    const cowRes = await request(app)
        .post('/api/cattle')
        .set('Authorization', `Bearer ${tenant.token}`)
        .send({ tagNumber: 'COW-CASCADE-001', type: 'Cow', gender: 'Female', breed: 'Sahiwal' });
    expect(cowRes.status).toBe(201);
    cowId = cowRes.body.id;
    cowTag = cowRes.body.tagNumber;

    // Simulate an existing prior lactation, as a real milking cow would have, so the
    // "close old lactation, open new one" step in the calving flow has something to act on.
    await db.query(
        `INSERT INTO lactations (tenant_id, animal_id, lactation_number, start_date, status)
         VALUES ($1, $2, 1, '2025-01-01', 'ACTIVE')`,
        [tenant.tenantId, cowId]
    );
});

afterAll(async () => {
    await db.query('DELETE FROM lactations WHERE animal_id = $1', [cowId]);
    await db.query('DELETE FROM breeding_events WHERE animal_id = $1', [cowId]);
    await db.query('DELETE FROM pregnancy_cycles WHERE animal_id = $1', [cowId]);
    await db.query('DELETE FROM cattle WHERE id = $1', [cowId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [tenant.userId]);
    await db.query('DELETE FROM users WHERE id = $1', [tenant.userId]);
    await db.query('DELETE FROM tenants WHERE id = $1', [tenant.tenantId]);
    await db.pool.end();
});

describe('Calving creation cascade', () => {
    let calvingEventId;
    const calvingDate = '2026-06-01';
    const calfTag = 'CALF-CASCADE-001';

    it('records the event, closes the old lactation, opens lactation #2, and registers the calf', async () => {
        const res = await request(app)
            .post('/api/breeding/events')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                animalId: cowId,
                eventType: 'CALVING',
                eventDate: calvingDate,
                calfDetails: { tagNumber: calfTag, name: 'Test Calf', gender: 'FEMALE', breed: 'Sahiwal', weight: 25 }
            });

        expect(res.status).toBe(201);
        calvingEventId = res.body.id;

        // Old lactation (#1) should now be ended, specifically because of this calving
        const oldLactation = await db.query(
            "SELECT status, end_reason FROM lactations WHERE tenant_id = $1 AND animal_id = $2 AND lactation_number = 1",
            [tenant.tenantId, cowId]
        );
        expect(oldLactation.rows[0].status).toBe('ENDED');
        expect(oldLactation.rows[0].end_reason).toBe('CALVING / NEW CYCLE');

        // A new lactation (#2) should be active, starting on the calving date
        const newLactation = await db.query(
            "SELECT status, lactation_number FROM lactations WHERE tenant_id = $1 AND animal_id = $2 AND start_date = $3",
            [tenant.tenantId, cowId, calvingDate]
        );
        expect(newLactation.rows.length).toBe(1);
        expect(newLactation.rows[0].status).toBe('ACTIVE');
        expect(newLactation.rows[0].lactation_number).toBe(2);

        // The pregnancy cycle should be auto-created and marked CALVED
        const cycle = await db.query(
            "SELECT status, actual_calving_date FROM pregnancy_cycles WHERE tenant_id = $1 AND animal_id = $2",
            [tenant.tenantId, cowId]
        );
        expect(cycle.rows.length).toBe(1);
        expect(cycle.rows[0].status).toBe('CALVED');

        // A new calf cattle record should exist, linked back to the mother's tag
        const calf = await db.query(
            "SELECT tag_number, mother_tag, arrival_type, gender FROM cattle WHERE tenant_id = $1 AND tag_number = $2",
            [tenant.tenantId, calfTag]
        );
        expect(calf.rows.length).toBe(1);
        expect(calf.rows[0].mother_tag).toBe(cowTag);
        expect(calf.rows[0].arrival_type).toBe('BORN');
        expect(calf.rows[0].gender).toBe('FEMALE');
    });

    it('rejects recording the identical calving event twice (idempotency check)', async () => {
        const res = await request(app)
            .post('/api/breeding/events')
            .set('Authorization', `Bearer ${tenant.token}`)
            .send({
                animalId: cowId,
                eventType: 'CALVING',
                eventDate: calvingDate,
                calfDetails: { tagNumber: calfTag }
            });

        expect(res.status).toBe(409);
    });

    it('deleting the calving event undoes everything: removes the calf, deletes lactation #2, and restores lactation #1 to active', async () => {
        const res = await request(app)
            .delete(`/api/breeding/events/${calvingEventId}`)
            .set('Authorization', `Bearer ${tenant.token}`);

        expect(res.status).toBe(200);

        // The calf record should be gone entirely
        const calf = await db.query('SELECT id FROM cattle WHERE tenant_id = $1 AND tag_number = $2', [tenant.tenantId, calfTag]);
        expect(calf.rows.length).toBe(0);

        // Lactation #2 (created for this calving) should be gone
        const lactation2 = await db.query(
            "SELECT id FROM lactations WHERE tenant_id = $1 AND animal_id = $2 AND lactation_number = 2",
            [tenant.tenantId, cowId]
        );
        expect(lactation2.rows.length).toBe(0);

        // Lactation #1 should be restored to ACTIVE, as if the calving never happened
        const lactation1 = await db.query(
            "SELECT status, end_date, end_reason FROM lactations WHERE tenant_id = $1 AND animal_id = $2 AND lactation_number = 1",
            [tenant.tenantId, cowId]
        );
        expect(lactation1.rows[0].status).toBe('ACTIVE');
        expect(lactation1.rows[0].end_date).toBeNull();
        expect(lactation1.rows[0].end_reason).toBeNull();

        // With no events left in the cycle, it should be deleted entirely (not just reset to OPEN)
        const cycle = await db.query('SELECT id FROM pregnancy_cycles WHERE tenant_id = $1 AND animal_id = $2', [tenant.tenantId, cowId]);
        expect(cycle.rows.length).toBe(0);

        // And the event itself is gone
        const event = await db.query('SELECT id FROM breeding_events WHERE id = $1', [calvingEventId]);
        expect(event.rows.length).toBe(0);
    });
});
