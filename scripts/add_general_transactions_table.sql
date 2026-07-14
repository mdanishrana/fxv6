// =====================================================
// Migration: Add general_transactions table for miscellaneous income/expenses
// Created: 2026-02-21
// Description: Tracks farm-level transactions not tied to specific cattle or suppliers
// =====================================================
//
// USAGE:
//   psql -U farmxpert_user -d farmxpert_db -f scripts/add_general_transactions_table.sql
//
// =====================================================

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

SELECT 'general_transactions table created successfully!' as status;
