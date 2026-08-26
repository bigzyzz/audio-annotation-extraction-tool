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

## Later (not split yet)

- R2: waveform playback + controls (US6)
- R3: real-time annotation UI (US7, US8)
- R9: file search (US9)
- R4/R8: extract UI + worker pipeline (US10–US12)
- R6: Nielsen pass (US14, after UI exists)
- R7: 5-user / <2s check (US13, after R3)

---

## Paste as GitHub Issues

`gh` is not authenticated here. After `gh auth login`:

```bash
gh issue create --title "T1: R1 Storage bucket + RLS (audio)" --body-file - <<'EOF'
Blocked by: nothing. Blocks T3, T4.
See BACKLOG.md T1.
EOF
```

Or repo → Issues → New issue, paste each T1–T4 section. Add all four to the GitHub Project **Todo** column. Assign one person each. T1 merge first.
