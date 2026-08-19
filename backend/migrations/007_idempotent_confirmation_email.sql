-- ═══════════════════════════════════════════════════════════════
-- 007_idempotent_confirmation_email.sql
-- Add confirmation email tracking fields for idempotent notification delivery
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_email_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_bookings_confirmation_email_sent ON bookings(confirmation_email_sent_at);
