-- 035_booking_integrity_hardening.sql
-- Preserve infant seat/lap fulfillment state and reinforce traveller lookup performance.

ALTER TABLE public.travellers
  ADD COLUMN IF NOT EXISTS infant_type VARCHAR(20);

ALTER TABLE public.travellers
  DROP CONSTRAINT IF EXISTS travellers_infant_type_check;

ALTER TABLE public.travellers
  ADD CONSTRAINT travellers_infant_type_check
  CHECK (infant_type IS NULL OR infant_type IN ('IN_SEAT','ON_LAP'));

CREATE INDEX IF NOT EXISTS idx_travellers_booking_role
  ON public.travellers(booking_id, role);

NOTIFY pgrst, 'reload schema';
