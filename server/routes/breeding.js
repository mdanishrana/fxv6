
const express = require('express');
const router = express.Router();
const db = require('../db');

const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use((req, res, next) => {
    req.tenantId = req.user.tenantId;
    next();
});

// Middleware to restrict non-GET methods to farm admins
router.use((req, res, next) => {
    if (req.method !== 'GET') {
        if (!req.user || (req.user.role !== 'OWNER' && req.user.role !== 'MANAGER' && req.user.role !== 'SAAS_ADMIN')) {
            return res.status(403).json({ error: 'Permission denied: Only farm admins can modify breeding records' });
        }
    }
    next();
});

// GET /api/breeding/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // Basic stats
        // 1. Total Pregnant
        const pregnantRes = await db.query(`
            SELECT COUNT(*) as count FROM pregnancy_cycles 
            WHERE tenant_id = $1 AND status = 'CONFIRMED_PREGNANT'
        `, [req.tenantId]);
        const pregnantCount = parseInt(pregnantRes.rows[0].count);

        // 2. Recent Calvings
        const calvedRes = await db.query(`
            SELECT COUNT(*) as count FROM pregnancy_cycles 
            WHERE tenant_id = $1 AND status = 'CALVED'
        `, [req.tenantId]);
        const calvedCount = parseInt(calvedRes.rows[0].count);
        console.log(`[Dashboard Debug] Pregnant: ${pregnantCount}, Calved: ${calvedCount}, Tenant: ${req.tenantId}`);

        // 3. Open Cows (All Active Females - Pregnant)
        const femalesRes = await db.query(`
            SELECT COUNT(*) as count FROM cattle 
            WHERE tenant_id = $1 
            AND status = 'ACTIVE'
            AND (UPPER(gender) IN ('FEMALE', 'COW', 'HEIFER', 'F') OR UPPER(type) IN ('COW', 'HEIFER'))
        `, [req.tenantId]);
        const totalFemales = parseInt(femalesRes.rows[0].count);
        const openCount = Math.max(0, totalFemales - pregnantCount);
        console.log(`[Dashboard Debug] Females: ${totalFemales}, Open: ${openCount}`);

        const stats = {
            open_cycles: openCount,
            pregnant_cows: pregnantCount,
            recent_calvings: calvedCount
        };

        // Upcoming calvings (next 30 days)
        const upcoming = await db.query(`
      SELECT pc.*, c.tag_number, c.breed
      FROM pregnancy_cycles pc
      JOIN cattle c ON pc.animal_id = c.id
      WHERE pc.tenant_id = $1 
        AND pc.status = 'CONFIRMED_PREGNANT'
        AND pc.expected_calving_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
      ORDER BY pc.expected_calving_date ASC
      LIMIT 5
    `, [req.tenantId]);

        res.json({
            stats: stats,
            upcomingCalvings: upcoming.rows
        });
    } catch (err) {
        console.error('Breeding Dashboard Error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// GET /api/breeding/events
router.get('/events', async (req, res) => {
    try {
        const { animalId, type, limit = 50 } = req.query;
        let query = `
            SELECT be.*, c.tag_number 
            FROM breeding_events be
            JOIN cattle c ON be.animal_id = c.id
            WHERE be.tenant_id = $1
        `;
        const params = [req.tenantId];
        let paramIdx = 2;

        if (animalId) {
            query += ` AND be.animal_id = $${paramIdx}`;
            params.push(animalId);
            paramIdx++;
        }
        if (type) {
            query += ` AND be.event_type = $${paramIdx}`;
            params.push(type);
            paramIdx++;
        }

        query += ` ORDER BY be.event_date DESC LIMIT $${paramIdx}`;
        params.push(limit);

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/breeding/events
router.post('/events', async (req, res) => {
    const { animalId, eventType, eventDate, details, cycleId } = req.body;

    if (!animalId || !eventType || !eventDate) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Check for duplicate event (Idempotency)
        const duplicateCheck = await client.query(`
            SELECT id FROM breeding_events 
            WHERE tenant_id = $1 AND animal_id = $2 AND event_type = $3 AND event_date = $4
        `, [req.tenantId, animalId, eventType, eventDate]);

        if (duplicateCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'This event is already recorded for this date.' });
        }

        // Pregnancy Lock Check (Source of Truth = Events)
        if (['SERVICE_AI', 'SERVICE_NATURAL', 'EMBRYO_TRANSFER'].includes(eventType)) {
            // Check strictly: Postive PREG_CHECK that hasn't been followed by CALVING or ABORTION
            const lastStatusEvent = await client.query(`
                SELECT event_type, details->>'result' as result, event_date 
                FROM breeding_events 
                WHERE tenant_id = $1 AND animal_id = $2 
                AND event_type IN ('PREG_CHECK', 'CALVING', 'ABORTION')
                ORDER BY event_date DESC, created_at DESC LIMIT 1
            `, [req.tenantId, animalId]);

            if (lastStatusEvent.rows.length > 0) {
                const last = lastStatusEvent.rows[0];
                const isPregnant = (last.event_type === 'PREG_CHECK' && last.result === 'POSITIVE');

                if (isPregnant) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Cannot record service: Cow is currently Pregnant (based on last Preg Check).' });
                }
            }
        }

        // 0. Resolve Cycle ID if missing (for updates OR new services)
        let resolvedCycleId = cycleId || null;
        let existingCycleStatus = null;

        if (!resolvedCycleId && (eventType === 'PREG_CHECK' || eventType === 'CALVING' || eventType.startsWith('SERVICE'))) {
            const activeCycle = await client.query(`
                SELECT id, status FROM pregnancy_cycles 
                WHERE tenant_id = $1 AND animal_id = $2 AND status IN ('OPEN', 'CONFIRMED_PREGNANT')
                ORDER BY cycle_start_date DESC LIMIT 1
            `, [req.tenantId, animalId]);

            if (activeCycle.rows.length > 0) {
                resolvedCycleId = activeCycle.rows[0].id;
                existingCycleStatus = activeCycle.rows[0].status;
            }
        }

        // 1. Create Event
        let finalDetails = details || {};
        if (eventType === 'CALVING' && req.body.calfDetails) {
            finalDetails = {
                ...finalDetails,
                calfDetails: req.body.calfDetails
            };
        }

        const eventResult = await client.query(`
            INSERT INTO breeding_events (tenant_id, animal_id, cycle_id, event_type, event_date, details)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [req.tenantId, animalId, resolvedCycleId, eventType, eventDate, finalDetails]);

        const newEvent = eventResult.rows[0];

        // 2. Automate Cycle Logic
        if (eventType === 'SERVICE_AI' || eventType === 'SERVICE_NATURAL') {
            if (existingCycleStatus === 'CONFIRMED_PREGNANT') {
                throw new Error("Cannot record service: Animal is already Confirmed Pregnant.");
            }

            if (!resolvedCycleId) {
                // Start new cycle ONLY if no OPEN cycle exists
                const cycleRes = await client.query(`
                    INSERT INTO pregnancy_cycles (tenant_id, animal_id, cycle_start_date, status)
                    VALUES ($1, $2, $3, 'OPEN')
                    RETURNING id
                `, [req.tenantId, animalId, eventDate]);

                // Link event to new cycle
                await client.query('UPDATE breeding_events SET cycle_id = $1 WHERE id = $2', [cycleRes.rows[0].id, newEvent.id]);
            }
            // If resolvedCycleId exists (OPEN), the event is already linked via INSERT above.
        }
        else if (eventType === 'PREG_CHECK') {
            const newStatus = details.result === 'POSITIVE' ? 'CONFIRMED_PREGNANT' : 'OPEN';

            if (resolvedCycleId) {
                let updateQuery = `UPDATE pregnancy_cycles SET status = $1, updated_at = NOW()`;
                const updateParams = [newStatus, resolvedCycleId];

                if (newStatus === 'CONFIRMED_PREGNANT') {
                    // Update expected calving if cycle start exists
                    const cycleRes = await client.query('SELECT cycle_start_date FROM pregnancy_cycles WHERE id = $1', [resolvedCycleId]);
                    if (cycleRes.rows.length > 0) {
                        const start = new Date(cycleRes.rows[0].cycle_start_date);
                        const expected = new Date(start);
                        expected.setDate(start.getDate() + 283);
                        updateQuery += `, expected_calving_date = $3`;
                        updateParams.push(expected);
                    }
                }
                updateQuery += ` WHERE id = $2`;
                await client.query(updateQuery, updateParams);

            } else if (newStatus === 'CONFIRMED_PREGNANT') {
                // Auto-create cycle for stats if missing
                const checkDate = new Date(eventDate);
                // Estimate start 60 days ago (arbitrary estimation for orphan record)
                const startDate = new Date(checkDate);
                startDate.setDate(checkDate.getDate() - 60);

                // Calculate expected calving (Start + 283)
                const expected = new Date(startDate);
                expected.setDate(startDate.getDate() + 283);

                await client.query(`
                    INSERT INTO pregnancy_cycles (tenant_id, animal_id, cycle_start_date, status, expected_calving_date)
                    VALUES ($1, $2, $3, 'CONFIRMED_PREGNANT', $4)
                 `, [req.tenantId, animalId, startDate, expected]);
            }
        }
        else if (eventType === 'CALVING') {
            if (resolvedCycleId) {
                await client.query(`
                    UPDATE pregnancy_cycles 
                    SET status = 'CALVED', actual_calving_date = $1, updated_at = NOW() 
                    WHERE id = $2
                `, [eventDate, resolvedCycleId]);
            } else {
                // Auto-create cycle for stats if missing (e.g. initial data entry)
                const cDate = new Date(eventDate);
                const startDate = new Date(cDate);
                startDate.setDate(cDate.getDate() - 280); // Approx gestation

                const cycleRes = await client.query(`
                    INSERT INTO pregnancy_cycles (tenant_id, animal_id, cycle_start_date, status, actual_calving_date, expected_calving_date)
                    VALUES ($1, $2, $3, 'CALVED', $4, $4)
                    RETURNING id
                `, [req.tenantId, animalId, startDate, eventDate]);
                
                resolvedCycleId = cycleRes.rows[0].id;
                await client.query('UPDATE breeding_events SET cycle_id = $1 WHERE id = $2', [resolvedCycleId, newEvent.id]);
            }

            await client.query(`
                UPDATE lactations 
                SET status = 'ENDED', end_date = $1, end_reason = 'CALVING / NEW CYCLE'
                WHERE tenant_id = $2 AND animal_id = $3 AND status = 'ACTIVE'
            `, [eventDate, req.tenantId, animalId]);

            const lastLactation = await client.query(`
                SELECT lactation_number FROM lactations 
                WHERE tenant_id = $1 AND animal_id = $2 ORDER BY lactation_number DESC LIMIT 1
            `, [req.tenantId, animalId]);

            const nextLactationNum = (lastLactation.rows[0]?.lactation_number || 0) + 1;
            const calvingDate = new Date(eventDate);
            const vwpDate = new Date(calvingDate);
            vwpDate.setDate(calvingDate.getDate() + 60); // VWP 60 days

            await client.query(`
                INSERT INTO lactations (
                    tenant_id, animal_id, lactation_number, start_date, expected_breeding_date, status
                ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
            `, [req.tenantId, animalId, nextLactationNum, eventDate, vwpDate]);            // 3. Register New Calf
            const calfs = req.body.calfDetails;
            if (calfs) {
                let newTag = calfs.tagNumber;

                // Auto-generate Tag if missing
                if (!newTag) {
                    const maxTagRes = await client.query(`
                        SELECT tag_number FROM cattle 
                        WHERE tenant_id = $1 AND tag_number LIKE 'CA-%' 
                        ORDER BY created_at DESC LIMIT 1
                    `, [req.tenantId]);

                    let nextNum = 1000;
                    if (maxTagRes.rows.length > 0) {
                        const lastTag = maxTagRes.rows[0].tag_number;
                        const match = lastTag.match(/CA-(\d+)/);
                        if (match) {
                            nextNum = parseInt(match[1]) + 1;
                        }
                    }
                    newTag = `CA - ${nextNum} `;
                }

                const calfType = calfs.gender === 'MALE' ? 'BULL' : 'HEIFER';

                await client.query(`
                    INSERT INTO cattle(
                        tenant_id, tag_number, name, type, breed, gender,
                        status, arrival_type, entry_date, entry_weight, current_weight, mother_tag, father_tag
                    ) VALUES($1, $2, $3, $4, $5, $6, 'ACTIVE', 'BORN', $7, $8, $8, (SELECT tag_number FROM cattle WHERE id = $9), $10)
                 `, [
                    req.tenantId,
                    newTag,
                    calfs.name || `Calf of ${animalId} `,
                    calfType,
                    calfs.breed,
                    calfs.gender,
                    // entry_date
                    eventDate,
                    // weights
                    calfs.weight || null,
                    animalId,
                    calfs.sireCode || null
                ]);
            }
        }
        else if (eventType === 'LACTATION_START') {
            // End any previously active lactation just in case
            await client.query(`
                UPDATE lactations 
                SET status = 'ENDED', end_date = $1, end_reason = 'MANUAL RESTART'
                WHERE tenant_id = $2 AND animal_id = $3 AND status = 'ACTIVE'
    `, [eventDate, req.tenantId, animalId]);

            const lastLactation = await client.query(`
                SELECT lactation_number FROM lactations 
                WHERE tenant_id = $1 AND animal_id = $2 ORDER BY lactation_number DESC LIMIT 1
    `, [req.tenantId, animalId]);

            const nextLactationNum = (lastLactation.rows[0]?.lactation_number || 0) + 1;
            const startDate = new Date(eventDate);
            const vwpDate = new Date(startDate);
            vwpDate.setDate(startDate.getDate() + 60);

            await client.query(`
                INSERT INTO lactations(
        tenant_id, animal_id, lactation_number, start_date, expected_breeding_date, status
    ) VALUES($1, $2, $3, $4, $5, 'ACTIVE')
        `, [req.tenantId, animalId, nextLactationNum, eventDate, vwpDate]);
        }
        else if (eventType === 'DRY_OFF') {
            await client.query(`
                UPDATE lactations 
                SET status = 'ENDED', end_date = $1, end_reason = 'MANUAL DRY OFF'
                WHERE tenant_id = $2 AND animal_id = $3 AND status = 'ACTIVE'
    `, [eventDate, req.tenantId, animalId]);
        }

        // 4. Update Genetics Inventory (Semen / Embryo Bank integration)
        if (eventType === 'SERVICE_AI' && details && details.bullId) {
            await client.query(`
                UPDATE semen_bank 
                SET status = 'DEPLETED', updated_at = NOW()
                WHERE code = $1 AND tenant_id = $2 AND status = 'AVAILABLE'
            `, [details.bullId, req.tenantId]);
        } else if (eventType === 'EMBRYO_TRANSFER' && details && details.bullId) {
            await client.query(`
                UPDATE embryo_bank 
                SET status = 'TRANSFERRED', updated_at = NOW()
                WHERE code = $1 AND tenant_id = $2 AND status = 'AVAILABLE'
            `, [details.bullId, req.tenantId]);
        }

        await client.query('COMMIT');
        res.status(201).json(newEvent);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Breeding Event Error:', err);
        res.status(500).json({ error: err.message || 'Failed to record event' });
    } finally {
        client.release();
    }
});

// GET /api/breeding/timeline/:animalId
router.get('/timeline/:animalId', async (req, res) => {
    try {
        const { animalId } = req.params;
        const cycles = await db.query(`
SELECT * FROM pregnancy_cycles 
            WHERE tenant_id = $1 AND animal_id = $2 
            ORDER BY cycle_start_date DESC
    `, [req.tenantId, animalId]);

        const events = await db.query(`
SELECT * FROM breeding_events 
            WHERE tenant_id = $1 AND animal_id = $2 
            ORDER BY event_date DESC
    `, [req.tenantId, animalId]);

        res.json({
            cycles: cycles.rows,
            events: events.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch timeline' });
    }
});

// GET /api/breeding/timeline/:animalId
router.get('/timeline/:animalId', async (req, res) => {
    try {
        const { animalId } = req.params;

        const cycles = await db.query(`
SELECT * FROM pregnancy_cycles 
            WHERE tenant_id = $1 AND animal_id = $2 
            ORDER BY cycle_start_date DESC
    `, [req.tenantId, animalId]);

        const events = await db.query(`
SELECT * FROM breeding_events 
            WHERE tenant_id = $1 AND animal_id = $2 
            ORDER BY event_date DESC
    `, [req.tenantId, animalId]);

        res.json({
            cycles: cycles.rows,
            events: events.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch timeline' });
    }
});

// PUT /api/breeding/events/:id
router.put('/events/:id', async (req, res) => {
    const { id } = req.params;
    const { eventDate, details } = req.body;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch existing event
        const oldEventRes = await client.query(
            'SELECT animal_id, event_type, event_date, details FROM breeding_events WHERE id = $1 AND tenant_id = $2',
            [id, req.tenantId]
        );

        if (oldEventRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Event not found' });
        }

        const oldEvent = oldEventRes.rows[0];
        const oldDetails = oldEvent.details || {};
        const newDetails = details || {};

        let finalNewDetails = newDetails;
        if (oldEvent.event_type === 'CALVING' && req.body.calfDetails) {
            finalNewDetails = {
                ...finalNewDetails,
                calfDetails: req.body.calfDetails
            };
        }

        if (oldEvent.event_type === 'CALVING') {
            const oldCalfTag = oldDetails.calfDetails?.tagNumber;
            const newCalfDetails = req.body.calfDetails || newDetails.calfDetails;

            let calfId = null;
            if (oldCalfTag) {
                const calfRes = await client.query(
                    'SELECT id FROM cattle WHERE tag_number = $1 AND tenant_id = $2',
                    [oldCalfTag, req.tenantId]
                );
                if (calfRes.rows.length > 0) {
                    calfId = calfRes.rows[0].id;
                }
            }

            if (!calfId) {
                const motherTagRes = await client.query('SELECT tag_number FROM cattle WHERE id = $1', [oldEvent.animal_id]);
                if (motherTagRes.rows.length > 0) {
                    const motherTag = motherTagRes.rows[0].tag_number;
                    const calfRes = await client.query(
                        "SELECT id FROM cattle WHERE mother_tag = $1 AND entry_date = $2 AND arrival_type = 'BORN' AND tenant_id = $3",
                        [motherTag, oldEvent.event_date, req.tenantId]
                    );
                    if (calfRes.rows.length > 0) {
                        calfId = calfRes.rows[0].id;
                    }
                }
            }

            if (calfId && newCalfDetails) {
                const newCalfTag = newCalfDetails.tagNumber || oldCalfTag;
                const calfType = newCalfDetails.gender === 'MALE' ? 'BULL' : 'HEIFER';
                
                await client.query(`
                    UPDATE cattle 
                    SET tag_number = $1, name = $2, type = $3, breed = $4, gender = $5, entry_date = $6, entry_weight = $7, current_weight = $7
                    WHERE id = $8 AND tenant_id = $9
                `, [
                    newCalfTag,
                    newCalfDetails.name || `Calf of ${oldEvent.animal_id}`,
                    calfType,
                    newCalfDetails.breed,
                    newCalfDetails.gender,
                    eventDate,
                    newCalfDetails.weight || null,
                    calfId,
                    req.tenantId
                ]);
            }

            // Update lactation start date and VWP
            const vwpDate = new Date(eventDate);
            vwpDate.setDate(vwpDate.getDate() + 60);

            await client.query(`
                UPDATE lactations 
                SET start_date = $1, expected_breeding_date = $2
                WHERE tenant_id = $3 AND animal_id = $4 AND start_date = $5
            `, [eventDate, vwpDate, req.tenantId, oldEvent.animal_id, oldEvent.event_date]);
        }

        // If the code has changed
        if (oldDetails.bullId !== newDetails.bullId) {
            if (oldEvent.event_type === 'SERVICE_AI') {
                // Restore old code to AVAILABLE
                if (oldDetails.bullId) {
                    await client.query(
                        "UPDATE semen_bank SET status = 'AVAILABLE', updated_at = NOW() WHERE code = $1 AND tenant_id = $2 AND status = 'DEPLETED'",
                        [oldDetails.bullId, req.tenantId]
                    );
                }
                // Deplete new code
                if (newDetails.bullId) {
                    await client.query(
                        "UPDATE semen_bank SET status = 'DEPLETED', updated_at = NOW() WHERE code = $1 AND tenant_id = $2 AND status = 'AVAILABLE'",
                        [newDetails.bullId, req.tenantId]
                    );
                }
            } else if (oldEvent.event_type === 'EMBRYO_TRANSFER') {
                // Restore old embryo code to AVAILABLE
                if (oldDetails.bullId) {
                    await client.query(
                        "UPDATE embryo_bank SET status = 'AVAILABLE', updated_at = NOW() WHERE code = $1 AND tenant_id = $2 AND status = 'TRANSFERRED'",
                        [oldDetails.bullId, req.tenantId]
                    );
                }
                // Mark new embryo code as TRANSFERRED
                if (newDetails.bullId) {
                    await client.query(
                        "UPDATE embryo_bank SET status = 'TRANSFERRED', updated_at = NOW() WHERE code = $1 AND tenant_id = $2 AND status = 'AVAILABLE'",
                        [newDetails.bullId, req.tenantId]
                    );
                }
            }
        }

        // Update the event
        await client.query(
            `UPDATE breeding_events 
             SET event_date = $1, details = $2, updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [eventDate, finalNewDetails, id, req.tenantId]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to update event' });
    } finally {
        client.release();
    }
});

// DELETE /api/breeding/events/:id
router.delete('/events/:id', async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;

        // 1. Fetch event to identify animal and details
        const evtRes = await client.query('SELECT animal_id, event_type, cycle_id, event_date, details FROM breeding_events WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);

        if (evtRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Event not found" });
        }

        const { animal_id, event_type, cycle_id, event_date, details } = evtRes.rows[0];
        const eventDetails = details || {};

        // 1.5 Restore Genetics Inventory
        if (event_type === 'SERVICE_AI' && eventDetails.bullId) {
            await client.query(
                "UPDATE semen_bank SET status = 'AVAILABLE', updated_at = NOW() WHERE code = $1 AND tenant_id = $2 AND status = 'DEPLETED'",
                [eventDetails.bullId, req.tenantId]
            );
        } else if (event_type === 'EMBRYO_TRANSFER' && eventDetails.bullId) {
            await client.query(
                "UPDATE embryo_bank SET status = 'AVAILABLE', updated_at = NOW() WHERE code = $1 AND tenant_id = $2 AND status = 'TRANSFERRED'",
                [eventDetails.bullId, req.tenantId]
            );
        }

        if (event_type === 'CALVING') {
            let calfTag = eventDetails.calfDetails?.tagNumber;
            let calfId = null;

            if (calfTag) {
                const calfRes = await client.query(
                    'SELECT id FROM cattle WHERE tag_number = $1 AND tenant_id = $2',
                    [calfTag, req.tenantId]
                );
                if (calfRes.rows.length > 0) {
                    calfId = calfRes.rows[0].id;
                }
            }

            if (!calfId) {
                const motherTagRes = await client.query('SELECT tag_number FROM cattle WHERE id = $1', [animal_id]);
                if (motherTagRes.rows.length > 0) {
                    const motherTag = motherTagRes.rows[0].tag_number;
                    const calfRes = await client.query(
                        "SELECT id FROM cattle WHERE mother_tag = $1 AND entry_date = $2 AND arrival_type = 'BORN' AND tenant_id = $3",
                        [motherTag, event_date, req.tenantId]
                    );
                    if (calfRes.rows.length > 0) {
                        calfId = calfRes.rows[0].id;
                    }
                }
            }

            if (calfId) {
                // Cascade delete the calf
                await client.query('DELETE FROM breeding_events WHERE tenant_id = $1 AND animal_id = $2', [req.tenantId, calfId]);
                await client.query('DELETE FROM pregnancy_cycles WHERE tenant_id = $1 AND animal_id = $2', [req.tenantId, calfId]);
                await client.query('DELETE FROM cattle_costs WHERE tenant_id = $1 AND cattle_id = $2', [req.tenantId, calfId]);
                const milkTableCheck = await client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'milk_records')");
                if (milkTableCheck.rows[0].exists) {
                    await client.query('DELETE FROM milk_records WHERE tenant_id = $1 AND cattle_id = $2', [req.tenantId, calfId]);
                }
                await client.query('DELETE FROM cattle WHERE id = $1 AND tenant_id = $2', [calfId, req.tenantId]);
            }

            // Delete the lactation created for this calving
            await client.query(
                "DELETE FROM lactations WHERE tenant_id = $1 AND animal_id = $2 AND start_date = $3",
                [req.tenantId, animal_id, event_date]
            );

            // Restore previous lactation to ACTIVE if ended
            await client.query(`
                UPDATE lactations 
                SET status = 'ACTIVE', end_date = NULL, end_reason = NULL
                WHERE id = (
                    SELECT id FROM lactations 
                    WHERE tenant_id = $1 AND animal_id = $2 AND status = 'ENDED' AND end_reason = 'CALVING / NEW CYCLE'
                    ORDER BY end_date DESC LIMIT 1
                )
            `, [req.tenantId, animal_id]);
        }

        // 2. Delete the event
        await client.query('DELETE FROM breeding_events WHERE id = $1', [id]);

        // 3. Re-Sync Pregnancy Status (Source of Truth = Events)
        // We find the *new* latest status-defining event for this animal and cycle.
        let resolvedCycleId = cycle_id;
        if (!resolvedCycleId) {
            const cycleRes = await client.query(`
                SELECT id FROM pregnancy_cycles 
                WHERE tenant_id = $1 AND animal_id = $2 AND actual_calving_date = $3
                LIMIT 1
            `, [req.tenantId, animal_id, event_date]);
            if (cycleRes.rows.length > 0) {
                resolvedCycleId = cycleRes.rows[0].id;
            }
        }

        if (resolvedCycleId) {
            const lastRes = await client.query(`
                SELECT event_type, details ->> 'result' as result 
                FROM breeding_events 
                WHERE cycle_id = $1 
                ORDER BY event_date DESC, created_at DESC 
                LIMIT 1
            `, [resolvedCycleId]);

            let newStatus = 'OPEN'; // Default fallback

            if (lastRes.rows.length > 0) {
                const last = lastRes.rows[0];
                if (last.event_type === 'CALVING') {
                    newStatus = 'CALVED';
                } else if (last.event_type === 'PREG_CHECK' && last.result === 'POSITIVE') {
                    newStatus = 'CONFIRMED_PREGNANT';
                } else if (last.event_type === 'PREG_CHECK' && last.result === 'NEGATIVE') {
                    newStatus = 'OPEN';
                } else if (['SERVICE_AI', 'SERVICE_NATURAL', 'EMBRYO_TRANSFER'].includes(last.event_type)) {
                    newStatus = 'OPEN'; // Services imply cycle is running but not confirmed
                }
                // Apply the status update to pregnancy_cycles
                await client.query('UPDATE pregnancy_cycles SET status = $1 WHERE id = $2', [newStatus, resolvedCycleId]);
            } else {
                // No events left in this cycle -> delete it!
                await client.query('DELETE FROM pregnancy_cycles WHERE id = $1', [resolvedCycleId]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: "Event deleted and status synchronized." });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to delete event' });
    } finally {
        client.release();
    }
});

// GET /api/breeding/lactations/:animalId/active
router.get('/lactations/:animalId/active', async (req, res) => {
    try {
        const { animalId } = req.params;
        const result = await db.query(`
SELECT * FROM lactations 
            WHERE tenant_id = $1 AND animal_id = $2 AND status = 'ACTIVE' 
            LIMIT 1
    `, [req.tenantId, animalId]);

        res.json(result.rows[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch lactation' });
    }
});

// GET /api/breeding/milk-logs-by-date
router.get('/milk-logs-by-date', async (req, res) => {
    try {
        const { date } = req.query;
        let query = 'SELECT ml.*, c.tag_number FROM milk_logs ml JOIN cattle c ON ml.animal_id = c.id WHERE ml.tenant_id = $1';
        const params = [req.tenantId];
        
        if (date && date !== 'all' && date !== '') {
            query += ' AND ml.log_date = $2';
            params.push(date);
        }
        
        query += ' ORDER BY ml.log_date DESC, ml.created_at DESC';
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching milk logs:', err);
        res.status(500).json({ error: 'Failed to fetch milk logs' });
    }
});

// DELETE /api/breeding/milk-logs/:id
router.delete('/milk-logs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Delete log
        const delRes = await db.query(
            'DELETE FROM milk_logs WHERE id = $1 AND tenant_id = $2 RETURNING animal_id',
            [id, req.tenantId]
        );
        
        if (delRes.rows.length > 0) {
            const animalId = delRes.rows[0].animal_id;
            // Re-calculate rolling average for this animal
            const avgRes = await db.query(`
                SELECT COALESCE(AVG(total_yield), 0) as rolling_avg
                FROM (
                    SELECT total_yield 
                    FROM milk_logs 
                    WHERE tenant_id = $1 AND animal_id = $2
                    ORDER BY log_date DESC 
                    LIMIT 7
                ) as recent_logs
            `, [req.tenantId, animalId]);

            const rollingAvg = parseFloat(avgRes.rows[0].rolling_avg).toFixed(2);

            await db.query(`
                UPDATE cattle 
                SET current_daily_milk_yield = $1 
                WHERE id = $2 AND tenant_id = $3
            `, [rollingAvg, animalId, req.tenantId]);
        }
        
        res.json({ success: true, message: 'Milk log deleted and rolling average updated' });
    } catch (err) {
        console.error('Error deleting milk log:', err);
        res.status(500).json({ error: 'Failed to delete milk log' });
    }
});

// GET /api/breeding/milk-logs/:animalId
router.get('/milk-logs/:animalId', async (req, res) => {
    try {
        const { animalId } = req.params;
        const { limit = 30 } = req.query;

        const result = await db.query(`
SELECT * FROM milk_logs 
            WHERE tenant_id = $1 AND animal_id = $2 
            ORDER BY log_date DESC LIMIT $3
    `, [req.tenantId, animalId, limit]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch milk logs' });
    }
});

// POST /api/breeding/milk-logs
router.post('/milk-logs', async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        let logsToProcess = [];

        // Support batch array or single object
        if (req.body.logs && Array.isArray(req.body.logs)) {
            const { logDate } = req.body;
            logsToProcess = req.body.logs.map(log => ({
                animalId: log.animalId,
                logDate: logDate || log.logDate || new Date().toISOString().split('T')[0],
                morning: log.morning,
                evening: log.evening,
                notes: log.notes
            }));
        } else {
            logsToProcess = [req.body];
        }

        const addedLogs = [];

        for (const log of logsToProcess) {
            const { animalId, logDate, morning, evening, notes } = log;

            // Skip empty logs in batch unless specifically zeroing out
            if (morning === undefined && evening === undefined && !notes) continue;

            // Parse numbers carefully to avoid DB type errors
            const mYield = morning === '' ? 0 : parseFloat(morning) || 0;
            const eYield = evening === '' ? 0 : parseFloat(evening) || 0;

            // Find active lactation
            const lacRes = await client.query(`
                SELECT id FROM lactations 
                WHERE tenant_id = $1 AND animal_id = $2 AND status = 'ACTIVE'
    `, [req.tenantId, animalId]);

            const lactationId = lacRes.rows[0]?.id || null;

            const result = await client.query(`
                INSERT INTO milk_logs(
        tenant_id, animal_id, lactation_id, log_date, morning_yield, evening_yield, notes
    ) VALUES($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT(tenant_id, animal_id, log_date) 
                DO UPDATE SET
morning_yield = EXCLUDED.morning_yield,
    evening_yield = EXCLUDED.evening_yield,
    notes = EXCLUDED.notes
RETURNING *
    `, [req.tenantId, animalId, lactationId, logDate, mYield, eYield, notes]);

            addedLogs.push(result.rows[0]);

            // --- Calculate 7-day rolling average and update Cattle Profile ---
            const avgRes = await client.query(`
                SELECT COALESCE(AVG(total_yield), 0) as rolling_avg
FROM(
    SELECT total_yield 
                    FROM milk_logs 
                    WHERE tenant_id = $1 AND animal_id = $2
                    ORDER BY log_date DESC 
                    LIMIT 7
) as recent_logs
`, [req.tenantId, animalId]);

            const rollingAvg = parseFloat(avgRes.rows[0].rolling_avg).toFixed(2);

            await client.query(`
                UPDATE cattle 
                SET current_daily_milk_yield = $1 
                WHERE id = $2 AND tenant_id = $3
    `, [rollingAvg, animalId, req.tenantId]);
        }

        await client.query('COMMIT');
        // Return first element if it was a single request for legacy compat, otherwise the array
        if (req.body.logs) res.json(addedLogs);
        else res.json(addedLogs[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to save milk logs' });
    } finally {
        client.release();
    }
});

// POST /api/breeding/lactations/end
router.post('/lactations/end', async (req, res) => {
    try {
        const { animalId, endDate, reason } = req.body;
        console.log(`[DEBUG] Ending lactation.AnimalID: ${animalId}, Date: ${endDate}, TenantID: ${req.tenantId} `);

        // Find active lactation
        const lacRes = await db.query(`
            SELECT id FROM lactations 
            WHERE tenant_id = $1 AND animal_id = $2 AND status = 'ACTIVE'
    `, [req.tenantId, animalId]);

        const lactationId = lacRes.rows[0]?.id;
        console.log(`[DEBUG] Found Lactation ID: ${lactationId} `);

        if (!lactationId) {
            return res.status(404).json({ error: 'No active lactation found for this animal' });
        }

        const result = await db.query(`
            UPDATE lactations 
            SET status = 'ENDED', end_date = $1, end_reason = $2
            WHERE id = $3 AND tenant_id = $4
RETURNING *
    `, [endDate, reason, lactationId, req.tenantId]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to end lactation' });
    }
});

// GET /api/breeding/milk-sales
router.get('/milk-sales', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM milk_sales WHERE tenant_id = $1 ORDER BY sale_date DESC, created_at DESC',
            [req.tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching milk sales:', err);
        res.status(500).json({ error: 'Failed to fetch milk sales' });
    }
});

// POST /api/breeding/milk-sales
router.post('/milk-sales', async (req, res) => {
    const { saleDate, shift, quantityLiters, pricePerLiter, buyerName, paymentStatus, paidAmount, notes } = req.body;

    if (!saleDate || !shift || !quantityLiters || !pricePerLiter || !buyerName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const totalAmount = parseFloat(quantityLiters) * parseFloat(pricePerLiter);
        const paid = parseFloat(paidAmount) || 0;

        let transactionId = null;
        if (paid > 0) {
            const transResult = await client.query(
                `INSERT INTO general_transactions (tenant_id, type, category, amount, date, source, description)
                 VALUES ($1, 'INCOME', 'Milk Sales', $2, $3, $4, $5) RETURNING id`,
                [req.tenantId, paid, saleDate, buyerName, `Milk Sales - ${shift} shift (${quantityLiters}L @ Rs. ${pricePerLiter}/L)`]
            );
            transactionId = transResult.rows[0].id;
        }

        const result = await client.query(
            `INSERT INTO milk_sales (
                tenant_id, sale_date, shift, quantity_liters, price_per_liter, 
                total_amount, buyer_name, payment_status, paid_amount, notes, transaction_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [
                req.tenantId, saleDate, shift, quantityLiters, pricePerLiter,
                totalAmount, buyerName, paymentStatus, paid, notes, transactionId
            ]
        );

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating milk sale:', err);
        res.status(500).json({ error: 'Failed to record milk sale' });
    } finally {
        client.release();
    }
});

// PUT /api/breeding/milk-sales/:id
router.put('/milk-sales/:id', async (req, res) => {
    const { id } = req.params;
    const { saleDate, shift, quantityLiters, pricePerLiter, buyerName, paymentStatus, paidAmount, notes } = req.body;

    if (!saleDate || !shift || !quantityLiters || !pricePerLiter || !buyerName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Get existing sale to check for transaction_id
        const existingRes = await client.query(
            'SELECT transaction_id FROM milk_sales WHERE id = $1 AND tenant_id = $2',
            [id, req.tenantId]
        );

        if (existingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Milk sale not found' });
        }

        let transactionId = existingRes.rows[0].transaction_id;
        const totalAmount = parseFloat(quantityLiters) * parseFloat(pricePerLiter);
        const paid = parseFloat(paidAmount) || 0;

        if (transactionId) {
            if (paid > 0) {
                // Update existing transaction
                await client.query(
                    `UPDATE general_transactions 
                     SET amount = $1, date = $2, source = $3, description = $4, updated_at = NOW()
                     WHERE id = $5 AND tenant_id = $6`,
                    [paid, saleDate, buyerName, `Milk Sales - ${shift} shift (${quantityLiters}L @ Rs. ${pricePerLiter}/L)`, transactionId, req.tenantId]
                );
            } else {
                // Delete transaction as paid amount is now 0
                await client.query('DELETE FROM general_transactions WHERE id = $1 AND tenant_id = $2', [transactionId, req.tenantId]);
                transactionId = null;
            }
        } else if (paid > 0) {
            // Create new transaction
            const transResult = await client.query(
                `INSERT INTO general_transactions (tenant_id, type, category, amount, date, source, description)
                 VALUES ($1, 'INCOME', 'Milk Sales', $2, $3, $4, $5) RETURNING id`,
                [req.tenantId, paid, saleDate, buyerName, `Milk Sales - ${shift} shift (${quantityLiters}L @ Rs. ${pricePerLiter}/L)`]
            );
            transactionId = transResult.rows[0].id;
        }

        const result = await client.query(
            `UPDATE milk_sales 
             SET sale_date = $1, shift = $2, quantity_liters = $3, price_per_liter = $4, 
                 total_amount = $5, buyer_name = $6, payment_status = $7, paid_amount = $8, 
                 notes = $9, transaction_id = $10, updated_at = NOW()
             WHERE id = $11 AND tenant_id = $12 RETURNING *`,
            [
                saleDate, shift, quantityLiters, pricePerLiter,
                totalAmount, buyerName, paymentStatus, paid, notes, transactionId, id, req.tenantId
            ]
        );

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating milk sale:', err);
        res.status(500).json({ error: 'Failed to update milk sale' });
    } finally {
        client.release();
    }
});

// DELETE /api/breeding/milk-sales/:id
router.delete('/milk-sales/:id', async (req, res) => {
    const { id } = req.params;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch transaction_id
        const existingRes = await client.query(
            'SELECT transaction_id FROM milk_sales WHERE id = $1 AND tenant_id = $2',
            [id, req.tenantId]
        );

        if (existingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Milk sale not found' });
        }

        const transactionId = existingRes.rows[0].transaction_id;

        // Delete milk sale
        await client.query('DELETE FROM milk_sales WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);

        // Delete linked transaction if exists
        if (transactionId) {
            await client.query('DELETE FROM general_transactions WHERE id = $1 AND tenant_id = $2', [transactionId, req.tenantId]);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Milk sale deleted' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error deleting milk sale:', err);
        res.status(500).json({ error: 'Failed to delete milk sale' });
    } finally {
        client.release();
    }
});

// GET /api/breeding/milk-stats
router.get('/milk-stats', async (req, res) => {
    try {
        // 1. Production Curve (Last 30 Days)
        const trendRes = await db.query(`
            SELECT log_date, SUM(morning_yield + evening_yield) as total_yield
            FROM milk_logs
            WHERE tenant_id = $1 AND log_date >= NOW() - INTERVAL '30 days'
            GROUP BY log_date
            ORDER BY log_date ASC
        `, [req.tenantId]);

        // Map log_date to simple formatted string for charts
        const productionTrend = trendRes.rows.map(r => ({
            date: new Date(r.log_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            yield: parseFloat(r.total_yield) || 0
        }));

        // 2. Yield by Breed (Last 30 Days)
        const breedRes = await db.query(`
            SELECT c.breed, COALESCE(AVG(ml.morning_yield + ml.evening_yield), 0) as avg_yield
            FROM milk_logs ml
            JOIN cattle c ON ml.animal_id = c.id
            WHERE ml.tenant_id = $1 AND ml.log_date >= NOW() - INTERVAL '30 days'
            GROUP BY c.breed
        `, [req.tenantId]);

        const breedYields = breedRes.rows.map(r => ({
            breed: r.breed || 'Unknown',
            yield: parseFloat(parseFloat(r.avg_yield).toFixed(2))
        }));

        // 3. Lactation Stages Breakdown
        const stageRes = await db.query(`
            SELECT 
                CASE 
                    WHEN NOW() - start_date <= INTERVAL '90 days' THEN 'Early (0-90d)'
                    WHEN NOW() - start_date <= INTERVAL '200 days' THEN 'Mid (91-200d)'
                    WHEN NOW() - start_date <= INTERVAL '305 days' THEN 'Late (201-305d)'
                    ELSE 'Extended (305d+)'
                END as stage,
                COUNT(*) as count
            FROM lactations
            WHERE tenant_id = $1 AND status = 'ACTIVE'
            GROUP BY stage
        `, [req.tenantId]);

        // Count of Dry Period Cows (Active mature females without active lactation)
        const dryRes = await db.query(`
            SELECT COUNT(*) as count FROM cattle
            WHERE tenant_id = $1 AND status = 'Active'
              AND (UPPER(gender) IN ('FEMALE', 'COW', 'HEIFER', 'F') OR UPPER(type) IN ('COW', 'HEIFER'))
              AND id NOT IN (SELECT animal_id FROM lactations WHERE tenant_id = $1 AND status = 'ACTIVE')
        `, [req.tenantId]);

        const lactationStages = stageRes.rows.map(r => ({
            name: r.stage,
            value: parseInt(r.count) || 0
        }));

        const dryCount = parseInt(dryRes.rows[0].count) || 0;
        if (dryCount > 0) {
            lactationStages.push({
                name: 'Dry Period',
                value: dryCount
            });
        }

        res.json({
            productionTrend,
            breedYields,
            lactationStages
        });
    } catch (err) {
        console.error('Error fetching milk stats:', err);
        res.status(500).json({ error: 'Failed to fetch milk stats' });
    }
});

// GET /api/breeding/gestation-stats
router.get('/gestation-stats', async (req, res) => {
    try {
        // 1. Expected Calving Schedule
        const scheduleRes = await db.query(`
            SELECT 
                pc.id as cycle_id,
                pc.animal_id,
                c.tag_number as mother_tag,
                c.breed,
                pc.cycle_start_date as service_date,
                pc.expected_calving_date,
                (pc.expected_calving_date::date - CURRENT_DATE) as days_remaining,
                COALESCE((
                    SELECT (details->>'bullId') 
                    FROM breeding_events 
                    WHERE cycle_id = pc.id AND event_type IN ('SERVICE_AI', 'SERVICE_NATURAL') 
                    ORDER BY event_date DESC 
                    LIMIT 1
                ), c.pregnancy_sire_embryo) as sire_code
            FROM pregnancy_cycles pc
            JOIN cattle c ON pc.animal_id = c.id
            WHERE pc.tenant_id = $1 AND pc.status = 'CONFIRMED_PREGNANT'
            ORDER BY pc.expected_calving_date ASC
        `, [req.tenantId]);

        // 2. Calving Interval Tracking
        const calvingHistoryRes = await db.query(`
            SELECT animal_id, c.tag_number, actual_calving_date
            FROM pregnancy_cycles pc
            JOIN cattle c ON pc.animal_id = c.id
            WHERE pc.tenant_id = $1 AND pc.status = 'CALVED' AND pc.actual_calving_date IS NOT NULL
            ORDER BY animal_id, pc.actual_calving_date ASC
        `, [req.tenantId]);

        const intervalsByAnimal = {};
        const allIntervals = [];

        // Group calving dates by animal
        calvingHistoryRes.rows.forEach(row => {
            if (!intervalsByAnimal[row.animal_id]) {
                intervalsByAnimal[row.animal_id] = {
                    tagNumber: row.tag_number,
                    dates: []
                };
            }
            intervalsByAnimal[row.animal_id].dates.push(new Date(row.actual_calving_date));
        });

        // Calculate intervals
        const calculatedIntervals = [];
        Object.entries(intervalsByAnimal).forEach(([animalId, data]) => {
            const { tagNumber, dates } = data;
            if (dates.length >= 2) {
                const animalIntervals = [];
                for (let i = 1; i < dates.length; i++) {
                    const diffTime = Math.abs(dates[i].getTime() - dates[i-1].getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    animalIntervals.push(diffDays);
                    allIntervals.push(diffDays);
                }
                const avgInterval = Math.round(animalIntervals.reduce((a, b) => a + b, 0) / animalIntervals.length);
                calculatedIntervals.push({
                    animalId,
                    tagNumber,
                    avgIntervalDays: avgInterval,
                    calvingsCount: dates.length
                });
            }
        });

        const herdAverageInterval = allIntervals.length > 0 
            ? Math.round(allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length)
            : null;

        res.json({
            expectedSchedule: scheduleRes.rows,
            calvingIntervals: calculatedIntervals,
            herdAverageInterval
        });
    } catch (err) {
        console.error('Error fetching gestation stats:', err);
        res.status(500).json({ error: 'Failed to fetch gestation stats' });
    }
});

// GET /api/breeding/offspring/:tagNumber
router.get('/offspring/:tagNumber', async (req, res) => {
    try {
        const { tagNumber } = req.params;
        const result = await db.query(
            'SELECT id, tag_number, name, breed, gender, status FROM cattle WHERE tenant_id = $1 AND mother_tag = $2',
            [req.tenantId, tagNumber]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching offspring:', err);
        res.status(500).json({ error: 'Failed to fetch offspring list' });
    }
});

// GET /api/breeding/events-by-animal/:animalId — full breeding event history for details panel
router.get('/events-by-animal/:animalId', async (req, res) => {
    try {
        const { animalId } = req.params;
        const result = await db.query(
            `SELECT 
                be.id,
                be.event_type,
                be.event_date,
                be.details,
                be.created_at,
                pc.cycle_start_date,
                pc.status as cycle_status
             FROM breeding_events be
             LEFT JOIN pregnancy_cycles pc ON pc.id = be.cycle_id AND pc.tenant_id = be.tenant_id
             WHERE be.tenant_id = $1 AND be.animal_id = $2
             ORDER BY be.event_date DESC, be.created_at DESC`,
            [req.tenantId, animalId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching breeding events by animal:', err);
        res.status(500).json({ error: 'Failed to fetch breeding events' });
    }
});

// GET /api/breeding/alerts/:animalId — upcoming reminders and overdue alerts
router.get('/alerts/:animalId', async (req, res) => {
    try {
        const { animalId } = req.params;
        const alerts = [];
        const today = new Date();

        // 1. Fetch animal basic info
        const animalRes = await db.query(
            `SELECT id, tag_number, gender, type, expected_calving_date, expected_conceiving_date,
                    vaccination_history, current_daily_milk_yield, arrival_type, entry_date
             FROM cattle WHERE id = $1 AND tenant_id = $2`,
            [animalId, req.tenantId]
        );
        if (animalRes.rows.length === 0) return res.json([]);
        const animal = animalRes.rows[0];

        // 2. Expected Calving Alert
        if (animal.expected_calving_date) {
            const calvingDate = new Date(animal.expected_calving_date);
            const daysUntil = Math.round((calvingDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (daysUntil >= 0) {
                alerts.push({
                    type: 'CALVING_DUE',
                    severity: daysUntil <= 14 ? 'HIGH' : 'MEDIUM',
                    title: 'Expected Calving',
                    message: `Calving due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
                    dueDate: animal.expected_calving_date,
                    daysRemaining: daysUntil
                });
            } else {
                alerts.push({
                    type: 'CALVING_OVERDUE',
                    severity: 'HIGH',
                    title: 'Calving Overdue',
                    message: `Expected calving was ${Math.abs(daysUntil)} days ago`,
                    dueDate: animal.expected_calving_date,
                    daysRemaining: daysUntil
                });
            }
        }

        // 3. Preg Check Overdue — if AI service > 45 days ago with no preg check after it
        const lastAiRes = await db.query(
            `SELECT event_date FROM breeding_events 
             WHERE tenant_id = $1 AND animal_id = $2 AND event_type = 'AI_SERVICE'
             ORDER BY event_date DESC LIMIT 1`,
            [req.tenantId, animalId]
        );
        if (lastAiRes.rows.length > 0) {
            const lastAiDate = new Date(lastAiRes.rows[0].event_date);
            const daysSinceAi = Math.round((today.getTime() - lastAiDate.getTime()) / (1000 * 3600 * 24));
            if (daysSinceAi >= 45) {
                // Check if there's a preg check AFTER the AI service
                const pregCheckRes = await db.query(
                    `SELECT id FROM breeding_events 
                     WHERE tenant_id = $1 AND animal_id = $2 AND event_type = 'PREG_CHECK'
                     AND event_date > $3 LIMIT 1`,
                    [req.tenantId, animalId, lastAiRes.rows[0].event_date]
                );
                if (pregCheckRes.rows.length === 0) {
                    alerts.push({
                        type: 'PREG_CHECK_DUE',
                        severity: daysSinceAi >= 60 ? 'HIGH' : 'MEDIUM',
                        title: 'Pregnancy Check Due',
                        message: `AI service was ${daysSinceAi} days ago — schedule a pregnancy check`,
                        dueDate: null,
                        daysRemaining: null
                    });
                }
            }
        }

        // 4. Vaccination due — check vaccinationHistory for nextDueDate
        const vaccHistory = Array.isArray(animal.vaccination_history) ? animal.vaccination_history : [];
        for (const vacc of vaccHistory) {
            if (vacc.nextDueDate) {
                const dueDate = new Date(vacc.nextDueDate);
                const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                if (daysUntil <= 30) {
                    alerts.push({
                        type: 'VACCINATION_DUE',
                        severity: daysUntil < 0 ? 'HIGH' : daysUntil <= 7 ? 'MEDIUM' : 'LOW',
                        title: daysUntil < 0 ? 'Vaccination Overdue' : 'Vaccination Due Soon',
                        message: daysUntil < 0
                            ? `${vacc.vaccineName} was due ${Math.abs(daysUntil)} days ago`
                            : `${vacc.vaccineName} due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
                        dueDate: vacc.nextDueDate,
                        daysRemaining: daysUntil,
                        vaccineName: vacc.vaccineName
                    });
                }
            }
        }

        // 5. Dry Cow — mating due (if expected_conceiving_date is set and in the past/near)
        if (animal.expected_conceiving_date) {
            const matingDate = new Date(animal.expected_conceiving_date);
            const daysUntil = Math.round((matingDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
            if (daysUntil <= 30) {
                alerts.push({
                    type: 'MATING_DUE',
                    severity: daysUntil < 0 ? 'MEDIUM' : 'LOW',
                    title: daysUntil < 0 ? 'Mating/AI Service Overdue' : 'Mating/AI Service Due',
                    message: daysUntil < 0
                        ? `Expected mating was ${Math.abs(daysUntil)} days ago`
                        : `Expected mating in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
                    dueDate: animal.expected_conceiving_date,
                    daysRemaining: daysUntil
                });
            }
        }

        // 6. Calf Specific Alerts (based on date of birth / entry date)
        const isBornCalf = animal.arrival_type === 'BORN' || (animal.arrival_type && animal.arrival_type.toUpperCase() === 'BORN');
        if (isBornCalf && animal.entry_date) {
            const birthDate = new Date(animal.entry_date);
            const ageInDays = Math.round((today.getTime() - birthDate.getTime()) / (1000 * 3600 * 24));

            // Colostrum: within 24 hours of birth
            if (ageInDays <= 1) {
                alerts.push({
                    type: 'COLOSTRUM_FEEDING',
                    severity: 'HIGH',
                    title: 'Colostrum Feeding Check',
                    message: 'Ensure the newborn calf receives mother\'s colostrum within 24 hours of birth for critical immunity.',
                    dueDate: animal.entry_date,
                    daysRemaining: 1 - ageInDays
                });
            }

            // Deworming: due at 15 days of age
            if (ageInDays <= 15) {
                const dewormingDate = new Date(birthDate);
                dewormingDate.setDate(birthDate.getDate() + 15);
                const daysUntil = 15 - ageInDays;
                alerts.push({
                    type: 'CALF_DEWORMING',
                    severity: daysUntil <= 3 ? 'HIGH' : 'MEDIUM',
                    title: 'First Deworming Due',
                    message: `Calf deworming is due at 15 days of age (in ${daysUntil} days)`,
                    dueDate: dewormingDate.toISOString().split('T')[0],
                    daysRemaining: daysUntil
                });
            }

            // FMD Vaccine: recommended at 3 months of age (90 days)
            if (ageInDays <= 90) {
                const fmdDate = new Date(birthDate);
                fmdDate.setDate(birthDate.getDate() + 90);
                const daysUntil = 90 - ageInDays;
                alerts.push({
                    type: 'CALF_FMD_VACCINE',
                    severity: daysUntil <= 7 ? 'HIGH' : 'LOW',
                    title: 'FMD Vaccination Recommended',
                    message: `Foot & Mouth Disease vaccination is due at 3 months of age (in ${daysUntil} days)`,
                    dueDate: fmdDate.toISOString().split('T')[0],
                    daysRemaining: daysUntil
                });
            }
        }

        res.json(alerts);
    } catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

module.exports = router;
