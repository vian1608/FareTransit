CREATE TABLE IF NOT EXISTS public.manual_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id UUID NOT NULL UNIQUE REFERENCES public.payment_authorizations(id) ON DELETE CASCADE,
  cardholder_name TEXT NOT NULL,
  card_brand TEXT,
  last4 VARCHAR(4) NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  exp_month INTEGER NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year INTEGER NOT NULL CHECK (exp_year BETWEEN 2020 AND 2200),
  billing_address JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'MANUAL_METADATA',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_payment_methods_authorization_id
  ON public.manual_payment_methods(authorization_id);

ALTER TABLE public.manual_payment_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_payment_methods FROM anon, authenticated;

COMMENT ON TABLE public.manual_payment_methods IS
  'Non-sensitive manual payment metadata only. Never store full card number, card security code, track data, or PIN.';
