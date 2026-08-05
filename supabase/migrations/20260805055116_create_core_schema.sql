-- Core schema: profiles, audio_files, annotations, extraction_jobs.
-- RLS model: open collaboration — any authenticated user can read
-- everything, but can only mutate rows they own/authored. Revisit if the
-- team wants per-file access lists instead (see PROGRESS.md decisions log).

-- ============================================================
-- profiles
-- ============================================================
-- Mirrors auth.users — Supabase Auth has no native username field, and R5
-- requires username at signup, so we keep it here instead.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile row whenever a new auth user signs up. The signup
-- flow passes the chosen username via `data.username` in the auth signup
-- call's user metadata.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- audio_files
-- ============================================================
create table public.audio_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  filename text not null,
  storage_path text not null,
  format text not null check (format in ('mp3', 'wav')),
  duration_seconds numeric,
  sample_rate integer,
  waveform_peaks_path text,
  created_at timestamptz not null default now()
);

create index audio_files_filename_idx on public.audio_files using gin (
  to_tsvector('english', filename)
);
create index audio_files_owner_id_idx on public.audio_files (owner_id);

alter table public.audio_files enable row level security;

create policy "audio files are viewable by any authenticated user"
  on public.audio_files for select
  to authenticated
  using (true);

create policy "users can upload their own audio files"
  on public.audio_files for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "owners can update their own audio files"
  on public.audio_files for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners can delete their own audio files"
  on public.audio_files for delete
  to authenticated
  using (owner_id = auth.uid());

-- ============================================================
-- annotations
-- ============================================================
-- `version` implements optimistic concurrency (see AGENTS.md): clients
-- submit updates with `.eq('version', clientVersion)`; the trigger below
-- bumps the stored version on every successful update, so a stale client
-- update affects 0 rows and the app surfaces that as a conflict.
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  audio_file_id uuid not null references public.audio_files (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  start_seconds numeric not null,
  end_seconds numeric,
  label text,
  comment text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annotations_end_after_start check (
    end_seconds is null or end_seconds >= start_seconds
  )
);

create index annotations_audio_file_id_idx on public.annotations (audio_file_id);

alter table public.annotations enable row level security;

create policy "annotations are viewable by any authenticated user"
  on public.annotations for select
  to authenticated
  using (true);

create policy "users can create annotations as themselves"
  on public.annotations for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "authors can update their own annotations"
  on public.annotations for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors can delete their own annotations"
  on public.annotations for delete
  to authenticated
  using (author_id = auth.uid());

create function public.bump_annotation_version()
returns trigger
language plpgsql
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_annotation_update
  before update on public.annotations
  for each row execute function public.bump_annotation_version();

-- ============================================================
-- extraction_jobs
-- ============================================================
-- Client update policy deliberately omitted — only the worker (service-role
-- key, bypasses RLS entirely) transitions job status.
create table public.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  audio_file_id uuid not null references public.audio_files (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  start_seconds numeric not null,
  end_seconds numeric not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  output_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extraction_jobs_end_after_start check (end_seconds >= start_seconds)
);

create index extraction_jobs_status_idx on public.extraction_jobs (status);
create index extraction_jobs_audio_file_id_idx on public.extraction_jobs (audio_file_id);

alter table public.extraction_jobs enable row level security;

create policy "extraction jobs are viewable by any authenticated user"
  on public.extraction_jobs for select
  to authenticated
  using (true);

create policy "users can request extraction jobs as themselves"
  on public.extraction_jobs for insert
  to authenticated
  with check (requested_by = auth.uid());
