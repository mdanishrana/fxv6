
const { Pool } = require('pg');

async function listTables() {
    // User provided password explicitly
    const connectionString = 'postgresql://farmxpert_user:Nova2183417@localhost:5432/farmxpert_db';

    console.log('Connecting to DB with provided credentials...');

    const config = {
        connectionString,
        ssl: false
    };

    try {
        const pool = new Pool(config);
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

        console.log('--- EXISTING TABLES ---');
        if (res.rows.length === 0) {
            console.log('(No tables found in public schema)');
        }
        res.rows.forEach(r => console.log(r.table_name));
        console.log('-----------------------');
        await pool.end();
    } catch (err) {
        console.error('Error listing tables:', err.message);
        // Provide a hint if auth fails
        if (err.message.includes('password authentication failed')) {
            console.error('The provided password "Nova2183417" was rejected by the local database.');
        }
    }
}

listTables();
