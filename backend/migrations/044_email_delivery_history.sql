-- 044_email_delivery_history.sql
CREATE TABLE IF NOT EXISTS public.email_delivery_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  confirmation_code VARCHAR(64),
  email_type VARCHAR(80) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  status VARCHAR(40) NOT NULL,
  provider VARCHAR(40),
  provider_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  attempt_count INTEGER,
  sent_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  event_type VARCHAR(20) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_delivery_history_booking ON public.email_delivery_history(booking_id,captured_at DESC);
ALTER TABLE public.email_delivery_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tfs_capture_email_delivery_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.email_deliveries%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN r:=OLD; ELSE r:=NEW; END IF;
  INSERT INTO public.email_delivery_history(
    delivery_id,booking_id,confirmation_code,email_type,recipient,status,provider,
    provider_message_id,error_code,error_message,attempt_count,sent_at,
    source_updated_at,event_type
  ) VALUES (
    r.id,r.booking_id,r.confirmation_code,r.email_type,r.recipient,r.status,r.provider,
    r.provider_message_id,r.error_code,r.error_message,r.attempt_count,r.sent_at,
    r.updated_at,CASE WHEN TG_OP='INSERT' THEN 'CREATED' ELSE 'SUPERSEDED' END
  );
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_tfs_email_delivery_history_insert ON public.email_deliveries;
CREATE TRIGGER trg_tfs_email_delivery_history_insert AFTER INSERT ON public.email_deliveries
FOR EACH ROW EXECUTE FUNCTION public.tfs_capture_email_delivery_history();
DROP TRIGGER IF EXISTS trg_tfs_email_delivery_history_update ON public.email_deliveries;
CREATE TRIGGER trg_tfs_email_delivery_history_update BEFORE UPDATE ON public.email_deliveries
FOR EACH ROW EXECUTE FUNCTION public.tfs_capture_email_delivery_history();
