import type { AnnotationListItem } from "../components/annotation-panel";

export type AnnotationRealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

function sortNotes(notes: AnnotationListItem[]): AnnotationListItem[] {
  return [...notes].sort((a, b) => a.start_seconds - b.start_seconds);
}

export function annotationRowFromPayload(
  row: Record<string, unknown>,
): AnnotationListItem | null {
  if (typeof row.id !== "string") return null;
  if (typeof row.audio_file_id !== "string") return null;
  if (typeof row.author_id !== "string") return null;

  const start = Number(row.start_seconds);
  if (!Number.isFinite(start)) return null;

  const end =
    row.end_seconds == null ? null : Number(row.end_seconds);
  if (end != null && !Number.isFinite(end)) return null;

  const version = Number(row.version ?? 1);

  return {
    id: row.id,
    audio_file_id: row.audio_file_id,
    author_id: row.author_id,
    start_seconds: start,
    end_seconds: end,
    label: typeof row.label === "string" ? row.label : null,
    comment: typeof row.comment === "string" ? row.comment : null,
    version: Number.isInteger(version) && version >= 1 ? version : 1,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
    author_username: null,
  };
}

/** Merge a postgres_changes payload into the in-memory note list (US8). */
export function mergeAnnotationRealtimeEvent(
  notes: AnnotationListItem[],
  eventType: AnnotationRealtimeEvent,
  row: AnnotationListItem,
): AnnotationListItem[] {
  if (eventType === "DELETE") {
    return notes.filter((note) => note.id !== row.id);
  }

  const existing = notes.find((note) => note.id === row.id);
  const next: AnnotationListItem = {
    ...row,
    author_username: row.author_username ?? existing?.author_username ?? null,
  };

  if (!existing) {
    return sortNotes([...notes, next]);
  }

  return sortNotes(notes.map((note) => (note.id === row.id ? next : note)));
}

export type EditConflict = {
  hasConflict: boolean;
  reason?: "version_mismatch" | "deleted";
  serverVersion?: number;
  serverNote?: AnnotationListItem;
};

/**
 * Detects if an incoming Realtime event collides with an annotation
 * currently being edited by the local user (US13).
 */
export function detectEditConflict(
  editingTarget: { id: string; version: number } | null | undefined,
  eventType: AnnotationRealtimeEvent,
  incomingRow: AnnotationListItem,
): EditConflict {
  if (!editingTarget || editingTarget.id !== incomingRow.id) {
    return { hasConflict: false };
  }

  if (eventType === "DELETE") {
    return {
      hasConflict: true,
      reason: "deleted",
    };
  }

  if (eventType === "UPDATE" && incomingRow.version !== editingTarget.version) {
    return {
      hasConflict: true,
      reason: "version_mismatch",
      serverVersion: incomingRow.version,
      serverNote: incomingRow,
    };
  }

  return { hasConflict: false };
}

/**
 * Reconciles draft inputs with an updated server annotation version.
 * Keeps local typed draft inputs while adopting the new server version.
 */
export function reconcileDraftWithServer(
  draft: { label: string; comment: string },
  serverNote: { version: number },
): { label: string; comment: string; version: number } {
  return {
    label: draft.label,
    comment: draft.comment,
    version: serverNote.version,
  };
}

/**
 * Discards local draft inputs in favor of server content and version.
 */
export function discardDraftForServer(serverNote: {
  version: number;
  label: string | null;
  comment: string | null;
}): { label: string; comment: string; version: number } {
  return {
    label: serverNote.label ?? "",
    comment: serverNote.comment ?? "",
    version: serverNote.version,
  };
}

