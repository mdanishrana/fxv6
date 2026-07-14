-- Migration: Add SaaS Subscription Management Tables
-- Run this script on your VPS PostgreSQL database to add subscription tracking

-- Create tenant_subscriptions table
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES subscription_plans(id),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED', 'SUSPENDED')),
    billing_cycle VARCHAR(20) DEFAULT 'MONTHLY' CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'PKR',
    start_date DATE DEFAULT CURRENT_DATE,
    trial_end_date DATE,
    next_billing_date DATE,
    last_payment_date DATE,
    cancelled_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- Create subscription_invoices table
CREATE TABLE IF NOT EXISTS subscription_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'PKR',
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED')),
    due_date DATE NOT NULL,
    paid_date DATE,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    notes TEXT,
    billing_period_start DATE,
    billing_period_end DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON subscription_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON subscription_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON subscription_invoices(due_date);

-- Grant permissions to farmxpert_user
GRANT ALL PRIVILEGES ON tenant_subscriptions TO farmxpert_user;
GRANT ALL PRIVILEGES ON subscription_invoices TO farmxpert_user;

-- Verify tables were created
SELECT 'tenant_subscriptions' as table_name, COUNT(*) as row_count FROM tenant_subscriptions
UNION ALL
SELECT 'subscription_invoices', COUNT(*) FROM subscription_invoices;

COMMENT ON TABLE tenant_subscriptions IS 'Tracks SaaS subscription details for each tenant/farm';
COMMENT ON TABLE subscription_invoices IS 'Stores all subscription invoices with payment tracking';
