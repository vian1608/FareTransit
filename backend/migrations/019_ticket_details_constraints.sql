-- ═══════════════════════════════════════════════════════════════
-- 019_ticket_details_constraints.sql
-- Add Airline Ticket Details columns, constraints, and audits table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS airline_code VARCHAR(3),
  ADD COLUMN IF NOT EXISTS airline_name TEXT,
  ADD COLUMN IF NOT EXISTS airline_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS airline_confirmation_number VARCHAR(6),
  ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(13),
  ADD COLUMN IF NOT EXISTS ticket_issued_at DATE,
  ADD COLUMN IF NOT EXISTS ticket_notes TEXT,
  ADD COLUMN IF NOT EXISTS supplier_confirmation VARCHAR(255);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS chk_airline_confirmation_number,
  ADD CONSTRAINT chk_airline_confirmation_number CHECK (
    airline_confirmation_number IS NULL OR airline_confirmation_number ~ '^[A-Z0-9]{6}$'
  );

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS chk_ticket_number,
  ADD CONSTRAINT chk_ticket_number CHECK (
    ticket_number IS NULL OR ticket_number ~ '^[0-9]{1,13}$'
  );

CREATE TABLE IF NOT EXISTS public.booking_status_audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  admin_id VARCHAR(100) DEFAULT 'admin',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_airline_pnr ON bookings (airline_confirmation_number);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
