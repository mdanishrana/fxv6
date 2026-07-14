-- Create Lactations Table if not exists
CREATE TABLE IF NOT EXISTS lactations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    animal_id UUID NOT NULL, -- Constraint optional for now to avoid dependency issues during migration
    lactation_number INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    expected_breeding_date DATE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create Milk Logs Table if not exists
CREATE TABLE IF NOT EXISTS milk_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    animal_id UUID NOT NULL,
    lactation_id UUID,
    log_date DATE NOT NULL,
    morning_yield DECIMAL(5,2) DEFAULT 0,
    evening_yield DECIMAL(5,2) DEFAULT 0,
    total_yield DECIMAL(5,2) GENERATED ALWAYS AS (morning_yield + evening_yield) STORED,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, animal_id, log_date)
);

-- Add Columns if they don't exist (Idempotent)
ALTER TABLE lactations ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE lactations ADD COLUMN IF NOT EXISTS end_reason TEXT;
ALTER TABLE lactations ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
