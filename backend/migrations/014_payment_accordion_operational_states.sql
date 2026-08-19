-- ═══════════════════════════════════════════════════════════════
-- 014_payment_accordion_operational_states.sql
-- Payment Accordion 5 Operational States, Audit Table & Email Tracking Schema
-- ═══════════════════════════════════════════════════════════════

-- 1. Add email status tracking columns to bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS booking_request_email_status VARCHAR(30) DEFAULT 'NOT_SENT',
ADD COLUMN IF NOT EXISTS booking_request_email_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS booking_request_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS booking_request_email_recipient VARCHAR(255),
ADD COLUMN IF NOT EXISTS booking_request_email_error TEXT,

ADD COLUMN IF NOT EXISTS authorization_email_status VARCHAR(30) DEFAULT 'NOT_SENT',
ADD COLUMN IF NOT EXISTS authorization_email_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS authorization_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS authorization_email_recipient VARCHAR(255),
ADD COLUMN IF NOT EXISTS authorization_email_error TEXT,
ADD COLUMN IF NOT EXISTS authorization_expires_at TIMESTAMPTZ,

ADD COLUMN IF NOT EXISTS final_confirmation_email_status VARCHAR(30) DEFAULT 'NOT_SENT',
ADD COLUMN IF NOT EXISTS final_confirmation_email_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS final_confirmation_email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS final_confirmation_email_recipient VARCHAR(255),
ADD COLUMN IF NOT EXISTS final_confirmation_email_error TEXT;

-- 2. Add refund & operational payment columns to payments table
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS refund_reference_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS refund_reason TEXT,
ADD COLUMN IF NOT EXISTS refund_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS override_reason TEXT,
ADD COLUMN IF NOT EXISTS is_override BOOLEAN DEFAULT FALSE;

-- 3. Update payment_status check constraint to 5 canonical operational values
ALTER TABLE payments
DROP CONSTRAINT IF EXISTS payments_payment_status_check;

ALTER TABLE payments
ADD CONSTRAINT payments_payment_status_check
CHECK (
  payment_status IN (
    'PENDING',
    'PROCESSING',
    'PAID',
    'FAILED',
    'REFUNDED'
  )
);

-- 4. Create booking_payment_audits table for tracking payment state transition history
CREATE TABLE IF NOT EXISTS booking_payment_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_state VARCHAR(50),
  new_state VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) DEFAULT 0.00,
  reference_id VARCHAR(100),
  refund_reference_id VARCHAR(100),
  reason TEXT,
  admin_id VARCHAR(100) DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_audits_booking ON booking_payment_audits(booking_id);

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
