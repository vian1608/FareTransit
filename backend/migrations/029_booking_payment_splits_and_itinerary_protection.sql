-- Migration 029: Dedicated booking_payment_splits table and data-integrity protection against flight deletion
-- Priority: CRITICAL PRODUCTION SAFETY

-- 1. Create booking_payment_splits table
CREATE TABLE IF NOT EXISTS public.booking_payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  merchant_name TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  display_order INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);

-- Index for fast lookup by booking
CREATE INDEX IF NOT EXISTS idx_booking_payment_splits_booking_id ON public.booking_payment_splits(booking_id);

-- 2. Data Integrity Trigger: Prevent deleting all flight segments for an active booking
CREATE OR REPLACE FUNCTION prevent_zero_flight_deletion_on_active_booking()
RETURNS TRIGGER AS $$
DECLARE
  b_status TEXT;
  remaining_flights INT;
BEGIN
  SELECT status INTO b_status FROM public.bookings WHERE id = OLD.booking_id;
  
  -- If booking is active (not CANCELLED, FAILED, or DELETED), block wiping out all flight segments
  IF b_status IS NOT NULL AND b_status NOT IN ('CANCELLED', 'FAILED', 'DELETED') THEN
    SELECT COUNT(*) INTO remaining_flights FROM public.flights WHERE booking_id = OLD.booking_id AND id != OLD.id;
    IF remaining_flights = 0 THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_PROTECTION: Cannot delete all flight itinerary segments for active booking % (status: %). Use explicit cancellation or protected itinerary replacement.', OLD.booking_id, b_status;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to flights table (if not already attached)
DROP TRIGGER IF EXISTS trg_prevent_zero_flight_deletion ON public.flights;
CREATE TRIGGER trg_prevent_zero_flight_deletion
  BEFORE DELETE ON public.flights
  FOR EACH ROW
  EXECUTE FUNCTION prevent_zero_flight_deletion_on_active_booking();

-- 3. Audit Log function notice
COMMENT ON TABLE public.booking_payment_splits IS 'PCI & Data Integrity: Dedicated relational store for split-payment metadata per booking.';
