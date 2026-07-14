-- Migration: Create Audit Logs Table
-- Phase 13: Security & Oversight

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Nullable for system automated tasks
    action_type VARCHAR(50) NOT NULL, -- e.g., 'CREATE', 'UPDATE', 'DELETE'
    entity_type VARCHAR(50) NOT NULL, -- e.g., 'CATTLE', 'TENANT', 'MEDICAL', 'FEED'
    entity_id UUID, -- ID of the actual record being mutated
    details JSONB, -- Stores "old state" vs "new state" or textual summary
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster chronological/tenant-based querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
