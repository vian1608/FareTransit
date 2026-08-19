-- 042_global_booking_consistency.sql
-- Make the persisted booking universe consistent after any admin/customer mutation.
-- Current booking projections are synchronized globally; historical authorization
-- evidence and already-sent email records remain immutable.

CREATE TABLE IF NOT EXISTS public.booking_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  version_before INTEGER NOT NULL,
  version_after INTEGER NOT NULL,
  change_scope VARCHAR(40) NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  old_value JSONB,
  new_value JSONB,
  actor TEXT NOT NULL DEFAULT 'database-sync',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_change_events_booking_created
  ON public.booking_change_events(booking_id, created_at DESC);

ALTER TABLE public.booking_change_events ENABLE ROW LEVEL SECURITY;

-- Reconcile legacy projections once before installing triggers. This intentionally
-- does not touch immutable authorization snapshots or email-delivery history.
UPDATE public.bookings b
SET passenger_name = COALESCE(
      (SELECT concat_ws(' ', t.first_name, NULLIF(t.middle_name, ''), t.last_name)
         FROM public.travellers t
        WHERE t.booking_id = b.id
        ORDER BY t.created_at ASC, t.id ASC
        LIMIT 1),
      b.passenger_name
    ),
    email = COALESCE(
      (SELECT c.email FROM public.contacts c WHERE c.booking_id = b.id ORDER BY c.created_at ASC, c.id ASC LIMIT 1),
      b.email
    ),
    phone = COALESCE(
      (SELECT c.phone_number FROM public.contacts c WHERE c.booking_id = b.id ORDER BY c.created_at ASC, c.id ASC LIMIT 1),
      b.phone
    ),
    airline_name = COALESCE(
      (SELECT f.airline_name FROM public.flights f WHERE f.booking_id = b.id ORDER BY CASE WHEN lower(f.leg) IN ('return','inbound') THEN 1 ELSE 0 END, f.created_at ASC, f.id ASC LIMIT 1),
      b.airline_name
    ),
    airline_code = COALESCE(
      (SELECT f.carrier_code FROM public.flights f WHERE f.booking_id = b.id ORDER BY CASE WHEN lower(f.leg) IN ('return','inbound') THEN 1 ELSE 0 END, f.created_at ASC, f.id ASC LIMIT 1),
      b.airline_code
    ),
    payment_status = COALESCE(
      (SELECT upper(p.payment_status) FROM public.payments p WHERE p.booking_id = b.id ORDER BY COALESCE(p.payment_date,p.created_at) DESC, p.created_at DESC LIMIT 1),
      b.payment_status
    );

CREATE OR REPLACE FUNCTION public.tfs_has_authorization(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.id = p_booking_id
       AND (b.authorization_token IS NOT NULL OR b.authorization_status IN ('AUTHORIZED','AWAITING_AUTHORIZATION','REAUTHORIZATION_REQUIRED'))
  ) OR EXISTS (
    SELECT 1 FROM public.passenger_authorizations pa
     WHERE pa.booking_id = p_booking_id
       AND (pa.consumed_at IS NOT NULL OR pa.status IN ('pending','accepted') OR pa.authorization_status IN ('AWAITING_AUTHORIZATION','AUTHORIZED'))
  );
$$;

CREATE OR REPLACE FUNCTION public.tfs_supersede_pending_authorizations(p_booking_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only pending/current requests are superseded. Accepted authorization records,
  -- authorization_snapshots, and evidence payloads are immutable historical proof.
  UPDATE public.passenger_authorizations
     SET status = 'superseded',
         authorization_status = 'SUPERSEDED',
         reauthorization_requested_at = NOW(),
         reauthorization_reason = LEFT(COALESCE(p_reason, 'Booking materially changed'), 500),
         updated_at = NOW()
   WHERE booking_id = p_booking_id
     AND consumed_at IS NULL
     AND (status = 'pending' OR authorization_status = 'AWAITING_AUTHORIZATION');
END;
$$;

CREATE OR REPLACE FUNCTION public.tfs_booking_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  material_price_change BOOLEAN;
  had_auth BOOLEAN;
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := NOW();

  material_price_change :=
       NEW.customer_price IS DISTINCT FROM OLD.customer_price
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.authorized_amount IS DISTINCT FROM OLD.authorized_amount;

  IF material_price_change THEN
    had_auth := public.tfs_has_authorization(OLD.id);
    IF had_auth THEN
      NEW.authorization_status := 'REAUTHORIZATION_REQUIRED';
      NEW.authorization_token := NULL;
      NEW.authorization_expires_at := NULL;
      NEW.authorized_at := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tfs_booking_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fields TEXT[] := ARRAY[]::TEXT[];
  material_price_change BOOLEAN;
BEGIN
  material_price_change :=
       NEW.customer_price IS DISTINCT FROM OLD.customer_price
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.authorized_amount IS DISTINCT FROM OLD.authorized_amount;

  IF material_price_change AND public.tfs_has_authorization(NEW.id) THEN
    PERFORM public.tfs_supersede_pending_authorizations(NEW.id, 'Pricing or authorized amount changed');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN fields := array_append(fields, 'status'); END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN fields := array_append(fields, 'payment_status'); END IF;
  IF NEW.customer_price IS DISTINCT FROM OLD.customer_price THEN fields := array_append(fields, 'customer_price'); END IF;
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN fields := array_append(fields, 'total_amount'); END IF;
  IF NEW.supplier_price IS DISTINCT FROM OLD.supplier_price THEN fields := array_append(fields, 'supplier_price'); END IF;
  IF NEW.supplier_fare IS DISTINCT FROM OLD.supplier_fare THEN fields := array_append(fields, 'supplier_fare'); END IF;
  IF NEW.taxes_and_fees IS DISTINCT FROM OLD.taxes_and_fees THEN fields := array_append(fields, 'taxes_and_fees'); END IF;
  IF NEW.internal_notes IS DISTINCT FROM OLD.internal_notes THEN fields := array_append(fields, 'internal_notes'); END IF;
  IF NEW.airline_confirmation_number IS DISTINCT FROM OLD.airline_confirmation_number THEN fields := array_append(fields, 'airline_confirmation_number'); END IF;
  IF NEW.ticket_number IS DISTINCT FROM OLD.ticket_number THEN fields := array_append(fields, 'ticket_number'); END IF;
  IF NEW.ticket_issued_at IS DISTINCT FROM OLD.ticket_issued_at THEN fields := array_append(fields, 'ticket_issued_at'); END IF;

  IF cardinality(fields) > 0 THEN
    INSERT INTO public.booking_change_events(
      booking_id, version_before, version_after, change_scope, changed_fields,
      old_value, new_value, actor, reason
    ) VALUES (
      NEW.id, OLD.version, NEW.version, 'booking', fields,
      to_jsonb(OLD), to_jsonb(NEW), 'database-sync',
      CASE WHEN material_price_change THEN 'Material booking/pricing change' ELSE 'Booking fields updated' END
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tfs_sync_booking_child_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid UUID;
  old_version INTEGER;
  new_version INTEGER;
  had_auth BOOLEAN := FALSE;
  material BOOLEAN := FALSE;
  reason TEXT;
  fields TEXT[] := ARRAY[]::TEXT[];
  projection JSONB := '{}'::JSONB;
  primary_name TEXT;
  primary_email TEXT;
  primary_phone TEXT;
  first_airline TEXT;
  first_carrier TEXT;
  latest_payment_status TEXT;
BEGIN
  bid := COALESCE(NEW.booking_id, OLD.booking_id);
  IF bid IS NULL THEN RETURN NULL; END IF;

  SELECT version INTO old_version FROM public.bookings WHERE id = bid;
  IF old_version IS NULL THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'contacts' THEN
    SELECT c.email, c.phone_number
      INTO primary_email, primary_phone
      FROM public.contacts c
     WHERE c.booking_id = bid
     ORDER BY c.created_at ASC, c.id ASC
     LIMIT 1;

    projection := jsonb_build_object('email', primary_email, 'phone', primary_phone);
    fields := ARRAY['email','phone'];
    reason := 'Primary contact changed';

    UPDATE public.bookings b
       SET email = COALESCE(primary_email, b.email),
           phone = primary_phone,
           version = b.version + 1,
           updated_at = NOW()
     WHERE b.id = bid;

  ELSIF TG_TABLE_NAME = 'travellers' THEN
    SELECT concat_ws(' ', t.first_name, NULLIF(t.middle_name, ''), t.last_name)
      INTO primary_name
      FROM public.travellers t
     WHERE t.booking_id = bid
     ORDER BY t.created_at ASC, t.id ASC
     LIMIT 1;

    material := TG_OP <> 'UPDATE'
      OR NEW.first_name IS DISTINCT FROM OLD.first_name
      OR NEW.middle_name IS DISTINCT FROM OLD.middle_name
      OR NEW.last_name IS DISTINCT FROM OLD.last_name
      OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
      OR NEW.passport_number IS DISTINCT FROM OLD.passport_number
      OR NEW.passport_expiry IS DISTINCT FROM OLD.passport_expiry;
    had_auth := material AND public.tfs_has_authorization(bid);
    projection := jsonb_build_object('passenger_name', primary_name);
    fields := ARRAY['passengers','passenger_name'];
    reason := 'Passenger identity/details changed';

    UPDATE public.bookings b
       SET passenger_name = COALESCE(NULLIF(primary_name, ''), b.passenger_name),
           authorization_status = CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
           authorization_token = CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
           authorization_expires_at = CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
           authorized_at = CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
           version = b.version + 1,
           updated_at = NOW()
     WHERE b.id = bid;

  ELSIF TG_TABLE_NAME = 'flights' THEN
    SELECT f.airline_name, f.carrier_code
      INTO first_airline, first_carrier
      FROM public.flights f
     WHERE f.booking_id = bid
     ORDER BY CASE WHEN lower(f.leg) IN ('return','inbound') THEN 1 ELSE 0 END, f.created_at ASC, f.id ASC
     LIMIT 1;

    material := TRUE;
    had_auth := public.tfs_has_authorization(bid);
    projection := jsonb_build_object('airline_name', first_airline, 'airline_code', first_carrier);
    fields := ARRAY['itinerary','airline_name','airline_code'];
    reason := 'Flight itinerary changed';

    UPDATE public.bookings b
       SET airline_name = COALESCE(first_airline, b.airline_name),
           airline_code = COALESCE(first_carrier, b.airline_code),
           authorization_status = CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
           authorization_token = CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
           authorization_expires_at = CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
           authorized_at = CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
           version = b.version + 1,
           updated_at = NOW()
     WHERE b.id = bid;

  ELSIF TG_TABLE_NAME = 'booking_payment_splits' THEN
    material := TRUE;
    had_auth := public.tfs_has_authorization(bid);
    fields := ARRAY['payment_splits'];
    reason := 'Payment authorization split changed';

    UPDATE public.bookings b
       SET authorization_status = CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
           authorization_token = CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
           authorization_expires_at = CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
           authorized_at = CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
           version = b.version + 1,
           updated_at = NOW()
     WHERE b.id = bid;

  ELSIF TG_TABLE_NAME = 'booking_payment_methods' THEN
    material := TG_OP <> 'UPDATE'
      OR NEW.cardholder_name IS DISTINCT FROM OLD.cardholder_name
      OR NEW.card_brand IS DISTINCT FROM OLD.card_brand
      OR NEW.card_last4 IS DISTINCT FROM OLD.card_last4
      OR NEW.card_exp_month IS DISTINCT FROM OLD.card_exp_month
      OR NEW.card_exp_year IS DISTINCT FROM OLD.card_exp_year;
    had_auth := material AND public.tfs_has_authorization(bid);
    fields := ARRAY['payment_method','billing_details'];
    reason := CASE WHEN material THEN 'Payment method reference changed' ELSE 'Billing details changed' END;

    UPDATE public.bookings b
       SET authorization_status = CASE WHEN had_auth THEN 'REAUTHORIZATION_REQUIRED' ELSE b.authorization_status END,
           authorization_token = CASE WHEN had_auth THEN NULL ELSE b.authorization_token END,
           authorization_expires_at = CASE WHEN had_auth THEN NULL ELSE b.authorization_expires_at END,
           authorized_at = CASE WHEN had_auth THEN NULL ELSE b.authorized_at END,
           version = b.version + 1,
           updated_at = NOW()
     WHERE b.id = bid;

  ELSIF TG_TABLE_NAME = 'payments' THEN
    SELECT upper(p.payment_status)
      INTO latest_payment_status
      FROM public.payments p
     WHERE p.booking_id = bid
     ORDER BY COALESCE(p.payment_date,p.created_at) DESC, p.created_at DESC
     LIMIT 1;

    projection := jsonb_build_object('payment_status', latest_payment_status);
    fields := ARRAY['payment_status'];
    reason := 'Payment operational state changed';

    UPDATE public.bookings b
       SET payment_status = COALESCE(latest_payment_status, b.payment_status),
           version = b.version + 1,
           updated_at = NOW()
     WHERE b.id = bid;
  END IF;

  SELECT version INTO new_version FROM public.bookings WHERE id = bid;

  IF had_auth THEN
    PERFORM public.tfs_supersede_pending_authorizations(bid, reason);
  END IF;

  INSERT INTO public.booking_change_events(
    booking_id, version_before, version_after, change_scope, changed_fields,
    old_value, new_value, actor, reason
  ) VALUES (
    bid, old_version, COALESCE(new_version, old_version + 1), TG_TABLE_NAME, fields,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'database-sync', reason
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tfs_booking_before_update ON public.bookings;
CREATE TRIGGER trg_tfs_booking_before_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tfs_booking_before_update();

DROP TRIGGER IF EXISTS trg_tfs_booking_after_update ON public.bookings;
CREATE TRIGGER trg_tfs_booking_after_update
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tfs_booking_after_update();

DROP TRIGGER IF EXISTS trg_tfs_contacts_sync ON public.contacts;
CREATE TRIGGER trg_tfs_contacts_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_booking_child_change();

DROP TRIGGER IF EXISTS trg_tfs_travellers_sync ON public.travellers;
CREATE TRIGGER trg_tfs_travellers_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.travellers
  FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_booking_child_change();

DROP TRIGGER IF EXISTS trg_tfs_flights_sync ON public.flights;
CREATE TRIGGER trg_tfs_flights_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.flights
  FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_booking_child_change();

DROP TRIGGER IF EXISTS trg_tfs_payment_splits_sync ON public.booking_payment_splits;
CREATE TRIGGER trg_tfs_payment_splits_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_payment_splits
  FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_booking_child_change();

DROP TRIGGER IF EXISTS trg_tfs_payment_method_sync ON public.booking_payment_methods;
CREATE TRIGGER trg_tfs_payment_method_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_booking_child_change();

DROP TRIGGER IF EXISTS trg_tfs_payments_sync ON public.payments;
CREATE TRIGGER trg_tfs_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tfs_sync_booking_child_change();

NOTIFY pgrst, 'reload schema';
