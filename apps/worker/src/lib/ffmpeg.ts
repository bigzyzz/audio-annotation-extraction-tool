import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

export function getFfmpegBinaryPath(): string {
  return process.env.FFMPEG_PATH || ffmpegInstaller?.path || "ffmpeg";
}

export function getFfprobeBinaryPath(): string {
  return process.env.FFPROBE_PATH || ffprobeInstaller?.path || "ffprobe";
}

// Configure fluent-ffmpeg with binary paths
if (getFfmpegBinaryPath()) {
  ffmpeg.setFfmpegPath(getFfmpegBinaryPath());
}
if (getFfprobeBinaryPath()) {
  ffmpeg.setFfprobePath(getFfprobeBinaryPath());
}

export interface AudioMetadata {
  durationSeconds: number;
  sampleRate: number;
  codec: string;
  format: string;
}

// Thin wrapper around ffprobe (via fluent-ffmpeg) — never hand-roll audio
// container/codec parsing. Extraction logic (sample-accurate WAV cuts,
// frame-boundary-safe MP3 stream copy) is added alongside the job pipeline,
// not part of this scaffold.
export function probeAudio(filePath: string): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);

      const audioStream = data.streams.find((s) => s.codec_type === "audio");
      if (!audioStream) {
        return reject(new Error(`No audio stream found in ${filePath}`));
      }

      resolve({
        durationSeconds: data.format.duration ?? 0,
        sampleRate: Number(audioStream.sample_rate ?? 0),
        codec: audioStream.codec_name ?? "unknown",
        format: data.format.format_name ?? "unknown",
      });
    });
  });
}
