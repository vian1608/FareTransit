-- Persist the baggage quote shown during checkout for staff follow-up.
-- Baggage remains payable after booking and subject to airline confirmation.

ALTER TABLE public.booking_service_requests
  ADD COLUMN IF NOT EXISTS additional_baggage_quote JSONB,
  ADD COLUMN IF NOT EXISTS additional_baggage_source_total NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS additional_baggage_customer_total NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS additional_baggage_currency VARCHAR(3);

ALTER TABLE public.booking_service_requests
  DROP CONSTRAINT IF EXISTS booking_service_requests_baggage_source_total_nonnegative;
ALTER TABLE public.booking_service_requests
  ADD CONSTRAINT booking_service_requests_baggage_source_total_nonnegative
  CHECK (additional_baggage_source_total IS NULL OR additional_baggage_source_total >= 0);

ALTER TABLE public.booking_service_requests
  DROP CONSTRAINT IF EXISTS booking_service_requests_baggage_customer_total_nonnegative;
ALTER TABLE public.booking_service_requests
  ADD CONSTRAINT booking_service_requests_baggage_customer_total_nonnegative
  CHECK (additional_baggage_customer_total IS NULL OR additional_baggage_customer_total >= 0);

COMMENT ON COLUMN public.booking_service_requests.additional_baggage_quote IS
  'Checkout-time baggage quote snapshot based on airline-provided pricing; final availability and amount are confirmed after booking.';
COMMENT ON COLUMN public.booking_service_requests.additional_baggage_source_total IS
  'Underlying airline-provided baggage total used to prepare the FareTransit baggage quote.';
COMMENT ON COLUMN public.booking_service_requests.additional_baggage_customer_total IS
  'FareTransit baggage amount quoted to the customer for later payment after booking confirmation.';
