-- Migration 103: Additive trips + manual/semi-automated hotel operations.
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_code TEXT NOT NULL UNIQUE,
  customer_contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE SET NULL,
  assigned_agent_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING','BOOKING','CONFIRMED','IN_TRAVEL','COMPLETED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trips_agent ON trips(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_trips_team ON trips(team_id);
CREATE INDEX IF NOT EXISTS idx_trips_lead ON trips(lead_id);
CREATE INDEX IF NOT EXISTS idx_trips_customer ON trips(customer_contact_id);
CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date,end_date);
DO $$ BEGIN ALTER TABLE bookings ADD CONSTRAINT fk_bookings_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS hotel_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_code TEXT NOT NULL UNIQUE,
  trip_id UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE SET NULL,
  customer_contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_agent_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  property_name TEXT NOT NULL,
  supplier_id UUID NULL,
  supplier_name TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  rooms INTEGER NOT NULL DEFAULT 1 CHECK (rooms > 0),
  adults INTEGER NOT NULL DEFAULT 1 CHECK (adults >= 0),
  children INTEGER NOT NULL DEFAULT 0 CHECK (children >= 0),
  room_type TEXT,
  supplier_confirmation_number TEXT,
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxes_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  cancellation_policy TEXT,
  cancellation_deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','QUOTED','CUSTOMER_APPROVED','BOOKING_IN_PROGRESS','CONFIRMED','CANCELLED','COMPLETED')),
  commission_percentage NUMERIC(7,4),
  expected_commission NUMERIC(12,2),
  actual_commission NUMERIC(12,2),
  commission_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (commission_status IN ('NOT_APPLICABLE','EXPECTED','PENDING','RECEIVED','PAID')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hotels_trip ON hotel_bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_hotels_lead ON hotel_bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_hotels_agent ON hotel_bookings(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_hotels_team ON hotel_bookings(team_id);
CREATE INDEX IF NOT EXISTS idx_hotels_status ON hotel_bookings(status);
CREATE INDEX IF NOT EXISTS idx_hotels_cancel_deadline ON hotel_bookings(cancellation_deadline);
