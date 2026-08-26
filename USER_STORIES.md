# User Stories

Living acceptance list. Cleaned from the team draft (dupes dropped, mapped to R1–R9). Requirements in `AGENTS.md` / `project_plan.pdf` Appendix A still win for scope. These are **Done when** checks, not implementation slices.

Format: *As a hobbyist, I want X, so that Y.* One story per need.

Last reviewed: 2026-08-19

## R5 — Accounts (shipped)

**US1 — Sign up**
As a hobbyist, I want to create an account with a username, email, and password, so that I can use the tool.
**Done when:** `/signup` accepts those three fields; a `profiles` row exists with that username; duplicate username is rejected with a clear error.

**US2 — Log in / log out**
As a hobbyist, I want to sign in and sign out, so that only I use my account on this browser.
**Done when:** `/login` with correct email/password reaches the signed-in home; Log out returns to a signed-out state. Wrong password shows a clear error, not a stack trace.

**US3 — Password handling**
As a hobbyist, I want my password stored securely, so that my account is not compromised.
**Done when:** passwords go through Supabase Auth only — no app-side hashing or password columns. (Met by R5.)

## R1 — Upload (next)

**US4 — Upload a track**
As a hobbyist, I want to upload my own MP3 or WAV, so that I can get timestamped feedback on it.
**Done when:** a signed-in user can upload `.mp3` or `.wav`; the file appears in the file list; a row exists in `audio_files`.

**US5 — Reject junk files**
As a hobbyist, I want the tool to refuse files that are not real MP3/WAV, so that I do not break the library or waste processing.
**Done when:** a `.txt` renamed to `.mp3` (or other spoofed extension) is rejected with a clear error; no Storage object and no `audio_files` row. (RK14) — met by T2+T3 on `/upload`.

## R2 — Playback

**US6 — Transport**
As a hobbyist, I want play, pause, seek, and volume on the track, so that I control listening while I annotate.
**Done when:** those four controls work on an uploaded file in the browser.

## R3 — Annotation

**US7 — Timestamped feedback**
As a hobbyist, I want to leave a label/comment at a timestamp (or range), so that feedback has context on the timeline.
**Done when:** signed-in user can create an annotation with start time (and optional end) plus label or comment; it persists on reload.

**US8 — See others’ notes**
As a hobbyist, I want to see other people’s annotations on the same file, so that I can use their feedback.
**Done when:** user B sees user A’s annotations on the shared file without a full page refresh (Realtime).

## R9 — Search

**US9 — Find a file**
As a hobbyist, I want to search files by name, so that I can open a track to listen and annotate.
**Done when:** a query matches `audio_files.filename`; empty result is obvious; search requires login.

## R4 / R8 — Extract

**US10 — Pick a region**
As a hobbyist, I want to choose two endpoints on the timeline, so that I extract the segment I mean.
**Done when:** start/end are set on the waveform; end is not before start.

**US11 — Preview before download**
As a hobbyist, I want to hear that segment first, so that I do not download the wrong cut.
**Done when:** play-region uses the selected start/end before an extract job is queued. (From the team draft — not explicit in the RTM; keep it.)

**US12 — Download the cut**
As a hobbyist, I want to download that segment for sampling, at original quality, with its annotations.
**Done when:** a completed job yields a local file in the source format (or WAV if an MP3 cut is off a frame boundary); quality is not re-encoded lossily (req R8); annotation metadata is included (req R4).

## R7 — Concurrent use

**US13 — Stay in sync**
As a hobbyist, I want other people’s new/edited notes to show up quickly, so that five of us can annotate one file without fighting.
**Done when:** 5 browsers on one file see annotation changes in under 2 seconds; a stale edit surfaces a conflict instead of a silent overwrite.

## R6 — Usable UI

**US14 — Know what is happening**
As a hobbyist, I want clear status and errors on signup, upload, playback, and extract, so that I can recover without guessing.
**Done when:** pending actions disable the submit control; success/failure is visible; destructive actions can be cancelled (Nielsen: visibility, error prevention, user control).

## Gaps vs the draft

Dropped: duplicate sentences, “Backend/UX” tags (those are not assignments), “Audio Extraction” as the title for annotate stories.
Added: US3 (Supabase Auth, not homemade hashing), US5 (MP3/WAV validation), US11 (preview — from draft), US13 (R7), US14 (R6).
