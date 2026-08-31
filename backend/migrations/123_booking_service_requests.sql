-- Persist customer assistance/preferences as an operational booking record.
-- This keeps meal/seat/wheelchair/free-text requests queryable for admin staff.

CREATE TABLE IF NOT EXISTS public.booking_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  meal_preference VARCHAR(60),
  seat_preference VARCHAR(60),
  wheelchair_required BOOLEAN NOT NULL DEFAULT FALSE,
  additional_request TEXT,
  assistance_status VARCHAR(24) NOT NULL DEFAULT 'NONE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_service_requests_status_check
    CHECK (assistance_status IN ('NONE', 'REQUESTED', 'ACKNOWLEDGED', 'COMPLETED'))
);

CREATE INDEX IF NOT EXISTS idx_booking_service_requests_booking
  ON public.booking_service_requests(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_service_requests_status
  ON public.booking_service_requests(assistance_status);

ALTER TABLE public.booking_service_requests ENABLE ROW LEVEL SECURITY;
