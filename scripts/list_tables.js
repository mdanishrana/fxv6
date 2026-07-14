
const { Pool } = require('pg');
require('dotenv').config({ path: './production.env' }); // Try production.env first

async function listTables() {
    const config = {
        connectionString: process.env.DATABASE_URL,
        ssl: false // Assuming local dev or simple auth
    };

    // Fallback if env not loaded correctly
    if (!config.connectionString) {
        config.user = 'postgres';
        config.host = 'localhost';
        config.database = 'farmxpert_db'; // Guessing based on previous context
        config.password = 'password';
        config.port = 5432;
    }

    console.log('Connecting to:', config.connectionString ? 'Connection String' : config.database);

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
