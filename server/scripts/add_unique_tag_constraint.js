const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'farmxpert_db',
    password: process.env.DB_PASSWORD || 'Nova2183417',
    port: process.env.DB_PORT || 5432,
});

async function runMigration() {
    try {
        console.log('Connecting to database...');

        // First, let's identify any existing duplicates
        console.log('Checking for existing duplicate tag numbers...');
        const duplicateCheck = await pool.query(`
      SELECT tenant_id, tag_number, COUNT(*) 
      FROM cattle 
      GROUP BY tenant_id, tag_number 
      HAVING COUNT(*) > 1;
    `);

        if (duplicateCheck.rows.length > 0) {
            console.log(`Found ${duplicateCheck.rows.length} pairs of duplicated tags. Renaming them temporarily to auto-fix and unblock the constraint.`);

            // Auto resolve duplicates by appending a random suffix (-DUPE-1234)
            for (const row of duplicateCheck.rows) {
                const dupes = await pool.query(
                    'SELECT id FROM cattle WHERE tenant_id = $1 AND tag_number = $2 ORDER BY created_at ASC OFFSET 1',
                    [row.tenant_id, row.tag_number]
                );

                for (let i = 0; i < dupes.rows.length; i++) {
                    const newTag = `${row.tag_number}-D${Date.now().toString().slice(-4)}${i}`;
                    await pool.query('UPDATE cattle SET tag_number = $1 WHERE id = $2', [newTag, dupes.rows[i].id]);
                    console.log(`Renamed duplicate ${row.tag_number} -> ${newTag}`);
                }
            }
        }

        console.log('Adding UNIQUE constraint to cattle(tenant_id, tag_number)...');

        // Add the constraint safely
        await pool.query(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM pg_constraint 
                WHERE conname = 'cattle_tenant_id_tag_number_key'
            ) THEN
                ALTER TABLE cattle ADD CONSTRAINT cattle_tenant_id_tag_number_key UNIQUE (tenant_id, tag_number);
            END IF;
        END $$;
    `);

        console.log('Successfully added unique constraint!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
