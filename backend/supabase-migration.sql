-- ═══════════════════════════════════════════════════════════════
-- FareTransit — Supabase Database Migration
-- Run this once in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- 1. BOOKINGS (master record)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  confirmation_code VARCHAR(20) UNIQUE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','DONE','FAILED','CANCELLED','INCOMPLETE')),
  payment_status  VARCHAR(20) NOT NULL DEFAULT 'paid'
                  CHECK (payment_status IN ('paid','pending','failed','refunded')),
  total_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(5)   NOT NULL DEFAULT 'USD',
  passenger_name  VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  internal_notes  TEXT,
  original_api_price DECIMAL(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at DESC);

-- ─────────────────────────────────────────────
-- 2. TRAVELLERS (one row per passenger)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travellers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL DEFAULT 'adult'
                  CHECK (role IN ('adult','child','infant')),
  title           VARCHAR(10),
  first_name      VARCHAR(100) NOT NULL,
  middle_name     VARCHAR(100),
  last_name       VARCHAR(100) NOT NULL,
  date_of_birth   DATE,
  gender          VARCHAR(20),
  nationality     VARCHAR(100),
  passport_number VARCHAR(50),
  passport_expiry DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travellers_booking ON travellers(booking_id);

-- ─────────────────────────────────────────────
-- 3. CONTACTS (primary contact per booking)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  country_code    VARCHAR(10),
  phone_number    VARCHAR(30),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_booking ON contacts(booking_id);

-- ─────────────────────────────────────────────
-- 4. FLIGHTS (outbound + optional return)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flights (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  leg               VARCHAR(10) NOT NULL DEFAULT 'outbound'
                    CHECK (leg IN ('outbound','return')),
  trip_type         VARCHAR(20) NOT NULL DEFAULT 'one-way'
                    CHECK (trip_type IN ('one-way','round-trip')),
  airline_name      VARCHAR(100),
  flight_number     VARCHAR(30),
  departure_airport VARCHAR(10),
  arrival_airport   VARCHAR(10),
  departure_date    VARCHAR(20),
  arrival_date      VARCHAR(20),
  departure_time_str VARCHAR(20),
  arrival_time_str  VARCHAR(20),
  duration          VARCHAR(30),
  stops             INTEGER DEFAULT 0,
  cabin_class       VARCHAR(50) DEFAULT 'Economy',
  fare_details      JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flights_booking ON flights(booking_id);

-- ─────────────────────────────────────────────
-- 5. PAYMENTS (Stripe reference only — no card data)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_provider  VARCHAR(30) NOT NULL DEFAULT 'stripe',
  stripe_session_id VARCHAR(255),
  stripe_payment_id VARCHAR(255),
  provider_order_id VARCHAR(255) UNIQUE,
  provider_capture_id VARCHAR(255) UNIQUE,
  payment_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount            DECIMAL(10,2),
  currency          VARCHAR(5) NOT NULL DEFAULT 'USD',
  payment_status    VARCHAR(20) NOT NULL DEFAULT 'paid'
                    CHECK (payment_status IN ('paid','pending','failed','refunded')),
  payment_date      TIMESTAMPTZ DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  failure_reason    TEXT,
  idempotency_key   VARCHAR(255),
  payer_email       VARCHAR(255),
  payer_id          VARCHAR(100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_order ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_capture ON payments(provider_capture_id);

-- ─────────────────────────────────────────────
-- 6. ABANDONED BOOKINGS (incomplete flow snapshots)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abandoned_bookings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_key       VARCHAR(100),
  selected_flight   JSONB,
  return_flight     JSONB,
  traveller_info    JSONB,
  contact_info      JSONB,
  special_requests  JSONB,
  current_step      VARCHAR(50),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_session ON abandoned_bookings(session_key);
CREATE INDEX IF NOT EXISTS idx_abandoned_created  ON abandoned_bookings(created_at DESC);

-- ─────────────────────────────────────────────
-- 7. INQUIRIES (durable lead storage)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiries (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_type          VARCHAR(50) NOT NULL DEFAULT 'flights',
  status                VARCHAR(20) NOT NULL DEFAULT 'NEW',
  name                  VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  phone                 VARCHAR(50),
  origin                VARCHAR(255),
  destination           VARCHAR(255),
  trip_type             VARCHAR(50),
  travel_date           VARCHAR(50),
  return_date           VARCHAR(50),
  passengers            VARCHAR(50),
  cabin_class           VARCHAR(50),
  notes                 TEXT,
  sms_opt_in            BOOLEAN DEFAULT FALSE,
  preferred_destination VARCHAR(255),
  flexible_dates        VARCHAR(50),
  source                VARCHAR(100),
  utm_source            VARCHAR(100),
  utm_medium            VARCHAR(100),
  utm_campaign          VARCHAR(100),
  utm_content           VARCHAR(100),
  gclid                 VARCHAR(255),
  gbraid                VARCHAR(255),
  wbraid                VARCHAR(255),
  email_status          VARCHAR(20) DEFAULT 'PENDING',
  email_provider        VARCHAR(50),
  email_message_id      VARCHAR(255),
  email_error           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_email ON inquiries(email);
CREATE INDEX IF NOT EXISTS idx_inquiries_service ON inquiries(service_type);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);

-- ─────────────────────────────────────────────
-- Auto-update updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_abandoned_updated_at ON abandoned_bookings;
CREATE TRIGGER trg_abandoned_updated_at
  BEFORE UPDATE ON abandoned_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_inquiries_updated_at ON inquiries;
CREATE TRIGGER trg_inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- RLS Policies (service-role key bypasses RLS automatically)
-- ─────────────────────────────────────────────
ALTER TABLE bookings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE travellers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries          ENABLE ROW LEVEL SECURITY;

-- Done!
SELECT 'Migration complete' AS result;
