"use client";

import { useCallback, useEffect, useState } from "react";
import type { AudioFile, WaveformPeaksDocument } from "@audio-tool/shared-types";
import { createClient } from "@/lib/supabase/client";
import { createSignedPlaybackUrl } from "@/lib/signed-url";
import { WaveformPlayer } from "@/components/waveform-player";

const POLL_MS = 2000;

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

  return (
    <div className="flex flex-col gap-6">
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
        <p role="status" aria-busy="true" className="text-sm text-zinc-600 dark:text-zinc-400">
          Preparing waveform…
        </p>
      ) : null}

      <WaveformPlayer audioUrl={audioUrl} peaks={peaks} title={file.filename} />
    </div>
  );
}
