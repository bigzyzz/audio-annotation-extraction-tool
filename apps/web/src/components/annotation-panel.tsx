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
  isSelecting?: boolean;
  onStartAdd?: () => void;
  onCancelAdd?: () => void;
  selectedRange?: AnnotationPanelRange | null;
  onRangeChange?: (range: AnnotationPanelRange) => void;
  annotations?: AnnotationListItem[];
  onNeedRefresh?: () => void;
  onJumpTo?: (seconds: number) => void;
  onEditingChange?: (annotationId: string | null) => void;
  onPreviewRange?: (start: number, end: number) => void;
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
  currentTime = null,
  isSelecting: isSelectingProp,
  onStartAdd,
  onCancelAdd,
  selectedRange,
  onRangeChange,
  annotations: controlledAnnotations,
  onNeedRefresh,
  onJumpTo,
  onEditingChange,
  onPreviewRange,
}: AnnotationPanelProps) {
  const controlled = controlledAnnotations !== undefined;
  const [loaded, setLoaded] = useState<AnnotationListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isAddingLocal, setIsAddingLocal] = useState(false);

  const [localRange, setLocalRange] = useState<AnnotationPanelRange>(() => ({
    start: currentTime != null ? roundAnnotationTime(currentTime) : 0,
    end: null,
    isRange: false,
  }));

  const isAdding = isSelectingProp ?? isAddingLocal;
  const range = selectedRange !== undefined ? selectedRange : localRange;

  const updateRange = useCallback(
    (newRange: AnnotationPanelRange) => {
      if (onRangeChange) {
        onRangeChange(newRange);
      } else {
        setLocalRange(newRange);
      }
    },
    [onRangeChange],
  );

  const [label, setLabel] = useState("");
  const [comment, setComment] = useState("");

  const annotations = controlled ? controlledAnnotations : loaded;

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

  function startAdd() {
    setEditingId(null);
    onEditingChange?.(null);
    setIsAddingLocal(true);
    onStartAdd?.();
    const initialStart = currentTime != null ? roundAnnotationTime(currentTime) : 0;
    updateRange({
      start: initialStart,
      end: null,
      isRange: false,
    });
    setLabel("");
    setComment("");
    setError(null);
  }

  function handleCancel() {
    setEditingId(null);
    setIsAddingLocal(false);
    onEditingChange?.(null);
    onCancelAdd?.();
    setLabel("");
    setComment("");
    setError(null);
    setPendingDeleteId(null);
  }

  function beginEdit(note: AnnotationListItem) {
    setEditingId(note.id);
    setIsAddingLocal(false);
    onEditingChange?.(note.id);
    setPendingDeleteId(null);

    const s = asSeconds(note.start_seconds);
    const hasRange = note.end_seconds != null && note.end_seconds > note.start_seconds;
    const e = hasRange ? asSeconds(note.end_seconds) : null;

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

    const activeStart = range?.start ?? (currentTime != null ? roundAnnotationTime(currentTime) : 0);
    const startSeconds = roundAnnotationTime(activeStart);
    const endSeconds = range?.isRange && range.end != null ? roundAnnotationTime(range.end) : null;

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

    handleCancel();
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

    if (editingId === note.id) handleCancel();
    setPendingDeleteId(null);
    await refresh();
  }

  const showForm = isAdding || editingId != null;

  return (
    <section className="flex w-full flex-col gap-6" aria-labelledby="annotation-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2
          id="annotation-heading"
          className="text-xl font-semibold text-black dark:text-zinc-50"
        >
          Annotations
        </h2>
        {!showForm ? (
          <button
            type="button"
            onClick={startAdd}
            className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>Add Annotation</span>
          </button>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-6">
        {showForm ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {editing ? "Edit Annotation" : "Add Annotation"}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Selected:</span>
                {range ? (
                  <span className="rounded bg-blue-100/90 px-2.5 py-1 font-mono text-xs font-semibold text-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
                    {range.isRange && range.end != null
                      ? `${formatDurationSeconds(range.start)} – ${formatDurationSeconds(range.end)} (${(range.end - range.start).toFixed(2)}s)`
                      : `${formatDurationSeconds(range.start)} (${range.start.toFixed(2)}s)`}
                  </span>
                ) : (
                  <span className="rounded bg-zinc-100 px-2.5 py-1 text-xs italic text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    Highlight a section or click on the waveform above
                  </span>
                )}

                {currentTime != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      const s = roundAnnotationTime(currentTime);
                      updateRange({
                        start: s,
                        end: null,
                        isRange: false,
                      });
                    }}
                    className="flex items-center gap-1 rounded border border-blue-300 bg-white/90 px-2.5 py-1 text-xs font-medium text-blue-900 shadow-xs transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-200 dark:hover:bg-blue-900"
                    title="Stamp current playback time onto this annotation"
                  >
                    ⏱ Use Playhead ({formatDurationSeconds(currentTime)})
                  </button>
                ) : null}

                {range?.isRange && range.end != null && onPreviewRange ? (
                  <button
                    type="button"
                    onClick={() => onPreviewRange(range.start, range.end!)}
                    className="flex items-center gap-1 rounded border border-blue-400 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
                    title="Play highlighted section"
                  >
                    ▶ Preview Selection
                  </button>
                ) : null}
              </div>
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">Label</span>
                <input
                  type="text"
                  value={label}
                  disabled={busy}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. vocal hook, bass drop, chorus, snare eq"
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

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
                >
                  {busy ? "Saving…" : editing ? "Update annotation" : "Save annotation"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancel}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* Timeline Notes List */}
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {annotations.length} {annotations.length === 1 ? "annotation" : "annotations"} • Click timestamp to jump playhead
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
                No annotations yet on this track.
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Click &ldquo;Add Annotation&rdquo; above to highlight a section on the waveform.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
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
