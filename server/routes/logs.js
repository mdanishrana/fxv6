const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { logActivity } = require('../services/auditService');

// Require authentication for all log routes
router.use(authMiddleware);

/**
 * GET /api/logs
 * Fetches the audit trail for the authenticated user's farm (tenant).
 * Supports pagination (page, limit) and optional filtering.
 */
router.get('/', async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // Verify the user has rights to view logs (Only SaaS Admin, Owner, or Manager)
        if (req.user.role !== 'SAAS_ADMIN' && req.user.role !== 'OWNER' && req.user.role !== 'MANAGER') {
            return res.status(403).json({ error: 'You do not have permission to view audit logs.' });
        }

        // Fetch logs with user details joined
        const logsResult = await db.query(
            `SELECT 
                a.id, 
                a.action_type, 
                a.entity_type, 
                a.entity_id, 
                a.details, 
                a.created_at,
                u.name as user_name,
                u.email as user_email
             FROM audit_logs a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.tenant_id = $1
             ORDER BY a.created_at DESC
             LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset]
        );

        // Fetch total count for pagination math
        const countResult = await db.query(
            `SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1`,
            [tenantId]
        );

        const totalCount = parseInt(countResult.rows[0].count, 10);

        res.json({
            data: logsResult.rows,
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ error: 'Failed to retrieve activity logs.' });
    }
});

module.exports = router;
