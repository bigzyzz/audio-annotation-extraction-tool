import "dotenv/config";
import { probePendingAudioFiles } from "./probe.js";
import { generatePendingWaveformPeaks } from "./peaks.js";
import { processPendingExtractionJobs } from "./job-runner.js";

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS ?? 2000);

async function pollOnce(): Promise<void> {
  await probePendingAudioFiles();
  await generatePendingWaveformPeaks();
  await processPendingExtractionJobs();
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
