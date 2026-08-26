"use client";

import { useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateAudioFile } from "@/lib/audio-validate";
import { recordUploadedAudio } from "@/app/upload/actions";

const AUDIO_BUCKET = "audio";
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

type Status = "idle" | "validating" | "uploading" | "saving";

function statusLabel(status: Status): string | null {
  switch (status) {
    case "validating":
      return "Checking file…";
    case "uploading":
      return "Uploading…";
    case "saving":
      return "Saving…";
    default:
      return null;
  }
}

export function UploadForm() {
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
    setSuccess(`Uploaded “${file.name}”.`);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
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
        className={`rounded-md border border-dashed px-4 py-8 text-center text-sm ${
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
            Selected: {file.name}
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {success}
        </p>
      )}

      {statusLabel(status) && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {statusLabel(status)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !file}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {busy ? statusLabel(status) : "Upload"}
      </button>
    </form>
  );
}
