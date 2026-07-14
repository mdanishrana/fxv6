import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running migration: 006_create_medical_inventory.js');
        const migrationPath = path.join(__dirname, 'migrations', '006_create_medical_inventory.js');
        const migrationUrl = pathToFileURL(migrationPath).href;
        const migration = await import(migrationUrl);
        await migration.default.up(client);
        console.log('Migration completed.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
