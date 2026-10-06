"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ExtractionJob, ExtractionJobStatus } from "@audio-tool/shared-types";
import { createClient } from "@/lib/supabase/client";
import {
  createExtractionDownloadUrls,
  getExtractionJobs,
  requestExtractionJob,
  roundExtractionTime,
  validateExtractionTimes,
} from "@/lib/extraction";
import { formatDurationSeconds } from "@/lib/format-duration";

const POLL_INTERVAL_MS = 2500;

export type ExtractionRange = {
  start: number;
  end: number | null;
  isRange: boolean;
};

export type ExtractionPanelProps = {
  audioFileId: string;
  filename?: string;
  format?: string;
  durationSeconds?: number | null;
  currentTime?: number | null;
  selectedRange?: ExtractionRange | null;
  isSelecting?: boolean;
  onStartSelection?: () => void;
  onCancelSelection?: () => void;
  onPreviewRange?: (start: number, end: number) => void;
  initialJobs?: ExtractionJob[];
};

export function formatExtractionStamp(
  startSeconds: number,
  endSeconds: number,
): string {
  const s = Math.max(0, startSeconds).toFixed(2);
  const e = Math.max(0, endSeconds).toFixed(2);
  const dur = Math.max(0, endSeconds - startSeconds).toFixed(2);
  return `${s}s – ${e}s (${dur}s)`;
}

export function formatJobStatus(status: string): {
  label: string;
  tone: "amber" | "blue" | "emerald" | "rose";
} {
  switch (status as ExtractionJobStatus) {
    case "pending":
      return { label: "Queued", tone: "amber" };
    case "processing":
      return { label: "Extracting", tone: "blue" };
    case "completed":
      return { label: "Ready", tone: "emerald" };
    case "failed":
      return { label: "Failed", tone: "rose" };
    default:
      return { label: status, tone: "amber" };
  }
}

export function getExtractionDownloadFilenames(
  filename: string | undefined,
  startSeconds: number,
  endSeconds: number,
  format?: string,
): { audioFilename: string; metadataFilename: string } {
  const rawBase = filename ? filename.replace(/\.[^/.]+$/, "") : "audio";
  const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, "_");
  const s = startSeconds.toFixed(2);
  const e = endSeconds.toFixed(2);
  const ext = (format || "audio").toLowerCase().replace(/^\./, "");
  return {
    audioFilename: `${safeBase}-cut-${s}s-${e}s.${ext}`,
    metadataFilename: `${safeBase}-cut-${s}s-${e}s.annotations.json`,
  };
}

export function ExtractionPanel({
  audioFileId,
  filename,
  format,
  durationSeconds,
  currentTime,
  selectedRange,
  isSelecting,
  onStartSelection,
  onCancelSelection,
  onPreviewRange,
  initialJobs = [],
}: ExtractionPanelProps) {
  const [jobs, setJobs] = useState<ExtractionJob[]>(initialJobs);
  const [loadingJobs, setLoadingJobs] = useState(initialJobs.length === 0);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [startInput, setStartInput] = useState<string>("0.00");
  const [endInput, setEndInput] = useState<string>(() => {
    if (durationSeconds != null && durationSeconds > 0) {
      return Math.min(10, durationSeconds).toFixed(2);
    }
    return "10.00";
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [downloadUrls, setDownloadUrls] = useState<
    Record<string, { audioUrl: string; metadataUrl: string | null }>
  >({});
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  const numStart = Number(startInput);
  const numEnd = Number(endInput);

  const validation = useMemo(() => {
    return validateExtractionTimes(numStart, numEnd, durationSeconds);
  }, [numStart, numEnd, durationSeconds]);


  // Initial fetch if initialJobs was empty
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void getExtractionJobs(supabase, audioFileId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setJobsError(result.error);
        setLoadingJobs(false);
        return;
      }
      setJobsError(null);
      setJobs(result.jobs);
      setLoadingJobs(false);
    });

    return () => {
      cancelled = true;
    };
  }, [audioFileId]);

  // Polling while any job is pending or processing
  const hasActiveJob = useMemo(() => {
    return jobs.some(
      (job) => job.status === "pending" || job.status === "processing",
    );
  }, [jobs]);

  useEffect(() => {
    if (!hasActiveJob) return;

    let cancelled = false;
    const supabase = createClient();
    const intervalId = window.setInterval(() => {
      void getExtractionJobs(supabase, audioFileId).then((result) => {
        if (cancelled || !result.ok) return;
        setJobs(result.jobs);
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasActiveJob, audioFileId]);

  function handleUseTimelineSelection() {
    if (
      selectedRange?.isRange &&
      selectedRange.end != null &&
      selectedRange.end > selectedRange.start
    ) {
      setStartInput(roundExtractionTime(selectedRange.start).toFixed(2));
      setEndInput(roundExtractionTime(selectedRange.end).toFixed(2));
      setSubmitError(null);
    }
  }

  function handleStampStart() {
    if (currentTime != null) {
      setStartInput(roundExtractionTime(currentTime).toFixed(2));
      setSubmitError(null);
    }
  }

  function handleStampEnd() {
    if (currentTime != null) {
      setEndInput(roundExtractionTime(currentTime).toFixed(2));
      setSubmitError(null);
    }
  }

  function handlePreview() {
    const v = validateExtractionTimes(numStart, numEnd, durationSeconds);
    if (!v.ok) return;
    onPreviewRange?.(numStart, numEnd);
  }

  async function handleDownload(job: ExtractionJob, type: "audio" | "metadata") {
    if (!job.output_path || job.status !== "completed") return;

    let urls = downloadUrls[job.id];
    if (!urls) {
      setDownloadingJobId(job.id);
      const supabase = createClient();
      const result = await createExtractionDownloadUrls(supabase, job.output_path);
      setDownloadingJobId(null);
      if (!result.ok) {
        setJobsError(result.error);
        return;
      }
      urls = result.urls;
      setDownloadUrls((prev) => ({ ...prev, [job.id]: result.urls }));
    }

    const targetUrl = type === "audio" ? urls.audioUrl : urls.metadataUrl;
    if (!targetUrl) return;

    const filenames = getExtractionDownloadFilenames(
      filename,
      Number(job.start_seconds),
      Number(job.end_seconds),
      format,
    );
    const downloadName =
      type === "audio" ? filenames.audioFilename : filenames.metadataFilename;

    const link = document.createElement("a");
    link.href = targetUrl;
    link.download = downloadName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const v = validateExtractionTimes(numStart, numEnd, durationSeconds);
    if (!v.ok) {
      setSubmitError(v.error);
      return;
    }

    const startSeconds = roundExtractionTime(numStart);
    const endSeconds = roundExtractionTime(numEnd);

    setIsSubmitting(true);
    const supabase = createClient();
    const result = await requestExtractionJob(supabase, {
      audioFileId,
      startSeconds,
      endSeconds,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setSubmitSuccess(
      `Extraction queued (${v.duration.toFixed(2)}s). Lossless cut in progress…`,
    );
    setJobs((prev) => [result.job, ...prev]);

    if (isSelecting) {
      onCancelSelection?.();
    }
  }

  return (
    <section
      className="flex w-full flex-col gap-6"
      aria-labelledby="extraction-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="extraction-heading"
            className="text-xl font-semibold text-black dark:text-zinc-50"
          >
            Lossless Extraction
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Extract segment slices at original quality with timestamped annotations (R4/R8).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onStartSelection && (
            <button
              type="button"
              onClick={isSelecting ? onCancelSelection : onStartSelection}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelecting
                  ? "border border-blue-400 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-200"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{isSelecting ? "✕ Stop Waveform Select" : "✂ Select on Waveform"}</span>
            </button>
          )}

          {selectedRange?.isRange && selectedRange.end != null ? (
            <button
              type="button"
              onClick={handleUseTimelineSelection}
              className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50/80 px-3 py-1.5 text-xs font-medium text-blue-900 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900"
              title="Apply active waveform selection to extraction fields"
            >
              <span>Apply Selection ({selectedRange.start.toFixed(2)}s – {selectedRange.end.toFixed(2)}s)</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex w-full flex-col gap-6">
        {/* Extraction Form */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Start Timestamp */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="extraction-start-seconds"
                    className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Start Time (seconds)
                  </label>
                  {currentTime != null ? (
                    <button
                      type="button"
                      onClick={handleStampStart}
                      className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      ⏱ Stamp Playhead ({formatDurationSeconds(currentTime)})
                    </button>
                  ) : null}
                </div>
                <input
                  id="extraction-start-seconds"
                  type="number"
                  step="0.01"
                  min="0"
                  max={durationSeconds ?? undefined}
                  value={startInput}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setStartInput(e.target.value);
                    setSubmitError(null);
                  }}
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm font-mono text-black dark:border-zinc-700 dark:text-zinc-50 focus:border-zinc-500 focus:outline-none"
                  aria-invalid={!validation.ok && numStart < 0}
                />
              </div>

              {/* End Timestamp */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="extraction-end-seconds"
                    className="text-xs font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    End Time (seconds)
                  </label>
                  {currentTime != null ? (
                    <button
                      type="button"
                      onClick={handleStampEnd}
                      className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      ⏱ Stamp Playhead ({formatDurationSeconds(currentTime)})
                    </button>
                  ) : null}
                </div>
                <input
                  id="extraction-end-seconds"
                  type="number"
                  step="0.01"
                  min="0"
                  max={durationSeconds ?? undefined}
                  value={endInput}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setEndInput(e.target.value);
                    setSubmitError(null);
                  }}
                  className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm font-mono text-black dark:border-zinc-700 dark:text-zinc-50 focus:border-zinc-500 focus:outline-none"
                  aria-invalid={!validation.ok && numEnd <= numStart}
                />
              </div>
            </div>

            {/* Readout Bar & Feedback */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-4 py-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-zinc-500 dark:text-zinc-400">Target Range:</span>
                {validation.ok ? (
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatDurationSeconds(numStart)} – {formatDurationSeconds(numEnd)}{" "}
                    <span className="text-zinc-500 dark:text-zinc-400">
                      ({validation.duration.toFixed(2)}s duration)
                    </span>
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {validation.error}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-mono">
                <span>Format: {format ? format.toUpperCase() : "ORIGINAL"}</span>
                <span>• Lossless stream copy</span>
              </div>
            </div>

            {submitError ? (
              <p
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
              >
                {submitError}
              </p>
            ) : null}

            {submitSuccess ? (
              <p
                role="status"
                className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              >
                {submitSuccess}
              </p>
            ) : null}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={!validation.ok || isSubmitting}
                className="flex items-center gap-2 rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin text-current"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Queuing extraction…</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"
                      />
                    </svg>
                    <span>Extract Segment</span>
                  </>
                )}
              </button>

              {onPreviewRange ? (
                <button
                  type="button"
                  disabled={!validation.ok || isSubmitting}
                  onClick={handlePreview}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                  title="Audition selected segment before extracting"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>Preview Cut</span>
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {/* Extraction History & Downloads */}
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Extraction History
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {jobs.length} {jobs.length === 1 ? "cut" : "cuts"}
              {hasActiveJob ? " • Refreshing…" : ""}
            </span>
          </div>

          {jobsError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {jobsError}
            </p>
          ) : null}

          {loadingJobs && jobs.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Loading extraction jobs…
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 py-10 text-center dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No extractions yet.
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Choose a start and end time above to extract your first lossless cut.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {jobs.map((job) => {
                const statusMeta = formatJobStatus(job.status);
                const s = Number(job.start_seconds);
                const e = Number(job.end_seconds);
                const isDownloading = downloadingJobId === job.id;

                return (
                  <li
                    key={job.id}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatExtractionStamp(s, e)}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium border ${
                            statusMeta.tone === "emerald"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : statusMeta.tone === "blue"
                                ? "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                : statusMeta.tone === "rose"
                                  ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                  : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {job.status === "pending" || job.status === "processing" ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          ) : job.status === "completed" ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          )}
                          <span>{statusMeta.label}</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>
                          Created {new Date(job.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {job.error_message ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            • Error: {job.error_message}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Download Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      {job.status === "completed" ? (
                        <>
                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => void handleDownload(job, "audio")}
                            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                            <span>Download Audio ({format ? format.toUpperCase() : "CUT"})</span>
                          </button>

                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => void handleDownload(job, "metadata")}
                            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            <span>Annotations (.json)</span>
                          </button>
                        </>
                      ) : job.status === "failed" ? (
                        <span className="text-xs text-zinc-400 italic">
                          Unavailable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                          <svg
                            className="h-3 w-3 animate-spin text-current"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          <span>Processing…</span>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
