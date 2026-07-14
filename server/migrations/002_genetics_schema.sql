CREATE TABLE IF NOT EXISTS semen_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    bull_name VARCHAR(100),
    breed VARCHAR(50),
    source VARCHAR(50), -- 'OWN', 'PURCHASED', 'EXTERNAL'
    notes TEXT,
    status VARCHAR(20) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'DEPLETED', 'ARCHIVED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS embryo_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL,
    bull_name VARCHAR(100), -- Sire
    donor_cow VARCHAR(100), -- Dam
    breed VARCHAR(50),
    type VARCHAR(20) DEFAULT 'FROZEN', -- 'FRESH', 'FROZEN'
    source VARCHAR(50),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'TRANSFERRED', 'ARCHIVED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, code)
);
