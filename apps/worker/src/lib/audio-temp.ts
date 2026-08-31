import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { supabase } from "./supabase.js";

const AUDIO_BUCKET = "audio";

export type TempAudioFile = {
  id: string;
  storage_path: string;
  format: string;
};

export async function downloadAudioToTemp(file: TempAudioFile): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .download(file.storage_path);

  if (error || !data) {
    throw new Error(error?.message ?? "Storage download returned no data");
  }

  const dir = await mkdtemp(join(tmpdir(), "audio-worker-"));
  const ext = file.format === "wav" ? "wav" : "mp3";
  const filePath = join(dir, `${file.id}.${ext}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await writeFile(filePath, bytes);
  return filePath;
}

export async function removeTempAudioDir(tempPath: string): Promise<void> {
  await rm(dirname(tempPath), { recursive: true, force: true });
}
