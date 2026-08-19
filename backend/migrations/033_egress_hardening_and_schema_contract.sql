-- 033_egress_hardening_and_schema_contract.sql
-- Egress hardening + schema drift repair identified from July 18-August 11 production logs.
-- Idempotent and safe to run after migration 032.

-- ── 1. Abandoned checkout autosave: one UPSERT, no read-before-write. ──
DELETE FROM public.abandoned_bookings a
USING public.abandoned_bookings b
WHERE a.session_key IS NOT NULL
  AND a.session_key = b.session_key
  AND (
    COALESCE(a.updated_at, a.created_at) < COALESCE(b.updated_at, b.created_at)
    OR (COALESCE(a.updated_at, a.created_at) = COALESCE(b.updated_at, b.created_at) AND a.id::text < b.id::text)
  );

-- PostgreSQL permits multiple NULLs in a normal UNIQUE index, so this can be a
-- full index. That lets PostgREST infer ON CONFLICT(session_key) for UPSERT.
DROP INDEX IF EXISTS public.ux_abandoned_bookings_session_key;
CREATE UNIQUE INDEX ux_abandoned_bookings_session_key
  ON public.abandoned_bookings(session_key);
CREATE INDEX IF NOT EXISTS idx_abandoned_bookings_updated_at
  ON public.abandoned_bookings(updated_at DESC);

-- ── 2. Persistent request idempotency + soft-delete contract. ──
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_client_request_id
  ON public.bookings(client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_idempotency_key
  ON public.bookings(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON public.bookings(deleted_at);

-- ── 3. Canonical operational statuses. ──
-- IMPORTANT: remove the legacy constraints BEFORE altering/updating rows.
-- Older production schemas used a different payment-status contract/casing,
-- so even an unrelated UPDATE could fail while the legacy check remained active.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_status_check;

ALTER TABLE public.bookings ALTER COLUMN status TYPE VARCHAR(50);
ALTER TABLE public.bookings ALTER COLUMN payment_status TYPE VARCHAR(50);

-- Normalize old values before installing strict constraints. Unknown/legacy
-- booking states become PENDING; legacy payment AUTHORIZED means PROCESSING,
-- because passenger authorization belongs to authorization_status instead.
UPDATE public.bookings
SET status = CASE UPPER(COALESCE(status, 'PENDING'))
  WHEN 'DRAFT' THEN 'DRAFT'
  WHEN 'PENDING' THEN 'PENDING'
  WHEN 'AWAITING_AUTHORIZATION' THEN 'AWAITING_AUTHORIZATION'
  WHEN 'AUTHORIZED' THEN 'AUTHORIZED'
  WHEN 'REAUTHORIZATION_REQUIRED' THEN 'REAUTHORIZATION_REQUIRED'
  WHEN 'READY_FOR_TICKETING' THEN 'READY_FOR_TICKETING'
  WHEN 'TICKETED' THEN 'TICKETED'
  WHEN 'DONE' THEN 'DONE'
  WHEN 'COMPLETED' THEN 'DONE'
  WHEN 'CONFIRMED' THEN 'DONE'
  WHEN 'FAILED' THEN 'FAILED'
  WHEN 'CANCELLED' THEN 'CANCELLED'
  WHEN 'CANCELED' THEN 'CANCELLED'
  ELSE 'PENDING'
END;

UPDATE public.bookings
SET payment_status = CASE UPPER(COALESCE(payment_status, 'PENDING'))
  WHEN 'PENDING' THEN 'PENDING'
  WHEN 'PROCESSING' THEN 'PROCESSING'
  WHEN 'AUTHORIZED' THEN 'PROCESSING'
  WHEN 'PAID' THEN 'PAID'
  WHEN 'FAILED' THEN 'FAILED'
  WHEN 'REFUNDED' THEN 'REFUNDED'
  WHEN 'DRAFT' THEN 'PENDING'
  ELSE 'PENDING'
END;

UPDATE public.payments
SET payment_status = CASE UPPER(COALESCE(payment_status, 'PENDING'))
  WHEN 'PENDING' THEN 'PENDING'
  WHEN 'PROCESSING' THEN 'PROCESSING'
  WHEN 'AUTHORIZED' THEN 'PROCESSING'
  WHEN 'PAID' THEN 'PAID'
  WHEN 'FAILED' THEN 'FAILED'
  WHEN 'REFUNDED' THEN 'REFUNDED'
  WHEN 'DRAFT' THEN 'PENDING'
  ELSE 'PENDING'
END;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check CHECK (status IN (
  'DRAFT','PENDING','AWAITING_AUTHORIZATION','AUTHORIZED','REAUTHORIZATION_REQUIRED',
  'READY_FOR_TICKETING','TICKETED','DONE','FAILED','CANCELLED'
));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN (
  'PENDING','PROCESSING','PAID','FAILED','REFUNDED'
));
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_status_check CHECK (payment_status IN (
  'PENDING','PROCESSING','PAID','FAILED','REFUNDED'
));

-- ── 4. Widen only columns that actually exist (avoids schema-version failures). ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='country_code') THEN
    ALTER TABLE public.contacts ALTER COLUMN country_code TYPE VARCHAR(16);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='phone_number') THEN
    ALTER TABLE public.contacts ALTER COLUMN phone_number TYPE VARCHAR(50);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='flights' AND column_name='carrier_code') THEN
    ALTER TABLE public.flights ALTER COLUMN carrier_code TYPE VARCHAR(16);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='flights' AND column_name='departure_airport') THEN
    ALTER TABLE public.flights ALTER COLUMN departure_airport TYPE VARCHAR(16);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='flights' AND column_name='arrival_airport') THEN
    ALTER TABLE public.flights ALTER COLUMN arrival_airport TYPE VARCHAR(16);
  END IF;
END $$;

-- ── 5. Canonical supporting tables queried by current backend. ──
CREATE TABLE IF NOT EXISTS public.booking_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_provider TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT,
  provider_payment_method_id TEXT,
  cardholder_name TEXT,
  card_brand TEXT,
  card_last4 VARCHAR(16) CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  card_exp_month INTEGER CHECK (card_exp_month IS NULL OR card_exp_month BETWEEN 1 AND 12),
  card_exp_year INTEGER,
  billing_email TEXT,
  billing_phone TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_postal_code TEXT,
  billing_country TEXT,
  tokenization_status TEXT DEFAULT 'TOKENIZED',
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.booking_payment_methods ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE public.booking_payment_methods ADD COLUMN IF NOT EXISTS billing_phone TEXT;
CREATE INDEX IF NOT EXISTS idx_booking_payment_methods_booking_id ON public.booking_payment_methods(booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_booking_payment_method
  ON public.booking_payment_methods(booking_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.booking_payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  merchant_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(5) NOT NULL DEFAULT 'USD',
  display_order INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_booking_payment_splits_booking_id ON public.booking_payment_splits(booking_id);

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

-- Migration 008 used recipient_email/resend_message_id and lacked several of
-- the canonical columns. Add the complete current contract when that legacy
-- table already exists instead of relying on CREATE TABLE IF NOT EXISTS.
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS confirmation_code VARCHAR(50);
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS recipient VARCHAR(255);
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'RESEND';
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 1;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE public.email_deliveries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_deliveries' AND column_name='recipient_email') THEN
    EXECUTE 'UPDATE public.email_deliveries SET recipient = COALESCE(recipient, recipient_email) WHERE recipient IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_deliveries' AND column_name='resend_message_id') THEN
    EXECUTE 'UPDATE public.email_deliveries SET provider_message_id = COALESCE(provider_message_id, resend_message_id) WHERE provider_message_id IS NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_deliveries_booking_type ON public.email_deliveries(booking_id,email_type);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  actor TEXT NOT NULL DEFAULT 'system',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_booking_id ON public.audit_logs(booking_id);

-- Legacy itinerary readers still exist outside the optimized admin path.
CREATE TABLE IF NOT EXISTS public.booking_itinerary_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  direction VARCHAR(20) DEFAULT 'outbound',
  journey_direction VARCHAR(20) DEFAULT 'outbound',
  segment_sequence INTEGER DEFAULT 1,
  carrier_name VARCHAR(100), carrier_code VARCHAR(16), marketing_carrier_code VARCHAR(16),
  flight_number VARCHAR(20), origin_airport VARCHAR(16), origin_city VARCHAR(100),
  destination_airport VARCHAR(16), destination_city VARCHAR(100),
  departure_date VARCHAR(30), departure_time VARCHAR(20), arrival_date VARCHAR(30), arrival_time VARCHAR(20),
  cabin VARCHAR(30), aircraft VARCHAR(50), layover_duration VARCHAR(30), duration VARCHAR(30), stop_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_segments_booking ON public.booking_itinerary_segments(booking_id);

-- ── 6. Compatibility views stop legacy 404 probing while old low-volume paths are retired. ──
DO $$
BEGIN
  IF to_regclass('public.email_logs') IS NULL THEN
    EXECUTE 'CREATE VIEW public.email_logs AS SELECT id, booking_id, confirmation_code AS booking_reference, email_type AS template_type, recipient, status, provider, provider_message_id, error_code, error_message, attempt_count, sent_at, created_at, updated_at FROM public.email_deliveries';
  END IF;
  IF to_regclass('public.audit_events') IS NULL THEN
    EXECUTE 'CREATE VIEW public.audit_events AS SELECT id, booking_id, action, old_value, new_value, actor, ip_address, created_at FROM public.audit_logs';
  END IF;
  IF to_regclass('public.payment_splits') IS NULL THEN
    EXECUTE 'CREATE VIEW public.payment_splits AS SELECT id, booking_id, payment_id, merchant_name, amount, currency, display_order, created_at, updated_at, removed_at FROM public.booking_payment_splits';
  END IF;
END $$;

-- ── 7. High-volume FK/filter indexes. ──
CREATE INDEX IF NOT EXISTS idx_travellers_booking_id ON public.travellers(booking_id);
CREATE INDEX IF NOT EXISTS idx_contacts_booking_id ON public.contacts(booking_id);
CREATE INDEX IF NOT EXISTS idx_flights_booking_id ON public.flights(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments(booking_id);

NOTIFY pgrst, 'reload schema';
