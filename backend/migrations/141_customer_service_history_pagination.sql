-- Additive history API: keep previous RPC for rollback compatibility.
begin;
create or replace function public.ft_independent_ticket_history_v2(p_search text default '',p_status text default 'all',p_airline text default '',p_from date default null,p_to date default null,p_offset integer default 0,p_limit integer default 25,p_email text default '')
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
 and (p_email='' or strpos(lower(coalesce(t.summary->>'email','')),lower(p_email))>0 or strpos(lower(coalesce(t.draft->'customer'->>'email','')),lower(p_email))>0 or exists(select 1 from public.independent_ticket_deliveries d where d.ticket_id=t.id and strpos(lower(coalesce(d.payload->>'recipient','')),lower(p_email))>0))
 and (p_status='all' or (p_status='draft' and not exists(select 1 from public.independent_ticket_deliveries d where d.ticket_id=t.id))
 or exists(select 1 from public.independent_ticket_activity a where a.ticket_id=t.id and ((p_status='opened' and a.open_count>0) or (p_status='no_open' and a.status='sent' and a.open_tracking_available and a.open_count=0) or (p_status not in ('opened','no_open','draft') and coalesce(a.provider_status,a.status)=p_status))))
), page as (
 select * from matched order by updated_at desc,id desc limit case when p_limit in (10,25,50,100) then p_limit else 25 end offset greatest(0,p_offset)
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
revoke execute on function public.ft_independent_ticket_history_v2(text,text,text,date,date,integer,integer,text) from public,anon,authenticated;
grant execute on function public.ft_independent_ticket_history_v2(text,text,text,date,date,integer,integer,text) to service_role;
commit;
