-- ═══════════════════════════════════════════════════════════════
-- 005_whop_and_webhook_fields.sql
-- Add Whop payment provider fields and webhook_events table for deduplication
-- ═══════════════════════════════════════════════════════════════

-- Bookings table updates
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_checkout_id VARCHAR(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Payments table updates
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_checkout_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255);

-- Webhook events table for idempotent event deduplication
CREATE TABLE IF NOT EXISTS webhook_events (
  id VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_payments_provider_checkout ON payments(provider_checkout_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment ON payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider, event_type);
