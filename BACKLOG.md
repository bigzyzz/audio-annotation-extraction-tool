# Backlog

Implementation tickets. User stories (`USER_STORIES.md`) = Done when. This file = who builds what. One GitHub Issue per ticket when you paste them (CLI not logged in from this machine).

**Board:** Todo → In Progress (one per person) → Review → Done.

**R1 contract (all four agree before code):**
- Bucket: `audio`
- Path: `{user_id}/{audio_file_id}.{mp3|wav}`
- Max size: 50 MB
- Allow: `.mp3` / `.wav` + magic-byte check
- Insert `audio_files` after Storage upload succeeds
- `duration_seconds` / `sample_rate` from worker ffprobe, not the browser
- Not in R1: waveform, annotate, search, extract

---

## Epic: R1 file upload (US4, US5)

Parent. Close when T1–T4 are Done. RK14 → Mitigated when T2+T3 land.

### T1 — Storage bucket + RLS (blocker)

**Assignee:** Aziz (`feat/r1-t1-storage`) — **Done** (migration applied + RLS verified on linked project)  
**Blocked by:** nothing  
**Blocks:** T3 (live E2E), T4 (live list)

New migration: public Storage bucket `audio`. Policies: authenticated **read all**; **insert/update/delete** only under `{auth.uid()}/…`. Same open-collab read as `audio_files` table RLS.

**Touch:** `supabase/migrations/` only.

**Done when:** bucket exists on the linked project; a logged-in user can upload to `{uid}/…` and others can read; unauthenticated write fails.

```
Title: T1: R1 Storage bucket + RLS (audio)
```

### T2 — Validate MP3/WAV (extension + MIME + header)

**Assignee:** Aziz (`feat/r1-t2-validate`) — **Done** (helper + 9 tests)  
**Blocked by:** nothing  
**Blocks:** T3

Pure TS helper + tests. Extension whitelist AND MIME AND magic bytes (WAV `RIFF....WAVE`; MP3 `ID3` or frame sync `0xFF 0xE?`). Friendly error string. Reject spoofed `.txt`→`.mp3` (US5, RK14).

**Touch:** `apps/web/src/lib/audio-validate.ts` + tests. Nobody else edits this file.

**Done when:** tests fail a renamed junk file and pass a real tiny mp3/wav fixture.

```
Title: T2: R1 Validate MP3/WAV (extension + MIME + header)
```

### T3 — Upload UI

**Assignee:** Aziz (`feat/r1-t3-upload`) — **Done** (form + live E2E)  
**Blocked by:** T2 (helper); T1 for live E2E (mock Storage until T1 merges)  
**Blocks:** T4 (needs rows)

Logged-in dropzone / file picker. Flow: validate → insert `audio_files` → upload to Storage at agreed path. Progress + disabled submit (US14). On Storage fail: no orphan row (delete row or don’t insert until upload ok).

**Touch:** `apps/web/src/components/upload-form.tsx`, `apps/web/src/app/upload/actions.ts`. Do not own `page.tsx` (T4 composes).

**Done when:** signed-in user uploads a real MP3; `audio_files` row exists; junk file shows a clear error (US4, US5).

```
Title: T3: R1 Upload UI
```

### T4 — File list + ffprobe metadata

**Assignee:** Aziz (`feat/r1-t4-list-ffprobe`) — **Done** (home list + worker probe)  
**Blocked by:** T1 (live data); T3 for a real upload path (can seed a row to start)

Signed-in home list: filename, format, duration or “processing…”. Worker: poll `audio_files` where `duration_seconds is null`, ffprobe, update duration + sample_rate. **No** waveform peaks (R2).

**Touch:** `apps/web/src/components/file-list.tsx`, `apps/web/src/app/page.tsx` (compose upload + list), `apps/worker/src/` probe module.

**Done when:** after upload, list shows the file; duration fills within a few poll intervals (US4).

```
Title: T4: R1 File list + ffprobe metadata
```

---

## Epic: R2 waveform playback (US6)

Parent: GitHub #5. Close #5 when T5–T8 are Done. RK13 → Mitigated when T5+T7 land (browser never decodes full PCM). Issues: T5 #20, T6 #21, T7 #22, T8 #23.

**R2 contract (all four agree before code):**
- Peaks: worker-generated compact JSON. Browser renders those peaks — never `decodeAudioData` of the full file (RK13)
- Peak Storage path: `{owner_id}/{audio_file_id}.peaks.json` in bucket `audio` (derived file; never overwrite the original MP3/WAV)
- Peak JSON shape (WaveSurfer v7 `load(audioUrl, peaks)`):
  ```json
  {
    "version": 1,
    "channels": 1,
    "sample_rate": 44100,
    "duration_seconds": 123.456,
    "peaks": [0.12, -0.08]
  }
  ```
  `peaks` is a mono array of normalised values in `-1..1`, roughly 50–100 values per second of audio (not a PCM dump)
- Playback: signed URL (TTL ~1h) from the authenticated client, not `/object/public` (bucket is private)
- WaveSurfer.js for waveform + transport
- Controls in R2: play, pause, seek (click waveform), volume
- Not in R2: annotations, region extract, search, Realtime, peak gen on Vercel (RK10)

### T5 — Worker waveform peaks (blocker)

**Assignee:** Aziz (`feat/r2-t5-peaks`) — **Done** (merged #24)  
**Blocked by:** nothing (`audio_files.waveform_peaks_path` already exists)  
**Blocks:** T7 (live peaks), T8 (ready state)

After probe (same temp download when possible), ffmpeg → downsample → peak JSON → Storage → set `waveform_peaks_path`. Also backfill rows where `duration_seconds` is set and `waveform_peaks_path` is null (files already probed by T4). Service-role write. Never mutate the original object.

**Touch:** `apps/worker/src/` new peaks module (extend the T4 poll; do not change the ffprobe duration contract). Worker README peak-gen bullet.

**Done when:** after upload, `waveform_peaks_path` fills within a few poll intervals; JSON is compact (not PCM); an already-probed file backfills.

```
Title: T5: R2 Worker waveform peaks
```

### T6 — Signed URL helper

**Assignee:** Aziz (`feat/r2-t6-signed-url`) — **In progress**  
**Blocked by:** nothing  
**Blocks:** T7

Authenticated helper: `createSignedUrl` for an `audio` bucket path (source file and `.peaks.json`). TTL ~3600s. Friendly error if path missing or session absent.

**Touch:** `apps/web/src/lib/signed-url.ts` + tests. Nobody else edits this file.

**Done when:** helper returns a URL that fetches a private object; unauthenticated / bad path fails with a clear error.

```
Title: T6: R2 Signed playback URL helper
```

### T7 — Waveform player + transport

**Assignee:** unassigned (`feat/r2-t7-player`)  
**Blocked by:** T5 for live peaks (use a fixture JSON until T5 merges); T6 for signed URLs (can stub)  
**Blocks:** T8

WaveSurfer.js player component. Render precomputed peaks (never full-file decode). Play / pause / seek / volume (US6). Visible loading and error if peaks or audio URL missing (US14).

**Touch:** `apps/web/src/components/waveform-player.tsx` (+ tests if practical). Do not own `file-list.tsx` or `/files/[id]` (T8 composes).

**Done when:** the four controls work against fixture audio + peaks; waveform comes from the peaks array, not `decodeAudioData` of the whole file (RK13).

```
Title: T7: R2 Waveform player + transport
```

### T8 — File page + library link

**Assignee:** unassigned (`feat/r2-t8-file-page`)  
**Blocked by:** T7 (player component); T6 for live signed URLs; T5 for live peaks

Route `/files/[id]`: load the `audio_files` row, signed URLs for audio + peaks, compose `WaveformPlayer`. FileList filename links here. Poll `waveform_peaks_path` like duration: show “Preparing waveform…” until peaks exist; player page can still open and wait.

**Touch:** `apps/web/src/app/files/[id]/page.tsx`, `apps/web/src/components/file-list.tsx`, `apps/web/src/components/audio-library.tsx` (select `waveform_peaks_path`). Do not rewrite the player internals.

**Done when:** click a library row opens that file; play/pause/seek/volume work on a real uploaded track (US6).

```
Title: T8: R2 File page + library link
```

---

## Later (not split yet)

- R3: real-time annotation UI (US7, US8)
- R9: file search (US9)
- R4/R8: extract UI + worker pipeline (US10–US12)
- R6: Nielsen pass (US14, after UI exists)
- R7: 5-user / <2s check (US13, after R3)

---

## Paste as GitHub Issues

T5–T8 opened as #20–#23 under parent #5. Add them to the GitHub Project **Todo** column. One person each. T5 merge first for live peaks.
