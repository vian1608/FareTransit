-- 047_stable_primary_passenger_sequence.sql
-- Passenger order must never depend on random UUID ordering.

ALTER TABLE public.travellers ADD COLUMN IF NOT EXISTS passenger_sequence INTEGER;
ALTER TABLE public.travellers ADD COLUMN IF NOT EXISTS is_primary BOOLEAN;

-- Existing rows were inserted in passenger-array order. Preserve that one time.
WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY booking_id ORDER BY created_at, ctid) AS rn
  FROM public.travellers
)
UPDATE public.travellers t
SET passenger_sequence = r.rn,
    is_primary = (r.rn = 1)
FROM ranked r
WHERE t.ctid = r.ctid
  AND (t.passenger_sequence IS NULL OR t.is_primary IS NULL);

UPDATE public.travellers
SET is_primary = (passenger_sequence = 1)
WHERE is_primary IS DISTINCT FROM (passenger_sequence = 1);

CREATE UNIQUE INDEX IF NOT EXISTS ux_travellers_booking_sequence
  ON public.travellers(booking_id, passenger_sequence)
  WHERE passenger_sequence IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_travellers_one_primary
  ON public.travellers(booking_id)
  WHERE is_primary IS TRUE;

CREATE OR REPLACE FUNCTION public.tfs_assign_traveller_sequence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.passenger_sequence IS NULL THEN
    SELECT COALESCE(MAX(passenger_sequence),0)+1 INTO NEW.passenger_sequence
      FROM public.travellers WHERE booking_id=NEW.booking_id;
  END IF;
  IF NEW.is_primary IS NULL THEN
    NEW.is_primary := (NEW.passenger_sequence=1);
  ELSIF NEW.passenger_sequence=1 THEN
    NEW.is_primary := TRUE;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_tfs_assign_traveller_sequence ON public.travellers;
CREATE TRIGGER trg_tfs_assign_traveller_sequence
BEFORE INSERT ON public.travellers
FOR EACH ROW EXECUTE FUNCTION public.tfs_assign_traveller_sequence();

CREATE OR REPLACE FUNCTION public.tfs_sync_traveller_change_stable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  bid UUID; v0 INTEGER; v1 INTEGER; material BOOLEAN:=FALSE; has_auth BOOLEAN:=FALSE; primary_name TEXT;
BEGIN
  IF TG_OP='DELETE' THEN bid:=OLD.booking_id; ELSE bid:=NEW.booking_id; END IF;
  SELECT version INTO v0 FROM public.bookings WHERE id=bid;
  IF v0 IS NULL THEN RETURN NULL; END IF;

  SELECT concat_ws(' ',t.first_name,NULLIF(t.middle_name,''),t.last_name)
    INTO primary_name
    FROM public.travellers t
   WHERE t.booking_id=bid
   ORDER BY t.is_primary DESC NULLS LAST,t.passenger_sequence NULLS LAST,t.created_at,t.id
   LIMIT 1;

  IF TG_OP='UPDATE' THEN
    material:=NEW.first_name IS DISTINCT FROM OLD.first_name
      OR NEW.middle_name IS DISTINCT FROM OLD.middle_name
      OR NEW.last_name IS DISTINCT FROM OLD.last_name
      OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
      OR NEW.passport_number IS DISTINCT FROM OLD.passport_number
      OR NEW.passport_expiry IS DISTINCT FROM OLD.passport_expiry;
  ELSE
    material:=TRUE;
  END IF;
  has_auth:=material AND public.tfs_has_authorization(bid);

  UPDATE public.bookings b SET
    passenger_name=COALESCE(NULLIF(primary_name,''),b.passenger_name),
    authorization_status=CASE WHEN has_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
    authorization_token=CASE WHEN has_auth THEN NULL ELSE b.authorization_token END,
    authorization_expires_at=CASE WHEN has_auth THEN NULL ELSE b.authorization_expires_at END,
    authorized_at=CASE WHEN has_auth THEN NULL ELSE b.authorized_at END,
    version=b.version+1,
    updated_at=NOW()
  WHERE b.id=bid;

  IF has_auth THEN
    PERFORM public.tfs_supersede_pending_authorizations(bid,'Passenger identity/details changed');
  END IF;
  SELECT version INTO v1 FROM public.bookings WHERE id=bid;
  INSERT INTO public.booking_change_events(
    booking_id,version_before,version_after,change_scope,changed_fields,old_value,new_value,actor,reason
  ) VALUES (
    bid,v0,COALESCE(v1,v0+1),'travellers',ARRAY['passengers','passenger_name'],
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'database-sync','Passenger identity/details changed'
  );
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_tfs_travellers_sync ON public.travellers;
CREATE TRIGGER trg_tfs_travellers_sync
AFTER INSERT OR UPDATE OR DELETE ON public.travellers
FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_traveller_change_stable();

UPDATE public.bookings b
SET passenger_name=(
  SELECT concat_ws(' ',t.first_name,NULLIF(t.middle_name,''),t.last_name)
  FROM public.travellers t
  WHERE t.booking_id=b.id
  ORDER BY t.is_primary DESC NULLS LAST,t.passenger_sequence NULLS LAST,t.created_at,t.id
  LIMIT 1
)
WHERE EXISTS(SELECT 1 FROM public.travellers t WHERE t.booking_id=b.id);

NOTIFY pgrst,'reload schema';
