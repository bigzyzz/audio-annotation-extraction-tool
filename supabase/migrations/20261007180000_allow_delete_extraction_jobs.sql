-- Allow users to delete their own extraction jobs (or extraction jobs on files they own)
create policy "users can delete their own extraction jobs"
  on public.extraction_jobs for delete
  to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from public.audio_files
      where audio_files.id = extraction_jobs.audio_file_id
        and audio_files.owner_id = auth.uid()
    )
  );
