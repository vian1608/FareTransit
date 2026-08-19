-- Migration 018: Add Airline Ticket Details columns to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS airline_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS airline_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS airline_confirmation_number VARCHAR(6),
  ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(13),
  ADD COLUMN IF NOT EXISTS ticket_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ticket_notes TEXT,
  ADD COLUMN IF NOT EXISTS supplier_confirmation VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_bookings_airline_pnr ON bookings (airline_confirmation_number);
