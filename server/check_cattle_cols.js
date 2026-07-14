const db = require('./db');

async function checkColumns() {
    try {
        const res = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'cattle' 
            AND (column_name LIKE '%mother%' OR column_name LIKE '%dam%' OR column_name LIKE '%parent%' OR column_name LIKE '%id%')
        `);
        console.log(res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkColumns();
