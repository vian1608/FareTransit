-- ═══════════════════════════════════════════════════════════════
-- 008_email_deliveries_and_indexes.sql
-- Create email_deliveries table and indexes for Whop payment resolution & deduplication
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id VARCHAR(255) NOT NULL,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  email_type VARCHAR(50) NOT NULL DEFAULT 'booking_confirmation',
  recipient_email VARCHAR(255) NOT NULL,
  resend_message_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'delivered',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uk_email_deliveries_webhook_booking UNIQUE (webhook_id, booking_id)
);

-- Indexes for fast lookup by checkout ID and booking ID
CREATE INDEX IF NOT EXISTS idx_bookings_provider_checkout ON bookings(provider_checkout_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_checkout ON payments(provider_checkout_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_booking ON email_deliveries(booking_id);
