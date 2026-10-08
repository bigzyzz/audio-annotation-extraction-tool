"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXTRACTION_ERRORS,
  validateExtractionStoragePath,
} from "@/lib/extraction";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIO_BUCKET = "audio";

export type DeleteExtractionActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type ClearExtractionActionResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: string };

/**
 * Server Action: Deletes an extraction job and its storage artifacts.
 * Verifies that the authenticated caller either requested the extraction
 * or owns the parent audio file.
 */
export async function deleteExtractionJobAction(
  jobId: string,
): Promise<DeleteExtractionActionResult> {
  const trimmedJobId = jobId?.trim();
  if (!trimmedJobId || !UUID_RE.test(trimmedJobId)) {
    return { ok: false, error: EXTRACTION_ERRORS.invalidJobId };
  }

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return { ok: false, error: EXTRACTION_ERRORS.login };
  }

  const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : userClient;

  // 1. Fetch job to inspect ownership and storage path
  const { data: job, error: jobError } = await adminClient
    .from("extraction_jobs")
    .select("id, audio_file_id, requested_by, output_path")
    .eq("id", trimmedJobId)
    .maybeSingle();

  if (jobError || !job) {
    return { ok: false, error: EXTRACTION_ERRORS.jobNotFound };
  }

  // 2. Verify authorization: user requested the job OR owns the audio file
  let isAuthorized = job.requested_by === user.id;
  if (!isAuthorized) {
    const { data: file } = await adminClient
      .from("audio_files")
      .select("owner_id")
      .eq("id", job.audio_file_id)
      .maybeSingle();

    if (file && file.owner_id === user.id) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return {
      ok: false,
      error: "You do not have permission to delete this extraction.",
    };
  }

  // 3. Remove files from storage if output_path is set
  if (job.output_path) {
    const pathValidation = validateExtractionStoragePath(job.output_path);
    if (pathValidation.ok) {
      await adminClient.storage
        .from(AUDIO_BUCKET)
        .remove([pathValidation.audioPath, pathValidation.metadataPath])
        .catch(() => null);
    }
  }

  // 4. Delete the job record
  const { error: deleteError } = await adminClient
    .from("extraction_jobs")
    .delete()
    .eq("id", trimmedJobId);

  if (deleteError) {
    return {
      ok: false,
      error: deleteError.message ?? EXTRACTION_ERRORS.deleteJob,
    };
  }

  return { ok: true };
}

/**
 * Server Action: Clears extraction jobs for an audio file.
 * File owners can clear all extractions for the file; non-owners can only clear their own.
 */
export async function clearExtractionJobsAction(
  audioFileId: string,
): Promise<ClearExtractionActionResult> {
  const trimmedFileId = audioFileId?.trim();
  if (!trimmedFileId || !UUID_RE.test(trimmedFileId)) {
    return { ok: false, error: EXTRACTION_ERRORS.invalidFileId };
  }

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return { ok: false, error: EXTRACTION_ERRORS.login };
  }

  const adminClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : userClient;

  // Check file ownership
  const { data: file } = await adminClient
    .from("audio_files")
    .select("owner_id")
    .eq("id", trimmedFileId)
    .maybeSingle();

  const isOwner = file?.owner_id === user.id;

  let jobsQuery = adminClient
    .from("extraction_jobs")
    .select("id, output_path")
    .eq("audio_file_id", trimmedFileId);

  if (!isOwner) {
    jobsQuery = jobsQuery.eq("requested_by", user.id);
  }

  const { data: jobs, error: fetchError } = await jobsQuery;
  if (fetchError) {
    return { ok: false, error: fetchError.message ?? EXTRACTION_ERRORS.fetchJobs };
  }

  if (!jobs || jobs.length === 0) {
    return { ok: true, deletedCount: 0 };
  }

  // Remove storage artifacts
  const pathsToRemove: string[] = [];
  for (const j of jobs) {
    if (j.output_path) {
      const v = validateExtractionStoragePath(j.output_path);
      if (v.ok) {
        pathsToRemove.push(v.audioPath, v.metadataPath);
      }
    }
  }

  if (pathsToRemove.length > 0) {
    await adminClient.storage
      .from(AUDIO_BUCKET)
      .remove(pathsToRemove)
      .catch(() => null);
  }

  // Delete records
  const jobIds = jobs.map((j) => j.id);
  const { error: deleteError } = await adminClient
    .from("extraction_jobs")
    .delete()
    .in("id", jobIds);

  if (deleteError) {
    return { ok: false, error: deleteError.message ?? EXTRACTION_ERRORS.deleteJob };
  }

  return { ok: true, deletedCount: jobIds.length };
}
