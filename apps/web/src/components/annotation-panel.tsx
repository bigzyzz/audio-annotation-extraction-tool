"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Annotation, Database } from "@audio-tool/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  createAnnotation,
  deleteAnnotation,
  roundAnnotationTime,
  updateAnnotation,
} from "@/lib/annotations";
import { formatDurationSeconds } from "@/lib/format-duration";

export type AnnotationListItem = Annotation & {
  author_username: string | null;
};

export type AnnotationPanelRange = {
  start: number;
  end: number | null;
  isRange: boolean;
};

export type AnnotationPanelProps = {
  audioFileId: string;
  durationSeconds?: number | null;
  currentTime?: number | null;
  selectedRange?: AnnotationPanelRange;
  onRangeChange?: (range: AnnotationPanelRange) => void;
  /** Controlled list. When omitted, the panel loads notes itself. */
  annotations?: AnnotationListItem[];
  onNeedRefresh?: () => void;
  onJumpTo?: (seconds: number) => void;
};

const LOAD_ERROR = "Couldn't load notes for this track. Try again.";

type AnnotationJoinRow = Annotation & {
  author?: { username: string } | { username: string }[] | null;
};

function authorUsername(author: AnnotationJoinRow["author"]): string | null {
  if (!author) return null;
  if (Array.isArray(author)) return author[0]?.username ?? null;
  return author.username ?? null;
}

function asSeconds(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatAnnotationStamp(
  startSeconds: number,
  endSeconds: number | null,
): string {
  const start = asSeconds(startSeconds).toFixed(2);
  if (endSeconds == null) return `${start}s`;
  return `${start}s – ${asSeconds(endSeconds).toFixed(2)}s`;
}

export async function fetchAnnotationsForFile(
  supabase: SupabaseClient<Database>,
  audioFileId: string,
): Promise<{ ok: true; annotations: AnnotationListItem[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("annotations")
    .select(
      "id, audio_file_id, author_id, start_seconds, end_seconds, label, comment, version, created_at, updated_at, author:profiles!annotations_author_id_fkey(username)",
    )
    .eq("audio_file_id", audioFileId)
    .order("start_seconds", { ascending: true });

  if (error || !data) {
    return { ok: false, error: LOAD_ERROR };
  }

  const annotations = (data as AnnotationJoinRow[]).map((row) => ({
    id: row.id,
    audio_file_id: row.audio_file_id,
    author_id: row.author_id,
    start_seconds: asSeconds(row.start_seconds),
    end_seconds: row.end_seconds == null ? null : asSeconds(row.end_seconds),
    label: row.label,
    comment: row.comment,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author_username: authorUsername(row.author),
  }));

  return { ok: true, annotations };
}

export function AnnotationPanel({
  audioFileId,
  durationSeconds = null,
  currentTime = null,
  selectedRange,
  onRangeChange,
  annotations: controlledAnnotations,
  onNeedRefresh,
  onJumpTo,
}: AnnotationPanelProps) {
  const controlled = controlledAnnotations !== undefined;
  const [loaded, setLoaded] = useState<AnnotationListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [localRange, setLocalRange] = useState<AnnotationPanelRange>(() => ({
    start: currentTime != null ? roundAnnotationTime(currentTime) : 0,
    end: currentTime != null ? roundAnnotationTime(currentTime) + 5 : 5,
    isRange: false,
  }));

  const range = selectedRange ?? localRange;
  const updateRange = useCallback(
    (updater: AnnotationPanelRange | ((prev: AnnotationPanelRange) => AnnotationPanelRange)) => {
      if (onRangeChange) {
        if (typeof updater === "function") {
          onRangeChange(updater(range));
        } else {
          onRangeChange(updater);
        }
      } else {
        setLocalRange(updater);
      }
    },
    [onRangeChange, range],
  );

  const [label, setLabel] = useState("");
  const [comment, setComment] = useState("");

  const annotations = controlled ? controlledAnnotations : loaded;

  const maxDuration = useMemo(() => {
    if (durationSeconds != null && durationSeconds > 0) return durationSeconds;
    let maxNote = 60;
    for (const a of annotations) {
      if (a.end_seconds && a.end_seconds > maxNote) maxNote = a.end_seconds;
      if (a.start_seconds > maxNote) maxNote = a.start_seconds;
    }
    return Math.ceil(maxNote);
  }, [durationSeconds, annotations]);

  const effectiveStart = range.start;
  const effectiveEnd = range.isRange
    ? Math.max(effectiveStart, range.end ?? effectiveStart + 5)
    : effectiveStart;

  const refresh = useCallback(async () => {
    if (controlled) {
      onNeedRefresh?.();
      return;
    }

    const supabase = createClient();
    const result = await fetchAnnotationsForFile(supabase, audioFileId);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setLoaded(result.annotations);
  }, [audioFileId, controlled, onNeedRefresh]);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    const supabase = createClient();
    void fetchAnnotationsForFile(supabase, audioFileId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setLoaded(result.annotations);
    });
    return () => {
      cancelled = true;
    };
  }, [audioFileId, controlled]);

  const editing = useMemo(
    () => annotations.find((note) => note.id === editingId) ?? null,
    [annotations, editingId],
  );

  function resetForm() {
    setEditingId(null);
    setPendingDeleteId(null);
    const initialStart = currentTime != null ? roundAnnotationTime(currentTime) : 0;
    updateRange({
      start: initialStart,
      end: Math.min(maxDuration, initialStart + 5),
      isRange: false,
    });
    setLabel("");
    setComment("");
    setError(null);
  }

  function beginEdit(note: AnnotationListItem) {
    setEditingId(note.id);
    setPendingDeleteId(null);
    const s = asSeconds(note.start_seconds);
    const hasRange = note.end_seconds != null && note.end_seconds > note.start_seconds;
    const e = hasRange ? asSeconds(note.end_seconds) : Math.min(maxDuration, s + 5);

    updateRange({
      start: s,
      end: e,
      isRange: hasRange,
    });

    setLabel(note.label ?? "");
    setComment(note.comment ?? "");
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const startSeconds = roundAnnotationTime(effectiveStart);
    const endSeconds = range.isRange ? roundAnnotationTime(effectiveEnd) : null;

    if (endSeconds != null && endSeconds < startSeconds) {
      setError("End time cannot be earlier than start time.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const result = editing
      ? await updateAnnotation(supabase, {
          id: editing.id,
          version: editing.version,
          startSeconds,
          endSeconds,
          label,
          comment,
        })
      : await createAnnotation(supabase, {
          audioFileId,
          startSeconds,
          endSeconds,
          label,
          comment,
        });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    resetForm();
    await refresh();
  }

  async function confirmDelete(note: AnnotationListItem) {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const result = await deleteAnnotation(supabase, note.id);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (editingId === note.id) resetForm();
    setPendingDeleteId(null);
    await refresh();
  }

  return (
    <section className="flex w-full flex-col gap-6" aria-labelledby="annotation-heading">
      <div>
        <h2
          id="annotation-heading"
          className="text-xl font-semibold text-black dark:text-zinc-50"
        >
          Notes & Annotations ({annotations.length})
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Adjust the timeline section slider directly under the waveform, then add labels and comments.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left Column: Form with Target Timestamp Info & Fine-Tuning */}
        <div className="lg:col-span-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            {editing ? "Edit Note" : "Add Note"}
          </h3>

          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            {/* Timeline Section Info & Fine-Tuning */}
            <div className="flex flex-col gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Target Timestamp
                </span>
                <span className="rounded bg-zinc-200/80 px-2 py-0.5 font-mono text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  {range.isRange
                    ? `${formatDurationSeconds(effectiveStart)} – ${formatDurationSeconds(effectiveEnd)} (${(effectiveEnd - effectiveStart).toFixed(2)}s)`
                    : `${formatDurationSeconds(effectiveStart)} (${effectiveStart.toFixed(2)}s)`}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Adjust section sliders directly beneath the waveform, or fine-tune exact seconds below:
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <span>Start (s):</span>
                  <input
                    type="number"
                    min={0}
                    max={maxDuration}
                    step={0.01}
                    value={effectiveStart.toFixed(2)}
                    disabled={busy}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(maxDuration, Number(e.target.value) || 0));
                      updateRange((prev) => ({
                        ...prev,
                        start: v,
                        end: prev.isRange && prev.end != null && prev.end < v ? v : prev.end,
                      }));
                    }}
                    className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    aria-label="Start timestamp in seconds"
                  />
                </label>
                {range.isRange ? (
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    <span>End (s):</span>
                    <input
                      type="number"
                      min={effectiveStart}
                      max={maxDuration}
                      step={0.01}
                      value={effectiveEnd.toFixed(2)}
                      disabled={busy}
                      onChange={(e) => {
                        const v = Math.max(effectiveStart, Math.min(maxDuration, Number(e.target.value) || 0));
                        updateRange((prev) => ({
                          ...prev,
                          end: v,
                        }));
                      }}
                      className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-xs text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                      aria-label="End timestamp in seconds"
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Label</span>
              <input
                type="text"
                value={label}
                disabled={busy}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. vocal lead, drop, chorus, snare eq"
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Comment</span>
              <textarea
                value={comment}
                disabled={busy}
                rows={3}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Provide feedback or production notes for this section…"
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>

            {error ? (
              <p
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
              >
                {busy ? "Saving…" : editing ? "Update note" : "Add note"}
              </button>
              {editing ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetForm}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {/* Right Column: Timeline Notes List */}
        <div className="lg:col-span-7 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Timeline Notes ({annotations.length})
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Click timestamp to jump playhead
            </span>
          </div>

          {loadError ? (
            <p role="status" className="text-sm text-red-600 dark:text-red-400">
              {loadError}
            </p>
          ) : null}

          {annotations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 py-12 text-center dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No notes yet on this track.
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Pick a timestamp or range on the left and click &ldquo;Add note&rdquo;.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[580px] overflow-y-auto pr-1">
              {annotations.map((note) => {
                const own = userId != null && note.author_id === userId;
                return (
                  <div
                    key={note.id}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onJumpTo?.(asSeconds(note.start_seconds))}
                          className="inline-flex items-center rounded bg-zinc-200/90 px-2 py-0.5 text-xs font-mono font-medium text-zinc-900 transition-colors hover:bg-black hover:text-white dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
                          title="Jump playhead to note"
                        >
                          ▶ {formatAnnotationStamp(note.start_seconds, note.end_seconds)}
                        </button>
                        {note.label ? (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                            {note.label}
                          </span>
                        ) : null}
                      </div>

                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        @{note.author_username ?? "Unknown"}
                      </span>
                    </div>

                    {note.comment ? (
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {note.comment}
                      </p>
                    ) : null}

                    {own ? (
                      <div className="flex items-center gap-3 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => beginEdit(note)}
                          className="text-xs font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          Edit
                        </button>
                        {pendingDeleteId === note.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void confirmDelete(note)}
                              className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                            >
                              Confirm delete
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setPendingDeleteId(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDeleteId(note.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
