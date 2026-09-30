"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WaveformPeaksDocument } from "@audio-tool/shared-types";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import { peaksDocumentToWaveSurferLoad } from "@/lib/waveform-peaks-client";
import { formatDurationSeconds } from "@/lib/format-duration";
import {
  annotationToRegionParams,
  clampAudioTime,
  clickRatioToAudioTime,
  findActiveAnnotation,
  type ActiveAnnotationCandidate,
  type WaveformAnnotationMarker,
} from "@/lib/waveform-markers";
import { roundAnnotationTime } from "@/lib/annotations";

export type WaveformSeekRequest = {
  seconds: number;
  token: number;
};

export type WaveformPreviewRequest = {
  start: number;
  end: number;
  token: number;
};

export type WaveformPlayerProps = {
  audioUrl: string | null;
  peaks: WaveformPeaksDocument | null;
  title?: string;
  annotations?: (WaveformAnnotationMarker & Partial<ActiveAnnotationCandidate>)[];
  seekRequest?: WaveformSeekRequest | null;
  previewRequest?: WaveformPreviewRequest | null;
  isSelecting?: boolean;
  draftRange?: { start: number; end: number | null; isRange: boolean } | null;
  onDraftRangeChange?: (range: { start: number; end: number | null; isRange: boolean }) => void;
  editingAnnotationId?: string | null;
  onTimeSelect?: (seconds: number) => void;
  onTimeUpdate?: (seconds: number) => void;
};

export function WaveformPlayer({
  audioUrl,
  peaks,
  title,
  annotations = [],
  seekRequest = null,
  previewRequest = null,
  isSelecting = false,
  draftRange = null,
  onDraftRangeChange,
  editingAnnotationId = null,
  onTimeSelect,
  onTimeUpdate,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const onTimeSelectRef = useRef(onTimeSelect);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const isSelectingRef = useRef(isSelecting);
  const draftRangeRef = useRef(draftRange);
  const onDraftRangeChangeRef = useRef(onDraftRangeChange);
  const editingAnnotationIdRef = useRef(editingAnnotationId);
  const previewStopRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentPlayheadTime, setCurrentPlayheadTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onTimeSelectRef.current = onTimeSelect;
    onTimeUpdateRef.current = onTimeUpdate;
    isSelectingRef.current = isSelecting;
    draftRangeRef.current = draftRange;
    onDraftRangeChangeRef.current = onDraftRangeChange;
    editingAnnotationIdRef.current = editingAnnotationId;
  }, [
    onTimeSelect,
    onTimeUpdate,
    isSelecting,
    draftRange,
    onDraftRangeChange,
    editingAnnotationId,
  ]);

  const peaksLoad = useMemo(() => {
    if (!peaks) return null;
    try {
      return peaksDocumentToWaveSurferLoad(peaks);
    } catch {
      return null;
    }
  }, [peaks]);

  // Spacebar shortcut to play/pause when not typing in text fields
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.code === "Space" && ready) {
        event.preventDefault();
        waveSurferRef.current?.playPause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ready]);

  useEffect(() => {
    if (!audioUrl || !peaksLoad || !containerRef.current) {
      setReady(false);
      setPlaying(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setReady(false);
    setPlaying(false);

    // Create WaveSurfer with custom playhead line hidden in favor of our tactile scrubber handle
    const waveSurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 160,
      waveColor: "#a1a1aa",
      progressColor: "#18181b",
      cursorColor: "transparent",
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      normalize: true,
      interact: true,
      dragToSeek: false,
    });

    const regions = waveSurfer.registerPlugin(RegionsPlugin.create());
    waveSurferRef.current = waveSurfer;
    regionsRef.current = regions;

    const unsubscribers = [
      waveSurfer.on("ready", () => {
        if (!cancelled) {
          setReady(true);
          const dur = waveSurfer.getDuration();
          if (Number.isFinite(dur) && dur > 0) setTrackDuration(dur);
        }
      }),
      waveSurfer.on("play", () => setPlaying(true)),
      waveSurfer.on("pause", () => {
        setPlaying(false);
        previewStopRef.current = null;
      }),
      waveSurfer.on("finish", () => {
        setPlaying(false);
        previewStopRef.current = null;
        setCurrentPlayheadTime(0);
      }),
      waveSurfer.on("interaction", (newTime) => {
        setCurrentPlayheadTime(newTime);
        onTimeSelectRef.current?.(newTime);
      }),
      waveSurfer.on("click", (relativeX) => {
        const duration = waveSurfer.getDuration();
        if (!Number.isFinite(duration) || duration <= 0) return;
        const time = clickRatioToAudioTime(relativeX, duration);
        setCurrentPlayheadTime(time);
        onTimeSelectRef.current?.(time);

        if (isSelectingRef.current) {
          const rounded = roundAnnotationTime(time);
          onDraftRangeChangeRef.current?.({
            start: rounded,
            end: null,
            isRange: false,
          });
        }
      }),
      waveSurfer.on("timeupdate", (currentTime) => {
        setCurrentPlayheadTime(currentTime);
        onTimeUpdateRef.current?.(currentTime);

        if (
          previewStopRef.current != null &&
          currentTime >= previewStopRef.current
        ) {
          waveSurfer.pause();
          previewStopRef.current = null;
        }
      }),
      waveSurfer.on("error", () => {
        if (!cancelled) {
          setError("Couldn't load audio for playback. Try again.");
        }
      }),
      regions.on("region-clicked", (region, event) => {
        event.stopPropagation();
        waveSurfer.setTime(region.start);
        setCurrentPlayheadTime(region.start);
        onTimeSelectRef.current?.(region.start);
      }),
      regions.on("region-created", (region) => {
        if (!isSelectingRef.current) return;
        const all = regions.getRegions();
        for (const r of all) {
          if (r.id === "__draft_annotation__" && r !== region) {
            r.remove();
          }
        }
        region.id = "__draft_annotation__";
        region.setOptions({
          color: "rgba(59, 130, 246, 0.38)",
          drag: true,
          resize: true,
        });
        const start = roundAnnotationTime(region.start);
        const end = roundAnnotationTime(region.end);
        const isRange = end > start + 0.05;
        onDraftRangeChangeRef.current?.({
          start,
          end: isRange ? end : null,
          isRange,
        });
      }),
      regions.on("region-update", (region) => {
        if (
          region.id === "__draft_annotation__" ||
          (editingAnnotationIdRef.current &&
            region.id === editingAnnotationIdRef.current)
        ) {
          const start = roundAnnotationTime(region.start);
          const end = roundAnnotationTime(region.end);
          const isRange = end > start + 0.05;
          onDraftRangeChangeRef.current?.({
            start,
            end: isRange ? end : null,
            isRange,
          });
        }
      }),
      regions.on("region-updated", (region) => {
        if (
          region.id === "__draft_annotation__" ||
          (editingAnnotationIdRef.current &&
            region.id === editingAnnotationIdRef.current)
        ) {
          const start = roundAnnotationTime(region.start);
          const end = roundAnnotationTime(region.end);
          const isRange = end > start + 0.05;
          onDraftRangeChangeRef.current?.({
            start,
            end: isRange ? end : null,
            isRange,
          });
        }
      }),
    ];

    void waveSurfer
      .load(audioUrl, peaksLoad.channelData, peaksLoad.duration)
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't load audio for playback. Try again.");
        }
      });

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      waveSurfer.destroy();
      waveSurferRef.current = null;
      regionsRef.current = null;
    };
  }, [audioUrl, peaksLoad]);

  useEffect(() => {
    waveSurferRef.current?.setVolume(volume);
  }, [volume]);

  // Synchronize saved annotations to regions without clearing the active draft
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !ready) return;

    for (const r of regions.getRegions()) {
      if (r.id !== "__draft_annotation__") {
        r.remove();
      }
    }

    for (const note of annotations) {
      if (editingAnnotationId && note.id === editingAnnotationId) {
        continue;
      }
      regions.addRegion(annotationToRegionParams(note));
    }
  }, [annotations, editingAnnotationId, ready]);

  // Enable/disable drag selection ONLY when selection mode toggles.
  // CRITICAL: Kept strictly decoupled from draftRange to prevent mid-drag cleanup abortions!
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !ready || !isSelecting) return;

    const disableDrag = regions.enableDragSelection({
      color: "rgba(59, 130, 246, 0.38)",
      drag: true,
      resize: true,
    });

    return () => {
      disableDrag();
    };
  }, [isSelecting, ready]);

  // Synchronize draftRange to the visual draft region on the waveform
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !ready) return;

    if (!isSelecting && !editingAnnotationId) {
      const all = regions.getRegions();
      for (const r of all) {
        if (r.id === "__draft_annotation__") {
          r.remove();
        }
      }
      return;
    }

    if (draftRange) {
      const existing = regions
        .getRegions()
        .find((r) => r.id === "__draft_annotation__");
      const start = draftRange.start;
      const end =
        draftRange.isRange && draftRange.end != null && draftRange.end > start
          ? draftRange.end
          : start;

      if (existing) {
        if (
          Math.abs(existing.start - start) > 0.03 ||
          Math.abs(existing.end - end) > 0.03
        ) {
          existing.setOptions({
            start,
            end,
            color: draftRange.isRange
              ? "rgba(59, 130, 246, 0.38)"
              : "rgba(59, 130, 246, 0.85)",
            drag: true,
            resize: true,
          });
        }
      } else {
        regions.addRegion({
          id: "__draft_annotation__",
          start,
          end,
          color: draftRange.isRange
            ? "rgba(59, 130, 246, 0.38)"
            : "rgba(59, 130, 246, 0.85)",
          drag: true,
          resize: true,
        });
      }
    }
  }, [draftRange, isSelecting, editingAnnotationId, ready]);

  // Handle external seek requests
  useEffect(() => {
    if (!ready || seekRequest == null) return;
    waveSurferRef.current?.setTime(seekRequest.seconds);
  }, [ready, seekRequest]);

  // Handle external preview requests
  useEffect(() => {
    if (!ready || !previewRequest || !waveSurferRef.current) return;
    previewStopRef.current = previewRequest.end;
    waveSurferRef.current.setTime(previewRequest.start);
    void waveSurferRef.current.play();
  }, [previewRequest, ready]);

  const activeAnnotation = useMemo(() => {
    return findActiveAnnotation(
      annotations as ActiveAnnotationCandidate[],
      currentPlayheadTime,
      playing,
    );
  }, [annotations, currentPlayheadTime, playing]);

  const totalDuration = trackDuration || peaks?.duration_seconds || 0;

  // Pointer scrubbing logic for the tactile Playhead Scrubber Handle
  const handlePlayheadPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const container = containerRef.current;
      const waveSurfer = waveSurferRef.current;
      const dur = trackDuration || peaks?.duration_seconds || 0;
      if (!container || !waveSurfer || !ready || dur <= 0) return;

      setIsScrubbing(true);
      isScrubbingRef.current = true;

      const onPointerMove = (e: PointerEvent) => {
        if (!isScrubbingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        const newTime = ratio * dur;
        setCurrentPlayheadTime(newTime);
        waveSurfer.setTime(newTime);
        onTimeSelectRef.current?.(newTime);
        onTimeUpdateRef.current?.(newTime);
      };

      const onPointerUp = () => {
        setIsScrubbing(false);
        isScrubbingRef.current = false;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [peaks?.duration_seconds, ready, trackDuration],
  );

  // Keyboard navigation for the tactile Playhead Scrubber Handle
  const handlePlayheadKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const dur = trackDuration || peaks?.duration_seconds || 0;
      if (!ready || dur <= 0) return;
      let delta = 0;
      if (event.key === "ArrowLeft") delta = event.shiftKey ? -5 : -1;
      else if (event.key === "ArrowRight") delta = event.shiftKey ? 5 : 1;
      if (delta !== 0) {
        event.preventDefault();
        const targetTime = clampAudioTime(currentPlayheadTime + delta, dur);
        setCurrentPlayheadTime(targetTime);
        waveSurferRef.current?.setTime(targetTime);
        onTimeSelectRef.current?.(targetTime);
        onTimeUpdateRef.current?.(targetTime);
      }
    },
    [currentPlayheadTime, peaks?.duration_seconds, ready, trackDuration],
  );

  const previewDraftRange = useCallback(() => {
    if (!waveSurferRef.current || !draftRange) return;
    const start = draftRange.start;
    const end =
      draftRange.isRange && draftRange.end != null
        ? draftRange.end
        : start + 2;
    previewStopRef.current = end;
    waveSurferRef.current.setTime(start);
    void waveSurferRef.current.play();
  }, [draftRange]);

  const stampCurrentPlayhead = useCallback(() => {
    const rounded = roundAnnotationTime(currentPlayheadTime);
    onDraftRangeChangeRef.current?.({
      start: rounded,
      end: null,
      isRange: false,
    });
  }, [currentPlayheadTime]);

  const progressPercent =
    totalDuration > 0
      ? (clampAudioTime(currentPlayheadTime, totalDuration) / totalDuration) * 100
      : 0;

  if (!audioUrl || !peaks) {
    return (
      <p
        role="status"
        aria-busy="true"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        Preparing waveform…
      </p>
    );
  }

  if (!peaksLoad) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        Waveform data is invalid. Try again after processing finishes.
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {title ? (
        <p className="text-sm font-medium text-black dark:text-zinc-50">{title}</p>
      ) : null}

      {/* Active Annotation Display Banner (rendered above the waveform) */}
      <div className="w-full min-h-[58px] flex items-center">
        {activeAnnotation ? (
          <div
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-blue-500/30 bg-blue-50/90 px-4 py-3 text-blue-950 shadow-sm dark:border-blue-400/20 dark:bg-blue-950/40 dark:text-blue-100 transition-all duration-150"
            role="status"
            aria-live="polite"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white dark:bg-blue-500">
                  Active Note
                </span>
                {activeAnnotation.label ? (
                  <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50 truncate">
                    {activeAnnotation.label}
                  </span>
                ) : null}
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                  {formatDurationSeconds(activeAnnotation.start_seconds)}
                  {activeAnnotation.end_seconds != null &&
                  activeAnnotation.end_seconds > activeAnnotation.start_seconds
                    ? ` – ${formatDurationSeconds(activeAnnotation.end_seconds)}`
                    : ""}
                </span>
                {activeAnnotation.author_username ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    • by @{activeAnnotation.author_username}
                  </span>
                ) : null}
              </div>
              {activeAnnotation.comment ? (
                <p className="text-sm text-zinc-700 dark:text-zinc-300 italic mt-0.5">
                  &ldquo;{activeAnnotation.comment}&rdquo;
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-between rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400"
            aria-hidden="true"
          >
            <span>
              {playing
                ? "Playing track — timestamped notes at the playhead will appear here"
                : "Hit play to preview annotations as the track progresses (Press Space to Play/Pause)"}
            </span>
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              {formatDurationSeconds(currentPlayheadTime)} /{" "}
              {formatDurationSeconds(totalDuration)}
            </span>
          </div>
        )}
      </div>

      {/* Waveform Card with Draggable Tactile Playhead Scrubber */}
      <div className="relative w-full flex flex-col rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
        <div className="relative w-full">
          <div
            ref={containerRef}
            className="w-full bg-zinc-50 shadow-inner dark:bg-zinc-900"
            aria-label={title ? `Waveform for ${title}` : "Audio waveform"}
          />

          {/* Tactile Playhead Scrubber Overlay */}
          {ready && totalDuration > 0 ? (
            <div
              className="absolute inset-0 pointer-events-none z-20 overflow-visible"
              aria-hidden="true"
            >
              <div
                className="absolute top-0 bottom-0 h-full flex flex-col items-center pointer-events-none select-none"
                style={{
                  left: `${progressPercent}%`,
                  transform: "translateX(-50%)",
                }}
              >
                {/* Tactile Playhead Scrubber Handle Knob */}
                <div
                  role="slider"
                  aria-label="Audio playhead scrubber"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(totalDuration)}
                  aria-valuenow={Math.round(currentPlayheadTime)}
                  aria-valuetext={formatDurationSeconds(currentPlayheadTime)}
                  tabIndex={0}
                  title="Drag to scrub audio playhead (Arrow keys to nudge, Shift+Arrow for 5s)"
                  onPointerDown={handlePlayheadPointerDown}
                  onKeyDown={handlePlayheadKeyDown}
                  className={`pointer-events-auto cursor-grab active:cursor-grabbing flex flex-col items-center -mt-0.5 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t ${
                    isScrubbing ? "cursor-grabbing scale-110" : "hover:scale-110"
                  } transition-transform`}
                >
                  {/* Tactile Grab Badge */}
                  <div className="flex h-5 w-6 items-center justify-center rounded-sm bg-zinc-900 text-white shadow-md border border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-300">
                    <div className="flex gap-0.5 items-center justify-center">
                      <span className="w-0.5 h-2.5 bg-zinc-400 dark:bg-zinc-500 rounded-full" />
                      <span className="w-0.5 h-2.5 bg-zinc-400 dark:bg-zinc-500 rounded-full" />
                    </div>
                  </div>
                  {/* Downward Pointer Arrow */}
                  <div className="w-0 h-0 border-x-4 border-x-transparent border-t-[5px] border-t-zinc-900 dark:border-t-zinc-100" />
                </div>

                {/* Vertical Playhead Needle Line */}
                <div className="w-[2px] flex-1 bg-zinc-900 dark:bg-zinc-100 shadow-[0_0_2px_rgba(0,0,0,0.4)]" />
              </div>
            </div>
          ) : null}
        </div>

        {/* Enhanced Annotation Mode Status Bar */}
        {isSelecting ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-blue-200 bg-blue-50/95 px-4 py-2.5 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200">
            <div className="flex items-center gap-2 font-medium">
              <span className="inline-block h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>
                Annotation Mode: Drag across the waveform to highlight a section, or click anywhere for a timestamp point.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={stampCurrentPlayhead}
                className="flex items-center gap-1 rounded border border-blue-300 bg-white/90 px-2.5 py-1 font-medium text-blue-900 shadow-xs transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/60 dark:text-blue-200 dark:hover:bg-blue-900"
                title="Stamp current playback time onto annotation"
              >
                ⏱ Stamp Playhead ({formatDurationSeconds(currentPlayheadTime)})
              </button>

              {draftRange?.isRange && draftRange.end != null ? (
                <button
                  type="button"
                  onClick={previewDraftRange}
                  className="flex items-center gap-1 rounded border border-blue-300 bg-blue-600 px-2.5 py-1 font-medium text-white shadow-xs transition-colors hover:bg-blue-700 dark:border-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
                  title="Play highlighted section"
                >
                  ▶ Preview Section
                </button>
              ) : null}

              {draftRange ? (
                <span className="rounded bg-blue-100/90 px-2.5 py-1 font-mono font-semibold dark:bg-blue-900/60">
                  {draftRange.isRange && draftRange.end != null
                    ? `${formatDurationSeconds(draftRange.start)} – ${formatDurationSeconds(draftRange.end)} (${(draftRange.end - draftRange.start).toFixed(2)}s)`
                    : `${formatDurationSeconds(draftRange.start)} (${draftRange.start.toFixed(2)}s)`}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Audio Playback Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!ready}
            onClick={() => waveSurferRef.current?.playPause()}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <span
            className="text-sm font-mono text-zinc-700 dark:text-zinc-300"
            aria-label="Playback time"
          >
            {formatDurationSeconds(currentPlayheadTime)} /{" "}
            {formatDurationSeconds(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              disabled={!ready}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="w-28 accent-black dark:accent-zinc-50"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={volume}
            />
          </label>
          {!ready ? (
            <span
              role="status"
              aria-busy="true"
              className="text-sm text-zinc-600 dark:text-zinc-400"
            >
              Loading player…
            </span>
          ) : null}
        </div>
      </div>
      <p className="sr-only">
        Click or drag on the waveform to seek and stamp a note time. Volume
        slider adjusts playback level.
      </p>

      {/* Styled custom region handles for high visibility */}
      <style>{`
        .wavesurfer-region[data-id="__draft_annotation__"] {
          border-left: 2px solid #2563eb !important;
          border-right: 2px solid #2563eb !important;
          box-shadow: 0 0 10px rgba(37, 99, 235, 0.25) !important;
        }
        .wavesurfer-region[data-id="__draft_annotation__"] > div[part*="handle"] {
          background-color: #2563eb !important;
          width: 6px !important;
        }
      `}</style>
    </div>
  );
}
