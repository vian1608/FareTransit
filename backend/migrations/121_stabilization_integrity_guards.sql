-- FareTransit stabilization integrity guards.
-- Existing historical rows are not rewritten unless the correction is unambiguous.

-- This index duplicates reservations_customer_email_idx exactly (Supabase advisor).
DROP INDEX IF EXISTS public.idx_reservations_customer_email_ci;

-- Normalize unambiguous legacy card-brand aliases.
UPDATE public.reservation_billing_details
SET card_brand = 'Mastercard', updated_at = NOW()
WHERE regexp_replace(lower(coalesce(card_brand, '')), '[^a-z0-9]', '', 'g') IN ('master', 'mastercard', 'mc');

-- Enforce correct rental chronology for all future inserts/updates while leaving
-- historical invalid rows available for manual review rather than guessing dates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'car_reservations_dropoff_after_pickup'
  ) THEN
    ALTER TABLE public.car_reservations
      ADD CONSTRAINT car_reservations_dropoff_after_pickup
      CHECK (pickup_at IS NULL OR dropoff_at IS NULL OR dropoff_at > pickup_at)
      NOT VALID;
  END IF;
END $$;

-- Rental times are intentionally restricted to :00 or :30.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'car_reservations_half_hour_times'
  ) THEN
    ALTER TABLE public.car_reservations
      ADD CONSTRAINT car_reservations_half_hour_times
      CHECK (
        (pickup_at IS NULL OR EXTRACT(MINUTE FROM pickup_at) IN (0, 30))
        AND (dropoff_at IS NULL OR EXTRACT(MINUTE FROM dropoff_at) IN (0, 30))
      )
      NOT VALID;
  END IF;
END $$;

-- Hotel stays follow the same database-level defensive validation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_bookings_checkout_after_checkin'
  ) THEN
    ALTER TABLE public.hotel_bookings
      ADD CONSTRAINT hotel_bookings_checkout_after_checkin
      CHECK (check_in IS NULL OR check_out IS NULL OR check_out > check_in)
      NOT VALID;
  END IF;
END $$;
