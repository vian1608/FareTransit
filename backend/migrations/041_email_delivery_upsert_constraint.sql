-- 041_email_delivery_upsert_constraint.sql
-- Email delivery tracking upserts use ON CONFLICT (booking_id, email_type).
-- Keep the database constraint aligned with that application contract.

CREATE UNIQUE INDEX IF NOT EXISTS ux_email_deliveries_booking_type
  ON public.email_deliveries (booking_id, email_type);

NOTIFY pgrst, 'reload schema';
