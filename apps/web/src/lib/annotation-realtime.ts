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

export type RealtimeConnectionStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected";

export type LatencyGrade = "optimal" | "acceptable" | "lagging" | "offline";

export type LatencyTelemetry = {
  lastPingMs: number | null;
  avgPingMs: number | null;
  samples: number[];
  grade: LatencyGrade;
  slaPass: boolean;
  lastSyncedAt: number | null;
};

export const LATENCY_SLA_THRESHOLD_MS = 2000;
export const LATENCY_OPTIMAL_THRESHOLD_MS = 300;

/**
 * Calculates exponential backoff with jitter for WebSocket reconnection (T28).
 */
export function calculateBackoffDelay(
  attempt: number,
  baseMs = 500,
  maxMs = 8000,
  jitterRatio = 0.25,
): number {
  if (attempt <= 0) return 0;
  const exponential = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
  const jitter = exponential * jitterRatio * Math.random();
  return Math.round(exponential + jitter);
}

/**
 * Evaluates latency grade and SLA compliance (<2.0s per requirement R7 / RK1).
 */
export function evaluateLatencyGrade(latencyMs: number | null): {
  grade: LatencyGrade;
  slaPass: boolean;
} {
  if (latencyMs == null) {
    return { grade: "offline", slaPass: false };
  }
  if (latencyMs < LATENCY_OPTIMAL_THRESHOLD_MS) {
    return { grade: "optimal", slaPass: true };
  }
  if (latencyMs <= LATENCY_SLA_THRESHOLD_MS) {
    return { grade: "acceptable", slaPass: true };
  }
  return { grade: "lagging", slaPass: false };
}

/**
 * Updates a sliding window of latency samples and computes the moving average.
 */
export function recordLatencySample(
  previousSamples: number[],
  newSampleMs: number,
  maxSamples = 10,
): { samples: number[]; avgPingMs: number } {
  const samples = [...previousSamples, Math.max(0, Math.round(newSampleMs))].slice(
    -maxSamples,
  );
  const sum = samples.reduce((acc, v) => acc + v, 0);
  const avgPingMs = samples.length > 0 ? Math.round(sum / samples.length) : 0;
  return { samples, avgPingMs };
}

/**
 * Reconciles annotations after reconnecting or waking from tab hibernation.
 * Detects missing, updated, and deleted rows so client state never drifts (T28).
 */
export function reconcileAnnotationsOnReconnect(
  localNotes: AnnotationListItem[],
  fetchedNotes: AnnotationListItem[],
): {
  reconciled: AnnotationListItem[];
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  hasChanged: boolean;
} {
  const localMap = new Map(localNotes.map((n) => [n.id, n]));
  const fetchedMap = new Map(fetchedNotes.map((n) => [n.id, n]));

  let addedCount = 0;
  let updatedCount = 0;
  let removedCount = 0;

  for (const fetched of fetchedNotes) {
    const local = localMap.get(fetched.id);
    if (!local) {
      addedCount++;
    } else if (local.version !== fetched.version) {
      updatedCount++;
    }
  }

  for (const local of localNotes) {
    if (!fetchedMap.has(local.id)) {
      removedCount++;
    }
  }

  const hasChanged = addedCount > 0 || updatedCount > 0 || removedCount > 0;
  const reconciled = [...fetchedNotes].sort(
    (a, b) => a.start_seconds - b.start_seconds,
  );

  return {
    reconciled,
    addedCount,
    updatedCount,
    removedCount,
    hasChanged,
  };
}


