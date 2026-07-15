
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use((req, res, next) => {
    req.tenantId = req.user.tenantId;
    next();
});

// Run once at startup — create table + add column if missing
(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS cattle_groups (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                color VARCHAR(20) DEFAULT '#10b981',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        // Add group_id column to cattle — safe to run repeatedly
        await db.query(`
            ALTER TABLE cattle ADD COLUMN IF NOT EXISTS group_id UUID
        `);
        console.log('[Groups] Table ready');
    } catch (err) {
        console.error('[Groups] Setup error (non-fatal):', err.message);
    }
})();

// GET /api/groups - list all groups with animal count
router.get('/', async (req, res) => {
    try {
        // Step 1: Get groups (always works)
        const groupsResult = await db.query(`
            SELECT * FROM cattle_groups
            WHERE tenant_id = $1
            ORDER BY name ASC
        `, [req.tenantId]);

        const groups = groupsResult.rows.map(g => ({ ...g, animal_count: 0 }));

        // Step 2: Try to get animal counts (only works if group_id column exists)
        try {
            const countResult = await db.query(`
                SELECT group_id, COUNT(id)::int as cnt
                FROM cattle
                WHERE tenant_id = $1 AND group_id IS NOT NULL AND UPPER(status) = 'ACTIVE'
                GROUP BY group_id
            `, [req.tenantId]);

            const countMap = {};
            countResult.rows.forEach(r => { countMap[r.group_id] = r.cnt; });
            groups.forEach(g => { g.animal_count = countMap[g.id] || 0; });
        } catch (_) {
            // group_id column not yet added — counts stay 0
        }

        res.json(groups);
    } catch (err) {
        console.error('Groups GET error:', err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /api/groups - create group
router.post('/', async (req, res) => {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });
    try {
        const result = await db.query(`
            INSERT INTO cattle_groups (tenant_id, name, description, color)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [req.tenantId, name, description || null, color || '#10b981']);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Groups POST error:', err);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// PUT /api/groups/:id - update group
router.put('/:id', async (req, res) => {
    const { name, description, color } = req.body;
    try {
        const result = await db.query(`
            UPDATE cattle_groups SET name=$1, description=$2, color=$3, updated_at=NOW()
            WHERE id=$4 AND tenant_id=$5 RETURNING *
        `, [name, description || null, color || '#10b981', req.params.id, req.tenantId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Group not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Groups PUT error:', err);
        res.status(500).json({ error: 'Failed to update group' });
    }
});

// DELETE /api/groups/:id - delete group (animals become ungrouped)
router.delete('/:id', async (req, res) => {
    try {
        await db.query(`DELETE FROM cattle_groups WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenantId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Groups DELETE error:', err);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// GET /api/groups/:id/animals - list animals in group
router.get('/:id/animals', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, tag_number, name, type, breed, status FROM cattle
            WHERE tenant_id=$1 AND group_id=$2 AND status='ACTIVE'
            ORDER BY tag_number ASC
        `, [req.tenantId, req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Groups animals error:', err);
        res.status(500).json({ error: 'Failed to fetch group animals' });
    }
});

module.exports = router;
