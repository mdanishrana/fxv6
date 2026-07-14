async function up(client) {
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS medical_inventory (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL CHECK (type IN ('VACCINE', 'MEDICINE')),
        name VARCHAR(255) NOT NULL,
        batch_number VARCHAR(100),
        manufacturer VARCHAR(255),
        quantity NUMERIC(10, 2) DEFAULT 0,
        unit VARCHAR(50) NOT NULL DEFAULT 'doses',
        cost_per_unit NUMERIC(10, 2) DEFAULT 0,
        expiry_date DATE,
        status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'DEPLETED')),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add index for faster queries by tenant and type
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_medical_tenant_type ON medical_inventory(tenant_id, type);
    `);

    await client.query('COMMIT');
    console.log('Migration 006_create_medical_inventory executed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error executing migration 006:', error);
    throw error;
  }
}

module.exports = { up };
