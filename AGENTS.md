# AGENTS.md — Audio Annotation and Extraction Tool

Read this before making changes. Keep it updated as decisions change.

## What this is

Web platform for audio hobbyists to collaboratively annotate and extract segments from shared MP3/WAV files in real-time. Team S1_CS_32 (Aziz, Dzuy, Prachnha, Vicky), FIT3162 unit project. Full rationale/requirements in `project_plan.pdf` (repo root).

## Problem it solves

Hobbyists currently juggle 3+ disconnected apps (Drive, Discord, email) to share a track and collect timestamped feedback — 86.7% report this is disjointed/time-consuming (survey, n=15). No existing tool (Audacity, Sonic Visualiser, Notetracks, Label Studio) offers free, web-based, truly concurrent annotation.

## Scope

**In scope:** web platform, MP3/WAV only, up to 5 concurrent annotators per file, 2-second max sync latency, secure accounts, timeline-based annotation, lossless segment extraction, file search.

**Explicitly out of scope:** mobile apps/PWA, production-grade DevOps hardening, large-scale storage optimisation, AI-based audio tagging.

## Architecture

Monorepo, pnpm workspaces.

```
apps/web/        Next.js (React + TypeScript) — deployed on Vercel
apps/worker/      Node.js FFmpeg worker — deployed on Railway/Render/Fly.io (NOT Vercel)
packages/shared-types/  Shared TS types between web + worker
```

Backend-as-a-service: **Supabase** (Postgres + Auth + Storage + Realtime + Row Level Security). No custom Socket.io server — Supabase Realtime handles WebSocket broadcast.

Flow: Browser <-> Vercel (Next.js app + API routes) <-> Supabase (auth/db/storage/realtime). Worker polls Postgres for jobs, reads/writes Supabase Storage, updates job status — decoupled from the Next.js app because Vercel serverless functions can't do long-running/file-heavy audio processing.

See `project_plan.pdf` section 5.4 for the full architecture diagram.

## Tech stack

- **Frontend:** Next.js, React, TypeScript, WaveSurfer.js, Web Audio API
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, RLS)
- **Audio processing:** FFmpeg (via a separate worker process, ffprobe for metadata)
- **Deployment:** Vercel (web), Railway/Render/Fly.io (worker)
- **Package manager:** pnpm (workspaces)
- **VCS:** Git + GitHub, PR review required before merge to `main`

## Key technical decisions (don't relitigate without reason)

- **Real-time sync:** optimistic concurrency control. Every annotation row has a `version` column. Edits are rejected by Postgres if submitted version != current stored version (prevents silent overwrites/race conditions). Ephemeral signals (cursor position, playback position) are throttled, not versioned.
- **Lossless extraction:**
  - WAV: exact sample-accurate cut, `target_sample = target_time * sample_rate`.
  - MP3: frame-boundary-safe cut via `ffmpeg` stream copy (no re-encode). If the user requests a cut off a frame boundary, export as WAV/MP3 instead of lossy re-encode.
- **Waveform rendering:** worker pre-generates compact waveform peak data so the browser never has to decode the full audio file just to render a waveform.
- **UI:** must adhere to Nielsen's 10 Usability Heuristics (requirement R6).

## Requirements (see `project_plan.pdf` Appendix A for full RTM)

| ID | Requirement | Priority |
|----|---|---|
| R1 | Upload MP3/WAV only | HIGH |
| R2 | Playback controls: play/pause/seek/volume | HIGH |
| R3 | Annotate with labels/comments/specs at timestamps | HIGH |
| R4 | Extract selected audio segments for local download w/ annotations | MEDIUM |
| R5 | Secure account creation (email/password/username) + login | HIGH |
| R6 | UI follows Nielsen's 10 Usability Heuristics | MEDIUM |
| R7 | Up to 5 concurrent users per file, <2s sync latency | HIGH |
| R8 | Extracted segments retain original quality/format | LOW |
| R9 | Search for audio files in the system | MEDIUM |

## Conventions

- TypeScript everywhere (`apps/web`, `apps/worker`, `packages/shared-types`) — no untyped JS.
- Feature branches -> PR -> review -> merge to `main`. No direct pushes to `main`.
- Commit messages: concise, explain why not just what.
- Each PR should map back to one or more requirement IDs (R1-R9) where applicable — keeps the RTM honest.

## Team

4-person team, no fixed roles — everyone is a full-stack dev, works across `apps/web`, `apps/worker`, and Supabase schema as needed. Pick up whatever's next in `PROGRESS.md`.

## AI-assisted workflow (how we build this)

- Plan before code: for anything touching architecture or spanning multiple files, use Plan mode / discuss approach first. Small well-scoped changes go straight to implementation.
- Prompt scope: one feature/fix per prompt. State goal, relevant files (`@` them), what NOT to touch.
- After each feature: update `PROGRESS.md` (what shipped, what's next, any new decisions) so the next session/prompt has continuity without re-explaining. If the work creates, changes, or closes a risk, update `RISK_REGISTER.md` in the same PR (`project_plan.pdf` is the submitted snapshot; the markdown file is the living register).
- Verify before moving on: run/lint/test each chunk before stacking the next feature on top.
- Repeatable multi-step workflows (e.g. adding a new annotated feature end-to-end) live in `.cursor/skills/` — check there before improvising a workflow.
- Rules in `.cursor/rules/` are scoped by path (`web.mdc`, `worker.mdc`) plus always-on `project.mdc` — keep them updated when conventions change, don't let them drift from reality.

## Current status

Monorepo + Supabase schema/RLS + R5 auth UI shipped. Next: R1 file upload (T1–T4 in `BACKLOG.md`). Live task log: `PROGRESS.md`. Live risk register: `RISK_REGISTER.md`. User stories (Done when): `USER_STORIES.md`.
