const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendAnimalOwnerWelcomeEmail } = require('../services/emailService');
const { authMiddleware } = require('../middleware/auth');
const { logActivity } = require('../services/auditService');
const crypto = require('crypto');

const generateRandomToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

const { syncAnimalFeedCosts } = require('../utils/feedCostSync');
const { formatNewSchemeTag, NEW_SCHEME_TYPE_META } = require('../utils/animalTagging');
const { pgDateToStr } = require('../utils/dateUtils');

const mapCattleRow = (row) => {
    if (!row) return null;
    return {
        ...row,
        isPregnant: row.is_pregnant === true,
        vaccinationHistory: typeof row.vaccination_history === 'string' ? JSON.parse(row.vaccination_history) : row.vaccination_history || [],
        weightHistory: typeof row.weight_history === 'string' ? JSON.parse(row.weight_history) : row.weight_history || [],
        transactions: [
            ...(Array.isArray(row.transactions) ? row.transactions : (typeof row.transactions === 'string' ? JSON.parse(row.transactions) : [])),
            ...(row.cattle_costs || [])
        ],
        qurbaniDetails: typeof row.qurbani_details === 'string' ? JSON.parse(row.qurbani_details) : row.qurbani_details || null,
        tagNumber: row.tag_number,
        entryDate: pgDateToStr(row.entry_date),
        entryWeight: parseFloat(row.entry_weight) || 0,
        currentWeight: parseFloat(row.current_weight) || 0,
        targetWeight: row.target_weight !== null && row.target_weight !== undefined ? parseFloat(row.target_weight) : null,
        dailyTargetGain: row.daily_target_gain !== null && row.daily_target_gain !== undefined ? parseFloat(row.daily_target_gain) : null,
        purchasePrice: parseFloat(row.purchase_price) || 0,
        ownerName: row.owner_name,
        ownerMobile: row.owner_mobile,
        ownerEmail: row.owner_email,
        ownerAddress: row.owner_address,
        monthlyPackageId: row.monthly_package_id,
        monthlyCharges: parseFloat(row.monthly_charges) || 0,
        imageUrl: row.image_url,
        vaccinationStatus: row.vaccination_status,
        healthStatus: row.health_status || 'Healthy',
        expectedCalvingDate: pgDateToStr(row.expected_calving_date),
        expectedConceivingDate: pgDateToStr(row.expected_conceiving_date),
        pregnancyType: row.pregnancy_type || null,
        pregnancySireOrEmbryo: row.pregnancy_sire_embryo || null,
        lactationNumber: row.lactation_number ? parseInt(row.lactation_number) : null,
        currentDailyMilkYield: parseFloat(row.current_daily_milk_yield) || 0,
        ageMonths: row.age_months !== null && row.age_months !== undefined ? parseFloat(row.age_months) : undefined,
        arrivalType: row.arrival_type,
        photos: typeof row.photos === 'string' ? JSON.parse(row.photos) : row.photos || [],
        videos: typeof row.video_links === 'string' ? JSON.parse(row.video_links) : row.video_links || [],
        documents: typeof row.documents === 'string' ? JSON.parse(row.documents) : row.documents || [],
        parentTag: row.parent_tag,
        motherTag: row.mother_tag || '',
        fatherTag: row.father_tag || '',
        historicalFeedCost: parseFloat(row.historical_feed_cost) || 0,
        lastFeedLogDate: pgDateToStr(row.last_feed_log_date),
        isLactating: row.is_lactating === true,
        groupId: row.group_id || null,
        branch: row.branch || undefined
    };
};

router.use(authMiddleware);
router.use((req, res, next) => {
    req.tenantId = req.user.tenantId;
    next();
});

// GET the tag this tenant's next registered animal would receive, for a given
// type - preview only, does not consume the sequence. Legacy-scheme tenants get
// legacyTagScheme: true and no preview (the frontend keeps its own client-side
// suggestion logic for them, unchanged).
router.get('/next-tag', async (req, res) => {
    try {
        const tenantResult = await db.query('SELECT legacy_tag_scheme, next_animal_seq FROM tenants WHERE id = $1', [req.tenantId]);
        if (tenantResult.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
        const tenant = tenantResult.rows[0];

        if (tenant.legacy_tag_scheme) {
            return res.json({ legacyTagScheme: true });
        }

        const type = req.query.type;
        const preview = type ? formatNewSchemeTag(type, tenant.next_animal_seq) : null;
        res.json({ legacyTagScheme: false, nextSeq: tenant.next_animal_seq, preview });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to compute next tag' });
    }
});

// GET all cattle for tenant
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT c.*, m.tag_number as parent_tag,
             (
                SELECT 
                    CASE 
                        WHEN be.event_type = 'PREG_CHECK' AND (be.details->>'result') = 'POSITIVE' THEN true 
                        WHEN be.event_type IN ('CONFIRMED_PREGNANT') THEN true
                        ELSE false 
                    END
                FROM breeding_events be
                WHERE be.animal_id = c.id AND be.tenant_id = c.tenant_id
                AND be.event_type IN ('PREG_CHECK', 'CALVING', 'ABORTION')
                ORDER BY be.event_date DESC, be.created_at DESC
                LIMIT 1
             ) as is_pregnant,
             (
                SELECT json_agg(
                    json_build_object(
                        'id', cc.id,
                        'costType', cc.cost_type,
                        'amount', cc.amount,
                        'description', cc.description,
                        'date', cc.date,
                        'createdAt', cc.created_at
                    )
                ) FROM cattle_costs cc WHERE cc.cattle_id = c.id AND cc.tenant_id = c.tenant_id
             ) as cattle_costs,
             (
                SELECT COALESCE(SUM(daily_cost), 0) FROM animal_feed_cost_logs WHERE animal_id = c.id
             ) as historical_feed_cost,
             (
                SELECT MAX(log_date) FROM animal_feed_cost_logs WHERE animal_id = c.id
             ) as last_feed_log_date,
             (
                EXISTS (SELECT 1 FROM lactations WHERE animal_id = c.id AND status = 'ACTIVE' LIMIT 1)
             ) as is_lactating
             FROM cattle c
             LEFT JOIN cattle m ON (m.id::text = c.mother_tag OR m.tag_number = c.mother_tag) AND m.tenant_id = c.tenant_id
             WHERE c.tenant_id = $1 
             ORDER BY c.created_at DESC`,
            [req.tenantId]
        );
        // Map database fields to frontend types if necessary (e.g. snake_case to camelCase)
        // For now assuming frontend handles the mapping or schema matches closely.
        res.json(result.rows.map(mapCattleRow));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET animals for animal owner (filtered by their email)
router.get('/my-animals', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET;

    try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);

        const userResult = await db.query('SELECT email, role, tenant_id FROM users WHERE id = $1', [decoded.userId]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        if (user.role !== 'ANIMAL_OWNER') {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!user.tenant_id) {
            return res.status(400).json({ error: 'No farm associated with this account' });
        }

        const result = await db.query(
            `SELECT * FROM cattle WHERE tenant_id = $1::uuid AND LOWER(owner_email) = $2 ORDER BY created_at DESC`,
            [user.tenant_id, user.email.toLowerCase()]
        );

        res.json(result.rows.map(mapCattleRow));
    } catch (err) {
        console.error('My animals error:', err);
        res.status(500).json({ error: 'Failed to fetch animals' });
    }
});

// GET single cattle by ID with Timeline Data
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM cattle WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cattle not found' });
        }

        const row = result.rows[0];

        // Fetch Historical Feed Cost total to augment the response
        const historyRes = await db.query(
            'SELECT COALESCE(SUM(daily_cost), 0) as historical_feed_cost, MAX(log_date) as last_feed_log_date FROM animal_feed_cost_logs WHERE animal_id = $1',
            [row.id]
        );

        res.json(mapCattleRow({
            ...row,
            historical_feed_cost: historyRes.rows[0].historical_feed_cost,
            last_feed_log_date: historyRes.rows[0].last_feed_log_date
        }));
    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch cattle' });
    }
});



// POST create cattle
router.post('/', async (req, res) => {
    const c = req.body;
    try {
        // Enforce FREE tier animal limit of 5
        const tenantResult = await db.query('SELECT tier, legacy_tag_scheme FROM tenants WHERE id = $1', [req.tenantId]);
        if (tenantResult.rows.length > 0 && tenantResult.rows[0].tier === 'FREE') {
            const countResult = await db.query('SELECT COUNT(*) FROM cattle WHERE tenant_id = $1', [req.tenantId]);
            if (parseInt(countResult.rows[0].count) >= 5) {
                return res.status(403).json({
                    error: 'Free plan is limited to 5 animals. Please upgrade to add more.',
                    limitReached: true
                });
            }
        }

        let finalTagNumber = c.tagNumber;

        // New-scheme tenants (registered after the global sequential tagging rollout):
        // assign PREFIX+4-digit atomically from the tenant's own running counter, so
        // the number can never collide or skip under concurrent registrations - unlike
        // the old client-side "guess the max" approach. Bulk CSV import is the one
        // exception: it sends respectProvidedTag so a farm migrating real records with
        // already-assigned tags (e.g. physical ear tags) keeps them as-is rather than
        // being silently renumbered - the interactive single-add form never sets this.
        if (!c.respectProvidedTag && tenantResult.rows.length > 0 && tenantResult.rows[0].legacy_tag_scheme === false) {
            if (!NEW_SCHEME_TYPE_META[c.type]) {
                // Validated before touching the sequence counter, so a bad request never
                // burns a number - and so we never silently emit a tag with no prefix.
                return res.status(400).json({ error: `Unrecognized animal type "${c.type}" for this farm's tagging scheme.` });
            }
            const seqResult = await db.query(
                `UPDATE tenants SET next_animal_seq = next_animal_seq + 1 WHERE id = $1 RETURNING next_animal_seq`,
                [req.tenantId]
            );
            const seq = seqResult.rows[0].next_animal_seq - 1;
            finalTagNumber = formatNewSchemeTag(c.type, seq);
        }

        let result;
        let maxRetries = 3;

        while (maxRetries > 0) {
            try {
                result = await db.query(
                    `INSERT INTO cattle (
                        tenant_id, tag_number, name, type, breed, gender, teeth, color, 
                        status, arrival_type, entry_date, entry_weight, current_weight, 
                        target_weight, daily_target_gain, purchase_price, owner_name, 
                        owner_mobile, owner_email, owner_address, monthly_package_id, monthly_charges, notes, image_url,
                        weight_history, vaccination_history, transactions, photos, video_links, documents, health_status, expected_calving_date, current_daily_milk_yield, age_months, group_id, expected_conceiving_date, pregnancy_type, pregnancy_sire_embryo, lactation_number, branch, owner_whatsapp_number, owner_whatsapp_apikey, mother_tag, father_tag
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44)
                    RETURNING *`,
                    [
                        req.tenantId, finalTagNumber, c.name || null, c.type, c.breed, c.gender, c.teeth, c.color,
                        c.status, c.arrivalType, c.entryDate, c.entryWeight, c.currentWeight,
                        c.targetWeight, c.dailyTargetGain, c.purchasePrice, c.ownerName,
                        c.ownerMobile, c.ownerEmail, c.ownerAddress || null, c.monthlyPackageId, c.monthlyCharges || 0, c.notes || null, c.imageUrl || null,
                        JSON.stringify(c.weightHistory || []), JSON.stringify(c.vaccinationHistory || []), JSON.stringify(c.transactions || []),
                        JSON.stringify(c.photos || []), JSON.stringify(c.videos || []), JSON.stringify(c.documents || []),
                        c.healthStatus || 'Healthy', c.expectedCalvingDate || null, c.currentDailyMilkYield || 0, c.ageMonths || null,
                        c.groupId || null, c.expectedConceivingDate || null, c.pregnancyType || null, c.pregnancySireOrEmbryo || null, c.lactationNumber || null, c.branch || null,
                        c.ownerWhatsappNumber || null, c.ownerWhatsappApiKey || null, c.motherTag || null, c.fatherTag || null
                    ]
                );
                break; // Success, exit loop
            } catch (queryErr) {
                // 23505 is PostgreSQL unique_violation error code
                if (queryErr.code === '23505' && queryErr.constraint === 'cattle_tenant_id_tag_number_key') {
                    finalTagNumber = `${c.tagNumber}-D${Math.floor(Math.random() * 10000)}`;
                    maxRetries--;
                    if (maxRetries === 0) throw queryErr;
                } else {
                    throw queryErr; // Rethrow other database errors
                }
            }
        }

        const newCattle = result.rows[0];

        // A respected tag (e.g. from CSV import) is outside the auto-sequence, but if
        // it happens to end in a number - which is exactly what the new tagging
        // convention's own tags look like - advance the counter past it. Otherwise the
        // next interactively-registered animal would start back at 0001 and collide
        // with the imported range instead of continuing the single running sequence.
        if (c.respectProvidedTag && tenantResult.rows.length > 0 && tenantResult.rows[0].legacy_tag_scheme === false) {
            const match = String(newCattle.tag_number).match(/(\d+)$/);
            if (match) {
                const usedNum = parseInt(match[1], 10);
                await db.query(
                    `UPDATE tenants SET next_animal_seq = GREATEST(next_animal_seq, $2) WHERE id = $1`,
                    [req.tenantId, usedNum + 1]
                );
            }
        }

        if (c.ownerEmail && c.ownerName) {
            try {
                const existingUser = await db.query(
                    'SELECT id FROM users WHERE email = $1',
                    [c.ownerEmail.toLowerCase()]
                );

                if (existingUser.rows.length === 0) {
                    const tenantResult = await db.query(
                        'SELECT name FROM tenants WHERE id = $1::uuid',
                        [req.tenantId]
                    );
                    const farmName = tenantResult.rows[0]?.name || 'FarmXpert Farm';

                    const userResult = await db.query(
                        `INSERT INTO users (tenant_id, name, email, mobile, role, is_verified)
                         VALUES ($1::uuid, $2, $3, $4, 'ANIMAL_OWNER', true) RETURNING id`,
                        [req.tenantId, c.ownerName, c.ownerEmail.toLowerCase(), c.ownerMobile || null]
                    );
                    const newUser = userResult.rows[0];

                    const setupToken = generateRandomToken();
                    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                    await db.query(
                        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
                         VALUES ($1, $2, $3)`,
                        [newUser.id, setupToken, expiresAt]
                    );

                    await sendAnimalOwnerWelcomeEmail(
                        c.ownerEmail,
                        c.ownerName,
                        c.tagNumber,
                        farmName,
                        setupToken
                    );

                    if (c.ownerWhatsappNumber && c.ownerWhatsappApiKey) {
                        const { sendAnimalOwnerWelcomeWhatsApp } = require('../services/whatsappService');
                        await sendAnimalOwnerWelcomeWhatsApp(c.ownerWhatsappNumber, c.ownerWhatsappApiKey, c.ownerName, c.tagNumber, farmName);
                    }

                    console.log(`Animal owner account created for ${c.ownerEmail}, welcome email sent`);
                } else {
                    console.log(`User ${c.ownerEmail} already exists, skipping account creation`);
                }
            } catch (emailErr) {
                console.error('Error creating animal owner account:', emailErr);
            }
        }

        // --- NEW: Breeding Module Integration ---
        if (c.isPregnant && (c.type?.toUpperCase() === 'COW' || c.type?.toUpperCase() === 'HEIFER' || c.gender?.toUpperCase() === 'FEMALE')) {
            try {
                const expectedCalving = c.expectedCalvingDate || null;
                let estimatedStart = null;
                let finalExpectedCalving = expectedCalving;

                if (c.expectedConceivingDate) {
                    estimatedStart = c.expectedConceivingDate;
                    if (!expectedCalving) {
                        const cDate = new Date(estimatedStart);
                        cDate.setDate(cDate.getDate() + 283);
                        finalExpectedCalving = cDate.toISOString().split('T')[0];
                    }
                } else if (expectedCalving) {
                    const eDate = new Date(expectedCalving);
                    eDate.setDate(eDate.getDate() - 280);
                    estimatedStart = eDate.toISOString().split('T')[0];
                } else {
                    estimatedStart = new Date().toISOString().split('T')[0];
                }

                // Create the Cycle
                const cycleRes = await db.query(`
                    INSERT INTO pregnancy_cycles (
                        tenant_id, animal_id, cycle_start_date, status, expected_calving_date
                    ) VALUES ($1, $2, $3, 'CONFIRMED_PREGNANT', $4)
                    RETURNING id
                `, [req.tenantId, newCattle.id, estimatedStart, finalExpectedCalving]);

                // Also record a base event so the timeline works
                const eventDate = new Date().toISOString().split('T')[0];
                await db.query(`
                    INSERT INTO breeding_events (
                        tenant_id, animal_id, cycle_id, event_type, event_date, details
                    ) VALUES ($1, $2, $3, 'PREG_CHECK', $4, '{"result": "POSITIVE", "notes": "Auto-registered on animal creation"}')
                `, [req.tenantId, newCattle.id, cycleRes.rows[0].id, eventDate]);

                console.log(`Auto-created pregnancy cycle and event for pregnant cow ${newCattle.id}`);
            } catch (breedErr) {
                console.error('Failed to auto-create breeding records:', breedErr);
                // Do not fail the whole request if just breeding sync fails
            }
        }

        // --- NEW: Milk Lifecycle Integration ---
        if (c.currentDailyMilkYield > 0 && (c.type?.toUpperCase() === 'COW' || c.type?.toUpperCase() === 'HEIFER' || c.gender?.toUpperCase() === 'FEMALE')) {
            try {
                await db.query(`
                    INSERT INTO lactations (
                        tenant_id, animal_id, lactation_number, start_date, status
                    ) VALUES ($1, $2, 1, $3, 'ACTIVE')
                `, [req.tenantId, newCattle.id, c.entryDate || new Date().toISOString().split('T')[0]]);
                console.log(`Auto-created initial lactation for milk-producing cow ${newCattle.id}`);
            } catch (lacErr) {
                console.error('Failed to auto-create lactation record:', lacErr);
            }
        }

        // Billing invoices are generated by the monthly billing check (manual "Run
        // Checks" button or the automated cron on the 2nd of each month), which
        // prorates the first invoice correctly - not created here on registration.

        // AUDIT LOG
        await logActivity(req.tenantId, req.user ? req.user.id : null, 'CREATE', 'CATTLE', newCattle.id, {
            tagNumber: newCattle.tag_number,
            name: newCattle.name,
            breed: newCattle.breed
        });

        res.status(201).json(mapCattleRow(newCattle));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create cattle' });
    }
});

// PUT update cattle (supports partial updates)
router.put('/:id', async (req, res) => {
    const c = req.body;
    const { id } = req.params;
    console.log('[PUT cattle] groupId received:', c.groupId, '| id:', id);
    try {
        // SYNCHRONIZE Feed Costs BEFORE updating an animal's specific package/charges
        if (c.monthlyPackageId !== undefined || c.monthlyCharges !== undefined) {
            await syncAnimalFeedCosts(req.tenantId, id);
        }

        const result = await db.query(
            `UPDATE cattle SET 
                tag_number = COALESCE($1, tag_number),
                name = COALESCE($2, name),
                type = COALESCE($3, type),
                breed = COALESCE($4, breed),
                gender = COALESCE($5, gender),
                teeth = COALESCE($6, teeth),
                color = COALESCE($7, color),
                status = COALESCE($8, status),
                arrival_type = COALESCE($9, arrival_type),
                entry_date = COALESCE($10, entry_date),
                entry_weight = COALESCE($11, entry_weight),
                current_weight = COALESCE($12, current_weight),
                target_weight = COALESCE($13, target_weight),
                daily_target_gain = COALESCE($14, daily_target_gain),
                purchase_price = COALESCE($15, purchase_price),
                owner_name = COALESCE($16, owner_name),
                owner_mobile = COALESCE($17, owner_mobile),
                owner_email = COALESCE($18, owner_email),
                owner_address = COALESCE($19, owner_address),
                monthly_package_id = COALESCE($20, monthly_package_id),
                monthly_charges = COALESCE($21, monthly_charges),
                notes = COALESCE($22, notes),
                image_url = COALESCE($23, image_url),
                vaccination_status = COALESCE($24, vaccination_status),
                vaccination_history = COALESCE($25, vaccination_history),
                weight_history = COALESCE($26, weight_history),
                transactions = COALESCE($27, transactions),
                qurbani_details = COALESCE($28, qurbani_details),
                photos = COALESCE($29, photos),
                video_links = COALESCE($30, video_links),
                documents = COALESCE($31, documents),
                health_status = COALESCE($32, health_status),
                expected_calving_date = COALESCE($33, expected_calving_date),
                current_daily_milk_yield = COALESCE($34, current_daily_milk_yield),
                age_months = COALESCE($35, age_months),
                group_id = COALESCE($36, group_id),
                expected_conceiving_date = COALESCE($37, expected_conceiving_date),
                pregnancy_type = COALESCE($38, pregnancy_type),
                pregnancy_sire_embryo = COALESCE($39, pregnancy_sire_embryo),
                lactation_number = COALESCE($40, lactation_number),
                branch = COALESCE($41, branch),
                owner_whatsapp_number = COALESCE($42, owner_whatsapp_number),
                owner_whatsapp_apikey = COALESCE($43, owner_whatsapp_apikey),
                mother_tag = COALESCE($44, mother_tag),
                father_tag = COALESCE($45, father_tag)
            WHERE id = $46 AND tenant_id = $47
            RETURNING *`,
            [
                c.tagNumber || null, c.name || null, c.type || null, c.breed || null,
                c.gender || null, c.teeth !== undefined ? c.teeth : null, c.color || null,
                c.status || null, c.arrivalType || null, c.entryDate || null, c.entryWeight || null,
                c.currentWeight || null, c.targetWeight || null, c.dailyTargetGain || null,
                c.purchasePrice !== undefined ? c.purchasePrice : null,
                c.ownerName || null, c.ownerMobile || null, c.ownerEmail || null, c.ownerAddress || null,
                c.monthlyPackageId || null, c.monthlyCharges !== undefined ? c.monthlyCharges : null,
                c.notes !== undefined ? c.notes : null, c.imageUrl || null,
                c.vaccinationStatus !== undefined ? c.vaccinationStatus : null,
                c.vaccinationHistory ? JSON.stringify(c.vaccinationHistory) : null,
                c.weightHistory ? JSON.stringify(c.weightHistory) : null,
                c.transactions ? JSON.stringify(c.transactions) : null,
                c.qurbaniDetails ? JSON.stringify(c.qurbaniDetails) : null,
                c.photos ? JSON.stringify(c.photos) : null,
                c.videos ? JSON.stringify(c.videos) : null,
                c.documents ? JSON.stringify(c.documents) : null,
                c.healthStatus || null,
                c.expectedCalvingDate !== undefined ? c.expectedCalvingDate : null,
                c.currentDailyMilkYield !== undefined ? c.currentDailyMilkYield : null,
                c.ageMonths !== undefined ? c.ageMonths : null,
                c.groupId !== undefined ? (c.groupId || null) : null,
                c.expectedConceivingDate !== undefined ? c.expectedConceivingDate : null,
                c.pregnancyType !== undefined ? c.pregnancyType : null,
                c.pregnancySireOrEmbryo !== undefined ? c.pregnancySireOrEmbryo : null,
                c.lactationNumber !== undefined ? c.lactationNumber : null,
                c.branch !== undefined ? c.branch : null,
                c.ownerWhatsappNumber || null, c.ownerWhatsappApiKey || null,
                c.motherTag !== undefined ? c.motherTag : null,
                c.fatherTag !== undefined ? c.fatherTag : null,
                id, req.tenantId
            ]
        );

        const updatedCattle = result.rows[0];

        // Send invite if owner was added/changed to a new email
        if (c.ownerEmail && c.ownerName) {
            try {
                const existingUser = await db.query(
                    'SELECT id FROM users WHERE email = $1',
                    [c.ownerEmail.toLowerCase()]
                );

                if (existingUser.rows.length === 0) {
                    const tenantResult = await db.query(
                        'SELECT name FROM tenants WHERE id = $1::uuid',
                        [req.tenantId]
                    );
                    const farmName = tenantResult.rows[0]?.name || 'FarmXpert Farm';

                    const userResult = await db.query(
                        `INSERT INTO users (tenant_id, name, email, mobile, role, is_verified)
                         VALUES ($1::uuid, $2, $3, $4, 'ANIMAL_OWNER', true) RETURNING id`,
                        [req.tenantId, c.ownerName, c.ownerEmail.toLowerCase(), c.ownerMobile || null]
                    );
                    const newUser = userResult.rows[0];

                    const setupToken = generateRandomToken();
                    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                    await db.query(
                        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
                         VALUES ($1, $2, $3)`,
                        [newUser.id, setupToken, expiresAt]
                    );

                    const { sendAnimalOwnerWelcomeEmail } = require('../services/emailService');

                    await sendAnimalOwnerWelcomeEmail(
                        c.ownerEmail,
                        c.ownerName,
                        updatedCattle.tag_number,
                        farmName,
                        setupToken
                    );

                    if (c.ownerWhatsappNumber && c.ownerWhatsappApiKey) {
                        const { sendAnimalOwnerWelcomeWhatsApp } = require('../services/whatsappService');
                        await sendAnimalOwnerWelcomeWhatsApp(c.ownerWhatsappNumber, c.ownerWhatsappApiKey, c.ownerName, updatedCattle.tag_number, farmName);
                    }

                    console.log(`Animal owner account created for ${c.ownerEmail} on PUT, welcome email sent`);
                }
            } catch (emailErr) {
                console.error('Error creating animal owner account on update:', emailErr);
            }
        }

        // Send Push if Vaccination Status changed
        if (c.vaccinationStatus && updatedCattle.owner_email) {
            const { sendToEmail } = require('../services/notificationService');
            sendToEmail(
                updatedCattle.owner_email,
                `Vaccination Status - ${updatedCattle.tag_number}`,
                `Vaccination status updated to: ${updatedCattle.vaccination_status}`
            ).catch(e => console.error("Push failed", e));
        }

        // --- NEW: Breeding Module Integration for Updates ---
        if (c.isPregnant && (c.type?.toUpperCase() === 'COW' || c.type?.toUpperCase() === 'HEIFER' || c.gender?.toUpperCase() === 'FEMALE')) {
            try {
                // Check if an active cycle already exists
                const existingCycle = await db.query(`
                    SELECT id FROM pregnancy_cycles 
                    WHERE tenant_id = $1 AND animal_id = $2 AND status IN ('OPEN', 'CONFIRMED_PREGNANT')
                `, [req.tenantId, updatedCattle.id]);

                if (existingCycle.rows.length === 0) {
                    const expectedCalving = c.expectedCalvingDate || null;
                    let estimatedStart = null;
                    let finalExpectedCalving = expectedCalving;

                    if (c.expectedConceivingDate) {
                        estimatedStart = c.expectedConceivingDate;
                        if (!expectedCalving) {
                            const cDate = new Date(estimatedStart);
                            cDate.setDate(cDate.getDate() + 283);
                            finalExpectedCalving = cDate.toISOString().split('T')[0];
                        }
                    } else if (expectedCalving) {
                        const eDate = new Date(expectedCalving);
                        eDate.setDate(eDate.getDate() - 280);
                        estimatedStart = eDate.toISOString().split('T')[0];
                    } else {
                        estimatedStart = new Date().toISOString().split('T')[0];
                    }

                    // Create the Cycle
                    const cycleRes = await db.query(`
                        INSERT INTO pregnancy_cycles (
                            tenant_id, animal_id, cycle_start_date, status, expected_calving_date
                        ) VALUES ($1, $2, $3, 'CONFIRMED_PREGNANT', $4)
                        RETURNING id
                    `, [req.tenantId, updatedCattle.id, estimatedStart, finalExpectedCalving]);

                    // Create Base Event
                    const eventDate = new Date().toISOString().split('T')[0];
                    await db.query(`
                        INSERT INTO breeding_events (
                            tenant_id, animal_id, cycle_id, event_type, event_date, details
                        ) VALUES ($1, $2, $3, 'PREG_CHECK', $4, '{"result": "POSITIVE", "notes": "Auto-registered on animal update"}')
                    `, [req.tenantId, updatedCattle.id, cycleRes.rows[0].id, eventDate]);

                    console.log(`Auto-created pregnancy cycle on UPDATE for cow ${updatedCattle.id}`);
                }
            } catch (breedErr) {
                console.error('Failed to auto-create breeding records on update:', breedErr);
            }
        }

        // AUDIT LOG
        await logActivity(req.tenantId, req.user ? req.user.id : null, 'UPDATE', 'CATTLE', updatedCattle.id, {
            tagNumber: updatedCattle.tag_number,
            currentWeight: updatedCattle.current_weight,
            healthStatus: updatedCattle.health_status
        });

        res.json(mapCattleRow(updatedCattle));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update cattle' });
    }
});

// DELETE cattle
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Cascade delete from dependent tables first
        await db.query('DELETE FROM breeding_events WHERE tenant_id = $1 AND animal_id = $2', [req.tenantId, id]);
        await db.query('DELETE FROM pregnancy_cycles WHERE tenant_id = $1 AND animal_id = $2', [req.tenantId, id]);
        await db.query('DELETE FROM cattle_costs WHERE tenant_id = $1 AND cattle_id = $2', [req.tenantId, id]);
        await db.query('DELETE FROM milk_records WHERE tenant_id = $1 AND cattle_id = $2', [req.tenantId, id]).catch(() => console.log('No milk records table yet'));

        // Delete the main record
        await db.query('DELETE FROM cattle WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);

        // AUDIT LOG
        await logActivity(req.tenantId, req.user ? req.user.id : null, 'DELETE', 'CATTLE', id, {
            message: `Animal deleted from system`
        });

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete cattle' });
    }
});

const { sendAnimalReportEmail } = require('../services/emailService');

// =====================================================
// COST BREAKDOWN ENDPOINTS
// =====================================================

// POST add a cost to an animal
router.post('/:id/costs', async (req, res) => {
    const { id } = req.params;
    const { costType, amount, description, date } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO cattle_costs (tenant_id, cattle_id, cost_type, amount, description, date)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.tenantId, id, costType || 'OTHER', amount, description || '', date || new Date()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding cattle cost:', err);
        res.status(500).json({ error: 'Failed to add cattle cost' });
    }
});

// DELETE removing a cost from an animal
router.delete('/:id/costs/:costId', async (req, res) => {
    const { id, costId } = req.params;
    try {
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/i;

        if (uuidRegex.test(costId)) {
            // New database table cost mapping
            const result = await db.query(
                `DELETE FROM cattle_costs WHERE id = $1 AND cattle_id = $2 AND tenant_id = $3 RETURNING id`,
                [costId, id, req.tenantId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Cost not found or not authorized' });
            }
            res.json({ success: true });
        } else {
            // Legacy JSONB transaction handling
            const cattleRes = await db.query(
                `SELECT transactions FROM cattle WHERE id = $1 AND tenant_id = $2`,
                [id, req.tenantId]
            );

            if (cattleRes.rows.length === 0) {
                return res.status(404).json({ error: 'Animal not found' });
            }

            let txns = cattleRes.rows[0].transactions;
            if (typeof txns === 'string') txns = JSON.parse(txns);
            if (!Array.isArray(txns)) txns = [];

            const filteredTxns = txns.filter(t => t.id !== costId && String(t.id) !== String(costId));

            await db.query(
                `UPDATE cattle SET transactions = $1::jsonb WHERE id = $2 AND tenant_id = $3`,
                [JSON.stringify(filteredTxns), id, req.tenantId]
            );
            res.json({ success: true });
        }
    } catch (err) {
        console.error('Error deleting cattle cost:', err);
        res.status(500).json({ error: 'Failed to delete cattle cost' });
    }
});

// PUT bulk status update
router.put('/bulk/status', async (req, res) => {
    const { ids, status } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Cattle IDs are required' });
    }
    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        const result = await db.query(
            'UPDATE cattle SET status = $1 WHERE id = ANY($2::uuid[]) AND tenant_id = $3::uuid RETURNING *',
            [status, ids, req.tenantId]
        );
        res.json({ success: true, count: result.rowCount });
    } catch (err) {
        console.error('Bulk status update error:', err);
        res.status(500).json({ error: 'Failed to update cattle status in bulk' });
    }
});

// PUT bulk package update
router.put('/bulk/package', async (req, res) => {
    const { ids, packageId, monthlyCharges } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Cattle IDs are required' });
    }

    try {
        const result = await db.query(
            'UPDATE cattle SET monthly_package_id = $1::uuid, monthly_charges = $2 WHERE id = ANY($3::uuid[]) AND tenant_id = $4::uuid RETURNING *',
            [packageId || null, monthlyCharges || 0, ids, req.tenantId]
        );
        res.json({ success: true, count: result.rowCount });
    } catch (err) {
        console.error('Bulk package update error:', err);
        res.status(500).json({ error: 'Failed to update cattle package in bulk' });
    }
});

// DELETE bulk cattle
router.delete('/bulk', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Cattle IDs are required' });
    }

    try {
        // Delete related dependent data first to prevent constraint violations, assuming 'ON DELETE CASCADE' is missing
        await db.query('DELETE FROM cattle_costs WHERE cattle_id = ANY($1::uuid[]) AND tenant_id = $2::uuid', [ids, req.tenantId]);
        await db.query('DELETE FROM breeding_events WHERE animal_id = ANY($1::uuid[]) AND tenant_id = $2::uuid', [ids, req.tenantId]);

        const result = await db.query(
            'DELETE FROM cattle WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid RETURNING id',
            [ids, req.tenantId]
        );
        res.json({ success: true, count: result.rowCount });
    } catch (err) {
        console.error('Bulk delete error:', err);
        res.status(500).json({ error: 'Failed to delete cattle in bulk' });
    }
});

// GET cost breakdown for a specific animal
router.get('/:id/costs', async (req, res) => {
    const { id } = req.params;
    try {
        const cattleResult = await db.query(
            `SELECT c.*, fp.cost_per_day as feed_cost_per_day, fp.name as package_name
             FROM cattle c 
             LEFT JOIN feed_packages fp ON c.monthly_package_id = fp.id::uuid AND fp.tenant_id = $2::uuid
             WHERE c.id = $1::uuid AND c.tenant_id = $2::uuid`,
            [id, req.tenantId]
        );

        if (cattleResult.rows.length === 0) {
            return res.status(404).json({ error: 'Animal not found' });
        }

        const animal = cattleResult.rows[0];

        const costsResult = await db.query(
            `SELECT * FROM cattle_costs 
             WHERE cattle_id = $1::uuid AND tenant_id = $2::uuid 
             ORDER BY date DESC`,
            [id, req.tenantId]
        );

        const entryDate = new Date(animal.entry_date);
        let endDate = new Date();

        if (animal.status === 'Sold') {
            const transactions = animal.transactions || [];
            const saleTxn = transactions.find(t => t.type === 'SALE');
            if (saleTxn?.date) {
                endDate = new Date(saleTxn.date);
            }
        } else if (animal.status === 'Booked for Qurbani') {
            const qurbaniDetails = animal.qurbani_details;
            if (qurbaniDetails?.deliveryDate) {
                endDate = new Date(qurbaniDetails.deliveryDate);
            }
        }

        const daysOnFarm = Math.max(1, Math.floor((endDate - entryDate) / (1000 * 60 * 60 * 24)));
        const feedCostPerDay = parseFloat(animal.feed_cost_per_day) || 0;
        const totalFeedCost = feedCostPerDay * daysOnFarm;

        const costItems = costsResult.rows;
        const medicalCost = costItems.filter(c => c.cost_type === 'MEDICAL').reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const vaccinationCost = costItems.filter(c => c.cost_type === 'VACCINATION').reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const laborCost = costItems.filter(c => c.cost_type === 'LABOR').reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const otherCost = costItems.filter(c => c.cost_type === 'OTHER').reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const purchaseCost = parseFloat(animal.purchase_price) || 0;

        const grandTotal = purchaseCost + totalFeedCost + medicalCost + vaccinationCost + laborCost + otherCost;

        res.json({
            summary: {
                purchaseCost,
                feedCost: totalFeedCost,
                medicalCost,
                vaccinationCost,
                laborCost,
                otherCost,
                grandTotal,
                daysOnFarm,
                feedCostPerDay,
                packageName: animal.package_name
            },
            costItems: costItems.map(item => ({
                id: item.id,
                costType: item.cost_type,
                amount: parseFloat(item.amount),
                description: item.description,
                date: item.date,
                createdAt: item.created_at
            }))
        });
    } catch (err) {
        console.error('Cost breakdown error:', err);
        res.status(500).json({ error: 'Failed to fetch cost breakdown' });
    }
});

// POST add a cost entry for an animal
router.post('/:id/costs', async (req, res) => {
    const { id } = req.params;
    const { costType, amount, description, date } = req.body;

    if (!costType || !amount) {
        return res.status(400).json({ error: 'Cost type and amount are required' });
    }

    if (!['MEDICAL', 'VACCINATION', 'LABOR', 'OTHER', 'INCOME'].includes(costType)) {
        return res.status(400).json({ error: 'Invalid cost type' });
    }

    try {
        const cattleCheck = await db.query(
            'SELECT id FROM cattle WHERE id = $1::uuid AND tenant_id = $2::uuid',
            [id, req.tenantId]
        );

        if (cattleCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Animal not found' });
        }

        const result = await db.query(
            `INSERT INTO cattle_costs (tenant_id, cattle_id, cost_type, amount, description, date)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
             RETURNING *`,
            [req.tenantId, id, costType, amount, description || null, date || new Date().toISOString().split('T')[0]]
        );

        res.status(201).json({
            id: result.rows[0].id,
            costType: result.rows[0].cost_type,
            amount: parseFloat(result.rows[0].amount),
            description: result.rows[0].description,
            date: result.rows[0].date,
            createdAt: result.rows[0].created_at
        });

        // Send Push for Medical/Health Events
        if (costType === 'MEDICAL' || costType === 'VACCINATION') {
            const cattleRes = await db.query('SELECT owner_email, tag_number FROM cattle WHERE id = $1', [id]);
            const cattleData = cattleRes.rows[0];
            if (cattleData && cattleData.owner_email) {
                const { sendToEmail } = require('../services/notificationService');
                sendToEmail(
                    cattleData.owner_email,
                    `Health Update - ${cattleData.tag_number}`,
                    `New ${costType.toLowerCase()} record added: ${description || 'No description'}`
                ).catch(e => console.error("Push failed", e));
            }
        }
    } catch (err) {
        console.error('Add cost error:', err);
        res.status(500).json({ error: 'Failed to add cost entry' });
    }
});

// DELETE a cost entry
router.delete('/:cattleId/costs/:costId', async (req, res) => {
    const { cattleId, costId } = req.params;
    try {
        const result = await db.query(
            'DELETE FROM cattle_costs WHERE id = $1::uuid AND cattle_id = $2::uuid AND tenant_id = $3::uuid RETURNING id',
            [costId, cattleId, req.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cost entry not found' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Delete cost error:', err);
        res.status(500).json({ error: 'Failed to delete cost entry' });
    }
});

// POST send animal report email
router.post('/:id/send-report', async (req, res) => {
    const { id } = req.params;
    try {
        const cattleResult = await db.query(
            `SELECT c.*, p.name as package_name 
             FROM cattle c 
             LEFT JOIN feed_packages p ON c.monthly_package_id = p.id
             WHERE c.id = $1::uuid AND c.tenant_id = $2::uuid`,
            [id, req.tenantId]
        );

        if (cattleResult.rows.length === 0) {
            return res.status(404).json({ error: 'Animal not found' });
        }

        const animal = cattleResult.rows[0];

        if (!animal.owner_email) {
            return res.status(400).json({ error: 'Owner email not found for this animal' });
        }

        const reportData = {
            tagNumber: animal.tag_number,
            name: animal.name,
            breed: animal.breed,
            currentWeight: animal.current_weight,
            status: animal.status,
            vaccinationStatus: animal.vaccination_status,
            monthlyCharges: parseFloat(animal.monthly_charges) || 0,
            packageName: animal.package_name,
            weightHistory: animal.weight_history || [],
            vaccinationHistory: animal.vaccination_history || []
        };

        await sendAnimalReportEmail(animal.owner_email, animal.owner_name, reportData);

        if (animal.owner_whatsapp_number && animal.owner_whatsapp_apikey) {
            const { sendAnimalReportWhatsApp } = require('../services/whatsappService');
            await sendAnimalReportWhatsApp(animal.owner_whatsapp_number, animal.owner_whatsapp_apikey, animal.owner_name, reportData);
        }

        res.json({ message: 'Report sent successfully via email and WhatsApp (if configured).' });
    } catch (err) {
        console.error('Email error:', err);
        res.status(500).json({ error: 'Failed to send report email' });
    }
});

// POST add medical record (Vaccination/Treatment) linked to inventory
router.post('/:id/medical-record', async (req, res) => {
    const { id } = req.params;
    const { medicalItemId, date, notes, dose = 1 } = req.body; // dose is quantity to deduct

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Check and deduct inventory
        if (medicalItemId) {
            const inventoryCheck = await client.query(
                'SELECT * FROM medical_inventory WHERE id = $1 AND tenant_id = $2',
                [medicalItemId, req.tenantId]
            );

            if (inventoryCheck.rows.length === 0) {
                throw new Error('Medical item not found');
            }

            const item = inventoryCheck.rows[0];
            if (item.quantity < dose) {
                throw new Error(`Insufficient stock. Available: ${item.quantity} ${item.unit}`);
            }

            // Deduct stock
            await client.query(
                'UPDATE medical_inventory SET quantity = quantity - $1 WHERE id = $2',
                [dose, medicalItemId]
            );

            // If quantity reaches 0, maybe update status? 
            // Letting it stay ACTIVE with 0 qty for now, front end handles display.
        }

        // 2. Add to cattle history
        // Construct the record object. 
        // We'll append this to the vaccination_history JSONB array.
        // We need the item name for the record if we used an inventory item
        let recordName = 'Unknown Treatment';
        let batchNum = null;
        let itemRes = null;

        if (medicalItemId) {
            itemRes = await client.query('SELECT name, batch_number, type FROM medical_inventory WHERE id = $1', [medicalItemId]);
            if (itemRes.rows.length > 0) {
                recordName = itemRes.rows[0].name;
                batchNum = itemRes.rows[0].batch_number;
                // If it's a VACCINE, we mark as VACCINE, else MEDICINE (or whatever the item type is)
                // We'll map 'MEDICINE' to 'MEDICAL_RECORD' or keep as is?
                // Let's use the item type directly if it's VACCINE or MEDICINE.
                // But for frontend compatibility with existing VaccinationRecord type which has 'VACCINE' | 'MEDICAL_RECORD',
                // we might want to map. However, better to just save what it is.
                // I'll stick to saving generic 'MEDICAL_RECORD' for non-vaccines to match current frontend types, 
                // OR I updates frontend types. I'll update frontend types to be more flexible.
                // For now, let's use the item type.
            }
        }

        const recordType = (medicalItemId && itemRes?.rows[0]?.type) ? itemRes.rows[0].type : (req.body.type || 'MEDICAL_RECORD');

        const newRecord = {
            id: Date.now().toString(),
            date: date || new Date().toISOString(),
            vaccineName: recordName, // Using vaccineName field for compatibility
            batchNumber: batchNum,
            notes: notes || '',
            medicalItemId: medicalItemId, // Link back to inventory item
            type: recordType
        };

        // Update cattle record
        // We assume vaccination_history is a JSONB column.
        // We also act as if it's a vaccination for the status flag if needed.
        const updateCattle = await client.query(
            `UPDATE cattle 
             SET vaccination_history = COALESCE(vaccination_history, '[]'::jsonb) || $1::jsonb,
                 vaccination_status = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND tenant_id = $3
             RETURNING *`,
            [JSON.stringify(newRecord), id, req.tenantId]
        );

        await client.query('COMMIT');

        const row = updateCattle.rows[0];
        console.log('Row form DB:', row);
        const responseData = {
            ...row,
            vaccinationHistory: row.vaccination_history || [],
            weightHistory: row.weight_history || [],
            vaccinationStatus: row.vaccination_status
        };
        console.log('Sending response:', responseData);
        res.json(responseData);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Transactions Link Error:', err);
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET daily feed cost timeline for an animal
router.get('/:id/feed-cost-timeline', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `SELECT log_date as date, daily_cost as "dailyCost" 
             FROM animal_feed_cost_logs 
             WHERE animal_id = $1::uuid AND tenant_id = $2
             ORDER BY log_date ASC`,
            [id, req.tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Timeline fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch timeline' });
    }
});

// GET /api/cattle/:id/financial-summary — purchase, feed cost, market value, ROI
router.get('/:id/financial-summary', async (req, res) => {
    const { id } = req.params;
    try {
        const animalRes = await db.query(
            `SELECT purchase_price, current_weight, entry_weight 
             FROM cattle WHERE id = $1::uuid AND tenant_id = $2`,
            [id, req.tenantId]
        );
        if (animalRes.rows.length === 0) return res.status(404).json({ error: 'Animal not found' });
        const animal = animalRes.rows[0];

        // Total feed cost from cost log
        const feedRes = await db.query(
            `SELECT COALESCE(SUM(daily_cost), 0) as total_feed_cost 
             FROM animal_feed_cost_logs WHERE animal_id = $1::uuid AND tenant_id = $2`,
            [id, req.tenantId]
        );

        // Additional cattle costs (vet visits, misc)
        const costsRes = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_other_costs 
             FROM cattle_costs WHERE cattle_id = $1::uuid AND tenant_id = $2`,
            [id, req.tenantId]
        );

        const purchasePrice = parseFloat(animal.purchase_price) || 0;
        const totalFeedCost = parseFloat(feedRes.rows[0].total_feed_cost) || 0;
        const totalOtherCosts = parseFloat(costsRes.rows[0]?.total_other_costs) || 0;
        const totalInvestment = purchasePrice + totalFeedCost + totalOtherCosts;

        // Market value estimate: current weight × PKR 450/kg (standard live weight rate)
        const currentWeight = parseFloat(animal.current_weight) || parseFloat(animal.entry_weight) || 0;
        const marketRatePerKg = 450;
        const estimatedMarketValue = currentWeight * marketRatePerKg;

        const netRoi = estimatedMarketValue - totalInvestment;
        const roiPercent = totalInvestment > 0 ? ((netRoi / totalInvestment) * 100).toFixed(1) : 0;

        res.json({
            purchasePrice,
            totalFeedCost,
            totalOtherCosts,
            totalInvestment,
            estimatedMarketValue,
            netRoi,
        roiPercent: parseFloat(String(roiPercent)),
            currentWeight,
            marketRatePerKg
        });
    } catch (err) {
        console.error('Financial summary error:', err);
        res.status(500).json({ error: 'Failed to fetch financial summary' });
    }
});

module.exports = router;