-- Migration 026: Comprehensive System Audit Logs Table

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_value JSONB DEFAULT NULL,
    new_value JSONB DEFAULT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    ip_address TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance and Query Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_booking_id ON audit_logs (booking_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);

COMMENT ON TABLE audit_logs IS 'Immutable append-only system audit log tracking all booking mutations, payment updates, authorizations, and ticketing events.';
