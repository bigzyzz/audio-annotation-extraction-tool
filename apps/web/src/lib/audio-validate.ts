/**
 * R1 / T2: client-side MP3/WAV gate (US5, RK14).
 * Extension AND MIME AND magic bytes must all agree. T3 calls this
 * before any Storage upload / audio_files insert.
 */

export type AudioFormat = "mp3" | "wav";

export type AudioValidationOk = { ok: true; format: AudioFormat };
export type AudioValidationErr = { ok: false; error: string };
export type AudioValidationResult = AudioValidationOk | AudioValidationErr;

const FORMAT_BY_EXT: Record<string, AudioFormat> = {
  ".mp3": "mp3",
  ".wav": "wav",
};

const MIME_BY_FORMAT: Record<AudioFormat, ReadonlySet<string>> = {
  mp3: new Set(["audio/mpeg", "audio/mp3", "audio/x-mpeg"]),
  wav: new Set([
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/vnd.wave",
  ]),
};

const HEADER_BYTES = 12;

const ERRORS = {
  extension: "Only MP3 and WAV files are allowed.",
  mime: "This file's type doesn't match a real MP3 or WAV.",
  tooSmall: "This file is too small to be a valid audio file.",
  magic:
    "This doesn't look like a real MP3 or WAV. The file contents don't match the extension.",
} as const;

export function extensionOf(filename: string): string {
  const base = filename.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot);
}

function sniffMagic(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length >= 12) {
    const riff =
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46;
    const wave =
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45;
    if (riff && wave) return "wav";
  }

  if (bytes.length >= 3) {
    const id3 =
      bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    if (id3) return "mp3";
  }

  // MPEG frame sync: 0xFF 0xE? (11-bit sync).
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "mp3";
  }

  return null;
}

export async function validateAudioFile(
  file: File,
): Promise<AudioValidationResult> {
  const ext = extensionOf(file.name);
  const format = FORMAT_BY_EXT[ext];
  if (!format) {
    return { ok: false, error: ERRORS.extension };
  }

  const mime = file.type.trim().toLowerCase();
  if (mime.length > 0 && !MIME_BY_FORMAT[format].has(mime)) {
    return { ok: false, error: ERRORS.mime };
  }

  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  if (header.byteLength < 2) {
    return { ok: false, error: ERRORS.tooSmall };
  }

  const sniffed = sniffMagic(header);
  if (sniffed !== format) {
    return { ok: false, error: ERRORS.magic };
  }

  return { ok: true, format };
}
