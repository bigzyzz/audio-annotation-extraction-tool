import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnnotationListItem } from "../components/annotation-panel";
import {
  annotationRowFromPayload,
  mergeAnnotationRealtimeEvent,
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
