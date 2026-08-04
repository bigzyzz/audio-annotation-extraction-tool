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

Not yet scaffolded.
