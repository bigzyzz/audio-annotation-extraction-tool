"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateAudioFile } from "@/lib/audio-validate";
import { recordUploadedAudio } from "@/app/upload/actions";
import { ActionableErrorAlert } from "@/components/actionable-error-alert";
import { useToast } from "@/components/toast";

const AUDIO_BUCKET = "audio";
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

type Status = "idle" | "validating" | "uploading" | "saving";

type UploadFormProps = {
  onUploaded?: () => void;
};

export function UploadForm({ onUploaded }: UploadFormProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const busy = status !== "idle";

  function choose(next: File | null) {
    setFile(next);
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError("Choose an MP3 or WAV file first.");
      return;
    }

    if (file.size > MAX_AUDIO_BYTES) {
      setError("That file is over the 50 MB limit.");
      return;
    }

    setStatus("validating");
    const check = await validateAudioFile(file);
    if (!check.ok) {
      setStatus("idle");
      setError(check.error);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("idle");
      setError("You need to log in before uploading.");
      return;
    }

    const id = crypto.randomUUID();
    const storagePath = `${user.id}/${id}.${check.format}`;
    const contentType =
      file.type || (check.format === "mp3" ? "audio/mpeg" : "audio/wav");

    setStatus("uploading");
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, file, { contentType, upsert: false });

    if (uploadError) {
      setStatus("idle");
      setError("Couldn't upload the file. Check your connection and try again.");
      return;
    }

    setStatus("saving");
    const recorded = await recordUploadedAudio({
      id,
      filename: file.name,
      storagePath,
      format: check.format,
    });

    if (!recorded.ok) {
      setStatus("idle");
      setError(recorded.error);
      return;
    }

    setStatus("idle");
    const successMsg = `Uploaded “${file.name}”.`;
    setSuccess(successMsg);
    toast.success("Upload successful", `“${file.name}” is now in your library and ready to annotate.`);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    onUploaded?.();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const dropped = event.dataTransfer.files[0];
          if (dropped) choose(dropped);
        }}
        className={`rounded-md border border-dashed px-4 py-8 text-center text-sm transition-colors ${
          dragOver
            ? "border-zinc-900 bg-black/[.04] dark:border-zinc-200 dark:bg-white/[.08]"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <label htmlFor="audio-file" className="cursor-pointer">
          <span className="font-medium text-black dark:text-zinc-50">
            Drop an MP3 or WAV here
          </span>
          <span className="mt-1 block text-zinc-600 dark:text-zinc-400">
            or click to choose a file (max 50 MB)
          </span>
        </label>
        <input
          ref={inputRef}
          id="audio-file"
          name="audio"
          type="file"
          accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/wave"
          disabled={busy}
          className="sr-only"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
        {file && (
          <p className="mt-3 text-zinc-700 dark:text-zinc-300">
            Selected: <span className="font-semibold">{file.name}</span> ({(file.size / (1024 * 1024)).toFixed(1)} MB)
          </p>
        )}
      </div>

      {error && (
        <ActionableErrorAlert
          error={error}
          context="upload"
          onDismiss={() => setError(null)}
        />
      )}

      {success && (
        <div
          role="status"
          className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          <span>{success}</span>
          <Link
            href="/"
            className="font-medium underline hover:text-emerald-950 dark:hover:text-emerald-100"
          >
            View in library →
          </Link>
        </div>
      )}

      {/* Accessible Multi-Phase Progress Spinner */}
      {busy && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200"
        >
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
            <span className="font-semibold">
              {status === "validating"
                ? "Validating audio headers & format…"
                : status === "uploading"
                  ? "Uploading audio file to cloud storage…"
                  : "Registering track in library database…"}
            </span>
          </div>

          {/* Stepper indicators */}
          <div className="flex items-center gap-1.5 pt-1 text-[11px] text-blue-700/80 dark:text-blue-300/80">
            <span className={status === "validating" ? "font-bold text-blue-900 dark:text-blue-100" : ""}>
              1. Validation
            </span>
            <span>→</span>
            <span className={status === "uploading" ? "font-bold text-blue-900 dark:text-blue-100" : ""}>
              2. Upload
            </span>
            <span>→</span>
            <span className={status === "saving" ? "font-bold text-blue-900 dark:text-blue-100" : ""}>
              3. Register
            </span>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !file}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {busy ? (
          <>
            <svg
              className="h-4 w-4 animate-spin text-current"
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
            <span>
              {status === "validating"
                ? "Checking…"
                : status === "uploading"
                  ? "Uploading…"
                  : "Saving…"}
            </span>
          </>
        ) : (
          "Upload"
        )}
      </button>
    </form>
  );
}
