-- 039_admin_pricing_payment_audit_tables.sql
-- Persist admin pricing/payment history and audit events instead of swallowing missing-table errors.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS supplier_fare NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS taxes_and_fees NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS agency_markup NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_change_reason TEXT;

CREATE TABLE IF NOT EXISTS public.booking_price_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  supplier_fare NUMERIC(10,2) NOT NULL DEFAULT 0,
  base_fare NUMERIC(10,2) NOT NULL DEFAULT 0,
  taxes NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  agency_markup NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  customer_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  margin NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT,
  admin_id TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.booking_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reference_id TEXT,
  reason TEXT,
  admin_id TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  admin_id TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_price_revisions_booking
  ON public.booking_price_revisions(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_payment_events_booking
  ON public.booking_payment_events(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_booking
  ON public.admin_audit_events(booking_id, created_at DESC);

ALTER TABLE public.booking_price_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
