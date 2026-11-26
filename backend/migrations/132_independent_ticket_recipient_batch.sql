-- Additive batch enqueue. No change to existing ticket or delivery records.
begin;
create or replace function public.ft_enqueue_independent_recipient_batch(
 p_ticket uuid,p_revision integer,p_source uuid,p_payload jsonb,p_entries jsonb,p_actor text
) returns jsonb language plpgsql security invoker set search_path='' as $recipient_batch$
declare
 v_source public.independent_ticket_deliveries%rowtype;
 v_payload jsonb; v_revision integer; v_entry jsonb; v_id uuid; v_status text; v_recipient text;
 v_result jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 5 then
  raise exception 'Invalid recipient batch';
 end if;
 -- Serialize enqueue operations per ticket. Never mutate the original contact or archive.
 perform 1 from public.independent_tickets where id=p_ticket for update;
 if not found then return null; end if;
 if p_source is null then
  perform 1 from public.independent_tickets where id=p_ticket and revision=p_revision;
  if not found then return null; end if;
  v_payload:=p_payload; v_revision:=p_revision;
 else
  select * into v_source from public.independent_ticket_deliveries
   where id=p_source and ticket_id=p_ticket and status='sent' and pdf_path is not null;
  if not found then return null; end if;
  v_payload:=v_source.payload||jsonb_build_object('archive_path',v_source.pdf_path,'source_delivery_id',v_source.id,'group_key',coalesce(v_source.payload->>'group_key',v_source.idempotency_key));
  v_revision:=v_source.revision;
 end if;
 for v_entry in select value from jsonb_array_elements(p_entries) loop
  if coalesce(v_entry->>'key','') !~ '^[a-f0-9]{64}$' or length(coalesce(v_entry->>'recipient','')) not between 3 and 254 then
   raise exception 'Invalid recipient entry';
  end if;
  v_id:=null;
  insert into public.independent_ticket_deliveries(ticket_id,revision,idempotency_key,payload,actor)
   values(p_ticket,v_revision,v_entry->>'key',v_payload||jsonb_build_object('recipient',v_entry->>'recipient'),p_actor)
   on conflict(idempotency_key) do nothing returning id into v_id;
  if v_id is null then
   select id,status,payload->>'recipient' into v_id,v_status,v_recipient from public.independent_ticket_deliveries
    where idempotency_key=v_entry->>'key' and ticket_id=p_ticket;
   if v_id is null or lower(v_recipient) is distinct from lower(v_entry->>'recipient') then raise exception 'Delivery key conflict'; end if;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'recipient',v_recipient,'status',v_status,'existing',true));
  else
   v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'recipient',v_entry->>'recipient','status','queued','existing',false));
  end if;
 end loop;
 return v_result;
end $recipient_batch$;
revoke execute on function public.ft_enqueue_independent_recipient_batch(uuid,integer,uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ft_enqueue_independent_recipient_batch(uuid,integer,uuid,jsonb,jsonb,text) to service_role;
commit;
