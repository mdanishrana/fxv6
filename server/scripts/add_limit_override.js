const db = require('../db');

async function runMigration() {
    try {
        console.log('Starting migration to add cattle_limit_override...');
        
        await db.query(`
            ALTER TABLE tenant_subscriptions
            ADD COLUMN IF NOT EXISTS cattle_limit_override VARCHAR(50);
        `);
        
        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

runMigration();
