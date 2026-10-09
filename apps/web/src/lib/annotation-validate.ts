/**
 * T22 (R6): Annotation input & bounds validation helper.
 * Enforces live client-side validation on timestamp input bounds and content
 * before submission to prevent user slips and database rejection.
 */

export const ANNOTATION_VALIDATION_ERRORS = {
  negativeStart: "Start time cannot be negative.",
  startExceedsDuration: "Start time cannot exceed audio duration.",
  endBeforeStart: "End time must be greater than start time.",
  endExceedsDuration: "End time cannot exceed audio duration.",
  tooShort: "Range segment must be at least 0.05 seconds.",
  emptyContent: "Provide a label or a comment (or both) to save.",
  invalidNumber: "Timestamps must be valid numbers.",
} as const;

export type ValidateAnnotationInputParams = {
  start: number;
  end: number | null;
  isRange: boolean;
  durationSeconds?: number | null;
  label?: string;
  comment?: string;
};

export type AnnotationInputValidation = {
  ok: boolean;
  boundsOk: boolean;
  contentOk: boolean;
  error: string | null;
  field?: "start" | "end" | "content";
};

/**
 * Validates timestamp bounds and note content live before submission.
 */
export function validateAnnotationInput({
  start,
  end,
  isRange,
  durationSeconds,
  label = "",
  comment = "",
}: ValidateAnnotationInputParams): AnnotationInputValidation {
  if (!Number.isFinite(start)) {
    return {
      ok: false,
      boundsOk: false,
      contentOk: false,
      error: ANNOTATION_VALIDATION_ERRORS.invalidNumber,
      field: "start",
    };
  }

  if (start < 0) {
    return {
      ok: false,
      boundsOk: false,
      contentOk: false,
      error: ANNOTATION_VALIDATION_ERRORS.negativeStart,
      field: "start",
    };
  }

  const duration =
    durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : null;

  if (duration != null && start > duration) {
    return {
      ok: false,
      boundsOk: false,
      contentOk: false,
      error: `${ANNOTATION_VALIDATION_ERRORS.startExceedsDuration} (${duration.toFixed(2)}s).`,
      field: "start",
    };
  }

  if (isRange && end != null) {
    if (!Number.isFinite(end)) {
      return {
        ok: false,
        boundsOk: false,
        contentOk: false,
        error: ANNOTATION_VALIDATION_ERRORS.invalidNumber,
        field: "end",
      };
    }

    if (end <= start) {
      return {
        ok: false,
        boundsOk: false,
        contentOk: false,
        error: ANNOTATION_VALIDATION_ERRORS.endBeforeStart,
        field: "end",
      };
    }

    if (end - start < 0.05) {
      return {
        ok: false,
        boundsOk: false,
        contentOk: false,
        error: ANNOTATION_VALIDATION_ERRORS.tooShort,
        field: "end",
      };
    }

    if (duration != null && end > duration) {
      return {
        ok: false,
        boundsOk: false,
        contentOk: false,
        error: `${ANNOTATION_VALIDATION_ERRORS.endExceedsDuration} (${duration.toFixed(2)}s).`,
        field: "end",
      };
    }
  }

  const hasContent = label.trim().length > 0 || comment.trim().length > 0;
  if (!hasContent) {
    return {
      ok: false,
      boundsOk: true,
      contentOk: false,
      error: ANNOTATION_VALIDATION_ERRORS.emptyContent,
      field: "content",
    };
  }

  return {
    ok: true,
    boundsOk: true,
    contentOk: true,
    error: null,
  };
}
