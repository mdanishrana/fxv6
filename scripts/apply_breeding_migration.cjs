
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const connectionString = 'postgresql://farmxpert_user:Nova2183417@localhost:5432/farmxpert_db';
    console.log('Connecting to DB...');

    const pool = new Pool({
        connectionString,
        ssl: false
    });

    try {
        const sqlPath = path.resolve(__dirname, '../server/db/migrations/001_breeding_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Applying migration...');
        await pool.query(sql);
        console.log('Migration applied successfully.');

    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

runMigration();
