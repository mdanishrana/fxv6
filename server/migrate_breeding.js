const db = require('./db');

async function migrate() {
    try {
        console.log('Starting DB migration for Dairy & Reproduction module...');
        
        await db.query(`
            ALTER TABLE cattle
            ADD COLUMN IF NOT EXISTS expected_conceiving_date DATE,
            ADD COLUMN IF NOT EXISTS pregnancy_type VARCHAR(50),
            ADD COLUMN IF NOT EXISTS pregnancy_sire_embryo VARCHAR(100),
            ADD COLUMN IF NOT EXISTS lactation_number INTEGER
        `);

        console.log('Migration successful: Added enhanced breeding columns to cattle table.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
