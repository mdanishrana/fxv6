const db = require('./server/db');

(async () => {
    try {
        console.log('Fetching logs for known user tenant');
        // Retrieve tenant ID safely
        const tenants = await db.query('SELECT id FROM tenants LIMIT 1');
        const tenantId = tenants.rows[0].id;
        console.log('Using Tenant:', tenantId);

        const res = await db.query(
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
             LIMIT 10`,
            [tenantId]
        );
        console.log(JSON.stringify(res.rows, null, 2));

        const resCount = await db.query(
            `SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1`,
            [tenantId]
        );
        console.log('Count:', resCount.rows[0].count);

    } catch (err) {
        console.error('CRASH TRACE:', err);
    } finally {
        process.exit();
    }
})();
