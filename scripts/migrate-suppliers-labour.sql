-- Migration script for Supplier Management and Labour Management modules
-- Run this on your VPS database: psql -h localhost -U farmxpert_user -d farmxpert_db -f scripts/migrate-suppliers-labour.sql

-- =====================================================
-- SUPPLIER MANAGEMENT TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    category VARCHAR(100), -- e.g., 'Feed', 'Medicine', 'Equipment', 'Other'
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    purchase_date DATE NOT NULL,
    invoice_number VARCHAR(100),
    items JSONB DEFAULT '[]', -- Array of {name, quantity, unit, unitPrice, total}
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PARTIAL, PAID
    paid_amount DECIMAL(12,2) DEFAULT 0,
    payment_date DATE,
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- LABOUR MANAGEMENT TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    cnic VARCHAR(20), -- Pakistan National ID
    address TEXT,
    role VARCHAR(100), -- e.g., 'Farm Worker', 'Supervisor', 'Driver', 'Security'
    salary_type VARCHAR(20) DEFAULT 'MONTHLY', -- MONTHLY, DAILY, HOURLY
    salary_amount DECIMAL(12,2) DEFAULT 0,
    join_date DATE,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, TERMINATED
    emergency_contact VARCHAR(100),
    emergency_phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    status VARCHAR(20) DEFAULT 'PRESENT', -- PRESENT, ABSENT, HALF_DAY, LEAVE
    overtime_hours DECIMAL(4,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(worker_id, date)
);

CREATE TABLE IF NOT EXISTS wage_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    days_worked INTEGER DEFAULT 0,
    base_amount DECIMAL(12,2) NOT NULL,
    overtime_amount DECIMAL(12,2) DEFAULT 0,
    deductions DECIMAL(12,2) DEFAULT 0,
    bonus DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PAID
    payment_date DATE,
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_tenant ON supplier_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_purchases_supplier ON supplier_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_workers_tenant ON workers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant ON attendance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_worker ON attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_wage_payments_tenant ON wage_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wage_payments_worker ON wage_payments(worker_id);

-- Grant permissions
GRANT ALL ON suppliers TO farmxpert_user;
GRANT ALL ON supplier_purchases TO farmxpert_user;
GRANT ALL ON workers TO farmxpert_user;
GRANT ALL ON attendance TO farmxpert_user;
GRANT ALL ON wage_payments TO farmxpert_user;
