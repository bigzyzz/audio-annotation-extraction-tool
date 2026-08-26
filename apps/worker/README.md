# apps/worker

Standalone Node.js service (Railway/Render/Fly.io, NOT Vercel — long-running/file-heavy work). Owns:

- Polls `audio_files` where `duration_seconds` is null, downloads from Storage, ffprobe, writes duration + sample_rate (T4)
- Polls `extraction_jobs` for pending processing jobs (scaffold until R4/R8)
- Downloads source audio from Supabase Storage
- `ffprobe` metadata extraction (duration, codec, sample rate)
- Waveform peak data generation (R2, not yet)
- Lossless audio segment extraction (R4/R8, not yet):
  - WAV: exact sample-accurate cut (`target_sample = target_time * sample_rate`)
  - MP3: frame-boundary-safe `ffmpeg` stream copy; falls back to WAV/MP3 export if cut requested off-frame-boundary
- Uploads output + updates job status in Postgres

## Running locally

```
pnpm --filter worker dev
```

Copy `.env.example` to `.env` and fill in `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` first. Requires the `ffmpeg`/`ffprobe` binaries available on `PATH` (`brew install ffmpeg` locally; the deploy target's buildpack/image handles this in production).

After an upload, rows stay at `duration_seconds = null` until this process probes them. Home list shows “Processing…” until then.
