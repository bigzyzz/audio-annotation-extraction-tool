"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WaveformPeaksDocument } from "@audio-tool/shared-types";
import WaveSurfer from "wavesurfer.js";
import { peaksDocumentToWaveSurferLoad } from "@/lib/waveform-peaks-client";

export type WaveformPlayerProps = {
  audioUrl: string | null;
  peaks: WaveformPeaksDocument | null;
  title?: string;
};

export function WaveformPlayer({ audioUrl, peaks, title }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);

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
      height: 96,
      waveColor: "#a1a1aa",
      progressColor: "#18181b",
      cursorColor: "#18181b",
      barWidth: 2,
      barGap: 1,
      normalize: true,
      interact: true,
    });

    waveSurferRef.current = waveSurfer;

    const unsubscribers = [
      waveSurfer.on("ready", () => {
        if (!cancelled) setReady(true);
      }),
      waveSurfer.on("play", () => setPlaying(true)),
      waveSurfer.on("pause", () => setPlaying(false)),
      waveSurfer.on("finish", () => setPlaying(false)),
      waveSurfer.on("error", () => {
        if (!cancelled) {
          setError("Couldn't load audio for playback. Try again.");
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
    };
  }, [audioUrl, peaksLoad]);

  useEffect(() => {
    waveSurferRef.current?.setVolume(volume);
  }, [volume]);

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
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
        aria-label={title ? `Waveform for ${title}` : "Audio waveform"}
      />
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!ready}
          onClick={() => waveSurferRef.current?.playPause()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "Pause" : "Play"}
        </button>
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
            className="w-32 accent-black dark:accent-zinc-50"
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
      <p className="sr-only">
        Click or drag on the waveform to seek. Volume slider adjusts playback
        level.
      </p>
    </div>
  );
}
