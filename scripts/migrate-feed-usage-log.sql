-- Migration: Create feed_usage_log table for tracking daily feed consumption
-- This table stores records of feed deductions based on animal weight and package assignments

CREATE TABLE IF NOT EXISTS feed_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_animals INTEGER DEFAULT 0,
    total_weight_kg DECIMAL(12, 2) DEFAULT 0,
    total_feed_consumed_kg DECIMAL(12, 2) DEFAULT 0,
    breakdown JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_feed_usage_tenant_date ON feed_usage_log(tenant_id, date);

-- Verify the table was created
SELECT table_name FROM information_schema.tables WHERE table_name = 'feed_usage_log';
