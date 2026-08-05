# Progress Log

Living task log. Update after every feature/session so the next prompt (human or AI) has continuity without re-reading the whole repo history.

## How to use this file

- **Done**: append one line per shipped feature/fix, newest at top. Link the PR if there is one.
- **In Progress**: what's actively being worked on right now, by what (session/branch).
- **Up Next**: near-term backlog, roughly ordered.
- **Decisions Log**: any decision made mid-build that changes or refines something in `AGENTS.md` — then also update `AGENTS.md` itself if it's a lasting convention.

---

## Done

- Defined core Supabase schema (`profiles`, `audio_files`, `annotations`, `extraction_jobs`) + RLS policies in one migration (`supabase/migrations/20260805055116_create_core_schema.sql`), applied via Supabase CLI (`supabase db push --linked`). Scaffolded `packages/shared-types` with `supabase gen types`-generated row types (`Profile`, `AudioFile`, `Annotation`, `ExtractionJob`), wired into both `apps/web` and `apps/worker`. Worker's poll loop now queries the real `extraction_jobs` table cleanly (no more `PGRST205`).
- Created Supabase project (`qsfteifrmlvftedleapa`), verified URL/anon/service-role keys work end-to-end from both `apps/web/.env.local` and `apps/worker/.env`.
- Scaffolded `apps/web` (`create-next-app`: TS, App Router, Tailwind, `src/` dir) + `apps/worker` (hand-rolled: `package.json`/`tsconfig.json`/poll-loop skeleton, `fluent-ffmpeg` wired for ffprobe). Both boot clean (`pnpm dev:web` / `pnpm dev:worker`) and pass `pnpm -r lint` / `pnpm -r build`. ([PR #1](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/1), merged)
- Repo scaffolded: pnpm monorepo (`apps/web`, `apps/worker`, `packages/shared-types`), `AGENTS.md`, `.cursor/rules/`.

## In Progress

- Nothing currently in flight.

## Up Next

- [ ] R5: auth (signup/login) UI + Supabase Auth wiring — schema already supports it (`profiles` auto-populated via trigger on `auth.users` insert, reading `username` from signup metadata)
- [ ] R1: file upload + validation (extension + MIME/header check)
- [ ] R2: waveform playback (WaveSurfer.js) + basic controls
- [ ] R3: real-time annotation UI + Supabase Realtime subscription
- [ ] R9: file search
- [ ] R4/R8: extraction UI + worker job pipeline (lossless WAV/MP3 cutting)
- [ ] R6: usability heuristics pass on finished UI
- [ ] R7: latency validation under 5 concurrent users

## Decisions Log

- Schema managed via Supabase CLI migrations checked into `supabase/migrations/` (not dashboard-only manual SQL) — reproducible, versioned, team can re-run. Requires a personal access token (`supabase.com/dashboard/account/tokens`) to `link`/`db push`/`gen types`; not stored anywhere in the repo.
- RLS policies shipped in the same migration as table creation (not a separate PR) — no window where tables exist without policies.
- RLS model is **open collaboration**: any authenticated user can `select` all rows across `profiles`/`audio_files`/`annotations`/`extraction_jobs`, but can only `insert`/`update`/`delete` rows they own/authored. Matches R9 (file search implies files are discoverable by all users) and the collaborative-annotation premise. If the team later wants per-file access lists (e.g. invite-only annotators), this needs revisiting — it's an assumption, not a stated requirement.
- `annotations.version` (optimistic concurrency, per "Key technical decisions" in `AGENTS.md`) is auto-incremented by a `before update` trigger (`bump_annotation_version`), not app-side. Clients must submit `.eq('version', clientVersion)` on every update; 0 rows affected = stale write, surface as a conflict in the UI.
- `extraction_jobs` has no client-side `update` RLS policy — only the worker (service-role key, bypasses RLS) transitions job status. Prevents users from spoofing job completion/failure from the browser.
- `packages/shared-types/src/database.types.ts` is generated (`supabase gen types typescript`), never hand-edited. Regenerate via `pnpm --filter @audio-tool/shared-types gen-types` after every schema migration.
- `apps/worker` was hand-rolled (no generator/CLI exists for a bare Node+TS+ffmpeg service) rather than scaffolded — `tsx` for dev (watch mode), plain `tsc` for build, `fluent-ffmpeg` for the ffprobe/ffmpeg wrapper (never hand-roll audio parsing, per `.cursor/rules/worker.mdc`).
- `apps/web/.env.local` and `apps/worker/.env` contain placeholder (unreachable) Supabase values purely so `next dev`/`next build` and the worker's poll loop boot locally without crashing on missing env vars. Both files are gitignored — replace with real project creds once the Supabase project exists.
