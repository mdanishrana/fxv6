const db = require('./db');

async function checkTable() {
    try {
        const res = await db.query("SELECT to_regclass('public.system_content')");
        if (res.rows[0].to_regclass) {
            console.log("Table 'system_content' EXISTS.");
            const count = await db.query("SELECT count(*) FROM system_content");
            console.log("Row count:", count.rows[0].count);
        } else {
            console.log("Table 'system_content' DOES NOT EXIST.");
        }
    } catch (err) {
        console.error("Error checking table:", err);
    } finally {
        // We can't exit cleanly if pool is used, but this is a one-off check
        process.exit();
    }
}

checkTable();
