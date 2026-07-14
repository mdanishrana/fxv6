-- FarmXpert Subscription Plans Setup Script
-- Run this on your VPS database

-- Drop old tables if they exist with wrong schema
DROP TABLE IF EXISTS plan_features CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- Create subscription_plans table with correct schema
CREATE TABLE subscription_plans (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    price_pkr DECIMAL(10,2),
    billing_period VARCHAR(20) DEFAULT '/month',
    description TEXT,
    is_custom BOOLEAN DEFAULT false,
    contact_email VARCHAR(255),
    is_popular BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    user_limit INTEGER DEFAULT 3,
    cattle_limit VARCHAR(50) DEFAULT 'Unlimited',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create plan_features table
CREATE TABLE plan_features (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE CASCADE,
    feature_text VARCHAR(255) NOT NULL,
    display_order INTEGER DEFAULT 0
);

-- Insert default plans
INSERT INTO subscription_plans (code, name, price_pkr, billing_period, is_custom, is_popular, display_order, user_limit, cattle_limit) VALUES
('BASIC', 'Basic', 5000, '/month', false, false, 1, 1, '50'),
('STANDARD', 'Standard', 12000, '/month', false, true, 2, 5, '200'),
('PREMIUM', 'Premium', 25000, '/month', false, false, 3, 999, 'Unlimited'),
('CUSTOM', 'Custom', NULL, '/month', true, false, 4, 999, 'Unlimited');

-- Update contact email for custom plan
UPDATE subscription_plans SET contact_email = 'Sales@farmxpert.pk' WHERE code = 'CUSTOM';

-- Insert features for Basic
INSERT INTO plan_features (plan_id, feature_text, display_order) VALUES
((SELECT id FROM subscription_plans WHERE code = 'BASIC'), 'Up to 50 cattle', 1),
((SELECT id FROM subscription_plans WHERE code = 'BASIC'), 'Basic weight tracking', 2),
((SELECT id FROM subscription_plans WHERE code = 'BASIC'), 'Feed inventory management', 3),
((SELECT id FROM subscription_plans WHERE code = 'BASIC'), 'Single user account', 4);

-- Insert features for Standard
INSERT INTO plan_features (plan_id, feature_text, display_order) VALUES
((SELECT id FROM subscription_plans WHERE code = 'STANDARD'), 'Up to 200 cattle', 1),
((SELECT id FROM subscription_plans WHERE code = 'STANDARD'), 'Advanced analytics', 2),
((SELECT id FROM subscription_plans WHERE code = 'STANDARD'), 'Feed optimizer', 3),
((SELECT id FROM subscription_plans WHERE code = 'STANDARD'), 'Up to 5 team members', 4),
((SELECT id FROM subscription_plans WHERE code = 'STANDARD'), 'Email support', 5);

-- Insert features for Premium
INSERT INTO plan_features (plan_id, feature_text, display_order) VALUES
((SELECT id FROM subscription_plans WHERE code = 'PREMIUM'), 'Unlimited cattle', 1),
((SELECT id FROM subscription_plans WHERE code = 'PREMIUM'), 'AI-powered advisor', 2),
((SELECT id FROM subscription_plans WHERE code = 'PREMIUM'), 'Qurbani sales tracking', 3),
((SELECT id FROM subscription_plans WHERE code = 'PREMIUM'), 'Finance module', 4),
((SELECT id FROM subscription_plans WHERE code = 'PREMIUM'), 'Unlimited team members', 5),
((SELECT id FROM subscription_plans WHERE code = 'PREMIUM'), 'Priority support', 6);

-- Insert features for Custom
INSERT INTO plan_features (plan_id, feature_text, display_order) VALUES
((SELECT id FROM subscription_plans WHERE code = 'CUSTOM'), 'All Premium features', 1),
((SELECT id FROM subscription_plans WHERE code = 'CUSTOM'), 'Custom integrations', 2),
((SELECT id FROM subscription_plans WHERE code = 'CUSTOM'), 'Dedicated support', 3),
((SELECT id FROM subscription_plans WHERE code = 'CUSTOM'), 'On-premise option', 4);

-- Verify the setup
SELECT 'Plans created:' as status, count(*) as count FROM subscription_plans;
SELECT 'Features created:' as status, count(*) as count FROM plan_features;
