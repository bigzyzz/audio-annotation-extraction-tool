-- R1 / T1: Storage bucket `audio` + RLS.
-- Path contract: `{user_id}/{audio_file_id}.{mp3|wav}` (see BACKLOG.md).
-- Same open-collab model as `audio_files` table RLS: any authenticated
-- user can read every object; only the folder owner can write. Bucket is
-- NOT world-public (`public = false`) — anon cannot read via /object/public
-- URLs. Playback later uses an authenticated download or signed URL (R2).
-- MIME/magic-byte checks are T2, not this migration.

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'audio',
  'audio',
  false,
  52428800 -- 50 MiB, matches BACKLOG.md R1 contract
);

-- Authenticated read-all (open collaboration, matches audio_files SELECT).
create policy "audio objects are viewable by any authenticated user"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'audio');

-- Writes only under `{auth.uid()}/…`.
create policy "users can upload audio to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users can update audio in their own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users can delete audio in their own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
