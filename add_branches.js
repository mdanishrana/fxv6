const db = require('./server/db');

async function migrate() {
    try {
        console.log("Adding branch to cattle...");
        await db.query(`ALTER TABLE cattle ADD COLUMN IF NOT EXISTS branch VARCHAR(255);`);
        console.log("Adding branches to tenants...");
        await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branches JSONB DEFAULT '[]'::jsonb;`);
        console.log("Migration successful.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

migrate();
