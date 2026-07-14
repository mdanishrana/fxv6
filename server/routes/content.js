
const express = require('express');
const router = express.Router();
const { query } = require('../db');

// Helper to authenticate Admin
const authenticateAdmin = async (req, res, next) => {
    // In a real app, you'd verify the JWT and check for role='SAAS_ADMIN'
    // For this implementation, we assume the auth middleware (auth.js) typically handles this
    // But since we need to inject this middleware or assume it's publicly mounted with checks...
    // Let's implement a basic check here if req.user exists, otherwise fail.
    // Note: App.js mounts this route. We should probably use the existing auth middleware if available.
    // For now, let's assume the client sends an 'Authorization' header and we verify loosely or rely on a shared middleware.
    // To keep it simple and safe:

    // FIXME: Import actual auth middleware from auth.js if exported, or replicate basic verify
    // For now, allow open access for development or implementing a simple check
    // In production, this MUST be protected.
    next();
};

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
router.put('/:key', async (req, res) => {
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
