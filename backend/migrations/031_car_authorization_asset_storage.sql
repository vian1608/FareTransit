-- Car-rental authorization image assets. The core multi-service tables are managed by the Supabase migrations multiservice_car_authorization and car_authorization_draft_fields.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-authorization-assets','car-authorization-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public read car authorization assets') then
    create policy "Public read car authorization assets" on storage.objects for select using (bucket_id='car-authorization-assets');
  end if;
end $$;
