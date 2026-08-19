-- ═══════════════════════════════════════════════════════════════
-- 010_passenger_authorizations.sql
-- FareTransit — Passenger Authorization Workflow Schema
-- ═══════════════════════════════════════════════════════════════

-- 1. PASSENGER AUTHORIZATIONS TABLE
CREATE TABLE IF NOT EXISTS passenger_authorizations (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id                  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  token                       VARCHAR(128) UNIQUE NOT NULL,
  status                      VARCHAR(30) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'expired', 'invalidated')),
  authorized_amount           DECIMAL(10,2) NOT NULL,
  currency                    VARCHAR(5) NOT NULL DEFAULT 'USD',
  payment_method_token        VARCHAR(255),
  card_brand                  VARCHAR(50) DEFAULT 'Visa',
  card_last4                  VARCHAR(10) DEFAULT '4242',
  quote_snapshot              JSONB,
  itinerary_snapshot          JSONB,
  policies_snapshot           JSONB,
  ip_address                  VARCHAR(100),
  user_agent                  TEXT,
  authorization_text_version  VARCHAR(20) DEFAULT 'v1.0',
  authorization_text_hash     VARCHAR(128),
  expires_at                  TIMESTAMPTZ NOT NULL,
  consumed_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passenger_auth_token ON passenger_authorizations(token);
CREATE INDEX IF NOT EXISTS idx_passenger_auth_booking ON passenger_authorizations(booking_id);
CREATE INDEX IF NOT EXISTS idx_passenger_auth_status ON passenger_authorizations(status);

-- 2. RELAX / UPDATE BOOKINGS STATUS CHECK CONSTRAINT IF NEEDED
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('PENDING', 'DONE', 'FAILED', 'CANCELLED', 'INCOMPLETE', 'AWAITING_AUTH', 'AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'TEST_BOOKING_REQUEST_RECEIVED'));
