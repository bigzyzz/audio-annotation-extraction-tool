"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ExtractionJob, ExtractionJobStatus } from "@audio-tool/shared-types";
import { createClient } from "@/lib/supabase/client";
import {
  deleteExtractionJobAction,
  clearExtractionJobsAction,
} from "@/app/files/[id]/actions";
import {
  createExtractionDownloadUrls,
  getExtractionJobs,
  requestExtractionJob,
  roundExtractionTime,
  validateExtractionTimes,
} from "@/lib/extraction";
import { formatDurationSeconds } from "@/lib/format-duration";
import { ActionableErrorAlert } from "@/components/actionable-error-alert";
import { useToast } from "@/components/toast";

function formatJobTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "recently";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "recently";
  }
}

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
  selectedRange?: ExtractionRange | null;
  isSelecting?: boolean;
  onStartSelection?: () => void;
  onCancelSelection?: () => void;
  onRangeChange?: (range: ExtractionRange) => void;
  onPreviewRange?: (start: number, end: number) => void;
  initialJobs?: ExtractionJob[];
  currentUserId?: string | null;
  onJobsChange?: (jobs: ExtractionJob[]) => void;
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
  selectedRange,
  isSelecting = false,
  onStartSelection,
  onCancelSelection,
  onRangeChange,
  onPreviewRange,
  initialJobs = [],
  currentUserId,
  onJobsChange,
}: ExtractionPanelProps) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<ExtractionJob[]>(initialJobs);
  const [loadingJobs, setLoadingJobs] = useState(initialJobs.length === 0);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const prevJobsRef = useRef<ExtractionJob[]>(initialJobs);

  useEffect(() => {
    onJobsChange?.(jobs);
  }, [jobs, onJobsChange]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const [downloadUrls, setDownloadUrls] = useState<
    Record<string, { audioUrl: string; metadataUrl: string | null }>
  >({});
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // Deletion state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [pendingClearAll, setPendingClearAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Derive range from dragged waveform selection
  const activeRange = useMemo(() => {
    if (
      selectedRange?.isRange &&
      selectedRange.end != null &&
      selectedRange.end > selectedRange.start
    ) {
      return {
        start: roundExtractionTime(selectedRange.start),
        end: roundExtractionTime(selectedRange.end),
        isRange: true,
      };
    }
    return null;
  }, [selectedRange]);

  const validation = useMemo(() => {
    if (!activeRange) {
      return { ok: false as const, error: "Drag a section on the waveform above to extract." };
    }
    return validateExtractionTimes(activeRange.start, activeRange.end, durationSeconds);
  }, [activeRange, durationSeconds]);

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

  function handleStartSelectionClick() {
    setSubmitError(null);
    setSubmitSuccess(null);
    onStartSelection?.();
  }

  function handleCancelClick() {
    setSubmitError(null);
    setSubmitSuccess(null);
    onCancelSelection?.();
  }

  function handleNudgeStart(delta: number) {
    if (!activeRange) return;
    const nextStart = Math.max(0, roundExtractionTime(activeRange.start + delta));
    if (nextStart < activeRange.end - 0.05) {
      onRangeChange?.({
        start: nextStart,
        end: activeRange.end,
        isRange: true,
      });
      setSubmitError(null);
    }
  }

  function handleNudgeEnd(delta: number) {
    if (!activeRange) return;
    const maxBound = durationSeconds ?? Infinity;
    const nextEnd = Math.min(
      maxBound,
      Math.max(activeRange.start + 0.05, roundExtractionTime(activeRange.end + delta)),
    );
    onRangeChange?.({
      start: activeRange.start,
      end: nextEnd,
      isRange: true,
    });
    setSubmitError(null);
  }

  function handlePreview() {
    if (!activeRange || !validation.ok) return;
    onPreviewRange?.(activeRange.start, activeRange.end);
  }

  async function handleDownload(job: ExtractionJob, type: "audio" | "metadata") {
    if (!job.output_path || job.status !== "completed") return;

    const key = `${job.id}-${type}`;
    setDownloadingKey(key);
    setJobsError(null);

    try {
      let urls = downloadUrls[job.id];
      if (!urls) {
        const supabase = createClient();
        const result = await createExtractionDownloadUrls(supabase, job.output_path);
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

      try {
        const response = await fetch(targetUrl);
        if (!response.ok) {
          throw new Error(`Failed to download file (${response.status})`);
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch {
        // Fallback: direct download link without opening in a new tab
        const link = document.createElement("a");
        link.href = targetUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      setJobsError(
        err instanceof Error ? err.message : "Download failed. Please try again.",
      );
    } finally {
      setDownloadingKey(null);
    }
  }

  const handleDownloadRef = useRef(handleDownload);
  useEffect(() => {
    handleDownloadRef.current = handleDownload;
  });

  // Notify user when background extraction jobs complete or fail
  useEffect(() => {
    const prev = prevJobsRef.current;
    for (const newJob of jobs) {
      const oldJob = prev.find((j) => j.id === newJob.id);
      if (
        oldJob &&
        (oldJob.status === "pending" || oldJob.status === "processing")
      ) {
        if (newJob.status === "completed") {
          const s = Number(newJob.start_seconds);
          const e = Number(newJob.end_seconds);
          toast.success(
            "Extraction completed!",
            `Lossless segment (${formatDurationSeconds(s)} – ${formatDurationSeconds(e)}) is ready to download.`,
            {
              label: "Download Audio",
              onClick: () => {
                void handleDownloadRef.current(newJob, "audio");
              },
            },
          );
        } else if (newJob.status === "failed") {
          toast.error(
            "Extraction failed",
            newJob.error_message ||
              "The worker encountered an issue extracting this audio segment.",
          );
        }
      }
    }
    prevJobsRef.current = jobs;
  }, [jobs, toast]);

  async function handleDeleteJob(jobId: string) {
    setIsDeletingId(jobId);
    setJobsError(null);
    const result = await deleteExtractionJobAction(jobId);
    setIsDeletingId(null);

    if (!result.ok) {
      setJobsError(result.error);
      return;
    }

    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setPendingDeleteId(null);
    setDownloadUrls((prev) => {
      const copy = { ...prev };
      delete copy[jobId];
      return copy;
    });
  }

  async function handleClearAllJobs() {
    setIsClearingAll(true);
    setJobsError(null);
    const result = await clearExtractionJobsAction(audioFileId);
    setIsClearingAll(false);

    if (!result.ok) {
      setJobsError(result.error);
      return;
    }

    setJobs([]);
    setPendingClearAll(false);
    setDownloadUrls({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!activeRange || !validation.ok) {
      setSubmitError(validation.ok ? null : validation.error);
      return;
    }

    const startSeconds = activeRange.start;
    const endSeconds = activeRange.end;

    setIsSubmitting(true);
    const supabase = createClient();
    const result = await requestExtractionJob(supabase, {
      audioFileId,
      startSeconds,
      endSeconds,
      totalDurationSeconds: durationSeconds,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setSubmitSuccess(
      `Extraction queued (${validation.duration.toFixed(2)}s). Lossless stream-copy in progress…`,
    );
    toast.info(
      "Extraction queued",
      `Worker is processing cut (${validation.duration.toFixed(2)}s) in background…`,
    );
    setJobs((prev) => [result.job, ...prev]);

    // Cleanly cancel the draft waveform selection
    onCancelSelection?.();
  }

  const showActiveWorkspace = isSelecting || activeRange != null;

  return (
    <section
      className="flex w-full flex-col gap-6"
      aria-labelledby="extraction-heading"
    >
      {/* Header and Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="extraction-heading"
            className="text-xl font-semibold text-black dark:text-zinc-50"
          >
            Lossless Extraction
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Drag a section on the waveform to extract audio at original quality with annotations (R4/R8).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!showActiveWorkspace ? (
            <button
              type="button"
              onClick={handleStartSelectionClick}
              className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
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
              <span>+ Extract Section</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancelClick}
              className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <span>✕ Cancel Selection</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col gap-6">
        {/* Active Drag-Extraction Workspace Card */}
        {showActiveWorkspace ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white dark:bg-blue-500">
                    ✂
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Target Extraction Segment
                  </h3>
                </div>

                {/* Live Section Badge */}
                {activeRange ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Selected:</span>
                    <span className="rounded bg-blue-100 px-3 py-1 font-mono text-xs font-semibold text-blue-950 dark:bg-blue-900 dark:text-blue-100">
                      {formatDurationSeconds(activeRange.start)} – {formatDurationSeconds(activeRange.end)}{" "}
                      <span className="text-blue-700 dark:text-blue-300 font-normal">
                        ({(activeRange.end - activeRange.start).toFixed(2)}s duration)
                      </span>
                    </span>
                  </div>
                ) : (
                  <span className="rounded bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                    No section selected yet
                  </span>
                )}
              </div>

              {/* Drag Prompt or Interactive Fine-Tuning */}
              {!activeRange ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-blue-300 bg-white/70 py-6 text-center dark:border-blue-800 dark:bg-zinc-900/50">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Drag across the waveform above to select a section
                  </p>
                  <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                    Click and drag directly on the audio track to highlight the exact portion you want to extract.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-lg border border-blue-200/60 bg-white/80 p-4 dark:border-blue-900/40 dark:bg-zinc-900/60">
                  <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                    {/* Start bounds with micro-nudge */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Start:</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatDurationSeconds(activeRange.start)} ({activeRange.start.toFixed(2)}s)
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleNudgeStart(-0.1)}
                          className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          title="Nudge start back 0.1s"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNudgeStart(0.1)}
                          className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          title="Nudge start forward 0.1s"
                        >
                          +0.1s
                        </button>
                      </div>
                    </div>

                    {/* End bounds with micro-nudge */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">End:</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatDurationSeconds(activeRange.end)} ({activeRange.end.toFixed(2)}s)
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleNudgeEnd(-0.1)}
                          className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          title="Nudge end back 0.1s"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNudgeEnd(0.1)}
                          className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          title="Nudge end forward 0.1s"
                        >
                          +0.1s
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <span>Format: {format ? format.toUpperCase() : "ORIGINAL"} • Lossless stream copy (R8)</span>
                    <span>JSON annotations sidecar included (R4)</span>
                  </div>
                </div>
              )}

              {submitError ? (
                <ActionableErrorAlert
                  error={submitError}
                  context="extraction"
                  onDismiss={() => setSubmitError(null)}
                />
              ) : null}

              {submitSuccess ? (
                <p
                  role="status"
                  className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  {submitSuccess}
                </p>
              ) : null}

              {/* Action Buttons */}
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

                {onPreviewRange && activeRange ? (
                  <button
                    type="button"
                    disabled={!validation.ok || isSubmitting}
                    onClick={handlePreview}
                    className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
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

                <button
                  type="button"
                  onClick={handleCancelClick}
                  disabled={isSubmitting}
                  className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* Extraction History & Downloads */}
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Extraction History
              </h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {jobs.length} {jobs.length === 1 ? "cut" : "cuts"}
              </span>
              {hasActiveJob ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Worker polling active
                </span>
              ) : null}
            </div>

            {/* Clear All History Button */}
            {jobs.length > 1 ? (
              <div>
                {pendingClearAll ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-red-600 dark:text-red-400">
                      Delete all {jobs.length} cuts?
                    </span>
                    <button
                      type="button"
                      disabled={isClearingAll}
                      onClick={handleClearAllJobs}
                      className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isClearingAll ? "Clearing…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      disabled={isClearingAll}
                      onClick={() => setPendingClearAll(false)}
                      className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingClearAll(true)}
                    className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
                  >
                    Clear history
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {jobsError ? (
            <ActionableErrorAlert
              error={jobsError}
              context="extraction"
              onDismiss={() => setJobsError(null)}
            />
          ) : null}

          {loadingJobs && jobs.length === 0 ? (
            <div
              role="status"
              aria-busy="true"
              aria-live="polite"
              aria-label="Loading extraction jobs"
              className="flex flex-col gap-3 py-2"
            >
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30"
                >
                  <div className="flex flex-col gap-2">
                    <div className="h-4 w-32 rounded bg-zinc-200 animate-pulse dark:bg-zinc-800" />
                    <div className="h-3 w-24 rounded bg-zinc-200 animate-pulse dark:bg-zinc-800" />
                  </div>
                  <div className="h-7 w-28 rounded bg-zinc-200 animate-pulse dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 py-10 text-center dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No extractions yet.
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Click &ldquo;+ Extract Section&rdquo; above and drag across the waveform to create a lossless cut.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              {jobs.map((job) => {
                const statusMeta = formatJobStatus(job.status);
                const s = Number(job.start_seconds);
                const e = Number(job.end_seconds);
                const isDownloadingAudio = downloadingKey === `${job.id}-audio`;
                const isDownloadingMetadata = downloadingKey === `${job.id}-metadata`;
                const isAnyDownloading = downloadingKey != null;
                const isDeleting = isDeletingId === job.id;
                const isPendingDelete = pendingDeleteId === job.id;

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
                        <span suppressHydrationWarning>
                          Created {formatJobTime(job.created_at)}
                        </span>
                        {job.error_message ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            • Error: {job.error_message}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Download Controls & Delete Button */}
                    <div className="flex flex-wrap items-center gap-2">
                      {job.status === "completed" ? (
                        <>
                          <button
                            type="button"
                            disabled={isAnyDownloading}
                            onClick={() => void handleDownload(job, "audio")}
                            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                          >
                            {isDownloadingAudio ? (
                              <svg
                                className="h-3.5 w-3.5 animate-spin text-current"
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
                            ) : (
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
                            )}
                            <span>
                              {isDownloadingAudio
                                ? "Downloading…"
                                : `Download Audio (${format ? format.toUpperCase() : "CUT"})`}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={isAnyDownloading}
                            onClick={() => void handleDownload(job, "metadata")}
                            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            {isDownloadingMetadata ? (
                              <svg
                                className="h-3.5 w-3.5 animate-spin text-current"
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
                            ) : (
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
                            )}
                            <span>
                              {isDownloadingMetadata
                                ? "Downloading…"
                                : "Annotations (.json)"}
                            </span>
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

                      {/* Delete Action (Two-Step Confirmation) */}
                      {(!currentUserId || job.requested_by === currentUserId) ? (
                        isPendingDelete ? (
                          <div className="inline-flex items-center gap-1 pl-1">
                            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                              Delete?
                            </span>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => void handleDeleteJob(job.id)}
                              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {isDeleting ? "…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setPendingDeleteId(null)}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(job.id)}
                            className="inline-flex items-center justify-center rounded p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
                            title="Delete extraction history"
                            aria-label={`Delete cut ${formatExtractionStamp(s, e)}`}
                          >
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
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )
                      ) : null}
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
