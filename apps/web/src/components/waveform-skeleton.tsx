"use client";

import React from "react";

export type WaveformSkeletonProps = {
  filename?: string;
  format?: string;
  durationSeconds?: number | null;
  message?: string;
};

// Deterministic mock bar heights (percentage) for an authentic waveform silhouette
const SKELETON_BAR_HEIGHTS = [
  25, 40, 65, 30, 80, 50, 95, 70, 45, 85, 60, 30, 75, 90, 40, 60,
  85, 55, 35, 70, 90, 65, 45, 80, 60, 40, 95, 75, 50, 30, 85, 60,
  40, 70, 90, 55, 35, 80, 65, 45, 90, 75, 40, 60, 85, 50, 30, 65,
];

export function WaveformSkeleton({
  filename,
  format,
  message = "Analyzing audio & generating waveform peaks in background…",
}: WaveformSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Generating waveform peaks"
      className="flex w-full flex-col gap-4"
    >
      {/* File Title Header placeholder */}
      {filename ? (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {filename}
          </span>
          {format ? (
            <span className="font-mono text-xs uppercase text-zinc-500">
              ({format})
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Active status banner */}
      <div className="flex w-full items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 text-xs text-blue-900 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-200">
        <div className="flex items-center gap-2.5">
          <svg
            className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="font-medium">{message}</span>
        </div>
        <span className="hidden sm:inline text-[11px] text-blue-700/80 dark:text-blue-300/80">
          Worker processing • Auto-refreshing
        </span>
      </div>

      {/* Waveform Card Skeleton */}
      <div className="relative w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {/* Pulsing Waveform Peak Bars */}
        <div className="flex h-40 w-full items-center justify-between gap-1 bg-zinc-50 px-4 py-6 dark:bg-zinc-900/60">
          {SKELETON_BAR_HEIGHTS.map((height, idx) => (
            <div
              key={idx}
              className="w-full rounded-full bg-zinc-300/70 animate-pulse dark:bg-zinc-700/60"
              style={{
                height: `${height}%`,
                animationDelay: `${(idx % 12) * 80}ms`,
                animationDuration: "1.4s",
              }}
            />
          ))}
        </div>

        {/* Transport Controls Skeleton Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3">
            {/* Play Button Skeleton */}
            <div className="h-8 w-8 rounded-full bg-zinc-200 animate-pulse dark:bg-zinc-800" />
            {/* Time Readout Skeleton */}
            <div className="h-4 w-24 rounded bg-zinc-200 animate-pulse dark:bg-zinc-800" />
          </div>

          <div className="flex items-center gap-3">
            {/* Volume Icon + Slider Skeleton */}
            <div className="h-4 w-4 rounded bg-zinc-200 animate-pulse dark:bg-zinc-800" />
            <div className="h-2 w-20 rounded bg-zinc-200 animate-pulse dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
