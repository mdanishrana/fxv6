const pool = require('../server/db');

async function checkCattleCosts() {
    try {
        console.log('Checking cattle_costs table...');
        const res = await pool.query('SELECT * FROM cattle_costs LIMIT 5');
        console.log('Row count:', res.rowCount);
        console.log('Rows:', res.rows);
    } catch (err) {
        console.error('Error querying cattle_costs:', err);
    } finally {
        pool.end();
    }
}

checkCattleCosts();
