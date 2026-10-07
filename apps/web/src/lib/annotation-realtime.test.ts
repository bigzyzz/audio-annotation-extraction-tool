import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnnotationListItem } from "../components/annotation-panel";
import {
  annotationRowFromPayload,
  detectEditConflict,
  discardDraftForServer,
  mergeAnnotationRealtimeEvent,
  reconcileDraftWithServer,
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

