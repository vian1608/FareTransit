-- Migration 024: Immutable Authorization Snapshots Table

CREATE TABLE IF NOT EXISTS authorization_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    snapshot_data JSONB NOT NULL,
    consent_hash TEXT NOT NULL,
    client_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning fast compliance lookup
CREATE INDEX IF NOT EXISTS idx_authorization_snapshots_booking_id ON authorization_snapshots (booking_id);
CREATE INDEX IF NOT EXISTS idx_authorization_snapshots_token ON authorization_snapshots (token);

-- Ensure column exists on passenger_authorizations as well
ALTER TABLE passenger_authorizations
    ADD COLUMN IF NOT EXISTS authorization_snapshot JSONB DEFAULT NULL;

COMMENT ON TABLE authorization_snapshots IS 'Immutable, frozen legal consent records captured at customer authorization completion.';
