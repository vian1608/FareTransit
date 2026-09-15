-- One read model for every FareTransit reservation service.
-- This eliminates Flight/Car/Hotel parity drift in search, dashboard, customers,
-- payments and customer-facing reservation lookup.

CREATE OR REPLACE VIEW public.canonical_reservations
WITH (security_invoker = true)
AS
SELECT
  b.id,
  b.confirmation_code::text AS reference,
  'FLIGHT'::text AS service_type,
  COALESCE(b.status, 'PENDING')::text AS status,
  COALESCE(b.payment_status, 'PENDING')::text AS payment_status,
  b.authorization_status::text AS authorization_status,
  b.passenger_name::text AS customer_name,
  b.email::text AS customer_email,
  b.phone::text AS customer_phone,
  COALESCE(b.customer_price, b.total_amount, 0)::numeric AS total_amount,
  COALESCE(b.currency, 'USD')::text AS currency,
  (
    SELECT (s.departure_date::timestamp AT TIME ZONE 'UTC')
    FROM public.booking_itinerary_segments s
    WHERE s.booking_id = b.id
    ORDER BY COALESCE(s.segment_sequence, s.segment_order, 9999), s.id
    LIMIT 1
  ) AS travel_at,
  b.created_at,
  b.updated_at,
  b.assigned_agent_id,
  b.team_id,
  b.trip_id,
  (
    SELECT s.origin_airport::text
    FROM public.booking_itinerary_segments s
    WHERE s.booking_id = b.id
    ORDER BY COALESCE(s.segment_sequence, s.segment_order, 9999), s.id
    LIMIT 1
  ) AS origin,
  (
    SELECT s.destination_airport::text
    FROM public.booking_itinerary_segments s
    WHERE s.booking_id = b.id
    ORDER BY COALESCE(s.segment_sequence, s.segment_order, 9999) DESC, s.id DESC
    LIMIT 1
  ) AS destination,
  b.airline_name::text AS airline_name,
  NULL::text AS rental_company_name,
  NULL::text AS vehicle_name,
  NULL::text AS vehicle_category,
  NULL::text AS pickup_location,
  NULL::timestamptz AS pickup_at,
  NULL::text AS dropoff_location,
  NULL::timestamptz AS dropoff_at,
  COALESCE(b.supplier_confirmation_code, b.supplier_confirmation)::text AS supplier_confirmation,
  NULL::text AS property_name,
  NULL::date AS check_in,
  NULL::date AS check_out,
  NULL::text AS supplier_name
FROM public.bookings b
WHERE b.deleted_at IS NULL

UNION ALL

SELECT
  r.id,
  r.booking_reference::text AS reference,
  'CAR'::text AS service_type,
  COALESCE(r.reservation_status, 'DRAFT')::text AS status,
  COALESCE(r.payment_status, 'PENDING')::text AS payment_status,
  COALESCE(r.authorization_status, 'NONE')::text AS authorization_status,
  r.customer_name::text AS customer_name,
  r.customer_email::text AS customer_email,
  r.customer_phone::text AS customer_phone,
  COALESCE(r.total_amount, 0)::numeric AS total_amount,
  COALESCE(r.currency, 'USD')::text AS currency,
  c.pickup_at AS travel_at,
  r.created_at,
  r.updated_at,
  r.assigned_agent_id,
  r.team_id,
  r.trip_id,
  c.pickup_location::text AS origin,
  c.dropoff_location::text AS destination,
  NULL::text AS airline_name,
  c.rental_company_name::text AS rental_company_name,
  c.vehicle_name::text AS vehicle_name,
  c.vehicle_category::text AS vehicle_category,
  c.pickup_location::text AS pickup_location,
  c.pickup_at,
  c.dropoff_location::text AS dropoff_location,
  c.dropoff_at,
  c.supplier_confirmation::text AS supplier_confirmation,
  NULL::text AS property_name,
  NULL::date AS check_in,
  NULL::date AS check_out,
  NULL::text AS supplier_name
FROM public.reservations r
LEFT JOIN public.car_reservations c ON c.reservation_id = r.id
WHERE r.service_type = 'CAR'

UNION ALL

SELECT
  h.id,
  h.hotel_code::text AS reference,
  'HOTEL'::text AS service_type,
  COALESCE(h.status, 'REQUESTED')::text AS status,
  COALESCE(h.payment_status, 'PENDING')::text AS payment_status,
  NULL::text AS authorization_status,
  h.customer_name::text AS customer_name,
  h.customer_email::text AS customer_email,
  h.customer_phone::text AS customer_phone,
  COALESCE(h.total, 0)::numeric AS total_amount,
  COALESCE(h.currency, 'USD')::text AS currency,
  (h.check_in::timestamp AT TIME ZONE 'UTC') AS travel_at,
  h.created_at,
  h.updated_at,
  h.assigned_agent_id,
  h.team_id,
  h.trip_id,
  h.destination::text AS origin,
  h.destination::text AS destination,
  NULL::text AS airline_name,
  NULL::text AS rental_company_name,
  NULL::text AS vehicle_name,
  NULL::text AS vehicle_category,
  NULL::text AS pickup_location,
  NULL::timestamptz AS pickup_at,
  NULL::text AS dropoff_location,
  NULL::timestamptz AS dropoff_at,
  h.supplier_confirmation_number::text AS supplier_confirmation,
  h.property_name::text AS property_name,
  h.check_in,
  h.check_out,
  h.supplier_name::text AS supplier_name
FROM public.hotel_bookings h;

COMMENT ON VIEW public.canonical_reservations IS
  'Canonical read model for FareTransit Flight, Car and Hotel reservations.';
