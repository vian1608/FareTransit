-- 045_authorization_snapshot_immutability.sql
CREATE OR REPLACE FUNCTION public.tfs_freeze_closed_authorization()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.consumed_at IS NOT NULL OR lower(COALESCE(OLD.status,'')) IN ('accepted','superseded') THEN
    NEW.authorized_amount:=OLD.authorized_amount;
    NEW.booking_amount:=OLD.booking_amount;
    NEW.currency:=OLD.currency;
    NEW.quote_snapshot:=OLD.quote_snapshot;
    NEW.itinerary_snapshot:=OLD.itinerary_snapshot;
    NEW.policies_snapshot:=OLD.policies_snapshot;
    NEW.authorization_snapshot:=OLD.authorization_snapshot;
    NEW.evidence_payload:=OLD.evidence_payload;
    NEW.payment_method_token:=OLD.payment_method_token;
    NEW.card_brand:=OLD.card_brand;
    NEW.card_last4:=OLD.card_last4;
    NEW.payment_card_brand:=OLD.payment_card_brand;
    NEW.payment_card_last4:=OLD.payment_card_last4;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_tfs_freeze_closed_authorization ON public.passenger_authorizations;
CREATE TRIGGER trg_tfs_freeze_closed_authorization BEFORE UPDATE ON public.passenger_authorizations
FOR EACH ROW EXECUTE FUNCTION public.tfs_freeze_closed_authorization();

CREATE OR REPLACE FUNCTION public.tfs_reject_authorization_snapshot_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'authorization_snapshots are immutable';
END; $$;
DROP TRIGGER IF EXISTS trg_tfs_authorization_snapshot_immutable ON public.authorization_snapshots;
CREATE TRIGGER trg_tfs_authorization_snapshot_immutable BEFORE UPDATE ON public.authorization_snapshots
FOR EACH ROW EXECUTE FUNCTION public.tfs_reject_authorization_snapshot_update();
