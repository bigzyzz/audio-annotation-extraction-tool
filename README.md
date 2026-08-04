# Audio Annotation and Extraction Tool

Web platform for audio hobbyists to collaboratively annotate and extract segments from shared MP3/WAV audio files in real-time — no more juggling Drive links, Discord, and email just to get timestamped feedback on a track.

Team **S1_CS_32** — Aziz Basir, Dzuy Tra, Prachnha Tee, Vicky Wu (FIT3162).

## Features (planned)

- Secure account creation and login
- Upload and search MP3/WAV audio files
- Waveform playback with standard controls (play/pause/seek/volume)
- Real-time collaborative annotation — up to 5 users per file, <2s sync latency
- Lossless extraction of selected audio segments for local download, annotations included

## Architecture

Monorepo (pnpm workspaces):

- `apps/web` — Next.js/React/TypeScript frontend, deployed on Vercel
- `apps/worker` — Node.js FFmpeg processing service, deployed on Railway/Render/Fly.io
- `packages/shared-types` — shared TypeScript types

Backend: [Supabase](https://supabase.com) (PostgreSQL, Auth, Storage, Realtime, Row Level Security).

Full technical proposal, requirements traceability matrix, risk register, and architecture diagram: `project_plan.pdf`.

## Status

Early scaffolding stage — no app code yet. See `AGENTS.md` for full project context (architecture, stack, requirements, conventions) if you're an AI agent or new contributor picking this up.

## Getting started

```bash
pnpm install
```

(App-level setup instructions will land once `apps/web` and `apps/worker` are scaffolded.)
