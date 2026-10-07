import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Annotation, Database } from "@audio-tool/shared-types";
import {
  ANNOTATION_ERRORS,
  getLatestAnnotation,
  updateAnnotation,
} from "./annotations";
import {
  detectEditConflict,
  discardDraftForServer,
  reconcileDraftWithServer,
} from "./annotation-realtime";

const FILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AUTHOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Creates an in-memory simulated Postgres table with row-level locking
 * and the `bump_annotation_version` trigger behavior.
 */
function createSimulatedPostgresDb(initialRow: Annotation) {
  let rowState: Annotation = { ...initialRow };
  // Simulated row mutex
  let lockPromise: Promise<void> = Promise.resolve();

  async function acquireLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = lockPromise;
    let resolveLock!: () => void;
    lockPromise = new Promise<void>((res) => {
      resolveLock = res;
    });
    await previous;
    try {
      return await fn();
    } finally {
      resolveLock();
    }
  }

  function createClientForUser(userId: string): SupabaseClient<Database> {
    return {
      auth: {
        getUser: async () => ({
          data: { user: { id: userId } },
          error: null,
        }),
      },
      from: (table: string) => {
        assert.equal(table, "annotations");
        return {
          update: (patch: Record<string, unknown>) => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq: (col: string, val: unknown) => {
                filters[col] = val;
                return builder;
              },
              select: () => builder,
              maybeSingle: async () => {
                return acquireLock(async () => {
                  // Simulate micro network/db latency (e.g. 5ms)
                  await new Promise((r) => setTimeout(r, 5));

                  // Evaluate RLS + OCC filters: id, author_id, version
                  const matchesId = rowState.id === filters.id;
                  const matchesAuthor = rowState.author_id === filters.author_id;
                  const matchesVersion = rowState.version === filters.version;

                  if (matchesId && matchesAuthor && matchesVersion) {
                    // Trigger: bump_annotation_version (version = version + 1)
                    rowState = {
                      ...rowState,
                      ...patch,
                      version: rowState.version + 1,
                      updated_at: new Date().toISOString(),
                    };
                    return { data: { ...rowState }, error: null };
                  }

                  // 0 rows updated
                  return { data: null, error: null };
                });
              },
            };
            return builder;
          },
          select: () => {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq: (col: string, val: unknown) => {
                filters[col] = val;
                return builder;
              },
              maybeSingle: async () => {
                return acquireLock(async () => {
                  if (rowState.id === filters.id) {
                    return { data: { ...rowState }, error: null };
                  }
                  return { data: null, error: null };
                });
              },
            };
            return builder;
          },
        };
      },
    } as unknown as SupabaseClient<Database>;
  }

  return {
    getCurrentRow: () => ({ ...rowState }),
    deleteRow: () => {
      rowState = { ...rowState, id: "deleted" };
    },
    createClientForUser,
  };
}

describe("R7 / T27: Concurrent Write Burst & OCC Conflict Resilience", () => {
  it("rejects stale writes when 5 clients submit simultaneous updates (RK8 sub-500ms)", async () => {
    const initialNote: Annotation = {
      id: NOTE_ID,
      audio_file_id: FILE_ID,
      author_id: AUTHOR_ID,
      start_seconds: 10.0,
      end_seconds: 15.0,
      label: "Initial Chorus",
      comment: "Needs sidechain",
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const simulatedDb = createSimulatedPostgresDb(initialNote);

    // 5 concurrent client requests all attempting to modify version 1 simultaneously
    const clientPayloads = [
      { label: "Chorus (Client 1)", comment: "Edit 1" },
      { label: "Chorus (Client 2)", comment: "Edit 2" },
      { label: "Chorus (Client 3)", comment: "Edit 3" },
      { label: "Chorus (Client 4)", comment: "Edit 4" },
      { label: "Chorus (Client 5)", comment: "Edit 5" },
    ];

    const startTime = Date.now();

    const writeResults = await Promise.all(
      clientPayloads.map((payload) => {
        const client = simulatedDb.createClientForUser(AUTHOR_ID);
        return updateAnnotation(client, {
          id: NOTE_ID,
          version: 1, // All 5 start from version 1
          label: payload.label,
          comment: payload.comment,
        });
      }),
    );

    const elapsedMs = Date.now() - startTime;

    // Requirement RK8: Verify database transaction locks resolve in sub-500ms
    assert.ok(
      elapsedMs < 500,
      `Transaction resolution took ${elapsedMs}ms, expected sub-500ms`,
    );

    // Exactly 1 client must succeed
    const successes = writeResults.filter((res) => res.ok);
    assert.equal(
      successes.length,
      1,
      "Exactly one simultaneous update must succeed",
    );

    // Exactly 4 clients must receive OCC conflict
    const conflicts = writeResults.filter(
      (res) => !res.ok && res.conflict === true,
    );
    assert.equal(
      conflicts.length,
      4,
      "Exactly four concurrent clients must receive OCC conflict",
    );

    // Verify all losing clients receive clear conflict indicator and the winning serverVersion
    for (const conflict of conflicts) {
      if (!conflict.ok) {
        assert.equal(conflict.error, ANNOTATION_ERRORS.conflict);
        assert.equal(conflict.serverVersion, 2);
      }
    }

    // Verify database row state is at version 2 (no silent overwrites)
    const finalRow = simulatedDb.getCurrentRow();
    assert.equal(finalRow.version, 2);
  });

  it("enables losing client to reconcile draft and succeed on second attempt without data loss", async () => {
    const initialNote: Annotation = {
      id: NOTE_ID,
      audio_file_id: FILE_ID,
      author_id: AUTHOR_ID,
      start_seconds: 5.0,
      end_seconds: null,
      label: "Vocal Intro",
      comment: "Too loud",
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const simulatedDb = createSimulatedPostgresDb(initialNote);
    const clientA = simulatedDb.createClientForUser(AUTHOR_ID);
    const clientB = simulatedDb.createClientForUser(AUTHOR_ID);

    // 1. Client A submits update first -> bumps version to 2
    const resA = await updateAnnotation(clientA, {
      id: NOTE_ID,
      version: 1,
      label: "Vocal Intro (Lead)",
      comment: "Fixed gain staging",
    });
    assert.ok(resA.ok);
    assert.equal(resA.annotation.version, 2);

    // 2. Client B had loaded version 1 and submits their draft
    const clientBDraft = {
      label: "Vocal Intro (Autotune)",
      comment: "Retune 20 cents",
    };

    const resBFirst = await updateAnnotation(clientB, {
      id: NOTE_ID,
      version: 1,
      label: clientBDraft.label,
      comment: clientBDraft.comment,
    });

    // Client B is rejected with conflict
    assert.equal(resBFirst.ok, false);
    if (!resBFirst.ok) {
      assert.equal(resBFirst.conflict, true);
      assert.equal(resBFirst.serverVersion, 2);
    }

    // 3. Client B fetches latest server state and reconciles draft
    const latestServer = await getLatestAnnotation(clientB, NOTE_ID);
    assert.ok(latestServer.ok);
    assert.equal(latestServer.annotation.version, 2);

    // Client B chooses to keep local draft text and adopt server version 2
    const reconciled = reconcileDraftWithServer(
      clientBDraft,
      latestServer.annotation,
    );
    assert.equal(reconciled.version, 2);
    assert.equal(reconciled.label, clientBDraft.label);
    assert.equal(reconciled.comment, clientBDraft.comment);

    // 4. Client B re-submits with adopted version 2 -> succeeds!
    const resBSecond = await updateAnnotation(clientB, {
      id: NOTE_ID,
      version: reconciled.version,
      label: reconciled.label,
      comment: reconciled.comment,
    });

    assert.ok(resBSecond.ok);
    assert.equal(resBSecond.annotation.version, 3);
    assert.equal(resBSecond.annotation.label, "Vocal Intro (Autotune)");
    assert.equal(resBSecond.annotation.comment, "Retune 20 cents");

    // Final database state is at version 3
    assert.equal(simulatedDb.getCurrentRow().version, 3);
  });

  it("handles remote deletion collision gracefully", async () => {
    const initialNote: Annotation = {
      id: NOTE_ID,
      audio_file_id: FILE_ID,
      author_id: AUTHOR_ID,
      start_seconds: 2.0,
      end_seconds: 4.0,
      label: "Snare Roll",
      comment: "Snappy",
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const simulatedDb = createSimulatedPostgresDb(initialNote);
    const client = simulatedDb.createClientForUser(AUTHOR_ID);

    // Realtime collision detection when note is deleted
    const conflictCheck = detectEditConflict(
      { id: NOTE_ID, version: 1 },
      "DELETE",
      {
        ...initialNote,
        author_username: "alice",
      },
    );

    assert.equal(conflictCheck.hasConflict, true);
    assert.equal(conflictCheck.reason, "deleted");

    // When deleted in db, update returns missing
    simulatedDb.deleteRow();
    const updateRes = await updateAnnotation(client, {
      id: NOTE_ID,
      version: 1,
      label: "Modified",
    });

    assert.equal(updateRes.ok, false);
    if (!updateRes.ok) {
      assert.equal(updateRes.error, ANNOTATION_ERRORS.missing);
    }
  });

  it("allows discarding draft to adopt server values cleanly", () => {
    const serverNote = {
      version: 5,
      label: "New Hook",
      comment: "Keep this melody",
    };

    const discarded = discardDraftForServer(serverNote);
    assert.deepEqual(discarded, {
      version: 5,
      label: "New Hook",
      comment: "Keep this melody",
    });
  });
});
