create extension if not exists pgcrypto;

create table if not exists public.booking_addon_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  traveller_id uuid not null references public.travellers(id) on delete cascade,
  passenger_index integer not null default 0 check (passenger_index >= 0),
  addon_type text not null default 'CHECKED_BAGGAGE' check (addon_type in ('CHECKED_BAGGAGE')),
  journey_direction text not null check (journey_direction in ('OUTBOUND','RETURN')),
  quantity integer not null check (quantity between 1 and 5),
  requested_weight_kg numeric(6,2) not null default 23 check (requested_weight_kg > 0),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','CHECKING_AVAILABILITY','AVAILABLE','PRICE_CONFIRMED','OFFER_SENT','AWAITING_PAYMENT','PAID','PURCHASE_PENDING','CONFIRMED','UNAVAILABLE','DECLINED_BY_CUSTOMER','PRICE_EXPIRED','PAYMENT_FAILED','PURCHASE_FAILED','REFUNDED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, traveller_id, addon_type, journey_direction)
);

create table if not exists public.addon_quotes (
  id uuid primary key default gen_random_uuid(),
  addon_request_id uuid not null unique references public.booking_addon_requests(id) on delete cascade,
  supplier_cost numeric(12,2) not null check (supplier_cost >= 0),
  customer_price numeric(12,2) not null check (customer_price >= supplier_cost),
  currency text not null default 'USD' check (char_length(currency) = 3),
  valid_until timestamptz,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','EXPIRED','ACCEPTED','DECLINED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.addon_payments (
  id uuid primary key default gen_random_uuid(),
  addon_request_id uuid not null references public.booking_addon_requests(id) on delete cascade,
  addon_quote_id uuid references public.addon_quotes(id) on delete set null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  payment_provider text,
  provider_transaction_id text unique,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','PAID','FAILED','REFUNDED')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.addon_fulfillments (
  id uuid primary key default gen_random_uuid(),
  addon_request_id uuid not null unique references public.booking_addon_requests(id) on delete cascade,
  supplier text,
  supplier_reference text,
  status text not null default 'PURCHASE_PENDING' check (status in ('PURCHASE_PENDING','CONFIRMED','PURCHASE_FAILED','REFUNDED','CANCELLED')),
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_addon_requests_booking on public.booking_addon_requests(booking_id);
create index if not exists idx_booking_addon_requests_traveller on public.booking_addon_requests(traveller_id);
create index if not exists idx_booking_addon_requests_status on public.booking_addon_requests(status);
create index if not exists idx_addon_quotes_token on public.addon_quotes(public_token);
create index if not exists idx_addon_payments_booking on public.addon_payments(booking_id);
create index if not exists idx_addon_payments_request on public.addon_payments(addon_request_id);
create index if not exists idx_addon_payments_quote on public.addon_payments(addon_quote_id);

alter table public.booking_addon_requests enable row level security;
alter table public.addon_quotes enable row level security;
alter table public.addon_payments enable row level security;
alter table public.addon_fulfillments enable row level security;

revoke all on table public.booking_addon_requests, public.addon_quotes, public.addon_payments, public.addon_fulfillments from anon, authenticated;
grant select, insert, update, delete on table public.booking_addon_requests, public.addon_quotes, public.addon_payments, public.addon_fulfillments to service_role;
