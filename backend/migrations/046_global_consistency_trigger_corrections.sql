-- 046_global_consistency_trigger_corrections.sql
-- Correct replayable child-change trigger semantics from migration 042.
-- This is idempotent and safely handles INSERT/UPDATE/DELETE without reading
-- NEW on DELETE or OLD on INSERT.

CREATE OR REPLACE FUNCTION public.tfs_sync_booking_child_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  bid UUID;
  old_version INTEGER;
  new_version INTEGER;
  had_auth BOOLEAN:=FALSE;
  material BOOLEAN:=FALSE;
  reason TEXT;
  fields TEXT[]:=ARRAY[]::TEXT[];
  primary_name TEXT;
  primary_email TEXT;
  primary_phone TEXT;
  first_airline TEXT;
  first_carrier TEXT;
  latest_payment_status TEXT;
BEGIN
  IF TG_OP='DELETE' THEN bid:=OLD.booking_id; ELSE bid:=NEW.booking_id; END IF;
  IF bid IS NULL THEN RETURN NULL; END IF;
  SELECT version INTO old_version FROM public.bookings WHERE id=bid;
  IF old_version IS NULL THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME='contacts' THEN
    SELECT c.email,c.phone_number INTO primary_email,primary_phone
      FROM public.contacts c WHERE c.booking_id=bid
     ORDER BY c.created_at,c.id LIMIT 1;
    fields:=ARRAY['email','phone']; reason:='Primary contact changed';
    UPDATE public.bookings b SET
      email=COALESCE(primary_email,b.email),
      phone=primary_phone,
      version=b.version+1,
      updated_at=NOW()
    WHERE b.id=bid;

  ELSIF TG_TABLE_NAME='travellers' THEN
    SELECT concat_ws(' ',t.first_name,NULLIF(t.middle_name,''),t.last_name)
      INTO primary_name FROM public.travellers t WHERE t.booking_id=bid
     ORDER BY t.created_at,t.id LIMIT 1;
    IF TG_OP='UPDATE' THEN
      material:=NEW.first_name IS DISTINCT FROM OLD.first_name
        OR NEW.middle_name IS DISTINCT FROM OLD.middle_name
        OR NEW.last_name IS DISTINCT FROM OLD.last_name
        OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
        OR NEW.passport_number IS DISTINCT FROM OLD.passport_number
        OR NEW.passport_expiry IS DISTINCT FROM OLD.passport_expiry;
    ELSE material:=TRUE; END IF;
    had_auth:=material AND public.tfs_has_authorization(bid);
    fields:=ARRAY['passengers','passenger_name']; reason:='Passenger identity/details changed';
    UPDATE public.bookings b SET
      passenger_name=COALESCE(NULLIF(primary_name,''),b.passenger_name),
      authorization_status=CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
      authorization_token=CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
      authorization_expires_at=CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
      authorized_at=CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
      version=b.version+1,
      updated_at=NOW()
    WHERE b.id=bid;

  ELSIF TG_TABLE_NAME='flights' THEN
    SELECT f.airline_name,f.carrier_code INTO first_airline,first_carrier
      FROM public.flights f WHERE f.booking_id=bid
     ORDER BY CASE WHEN lower(f.leg) IN ('return','inbound') THEN 1 ELSE 0 END,f.created_at,f.id LIMIT 1;
    material:=TRUE; had_auth:=public.tfs_has_authorization(bid);
    fields:=ARRAY['itinerary','airline_name','airline_code']; reason:='Flight itinerary changed';
    UPDATE public.bookings b SET
      airline_name=first_airline,
      airline_code=first_carrier,
      authorization_status=CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
      authorization_token=CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
      authorization_expires_at=CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
      authorized_at=CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
      version=b.version+1,
      updated_at=NOW()
    WHERE b.id=bid;

  ELSIF TG_TABLE_NAME='booking_payment_splits' THEN
    material:=TRUE; had_auth:=public.tfs_has_authorization(bid);
    fields:=ARRAY['payment_splits']; reason:='Payment authorization split changed';
    UPDATE public.bookings b SET
      authorization_status=CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
      authorization_token=CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
      authorization_expires_at=CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
      authorized_at=CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
      version=b.version+1,
      updated_at=NOW()
    WHERE b.id=bid;

  ELSIF TG_TABLE_NAME='booking_payment_methods' THEN
    IF TG_OP='UPDATE' THEN
      material:=NEW.cardholder_name IS DISTINCT FROM OLD.cardholder_name
        OR NEW.card_brand IS DISTINCT FROM OLD.card_brand
        OR NEW.card_last4 IS DISTINCT FROM OLD.card_last4
        OR NEW.card_exp_month IS DISTINCT FROM OLD.card_exp_month
        OR NEW.card_exp_year IS DISTINCT FROM OLD.card_exp_year;
    ELSE material:=TRUE; END IF;
    had_auth:=material AND public.tfs_has_authorization(bid);
    fields:=ARRAY['payment_method','billing_details'];
    reason:=CASE WHEN material THEN 'Payment method reference changed' ELSE 'Billing details changed' END;
    UPDATE public.bookings b SET
      authorization_status=CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
      authorization_token=CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
      authorization_expires_at=CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
      authorized_at=CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
      version=b.version+1,
      updated_at=NOW()
    WHERE b.id=bid;

  ELSIF TG_TABLE_NAME='payments' THEN
    SELECT upper(p.payment_status) INTO latest_payment_status
      FROM public.payments p WHERE p.booking_id=bid
     ORDER BY COALESCE(p.payment_date,p.created_at) DESC,p.created_at DESC LIMIT 1;
    fields:=ARRAY['payment_status']; reason:='Payment operational state changed';
    UPDATE public.bookings b SET
      payment_status=COALESCE(latest_payment_status,b.payment_status),
      version=b.version+1,
      updated_at=NOW()
    WHERE b.id=bid;
  END IF;

  SELECT version INTO new_version FROM public.bookings WHERE id=bid;
  IF had_auth THEN PERFORM public.tfs_supersede_pending_authorizations(bid,reason); END IF;
  INSERT INTO public.booking_change_events(
    booking_id,version_before,version_after,change_scope,changed_fields,old_value,new_value,actor,reason
  ) VALUES (
    bid,old_version,COALESCE(new_version,old_version+1),TG_TABLE_NAME,fields,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'database-sync',reason
  );
  RETURN NULL;
END; $$;

NOTIFY pgrst,'reload schema';
