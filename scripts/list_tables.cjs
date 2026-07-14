
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load production.env explicitly
dotenv.config({ path: path.resolve('d:\\atg\\FX-Rep-V5\\production.env') });

async function listTables() {
    const config = {
        connectionString: process.env.DATABASE_URL
    };

    if (!config.connectionString) {
        console.error("DATABASE_URL is missing!");
        return;
    }

    // Force no SSL for local connection string loopback
    if (config.connectionString.includes('localhost') || config.connectionString.includes('127.0.0.1')) {
        config.ssl = false;
    }

    console.log('Connecting DB...');

    try {
        const pool = new Pool(config);
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

        console.log('--- EXISTING TABLES ---');
        res.rows.forEach(r => console.log(r.table_name));
        console.log('-----------------------');
        await pool.end();
    } catch (err) {
        console.error('Error listing tables:', err.message);
    }
}

listTables();
