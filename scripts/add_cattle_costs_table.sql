-- =====================================================
-- Migration: Add cattle_costs table for cost breakdown tracking
-- Created: 2026-01-17
-- Description: Tracks individual costs (medical, vaccination, labor, other) per animal
-- =====================================================
--
-- USAGE:
--   psql -U farmxpert_user -d farmxpert_db -f scripts/add_cattle_costs_table.sql
--
-- =====================================================

-- Create cattle_costs table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cattle_costs_tenant ON cattle_costs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cattle_costs_cattle ON cattle_costs(cattle_id);
CREATE INDEX IF NOT EXISTS idx_cattle_costs_type ON cattle_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_cattle_costs_date ON cattle_costs(date);

-- Verification
SELECT 'cattle_costs table created successfully!' as status;
