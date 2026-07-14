const { Pool } = require('pg');
require('dotenv').config();

const db = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function run() {
    try {
        console.log("Adding age_months column to farmxpert_db...");
        await db.query(`
      ALTER TABLE public.cattle
      ADD COLUMN IF NOT EXISTS age_months integer;
    `);
        console.log("Migration successful!");
    } catch (err) {
        console.error("Migration Error:", err);
    } finally {
        db.end();
    }
}

run();
