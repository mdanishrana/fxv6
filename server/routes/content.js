
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET content by key
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await query('SELECT content FROM system_content WHERE key = $1', [key]);

        if (result.rows.length > 0) {
            res.json(result.rows[0].content);
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (err) {
        console.error('Error fetching content:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT content (Admin only)
router.put('/:key', authMiddleware, requireRole('SAAS_ADMIN'), async (req, res) => {
    try {
        const { key } = req.params;
        const content = req.body;
        // content should be a JSON object

        const result = await query(`
      INSERT INTO system_content (key, content, updated_at, updated_by)
      VALUES ($1, $2, NOW(), 'ADMIN')
      ON CONFLICT (key) 
      DO UPDATE SET content = $2, updated_at = NOW(), updated_by = 'ADMIN'
      RETURNING *;
    `, [key, content]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating content:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
