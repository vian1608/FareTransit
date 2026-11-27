-- Additive, service-role-only history for customer-service email delivery.
begin;
create table if not exists public.customer_service_emails (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('feedback','refund')),
 tracking_token uuid not null unique default gen_random_uuid(),
 idempotency_key text not null unique,
 recipient text not null check(length(recipient)<=254),
 actor text not null check(length(actor)<=254),
 subject text not null,
 html text not null,
 plain_text text not null,
 details jsonb not null default '{}'::jsonb,
 status text not null default 'processing' check(status in ('processing','accepted','failed','uncertain')),
 provider_id text unique,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 accepted_at timestamptz
);
create index if not exists ft_service_email_kind_date on public.customer_service_emails(kind,created_at desc,id desc);
alter table public.customer_service_emails enable row level security;
revoke all on public.customer_service_emails from public,anon,authenticated;
grant select,insert,update on public.customer_service_emails to service_role;
create table if not exists public.customer_service_email_events (
 event_id text primary key check(length(event_id)<=220),
 email_id uuid not null references public.customer_service_emails(id),
 kind text not null check(kind in ('sent','delivered','delivery_delayed','bounced','failed','complained','suppressed','opened','clicked')),
 occurred_at timestamptz not null,
 source text not null check(source in ('resend','provider_status','faretransit'))
);
create index if not exists ft_service_email_events on public.customer_service_email_events(email_id,occurred_at desc);
alter table public.customer_service_email_events enable row level security;
revoke all on public.customer_service_email_events from public,anon,authenticated;
grant select,insert on public.customer_service_email_events to service_role;

create or replace function public.ft_record_service_email_event(p_event_id text,p_provider_id text,p_delivery uuid,p_recipient text,p_kind text,p_time timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 select e.id into v_id from public.customer_service_emails e
 where (e.provider_id=p_provider_id or (e.id=p_delivery and e.provider_id is null and e.status in ('processing','uncertain','accepted')))
 and lower(e.recipient)=lower(p_recipient) order by (e.provider_id=p_provider_id) desc nulls last limit 1;
 if v_id is null then return false; end if;
 insert into public.customer_service_email_events(event_id,email_id,kind,occurred_at,source)
 values(p_event_id,v_id,p_kind,p_time,'resend') on conflict(event_id) do nothing;
 -- A verified event proves provider acceptance even if the HTTP response was lost.
 update public.customer_service_emails set provider_id=coalesce(provider_id,p_provider_id),status='accepted',accepted_at=coalesce(accepted_at,p_time),last_error=null,updated_at=now()
 where id=v_id and status in ('processing','uncertain');
 return true;
end $$;
revoke execute on function public.ft_record_service_email_event(text,text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ft_record_service_email_event(text,text,uuid,text,text,timestamptz) to service_role;

create or replace function public.ft_record_service_email_open(p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $
declare v_id uuid; v_now timestamptz:=now();
begin
 select id into v_id from public.customer_service_emails where tracking_token=p_token and status in ('processing','accepted','uncertain');
 if v_id is null then return false; end if;
 insert into public.customer_service_email_events(event_id,email_id,kind,occurred_at,source)
 values('pixel:'||v_id::text||':'||floor(extract(epoch from v_now)/60)::text,v_id,'opened',v_now,'faretransit')
 on conflict(event_id) do nothing;
 return true;
end $;
revoke execute on function public.ft_record_service_email_open(uuid) from public,anon,authenticated;
grant execute on function public.ft_record_service_email_open(uuid) to service_role;

create or replace view public.customer_service_email_activity with (security_invoker=true) as
select e.id,e.kind,e.recipient,e.actor,e.subject,e.details,e.provider_id,e.last_error,e.created_at,e.updated_at,e.accepted_at,
 case when a.complained then 'complained' when a.bounced then 'bounced' when a.suppressed then 'suppressed' when a.failed then 'failed'
 when a.delivered_at is not null then 'delivered' when a.open_count>0 or a.click_count>0 then 'engaged' when a.delayed then 'delivery_delayed' when a.sent_at is not null then 'sent'
 when e.status='processing' and e.created_at<now()-interval '2 minutes' then 'uncertain' else e.status end as status,
 a.sent_at,a.delivered_at,a.first_open_at,a.last_open_at,a.open_count,a.click_count,
 lower(concat_ws(' ',e.recipient,e.actor,e.subject,e.provider_id,e.details->>'passengerName',e.details->>'cardholderName',e.details->>'cardBrand',e.details->>'last4',e.details->>'amount')) as search_text
from public.customer_service_emails e left join lateral (
 select min(occurred_at) filter(where kind='sent') as sent_at,
 min(occurred_at) filter(where kind='delivered') as delivered_at,
 min(occurred_at) filter(where kind='opened') as first_open_at,max(occurred_at) filter(where kind='opened') as last_open_at,
 case when count(*) filter(where kind='opened' and source='resend')>0 then count(*) filter(where kind='opened' and source='resend') when count(*) filter(where kind='opened' and source='faretransit')>0 then count(*) filter(where kind='opened' and source='faretransit') else count(*) filter(where kind='opened' and source='provider_status') end as open_count,
 case when count(*) filter(where kind='clicked' and source='resend')>0 then count(*) filter(where kind='clicked' and source='resend') else count(*) filter(where kind='clicked' and source='provider_status') end as click_count,
 bool_or(kind='complained') as complained,bool_or(kind='bounced') as bounced,bool_or(kind='suppressed') as suppressed,
 bool_or(kind='failed') as failed,bool_or(kind='delivery_delayed') as delayed
 from public.customer_service_email_events where email_id=e.id
) a on true;
revoke all on public.customer_service_email_activity from public,anon,authenticated;
grant select on public.customer_service_email_activity to service_role;
commit;
