-- Store the number of additional checked bags requested during checkout.
-- This is a request only; baggage is confirmed and paid after booking subject to airline availability and fees.

ALTER TABLE public.booking_service_requests
  ADD COLUMN IF NOT EXISTS additional_baggage_count SMALLINT NOT NULL DEFAULT 0
  CHECK (additional_baggage_count BETWEEN 0 AND 6);

COMMENT ON COLUMN public.booking_service_requests.additional_baggage_count IS
  'Additional checked bags requested by the customer. Availability and airline fees are confirmed after booking.';
