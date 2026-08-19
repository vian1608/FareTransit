-- 036_production_booking_schema_reconciliation.sql
-- Reconcile the live production schema with the current booking/admin contract.

ALTER TABLE public.flights
  ADD COLUMN IF NOT EXISTS carrier_code VARCHAR(16);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_checkout_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_timestamp TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS authorization_token TEXT,
  ADD COLUMN IF NOT EXISTS authorization_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS authorized_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS airline_code VARCHAR(16),
  ADD COLUMN IF NOT EXISTS airline_name TEXT,
  ADD COLUMN IF NOT EXISTS airline_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS airline_confirmation_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS airline_confirmation_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ticket_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ticketed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_issued_at DATE,
  ADD COLUMN IF NOT EXISTS ticket_notes TEXT,
  ADD COLUMN IF NOT EXISTS supplier_confirmation_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS supplier_confirmation TEXT,
  ADD COLUMN IF NOT EXISTS email_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS email_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_recipient TEXT,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS authorization_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_confirmation_email_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS final_confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_confirmation_email_error TEXT;

CREATE INDEX IF NOT EXISTS idx_flights_booking_carrier
  ON public.flights(booking_id, carrier_code);
CREATE INDEX IF NOT EXISTS idx_payments_provider_checkout
  ON public.payments(provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment
  ON public.payments(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.passenger_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  confirmation_code VARCHAR(40),
  authorization_token VARCHAR(96) UNIQUE NOT NULL,
  authorization_status VARCHAR(30) NOT NULL DEFAULT 'AWAITING_AUTHORIZATION',
  authorization_expires_at TIMESTAMPTZ,
  reauthorization_requested_at TIMESTAMPTZ,
  reauthorization_reason TEXT,
  authorization_revision INTEGER NOT NULL DEFAULT 1,
  consent_text_version VARCHAR(40),
  authorized_at TIMESTAMPTZ,
  authorized_ip INET,
  authorized_user_agent TEXT,
  contact_email VARCHAR(255),
  payment_method_label VARCHAR(80),
  payment_card_brand VARCHAR(30),
  payment_card_last4 VARCHAR(4),
  payment_card_expiry VARCHAR(7),
  billing_postal_code VARCHAR(32),
  booking_amount NUMERIC(10,2),
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  evidence_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_pdf_storage_path TEXT,
  evidence_pdf_sha256 VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_authorization_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  authorization_id UUID REFERENCES public.passenger_authorizations(id) ON DELETE CASCADE,
  split_reference TEXT,
  merchant_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  display_order INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ticket_snapshots (
  id TEXT PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  airline TEXT NOT NULL,
  airline_code VARCHAR(16),
  pnr VARCHAR(100) NOT NULL,
  ticket_number VARCHAR(100),
  final_itinerary JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  issue_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_booking
  ON public.passenger_authorizations(booking_id);
CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_token
  ON public.passenger_authorizations(authorization_token);
CREATE INDEX IF NOT EXISTS idx_payment_authorization_splits_booking
  ON public.payment_authorization_splits(booking_id);
CREATE INDEX IF NOT EXISTS idx_ticket_snapshots_booking
  ON public.ticket_snapshots(booking_id, created_at);

ALTER TABLE public.passenger_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_authorization_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_snapshots ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
