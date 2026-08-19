-- 038_legacy_booking_contract_reconciliation.sql
-- Bridge remaining legacy admin/payment/itinerary code to the canonical production schema.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS authorized_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS provider_order_id TEXT;

UPDATE public.payments
SET payment_amount = COALESCE(payment_amount, amount),
    authorized_amount = COALESCE(authorized_amount, amount)
WHERE payment_amount IS NULL OR authorized_amount IS NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS refund_timestamp TIMESTAMPTZ;

ALTER TABLE public.booking_itinerary_segments
  ADD COLUMN IF NOT EXISTS trip_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS leg VARCHAR(20),
  ADD COLUMN IF NOT EXISTS operating_carrier VARCHAR(100),
  ADD COLUMN IF NOT EXISTS arrival_next_day BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS booking_class VARCHAR(20),
  ADD COLUMN IF NOT EXISTS terminal VARCHAR(40),
  ADD COLUMN IF NOT EXISTS baggage_allowance VARCHAR(100),
  ADD COLUMN IF NOT EXISTS segment_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_payments_provider_order
  ON public.payments(provider_order_id)
  WHERE provider_order_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
