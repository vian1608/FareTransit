-- Migration 030: Enhancing email_deliveries table for complete server-side automated email tracking & idempotency
-- Priority: CRITICAL EMAIL AUTOMATION

-- 1. Ensure email_deliveries table exists with full schema
CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  confirmation_code VARCHAR(50),
  email_type VARCHAR(50) NOT NULL DEFAULT 'BOOKING_CONFIRMATION',
  recipient VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(50) NOT NULL DEFAULT 'RESEND',
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  attempt_count INT DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add optional columns if table already existed from migration 008
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS confirmation_code VARCHAR(50);
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'RESEND';
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 1;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- 2. Add Unique Constraint for Idempotency per (booking_id, email_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uk_email_deliveries_booking_type'
  ) THEN
    ALTER TABLE public.email_deliveries ADD CONSTRAINT uk_email_deliveries_booking_type UNIQUE (booking_id, email_type);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Fast Indexes
CREATE INDEX IF NOT EXISTS idx_email_deliveries_booking_type ON public.email_deliveries(booking_id, email_type);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_status ON public.email_deliveries(status);

COMMENT ON TABLE public.email_deliveries IS 'PCI & Delivery Audit: Server-side automated email tracking and idempotency store.';
