import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Annotation, Database } from "@audio-tool/shared-types";
import {
  ANNOTATION_ERRORS,
  createAnnotation,
  deleteAnnotation,
  normalizeAnnotationText,
  roundAnnotationTime,
  updateAnnotation,
  validateAnnotationTimes,
} from "./annotations";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function sampleAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: NOTE,
    audio_file_id: FILE,
    author_id: USER,
    start_seconds: 1.25,
    end_seconds: null,
    label: "kick",
    comment: "too loud",
    version: 1,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type MockOptions = {
  user?: { id: string } | null;
  onInsert?: (row: Record<string, unknown>) => QueryResult;
  onUpdate?: (
    row: Record<string, unknown>,
    filters: Record<string, unknown>,
  ) => QueryResult;
  onDelete?: (filters: Record<string, unknown>) => QueryResult;
  onSelect?: (columns: string, filters: Record<string, unknown>) => QueryResult;
};

function filterBuilder(
  run: (filters: Record<string, unknown>) => Promise<QueryResult> | QueryResult,
) {
  const filters: Record<string, unknown> = {};
  const builder = {
    eq(column: string, value: unknown) {
      filters[column] = value;
      return builder;
    },
    select(columns = "*") {
      return filterBuilder((next) =>
        run({ ...filters, __select: columns, ...next }),
      );
    },
    maybeSingle() {
      return Promise.resolve(run(filters));
    },
    then(
      onfulfilled?: (value: QueryResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(run(filters)).then(onfulfilled, onrejected);
    },
  };
  return builder;
}

function mockSupabase(options: MockOptions): SupabaseClient<Database> {
  return {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? { id: USER } : options.user },
        error: null,
      }),
    },
    from: (table: string) => {
      assert.equal(table, "annotations");
      return {
        insert(row: Record<string, unknown>) {
          return filterBuilder(() => {
            assert.ok(options.onInsert, "unexpected insert");
            return options.onInsert(row);
          });
        },
        update(row: Record<string, unknown>) {
          return filterBuilder((filters) => {
            assert.ok(options.onUpdate, "unexpected update");
            return options.onUpdate(row, filters);
          });
        },
        delete() {
          return filterBuilder((filters) => {
            assert.ok(options.onDelete, "unexpected delete");
            return options.onDelete(filters);
          });
        },
        select(columns: string) {
          return filterBuilder((filters) => {
            assert.ok(options.onSelect, "unexpected select");
            return options.onSelect(columns, filters);
          });
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

describe("roundAnnotationTime", () => {
  it("rounds to two decimal seconds", () => {
    assert.equal(roundAnnotationTime(1.234), 1.23);
    assert.equal(roundAnnotationTime(1.235), 1.24);
  });
});

describe("normalizeAnnotationText", () => {
  it("trims and treats blank as null", () => {
    assert.equal(normalizeAnnotationText("  kick  "), "kick");
    assert.equal(normalizeAnnotationText("   "), null);
    assert.equal(normalizeAnnotationText(null), null);
  });
});

describe("validateAnnotationTimes", () => {
  it("accepts a point and a range", () => {
    assert.deepEqual(validateAnnotationTimes(1.234, null), {
      ok: true,
      start: 1.23,
      end: null,
    });
    assert.deepEqual(validateAnnotationTimes(1, 2.5), {
      ok: true,
      start: 1,
      end: 2.5,
    });
  });

  it("rejects negative start and end-before-start", () => {
    assert.deepEqual(validateAnnotationTimes(-0.01, null), {
      ok: false,
      error: ANNOTATION_ERRORS.start,
    });
    assert.deepEqual(validateAnnotationTimes(4, 3), {
      ok: false,
      error: ANNOTATION_ERRORS.times,
    });
  });
});

describe("createAnnotation", () => {
  it("inserts a row for the signed-in author", async () => {
    const created = sampleAnnotation();
    const result = await createAnnotation(
      mockSupabase({
        onInsert: (row) => {
          assert.equal(row.audio_file_id, FILE);
          assert.equal(row.author_id, USER);
          assert.equal(row.start_seconds, 1.25);
          assert.equal(row.end_seconds, null);
          assert.equal(row.label, "kick");
          assert.equal(row.comment, "too loud");
          return { data: created, error: null };
        },
      }),
      {
        audioFileId: FILE,
        startSeconds: 1.25,
        label: "kick",
        comment: "too loud",
      },
    );

    assert.deepEqual(result, { ok: true, annotation: created });
  });

  it("rejects empty label+comment and missing session", async () => {
    const empty = await createAnnotation(mockSupabase({}), {
      audioFileId: FILE,
      startSeconds: 1,
      label: "  ",
      comment: "",
    });
    assert.deepEqual(empty, { ok: false, error: ANNOTATION_ERRORS.empty });

    const signedOut = await createAnnotation(
      mockSupabase({ user: null }),
      { audioFileId: FILE, startSeconds: 1, label: "kick" },
    );
    assert.deepEqual(signedOut, { ok: false, error: ANNOTATION_ERRORS.login });
  });
});

describe("updateAnnotation", () => {
  it("sends version in the filter and returns the new row", async () => {
    const updated = sampleAnnotation({ version: 2, comment: "quieter" });
    const result = await updateAnnotation(
      mockSupabase({
        onUpdate: (row, filters) => {
          assert.equal(row.comment, "quieter");
          assert.equal(row.label, "kick");
          assert.equal(filters.id, NOTE);
          assert.equal(filters.version, 1);
          assert.equal(filters.author_id, USER);
          return { data: updated, error: null };
        },
      }),
      { id: NOTE, version: 1, label: "kick", comment: "quieter" },
    );

    assert.deepEqual(result, { ok: true, annotation: updated });
  });

  it("reports conflict when version is stale", async () => {
    const result = await updateAnnotation(
      mockSupabase({
        onUpdate: (_row, filters) => {
          assert.equal(filters.version, 1);
          return { data: null, error: null };
        },
        onSelect: (_columns, filters) => {
          assert.equal(filters.id, NOTE);
          return {
            data: { id: NOTE, version: 2 },
            error: null,
          };
        },
      }),
      { id: NOTE, version: 1, comment: "stale" },
    );

    assert.deepEqual(result, {
      ok: false,
      error: ANNOTATION_ERRORS.conflict,
      conflict: true,
    });
  });
});

describe("deleteAnnotation", () => {
  it("deletes the author's row", async () => {
    const result = await deleteAnnotation(
      mockSupabase({
        onDelete: (filters) => {
          assert.equal(filters.id, NOTE);
          assert.equal(filters.author_id, USER);
          return { data: { id: NOTE }, error: null };
        },
      }),
      NOTE,
    );

    assert.deepEqual(result, { ok: true });
  });

  it("fails when the row is missing", async () => {
    const result = await deleteAnnotation(
      mockSupabase({
        onDelete: () => ({ data: null, error: null }),
      }),
      NOTE,
    );

    assert.deepEqual(result, { ok: false, error: ANNOTATION_ERRORS.missing });
  });
});
