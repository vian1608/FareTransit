-- Align booking/payment metadata columns used by the admin Payment & Splits workflow.
-- Prevents schema-cache failures when saving split totals and transaction references.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS transaction_reference text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_provider varchar(50),
  ADD COLUMN IF NOT EXISTS provider_checkout_id text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS authorized_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.bookings.transaction_reference IS 'Admin/manual transaction or reference ID for the booking payment state.';
COMMENT ON COLUMN public.bookings.provider_payment_id IS 'Provider payment identifier mirrored from the canonical payment record when available.';
COMMENT ON COLUMN public.bookings.payment_provider IS 'Payment provider summary for booking-level operational views.';
COMMENT ON COLUMN public.bookings.provider_checkout_id IS 'Provider checkout/session identifier mirrored for booking-level operational views.';
COMMENT ON COLUMN public.payments.authorized_amount IS 'Amount authorized for this payment record.';

NOTIFY pgrst, 'reload schema';
