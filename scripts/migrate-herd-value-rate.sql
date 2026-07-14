-- Migration: Add herd_value_rate column to tenants table
-- This allows farm owners to set a custom per-kg rate for herd value calculation

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS herd_value_rate DECIMAL(10, 2) DEFAULT 1100;

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'tenants' AND column_name = 'herd_value_rate';
