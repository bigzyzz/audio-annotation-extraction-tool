import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FilePlayerPanel } from "@/components/file-player-panel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function FilePage({ params }: FilePageProps) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: file } = await supabase
    .from("audio_files")
    .select(
      "id, filename, format, duration_seconds, storage_path, waveform_peaks_path",
    )
    .eq("id", id)
    .maybeSingle();

  if (!file) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <Link
        href="/"
        className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Back to library
      </Link>
      <FilePlayerPanel initialFile={file} />
    </main>
  );
}
