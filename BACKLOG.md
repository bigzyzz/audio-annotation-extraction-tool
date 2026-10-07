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

**Assignee:** Aziz (`feat/r2-t6-signed-url`) — **Done** (merged #25)  
**Blocked by:** nothing  
**Blocks:** T7

Authenticated helper: `createSignedUrl` for an `audio` bucket path (source file and `.peaks.json`). TTL ~3600s. Friendly error if path missing or session absent.

**Touch:** `apps/web/src/lib/signed-url.ts` + tests. Nobody else edits this file.

**Done when:** helper returns a URL that fetches a private object; unauthenticated / bad path fails with a clear error.

```
Title: T6: R2 Signed playback URL helper
```

### T7 — Waveform player + transport

**Assignee:** Aziz (`feat/r2-t7-player`) — **Done** (merged #26)  
**Blocked by:** T5 for live peaks (use a fixture JSON until T5 merges); T6 for signed URLs (can stub)  
**Blocks:** T8

WaveSurfer.js player component. Render precomputed peaks (never full-file decode). Play / pause / seek / volume (US6). Visible loading and error if peaks or audio URL missing (US14).

**Touch:** `apps/web/src/components/waveform-player.tsx` (+ tests if practical). Do not own `file-list.tsx` or `/files/[id]` (T8 composes).

**Done when:** the four controls work against fixture audio + peaks; waveform comes from the peaks array, not `decodeAudioData` of the whole file (RK13).

```
Title: T7: R2 Waveform player + transport
```

### T8 — File page + library link

**Assignee:** Aziz (`feat/r2-t8-file-page`) — **Done** (closed #23)  
**Blocked by:** T7 (player component); T6 for live signed URLs; T5 for live peaks

Route `/files/[id]`: load the `audio_files` row, signed URLs for audio + peaks, compose `WaveformPlayer`. FileList filename links here. Poll `waveform_peaks_path` like duration: show “Preparing waveform…” until peaks exist; player page can still open and wait.

**Touch:** `apps/web/src/app/files/[id]/page.tsx`, `apps/web/src/components/file-list.tsx`, `apps/web/src/components/audio-library.tsx` (select `waveform_peaks_path`). Do not rewrite the player internals.

**Done when:** click a library row opens that file; play/pause/seek/volume work on a real uploaded track (US6).

```
Title: T8: R2 File page + library link
```

---

## Epic: R3 real-time annotation (US7, US8)

Parent: GitHub #6. Close #6 when T9–T12 are Done. RK1 → Monitored when T12 lands (Mitigated stays R7). RK2 → Monitored when T11 lands. Issues: T9 #28, T10 #29, T11 #30, T12 #31.

**R3 contract (all four agree before code):**
- Table already exists: `annotations` (`audio_file_id`, `author_id`, `start_seconds`, `end_seconds`, `label`, `comment`, `version`). No new columns. RLS already: any authenticated user reads; author insert/update/delete
- Writes go through the T9 helper — not ad-hoc `supabase.from("annotations")` in every component
- Create: `author_id = auth.uid()`; at least one of `label` / `comment` (trim empty → null)
- Update: `.eq("version", clientVersion)`; 0 rows = stale write → conflict in the UI, never silent overwrite (trigger `bump_annotation_version` already exists)
- Time from WaveSurfer audio clock (click / `getCurrentTime()`), not `Date.now()` or a second HTML5 `<audio>` (RK2). Round to 2 decimal seconds. `end >= start` (DB check)
- Display author via `profiles.username`
- Realtime: `postgres_changes` on `public.annotations` filtered by `audio_file_id`. Apply INSERT/UPDATE/DELETE. Throttle UI merge. **Not** ephemeral cursor / playback broadcast (that is R7)
- Markers: WaveSurfer Regions (or equivalent) from `start_seconds` / `end_seconds`; point note = marker at start
- Not in R3: extract, search, 5-user latency bench (R7), Nielsen full pass (R6)

### T9 — Annotation write helper (OCC)

**Assignee:** Aziz (`feat/r3-t9-annotation-writes`) — **Done**  
**Blocked by:** nothing (table + trigger already exist)  
**Blocks:** T10, T12

Insert / update / delete helper + tests. Update must send `.eq("version", clientVersion)` and return a clear conflict when 0 rows. Reject empty label+comment. Friendly errors.

**Touch:** `apps/web/src/lib/annotations.ts` + tests. Nobody else edits this file.

**Done when:** insert persists a row; stale-version update reports conflict (no overwrite); author delete works; missing label+comment is rejected.

```
Title: T9: R3 Annotation write helper (OCC)
```

### T10 — Annotation list + form

**Assignee:** Aziz (`feat/r3-t10-annotation-panel`) — **Done**  
**Blocked by:** T9 (stub the same return shape until T9 merges)  
**Blocks:** T12

Signed-in list of notes for one file + create form: start (required), end (optional), label and/or comment. `currentTime` is a prop from the parent (T12 wires player click). Submit disabled while pending (US14). Show helper conflict, don’t retry-overwrite.

**Touch:** `apps/web/src/components/annotation-panel.tsx`. Do not own `waveform-player.tsx` or `/files/[id]` (T12 composes).

**Done when:** signed-in user creates a note; it is in the list after reload (US7). Empty label+comment shows a clear error. Junk timestamp (end before start) is refused.

```
Title: T10: R3 Annotation list + form
```

### T11 — Timeline markers + click-to-stamp

**Assignee:** Aziz (`feat/r3-t11-timeline-markers`) — **Done**  
**Blocked by:** nothing (fixture annotations)  
**Blocks:** T12

Extend the player: click/seek reports audio time; draw markers/regions from an `annotations` prop. Keep play / pause / seek / volume. Do not decode full PCM (RK13 still holds).

**Touch:** `apps/web/src/components/waveform-player.tsx` (+ tests if practical). Do not own the list or `/files/[id]`.

**Done when:** click waveform returns a time; fixture notes appear on the timeline at start/end; transport still works (RK2).

```
Title: T11: R3 Timeline markers + click-to-stamp
```

### T12 — Realtime + file page compose

**Assignee:** Aziz (`feat/r3-t12-realtime-compose`) — **Done**  
**Blocked by:** T9 (writes); T10 (panel); T11 (player time + markers)

Route `/files/[id]`: load notes, pass `currentTime` from player → form, pass notes → markers, subscribe to Realtime. Migration: `replica identity full` + add `annotations` to `supabase_realtime`. Merge INSERT/UPDATE/DELETE into the list without a full reload.

**Touch:** `apps/web/src/components/file-player-panel.tsx`, `apps/web/src/app/files/[id]/page.tsx`, `supabase/migrations/`. Do not rewrite player internals or the panel form.

**Done when:** user B sees user A’s create/edit/delete on the same file without a full page refresh (US8). Create still persists on reload (US7).

```
Title: T12: R3 Realtime + file page compose
```

---

## Epic: R9 file search (US9)

Parent: GitHub #10. Close #10 when T13–T16 are Done. Issues: T13 #36, T14 #37, T15 #38, T16 #39.

**R9 contract (all four agree before code):**
- Match: case-insensitive **substring** of `audio_files.filename` (US9). Not English FTS ranking. Existing `audio_files_filename_idx` is `to_tsvector('english', filename)` — ignore it for this epic
- Empty query: show the full library (same order as today: `created_at` desc). Do **not** treat blank as “no results”
- Empty match: obvious copy (“No tracks match …”). Distinct from “No tracks yet”
- Login required: search lives on signed-in home only (anon already cannot see the library)
- Escape LIKE / ILIKE metacharacters (`%`, `_`, `\`) so a query of `%` is literal
- Debounce the input (~250ms). Results still link to `/files/[id]`
- Not in R9: extract, annotate, filter by format/owner, search comments, search on `/files/[id]`

### T13 — Search query helper

**Assignee:** (`feat/r9-t13-search-query`) — **Done** (helper + tests)  
**Blocked by:** nothing  
**Blocks:** T14, T16

Pure TS: trim, lowercase for compare, escape ILIKE wildcards, build the `%pattern%`. Empty / whitespace → `{ empty: true }` (caller shows all files). Tests: substring, case, `%`/`_` literal, blank.

**Touch:** `apps/web/src/lib/search-query.ts` + tests. Nobody else edits this file.

**Done when:** tests pass for match rules above; no Supabase in this ticket.

```
Title: T13: R9 Search query helper
```

### T14 — Search fetch helper

**Assignee:** (`feat/r9-t14-search-fetch`) — **Done** (fetch helper + tests)  
**Blocked by:** T13 (stub the same return shape until T13 merges)  
**Blocks:** T16

Authenticated helper: `searchAudioFiles(supabase, query)`. Session absent → friendly error. Empty query → all rows (`created_at` desc). Non-empty → `.ilike("filename", pattern)` from T13. Optional migration: `pg_trgm` GIN on `filename` (ILIKE, not the english tsvector). Select the same columns `FileList` already uses.

**Touch:** `apps/web/src/lib/search-audio.ts` + tests. Migration only if adding trigram. Nobody else edits the helper.

**Done when:** mock tests cover all / substring / no session; junk wildcard query does not throw.

```
Title: T14: R9 Search fetch helper
```

### T15 — Search field UI

**Assignee:** (`feat/r9-t15-search-field`) — **Done** (component + tests)  
**Blocked by:** nothing (local state + callback)  
**Blocks:** T16

Signed-in search input: placeholder, debounce ~250ms, clear control, pending/disabled while parent is fetching (US14). Emits the raw query string. Do **not** fetch files here.

**Touch:** `apps/web/src/components/search-field.tsx` (+ tests if practical). Do not own `file-list.tsx` or `audio-library.tsx` (T16 composes).

**Done when:** typing emits a debounced query; clear resets to empty; empty field is valid (not an error).

```
Title: T15: R9 Search field UI
```

### T16 — Library compose + empty match

**Assignee:** (`feat/r9-t16-library-search`) — **Done** (composed + empty match copy)  
**Blocked by:** T13 (pattern); T14 (fetch); T15 (field)

Home `AudioLibrary`: render `SearchField`, call T14, pass rows to `FileList`. Empty query keeps full list. Empty match uses distinct copy from “No tracks yet”. Optional `?q=` on `/` so a search is shareable. Login still required (existing home gate).

**Touch:** `apps/web/src/components/audio-library.tsx`, `apps/web/src/components/file-list.tsx` (empty-match copy), maybe `apps/web/src/app/page.tsx` for `?q=`. Do not rewrite upload or the search helper internals.

**Done when:** signed-in user types a name and matching rows remain; a miss shows the empty-match message; `/login` users never see search (US9).

```
Title: T16: R9 Library compose + empty match
```

---

## Epic: R4 / R8 Audio Extraction (US10, US11, US12)

Parent: GitHub #7. Close #7 when T17–T20 are Done. RK3 / RK8 → Mitigated when worker pipeline lands. Issues: T17 #49, T18 #50, T19 #51, T20 #52.

**R4 / R8 contract (all four agree before code):**
- Storage: bucket `audio`
  - Extracted audio: `extractions/{audio_file_id}/{job_id}.{format}` (derived file; never overwrite original)
  - Annotation metadata: `extractions/{audio_file_id}/{job_id}.annotations.json`
- Lossless cutting:
  - WAV: exact sample-accurate cut (`target_sample = target_time * sample_rate`)
  - MP3: frame-boundary stream copy (`-c copy`) without re-encoding (preserves original quality/bitrate)
- DB Table: `public.extraction_jobs`
  - Columns: `id`, `audio_file_id`, `requested_by`, `start_seconds`, `end_seconds`, `status`, `output_path`, `error_message`
  - Status flow: `pending` -> `processing` -> `completed` / `failed`
- Worker service-role client polls `pending` jobs, transitions status, processes cuts, uploads to Storage.

### T17 — Worker Lossless Cutting Engine

**Assignee:** (`feat/r4-t17-worker-cutting`) — #49 — **Done** (cutting engine + tests)  
**Blocked by:** nothing (local audio file fixtures)  
**Blocks:** T18  

Pure audio cutting module + tests in `apps/worker/src/extract.ts`. Handles sample-accurate WAV extraction and frame-boundary MP3 stream copy (`-c copy`) without lossy re-encoding (req R8). Generates exportable annotation metadata JSON for notes in the selected timestamp window (req R4).

**Touch:** `apps/worker/src/extract.ts` + tests.

**Done when:** given audio file path and start/end seconds, produces lossless cut segment and annotation metadata JSON without transcoding or quality loss.

```
Title: T17: R4/R8 Worker Lossless Cutting Engine
```

### T18 — Worker Extraction Job Runner & Storage Pipeline

**Assignee:** (`feat/r4-t18-worker-pipeline`) — #50 — **Done** (runner + storage pipeline + tests)  
**Blocked by:** T17 (cutting engine)  
**Blocks:** T20 (live pipeline)  

Worker queue runner: poll `extraction_jobs` where `status = 'pending'`, atomically transition to `processing`. Download source audio from Storage, query overlapping `annotations`, call T17 engine to cut audio and build metadata JSON, upload both files to `extractions/{audio_file_id}/{job_id}.*`, and update job row with `output_path` and `status = 'completed'` (or `failed` with `error_message`).

**Touch:** `apps/worker/src/job-runner.ts`, `apps/worker/src/index.ts`.

**Done when:** inserting a `pending` row into `extraction_jobs` triggers the worker to download, cut, upload result, and mark row `completed` with valid `output_path`.

```
Title: T18: R4/R8 Worker Extraction Job Runner & Storage Pipeline
```

### T19 — Extraction Client & Signed Download Helpers

**Assignee:** (`feat/r4-t19-extraction-client`) — #51 — **Done** (client helper + tests)  
**Blocked by:** nothing  
**Blocks:** T20  

Web client API helpers and validation in `apps/web/src/lib/extraction.ts`:
- `requestExtractionJob(supabase, { audioFileId, startSeconds, endSeconds })`: validates timestamps (`0 <= start < end <= duration`), inserts `extraction_jobs` row.
- `getExtractionJobs(supabase, audioFileId)`: lists user's extraction jobs for this file.
- `createExtractionDownloadUrls(supabase, outputPath)`: signs Storage download URLs for extracted audio and annotation JSON.

**Touch:** `apps/web/src/lib/extraction.ts` + tests.

**Done when:** unit tests verify range validation, database insert payload, and signed download URL resolution.

```
Title: T19: R4 Extraction Client & Signed Download Helpers
```

### T20 — Extraction UI, Region Preview & Download Panel

**Assignee:** (`feat/r4-t20-extraction-ui`) — #52 — **Done** (UI + preview + download panel + tests)  
**Blocked by:** T19 (client helper); T18 for live worker pipeline (stub completed row to start)  
**Blocks:** nothing (closes Epic R4/R8)  

Extraction interface on `/files/[id]`:
- WaveSurfer region integration: "Extract Selection" picks active timeline region endpoints (US10).
- "▶ Preview Cut" plays the selected slice before submitting (US11).
- Submit extraction job via T19 with loading indicator and disabled submit while pending (US14).
- Polls/listens for job completion, displaying status (`pending` -> `processing` -> `completed` / `failed`).
- Provides download buttons for the extracted audio segment and annotation metadata JSON (US12).

**Touch:** `apps/web/src/components/extraction-panel.tsx`, `apps/web/src/components/file-player-panel.tsx`, `apps/web/src/app/files/[id]/page.tsx`.

**Done when:** signed-in user chooses a timeline slice on `/files/[id]`, previews playback, submits extract job, and downloads the finished lossless audio cut and annotation JSON (US10, US11, US12).

```
Title: T20: R4/R8 Extraction UI, Region Preview & Download Panel
```

---

## Epic: R6 Nielsen Usability Heuristics Pass (US14)

Parent: GitHub #8. Close #8 when T21–T24 are Done. RK6 → Mitigated when UI heuristics pass lands. Issues: T21 #59, T22 #60, T23 #61, T24 #62.

**R6 contract (all four agree before code):**
- Adhere to Jakob Nielsen's 10 Usability Heuristics across the completed application
- US14 acceptance criteria: pending actions disable submit; system state and async progress visible; destructive actions require confirmation or can be cancelled; actionable recovery feedback on error states
- Keyboard accessibility: Spacebar play/pause, seek shortcuts, `?` keyboard cheat sheet
- Empty states: welcoming, actionable copy across library, search, and annotations
- Touch `apps/web/` frontend components only — no schema or worker pipeline changes

### T21 — Status Visibility & Recovery Messaging

**Assignee:** (`feat/r6-t21-status-visibility`) — #59  
**Blocked by:** nothing  
**Blocks:** nothing  

Improve system visibility and user recovery feedback across asynchronous workflows (US14):
- Add real-time sync / connection state indicator on `/files/[id]` (e.g. connected, reconnecting, offline).
- Implement accessible loading skeletons and progress spinners during worker waveform peak generation, audio upload, and extraction queue polling.
- Replace opaque or raw system error alerts with human-readable, actionable recovery guidance across auth, upload, annotation (OCC conflict handling), and extraction.
- Introduce non-intrusive toast / banner notifications for asynchronous completions (e.g. extraction completed ready to download).

**Touch:** `apps/web/src/components/`, `apps/web/src/app/files/[id]/page.tsx`, `apps/web/src/lib/`.

**Done when:** Users receive immediate, visible status feedback for all async states, network changes, and actionable recovery steps on errors.

```
Title: T21: R6 Status Visibility & Recovery Messaging
```

### T22 — Error Prevention & Destructive Action Safeguards

**Assignee:** (`feat/r6-t22-error-prevention`) — #60  
**Blocked by:** nothing  
**Blocks:** nothing  

Prevent user slips/mistakes and provide safe emergency exits before irreversible actions (US14):
- Add explicit two-step confirmation dialogs or undo mechanisms for destructive actions (deleting annotations and uploaded audio files).
- Implement live inline validation on timestamp input bounds (preventing start >= end, start < 0, or end > audio duration) before submission.
- Guard against accidental navigation / modal closure when forms contain unsaved annotation edits (dirty form warning).
- Enforce disabled submit states and prevention of double-clicks during in-flight network requests.

**Touch:** `apps/web/src/components/annotation-panel.tsx`, `apps/web/src/components/extraction-panel.tsx`, `apps/web/src/components/file-list.tsx`.

**Done when:** Accidental deletions require explicit confirmation, timestamp forms proactively block invalid bounds before submit, and unsaved changes cannot be lost inadvertently.

```
Title: T22: R6 Error Prevention & Destructive Action Safeguards
```

### T23 — Keyboard Shortcuts & Power-User Efficiency

**Assignee:** (`feat/r6-t23-keyboard-shortcuts`) — #61  
**Blocked by:** nothing  
**Blocks:** nothing  

Empower both novice and power users with intuitive keyboard transport and shortcuts (US14):
- Implement keyboard navigation shortcuts for playback and timeline inspection: Spacebar (Play/Pause), Left/Right Arrows (Seek ±1s / ±5s with Shift), J/K/L transport, 'M' (Stamp annotation marker at playhead), 'Esc' (Cancel active selection or close modal).
- Add an accessible Keyboard Shortcuts cheat sheet / help modal toggled by pressing `?` or clicking a persistent help trigger.
- Add one-click "Clear Selection" emergency exits for active WaveSurfer regions and active search query inputs.

**Touch:** `apps/web/src/components/waveform-player.tsx`, `apps/web/src/components/file-player-panel.tsx`, `apps/web/src/components/search-field.tsx`.

**Done when:** Users can fluidly scrub, play, stamp annotations, and cancel selections without touching a mouse; pressing `?` displays the shortcut reference.

```
Title: T23: R6 Keyboard Shortcuts & Power-User Efficiency
```

### T24 — UI Consistency, Empty States & Accessibility Pass

**Assignee:** (`feat/r6-t24-ui-consistency-a11y`) — #62  
**Blocked by:** nothing  
**Blocks:** nothing  

Harmonize UI aesthetics, typography, accessibility, and guidance across all pages (US14):
- Standardize design tokens, spacing, button variants, and navigation breadcrumbs across `/`, `/upload`, `/files/[id]`, `/login`, and `/signup`.
- Provide contextual, welcoming empty states with clear calls-to-action (empty library with "+ Upload track", empty search with clear suggestions, empty annotations with "Drag on waveform to annotate").
- Audit and enhance accessibility (ARIA labels for audio playhead, waveform canvas, playback controls, and volume sliders; logical tab indexing; color contrast compliance).
- Ensure intuitive, human-friendly time formatting (e.g. MM:SS.ms displays with hover tooltips) to avoid raw second recall.

**Touch:** `apps/web/src/components/`, `apps/web/src/app/`.

**Done when:** Visual hierarchy and design standards are unified across all routes; all empty states guide user action; screen readers and tab navigation work cleanly.

```
Title: T24: R6 UI Consistency, Empty States & Accessibility Pass
```

---

## Later (not split yet)

- R7: 5-user / <2s check (US13, after R3/R6)

---

## Paste as GitHub Issues

T5–T8 opened as #20–#23 under parent #5. T9–T12 opened as #28–#31 under parent #6. T13–T16 opened as #36–#39 under parent #10. T17–T20 opened as #49–#52 under parent #7. T21–T24 opened as #59–#62 under parent #8. Add them to the GitHub Project **Todo** column. One person each.
