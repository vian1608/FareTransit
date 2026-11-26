-- Additive owner-only pilot. Apply to staging before enabling. No existing table changes.
begin;
create table if not exists public.independent_tickets (
 id uuid primary key, source_booking_id uuid null, reference text not null unique,
 revision integer not null default 1 check (revision>0), draft jsonb not null,
 summary jsonb not null default '{}'::jsonb, created_by text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.independent_ticket_deliveries (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.independent_tickets(id),
 revision integer not null, idempotency_key text not null unique, payload jsonb not null, actor text not null,
 status text not null default 'queued' check(status in ('queued','processing','sent','failed','uncertain')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, provider_id text, last_error text, retry_safe boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ft_independent_ticket_history on public.independent_tickets(updated_at desc,id desc);
create index if not exists ft_independent_ticket_source on public.independent_tickets(source_booking_id);
create index if not exists ft_independent_delivery_queue on public.independent_ticket_deliveries(status,next_attempt_at);
create index if not exists ft_independent_delivery_history on public.independent_ticket_deliveries(ticket_id,created_at desc);
alter table public.independent_tickets enable row level security;
alter table public.independent_ticket_deliveries enable row level security;
revoke all on public.independent_tickets, public.independent_ticket_deliveries from public, anon, authenticated;
grant select,insert,update on public.independent_tickets,public.independent_ticket_deliveries to service_role;
create or replace function public.ft_enqueue_independent_ticket(p_ticket uuid,p_revision integer,p_key text,p_payload jsonb,p_actor text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 perform 1 from public.independent_tickets where id=p_ticket and revision=p_revision for update;
 if not found then return null; end if;
 insert into public.independent_ticket_deliveries(ticket_id,revision,idempotency_key,payload,actor)
 values(p_ticket,p_revision,p_key,p_payload,p_actor)
 on conflict(idempotency_key) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.independent_ticket_deliveries where idempotency_key=p_key; end if;
 return v_id;
end $$;
revoke execute on function public.ft_enqueue_independent_ticket(uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.ft_enqueue_independent_ticket(uuid,integer,text,jsonb,text) to service_role;
create or replace function public.ft_claim_independent_ticket()
returns setof public.independent_ticket_deliveries language plpgsql security invoker set search_path='' as $$
begin
 -- A lost process may have submitted the email. Do not blindly retry an expired lease.
 update public.independent_ticket_deliveries set status='uncertain',last_error='Worker lease expired; reconcile provider before retry',updated_at=now(),lease_token=null,lease_until=null
 where status='processing' and lease_until<now();
 return query
 with candidate as (
 select id from public.independent_ticket_deliveries where status='queued' and next_attempt_at<=now() and attempts<4
 order by next_attempt_at,id for update skip locked limit 1
 )
 update public.independent_ticket_deliveries d set status='processing',attempts=d.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
 from candidate c where d.id=c.id returning d.*;
end $$;
revoke execute on function public.ft_claim_independent_ticket() from public,anon,authenticated;
grant execute on function public.ft_claim_independent_ticket() to service_role;
commit;
