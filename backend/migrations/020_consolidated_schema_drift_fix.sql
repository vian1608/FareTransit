-- ═══════════════════════════════════════════════════════════════
-- 020_consolidated_schema_drift_fix.sql
-- FareTransit — Apply all missing migrations 011-019 at once
-- All statements are idempotent (IF NOT EXISTS / DROP ... IF EXISTS)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. BOOKINGS: version column (optimistic locking) ──────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- ── 2. BOOKINGS: authorization_token column ───────────────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS authorization_token VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_bookings_authorization_token ON public.bookings(authorization_token);

-- ── 3. BOOKINGS: expand status/payment_status column widths ───
ALTER TABLE public.bookings ALTER COLUMN status TYPE VARCHAR(50);
ALTER TABLE public.bookings ALTER COLUMN payment_status TYPE VARCHAR(50);

-- ── 4. BOOKINGS: canonical status check constraint ────────────
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'PENDING', 'AWAITING_AUTHORIZATION', 'AUTHORIZED',
    'REAUTHORIZATION_REQUIRED', 'READY_FOR_TICKETING', 'TICKETED',
    'DONE', 'FAILED', 'CANCELLED'
  ));

-- ── 5. BOOKINGS: canonical payment_status check constraint ─────
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN (
    'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED'
  ));

-- ── 6. BOOKINGS: airline & ticket details columns ─────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS airline_code          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS airline_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS airline_logo_url      TEXT,
  ADD COLUMN IF NOT EXISTS airline_confirmation_number VARCHAR(6),
  ADD COLUMN IF NOT EXISTS ticket_number         VARCHAR(13),
  ADD COLUMN IF NOT EXISTS ticket_issued_at      DATE,
  ADD COLUMN IF NOT EXISTS ticket_notes          TEXT,
  ADD COLUMN IF NOT EXISTS supplier_confirmation VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_bookings_airline_pnr ON public.bookings(airline_confirmation_number);

-- ── 7. BOOKINGS: PNR & ticket number CHECK constraints ────────
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS chk_airline_confirmation_number;
ALTER TABLE public.bookings ADD CONSTRAINT chk_airline_confirmation_number
  CHECK (airline_confirmation_number IS NULL OR airline_confirmation_number ~ '^[A-Z0-9]{6}$');

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS chk_ticket_number;
ALTER TABLE public.bookings ADD CONSTRAINT chk_ticket_number
  CHECK (ticket_number IS NULL OR ticket_number ~ '^[0-9]{1,13}$');

-- ── 8. BOOKINGS: email tracking columns (booking request) ─────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_request_email_status    VARCHAR(30) DEFAULT 'NOT_SENT',
  ADD COLUMN IF NOT EXISTS booking_request_email_id        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS booking_request_email_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_request_email_recipient VARCHAR(255),
  ADD COLUMN IF NOT EXISTS booking_request_email_error     TEXT;

-- ── 9. BOOKINGS: email tracking columns (authorization) ───────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS authorization_email_status      VARCHAR(30) DEFAULT 'NOT_SENT',
  ADD COLUMN IF NOT EXISTS authorization_email_id          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS authorization_email_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authorization_email_recipient   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS authorization_email_error       TEXT,
  ADD COLUMN IF NOT EXISTS authorization_expires_at        TIMESTAMPTZ;

-- ── 10. BOOKINGS: email tracking columns (final confirmation) ──
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS final_confirmation_email_status    VARCHAR(30) DEFAULT 'NOT_SENT',
  ADD COLUMN IF NOT EXISTS final_confirmation_email_id        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS final_confirmation_email_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_confirmation_email_recipient VARCHAR(255),
  ADD COLUMN IF NOT EXISTS final_confirmation_email_error     TEXT;

-- ── 11. PAYMENTS: refund & override columns ───────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refund_reference_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS refund_amount        DECIMAL(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS refund_reason        TEXT,
  ADD COLUMN IF NOT EXISTS refund_timestamp     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS override_reason      TEXT,
  ADD COLUMN IF NOT EXISTS is_override          BOOLEAN DEFAULT FALSE;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_status_check
  CHECK (payment_status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED'));

-- ── 12. TABLE: booking_itinerary_segments ─────────────────────
CREATE TABLE IF NOT EXISTS public.booking_itinerary_segments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id          UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  trip_type           VARCHAR(20)  DEFAULT 'one_way',
  direction           VARCHAR(20)  DEFAULT 'outbound',
  journey_direction   VARCHAR(20)  DEFAULT 'outbound',
  segment_sequence    INTEGER      DEFAULT 1,
  carrier_name        VARCHAR(100),
  carrier_code        VARCHAR(10),
  marketing_carrier_code VARCHAR(10),
  operating_carrier   VARCHAR(100),
  flight_number       VARCHAR(20),
  origin_airport      VARCHAR(10),
  origin_city         VARCHAR(100),
  destination_airport VARCHAR(10),
  destination_city    VARCHAR(100),
  departure_date      VARCHAR(30),
  departure_time      VARCHAR(20),
  arrival_date        VARCHAR(30),
  arrival_time        VARCHAR(20),
  arrival_next_day    BOOLEAN      DEFAULT FALSE,
  cabin               VARCHAR(30)  DEFAULT 'Economy',
  booking_class       VARCHAR(10)  DEFAULT 'Y',
  terminal            VARCHAR(20),
  baggage_allowance   VARCHAR(50),
  aircraft            VARCHAR(50),
  layover_duration    VARCHAR(30),
  duration            VARCHAR(30),
  stop_count          INTEGER      DEFAULT 0,
  segment_order       INTEGER      DEFAULT 1,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_booking          ON public.booking_itinerary_segments(booking_id);
CREATE INDEX IF NOT EXISTS idx_segments_journey_sequence ON public.booking_itinerary_segments(booking_id, journey_direction, segment_sequence);

-- ── 13. TABLE: booking_price_revisions ───────────────────────
CREATE TABLE IF NOT EXISTS public.booking_price_revisions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id     UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  supplier_fare  DECIMAL(10,2) DEFAULT 0.00,
  base_fare      DECIMAL(10,2) DEFAULT 0.00,
  taxes          DECIMAL(10,2) DEFAULT 0.00,
  service_fee    DECIMAL(10,2) DEFAULT 0.00,
  discount       DECIMAL(10,2) DEFAULT 0.00,
  customer_total DECIMAL(10,2) NOT NULL,
  currency       VARCHAR(5)    DEFAULT 'USD',
  margin         DECIMAL(10,2) DEFAULT 0.00,
  reason         TEXT,
  admin_id       VARCHAR(100),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_revisions_booking ON public.booking_price_revisions(booking_id);

-- ── 14. TABLE: booking_payment_audits ────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_payment_audits (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id         UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  old_state          VARCHAR(50),
  new_state          VARCHAR(50) NOT NULL,
  amount             DECIMAL(10,2) DEFAULT 0.00,
  reference_id       VARCHAR(100),
  refund_reference_id VARCHAR(100),
  reason             TEXT,
  admin_id           VARCHAR(100) DEFAULT 'system',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_audits_booking ON public.booking_payment_audits(booking_id);

-- ── 15. TABLE: booking_status_audits ─────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_status_audits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  old_status  TEXT,
  new_status  TEXT NOT NULL,
  admin_id    TEXT DEFAULT 'admin',
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_audits_booking ON public.booking_status_audits(booking_id);

-- ── 16. TABLE: passenger_authorizations ──────────────────────
CREATE TABLE IF NOT EXISTS public.passenger_authorizations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id         UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  token              VARCHAR(255) NOT NULL UNIQUE,
  status             VARCHAR(50)  DEFAULT 'AWAITING_PASSENGER',
  quote_snapshot     JSONB,
  itinerary_snapshot JSONB,
  card_brand         VARCHAR(50),
  card_last4         VARCHAR(4),
  client_ip          VARCHAR(100),
  user_agent         TEXT,
  text_hash          VARCHAR(100),
  accepted_at        TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_token   ON public.passenger_authorizations(token);
CREATE INDEX IF NOT EXISTS idx_passenger_authorizations_booking ON public.passenger_authorizations(booking_id);

-- ── 17. TABLE: payment_authorization_splits ──────────────────
CREATE TABLE IF NOT EXISTS public.payment_authorization_splits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  merchant_name VARCHAR(255) NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  currency      VARCHAR(10)  DEFAULT 'USD',
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_auth_splits_booking_id ON public.payment_authorization_splits(booking_id);

-- ── 18. Reload PostgREST schema cache ────────────────────────
NOTIFY pgrst, 'reload schema';
