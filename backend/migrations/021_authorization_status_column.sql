-- Migration 021: Add authorization_status and authorized_at columns to bookings
-- These columns are separate from the `status` field to avoid check constraint conflicts.
-- authorization_status tracks the passenger's explicit authorization decision independently.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS authorization_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ DEFAULT NULL;

-- Index for admin queries filtering by authorization status
CREATE INDEX IF NOT EXISTS idx_bookings_authorization_status
  ON bookings (authorization_status)
  WHERE authorization_status IS NOT NULL;

-- Backfill: if status is AUTHORIZED (or later) and authorization_status not yet set
UPDATE bookings
SET authorization_status = 'AUTHORIZED'
WHERE status IN ('AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE')
  AND authorization_status IS NULL;

COMMENT ON COLUMN bookings.authorization_status IS
  'Explicit passenger authorization decision: AUTHORIZED, PENDING, REVOKED. Separate from status to avoid check constraint conflicts.';

COMMENT ON COLUMN bookings.authorized_at IS
  'UTC timestamp when the passenger completed the authorization flow.';
