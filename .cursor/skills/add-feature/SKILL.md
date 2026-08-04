---
name: add-feature
description: Workflow for adding a new feature end-to-end in the Audio Annotation and Extraction Tool monorepo (schema -> shared types -> API/worker -> UI -> verify -> progress log). Use when the user asks to build, add, or implement a new feature, requirement (R1-R9), or capability in this project.
---

# Add Feature (this repo)

Read `AGENTS.md` first if not already in context (architecture, stack, requirement IDs).

## Workflow

```
Task Progress:
- [ ] 1. Confirm scope: which requirement ID(s) (R1-R9) does this map to? What's explicitly NOT included?
- [ ] 2. Data model: does this need a new Supabase table/column? Define it, update packages/shared-types.
- [ ] 3. Backend: apps/worker job type (if audio processing) or Supabase RLS policy / API route (apps/web) as needed.
- [ ] 4. Frontend: apps/web UI, wired to Supabase client directly or via API route.
- [ ] 5. Verify: run/lint/typecheck. For real-time features, sanity-check the <2s sync latency requirement (R7).
- [ ] 6. Update PROGRESS.md: move item from "Up Next" to "Done", note any decisions made.
```

## Rules of thumb

- One feature per PR/commit. Don't bundle unrelated changes.
- Shared types (DB row shapes, job payloads) go in `packages/shared-types` — never duplicate a type definition in both `apps/web` and `apps/worker`.
- Annotation writes always carry a `version` field (optimistic concurrency) — see AGENTS.md "Key technical decisions".
- Audio extraction/processing always goes through `apps/worker`'s ffmpeg pipeline, never client-side or in a Vercel serverless function.
- If the feature isn't in the `PROGRESS.md` "Up Next" list, add it there first, then implement.
