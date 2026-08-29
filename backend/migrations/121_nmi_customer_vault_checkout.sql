-- Migration 121: NMI Customer Vault checkout
-- Passenger card data is tokenized in NMI-hosted browser fields and persisted in NMI Customer Vault.
-- FareTransit stores only the NMI vault reference, masked card metadata and billing/contact metadata.
-- No raw PAN or CVV/CVC may be stored in Supabase.

ALTER TABLE IF EXISTS public.booking_payment_methods
  DROP COLUMN IF EXISTS card_cvv;

ALTER TABLE IF EXISTS public.booking_payment_methods
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS tokenization_status TEXT DEFAULT 'TOKENIZED';

CREATE INDEX IF NOT EXISTS idx_booking_payment_methods_provider_customer
  ON public.booking_payment_methods(payment_provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL AND removed_at IS NULL;

COMMENT ON COLUMN public.booking_payment_methods.provider_customer_id IS
  'Persistent customer/card reference held by the external payment provider (NMI Customer Vault for nmi records).';

COMMENT ON COLUMN public.booking_payment_methods.provider_payment_method_id IS
  'External payment method/billing reference. Never contains PAN or CVV.';

COMMENT ON COLUMN public.booking_payment_methods.card_last4 IS
  'Display-only last four digits; never a full PAN.';

NOTIFY pgrst, 'reload schema';
