-- ═══════════════════════════════════════════════════════════════
-- 015_canonical_statuses_and_persistence.sql
-- Ensure exact canonical check constraints on public.bookings and authorization_token column
-- ═══════════════════════════════════════════════════════════════

-- 1. Add authorization_token column to bookings for fast token indexing
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS authorization_token VARCHAR(255);

ALTER TABLE public.bookings
ALTER COLUMN status TYPE VARCHAR(50),
ALTER COLUMN payment_status TYPE VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_bookings_authorization_token ON public.bookings(authorization_token);

-- 2. Ensure bookings_status_check accepts all 9 canonical booking statuses

ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_status_check
CHECK (
  status IN (
    'PENDING',
    'AWAITING_AUTHORIZATION',
    'AUTHORIZED',
    'REAUTHORIZATION_REQUIRED',
    'READY_FOR_TICKETING',
    'TICKETED',
    'DONE',
    'FAILED',
    'CANCELLED'
  )
);

-- 3. Ensure bookings_payment_status_check accepts all 5 canonical payment statuses
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_payment_status_check
CHECK (
  payment_status IN (
    'PENDING',
    'PROCESSING',
    'PAID',
    'FAILED',
    'REFUNDED'
  )
);

-- 4. Create passenger_authorizations table if not exists with token index
CREATE TABLE IF NOT EXISTS public.passenger_authorizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'AWAITING_PASSENGER',
  quote_snapshot JSONB,
  itinerary_snapshot JSONB,
  card_brand VARCHAR(50),
  card_last4 VARCHAR(4),
  client_ip VARCHAR(100),
  user_agent TEXT,
  text_hash VARCHAR(100),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_token ON public.passenger_authorizations(token);
CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_booking ON public.passenger_authorizations(booking_id);

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
