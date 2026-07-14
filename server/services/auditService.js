const db = require('../db');

/**
 * Logs an activity into the audit_logs table.
 * 
 * @param {string} tenantId - The UUID of the farm/tenant
 * @param {string} userId - The UUID of the user who performed the action (nullable)
 * @param {string} actionType - 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', etc.
 * @param {string} entityType - The category of the modified resource ('CATTLE', 'TENANT', 'FINANCE', etc.)
 * @param {string} entityId - The UUID of the exact record that was modified
 * @param {Object} details - Flexible JSON object carrying old/new states, or textual human readable messages
 */
const logActivity = async (tenantId, userId, actionType, entityType, entityId, details = {}) => {
    try {
        if (!tenantId) {
            console.warn('Audit Service: tenantId is required to log an activity.');
            return;
        }

        // Must be a valid UUID or strictly null to satisfy PostgreSQL foreign key constraints
        const validUserId = (userId && typeof userId === 'string' && userId.length === 36) ? userId : null;

        await db.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action_type, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tenantId, validUserId, actionType, entityType, entityId, JSON.stringify(details)]
        );

        console.log(`[AUDIT] Tenant: ${tenantId}, Action: ${actionType} on ${entityType} (${entityId}) captured.`);
    } catch (err) {
        // We log the error but don't throw it. We don't want a non-critical audit log failure 
        // to crash the main user transaction or HTTP response.
        console.error('Audit Service Error - Failed to log activity:', err.message);
    }
};

module.exports = {
    logActivity
};
