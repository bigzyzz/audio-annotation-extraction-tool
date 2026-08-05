# apps/web

Next.js (React + TypeScript) frontend. Owns:

- Auth UI (Supabase Auth)
- Audio upload + file/search browser
- Waveform playback + region selection (WaveSurfer.js / Web Audio API)
- Real-time collaborative annotation UI (Supabase Realtime subscriptions)
- Extraction request UI (triggers FFmpeg worker jobs, polls status)

Scaffolded with `create-next-app` (TypeScript, App Router, Tailwind, `src/` dir). Run `pnpm --filter web dev` from repo root, or `pnpm dev` from this directory.

Copy `.env.example` to `.env.local` and fill in your Supabase project's URL + anon key before running — see `src/lib/supabase.ts`.
