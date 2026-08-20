-- Migration 108: FareTransit-native confirmation references.
-- The cloned booking service may still hand the persistence layer a legacy TFS- prefix.
-- Normalize only new/updated references at the database boundary; existing rows are not rewritten.

CREATE OR REPLACE FUNCTION public.normalize_faretransit_confirmation_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.confirmation_code IS NOT NULL AND NEW.confirmation_code LIKE 'TFS-%' THEN
    NEW.confirmation_code := 'FT-' || substr(NEW.confirmation_code, 5);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_faretransit_confirmation_code ON public.bookings;
CREATE TRIGGER trg_normalize_faretransit_confirmation_code
BEFORE INSERT OR UPDATE OF confirmation_code ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.normalize_faretransit_confirmation_code();
