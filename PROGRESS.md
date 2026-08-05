# Progress Log

Living task log. Update after every feature/session so the next prompt (human or AI) has continuity without re-reading the whole repo history.

## How to use this file

- **Done**: append one line per shipped feature/fix, newest at top. Link the PR if there is one.
- **In Progress**: what's actively being worked on right now, by what (session/branch).
- **Up Next**: near-term backlog, roughly ordered.
- **Decisions Log**: any decision made mid-build that changes or refines something in `AGENTS.md` — then also update `AGENTS.md` itself if it's a lasting convention.

---

## Done

- Scaffolded `apps/web` (`create-next-app`: TS, App Router, Tailwind, `src/` dir) + `apps/worker` (hand-rolled: `package.json`/`tsconfig.json`/poll-loop skeleton, `fluent-ffmpeg` wired for ffprobe). Both boot clean (`pnpm dev:web` / `pnpm dev:worker`) and pass `pnpm -r lint` / `pnpm -r build`. Worker's poll loop queries `extraction_jobs` and gracefully no-ops until that table exists.
- Repo scaffolded: pnpm monorepo (`apps/web`, `apps/worker`, `packages/shared-types`), `AGENTS.md`, `.cursor/rules/`.

## In Progress

- Nothing currently in flight. Blocked on: a team member needs to create the actual Supabase project (dashboard login required, can't be scripted) and share URL/anon/service-role keys before the next session can wire up real auth/DB/storage.

## Up Next

- [ ] Create Supabase project (dashboard), distribute URL/anon key/service-role key to the team
- [ ] Define Supabase schema: users, audio_files, annotations (with `version` column), extraction_jobs
- [ ] Set up Supabase RLS policies
- [ ] R5: auth (signup/login) UI + Supabase Auth wiring
- [ ] R1: file upload + validation (extension + MIME/header check)
- [ ] R2: waveform playback (WaveSurfer.js) + basic controls
- [ ] R3: real-time annotation UI + Supabase Realtime subscription
- [ ] R9: file search
- [ ] R4/R8: extraction UI + worker job pipeline (lossless WAV/MP3 cutting)
- [ ] R6: usability heuristics pass on finished UI
- [ ] R7: latency validation under 5 concurrent users

## Decisions Log

- `apps/worker` was hand-rolled (no generator/CLI exists for a bare Node+TS+ffmpeg service) rather than scaffolded — `tsx` for dev (watch mode), plain `tsc` for build, `fluent-ffmpeg` for the ffprobe/ffmpeg wrapper (never hand-roll audio parsing, per `.cursor/rules/worker.mdc`).
- `apps/web/.env.local` and `apps/worker/.env` contain placeholder (unreachable) Supabase values purely so `next dev`/`next build` and the worker's poll loop boot locally without crashing on missing env vars. Both files are gitignored — replace with real project creds once the Supabase project exists.
