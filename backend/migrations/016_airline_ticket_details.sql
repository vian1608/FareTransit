-- ═══════════════════════════════════════════════════════════════
-- 016_airline_ticket_details.sql
-- Add Airline Confirmation Number / PNR and Ticket Details to public.bookings
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS airline_pnr VARCHAR(100),
ADD COLUMN IF NOT EXISTS airline_name VARCHAR(150),
ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS ticket_issue_date TIMESTAMPTZ;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
