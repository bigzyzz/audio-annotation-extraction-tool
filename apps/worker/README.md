# apps/worker

Standalone Node.js service (Railway/Render/Fly.io, NOT Vercel — long-running/file-heavy work). Owns:

- Polls `audio_files` where `duration_seconds` is null, downloads from Storage, ffprobe, writes duration + sample_rate, then generates waveform peaks on the same temp file (T5)
- Polls `audio_files` where `duration_seconds` is set and `waveform_peaks_path` is null — backfills peaks for rows probed before T5
- Polls `extraction_jobs` for pending processing jobs (scaffold until R4/R8)
- Downloads source audio from Supabase Storage
- `ffprobe` metadata extraction (duration, codec, sample rate)
- Waveform peak data generation (R2 T5): ffmpeg downsample → compact JSON at `{owner_id}/{audio_file_id}.peaks.json`
- Lossless audio segment extraction (R4/R8, not yet):
  - WAV: exact sample-accurate cut (`target_sample = target_time * sample_rate`)
  - MP3: frame-boundary-safe `ffmpeg` stream copy; falls back to WAV/MP3 export if cut requested off-frame-boundary
- Uploads output + updates job status in Postgres

## Running locally

```
pnpm --filter worker dev
```

Copy `.env.example` to `.env` and fill in `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` first. Requires the `ffmpeg`/`ffprobe` binaries available on `PATH` (`brew install ffmpeg` locally; the deploy target's buildpack/image handles this in production).

After an upload, rows stay at `duration_seconds = null` until this process probes them. Home list shows “Processing…” until then. `waveform_peaks_path` fills in the same poll cycle (or on the backfill pass for older rows).
