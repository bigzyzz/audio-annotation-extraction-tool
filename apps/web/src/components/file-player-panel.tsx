"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioFile, ExtractionJob, WaveformPeaksDocument } from "@audio-tool/shared-types";
import { createClient } from "@/lib/supabase/client";
import { createSignedPlaybackUrl } from "@/lib/signed-url";
import {
  WaveformPlayer,
  type WaveformPreviewRequest,
  type WaveformSeekRequest,
} from "@/components/waveform-player";
import {
  AnnotationPanel,
  fetchAnnotationsForFile,
  type AnnotationListItem,
  type AnnotationPanelRange,
} from "@/components/annotation-panel";
import { ExtractionPanel } from "@/components/extraction-panel";
import { roundAnnotationTime } from "@/lib/annotations";
import {
  annotationRowFromPayload,
  calculateBackoffDelay,
  evaluateLatencyGrade,
  mergeAnnotationRealtimeEvent,
  reconcileAnnotationsOnReconnect,
  recordLatencySample,
  type AnnotationRealtimeEvent,
  type LatencyTelemetry,
  type RealtimeConnectionStatus,
} from "@/lib/annotation-realtime";
import { CollaboratorPresenceBadge } from "@/components/collaborator-presence";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import {
  parsePresenceState,
  createThrottler,
  type CollaboratorPresence,
} from "@/lib/presence";

const POLL_MS = 2000;
const PLAYHEAD_THROTTLE_MS = 200;

export type FilePlayerRow = Pick<
  AudioFile,
  | "id"
  | "filename"
  | "format"
  | "duration_seconds"
  | "storage_path"
  | "waveform_peaks_path"
>;

type FilePlayerPanelProps = {
  initialFile: FilePlayerRow;
  initialJobs?: ExtractionJob[];
  currentUser?: { id: string; username: string };
};

export function FilePlayerPanel({
  initialFile,
  initialJobs = [],
  currentUser,
}: FilePlayerPanelProps) {
  const [file, setFile] = useState<FilePlayerRow>(initialFile);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<WaveformPeaksDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationListItem[]>([]);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [draftRange, setDraftRange] = useState<AnnotationPanelRange | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<WaveformSeekRequest | null>(
    null,
  );
  const [previewRequest, setPreviewRequest] =
    useState<WaveformPreviewRequest | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [telemetry, setTelemetry] = useState<LatencyTelemetry>({
    lastPingMs: null,
    avgPingMs: null,
    samples: [],
    grade: "offline",
    slaPass: true,
    lastSyncedAt: null,
  });
  const playheadStampRef = useRef(0);
  const seekTokenRef = useRef(0);
  const previewTokenRef = useRef(0);
  const playheadBroadcasterRef = useRef<ReturnType<typeof createThrottler<number>> | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const clientIdRef = useRef<string>(
    currentUser?.id ?? `anon-${initialFile.id.slice(0, 8)}`,
  );

  useEffect(() => {
    playheadBroadcasterRef.current = createThrottler<number>((seconds) => {
      const ch = channelRef.current;
      if (ch && currentUser) {
        void ch.send({
          type: "broadcast",
          event: "playhead",
          payload: {
            userId: currentUser.id,
            username: currentUser.username,
            playheadSeconds: seconds,
            timestamp: Date.now(),
          },
        });
      }
    }, 100);

    return () => {
      playheadBroadcasterRef.current?.cancel();
    };
  }, [currentUser]);

  const loadFile = useCallback(async () => {
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("audio_files")
      .select(
        "id, filename, format, duration_seconds, storage_path, waveform_peaks_path",
      )
      .eq("id", initialFile.id)
      .maybeSingle();

    if (queryError) {
      setError("Couldn't refresh this track. Retrying…");
      return;
    }

    if (!data) {
      setError("This track is no longer available.");
      return;
    }

    setError(null);
    setFile(data);
  }, [initialFile.id]);

  const reconcileServerState = useCallback(async () => {
    const supabase = createClient();
    const result = await fetchAnnotationsForFile(supabase, initialFile.id);
    if (!result.ok) return;
    setAnnotations((current) => {
      const { reconciled } = reconcileAnnotationsOnReconnect(
        current,
        result.annotations,
      );
      return reconciled;
    });
    setTelemetry((prev) => ({
      ...prev,
      lastSyncedAt: Date.now(),
    }));
  }, [initialFile.id]);

  useEffect(() => {
    const needsPoll =
      file.duration_seconds == null || file.waveform_peaks_path == null;
    if (!needsPoll) return;

    const id = window.setInterval(() => {
      void loadFile();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [file.duration_seconds, file.waveform_peaks_path, loadFile]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayback(): Promise<void> {
      const supabase = createClient();
      const audioResult = await createSignedPlaybackUrl(
        supabase,
        file.storage_path,
      );

      if (cancelled) return;

      if (!audioResult.ok) {
        setAudioUrl(null);
        setError(audioResult.error);
        return;
      }

      setAudioUrl(audioResult.url);

      if (!file.waveform_peaks_path) {
        setPeaks(null);
        return;
      }

      const peaksUrlResult = await createSignedPlaybackUrl(
        supabase,
        file.waveform_peaks_path,
      );

      if (cancelled) return;

      if (!peaksUrlResult.ok) {
        setPeaks(null);
        setError(peaksUrlResult.error);
        return;
      }

      try {
        const response = await fetch(peaksUrlResult.url);
        if (!response.ok) {
          throw new Error("fetch failed");
        }
        const document = (await response.json()) as WaveformPeaksDocument;
        if (!cancelled) {
          setPeaks(document);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setPeaks(null);
          setError("Couldn't load waveform data. Try again in a moment.");
        }
      }
    }

    void loadPlayback();

    return () => {
      cancelled = true;
    };
  }, [file.storage_path, file.waveform_peaks_path]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void fetchAnnotationsForFile(supabase, initialFile.id).then((result) => {
      if (cancelled || !result.ok) return;
      setAnnotations(result.annotations);
      setTelemetry((prev) => ({ ...prev, lastSyncedAt: Date.now() }));
    });

    let channel: ReturnType<typeof supabase.channel> | null = null;

    function cleanupChannel() {
      if (channel) {
        channelRef.current = null;
        void supabase.removeChannel(channel);
        channel = null;
      }
    }

    function setupSubscription(attempt = 0) {
      if (cancelled) return;
      cleanupChannel();

      if (attempt > 0) {
        setConnectionStatus("reconnecting");
        setReconnectAttempt(attempt);
      } else {
        setConnectionStatus("connecting");
      }

      channel = supabase.channel(`annotations:${initialFile.id}`, {
        config: {
          presence: {
            key: currentUser?.id ?? clientIdRef.current,
          },
        },
      });
      channelRef.current = channel;

      const syncPresence = () => {
        if (!channel) return;
        const state = channel.presenceState();
        setCollaborators(parsePresenceState(state, currentUser?.id));
      };

      channel
        .on("presence", { event: "sync" }, syncPresence)
        .on("presence", { event: "join" }, syncPresence)
        .on("presence", { event: "leave" }, syncPresence)
        .on("broadcast", { event: "playhead" }, ({ payload }) => {
          if (!payload || typeof payload !== "object") return;
          const { userId, playheadSeconds } = payload as {
            userId?: string;
            playheadSeconds?: number;
          };
          if (userId && typeof playheadSeconds === "number") {
            setCollaborators((prev) =>
              prev.map((c) => (c.userId === userId ? { ...c, playheadSeconds } : c)),
            );
          }
        })
        .on("broadcast", { event: "ping" }, ({ payload }) => {
          if (!payload || typeof payload !== "object") return;
          const { senderId, timestamp } = payload as {
            senderId?: string;
            timestamp?: number;
          };
          // Round-trip latency calculation from self-broadcast echo
          if (senderId === clientIdRef.current && typeof timestamp === "number") {
            const rtt = Math.max(1, Date.now() - timestamp);
            setTelemetry((prev) => {
              const { samples, avgPingMs } = recordLatencySample(prev.samples, rtt);
              const { grade, slaPass } = evaluateLatencyGrade(rtt);
              return {
                ...prev,
                lastPingMs: rtt,
                avgPingMs,
                samples,
                grade,
                slaPass,
              };
            });
          }
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "annotations",
            filter: `audio_file_id=eq.${initialFile.id}`,
          },
          (payload) => {
            const eventType = payload.eventType as AnnotationRealtimeEvent;
            const raw =
              eventType === "DELETE"
                ? (payload.old as Record<string, unknown>)
                : (payload.new as Record<string, unknown>);
            const mapped = annotationRowFromPayload(raw ?? {});
            if (!mapped || mapped.audio_file_id !== initialFile.id) {
              void reconcileServerState();
              return;
            }

            setAnnotations((current) =>
              mergeAnnotationRealtimeEvent(current, eventType, mapped),
            );

            if (eventType !== "DELETE" && !mapped.author_username) {
              void reconcileServerState();
            }
          },
        )
        .subscribe(async (status) => {
          if (cancelled) return;

          if (status === "SUBSCRIBED") {
            setConnectionStatus("connected");
            setReconnectAttempt(0);

            // Re-fetch delta annotations on reconnect to prevent state drift
            if (attempt > 0) {
              void reconcileServerState();
            }

            if (currentUser) {
              await channel?.track({
                userId: currentUser.id,
                username: currentUser.username,
                joinedAt: Date.now(),
                lastActiveAt: Date.now(),
              });
            }
            return;
          }

          if (
            status === "TIMED_OUT" ||
            status === "CLOSED" ||
            status === "CHANNEL_ERROR"
          ) {
            setConnectionStatus("reconnecting");
            const nextAttempt = attempt + 1;
            setReconnectAttempt(nextAttempt);
            const delay = calculateBackoffDelay(nextAttempt);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              setupSubscription(nextAttempt);
            }, delay);
          }
        });
    }

    setupSubscription(0);

    // Heartbeat ping broadcast every 10 seconds (US13)
    pingIntervalRef.current = setInterval(() => {
      const ch = channelRef.current;
      if (ch) {
        void ch.send({
          type: "broadcast",
          event: "ping",
          payload: {
            senderId: clientIdRef.current,
            timestamp: Date.now(),
          },
        });
      }
    }, 10000);

    // Online/offline window listeners
    const handleOnline = () => {
      setupSubscription(1);
      void reconcileServerState();
    };

    const handleOffline = () => {
      setConnectionStatus("disconnected");
    };

    // Tab visibility listener (hibernation recovery)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reconcileServerState();
        if (channelRef.current == null) {
          setupSubscription(1);
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cleanupChannel();
    };
  }, [initialFile.id, reconcileServerState, currentUser]);

  const stampTime = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    playheadBroadcasterRef.current?.invoke(seconds);
  }, []);

  const jumpTo = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    seekTokenRef.current += 1;
    setSeekRequest({ seconds, token: seekTokenRef.current });
    playheadBroadcasterRef.current?.invoke(seconds);
  }, []);

  const onTimeUpdate = useCallback((seconds: number) => {
    const now = Date.now();
    if (now - playheadStampRef.current < PLAYHEAD_THROTTLE_MS) return;
    playheadStampRef.current = now;
    setCurrentTime(seconds);
    playheadBroadcasterRef.current?.invoke(seconds);
  }, []);

  const startAddAnnotation = useCallback(() => {
    setIsSelecting(true);
    setEditingId(null);
    const initialStart = currentTime != null ? roundAnnotationTime(currentTime) : 0;
    setDraftRange({
      start: initialStart,
      end: null,
      isRange: false,
    });
  }, [currentTime]);

  const cancelSelection = useCallback(() => {
    setIsSelecting(false);
    setEditingId(null);
    setDraftRange(null);
  }, []);

  const previewRange = useCallback((start: number, end: number) => {
    previewTokenRef.current += 1;
    setPreviewRequest({ start, end, token: previewTokenRef.current });
  }, []);

  const handleEditingChange = useCallback(
    (id: string | null) => {
      setEditingId(id);
      if (id) {
        setIsSelecting(false);
        const note = annotations.find((a) => a.id === id);
        if (note) {
          const s = Number(note.start_seconds);
          const hasRange = note.end_seconds != null && Number(note.end_seconds) > s;
          setDraftRange({
            start: s,
            end: hasRange ? Number(note.end_seconds) : null,
            isRange: hasRange,
          });
        }
      } else {
        setDraftRange(null);
      }
    },
    [annotations],
  );

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              {file.filename}
            </h1>
            <span className="text-sm uppercase text-zinc-600 dark:text-zinc-400 font-mono">
              {file.format}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SyncStatusIndicator
              status={connectionStatus}
              telemetry={telemetry}
              reconnectAttempt={reconnectAttempt}
              onManualSync={reconcileServerState}
              onManualReconnect={() => {
                setReconnectAttempt(1);
                void reconcileServerState();
              }}
            />
            <CollaboratorPresenceBadge
              collaborators={collaborators}
              currentUserId={currentUser?.id}
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {!file.waveform_peaks_path ? (
          <p
            role="status"
            aria-busy="true"
            className="text-sm text-zinc-600 dark:text-zinc-400"
          >
            Preparing waveform…
          </p>
        ) : null}

        <WaveformPlayer
          audioUrl={audioUrl}
          peaks={peaks}
          title={file.filename}
          annotations={annotations}
          seekRequest={seekRequest}
          previewRequest={previewRequest}
          isSelecting={isSelecting}
          draftRange={draftRange}
          onDraftRangeChange={setDraftRange}
          editingAnnotationId={editingId}
          onTimeSelect={stampTime}
          onTimeUpdate={onTimeUpdate}
        />
      </div>

      <div id="extraction" className="w-full pt-6 border-t border-zinc-200 dark:border-zinc-800">
        <ExtractionPanel
          audioFileId={file.id}
          filename={file.filename}
          format={file.format}
          durationSeconds={file.duration_seconds}
          currentTime={currentTime}
          selectedRange={draftRange}
          isSelecting={isSelecting}
          onStartSelection={startAddAnnotation}
          onCancelSelection={cancelSelection}
          onPreviewRange={previewRange}
          initialJobs={initialJobs}
        />
      </div>

      <div className="w-full pt-6 border-t border-zinc-200 dark:border-zinc-800">
        <AnnotationPanel
          audioFileId={file.id}
          durationSeconds={file.duration_seconds}
          currentTime={currentTime}
          isSelecting={isSelecting}
          onStartAdd={startAddAnnotation}
          onCancelAdd={cancelSelection}
          selectedRange={draftRange}
          onRangeChange={setDraftRange}
          annotations={annotations}
          onNeedRefresh={reconcileServerState}
          onJumpTo={jumpTo}
          onEditingChange={handleEditingChange}
          onPreviewRange={previewRange}
        />
      </div>
    </div>
  );
}
