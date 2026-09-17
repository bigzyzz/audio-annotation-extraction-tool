/**
 * R3 / T9: annotation writes with optimistic concurrency (US7, RK1).
 * Updates always `.eq("version", clientVersion)`. 0 rows → conflict, never
 * a silent overwrite. T10/T12 call this instead of ad-hoc table writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Annotation, Database } from "@audio-tool/shared-types";

export type AnnotationWriteOk = { ok: true; annotation: Annotation };
export type AnnotationWriteErr = {
  ok: false;
  error: string;
  conflict?: boolean;
};
export type AnnotationWriteResult = AnnotationWriteOk | AnnotationWriteErr;

export type AnnotationDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export type CreateAnnotationInput = {
  audioFileId: string;
  startSeconds: number;
  endSeconds?: number | null;
  label?: string | null;
  comment?: string | null;
};

export type UpdateAnnotationInput = {
  id: string;
  version: number;
  startSeconds?: number;
  endSeconds?: number | null;
  label?: string | null;
  comment?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TIME_DECIMALS = 2;

export const ANNOTATION_ERRORS = {
  login: "You need to log in to leave a note.",
  ids: "That annotation is invalid.",
  start: "Start time must be a valid number of seconds.",
  times: "End time can't be before start time.",
  empty: "Add a label or a comment.",
  conflict: "This note changed since you opened it. Refresh and try again.",
  missing: "Couldn't find that note.",
  write: "Couldn't save this note. Try again.",
  delete: "Couldn't delete this note. Try again.",
} as const;

export function roundAnnotationTime(seconds: number): number {
  const factor = 10 ** TIME_DECIMALS;
  return Math.round(seconds * factor) / factor;
}

export function normalizeAnnotationText(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function validateAnnotationTimes(
  startSeconds: number,
  endSeconds: number | null | undefined,
): AnnotationWriteErr | { ok: true; start: number; end: number | null } {
  if (!Number.isFinite(startSeconds) || startSeconds < 0) {
    return { ok: false, error: ANNOTATION_ERRORS.start };
  }

  const start = roundAnnotationTime(startSeconds);
  if (endSeconds == null) {
    return { ok: true, start, end: null };
  }

  if (!Number.isFinite(endSeconds) || endSeconds < 0) {
    return { ok: false, error: ANNOTATION_ERRORS.times };
  }

  const end = roundAnnotationTime(endSeconds);
  if (end < start) {
    return { ok: false, error: ANNOTATION_ERRORS.times };
  }

  return { ok: true, start, end };
}

function requireUserId(
  userId: string | undefined,
): AnnotationWriteErr | { ok: true; userId: string } {
  if (!userId) {
    return { ok: false, error: ANNOTATION_ERRORS.login };
  }
  return { ok: true, userId };
}

async function currentUserId(
  supabase: SupabaseClient<Database>,
): Promise<string | undefined> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id;
}

function bodyFromLabelComment(
  label: string | null | undefined,
  comment: string | null | undefined,
): AnnotationWriteErr | { ok: true; label: string | null; comment: string | null } {
  const nextLabel = normalizeAnnotationText(label);
  const nextComment = normalizeAnnotationText(comment);
  if (!nextLabel && !nextComment) {
    return { ok: false, error: ANNOTATION_ERRORS.empty };
  }
  return { ok: true, label: nextLabel, comment: nextComment };
}

export async function createAnnotation(
  supabase: SupabaseClient<Database>,
  input: CreateAnnotationInput,
): Promise<AnnotationWriteResult> {
  const user = requireUserId(await currentUserId(supabase));
  if (!user.ok) return user;

  if (!UUID_RE.test(input.audioFileId)) {
    return { ok: false, error: ANNOTATION_ERRORS.ids };
  }

  const times = validateAnnotationTimes(input.startSeconds, input.endSeconds);
  if (!times.ok) return times;

  const body = bodyFromLabelComment(input.label, input.comment);
  if (!body.ok) return body;

  const { data, error } = await supabase
    .from("annotations")
    .insert({
      audio_file_id: input.audioFileId,
      author_id: user.userId,
      start_seconds: times.start,
      end_seconds: times.end,
      label: body.label,
      comment: body.comment,
    })
    .select()
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: ANNOTATION_ERRORS.write };
  }

  return { ok: true, annotation: data };
}

export async function updateAnnotation(
  supabase: SupabaseClient<Database>,
  input: UpdateAnnotationInput,
): Promise<AnnotationWriteResult> {
  const user = requireUserId(await currentUserId(supabase));
  if (!user.ok) return user;

  if (!UUID_RE.test(input.id) || !Number.isInteger(input.version) || input.version < 1) {
    return { ok: false, error: ANNOTATION_ERRORS.ids };
  }

  const patch: {
    start_seconds?: number;
    end_seconds?: number | null;
    label?: string | null;
    comment?: string | null;
  } = {};

  const touchesTime =
    input.startSeconds !== undefined || input.endSeconds !== undefined;
  if (touchesTime) {
    if (input.startSeconds === undefined) {
      return { ok: false, error: ANNOTATION_ERRORS.start };
    }
    const times = validateAnnotationTimes(input.startSeconds, input.endSeconds);
    if (!times.ok) return times;
    patch.start_seconds = times.start;
    patch.end_seconds = times.end;
  }

  const touchesBody = input.label !== undefined || input.comment !== undefined;
  if (touchesBody) {
    const body = bodyFromLabelComment(input.label, input.comment);
    if (!body.ok) return body;
    patch.label = body.label;
    patch.comment = body.comment;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: ANNOTATION_ERRORS.write };
  }

  const { data, error } = await supabase
    .from("annotations")
    .update(patch)
    .eq("id", input.id)
    .eq("version", input.version)
    .eq("author_id", user.userId)
    .select()
    .maybeSingle();

  if (error) {
    return { ok: false, error: ANNOTATION_ERRORS.write };
  }

  if (data) {
    return { ok: true, annotation: data };
  }

  const { data: existing } = await supabase
    .from("annotations")
    .select("id, version")
    .eq("id", input.id)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: ANNOTATION_ERRORS.missing };
  }

  if (existing.version !== input.version) {
    return { ok: false, error: ANNOTATION_ERRORS.conflict, conflict: true };
  }

  return { ok: false, error: ANNOTATION_ERRORS.write };
}

export async function deleteAnnotation(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<AnnotationDeleteResult> {
  const user = requireUserId(await currentUserId(supabase));
  if (!user.ok) return user;

  if (!UUID_RE.test(id)) {
    return { ok: false, error: ANNOTATION_ERRORS.ids };
  }

  const { data, error } = await supabase
    .from("annotations")
    .delete()
    .eq("id", id)
    .eq("author_id", user.userId)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: ANNOTATION_ERRORS.delete };
  }

  if (!data) {
    return { ok: false, error: ANNOTATION_ERRORS.missing };
  }

  return { ok: true };
}
