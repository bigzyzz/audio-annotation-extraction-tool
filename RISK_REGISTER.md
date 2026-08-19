# Risk Register

Living register. `project_plan.pdf` is the submitted snapshot — this file is the source of truth after that.

## How to use

- Update **in the same PR** as the feature that creates, changes, or closes a risk. Also update after a weekly scan of Open + High rows (5 min).
- Likelihood / Impact: `L` / `M` / `H`.
- Status: `Open` (still can bite) · `Mitigated` (control in place, watch it) · `Accepted` (we live with it) · `Closed` (no longer applies).
- Tag requirement IDs (R1–R9) in the risk text when it maps.
- Owner = whoever is closest to the work. No dedicated risk officer.

Last reviewed: 2026-08-19

| ID | Risk | L | I | Status | Mitigation | Owner | Review |
|----|------|---|---|--------|------------|-------|--------|
| RK1 | Confirm-email ON + default Supabase SMTP rate limit → signup fails in a demo / multi-user test (R5) | H | H | Open | Code already shows “check your email” when no session. Before a demo: turn Confirm email off in Supabase Auth, or add custom SMTP. Don’t spam signups during testing. | Team | 2026-08-19 |
| RK2 | Duplicate username surfaces as HTTP 500 from GoTrue, not a unique-violation — UI heuristic may mislabel a real 500 as “username taken” (R5) | M | L | Accepted | `signup()` treats `status === 500` as likely duplicate username. Revisit with `is_username_taken` RPC if this confuses users. | Team | 2026-08-19 |
| RK3 | Open-collaboration RLS: any authenticated user can read all files/annotations (R9, collab premise) | L | M | Accepted | Matches current requirements. Revisit only if the team wants invite-only per-file access. | Team | 2026-08-19 |
| RK4 | Vercel serverless cannot run long FFmpeg jobs (R4, R8) | H | H | Mitigated | Separate `apps/worker` process (Railway/Render/Fly.io). Never put extraction in a Next.js API route. | Team | 2026-08-19 |
| RK5 | R7 miss: >2s sync or >5 concurrent annotators once Realtime UI exists | M | H | Open | Optimistic concurrency via `annotations.version`. Validate with 5 browsers when R3 lands. | Team | 2026-08-19 |
| RK6 | MP3 cut off a frame boundary re-encodes / loses quality (R8) | M | M | Open | Plan: WAV = sample-accurate; MP3 = ffmpeg stream copy, or export WAV if off-boundary. Implement with R4. | Team | 2026-08-19 |
| RK7 | Worker down or poll loop stuck → extraction jobs hang in `pending`/`processing` (R4) | M | H | Open | Status UI + failed/retry when R4 lands. Worker is the only writer of job status (no client `update` RLS). | Team | 2026-08-19 |
| RK8 | Secrets leak (anon/service-role keys, Supabase CLI PAT) | M | H | Mitigated | `.env.local` / `.env` gitignored. Service-role key only in worker. PAT never stored in repo. | Team | 2026-08-19 |
| RK9 | Four people, no fixed roles → two people build the same ticket | M | M | Open | One GitHub Issue / Project card In Progress per person. `PROGRESS.md` In Progress line names the branch. | Team | 2026-08-19 |
| RK10 | Browser decodes full audio just to draw a waveform → slow/crash on large files (R2) | M | M | Mitigated (design) | Worker pre-generates compact peak data; browser renders that. Enforce when R2 is built. | Team | 2026-08-19 |
| RK11 | Upload of non-MP3/WAV or spoofed extension (R1) | M | M | Open | Validate extension **and** MIME/header before accept. Not built yet. | Team | 2026-08-19 |
| RK12 | Supabase free-tier / Realtime / Storage limits during demo | L | M | Open | Watch dashboard quotas before assessed demo. Out of scope: production-grade DevOps. | Team | 2026-08-19 |
