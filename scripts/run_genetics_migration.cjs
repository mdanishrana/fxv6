const fs = require('fs');
const path = require('path');
const db = require('../server/db');

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, '../server/migrations/002_genetics_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Running migration...');
        await db.query(sql);
        console.log('Migration successful!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
