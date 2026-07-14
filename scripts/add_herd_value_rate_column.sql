-- =====================================================
-- Migration: Add herd_value_rate column to tenants table
-- Description: Adds the configuration field for Herd Value Rate (PKR/kg)
-- =====================================================

-- Add the column if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tenants'
        AND column_name = 'herd_value_rate'
    ) THEN
        ALTER TABLE tenants
        ADD COLUMN herd_value_rate NUMERIC DEFAULT 1100;
        
        RAISE NOTICE 'Added herd_value_rate column to tenants table successfully.';
    ELSE
        RAISE NOTICE 'Column herd_value_rate already exists in tenants table. Skipping addition.';
    END IF;
END $$;
