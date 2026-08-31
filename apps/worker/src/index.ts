import "dotenv/config";
import type { ExtractionJob } from "@audio-tool/shared-types";
import { supabase } from "./lib/supabase.js";
import { probePendingAudioFiles } from "./probe.js";
import { generatePendingWaveformPeaks } from "./peaks.js";

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 2000);

async function fetchPendingJobs(): Promise<ExtractionJob[]> {
  const { data, error } = await supabase
    .from("extraction_jobs")
    .select("*")
    .eq("status", "pending")
    .limit(10);

  if (error) throw error;

  return data ?? [];
}

async function processJob(job: ExtractionJob): Promise<void> {
  // Real pipeline (download from Storage, ffmpeg cut, upload result, update
  // status) lands with the extraction feature — this is scaffolding only.
  console.log(`[worker] would process job ${job.id}`);
}

async function pollOnce(): Promise<void> {
  await probePendingAudioFiles();
  await generatePendingWaveformPeaks();

  const jobs = await fetchPendingJobs();
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
