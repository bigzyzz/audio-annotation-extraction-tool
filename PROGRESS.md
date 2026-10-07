# Progress Log

Living task log. Update after every feature/session so the next prompt (human or AI) has continuity without re-reading the whole repo history.

## How to use this file

- **Done**: append one line per shipped feature/fix, newest at top. Link the PR if there is one.
- **In Progress**: what's actively being worked on right now, by what (session/branch).
- **Up Next**: near-term backlog, roughly ordered.
- **Decisions Log**: any decision made mid-build that changes or refines something in `AGENTS.md` — then also update `AGENTS.md` itself if it's a lasting convention.
- **Risks**: if the feature creates, changes, or closes a risk, update `RISK_REGISTER.md` in the same PR. `project_plan.pdf` is the submitted snapshot; the markdown file is the living register.
- **Stories**: `USER_STORIES.md` is the Done-when list (US1–US14 → R1–R9). Tick/confirm the matching US in the feature PR; don’t treat stories as implementation slices.
- **Tickets**: `BACKLOG.md` is the implementation split (T1–T4 R1, T5–T8 R2, T9–T12 R3, T13–T16 R9). One GitHub Issue per ticket; one In Progress per person.

---

## Done

- T20 (R4/R8): Extraction UI, region preview & download panel. Built `ExtractionPanel` (lossless slice form with duration readout, playhead stamping, timeline region sync, "▶ Preview Cut" via WaveSurfer, submit progress, job history with status badges, and download triggers for audio cuts + annotations JSON sidecars). Integrated into `/files/[id]`, `FilePlayerPanel`, and `WaveformPlayer`. 8 unit tests in `extraction-panel.test.ts`. Closes #52 and parent #7 (Epic R4/R8 complete).
- T19 (R4): Extraction client & signed download helpers. Web client helpers in `apps/web/src/lib/extraction.ts` (`requestExtractionJob`, `getExtractionJobs`, `createExtractionDownloadUrls`, `validateExtractionTimes`, `validateExtractionStoragePath`). 14 unit tests in `apps/web/src/lib/extraction.test.ts`. Closes #51.
- T18 (R4/R8): Worker extraction job runner & storage pipeline. Implemented extraction job polling, atomic job claiming (`pending` -> `processing`), storage downloading, T17 lossless cutting and sidecar annotation metadata generation, storage upload to `extractions/{audio_file_id}/{job_id}.*`, and status transition to `completed` or `failed`. Wired into worker poll loop in `apps/worker/src/index.ts`. Closes #50.
- T17 (R4/R8): Worker lossless cutting engine. Pure FFmpeg audio cutting module + annotation metadata generator in `apps/worker/src/extract.ts`. Validates extraction bounds, builds deterministic stream-copy commands (`-c copy`, `-avoid_negative_ts make_zero`) without lossy re-encoding for WAV/MP3 (R8), and formats overlapping annotations into segment-relative JSON schema (R4). Shared extraction types in `@audio-tool/shared-types`. Closes #49.
- Dedicated Upload & Library Pages (R1, R6, R9): Separated audio upload from the library page; `AudioLibrary` renders tracks and search exclusively with a direct "+ Upload track" action button; `SiteHeader` adds a "Library" navigation link beside "Upload"; `/upload` page includes a "← Back to library" breadcrumb and upload success message links back to the library. Branch `feat/separate-upload-library-pages`.
- Tactile Playhead Scrubber & Resilient Annotation Selection (R2, R3, R6): Replaced the 1px WaveSurfer cursor line with a prominent tactile 24×20px playhead scrubber knob with dual grip bars and vertical needle for smooth 60fps scrubbing with pointer capture, keyboard nudging, and Spacebar play/pause shortcut; resolved annotation mode breakage by decoupling `enableDragSelection` lifecycle from reactive state updates and disabling conflicting `dragToSeek` on the waveform; enabled seamless simultaneous playback and annotation with live "⏱ Stamp Playhead (MM:SS)" quick-action and "▶ Preview Selection" segment playback in both the waveform banner and annotation form. Branch `feat/r2-r3-waveform-annotation-ui`.
- Visual Waveform Selection & Simplified Annotations UI (R2, R3, R6): Replaced all range sliders and the target timestamp card with direct visual waveform selection; section renamed to "Annotations" with a prominent "+ Add Annotation" button; clicking "+ Add Annotation" enables WaveSurfer Regions drag-selection for section highlighting and click-to-point selection directly on the waveform with live resize/drag handles; annotation form appears only while creating or editing and cleanly cancels on demand. Branch `feat/r2-r3-waveform-annotation-ui`.
- Timeline Slider & 1.0s Annotation Timing Refinement (R2, R3, R6): Refined active label display window to exactly 1.0s (`LABEL_DISPLAY_DURATION = 1.0`) from the note start timestamp so sequential notes within 2–3s appear in turn without masking; embedded the interactive timeline section slider directly under the WaveSurfer canvas within a unified player container; removed duplicate slider card box from `AnnotationPanel` and replaced with target timestamp overview and fine-tuning inputs synced bidirectionally via `FilePlayerPanel`. Branch `feat/r2-r3-waveform-annotation-ui`.
- Waveform & Annotation UI/UX Overhaul (R2, R3, R6): Increased waveform height to 160px with full-width layout; active annotation display banner rendered directly above the waveform during playback (prioritizes most recent overlapping note and clears outside sections); removed cluttered in-canvas text labels from waveform regions; repositioned annotation panel underneath the player with full-width responsive 2-column layout; added interactive dual sliders for start and end timestamp/range selection with playhead snap and duration readouts. Branch `feat/r2-r3-waveform-annotation-ui`.
- Demo Auth Quick-Access: 1-click demo login & form fill for Alice and Bob in `apps/web/src/components/demo-auth-panel.tsx` and `loginAsDemoUser` in `apps/web/src/app/login/actions.ts`; auto-seeds demo accounts on demand to bypass SMTP confirmation delays during evaluations (US1, US2, RK11).
- T16 (R9): Library compose + empty match. `AudioLibrary` composes `SearchField` + `searchAudioFiles` with `?q=` URL synchronization and background polling filter; `FileList` renders distinct empty-match message when no rows match query (US9, US14). Closes #39 and parent #10 (Epic R9 complete).
- T15 (R9): Search field UI. Debounced (~250ms) search input in `apps/web/src/components/search-field.tsx` with clear button, Escape key reset, and isPending/disabled state (US9, US14). Closes #38.
- T14 (R9): Search fetch helper. Authenticated helper `searchAudioFiles` in `apps/web/src/lib/search-audio.ts`. Empty/blank query returns all files (`created_at` desc); non-empty applies `.ilike("filename", pattern)`; unauthenticated returns friendly error. Closes #37.
- T13 (R9): Search query helper. Pure TS in `apps/web/src/lib/search-query.ts`: trim, lowercase, escape ILIKE wildcards (`\`, `%`, `_`), build `%pattern%`, in-memory matcher; blank/whitespace returns `{ empty: true }`. Closes #36.
- T12 (R3): Realtime + file page compose. `/files/[id]` wires peaks player + `AnnotationPanel`; `postgres_changes` on `annotations` merges INSERT/UPDATE/DELETE without a reload (US7, US8). Migration adds table to `supabase_realtime`. RK1 → Monitored. Closes #31 and #6.
- T11 (R3): Timeline markers + click-to-stamp. WaveSurfer Regions from annotation start/end; click/seek reports audio-clock time (`onTimeSelect`). RK2 → Monitored. Closes #30 ([#34](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/34)).
- T10 (R3): Annotation list + form. `AnnotationPanel` loads notes, creates via T9 helper, edit/delete own rows (OCC conflict shown, two-step delete). Closes #29 ([#33](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/33)).
- T9 (R3): Annotation write helper (OCC). `createAnnotation` / `updateAnnotation` / `deleteAnnotation` in `apps/web/src/lib/annotations.ts`. Updates `.eq("version", clientVersion)`; 0 rows → conflict, no silent overwrite. Empty label+comment rejected. Closes #28 ([#32](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/32)).
- T8 (R2): File page + library link. `/files/[id]` composes signed URLs + `WaveformPlayer`; library filename links here; polls until peaks exist. Closes #23.
- T7 (R2): Waveform player + transport. `WaveformPlayer` (WaveSurfer.js) renders worker peaks with play/pause/seek/volume (US6). Closes #22 ([#26](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/26)).
- T6 (R2): Signed playback URL helper. `createSignedPlaybackUrl` for private `audio` bucket objects. Closes #21 ([#25](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/25)).
- T5 (R2): Worker waveform peaks. ffmpeg downsample → compact peaks JSON at `{owner_id}/{id}.peaks.json`; sets `waveform_peaks_path` after probe or backfill poll. Shared `WaveformPeaksDocument` type. Closes #20 ([#24](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/24)).
- T4 (R1): File list + ffprobe. Signed-in home composes `UploadForm` + `FileList` (filename, format, duration or “Processing…”). Worker polls `audio_files` where `duration_seconds is null`, downloads Storage object, ffprobe, writes duration + sample_rate. List polls every 2s so duration fills without a reload. No waveform peaks (R2). Closes US4. Branch `feat/r1-t4-list-ffprobe`.
- T3 (R1): Upload UI. `/upload` dropzone + picker; `validateAudioFile` then Storage `{uid}/{id}.{mp3|wav}` then `audio_files` insert (no row until upload ok; insert fail deletes object). Submit disabled while pending (US14). Verified live: real `tiny.mp3` created a row; spoofed `.txt`→`.mp3` showed the magic-byte error and wrote nothing. Home `page.tsx` untouched (T4 composes). Closes #14. US4 list still T4. RK14 → Mitigated.
- T2 (R1): MP3/WAV validator (`apps/web/src/lib/audio-validate.ts`). Extension whitelist AND MIME AND magic bytes (WAV `RIFF....WAVE`; MP3 `ID3` or frame sync `0xFF 0xE?`). 9 tests including US5 spoofed `.txt`→`.mp3`. Empty MIME allowed only when ext+magic already agree. T3 must call this before upload. US5 UI error still T3. RK14 stays Monitored until T3 wires it. Closes #13.
- T1 (R1): Storage bucket `audio` + RLS. Migration `20260825131000_create_audio_storage_bucket.sql` pushed to linked project. Bucket not world-public (50 MiB). Authenticated read-all; write only under `{auth.uid()}/…`. Verified live: owner upload ok, other-user read ok, cross-folder write denied, anon write denied. Unblocks T3 E2E and T4 list. US4 still open (needs T3/T4).
- Added `BACKLOG.md`: R1 split into tickets T1–T4 (storage, validate, upload UI, list + ffprobe). One person each; T1 merges first. GitHub Issues not created from this machine (`gh` not logged in) — paste from `BACKLOG.md`.
- Added living `USER_STORIES.md` (US1–US14): cleaned team draft mapped to R1–R9. Deduped, dropped Backend/UX tags, added missing validation / preview / sync / usability checks. Stories = acceptance; RTM still wins for scope.
- Added living `RISK_REGISTER.md` (RK1–RK18): implementation risks plus all 9 rows from `project_plan.pdf` Appendix B (PDF R1–R9 mapped to RK* so they don’t collide with requirement IDs). Weekly sprint-review scan of Open + High rows.
- R5: auth signup/login UI + Supabase Auth wiring. `@supabase/ssr` browser/server clients (`apps/web/src/lib/supabase/{client,server}.ts`) replace the old plain `createClient` so sessions are cookie-based and readable from Server Components/Actions. `src/proxy.ts` (Next.js 16's replacement for `middleware.ts`) refreshes the session on every request. Signup (`/signup`) collects username + email + password via a Server Action calling `supabase.auth.signUp({ options: { data: { username } } })`; login (`/login`) via `signInWithPassword`; logout via a Server Action in the header. Session-aware `SiteHeader` + landing page show signed-in/out state. Verified end-to-end against the real Supabase project (signup -> `profiles` trigger fires with correct username -> login -> logout; duplicate-username signup correctly rejected).
- Defined core Supabase schema (`profiles`, `audio_files`, `annotations`, `extraction_jobs`) + RLS policies in one migration (`supabase/migrations/20260805055116_create_core_schema.sql`), applied via Supabase CLI (`supabase db push --linked`). Scaffolded `packages/shared-types` with `supabase gen types`-generated row types (`Profile`, `AudioFile`, `Annotation`, `ExtractionJob`), wired into both `apps/web` and `apps/worker`. Worker's poll loop now queries the real `extraction_jobs` table cleanly (no more `PGRST205`).
- Created Supabase project (`qsfteifrmlvftedleapa`), verified URL/anon/service-role keys work end-to-end from both `apps/web/.env.local` and `apps/worker/.env`.
- Scaffolded `apps/web` (`create-next-app`: TS, App Router, Tailwind, `src/` dir) + `apps/worker` (hand-rolled: `package.json`/`tsconfig.json`/poll-loop skeleton, `fluent-ffmpeg` wired for ffprobe). Both boot clean (`pnpm dev:web` / `pnpm dev:worker`) and pass `pnpm -r lint` / `pnpm -r build`. ([PR #1](https://github.com/bigzyzz/audio-annotation-extraction-tool/pull/1), merged)
- Repo scaffolded: pnpm monorepo (`apps/web`, `apps/worker`, `packages/shared-types`), `AGENTS.md`, `.cursor/rules/`.

## In Progress

- (none)

## Up Next

R1 split — one ticket per person, details in `BACKLOG.md`:

- [x] **T1** R1 Storage bucket + RLS (`audio`) — live on linked project; branch `feat/r1-t1-storage`
- [x] **T2** R1 Validate MP3/WAV (extension + MIME + header) — US5 helper; branch `feat/r1-t2-validate`
- [x] **T3** R1 Upload UI — US4, US5; branch `feat/r1-t3-upload`
- [x] **T4** R1 File list + ffprobe metadata — US4; branch `feat/r1-t4-list-ffprobe`

R2 split — one ticket per person, details in `BACKLOG.md` (parent GitHub #5):

- [x] **T5** R2 Worker waveform peaks — #20 `feat/r2-t5-peaks`
- [x] **T6** R2 Signed playback URL helper — #21 `feat/r2-t6-signed-url`
- [x] **T7** R2 Waveform player + transport — #22 `feat/r2-t7-player`
- [x] **T8** R2 File page + library link — #23 `feat/r2-t8-file-page`

R3 split — one ticket per person, details in `BACKLOG.md` (parent GitHub #6):

- [x] **T9** R3 Annotation write helper (OCC) — #28 `feat/r3-t9-annotation-writes`
- [x] **T10** R3 Annotation list + form — #29 `feat/r3-t10-annotation-panel`
- [x] **T11** R3 Timeline markers + click-to-stamp — #30 `feat/r3-t11-timeline-markers`
- [x] **T12** R3 Realtime + file page compose — #31 `feat/r3-t12-realtime-compose`

R9 split — one ticket per person, details in `BACKLOG.md` (parent GitHub #10):

- [x] **T13** R9 Search query helper — #36 `feat/r9-t13-search-query`
- [x] **T14** R9 Search fetch helper — #37 `feat/r9-t14-search-fetch`
- [x] **T15** R9 Search field UI — #38 `feat/r9-t15-search-field`
- [x] **T16** R9 Library compose + empty match — #39 `feat/r9-t16-library-search`

R4/R8 split — one ticket per person, details in `BACKLOG.md` (parent GitHub #7):

- [x] **T17** R4/R8 Worker lossless cutting engine — #49 `feat/r4-t17-worker-cutting`
- [x] **T18** R4/R8 Worker extraction job runner & storage pipeline — #50 `feat/r4-t18-worker-pipeline`
- [x] **T19** R4 Extraction client & signed download helpers — #51 `feat/r4-t19-extraction-client`
- [x] **T20** R4/R8 Extraction UI, region preview & download panel — #52 `feat/r4-t20-extraction-ui`

R6 split — one ticket per person, details in `BACKLOG.md` (parent GitHub #8):

- [ ] **T21** R6 Status visibility & recovery messaging — #59 `feat/r6-t21-status-visibility`
- [ ] **T22** R6 Error prevention & destructive action safeguards — #60 `feat/r6-t22-error-prevention`
- [ ] **T23** R6 Keyboard shortcuts & power-user efficiency — #61 `feat/r6-t23-keyboard-shortcuts`
- [ ] **T24** R6 UI consistency, empty states & accessibility pass — #62 `feat/r6-t24-ui-consistency-a11y`

R7 split — one ticket per person, details in `BACKLOG.md` (parent GitHub #9):

- [ ] **T25** R7 Automated multi-client concurrency benchmark suite — #63 `feat/r7-t25-concurrency-benchmark`
- [ ] **T26** R7 Presence broadcast & ephemeral signal throttling — #64 `feat/r7-t26-presence-throttling`
- [ ] **T27** R7 Concurrent write burst & OCC conflict resilience — #65 `feat/r7-t27-occ-conflict-resilience`
- [ ] **T28** R7 Network resilience, auto-reconnection & latency telemetry — #66 `feat/r7-t28-reconnect-telemetry`

## Decisions Log

- Visual waveform selection replaces timeline sliders and target timestamp cards: clicking "+ Add Annotation" toggles interactive drag-selection (`regions.enableDragSelection`) for sections and click-to-point on the WaveSurfer canvas. The annotation form renders only when creating or editing, displaying a concise visual timestamp/section readout, and cleanly cancels draft regions on demand.
- Active annotation display (above waveform) tracks playback via `findActiveAnnotation`: each note appears for strictly 1.0s (`LABEL_DISPLAY_DURATION = 1.0`) after its start timestamp during playback. This prevents overlap and masking when two notes are within 2–3s of each other. Overlapping notes within the same 1.0s window resolve to the most recent note by timestamp/update time. In-canvas region text labels are omitted to prevent visual clutter across peaks.
- Demo personas (Alice and Bob) provide 1-click authentication and credential auto-fill on `/login`. Uses real Supabase Auth accounts created on-demand, bypassing confirmation delays and mitigating SMTP rate limits (RK11) during live evaluation and collaborative demos.
- Search query helper (`apps/web/src/lib/search-query.ts`) escapes `\` before `%` and `_` to prevent double-escaping backslashes in ILIKE patterns. Empty/whitespace queries return `{ empty: true }` so upstream components preserve the full library rather than treating empty input as zero results.
- File-page notes subscribe via Supabase `postgres_changes` on `public.annotations` filtered by `audio_file_id`. Client merge is in `apps/web/src/lib/annotation-realtime.ts`. Username is filled by a follow-up select (Realtime payloads have no join). Ephemeral cursor/playback broadcast stays out (R7). Replica identity FULL + publication membership live in `supabase/migrations/20260917100000_enable_annotations_realtime.sql`.
- Marker times come from WaveSurfer audio clock (`interaction` / click ratio × duration), rounded to 2 decimals via `roundAnnotationTime`. Regions plugin draws start/end; point notes use start===end. Avoid a second HTML5 `<audio>` clock (RK2).
- Annotation writes go through `apps/web/src/lib/annotations.ts` (`createAnnotation` / `updateAnnotation` / `deleteAnnotation`), not ad-hoc `from("annotations")` in components. Updates filter `.eq("version", clientVersion)` plus `author_id`; 0 rows then a follow-up select: different version → conflict, missing row → not found. Times round to 2 decimal seconds (RK2). At least one of label/comment after trim.
- Duration and sample rate come from worker ffprobe (`apps/worker/src/probe.ts`), never the browser. Home `FileList` polls every 2s until those columns fill (Realtime stays R3).
- Audio upload goes through the browser client (progress + disabled submit) then `recordUploadedAudio` inserts the row. R1 contract: Storage first, then `audio_files`. Insert failure deletes the Storage object. T3 lives at `/upload`; T4 composes `UploadForm` onto home `page.tsx`.
- Audio upload validation (T2) lives in `apps/web/src/lib/audio-validate.ts`. T3 calls `validateAudioFile` before Storage / `audio_files` writes. Empty `File.type` is allowed only when extension and magic bytes already agree (some browsers omit MIME); a present MIME must be on the format allowlist.
- Storage bucket `audio` is **not** world-public (`public = false`). Authenticated users can `select` every object (same open-collab read as `audio_files`); insert/update/delete only under `{auth.uid()}/…`. 50 MiB size cap is on the bucket; MIME/magic-byte checks stay in T2. R2 playback should use a signed URL or authenticated download, not `/object/public`.
- Branch names use `feat/` `chore/` `docs/` `fix/` — never `cursor/` (Cursor cloud auto-prefix). Renamed `cursor/risk-register` → `chore/risk-register`.
- Living user stories are `USER_STORIES.md` (US1–US14). Cleaned from the team draft: deduped, mapped to R1–R9, Backend/UX tags dropped. Preview-before-extract (US11) kept even though it is not explicit in the RTM. Stories are Done-when checks; do not use them as implementation slices.
- Living risk register is `RISK_REGISTER.md` in the repo, not `project_plan.pdf`. PDF Appendix B stays as the submitted snapshot (its R1–R9 clash with requirement IDs, so living IDs are RK*). Update the markdown file in the same PR as the feature that creates/changes/closes a risk; 5-min scan of Open + High rows in the weekly sprint review.
- Auth uses `@supabase/ssr` (browser + server clients + `proxy.ts` session refresh), not plain `@supabase/supabase-js`, so the session cookie is readable from both Client and Server Components/Actions in the App Router. `apps/web/src/lib/supabase.ts` (plain client) is gone — use `lib/supabase/client.ts` (Client Components) or `lib/supabase/server.ts` (Server Components/Actions).
- Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (exported function `proxy`, Node-only runtime, no more Edge option for this layer) — we're on `proxy.ts` from the start rather than the deprecated name.
- Supabase project (`qsfteifrmlvftedleapa`) has "Confirm email" ON — verified empirically. `signup()` handles this: no session in the `signUp()` response means show a "check your email" state instead of redirecting. If the team wants instant sign-in for demos, toggle it off in the dashboard (Authentication -> Providers -> Email); no code change needed either way.
- Duplicate-username detection on signup is a heuristic, not a specific error code: GoTrue doesn't forward the underlying Postgres unique-violation from the `handle_new_user()` trigger — verified empirically it surfaces as a generic `AuthRetryableFetchError`, HTTP 500, opaque message. `signup()` treats any `status === 500` from `signUp()` as "likely duplicate username". Acceptable for now but imprecise (a genuine 500 would get mislabeled); revisit with a pre-flight `is_username_taken(username)` RPC (`security definer`, callable by `anon`) if this causes confusion in practice.
- Default Supabase project email sending has a low rate limit (hit it after ~4-5 signups in quick succession during testing) — expected on the default shared SMTP tier, not a bug. Fine for dev; revisit (custom SMTP) before any real demo/user testing that involves multiple signups in a short window.
- Schema managed via Supabase CLI migrations checked into `supabase/migrations/` (not dashboard-only manual SQL) — reproducible, versioned, team can re-run. Requires a personal access token (`supabase.com/dashboard/account/tokens`) to `link`/`db push`/`gen types`; not stored anywhere in the repo.
- RLS policies shipped in the same migration as table creation (not a separate PR) — no window where tables exist without policies.
- RLS model is **open collaboration**: any authenticated user can `select` all rows across `profiles`/`audio_files`/`annotations`/`extraction_jobs`, but can only `insert`/`update`/`delete` rows they own/authored. Matches R9 (file search implies files are discoverable by all users) and the collaborative-annotation premise. If the team later wants per-file access lists (e.g. invite-only annotators), this needs revisiting — it's an assumption, not a stated requirement.
- `annotations.version` (optimistic concurrency, per "Key technical decisions" in `AGENTS.md`) is auto-incremented by a `before update` trigger (`bump_annotation_version`), not app-side. Clients must submit `.eq('version', clientVersion)` on every update; 0 rows affected = stale write, surface as a conflict in the UI.
- `extraction_jobs` has no client-side `update` RLS policy — only the worker (service-role key, bypasses RLS) transitions job status. Prevents users from spoofing job completion/failure from the browser.
- `packages/shared-types/src/database.types.ts` is generated (`supabase gen types typescript`), never hand-edited. Regenerate via `pnpm --filter @audio-tool/shared-types gen-types` after every schema migration.
- `apps/worker` was hand-rolled (no generator/CLI exists for a bare Node+TS+ffmpeg service) rather than scaffolded — `tsx` for dev (watch mode), plain `tsc` for build, `fluent-ffmpeg` for the ffprobe/ffmpeg wrapper (never hand-roll audio parsing, per `.cursor/rules/worker.mdc`).
- `apps/web/.env.local` and `apps/worker/.env` contain placeholder (unreachable) Supabase values purely so `next dev`/`next build` and the worker's poll loop boot locally without crashing on missing env vars. Both files are gitignored — replace with real project creds once the Supabase project exists.
