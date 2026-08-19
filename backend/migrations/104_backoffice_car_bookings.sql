-- Migration 104: Internal car operations only. Public car-search schema/routes are untouched.
CREATE TABLE IF NOT EXISTS car_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_code TEXT NOT NULL UNIQUE,
  trip_id UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE SET NULL,
  customer_contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_agent_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
  supplier_id UUID NULL,
  supplier_name TEXT,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  pickup_at TIMESTAMPTZ NOT NULL,
  dropoff_at TIMESTAMPTZ NOT NULL,
  vehicle_class TEXT,
  confirmation_number TEXT,
  supplier_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  customer_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup_service_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','QUOTED','CUSTOMER_APPROVED','BOOKING_IN_PROGRESS','CONFIRMED','CANCELLED','COMPLETED')),
  payment_status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_car_bookings_trip ON car_bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_car_bookings_lead ON car_bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_car_bookings_agent ON car_bookings(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_car_bookings_team ON car_bookings(team_id);
CREATE INDEX IF NOT EXISTS idx_car_bookings_status ON car_bookings(status);
CREATE INDEX IF NOT EXISTS idx_car_bookings_pickup ON car_bookings(pickup_at);
