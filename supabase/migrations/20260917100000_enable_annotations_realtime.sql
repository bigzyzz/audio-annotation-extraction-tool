-- R3 / T12: broadcast annotation INSERT/UPDATE/DELETE over Supabase Realtime.
-- replica identity FULL so UPDATE/DELETE payloads include the old row
-- (needed for client-side merge without a page reload). Idempotent add to
-- the supabase_realtime publication.

alter table public.annotations replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'annotations'
  ) then
    execute 'alter publication supabase_realtime add table public.annotations';
  end if;
end $$;
