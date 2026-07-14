-- Create SaaS Admin User for FarmXpert
-- This user can manage all tenants/farms

-- First, ensure SAAS_ADMIN role is allowed in the constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('OWNER', 'MANAGER', 'LABOR', 'SAAS_ADMIN'));

-- Insert admin user (no tenant_id since admin manages all)
INSERT INTO users (id, tenant_id, name, email, mobile, role, password_hash, is_verified)
VALUES (
    gen_random_uuid(),
    NULL,
    'SaaS Admin',
    'admin@farmxpert.pk',
    '0300-0000000',
    'SAAS_ADMIN',
    '$2b$12$nxSGUuNjcrqtNU4vtooWzO2sf61NJ5hO4HKtseOfwXrRT/SE/zMmi',  -- Password: Admin@123
    true
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = '$2b$12$nxSGUuNjcrqtNU4vtooWzO2sf61NJ5hO4HKtseOfwXrRT/SE/zMmi',
    role = 'SAAS_ADMIN',
    is_verified = true;

-- Confirmation
DO $$ 
BEGIN
    RAISE NOTICE 'SaaS Admin created successfully!';
    RAISE NOTICE 'Email: admin@farmxpert.pk';
    RAISE NOTICE 'Password: Admin@123';
END $$;
