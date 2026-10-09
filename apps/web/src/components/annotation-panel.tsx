"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Annotation, Database } from "@audio-tool/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  createAnnotation,
  deleteAnnotation,
  getLatestAnnotation,
  roundAnnotationTime,
  updateAnnotation,
} from "@/lib/annotations";
import {
  discardDraftForServer,
  reconcileDraftWithServer,
} from "@/lib/annotation-realtime";
import { validateAnnotationInput } from "@/lib/annotation-validate";
import { formatDurationSeconds } from "@/lib/format-duration";
import { ActionableErrorAlert } from "@/components/actionable-error-alert";
import { useToast } from "@/components/toast";

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
  durationSeconds,
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
  const { toast } = useToast();
  const controlled = controlledAnnotations !== undefined;
  const [loaded, setLoaded] = useState<AnnotationListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<AnnotationListItem | null>(null);
  const [editingTargetVersion, setEditingTargetVersion] = useState<number | null>(null);
  const [submitConflict, setSubmitConflict] = useState<{
    serverVersion: number;
    serverLabel: string | null;
    serverComment: string | null;
    serverAuthor?: string | null;
    isDeleted?: boolean;
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isAddingLocal, setIsAddingLocal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);

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
    () => editingNote ?? annotations.find((note) => note.id === editingId) ?? null,
    [annotations, editingId, editingNote],
  );

  const showForm = isAdding || editingId != null;

  // Track initial values for dirty-form detection (T22)
  const initialLabel = editing?.label ?? "";
  const initialComment = editing?.comment ?? "";
  const initialStart = editing ? asSeconds(editing.start_seconds) : 0;
  const initialEnd =
    editing?.end_seconds != null && editing.end_seconds > editing.start_seconds
      ? asSeconds(editing.end_seconds)
      : null;

  const isDirty = useMemo(() => {
    if (!showForm) return false;
    if (editing) {
      const labelChanged = label !== initialLabel;
      const commentChanged = comment !== initialComment;
      const startChanged =
        range != null &&
        roundAnnotationTime(range.start) !== roundAnnotationTime(initialStart);
      const endChanged =
        range != null &&
        roundAnnotationTime(range.end ?? -1) !== roundAnnotationTime(initialEnd ?? -1);
      return labelChanged || commentChanged || startChanged || endChanged;
    }
    return label.trim().length > 0 || comment.trim().length > 0;
  }, [
    showForm,
    editing,
    label,
    initialLabel,
    comment,
    initialComment,
    range,
    initialStart,
    initialEnd,
  ]);

  // Guard against accidental window/tab exit with unsaved edits (T22)
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // Live bounds & content validation (T22)
  const activeStart = range?.start ?? (currentTime != null ? roundAnnotationTime(currentTime) : 0);
  const activeEnd = range?.isRange && range.end != null ? roundAnnotationTime(range.end) : null;
  const isRangeMode = Boolean(range?.isRange);

  const validation = useMemo(() => {
    return validateAnnotationInput({
      start: activeStart,
      end: activeEnd,
      isRange: isRangeMode,
      durationSeconds,
      label,
      comment,
    });
  }, [activeStart, activeEnd, isRangeMode, durationSeconds, label, comment]);

  // Derive remote background collisions directly from annotations state (US13)
  const remoteConflict = useMemo(() => {
    if (!editingId || editingTargetVersion == null) return null;
    const currentInList = annotations.find((n) => n.id === editingId);
    if (!currentInList) {
      return {
        serverVersion: editingTargetVersion,
        serverLabel: null,
        serverComment: null,
        isDeleted: true,
      };
    }

    if (currentInList.version !== editingTargetVersion) {
      return {
        serverVersion: currentInList.version,
        serverLabel: currentInList.label,
        serverComment: currentInList.comment,
        serverAuthor: currentInList.author_username,
        isDeleted: false,
      };
    }

    return null;
  }, [annotations, editingId, editingTargetVersion]);

  const conflictState = submitConflict ?? remoteConflict;

  function executeStartAdd() {
    setEditingId(null);
    setEditingNote(null);
    setEditingTargetVersion(null);
    setSubmitConflict(null);
    onEditingChange?.(null);
    setIsAddingLocal(true);
    onStartAdd?.();
    const initialStartVal = currentTime != null ? roundAnnotationTime(currentTime) : 0;
    updateRange({
      start: initialStartVal,
      end: null,
      isRange: false,
    });
    setLabel("");
    setComment("");
    setError(null);
    setShowDiscardConfirm(false);
  }

  function handleStartAddRequest() {
    if (isDirty) {
      setShowDiscardConfirm(true);
      setPendingDiscardAction(() => executeStartAdd);
    } else {
      executeStartAdd();
    }
  }

  function executeCancel() {
    setEditingId(null);
    setEditingNote(null);
    setEditingTargetVersion(null);
    setSubmitConflict(null);
    setIsAddingLocal(false);
    onEditingChange?.(null);
    onCancelAdd?.();
    setLabel("");
    setComment("");
    setError(null);
    setPendingDeleteId(null);
    setShowDiscardConfirm(false);
  }

  function handleCancelRequest() {
    if (isDirty) {
      setShowDiscardConfirm(true);
      setPendingDiscardAction(() => executeCancel);
    } else {
      executeCancel();
    }
  }

  function executeBeginEdit(note: AnnotationListItem) {
    setEditingId(note.id);
    setEditingNote(note);
    setEditingTargetVersion(note.version);
    setSubmitConflict(null);
    setIsAddingLocal(false);
    onEditingChange?.(note.id);
    setPendingDeleteId(null);
    setShowDiscardConfirm(false);

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

  function handleBeginEditRequest(note: AnnotationListItem) {
    if (isDirty && editingId !== note.id) {
      setShowDiscardConfirm(true);
      setPendingDiscardAction(() => () => executeBeginEdit(note));
    } else {
      executeBeginEdit(note);
    }
  }

  function handleNudgeStart(delta: number) {
    const nextStart = Math.max(0, roundAnnotationTime(activeStart + delta));
    if (activeEnd == null || nextStart < activeEnd - 0.05) {
      updateRange({
        start: nextStart,
        end: activeEnd,
        isRange: isRangeMode,
      });
      setError(null);
    }
  }

  function handleNudgeEnd(delta: number) {
    if (!isRangeMode || activeEnd == null) return;
    const maxBound = durationSeconds ?? Infinity;
    const nextEnd = Math.min(
      maxBound,
      Math.max(activeStart + 0.05, roundAnnotationTime(activeEnd + delta)),
    );
    updateRange({
      start: activeStart,
      end: nextEnd,
      isRange: true,
    });
    setError(null);
  }

  function handleToggleRange() {
    if (isRangeMode) {
      updateRange({
        start: activeStart,
        end: null,
        isRange: false,
      });
    } else {
      const defaultDuration = 1.0;
      const maxBound = durationSeconds ?? activeStart + defaultDuration;
      const end = Math.min(maxBound, roundAnnotationTime(activeStart + defaultDuration));
      updateRange({
        start: activeStart,
        end,
        isRange: true,
      });
    }
    setError(null);
  }

  function handleAdoptLatestVersion() {
    if (!conflictState) return;
    const reconciled = reconcileDraftWithServer(
      { label, comment },
      { version: conflictState.serverVersion },
    );
    setEditingTargetVersion(reconciled.version);
    setSubmitConflict(null);
    setError(null);
  }

  function handleDiscardDraft() {
    if (!conflictState) return;
    const discarded = discardDraftForServer({
      version: conflictState.serverVersion,
      label: conflictState.serverLabel,
      comment: conflictState.serverComment,
    });
    setLabel(discarded.label);
    setComment(discarded.comment);
    setEditingTargetVersion(discarded.version);
    setSubmitConflict(null);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const targetNote = editingNote ?? editing;
    const activeVersion = editingTargetVersion ?? targetNote?.version ?? 1;

    const result = targetNote
      ? await updateAnnotation(supabase, {
          id: targetNote.id,
          version: activeVersion,
          startSeconds: activeStart,
          endSeconds: activeEnd,
          label,
          comment,
        })
      : await createAnnotation(supabase, {
          audioFileId,
          startSeconds: activeStart,
          endSeconds: activeEnd,
          label,
          comment,
        });

    setBusy(false);

    if (!result.ok) {
      if (result.conflict && targetNote) {
        const latestResult = await getLatestAnnotation(supabase, targetNote.id);
        if (latestResult.ok) {
          setSubmitConflict({
            serverVersion: latestResult.annotation.version,
            serverLabel: latestResult.annotation.label,
            serverComment: latestResult.annotation.comment,
            isDeleted: false,
          });
        } else {
          setSubmitConflict({
            serverVersion: (result.serverVersion ?? activeVersion) + 1,
            serverLabel: null,
            serverComment: null,
            isDeleted: false,
          });
        }
      }
      setError(result.error);
      return;
    }

    const wasEditing = targetNote != null;
    const savedLabel = label.trim();
    executeCancel();
    toast.success(
      wasEditing ? "Annotation updated" : "Annotation added",
      savedLabel ? `“${savedLabel}” saved to timeline.` : "Saved to timeline.",
    );
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

    toast.info("Annotation deleted", "Note removed from timeline.");
    if (editingId === note.id) executeCancel();
    setPendingDeleteId(null);
    await refresh();
  }

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
            onClick={handleStartAddRequest}
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
                    disabled={busy}
                    onClick={() => {
                      const s = roundAnnotationTime(currentTime);
                      updateRange({
                        start: s,
                        end: null,
                        isRange: false,
                      });
                    }}
                    className="flex items-center gap-1 rounded border border-blue-300 bg-white/90 px-2.5 py-1 text-xs font-medium text-blue-900 shadow-xs transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-200 dark:hover:bg-blue-900"
                    title="Stamp current playback time onto this annotation"
                  >
                    ⏱ Stamp Playhead ({formatDurationSeconds(currentTime)})
                  </button>
                ) : null}

                {range?.isRange && range.end != null && onPreviewRange ? (
                  <button
                    type="button"
                    disabled={busy || !validation.boundsOk}
                    onClick={() => onPreviewRange(range.start, range.end!)}
                    className="flex items-center gap-1 rounded border border-blue-400 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
                    title="Play highlighted section"
                  >
                    ▶ Preview Selection
                  </button>
                ) : null}
              </div>
            </div>

            {/* Interactive Bounds Fine-Tuning & Live Validation Bar (T22) */}
            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/70 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Start time bounds + nudger */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">Start:</span>
                    <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatDurationSeconds(activeStart)} ({activeStart.toFixed(2)}s)
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleNudgeStart(-0.1)}
                        className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        title="Nudge start back 0.1s"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleNudgeStart(0.1)}
                        className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        title="Nudge start forward 0.1s"
                      >
                        +0.1s
                      </button>
                    </div>
                  </div>

                  {/* End time bounds + nudger if range */}
                  {isRangeMode && activeEnd != null ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-zinc-600 dark:text-zinc-400">End:</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatDurationSeconds(activeEnd)} ({activeEnd.toFixed(2)}s)
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleNudgeEnd(-0.1)}
                          className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          title="Nudge end back 0.1s"
                        >
                          -0.1s
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleNudgeEnd(0.1)}
                          className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          title="Nudge end forward 0.1s"
                        >
                          +0.1s
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Range vs Point Toggle */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleToggleRange}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {isRangeMode ? "Switch to Point Note" : "+ Convert to Range Section"}
                </button>
              </div>

              {/* Live Inline Bounds Validation Alert (T22) */}
              {!validation.boundsOk && validation.error ? (
                <div
                  role="alert"
                  className="mt-1 flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
                >
                  <span aria-hidden="true">⚠️</span>
                  <span>{validation.error}</span>
                </div>
              ) : null}
            </div>

            {/* Dirty Form Discard Confirmation Guard (T22) */}
            {showDiscardConfirm ? (
              <div
                role="alertdialog"
                aria-labelledby="discard-warning-title"
                className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-xs dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
              >
                <div className="flex flex-col gap-2">
                  <h4
                    id="discard-warning-title"
                    className="flex items-center gap-1.5 text-sm font-semibold"
                  >
                    <span aria-hidden="true">⚠️</span>
                    <span>Unsaved Changes Warning</span>
                  </h4>
                  <p className="text-xs leading-relaxed opacity-90">
                    You have unsaved changes in this annotation. Discarding will permanently lose your edits.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setShowDiscardConfirm(false);
                        pendingDiscardAction?.();
                        setPendingDiscardAction(null);
                      }}
                      className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:opacity-50"
                    >
                      Discard Changes
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setShowDiscardConfirm(false);
                        setPendingDiscardAction(null);
                      }}
                      className="rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 shadow-xs hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-200"
                    >
                      Keep Editing
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

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

              {/* Helpful inline content requirement prompt */}
              {validation.boundsOk && !validation.contentOk ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  💡 Enter a label or a comment (or both) to save this annotation.
                </p>
              ) : null}

              {conflictState ? (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl" aria-hidden="true">
                      ⚠️
                    </span>
                    <div className="flex flex-1 flex-col gap-2">
                      <h4 className="text-sm font-semibold">
                        {conflictState.isDeleted
                          ? "Annotation Deleted by Another Collaborator"
                          : "Sync Conflict: Note modified by another collaborator"}
                      </h4>
                      <p className="text-xs leading-relaxed opacity-90">
                        {conflictState.isDeleted
                          ? "This annotation was removed while you had it open. Your draft cannot be saved to a deleted note."
                          : `Another user saved changes (version ${conflictState.serverVersion}) while you were editing. Choose how to reconcile:`}
                      </p>

                      {!conflictState.isDeleted ? (
                        <div className="my-1 rounded border border-amber-200 bg-white/60 p-2.5 text-xs text-zinc-700 dark:border-amber-800 dark:bg-black/30 dark:text-zinc-300">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                            Current server version (v{conflictState.serverVersion}
                            {conflictState.serverAuthor ? ` by @${conflictState.serverAuthor}` : ""}):
                          </span>
                          <div className="mt-1 flex flex-col gap-0.5">
                            {conflictState.serverLabel ? (
                              <div>
                                <span className="font-medium text-zinc-500">Label:</span>{" "}
                                {conflictState.serverLabel}
                              </div>
                            ) : null}
                            {conflictState.serverComment ? (
                              <div>
                                <span className="font-medium text-zinc-500">Comment:</span>{" "}
                                {conflictState.serverComment}
                              </div>
                            ) : null}
                            {!conflictState.serverLabel && !conflictState.serverComment ? (
                              <div className="italic text-zinc-400">Empty label and comment</div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {conflictState.isDeleted ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={executeCancel}
                            className="rounded bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                          >
                            Dismiss
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={handleAdoptLatestVersion}
                              className="rounded bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-amber-900 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                            >
                              Keep My Draft & Adopt v{conflictState.serverVersion}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={handleDiscardDraft}
                              className="rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 shadow-xs transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-zinc-800"
                            >
                              Discard My Draft & Load Server Note
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {error ? (
                <ActionableErrorAlert
                  error={error}
                  context="annotation"
                  onDismiss={() => setError(null)}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={!validation.ok || busy}
                  className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
                >
                  {busy ? "Saving…" : editing ? "Update annotation" : "Save annotation"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelRequest}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
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
            <ActionableErrorAlert
              error={loadError}
              context="annotation"
              onRetry={refresh}
              onDismiss={() => setLoadError(null)}
            />
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
                          onClick={() => handleBeginEditRequest(note)}
                          className="text-xs font-medium text-zinc-600 hover:text-black disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          Edit
                        </button>
                        {pendingDeleteId === note.id ? (
                          <div
                            role="alertdialog"
                            aria-label={`Confirm deleting note ${note.label || note.comment || ""}`}
                            className="flex items-center gap-2"
                          >
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                              Delete note?
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void confirmDelete(note)}
                              className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                            >
                              {busy ? "Deleting…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setPendingDeleteId(null)}
                              className="text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDeleteId(note.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
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
