CREATE TABLE IF NOT EXISTS medical_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('MEDICINE', 'VACCINE')),
    name VARCHAR(255) NOT NULL,
    batch_number VARCHAR(100),
    manufacturer VARCHAR(255),
    quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL,
    cost_per_unit DECIMAL(10,2) DEFAULT 0,
    expiry_date DATE,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'ARCHIVED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_medical_tenant_id ON medical_inventory(tenant_id);
CREATE INDEX idx_medical_status ON medical_inventory(status);
CREATE INDEX idx_medical_type ON medical_inventory(type);
