const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use((req, res, next) => {
    req.tenantId = req.user.tenantId;
    next();
});

// --- SEMEN BANK ROUTES ---

// GET /api/genetics/semen
router.get('/semen', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM semen_bank WHERE tenant_id = $1 ORDER BY created_at DESC`,
            [req.tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch semen records' });
    }
});

// POST /api/genetics/semen
router.post('/semen', async (req, res) => {
    const { code, bullName, bull_name, breed, source, notes, status } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO semen_bank (tenant_id, code, bull_name, breed, source, notes, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [req.tenantId, code, bullName || bull_name, breed, source, notes, status || 'AVAILABLE']
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Code already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to create semen record' });
    }
});

// PUT /api/genetics/semen/:id
router.put('/semen/:id', async (req, res) => {
    const { code, bullName, bull_name, breed, source, notes, status } = req.body;
    try {
        const result = await db.query(
            `UPDATE semen_bank 
             SET code = $1, bull_name = $2, breed = $3, source = $4, notes = $5, status = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 AND tenant_id = $8
             RETURNING *`,
            [code, bullName || bull_name, breed, source, notes, status, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Code already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to update semen record' });
    }
});

// DELETE /api/genetics/semen/:id
router.delete('/semen/:id', async (req, res) => {
    try {
        const result = await db.query(
            `DELETE FROM semen_bank WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// --- EMBRYO BANK ROUTES ---

// GET /api/genetics/embryos
router.get('/embryos', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM embryo_bank WHERE tenant_id = $1 ORDER BY created_at DESC`,
            [req.tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch embryo records' });
    }
});

// POST /api/genetics/embryos
router.post('/embryos', async (req, res) => {
    const { code, bullName, bull_name, donorCow, donor_cow, breed, type, source, notes, status } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO embryo_bank (tenant_id, code, bull_name, donor_cow, breed, type, source, notes, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [req.tenantId, code, bullName || bull_name, donorCow || donor_cow, breed, type || 'FROZEN', source, notes, status || 'AVAILABLE']
        );
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Code already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to create embryo record' });
    }
});

// PUT /api/genetics/embryos/:id
router.put('/embryos/:id', async (req, res) => {
    const { code, bullName, bull_name, donorCow, donor_cow, breed, type, source, notes, status } = req.body;
    try {
        const result = await db.query(
            `UPDATE embryo_bank 
             SET code = $1, bull_name = $2, donor_cow = $3, breed = $4, type = $5, source = $6, notes = $7, status = $8, updated_at = CURRENT_TIMESTAMP
             WHERE id = $9 AND tenant_id = $10
             RETURNING *`,
            [code, bullName || bull_name, donorCow || donor_cow, breed, type, source, notes, status, req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Code already exists' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to update embryo record' });
    }
});

// DELETE /api/genetics/embryos/:id
router.delete('/embryos/:id', async (req, res) => {
    try {
        const result = await db.query(
            `DELETE FROM embryo_bank WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [req.params.id, req.tenantId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

module.exports = router;
