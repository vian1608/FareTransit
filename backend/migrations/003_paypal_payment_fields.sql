-- ═══════════════════════════════════════════════════════════════
-- 003_paypal_payment_fields.sql
-- Add PayPal support and tracking columns to payments table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_order_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_capture_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_email VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_id VARCHAR(100);

-- Unique constraints for provider order and capture IDs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_provider_order_id_key') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_provider_order_id_key UNIQUE (provider_order_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_provider_capture_id_key') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_provider_capture_id_key UNIQUE (provider_capture_id);
    END IF;
END $$;

-- Indices for fast lookups
CREATE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_capture ON payments(provider_capture_id);
