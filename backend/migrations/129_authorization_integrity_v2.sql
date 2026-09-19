-- Authorization Integrity V2
alter table public.bookings add column if not exists booking_revision integer not null default 1;
alter table public.passenger_authorizations add column if not exists request_snapshot jsonb;
alter table public.passenger_authorizations add column if not exists request_snapshot_hash varchar(64);
alter table public.passenger_authorizations add column if not exists superseded_at timestamptz;
alter table public.passenger_authorizations add column if not exists revoked_at timestamptz;
alter table public.passenger_authorizations add column if not exists declined_at timestamptz;
alter table public.passenger_authorizations add column if not exists status_reason text;
alter table public.authorization_snapshots add column if not exists booking_revision integer;
alter table public.authorization_snapshots add column if not exists request_snapshot_hash varchar(64);
alter table public.payment_authorization_splits add column if not exists merchant_type varchar(24);
alter table public.payment_authorization_splits add column if not exists merchant_code varchar(8);
alter table public.booking_payment_splits add column if not exists merchant_type varchar(24);
alter table public.booking_payment_splits add column if not exists merchant_code varchar(8);
create index if not exists idx_passenger_authorizations_booking_revision on public.passenger_authorizations (booking_id, authorization_revision, created_at desc);
create index if not exists idx_passenger_authorizations_status on public.passenger_authorizations (booking_id, status, created_at desc);
