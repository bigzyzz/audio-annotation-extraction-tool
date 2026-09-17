"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Annotation, Database } from "@audio-tool/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "@/lib/annotations";

export type AnnotationListItem = Annotation & {
  author_username: string | null;
};

export type AnnotationPanelProps = {
  audioFileId: string;
  currentTime?: number | null;
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

function parseOptionalTime(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

export function AnnotationPanel({
  audioFileId,
  currentTime = null,
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
  const [startInput, setStartInput] = useState("0.00");
  const [endInput, setEndInput] = useState("");
  const [label, setLabel] = useState("");
  const [comment, setComment] = useState("");
  const [startDirty, setStartDirty] = useState(false);

  const annotations = controlled ? controlledAnnotations : loaded;
  const playheadStart =
    !startDirty && currentTime != null
      ? asSeconds(currentTime).toFixed(2)
      : startInput;

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
    setStartDirty(false);
    setStartInput(
      currentTime == null ? "0.00" : asSeconds(currentTime).toFixed(2),
    );
    setEndInput("");
    setLabel("");
    setComment("");
    setError(null);
  }

  function beginEdit(note: AnnotationListItem) {
    setEditingId(note.id);
    setPendingDeleteId(null);
    setStartDirty(true);
    setStartInput(asSeconds(note.start_seconds).toFixed(2));
    setEndInput(note.end_seconds == null ? "" : asSeconds(note.end_seconds).toFixed(2));
    setLabel(note.label ?? "");
    setComment(note.comment ?? "");
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const startSeconds = Number(playheadStart);
    const endSeconds = parseOptionalTime(endInput);
    if (endSeconds === undefined) {
      setError("End time must be a valid number of seconds.");
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
    <section className="flex w-full flex-col gap-4" aria-labelledby="annotation-heading">
      <div>
        <h2
          id="annotation-heading"
          className="text-lg font-semibold text-black dark:text-zinc-50"
        >
          Notes
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Leave a label or comment at a timestamp. Optional end time marks a range.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            Start (seconds)
            <input
              type="number"
              min={0}
              step={0.01}
              required
              value={playheadStart}
              disabled={busy}
              onChange={(event) => {
                setStartDirty(true);
                setStartInput(event.target.value);
              }}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-black dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            End (optional)
            <input
              type="number"
              min={0}
              step={0.01}
              value={endInput}
              disabled={busy}
              onChange={(event) => setEndInput(event.target.value)}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-black dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={busy || currentTime == null}
          onClick={() => {
            if (currentTime == null) return;
            setStartDirty(true);
            setStartInput(asSeconds(currentTime).toFixed(2));
          }}
          className="self-start text-sm font-medium text-zinc-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300"
        >
          Use playhead
        </button>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Label
          <input
            type="text"
            value={label}
            disabled={busy}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. kick, vocal"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-black dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Comment
          <textarea
            value={comment}
            disabled={busy}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What should change here?"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-black dark:border-zinc-700 dark:text-zinc-50"
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

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {busy ? "Saving…" : editing ? "Save note" : "Add note"}
          </button>
          {editing ? (
            <button
              type="button"
              disabled={busy}
              onClick={resetForm}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {loadError ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {loadError}
        </p>
      ) : null}

      {annotations.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No notes yet. Add a label or comment to leave the first one.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {annotations.map((note) => {
            const own = userId != null && note.author_id === userId;
            return (
              <li key={note.id} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onJumpTo?.(asSeconds(note.start_seconds))}
                    className="text-left text-sm font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {formatAnnotationStamp(note.start_seconds, note.end_seconds)}
                  </button>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {note.author_username ?? "Unknown"}
                  </span>
                </div>
                {note.label ? (
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {note.label}
                  </p>
                ) : null}
                {note.comment ? (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {note.comment}
                  </p>
                ) : null}
                {own ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => beginEdit(note)}
                      className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-zinc-300"
                    >
                      Edit
                    </button>
                    {pendingDeleteId === note.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmDelete(note)}
                          className="text-sm font-medium text-red-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-red-300"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPendingDeleteId(null)}
                          className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-zinc-300"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPendingDeleteId(note.id)}
                        className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-zinc-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
