const db = require('./server/db');

(async () => {
    try {
        console.log('Testing the exact /api/logs query from routes/logs.js');

        // This query runs inside the backend when you are viewing ActivityLogs.tsx
        // If there's a JSON syntax error or casting problem here, this should throw it.
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
             ORDER BY a.created_at DESC
             LIMIT 10`
        );

        console.log('Logs returned:', res.rows.length);
        if (res.rows.length > 0) {
            console.log(res.rows[0]);
        }
    } catch (err) {
        console.error('SQL CRASH TRACE:', err);
    } finally {
        process.exit();
    }
})();
