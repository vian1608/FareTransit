-- 040_authorization_service_contract_reconciliation.sql
-- Align passenger authorization storage with the current authorization service and evidence export flow.

ALTER TABLE public.passenger_authorizations
  ALTER COLUMN authorization_token DROP NOT NULL;

ALTER TABLE public.passenger_authorizations
  ADD COLUMN IF NOT EXISTS token VARCHAR(180),
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS authorized_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_method_token TEXT,
  ADD COLUMN IF NOT EXISTS card_brand VARCHAR(30),
  ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4),
  ADD COLUMN IF NOT EXISTS quote_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS itinerary_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS policies_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS authorization_text_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS authorization_text_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS authorization_snapshot JSONB;

UPDATE public.passenger_authorizations
SET token = COALESCE(token, authorization_token),
    authorization_token = COALESCE(authorization_token, token),
    authorized_amount = COALESCE(authorized_amount, booking_amount),
    card_brand = COALESCE(card_brand, payment_card_brand),
    card_last4 = COALESCE(card_last4, payment_card_last4),
    expires_at = COALESCE(expires_at, authorization_expires_at),
    status = CASE UPPER(COALESCE(authorization_status, 'PENDING'))
      WHEN 'AUTHORIZED' THEN 'accepted'
      WHEN 'EXPIRED' THEN 'expired'
      WHEN 'REVOKED' THEN 'revoked'
      ELSE COALESCE(NULLIF(status, ''), 'pending')
    END;

CREATE UNIQUE INDEX IF NOT EXISTS ux_passenger_authorizations_token_current
  ON public.passenger_authorizations(token)
  WHERE token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.authorization_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  confirmation_code VARCHAR(50),
  passenger_name TEXT,
  customer_email TEXT,
  token TEXT,
  snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  itinerary_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  airline_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  flight_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
  authorized_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  payment_splits JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent_text TEXT,
  consent_version VARCHAR(40),
  consent_hash VARCHAR(64),
  client_ip TEXT,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authorization_snapshots_booking
  ON public.authorization_snapshots(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_authorization_snapshots_token
  ON public.authorization_snapshots(token);

ALTER TABLE public.authorization_snapshots ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
