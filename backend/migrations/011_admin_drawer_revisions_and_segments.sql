-- ═══════════════════════════════════════════════════════════════
-- 011_admin_drawer_revisions_and_segments.sql
-- FareTransit — Admin Drawer Accordions, Price Revisions & Segment Management
-- ═══════════════════════════════════════════════════════════════

-- 1. ITINERARY SEGMENTS TABLE
CREATE TABLE IF NOT EXISTS booking_itinerary_segments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id          UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  trip_type           VARCHAR(20) DEFAULT 'one_way',
  direction           VARCHAR(20) DEFAULT 'outbound',
  carrier_name        VARCHAR(100),
  carrier_code        VARCHAR(10),
  flight_number       VARCHAR(20),
  origin_airport      VARCHAR(10),
  origin_city         VARCHAR(100),
  destination_airport VARCHAR(10),
  destination_city    VARCHAR(100),
  departure_date      VARCHAR(30),
  departure_time      VARCHAR(20),
  arrival_date        VARCHAR(30),
  arrival_time        VARCHAR(20),
  cabin               VARCHAR(30) DEFAULT 'Economy',
  booking_class       VARCHAR(10) DEFAULT 'Y',
  terminal            VARCHAR(20),
  baggage_allowance   VARCHAR(50),
  stop_count          INTEGER DEFAULT 0,
  segment_order       INTEGER DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_booking ON booking_itinerary_segments(booking_id);

-- 2. PRICE REVISIONS AUDIT TABLE
CREATE TABLE IF NOT EXISTS booking_price_revisions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  supplier_fare   DECIMAL(10,2) DEFAULT 0.00,
  base_fare       DECIMAL(10,2) DEFAULT 0.00,
  taxes           DECIMAL(10,2) DEFAULT 0.00,
  service_fee     DECIMAL(10,2) DEFAULT 0.00,
  discount        DECIMAL(10,2) DEFAULT 0.00,
  customer_total  DECIMAL(10,2) NOT NULL,
  currency        VARCHAR(5) DEFAULT 'USD',
  margin          DECIMAL(10,2) DEFAULT 0.00,
  reason          TEXT,
  admin_id        VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_revisions_booking ON booking_price_revisions(booking_id);

-- 3. PAYMENT EVENTS AUDIT TABLE
CREATE TABLE IF NOT EXISTS booking_payment_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type      VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  new_status      VARCHAR(50),
  amount          DECIMAL(10,2) DEFAULT 0.00,
  reference_id    VARCHAR(255),
  reason          TEXT,
  admin_id        VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_booking ON booking_payment_events(booking_id);

-- 4. ADD VERSION COLUMN FOR OPTIMISTIC LOCKING IF NOT EXISTS
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 5. RELAX / UPDATE BOOKINGS STATUS CHECK CONSTRAINT
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'PENDING', 'DONE', 'FAILED', 'CANCELLED', 'INCOMPLETE',
    'NOT_COLLECTED', 'PAYMENT_METHOD_SECURED', 'AWAITING_AUTHORIZATION', 'AWAITING_AUTH',
    'AUTHORIZED', 'REAUTHORIZATION_REQUIRED', 'READY_FOR_TICKETING', 'TICKETED',
    'PROCESSING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED', 'TEST_BOOKING_REQUEST_RECEIVED'
  ));
