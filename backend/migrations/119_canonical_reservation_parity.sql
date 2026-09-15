-- Canonical multi-service reservation parity.
-- Additive/backwards-compatible fields used by the unified admin/customer layers.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID NULL REFERENCES public.staff_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trip_id UUID NULL REFERENCES public.trips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_assigned_agent_id ON public.reservations(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_reservations_team_id ON public.reservations(team_id);
CREATE INDEX IF NOT EXISTS idx_reservations_trip_id ON public.reservations(trip_id);
CREATE INDEX IF NOT EXISTS idx_reservations_service_status ON public.reservations(service_type, reservation_status);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_email_ci ON public.reservations(LOWER(customer_email));

ALTER TABLE public.hotel_bookings
  ADD COLUMN IF NOT EXISTS customer_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS customer_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT NULL;

UPDATE public.hotel_bookings h
SET customer_email = COALESCE(h.customer_email, c.email),
    customer_phone = COALESCE(h.customer_phone, NULLIF(CONCAT_WS('', c.country_code, c.phone_number), ''))
FROM public.contacts c
WHERE h.customer_contact_id = c.id
  AND (h.customer_email IS NULL OR h.customer_phone IS NULL);

UPDATE public.hotel_bookings h
SET customer_name = COALESCE(h.customer_name, NULLIF(TRIM(CONCAT_WS(' ', l.first_name, l.last_name)), '')),
    customer_email = COALESCE(h.customer_email, l.email),
    customer_phone = COALESCE(h.customer_phone, l.phone)
FROM public.crm_leads l
WHERE h.lead_id = l.id
  AND (h.customer_name IS NULL OR h.customer_email IS NULL OR h.customer_phone IS NULL);

CREATE INDEX IF NOT EXISTS idx_hotel_bookings_customer_email_ci ON public.hotel_bookings(LOWER(customer_email));

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS entity_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS entity_id UUID NULL,
  ADD COLUMN IF NOT EXISTS entity_code TEXT NULL;

ALTER TABLE public.refund_requests ALTER COLUMN booking_id DROP NOT NULL;

UPDATE public.refund_requests r
SET entity_type = COALESCE(r.entity_type, 'FLIGHT'),
    entity_id = COALESCE(r.entity_id, r.booking_id),
    entity_code = COALESCE(r.entity_code, b.confirmation_code)
FROM public.bookings b
WHERE r.booking_id = b.id
  AND (r.entity_type IS NULL OR r.entity_id IS NULL OR r.entity_code IS NULL);

CREATE INDEX IF NOT EXISTS idx_refund_requests_entity ON public.refund_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_entity_code ON public.refund_requests(entity_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'refund_requests_entity_type_check'
  ) THEN
    ALTER TABLE public.refund_requests
      ADD CONSTRAINT refund_requests_entity_type_check
      CHECK (entity_type IS NULL OR entity_type IN ('FLIGHT','CAR','HOTEL'));
  END IF;
END $$;
