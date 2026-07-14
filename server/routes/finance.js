const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

// @route GET /api/finance/transactions
// @desc Get all general transactions for a tenant
router.get('/transactions', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const result = await pool.query(
            'SELECT * FROM general_transactions WHERE tenant_id = $1 ORDER BY date DESC, created_at DESC',
            [tenantId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching general transactions:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @route POST /api/finance/transactions
// @desc Create a new general transaction (income or expense)
router.post('/transactions', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { type, category, amount, date, source, description } = req.body;

        if (!type || !category || !amount) {
            return res.status(400).json({ error: 'Type, category, and amount are required' });
        }

        const result = await pool.query(
            `INSERT INTO general_transactions 
             (tenant_id, type, category, amount, date, source, description) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [tenantId, type, category, amount, date || new Date().toISOString().split('T')[0], source, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating general transaction:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @route DELETE /api/finance/transactions/:id
// @desc Delete a general transaction
router.delete('/transactions/:id', authMiddleware, async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM general_transactions WHERE id = $1 AND tenant_id = $2 RETURNING id',
            [id, tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found or not authorized' });
        }

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Error deleting general transaction:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
