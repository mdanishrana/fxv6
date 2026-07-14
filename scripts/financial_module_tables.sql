-- =====================================================
-- Migration: Add financial module tables
-- Description: Creates the general_transactions and cattle_costs tables for tracking farm finances
-- =====================================================

-- Table for tracking individual costs (medical, vaccination, labor, other) per animal
CREATE TABLE IF NOT EXISTS cattle_costs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cattle_id UUID NOT NULL REFERENCES cattle(id) ON DELETE CASCADE,
    cost_type VARCHAR(50) NOT NULL CHECK (cost_type IN ('MEDICAL', 'VACCINATION', 'LABOR', 'OTHER')),
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cattle_costs_tenant ON cattle_costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cattle_costs_cattle ON cattle_costs(cattle_id);
CREATE INDEX IF NOT EXISTS idx_cattle_costs_type ON cattle_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_cattle_costs_date ON cattle_costs(date);

-- Table for tracking farm-level transactions not tied to specific cattle or suppliers
CREATE TABLE IF NOT EXISTS general_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    source VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gen_trans_tenant ON general_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gen_trans_date ON general_transactions(date);
CREATE INDEX IF NOT EXISTS idx_gen_trans_type ON general_transactions(type);

-- Table for tracking supplier purchases
CREATE TABLE IF NOT EXISTS supplier_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    supplier_name VARCHAR(100) NOT NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    items JSONB NOT NULL DEFAULT '[]',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PAID', 'PARTIAL', 'PENDING')),
    paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_date DATE,
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supp_purchases_tenant ON supplier_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supp_purchases_supplier ON supplier_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supp_purchases_date ON supplier_purchases(purchase_date);
