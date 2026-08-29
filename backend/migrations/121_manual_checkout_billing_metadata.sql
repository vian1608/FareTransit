-- Migration 121: FareTransit manual checkout billing metadata
-- Customer checkout stores billing/contact details plus masked card metadata only.
-- No external payment gateway is required for this workflow.
-- Raw PAN and CVV/CVC are intentionally not persisted.
-- ALLOW_DESTRUCTIVE_MIGRATION: remove the obsolete legacy card_cvv column so FareTransit cannot persist CVV.

ALTER TABLE IF EXISTS public.booking_payment_methods
  DROP COLUMN IF EXISTS card_cvv;

ALTER TABLE IF EXISTS public.booking_payment_methods
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS tokenization_status TEXT DEFAULT 'MANUAL_METADATA';

COMMENT ON COLUMN public.booking_payment_methods.provider_customer_id IS
  'Reserved compatibility field. Manual FareTransit checkout leaves this null.';

COMMENT ON COLUMN public.booking_payment_methods.provider_payment_method_id IS
  'Reserved compatibility field. Manual FareTransit checkout leaves this null.';

COMMENT ON COLUMN public.booking_payment_methods.card_last4 IS
  'Display-only last four digits; never a full PAN.';

NOTIFY pgrst, 'reload schema';
