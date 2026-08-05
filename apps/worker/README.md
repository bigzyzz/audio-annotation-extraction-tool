# apps/worker

Standalone Node.js service (Railway/Render/Fly.io, NOT Vercel — long-running/file-heavy work). Owns:

- Polls Supabase Postgres for pending processing jobs
- Downloads source audio from Supabase Storage
- `ffprobe` metadata extraction (duration, codec, sample rate)
- Waveform peak data generation
- Lossless audio segment extraction:
  - WAV: exact sample-accurate cut (`target_sample = target_time * sample_rate`)
  - MP3: frame-boundary-safe `ffmpeg` stream copy; falls back to WAV/MP3 export if cut requested off-frame-boundary
- Uploads output + updates job status in Postgres

## Running locally

```
pnpm --filter worker dev
```

Copy `.env.example` to `.env` and fill in `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` first. Requires the `ffmpeg`/`ffprobe` binaries available on `PATH` (`brew install ffmpeg` locally; the deploy target's buildpack/image handles this in production).

Currently just a poll-loop skeleton (`src/index.ts`) — it queries an `extraction_jobs` table that doesn't exist yet (Supabase schema is a follow-up iteration) and logs "no pending jobs" until then.
