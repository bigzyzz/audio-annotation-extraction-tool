"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WaveformPeaksDocument } from "@audio-tool/shared-types";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import { peaksDocumentToWaveSurferLoad } from "@/lib/waveform-peaks-client";
import { formatDurationSeconds } from "@/lib/format-duration";
import {
  annotationToRegionParams,
  clickRatioToAudioTime,
  findActiveAnnotation,
  type ActiveAnnotationCandidate,
  type WaveformAnnotationMarker,
} from "@/lib/waveform-markers";

export type WaveformSeekRequest = {
  seconds: number;
  token: number;
};

export type WaveformPlayerProps = {
  audioUrl: string | null;
  peaks: WaveformPeaksDocument | null;
  title?: string;
  annotations?: (WaveformAnnotationMarker & Partial<ActiveAnnotationCandidate>)[];
  seekRequest?: WaveformSeekRequest | null;
  onTimeSelect?: (seconds: number) => void;
  onTimeUpdate?: (seconds: number) => void;
};

export function WaveformPlayer({
  audioUrl,
  peaks,
  title,
  annotations = [],
  seekRequest = null,
  onTimeSelect,
  onTimeUpdate,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const onTimeSelectRef = useRef(onTimeSelect);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentPlayheadTime, setCurrentPlayheadTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onTimeSelectRef.current = onTimeSelect;
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeSelect, onTimeUpdate]);

  const peaksLoad = useMemo(() => {
    if (!peaks) return null;
    try {
      return peaksDocumentToWaveSurferLoad(peaks);
    } catch {
      return null;
    }
  }, [peaks]);

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

    const waveSurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 160,
      waveColor: "#a1a1aa",
      progressColor: "#18181b",
      cursorColor: "#18181b",
      barWidth: 2,
      barGap: 1,
      normalize: true,
      interact: true,
      dragToSeek: true,
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
      waveSurfer.on("pause", () => setPlaying(false)),
      waveSurfer.on("finish", () => {
        setPlaying(false);
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
      }),
      waveSurfer.on("timeupdate", (currentTime) => {
        setCurrentPlayheadTime(currentTime);
        onTimeUpdateRef.current?.(currentTime);
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

  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !ready) return;
    regions.clearRegions();
    for (const note of annotations) {
      regions.addRegion(annotationToRegionParams(note));
    }
  }, [annotations, ready]);

  useEffect(() => {
    if (!ready || seekRequest == null) return;
    waveSurferRef.current?.setTime(seekRequest.seconds);
  }, [ready, seekRequest]);

  const activeAnnotation = useMemo(() => {
    return findActiveAnnotation(
      annotations as ActiveAnnotationCandidate[],
      currentPlayheadTime,
      playing,
    );
  }, [annotations, currentPlayheadTime, playing]);

  const totalDuration = trackDuration || peaks?.duration_seconds || 0;

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
                  {activeAnnotation.end_seconds != null && activeAnnotation.end_seconds > activeAnnotation.start_seconds
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
                : "Hit play to preview annotations as the track progresses"}
            </span>
            <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
              {formatDurationSeconds(currentPlayheadTime)} / {formatDurationSeconds(totalDuration)}
            </span>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 shadow-inner dark:border-zinc-800 dark:bg-zinc-900"
        aria-label={title ? `Waveform for ${title}` : "Audio waveform"}
      />

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
          <span className="text-sm font-mono text-zinc-700 dark:text-zinc-300" aria-label="Playback time">
            {formatDurationSeconds(currentPlayheadTime)} / {formatDurationSeconds(totalDuration)}
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
    </div>
  );
}
