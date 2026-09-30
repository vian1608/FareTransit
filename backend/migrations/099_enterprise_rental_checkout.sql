-- Enterprise car-rental search, quote, checkout, and manual-fulfillment workflow.
-- Sensitive card data is intentionally not stored here. NMI retains card data;
-- FareTransit stores only gateway transaction identifiers and operational state.

create table if not exists public.car_rental_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_token text not null unique,
  status text not null default 'active' check (status in ('active','checkout_started','expired','cancelled')),
  provider text not null default 'enterprise',
  search_snapshot jsonb not null default '{}'::jsonb,
  vehicle_snapshot jsonb not null default '{}'::jsonb,
  selling_price numeric(12,2) not null check (selling_price >= 0),
  currency varchar(3) not null default 'USD',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_rental_quotes_expires_idx on public.car_rental_quotes (expires_at);
create index if not exists car_rental_quotes_status_idx on public.car_rental_quotes (status, created_at desc);

create table if not exists public.car_rental_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  public_token text not null unique,
  quote_token text not null references public.car_rental_quotes(quote_token) on delete restrict,
  status text not null default 'payment_pending' check (status in (
    'payment_pending',
    'awaiting_manual_booking',
    'booking_failed',
    'confirmed',
    'cancelled'
  )),
  payment_status text not null default 'not_started' check (payment_status in (
    'not_started',
    'authorizing',
    'authorized',
    'captured',
    'refunded'
  )),
  provider text not null default 'enterprise',
  customer jsonb not null default '{}'::jsonb,
  billing jsonb not null default '{}'::jsonb,
  search_snapshot jsonb not null default '{}'::jsonb,
  vehicle_snapshot jsonb not null default '{}'::jsonb,
  pickup_location_snapshot jsonb,
  return_location_snapshot jsonb,
  amount numeric(12,2) not null check (amount >= 0),
  currency varchar(3) not null default 'USD',
  nmi_payment_id text,
  nmi_authorization_code text,
  nmi_capture_id text,
  supplier_confirmation text,
  supplier_cost numeric(12,2) check (supplier_cost is null or supplier_cost >= 0),
  gross_margin numeric(12,2),
  admin_action_required text,
  authorized_at timestamptz,
  captured_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_rental_orders_status_idx on public.car_rental_orders (status, created_at desc);
create index if not exists car_rental_orders_payment_status_idx on public.car_rental_orders (payment_status, created_at desc);
create index if not exists car_rental_orders_quote_idx on public.car_rental_orders (quote_token);

alter table public.car_rental_quotes enable row level security;
alter table public.car_rental_orders enable row level security;

-- No anonymous/authenticated policies are created. The backend uses the service-role
-- key and is the only supported access path for these records.

comment on table public.car_rental_quotes is 'Server-authoritative snapshots of Enterprise rental rates used by FareTransit checkout.';
comment on table public.car_rental_orders is 'FareTransit Enterprise rental checkout orders fulfilled manually after NMI authorization.';
