-- 043_normalized_itinerary_sync.sql
CREATE OR REPLACE FUNCTION public.tfs_sync_normalized_itinerary_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bid UUID; v0 INTEGER; v1 INTEGER; has_auth BOOLEAN; a TEXT; c TEXT;
BEGIN
  IF TG_OP='DELETE' THEN bid:=OLD.booking_id; ELSE bid:=NEW.booking_id; END IF;
  SELECT version INTO v0 FROM public.bookings WHERE id=bid;
  IF v0 IS NULL THEN RETURN NULL; END IF;
  SELECT carrier_name,carrier_code INTO a,c
    FROM public.booking_itinerary_segments
   WHERE booking_id=bid
   ORDER BY CASE WHEN lower(COALESCE(journey_direction,direction,leg,'')) IN ('return','inbound') THEN 1 ELSE 0 END,
            COALESCE(segment_order,segment_sequence,9999),created_at,id
   LIMIT 1;
  has_auth:=public.tfs_has_authorization(bid);
  UPDATE public.bookings SET
    airline_name=a,
    airline_code=c,
    authorization_status=CASE WHEN has_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE authorization_status END,
    authorization_token=CASE WHEN has_auth THEN NULL ELSE authorization_token END,
    authorization_expires_at=CASE WHEN has_auth THEN NULL ELSE authorization_expires_at END,
    authorized_at=CASE WHEN has_auth THEN NULL ELSE authorized_at END,
    version=version+1,
    updated_at=NOW()
  WHERE id=bid;
  IF has_auth THEN PERFORM public.tfs_supersede_pending_authorizations(bid,'Flight itinerary changed'); END IF;
  SELECT version INTO v1 FROM public.bookings WHERE id=bid;
  INSERT INTO public.booking_change_events(booking_id,version_before,version_after,change_scope,changed_fields,old_value,new_value,reason)
  VALUES(bid,v0,v1,'itinerary',ARRAY['itinerary','airline_name','airline_code'],CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,'Flight itinerary changed');
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_tfs_normalized_itinerary_sync ON public.booking_itinerary_segments;
CREATE TRIGGER trg_tfs_normalized_itinerary_sync
AFTER INSERT OR UPDATE OR DELETE ON public.booking_itinerary_segments
FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_normalized_itinerary_change();
