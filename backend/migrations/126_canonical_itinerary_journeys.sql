-- Canonical itinerary architecture: the admin-selected trip type is authoritative.
-- One-way and round-trip journeys may contain multiple flight segments.
-- Multi-city uses explicit journey_index values (Trip 1, Trip 2, ...).

alter table public.bookings add column if not exists itinerary_type varchar(20);
alter table public.booking_itinerary_segments add column if not exists journey_index integer;
alter table public.booking_itinerary_segments add column if not exists journey_role varchar(20);

update public.bookings b
set itinerary_type = case
  when exists (
    select 1 from public.booking_itinerary_segments s
    where s.booking_id = b.id
      and lower(coalesce(s.trip_type, '')) in ('multi_city','multi-city','multicity')
  ) then 'MULTI_CITY'
  when exists (
    select 1 from public.booking_itinerary_segments s
    where s.booking_id = b.id
      and lower(coalesce(s.journey_direction, s.direction, '')) in ('return','inbound')
  ) then 'ROUND_TRIP'
  else 'ONE_WAY'
end
where b.itinerary_type is null or b.itinerary_type = '';

update public.booking_itinerary_segments s
set journey_index = case
      when lower(coalesce(s.journey_direction, s.direction, '')) in ('return','inbound') then 2
      else 1
    end,
    journey_role = case
      when lower(coalesce(s.journey_direction, s.direction, '')) in ('return','inbound') then 'RETURN'
      else 'OUTBOUND'
    end
where s.journey_index is null or s.journey_role is null;

update public.booking_itinerary_segments s
set trip_type = coalesce(b.itinerary_type, 'ONE_WAY')
from public.bookings b
where b.id = s.booking_id;

alter table public.bookings alter column itinerary_type set default 'ONE_WAY';
alter table public.bookings alter column itinerary_type set not null;
alter table public.booking_itinerary_segments alter column journey_index set default 1;
alter table public.booking_itinerary_segments alter column journey_index set not null;
alter table public.booking_itinerary_segments alter column journey_role set default 'OUTBOUND';
alter table public.booking_itinerary_segments alter column journey_role set not null;

alter table public.bookings drop constraint if exists bookings_itinerary_type_check;
alter table public.bookings add constraint bookings_itinerary_type_check
  check (itinerary_type in ('ONE_WAY','ROUND_TRIP','MULTI_CITY'));

alter table public.booking_itinerary_segments drop constraint if exists booking_itinerary_segments_journey_role_check;
alter table public.booking_itinerary_segments add constraint booking_itinerary_segments_journey_role_check
  check (journey_role in ('OUTBOUND','RETURN','TRIP'));

create index if not exists booking_itinerary_segments_journey_order_idx
  on public.booking_itinerary_segments (booking_id, journey_index, segment_sequence, segment_order);
