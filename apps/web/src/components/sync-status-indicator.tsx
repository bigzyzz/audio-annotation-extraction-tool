"use client";

import { useState } from "react";
import type {
  LatencyTelemetry,
  RealtimeConnectionStatus,
} from "@/lib/annotation-realtime";

export type SyncStatusIndicatorProps = {
  status: RealtimeConnectionStatus;
  telemetry: LatencyTelemetry;
  reconnectAttempt?: number;
  onManualSync?: () => void;
  onManualReconnect?: () => void;
};

export function SyncStatusIndicator({
  status,
  telemetry,
  reconnectAttempt = 0,
  onManualSync,
  onManualReconnect,
}: SyncStatusIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSyncClick() {
    if (!onManualSync || isSyncing) return;
    setIsSyncing(true);
    try {
      await onManualSync();
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  }

  // Visual status indicators
  const isConnected = status === "connected";
  const isReconnecting = status === "reconnecting";
  const isDisconnected = status === "disconnected";

  const pingMs = telemetry.lastPingMs ?? telemetry.avgPingMs;

  const dotColor = isConnected
    ? telemetry.grade === "optimal"
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
      : telemetry.grade === "acceptable"
        ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
        : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
    : isReconnecting
      ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
      : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]";

  const statusLabel = isConnected
    ? pingMs != null
      ? `${pingMs}ms`
      : "Live"
    : isReconnecting
      ? reconnectAttempt > 0
        ? `Reconnecting (${reconnectAttempt})`
        : "Reconnecting…"
      : isDisconnected
        ? "Offline"
        : "Connecting…";

  const accessibleTitle = isConnected
    ? `Realtime sync active. Latency: ${pingMs != null ? `${pingMs}ms` : "unknown"}. SLA: ${telemetry.slaPass ? "Passing (<2.0s)" : "Exceeded"}.`
    : isReconnecting
      ? `Realtime connection lost. Reconnecting attempt ${reconnectAttempt}.`
      : `Realtime connection offline.`;

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-medium text-zinc-700 shadow-2xs backdrop-blur-xs transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
        title={accessibleTitle}
        aria-label={accessibleTitle}
        aria-expanded={isOpen}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${dotColor}`}
          aria-hidden="true"
        />
        <span className="font-mono text-[11px] leading-none">{statusLabel}</span>
      </button>

      {isOpen ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="status"
            className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-xl border border-zinc-200 bg-white p-4 shadow-lg ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-white/10"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Sync Telemetry (R7)
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                  isConnected
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {status}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 text-xs text-zinc-600 dark:text-zinc-300">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 dark:text-zinc-400">Round-trip Ping:</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                  {pingMs != null ? `${pingMs}ms` : "–"}
                  {telemetry.avgPingMs != null ? (
                    <span className="text-[11px] text-zinc-400 ml-1">
                      (avg {telemetry.avgPingMs}ms)
                    </span>
                  ) : null}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500 dark:text-zinc-400">Sync SLA (&lt;2.0s):</span>
                <span
                  className={`font-medium ${
                    telemetry.slaPass
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {telemetry.slaPass ? "✓ SLA Verified" : "⚠️ Lagging (&gt;2.0s)"}
                </span>
              </div>

              {reconnectAttempt > 0 ? (
                <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                  <span>Reconnections:</span>
                  <span className="font-mono">{reconnectAttempt} attempts</span>
                </div>
              ) : null}

              <div className="flex justify-between items-center">
                <span className="text-zinc-500 dark:text-zinc-400">Last Synced:</span>
                <span className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">
                  {telemetry.lastSyncedAt
                    ? new Date(telemetry.lastSyncedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "–"}
                </span>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              {onManualSync ? (
                <button
                  type="button"
                  onClick={handleSyncClick}
                  disabled={isSyncing}
                  className="flex-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isSyncing ? "Syncing…" : "Reconcile Now"}
                </button>
              ) : null}

              {(isDisconnected || isReconnecting) && onManualReconnect ? (
                <button
                  type="button"
                  onClick={onManualReconnect}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Reconnect
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
