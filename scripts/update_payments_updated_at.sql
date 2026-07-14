-- Update script for payments table
-- Date: 2026-01-17
-- Description: Adds updated_at column for record tracking

ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
