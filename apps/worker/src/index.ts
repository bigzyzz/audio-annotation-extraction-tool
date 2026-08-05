import "dotenv/config";
import { supabase } from "./lib/supabase.js";

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 2000);

// Placeholder job shape until packages/shared-types defines the real
// extraction_jobs row type (next iteration, alongside the Supabase schema).
interface PendingJob {
  id: string;
  status: string;
}

async function fetchPendingJobs(): Promise<PendingJob[]> {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("id, status")
    .eq("status", "pending")
    .limit(10);

  if (error) {
    // extraction_jobs doesn't exist yet (schema not defined) — expected
    // until the Supabase schema iteration lands. Treat as "no jobs".
    // PGRST205 = PostgREST "table not found in schema cache" (what Supabase's
    // REST layer actually returns); 42P01 = raw Postgres "relation does not
    // exist" (kept as a fallback in case this ever hits Postgres directly).
    if (error.code === "PGRST205" || error.code === "42P01") return [];
    throw error;
  }

  return data ?? [];
}

async function processJob(job: PendingJob): Promise<void> {
  // Real pipeline (download from Storage, ffmpeg cut, upload result, update
  // status) lands with the extraction feature — this is scaffolding only.
  console.log(`[worker] would process job ${job.id}`);
}

async function pollOnce(): Promise<void> {
  const jobs = await fetchPendingJobs();
  if (jobs.length === 0) {
    console.log("[worker] no pending jobs");
    return;
  }
  for (const job of jobs) {
    await processJob(job);
  }
}

async function main(): Promise<void> {
  console.log(`[worker] starting, polling every ${POLL_INTERVAL_MS}ms`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[worker] poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[worker] fatal error:", err);
  process.exit(1);
});
