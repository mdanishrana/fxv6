require('dotenv').config({ path: '/home/admind/farmxpert/server/.env' });
const { Client } = require('pg');

const dbConfig = {
    user: process.env.DB_USER || 'farmxpert_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'farmxpert_db',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
};

async function migrate() {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        console.log('Connected to DB');

        await client.query('BEGIN');

        // 1. Create Lactations Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS lactations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                animal_id UUID NOT NULL REFERENCES cattle(id) ON DELETE CASCADE,
                lactation_number INT NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                expected_breeding_date DATE,
                status VARCHAR(20) CHECK (status IN ('ACTIVE', 'ENDED')) DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Lactations table ready');

        // 2. Create Milk Logs Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS milk_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL,
                animal_id UUID NOT NULL REFERENCES cattle(id) ON DELETE CASCADE,
                lactation_id UUID REFERENCES lactations(id) ON DELETE SET NULL,
                log_date DATE NOT NULL,
                morning_yield DECIMAL(5,2) DEFAULT 0,
                evening_yield DECIMAL(5,2) DEFAULT 0,
                total_yield DECIMAL(5,2) GENERATED ALWAYS AS (morning_yield + evening_yield) STORED,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(tenant_id, animal_id, log_date)
            );
        `);
        console.log('Milk Logs table ready');

        await client.query('COMMIT');
        console.log('Migration Complete');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration Failed', e);
    } finally {
        await client.end();
    }
}

migrate();
