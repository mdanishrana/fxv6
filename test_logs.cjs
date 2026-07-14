const db = require('./server/db');

(async () => {
    try {
        console.log('Querying audit_logs table...');

        // 1. Check if there's a null violation causing JSON serialization issues
        const logs = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5');
        console.log('Recent Logs:', JSON.stringify(logs.rows, null, 2));

        // 2. Test the exact SQL query used by /api/logs to see if the JOIN fails
        const joinQuery = await db.query(`
            SELECT 
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
             ORDER BY a.created_at DESC
             LIMIT 5
        `);
        console.log('Joined Query Result:', JSON.stringify(joinQuery.rows, null, 2));

    } catch (err) {
        console.error('DATABASE ERROR:', err);
    } finally {
        process.exit();
    }
})();
