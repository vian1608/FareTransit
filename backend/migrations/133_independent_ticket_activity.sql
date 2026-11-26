-- Additive e-ticket activity only. Never changes dispatch status or archived payload.
begin;
alter table public.independent_ticket_deliveries add column if not exists tracking_token uuid not null default gen_random_uuid();
create unique index if not exists ft_ticket_tracking_token on public.independent_ticket_deliveries(tracking_token);
create index if not exists ft_ticket_provider_id on public.independent_ticket_deliveries(provider_id) where provider_id is not null;
create table if not exists public.independent_ticket_events (
 event_id text primary key check(length(event_id)<=200),
 delivery_id uuid not null references public.independent_ticket_deliveries(id),
 kind text not null check(kind in ('sent','delivered','delivery_delayed','bounced','failed','complained','suppressed','opened','pixel_open')),
 occurred_at timestamptz not null,
 source text not null check(source in ('resend','faretransit'))
);
create index if not exists ft_ticket_event_history on public.independent_ticket_events(delivery_id,occurred_at desc);
alter table public.independent_ticket_events enable row level security;
revoke all on public.independent_ticket_events from public,anon,authenticated;
grant select,insert on public.independent_ticket_events to service_role;

create or replace function public.ft_record_ticket_pixel(p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $pixel$
declare v_id uuid; v_now timestamptz:=now();
begin
 select d.id into v_id from public.independent_ticket_deliveries d
 where d.tracking_token=p_token and d.status in ('processing','sent','uncertain')
 and strpos(coalesce(d.payload->>'html',''),'data-ft-open-notice')>0;
 if v_id is null then return false; end if;
 -- Repeated image requests in the same minute are one detected event; no IP/agent stored.
 insert into public.independent_ticket_events(event_id,delivery_id,kind,occurred_at,source)
 values('pixel:'||v_id::text||':'||floor(extract(epoch from v_now)/60)::text,v_id,'pixel_open',v_now,'faretransit')
 on conflict(event_id) do nothing;
 return true;
end $pixel$;
revoke execute on function public.ft_record_ticket_pixel(uuid) from public,anon,authenticated;
grant execute on function public.ft_record_ticket_pixel(uuid) to service_role;

create or replace function public.ft_record_ticket_provider_event(p_event_id text,p_provider_id text,p_delivery uuid,p_recipient text,p_kind text,p_time timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $provider$
declare v_id uuid;
begin
 -- Match provider id first; signed Resend tag handles events preceding worker persistence.
 select d.id into v_id from public.independent_ticket_deliveries d
 where (d.provider_id=p_provider_id or (d.id=p_delivery and d.provider_id is null and d.status in ('processing','uncertain','sent')))
 and lower(d.payload->>'recipient')=lower(p_recipient)
 order by (d.provider_id=p_provider_id) desc nulls last,d.created_at desc limit 1;
 if v_id is null then return false; end if;
 insert into public.independent_ticket_events(event_id,delivery_id,kind,occurred_at,source)
 values(p_event_id,v_id,p_kind,p_time,'resend') on conflict(event_id) do nothing;
 return true;
end $provider$;
revoke execute on function public.ft_record_ticket_provider_event(text,text,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ft_record_ticket_provider_event(text,text,uuid,text,text,timestamptz) to service_role;

create or replace view public.independent_ticket_activity with (security_invoker=true) as
select d.id,d.ticket_id,d.revision,d.status,d.created_at,d.updated_at,d.attempts,d.provider_id,d.last_error,d.pdf_path,d.retry_safe,
 d.payload->>'recipient' as recipient,d.payload->>'source_delivery_id' as source_delivery_id,
 strpos(coalesce(d.payload->>'html',''),'data-ft-open-notice')>0 as open_tracking_available,
 coalesce(a.sent_at,case when d.status='sent' then d.updated_at end) as sent_at,
 a.delivered_at,
 case when a.complained then 'complained' when a.bounced then 'bounced' when a.suppressed then 'suppressed' when a.failed then 'failed' when a.delivered_at is not null then 'delivered' when a.delayed then 'delivery_delayed' when a.sent_at is not null then 'sent' else null end as provider_status,
 coalesce(a.native_count,0)>0 as native_open_detected,
 case when a.native_count>0 then a.native_first else a.pixel_first end as first_open_at,
 case when a.native_count>0 then a.native_last else a.pixel_last end as last_open_at,
 case when a.native_count>0 then a.native_count else coalesce(a.pixel_count,0) end as open_count,
 case when a.native_count>0 then 'resend' when a.pixel_count>0 then 'faretransit' else null end as open_source,
 coalesce(e.events,'[]'::jsonb) as events
from public.independent_ticket_deliveries d
left join lateral (
 select min(occurred_at) filter(where kind='sent') as sent_at,
 min(occurred_at) filter(where kind='delivered') as delivered_at,
 bool_or(kind='complained') as complained,bool_or(kind='bounced') as bounced,bool_or(kind='suppressed') as suppressed,
 bool_or(kind='failed') as failed,bool_or(kind='delivery_delayed') as delayed,
 count(*) filter(where kind='opened') as native_count,
 min(occurred_at) filter(where kind='opened') as native_first,max(occurred_at) filter(where kind='opened') as native_last,
 count(*) filter(where kind='pixel_open') as pixel_count,
 min(occurred_at) filter(where kind='pixel_open') as pixel_first,max(occurred_at) filter(where kind='pixel_open') as pixel_last
 from public.independent_ticket_events where delivery_id=d.id
) a on true
left join lateral (
 select jsonb_agg(jsonb_build_object('kind',x.kind,'occurred_at',x.occurred_at,'source',x.source) order by x.occurred_at desc,x.event_id desc) as events
 from (select kind,occurred_at,source,event_id from public.independent_ticket_events where delivery_id=d.id order by occurred_at desc,event_id desc limit 30) x
) e on true;
revoke all on public.independent_ticket_activity from public,anon,authenticated;
grant select on public.independent_ticket_activity to service_role;

create or replace function public.ft_independent_ticket_history(p_search text default '',p_status text default 'all',p_airline text default '',p_from date default null,p_to date default null,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $history$
with matched as (
 select t.id,t.source_booking_id,t.reference,t.revision,t.created_at,t.updated_at,t.summary,
 coalesce(t.draft->'references','[]'::jsonb) as references,
 coalesce((select jsonb_agg(distinct s->>'carrier') from jsonb_array_elements(coalesce(t.draft->'segments','[]'::jsonb)) s where coalesce(s->>'carrier','')<>''),'[]'::jsonb) as airlines,
 coalesce((select jsonb_agg(p->>'name') from jsonb_array_elements(coalesce(t.draft->'passengers','[]'::jsonb)) p where coalesce(p->>'name','')<>''),'[]'::jsonb) as passengers
 from public.independent_tickets t
 where (p_from is null or t.created_at >= (p_from::timestamp at time zone 'UTC'))
 and (p_to is null or t.created_at < ((p_to+1)::timestamp at time zone 'UTC'))
 and (p_airline='' or exists(select 1 from jsonb_array_elements(coalesce(t.draft->'segments','[]'::jsonb)) s where upper(s->>'carrier')=upper(p_airline)))
 and (p_search='' or strpos(lower(concat_ws(' ',t.reference,t.source_booking_id::text,t.summary->>'passenger',t.summary->>'route',t.summary->>'email',t.draft->'passengers',t.draft->'references',t.draft->'segments')),lower(p_search))>0
 or exists(select 1 from public.independent_ticket_deliveries d where d.ticket_id=t.id and strpos(lower(coalesce(d.payload->>'recipient','')),lower(p_search))>0))
 and (p_status='all' or (p_status='draft' and not exists(select 1 from public.independent_ticket_deliveries d where d.ticket_id=t.id))
 or exists(select 1 from public.independent_ticket_activity a where a.ticket_id=t.id and ((p_status='opened' and a.open_count>0) or (p_status='no_open' and a.status='sent' and a.open_tracking_available and a.open_count=0) or (p_status not in ('opened','no_open','draft') and coalesce(a.provider_status,a.status)=p_status))))
), page as (
 select * from matched order by updated_at desc,id desc limit 25 offset greatest(0,p_offset)
), rows as (
 select p.*,coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id desc) from (select * from public.independent_ticket_activity where ticket_id=p.id order by created_at desc,id desc limit 50) a),'[]'::jsonb) as deliveries,
 (select count(*) from public.independent_ticket_deliveries d where d.ticket_id=p.id) as delivery_count
 from page p
), metrics as (
 select count(*) as recipients,count(*) filter(where a.status='sent' or a.sent_at is not null) as sent,
 count(*) filter(where a.delivered_at is not null) as delivered,count(*) filter(where a.open_count>0) as opened,
 count(*) filter(where a.provider_status in ('bounced','failed','suppressed','complained') or a.status='failed') as failed
 from public.independent_ticket_activity a join matched m on m.id=a.ticket_id
)
select jsonb_build_object('data',coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.id desc) from rows r),'[]'::jsonb),'total',(select count(*) from matched),'metrics',(select to_jsonb(metrics) from metrics));
$history$;
revoke execute on function public.ft_independent_ticket_history(text,text,text,date,date,integer) from public,anon,authenticated;
grant execute on function public.ft_independent_ticket_history(text,text,text,date,date,integer) to service_role;
commit;
