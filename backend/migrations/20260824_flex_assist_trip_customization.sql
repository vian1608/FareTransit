create extension if not exists pgcrypto;

alter table public.booking_addon_requests
  drop constraint if exists booking_addon_requests_quantity_check;
alter table public.booking_addon_requests
  add constraint booking_addon_requests_quantity_check check (quantity between 1 and 3);
alter table public.booking_addon_requests
  add column if not exists terms_version text not null default 'BAGGAGE_REQUEST_V1';
alter table public.booking_addon_requests
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  addon_type text not null check (addon_type in ('FLEX_ASSIST')),
  quantity integer not null default 1 check (quantity = 1),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  total_price numeric(12,2) not null default 0 check (total_price >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  pricing_source text not null default 'FORMULA' check (pricing_source in ('FORMULA')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','USED','EXPIRED','REFUNDED','CANCELLED')),
  terms_version text not null default 'FLEX_V1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, addon_type)
);

create index if not exists idx_booking_addons_booking on public.booking_addons(booking_id);
create index if not exists idx_booking_addons_status on public.booking_addons(status);

create table if not exists public.flex_change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_addon_id uuid not null references public.booking_addons(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  request_type text not null check (request_type in ('TRAVEL_DATE','FLIGHT_TIME','FLIGHT','DESTINATION','OTHER')),
  requested_details jsonb not null default '{}'::jsonb,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','REVIEWING','OPTION_FOUND','CUSTOMER_APPROVAL','REBOOKING','COMPLETED','DECLINED','CANCELLED')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_flex_change_requests_booking on public.flex_change_requests(booking_id);
create index if not exists idx_flex_change_requests_status on public.flex_change_requests(status);

alter table public.booking_addons enable row level security;
alter table public.flex_change_requests enable row level security;

revoke all on table public.booking_addons, public.flex_change_requests from anon, authenticated;
grant select, insert, update, delete on table public.booking_addons, public.flex_change_requests to service_role;
