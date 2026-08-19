-- 037_booking_activity_and_email_reconciliation.sql
-- Persist email activity/status auditing instead of relying on legacy compatibility fallbacks.

ALTER TABLE public.email_deliveries
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_email_id TEXT,
  ADD COLUMN IF NOT EXISTS authorization_email_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS authorization_email_id TEXT,
  ADD COLUMN IF NOT EXISTS authorization_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authorization_email_recipient TEXT,
  ADD COLUMN IF NOT EXISTS authorization_email_error TEXT,
  ADD COLUMN IF NOT EXISTS booking_request_email_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS booking_request_email_id TEXT,
  ADD COLUMN IF NOT EXISTS booking_request_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_request_email_recipient TEXT,
  ADD COLUMN IF NOT EXISTS booking_request_email_error TEXT,
  ADD COLUMN IF NOT EXISTS final_confirmation_email_id TEXT,
  ADD COLUMN IF NOT EXISTS final_confirmation_email_recipient TEXT;

CREATE TABLE IF NOT EXISTS public.booking_status_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  admin_id TEXT NOT NULL DEFAULT 'admin',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_status_audits_booking
  ON public.booking_status_audits(booking_id, created_at DESC);

ALTER TABLE public.booking_status_audits ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
