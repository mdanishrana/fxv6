const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkTable() {
    try {
        const res = await pool.query("SELECT to_regclass('public.push_subscriptions');");
        console.log('Table push_subscriptions:', res.rows[0].to_regclass);
    } catch (err) {
        console.error('Error checking table:', err);
    } finally {
        pool.end();
    }
}

checkTable();
