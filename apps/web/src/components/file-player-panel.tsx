"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioFile, WaveformPeaksDocument } from "@audio-tool/shared-types";
import { createClient } from "@/lib/supabase/client";
import { createSignedPlaybackUrl } from "@/lib/signed-url";
import {
  WaveformPlayer,
  type WaveformSeekRequest,
} from "@/components/waveform-player";
import {
  AnnotationPanel,
  fetchAnnotationsForFile,
  type AnnotationListItem,
} from "@/components/annotation-panel";
import {
  annotationRowFromPayload,
  mergeAnnotationRealtimeEvent,
  type AnnotationRealtimeEvent,
} from "@/lib/annotation-realtime";

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
};

export function FilePlayerPanel({ initialFile }: FilePlayerPanelProps) {
  const [file, setFile] = useState<FilePlayerRow>(initialFile);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<WaveformPeaksDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationListItem[]>([]);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [seekRequest, setSeekRequest] = useState<WaveformSeekRequest | null>(
    null,
  );
  const playheadStampRef = useRef(0);
  const seekTokenRef = useRef(0);

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

  const loadNotes = useCallback(async () => {
    const supabase = createClient();
    const result = await fetchAnnotationsForFile(supabase, initialFile.id);
    if (!result.ok) return;
    setAnnotations(result.annotations);
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
    });

    const channel = supabase
      .channel(`annotations:${initialFile.id}`)
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
            void loadNotes();
            return;
          }

          setAnnotations((current) =>
            mergeAnnotationRealtimeEvent(current, eventType, mapped),
          );

          if (eventType !== "DELETE" && !mapped.author_username) {
            void loadNotes();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [initialFile.id, loadNotes]);

  const stampTime = useCallback((seconds: number) => {
    setCurrentTime(seconds);
  }, []);

  const jumpTo = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    seekTokenRef.current += 1;
    setSeekRequest({ seconds, token: seekTokenRef.current });
  }, []);

  const onTimeUpdate = useCallback((seconds: number) => {
    const now = Date.now();
    if (now - playheadStampRef.current < PLAYHEAD_THROTTLE_MS) return;
    playheadStampRef.current = now;
    setCurrentTime(seconds);
  }, []);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {file.filename}
          </h1>
          <span className="text-sm uppercase text-zinc-600 dark:text-zinc-400">
            {file.format}
          </span>
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
          onTimeSelect={stampTime}
          onTimeUpdate={onTimeUpdate}
        />
      </div>

      <div className="w-full lg:max-w-sm">
        <AnnotationPanel
          audioFileId={file.id}
          currentTime={currentTime}
          annotations={annotations}
          onNeedRefresh={loadNotes}
          onJumpTo={jumpTo}
        />
      </div>
    </div>
  );
}
