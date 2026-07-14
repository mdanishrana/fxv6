-- FarmXpert Payment Tracking Migration Script
-- Run this on existing VPS databases to add payment tracking feature
--
-- Usage:
--   psql -U farmxpert_user -d farmxpert_db -f migrate-payments.sql

-- Add monthly_charges column to cattle table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'cattle' AND column_name = 'monthly_charges'
    ) THEN
        ALTER TABLE cattle ADD COLUMN monthly_charges DECIMAL(12,2) DEFAULT 0;
        RAISE NOTICE 'Added monthly_charges column to cattle table';
    ELSE
        RAISE NOTICE 'monthly_charges column already exists';
    END IF;
END $$;

-- Create payments table (if not exists)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    cattle_id UUID REFERENCES cattle(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    due_date DATE NOT NULL,
    paid_date DATE,
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Overdue')),
    payment_method VARCHAR(50),
    notes TEXT,
    reminder_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_cattle ON payments(cattle_id);

-- Confirmation message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Payment tracking migration completed!';
    RAISE NOTICE '========================================';
END $$;
