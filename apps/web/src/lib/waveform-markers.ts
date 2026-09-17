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
  const label = note.label?.trim();

  return {
    id: note.id,
    start,
    end,
    drag: false,
    resize: false,
    color: end === start ? POINT_COLOR : RANGE_COLOR,
    content: label || undefined,
  };
}

export function clickRatioToAudioTime(
  relativeX: number,
  durationSeconds: number,
): number {
  const clamped = Math.min(1, Math.max(0, relativeX));
  return roundAnnotationTime(clamped * durationSeconds);
}
