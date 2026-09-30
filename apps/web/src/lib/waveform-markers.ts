import { roundAnnotationTime } from "./annotations";

export type WaveformAnnotationMarker = {
  id: string;
  start_seconds: number;
  end_seconds: number | null;
  label?: string | null;
};

export type WaveformRegionParams = {
  id: string;
  start: number;
  end: number;
  drag: false;
  resize: false;
  color: string;
  content?: string;
};

const POINT_COLOR = "rgba(24, 24, 27, 0.85)";
const RANGE_COLOR = "rgba(24, 24, 27, 0.22)";

/** Map a note onto a WaveSurfer region using audio-clock seconds (RK2). */
export function annotationToRegionParams(
  note: WaveformAnnotationMarker,
): WaveformRegionParams {
  const start = roundAnnotationTime(Number(note.start_seconds));
  const rawEnd =
    note.end_seconds == null ? start : roundAnnotationTime(Number(note.end_seconds));
  const end = rawEnd < start ? start : rawEnd;
  return {
    id: note.id,
    start,
    end,
    drag: false,
    resize: false,
    color: end === start ? POINT_COLOR : RANGE_COLOR,
  };
}

export type ActiveAnnotationCandidate = {
  id: string;
  start_seconds: number;
  end_seconds: number | null;
  label?: string | null;
  comment?: string | null;
  author_username?: string | null;
  created_at?: string | null;
  version?: number;
};

export const LABEL_DISPLAY_DURATION = 1.0;

/**
 * Returns the active annotation at the given audio clock time during playback.
 * Every annotation label appears for exactly 1.0s after the start of the label.
 * If multiple annotations overlap within the same 1.0s window, picks the most recent one.
 */
export function findActiveAnnotation<T extends ActiveAnnotationCandidate>(
  annotations: T[],
  currentTime: number | null | undefined,
  isPlaying: boolean,
): T | null {
  if (!isPlaying || currentTime == null || !Number.isFinite(currentTime)) {
    return null;
  }

  const activeCandidates = annotations.filter((note) => {
    const start = Number(note.start_seconds);
    const end = start + LABEL_DISPLAY_DURATION;

    return currentTime >= start && currentTime < end;
  });

  if (activeCandidates.length === 0) return null;
  if (activeCandidates.length === 1) return activeCandidates[0];

  return [...activeCandidates].sort((a, b) => {
    if (a.created_at && b.created_at) {
      const timeDiff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (timeDiff !== 0) return timeDiff;
    }
    const versionDiff = (b.version ?? 0) - (a.version ?? 0);
    if (versionDiff !== 0) return versionDiff;
    return Number(b.start_seconds) - Number(a.start_seconds);
  })[0];
}

export function clickRatioToAudioTime(
  relativeX: number,
  durationSeconds: number,
): number {
  const clamped = Math.min(1, Math.max(0, relativeX));
  return roundAnnotationTime(clamped * durationSeconds);
}
