-- FarmXpert Database Setup Script for PostgreSQL
-- Run this script to create all tables and seed demo data
--
-- IMPORTANT: Run as postgres superuser first to create extension:
--   psql -U postgres -d farmxpert_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
-- Then run this script as the farmxpert_user:
--   psql -U farmxpert_user -d farmxpert_db -f setup-database.sql

-- Enable UUID extension (requires superuser - run separately if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255),
    owner_mobile VARCHAR(50),
    tier VARCHAR(20) DEFAULT 'BASIC' CHECK (tier IN ('BASIC', 'STANDARD', 'PREMIUM')),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TRIAL')),
    modules TEXT[] DEFAULT ARRAY['CORE'],
    locale VARCHAR(10) DEFAULT 'en-PK',
    currency VARCHAR(10) DEFAULT 'PKR',
    max_cattle INT DEFAULT 50,
    max_users INT DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    mobile VARCHAR(50),
    password_hash VARCHAR(255),
    role VARCHAR(20) DEFAULT 'LABOR' CHECK (role IN ('OWNER', 'MANAGER', 'LABOR', 'SAAS_ADMIN')),
    is_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sessions table for JWT tokens
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create email verification tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create feed_items table
CREATE TABLE IF NOT EXISTS feed_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    unit VARCHAR(50) DEFAULT 'kg',
    cost_per_kg DECIMAL(10,2) DEFAULT 0,
    stock_quantity DECIMAL(10,2) DEFAULT 0,
    min_stock_level DECIMAL(10,2) DEFAULT 0,
    protein_percentage DECIMAL(5,2) DEFAULT 0,
    energy_mcal DECIMAL(5,2) DEFAULT 0,
    fiber_percentage DECIMAL(5,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create feed_packages table
CREATE TABLE IF NOT EXISTS feed_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    target_animal_type VARCHAR(50),
    daily_quantity_kg DECIMAL(10,2) DEFAULT 0,
    daily_intake_percent DECIMAL(5,2) DEFAULT 2.5,
    cost_per_day DECIMAL(10,2) DEFAULT 0,
    ingredients JSONB DEFAULT '[]',
    items JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create cattle table
CREATE TABLE IF NOT EXISTS cattle (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    tag_number VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'Bull',
    breed VARCHAR(100),
    gender VARCHAR(20) DEFAULT 'Male',
    teeth INT DEFAULT 0,
    color VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Active',
    vaccination_status BOOLEAN DEFAULT false,
    arrival_type VARCHAR(50) DEFAULT 'Mandi Purchase',
    father_tag VARCHAR(50),
    mother_tag VARCHAR(50),
    entry_date DATE DEFAULT CURRENT_DATE,
    entry_weight DECIMAL(10,2) DEFAULT 0,
    current_weight DECIMAL(10,2) DEFAULT 0,
    target_weight DECIMAL(10,2) DEFAULT 0,
    daily_target_gain DECIMAL(5,2) DEFAULT 0,
    purchase_price DECIMAL(12,2) DEFAULT 0,
    owner_name VARCHAR(255) DEFAULT 'Farm Owned',
    owner_email VARCHAR(255),
    owner_mobile VARCHAR(50),
    owner_address TEXT,
    monthly_package_id UUID REFERENCES feed_packages(id) ON DELETE SET NULL,
    monthly_charges DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    image_url TEXT,
    weight_history JSONB DEFAULT '[]',
    vaccination_history JSONB DEFAULT '[]',
    transactions JSONB DEFAULT '[]',
    qurbani_details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create payments table for tracking monthly charges
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE INDEX IF NOT EXISTS idx_cattle_tenant ON cattle(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cattle_status ON cattle(status);
CREATE INDEX IF NOT EXISTS idx_cattle_tag ON cattle(tag_number);
CREATE INDEX IF NOT EXISTS idx_feed_items_tenant ON feed_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feed_packages_tenant ON feed_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);

-- Insert demo tenants
INSERT INTO tenants (id, name, owner_name, owner_email, tier, status, modules, locale, currency, max_cattle, max_users) VALUES
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Green Pastures Farm', 'Ali Khan', 'ali@greenpastures.pk', 'PREMIUM', 'ACTIVE', ARRAY['CORE', 'AI_ADVISOR', 'FEED_OPTIMIZER', 'QURBANI_TRACKING', 'FINANCE'], 'en-PK', 'PKR', 500, 20),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Sunny Dairy Farm', 'Omer Shah', 'omer@sunnydairy.pk', 'STANDARD', 'ACTIVE', ARRAY['CORE', 'FEED_OPTIMIZER'], 'en-PK', 'PKR', 200, 10),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Karachi Cattle Ranch', 'Ahmed Malik', 'ahmed@karachicattle.pk', 'BASIC', 'ACTIVE', ARRAY['CORE'], 'en-PK', 'PKR', 50, 3)
ON CONFLICT (id) DO NOTHING;

-- Insert SaaS Admin user (password: Admin@123)
INSERT INTO users (name, email, role, password_hash, is_verified) VALUES
    ('SaaS Admin', 'admin@farmxpert.pk', 'SAAS_ADMIN', '$2b$12$nxSGUuNjcrqtNU4vtooWzO2sf61NJ5hO4HKtseOfwXrRT/SE/zMmi', true)
ON CONFLICT (email) DO NOTHING;

-- Insert demo users
INSERT INTO users (tenant_id, name, email, role) VALUES
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Ali Khan', 'ali@greenpastures.pk', 'OWNER'),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Hassan Manager', 'hassan@greenpastures.pk', 'MANAGER'),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Bilal Worker', 'bilal@greenpastures.pk', 'LABOR'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Omer Shah', 'omer@sunnydairy.pk', 'OWNER'),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Kamran Manager', 'kamran@sunnydairy.pk', 'MANAGER'),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Ahmed Malik', 'ahmed@karachicattle.pk', 'OWNER')
ON CONFLICT DO NOTHING;

-- Insert demo feed items for Green Pastures Farm
INSERT INTO feed_items (tenant_id, name, category, unit, cost_per_kg, stock_quantity, min_stock_level, protein_percentage, energy_mcal, fiber_percentage) VALUES
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Wanda (Cotton Seed Cake)', 'Protein Feed', 'kg', 85.00, 5000, 500, 38.0, 2.8, 12.0),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Silage (Corn)', 'Roughage', 'kg', 12.00, 20000, 2000, 8.0, 2.2, 25.0),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Wheat Straw (Bhusa)', 'Roughage', 'kg', 8.00, 15000, 1500, 4.0, 1.5, 38.0),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Maize Grain', 'Energy Feed', 'kg', 65.00, 3000, 300, 9.0, 3.4, 2.5),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Molasses (Shira)', 'Energy Feed', 'kg', 35.00, 2000, 200, 3.0, 2.7, 0.0)
ON CONFLICT DO NOTHING;

-- Insert demo feed packages
INSERT INTO feed_packages (tenant_id, name, description, target_animal_type, daily_quantity_kg, cost_per_day, ingredients, is_active) VALUES
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Fattening Ration - Bulls', 'High energy feed for weight gain', 'Bull', 25.0, 450.00, '[{"name":"Wanda","qty":3},{"name":"Silage","qty":15},{"name":"Maize Grain","qty":5},{"name":"Molasses","qty":2}]', true),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'Maintenance Ration', 'Standard daily feed', 'Cow', 18.0, 280.00, '[{"name":"Silage","qty":10},{"name":"Wheat Straw","qty":5},{"name":"Wanda","qty":2},{"name":"Molasses","qty":1}]', true)
ON CONFLICT DO NOTHING;

-- Insert demo cattle for Green Pastures Farm
INSERT INTO cattle (tenant_id, tag_number, name, type, breed, gender, teeth, color, status, entry_date, entry_weight, current_weight, target_weight, daily_target_gain, purchase_price, weight_history, vaccination_history) VALUES
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'GP-001', 'Sultan', 'Bull', 'Sahiwal', 'Male', 4, 'Brown', 'Active', '2024-09-15', 280, 380, 500, 1.2, 180000, '[{"date":"2024-09-15","weight":280},{"date":"2024-10-15","weight":315},{"date":"2024-11-15","weight":350},{"date":"2024-12-01","weight":380}]', '[{"name":"FMD","date":"2024-09-20","nextDue":"2025-03-20"},{"name":"LSD","date":"2024-09-25","nextDue":"2025-09-25"}]'),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'GP-002', 'Rustam', 'Bull', 'Cholistani', 'Male', 6, 'Black', 'Active', '2024-08-01', 320, 420, 550, 1.0, 220000, '[{"date":"2024-08-01","weight":320},{"date":"2024-09-01","weight":355},{"date":"2024-10-01","weight":385},{"date":"2024-11-01","weight":405},{"date":"2024-12-01","weight":420}]', '[{"name":"FMD","date":"2024-08-10","nextDue":"2025-02-10"}]'),
    ('34b6c41f-019b-45ad-ac85-d558c00e66c2', 'GP-003', 'Bakra 1', 'Goat', 'Beetal', 'Male', 2, 'White', 'Active', '2024-10-01', 35, 48, 70, 0.15, 25000, '[{"date":"2024-10-01","weight":35},{"date":"2024-11-01","weight":42},{"date":"2024-12-01","weight":48}]', '[]')
ON CONFLICT DO NOTHING;

COMMIT;

-- Display summary
SELECT 'Database setup complete!' as status;
SELECT 'Tenants created: ' || COUNT(*) FROM tenants;
SELECT 'Users created: ' || COUNT(*) FROM users;
SELECT 'Feed items created: ' || COUNT(*) FROM feed_items;
SELECT 'Feed packages created: ' || COUNT(*) FROM feed_packages;
SELECT 'Cattle created: ' || COUNT(*) FROM cattle;
