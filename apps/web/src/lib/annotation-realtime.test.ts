import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnnotationListItem } from "../components/annotation-panel";
import {
  annotationRowFromPayload,
  calculateBackoffDelay,
  detectEditConflict,
  discardDraftForServer,
  evaluateLatencyGrade,
  mergeAnnotationRealtimeEvent,
  reconcileAnnotationsOnReconnect,
  reconcileDraftWithServer,
  recordLatencySample,
} from "./annotation-realtime";

const FILE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function note(
  overrides: Partial<AnnotationListItem> & Pick<AnnotationListItem, "id">,
): AnnotationListItem {
  return {
    audio_file_id: FILE,
    author_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    start_seconds: 1,
    end_seconds: null,
    label: "kick",
    comment: null,
    version: 1,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    author_username: "aziz",
    ...overrides,
  };
}

describe("annotationRowFromPayload", () => {
  it("maps numeric postgres fields and rejects junk rows", () => {
    const mapped = annotationRowFromPayload({
      id: "1",
      audio_file_id: FILE,
      author_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      start_seconds: "1.25",
      end_seconds: null,
      label: "kick",
      comment: null,
      version: "1",
      created_at: "2026-09-17T00:00:00.000Z",
      updated_at: "2026-09-17T00:00:00.000Z",
    });
    assert.equal(mapped?.start_seconds, 1.25);
    assert.equal(mapped?.author_username, null);

    assert.equal(annotationRowFromPayload({ id: "1" }), null);
    assert.equal(
      annotationRowFromPayload({
        id: "1",
        audio_file_id: FILE,
        author_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        start_seconds: "nope",
      }),
      null,
    );
  });
});

describe("mergeAnnotationRealtimeEvent", () => {
  it("inserts, updates, and deletes without duplicating", () => {
    const first = note({ id: "1", start_seconds: 2, label: "snare" });
    const inserted = mergeAnnotationRealtimeEvent(
      [first],
      "INSERT",
      note({ id: "2", start_seconds: 1, label: "kick" }),
    );
    assert.deepEqual(
      inserted.map((row) => row.id),
      ["2", "1"],
    );

    const updated = mergeAnnotationRealtimeEvent(inserted, "UPDATE", {
      ...inserted[0],
      version: 2,
      comment: "quieter",
      author_username: null,
    });
    assert.equal(updated[0].comment, "quieter");
    assert.equal(updated[0].author_username, "aziz");
    assert.equal(updated[0].version, 2);

    const deleted = mergeAnnotationRealtimeEvent(updated, "DELETE", note({ id: "2" }));
    assert.deepEqual(
      deleted.map((row) => row.id),
      ["1"],
    );
  });
});

describe("detectEditConflict", () => {
  it("detects when incoming UPDATE has different version", () => {
    const editing = { id: "note-1", version: 1 };
    const incoming = note({ id: "note-1", version: 2, label: "updated by someone else" });

    const result = detectEditConflict(editing, "UPDATE", incoming);
    assert.equal(result.hasConflict, true);
    assert.equal(result.reason, "version_mismatch");
    assert.equal(result.serverVersion, 2);
    assert.deepEqual(result.serverNote, incoming);
  });

  it("detects when incoming DELETE targets currently editing note", () => {
    const editing = { id: "note-1", version: 1 };
    const incoming = note({ id: "note-1", version: 1 });

    const result = detectEditConflict(editing, "DELETE", incoming);
    assert.equal(result.hasConflict, true);
    assert.equal(result.reason, "deleted");
  });

  it("reports no conflict when versions match on UPDATE", () => {
    const editing = { id: "note-1", version: 2 };
    const incoming = note({ id: "note-1", version: 2 });

    const result = detectEditConflict(editing, "UPDATE", incoming);
    assert.equal(result.hasConflict, false);
  });

  it("reports no conflict for different note IDs or when not editing", () => {
    const editing = { id: "note-1", version: 1 };
    const incoming = note({ id: "note-2", version: 5 });

    assert.equal(detectEditConflict(editing, "UPDATE", incoming).hasConflict, false);
    assert.equal(detectEditConflict(null, "UPDATE", incoming).hasConflict, false);
    assert.equal(detectEditConflict(undefined, "DELETE", incoming).hasConflict, false);
  });
});

describe("reconcileDraftWithServer", () => {
  it("preserves local draft inputs and adopts server version", () => {
    const draft = { label: "my draft label", comment: "my local feedback" };
    const serverNote = { version: 3 };

    const reconciled = reconcileDraftWithServer(draft, serverNote);
    assert.deepEqual(reconciled, {
      label: "my draft label",
      comment: "my local feedback",
      version: 3,
    });
  });
});

describe("discardDraftForServer", () => {
  it("replaces draft inputs with server note fields and version", () => {
    const serverNote = {
      version: 4,
      label: "server label",
      comment: "server comment",
    };

    const discarded = discardDraftForServer(serverNote);
    assert.deepEqual(discarded, {
      label: "server label",
      comment: "server comment",
      version: 4,
    });
  });

  it("converts null server fields to empty strings for form inputs", () => {
    const discarded = discardDraftForServer({
      version: 2,
      label: null,
      comment: null,
    });
    assert.deepEqual(discarded, {
      label: "",
      comment: "",
      version: 2,
    });
  });
});

describe("calculateBackoffDelay", () => {
  it("returns 0 for attempt 0 or negative", () => {
    assert.equal(calculateBackoffDelay(0), 0);
    assert.equal(calculateBackoffDelay(-1), 0);
  });

  it("calculates exponential growth with baseMs", () => {
    // With jitterRatio = 0, delay is exact baseMs * 2^(attempt - 1)
    assert.equal(calculateBackoffDelay(1, 500, 8000, 0), 500);
    assert.equal(calculateBackoffDelay(2, 500, 8000, 0), 1000);
    assert.equal(calculateBackoffDelay(3, 500, 8000, 0), 2000);
    assert.equal(calculateBackoffDelay(4, 500, 8000, 0), 4000);
  });

  it("caps backoff delay at maxMs", () => {
    assert.equal(calculateBackoffDelay(10, 500, 8000, 0), 8000);
    assert.equal(calculateBackoffDelay(20, 500, 5000, 0), 5000);
  });

  it("includes jitter within the specified jitterRatio", () => {
    const delay = calculateBackoffDelay(2, 1000, 8000, 0.25);
    // Base is 2000, jitter up to 500
    assert.ok(delay >= 2000 && delay <= 2500);
  });
});

describe("evaluateLatencyGrade", () => {
  it("grades offline when latency is null", () => {
    const evalResult = evaluateLatencyGrade(null);
    assert.equal(evalResult.grade, "offline");
    assert.equal(evalResult.slaPass, false);
  });

  it("grades optimal when latency is below 300ms", () => {
    const evalResult = evaluateLatencyGrade(120);
    assert.equal(evalResult.grade, "optimal");
    assert.equal(evalResult.slaPass, true);
  });

  it("grades acceptable when latency is between 300ms and 2000ms SLA", () => {
    const evalResult = evaluateLatencyGrade(850);
    assert.equal(evalResult.grade, "acceptable");
    assert.equal(evalResult.slaPass, true);
  });

  it("grades lagging and fails SLA when latency exceeds 2000ms (R7 / RK1)", () => {
    const evalResult = evaluateLatencyGrade(2500);
    assert.equal(evalResult.grade, "lagging");
    assert.equal(evalResult.slaPass, false);
  });
});

describe("recordLatencySample", () => {
  it("adds samples and computes average ping", () => {
    const r1 = recordLatencySample([], 100, 5);
    assert.deepEqual(r1.samples, [100]);
    assert.equal(r1.avgPingMs, 100);

    const r2 = recordLatencySample(r1.samples, 200, 5);
    assert.deepEqual(r2.samples, [100, 200]);
    assert.equal(r2.avgPingMs, 150);
  });

  it("slides window to maxSamples", () => {
    const existing = [10, 20, 30];
    const res = recordLatencySample(existing, 40, 3);
    assert.deepEqual(res.samples, [20, 30, 40]);
    assert.equal(res.avgPingMs, 30);
  });
});

describe("reconcileAnnotationsOnReconnect", () => {
  it("detects newly added server annotations during offline period", () => {
    const local = [note({ id: "1", version: 1, start_seconds: 2 })];
    const server = [
      note({ id: "1", version: 1, start_seconds: 2 }),
      note({ id: "2", version: 1, start_seconds: 5 }),
    ];

    const result = reconcileAnnotationsOnReconnect(local, server);
    assert.equal(result.hasChanged, true);
    assert.equal(result.addedCount, 1);
    assert.equal(result.updatedCount, 0);
    assert.equal(result.removedCount, 0);
    assert.equal(result.reconciled.length, 2);
  });

  it("detects modified annotations with bumped versions", () => {
    const local = [note({ id: "1", version: 1, comment: "old" })];
    const server = [note({ id: "1", version: 2, comment: "updated while offline" })];

    const result = reconcileAnnotationsOnReconnect(local, server);
    assert.equal(result.hasChanged, true);
    assert.equal(result.addedCount, 0);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.removedCount, 0);
    assert.equal(result.reconciled[0].version, 2);
  });

  it("detects deleted annotations removed on server", () => {
    const local = [
      note({ id: "1", version: 1 }),
      note({ id: "2", version: 1 }),
    ];
    const server = [note({ id: "1", version: 1 })];

    const result = reconcileAnnotationsOnReconnect(local, server);
    assert.equal(result.hasChanged, true);
    assert.equal(result.addedCount, 0);
    assert.equal(result.updatedCount, 0);
    assert.equal(result.removedCount, 1);
    assert.equal(result.reconciled.length, 1);
  });

  it("reports hasChanged: false when state is already identical", () => {
    const local = [note({ id: "1", version: 1 })];
    const server = [note({ id: "1", version: 1 })];

    const result = reconcileAnnotationsOnReconnect(local, server);
    assert.equal(result.hasChanged, false);
    assert.equal(result.addedCount, 0);
    assert.equal(result.updatedCount, 0);
    assert.equal(result.removedCount, 0);
  });
});


