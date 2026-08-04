# Progress Log

Living task log. Update after every feature/session so the next prompt (human or AI) has continuity without re-reading the whole repo history.

## How to use this file

- **Done**: append one line per shipped feature/fix, newest at top. Link the PR if there is one.
- **In Progress**: what's actively being worked on right now, by what (session/branch).
- **Up Next**: near-term backlog, roughly ordered.
- **Decisions Log**: any decision made mid-build that changes or refines something in `AGENTS.md` — then also update `AGENTS.md` itself if it's a lasting convention.

---

## Done

- Repo scaffolded: pnpm monorepo (`apps/web`, `apps/worker`, `packages/shared-types`), `AGENTS.md`, `.cursor/rules/`.

## In Progress

- Nothing currently in flight.

## Up Next

- [ ] Scaffold `apps/web` with `create-next-app` (TypeScript, App Router)
- [ ] Scaffold `apps/worker` (Node + TypeScript, ffmpeg/ffprobe wired up)
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

- _(none yet beyond what's already in AGENTS.md)_
