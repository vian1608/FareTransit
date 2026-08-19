-- Migration 105: Suppliers + finance/payment operations foundation.
-- Deliberately contains NO password, API key, CVV or raw-card fields.
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  supplier_type TEXT NOT NULL CHECK (supplier_type IN ('AIR','HOTEL','CAR','CRUISE','ACTIVITY','HOST_AGENCY','OTHER')),
  website TEXT,
  account_reference TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);

DO $$ BEGIN ALTER TABLE hotel_bookings ADD CONSTRAINT fk_hotel_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE car_bookings ADD CONSTRAINT fk_car_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_type TEXT NOT NULL CHECK (booking_type IN ('FLIGHT','HOTEL','CAR','CRUISE','ACTIVITY','OTHER')),
  booking_ref_id UUID,
  booking_code TEXT,
  trip_id UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES crm_leads(id) ON DELETE SET NULL,
  assigned_agent_id UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
  supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  sale_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  supplier_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  service_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  commission_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (commission_status IN ('NOT_APPLICABLE','EXPECTED','PENDING','RECEIVED','PAID')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_entries_created ON finance_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_entries_agent ON finance_entries(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_team ON finance_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_supplier ON finance_entries(supplier_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_commission ON finance_entries(commission_status);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  trip_id UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
  booking_type TEXT,
  booking_ref_id UUID,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'EXPECTED' CHECK (status IN ('EXPECTED','DUE','PAID','VOID')),
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_status ON supplier_payments(status,due_at);

CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','REJECTED','PROCESSED','CANCELLED')),
  requested_by UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  approved_by UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  processed_by UUID NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refund_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refund_requests(status,created_at DESC);

CREATE TABLE IF NOT EXISTS payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NULL REFERENCES bookings(id) ON DELETE SET NULL,
  provider_reference TEXT,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'OPEN',
  reason TEXT,
  due_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backoffice_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO backoffice_settings(key,value,description) VALUES ('refund_large_threshold','500'::jsonb,'Refund amount above which payments.refund_large is required') ON CONFLICT(key) DO NOTHING;
