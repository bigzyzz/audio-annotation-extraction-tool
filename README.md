# Audio Annotation and Extraction Tool

Web platform for audio hobbyists to collaboratively annotate and extract segments from shared MP3/WAV audio files in real-time — no more juggling Drive links, Discord, and email just to get timestamped feedback on a track.

Team **S1_CS_32** — Aziz, Dzuy, Prachnha, Vicky (FIT3162).

## Key Features

- **Secure Authentication & Demo Personas**: User signup/login via Supabase Auth with SSR cookies and 1-click test persona logins (Alice & Bob).
- **Audio Upload & Validation**: MP3 and WAV upload with MIME, extension, and magic-byte validation to reject spoofed files.
- **Waveform Visualization & Playback**: Pre-generated compact waveform peaks (WaveSurfer.js) with tactile playhead scrubber, timeline zoom, and playback transport (play/pause/seek/volume).
- **Real-Time Collaborative Annotations**: Sub-2s synchronized annotations across up to 5 concurrent users per file with Optimistic Concurrency Control (OCC) to prevent silent overwrites.
- **Lossless Segment Extraction**: Stream-copy cutting of selected audio ranges (no re-encoding quality loss) paired with segment-relative JSON annotation metadata sidecars for download.
- **Library Search**: Debounced, SQL-safe ILIKE search with URL sync across audio files in the library.

## Architecture

Monorepo (pnpm workspaces):

- `apps/web` — Next.js 16/React 19/TypeScript frontend, deployed on Vercel
- `apps/worker` — Node.js FFmpeg audio processing service, deployed on Railway/Render/Fly.io
- `packages/shared-types` — shared TypeScript types

Backend: [Supabase](https://supabase.com) (PostgreSQL, Auth, Storage, Realtime, Row Level Security).

Full technical proposal, requirements traceability matrix, original risk register, and architecture diagram: `project_plan.pdf`. Living risk register: `RISK_REGISTER.md`. Living user stories (acceptance / Done when): `USER_STORIES.md`.

## Status

Core requirements R1 (Upload & validation), R2 (Waveform playback & controls), R3 (Real-time collaborative annotations with OCC), R4/R8 (Lossless audio extraction pipeline & client helpers), R5 (Authentication & demo accounts), and R9 (Library search) are implemented and verified. See `PROGRESS.md` for the detailed task log and `AGENTS.md` for architecture and conventions.

## Getting started

### Prerequisites

- **Node.js**: `>= 20`
- **pnpm**: `>= 9`
- **FFmpeg**: must be installed on your system PATH (`ffmpeg` and `ffprobe` for worker audio processing).
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

#### Web (`apps/web/.env.local`)
Copy the example file:
```bash
cp apps/web/.env.example apps/web/.env.local
```
Fill in your Supabase project credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

#### Worker (`apps/worker/.env`)
Copy the example file:
```bash
cp apps/worker/.env.example apps/worker/.env
```
Fill in the worker configuration:
```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
JOB_POLL_INTERVAL_MS=2000
```

### 3. (Optional) Seed demo personas

Seed test accounts for Alice and Bob:
```bash
pnpm seed:demo
```

### 4. Run development services

Open two terminal tabs:

**Terminal 1 — Web app (Next.js):**
```bash
pnpm dev:web
```
The web application runs on [http://localhost:3000](http://localhost:3000).

**Terminal 2 — Audio worker (FFmpeg processing & peak generator):**
```bash
pnpm dev:worker
```
The worker polls Supabase every 2 seconds for pending metadata probe, waveform peak generation, and lossless segment extraction jobs.

### 5. Access the application

1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. Sign in using the 1-click **Demo Personas** panel on `/login` (Alice or Bob), or create a new account on `/signup`.
3. Upload an MP3 or WAV audio track via `/upload`.
4. Inspect the waveform player, test real-time timeline annotations, and request lossless segment extractions.

### 6. Production run

```bash
# Build all workspaces
pnpm build

# Run web production server
pnpm --filter web start

# Run worker production process
pnpm --filter worker start
```

### 7. Test, lint, and typecheck

```bash
# Run unit tests
pnpm --filter web test
pnpm --filter worker test

# Lint and typecheck all packages
pnpm lint
```
