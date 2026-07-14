CREATE TABLE IF NOT EXISTS lactations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    animal_id UUID NOT NULL REFERENCES cattle(id),
    lactation_number INTEGER NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    total_milk_yield DECIMAL(10,2) DEFAULT 0,
    peak_yield DECIMAL(10,2),
    days_in_milk INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS milk_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    animal_id UUID NOT NULL REFERENCES cattle(id),
    lactation_id UUID REFERENCES lactations(id),
    log_date TIMESTAMP WITH TIME ZONE NOT NULL,
    morning_yield DECIMAL(8,2) DEFAULT 0,
    evening_yield DECIMAL(8,2) DEFAULT 0,
    total_yield DECIMAL(8,2) GENERATED ALWAYS AS (morning_yield + evening_yield) STORED,
    fat_percentage DECIMAL(4,2),
    snf_percentage DECIMAL(4,2),
    recording_type VARCHAR(20) DEFAULT 'MANUAL',
    recorded_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
