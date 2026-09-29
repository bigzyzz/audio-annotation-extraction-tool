import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@audio-tool/shared-types";
import type { FileListItem } from "@/components/file-list";
import { AUDIO_SEARCH_COLUMNS, searchAudioFiles } from "./search-audio";

const SAMPLE_FILES: FileListItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    filename: "Acoustic_Guitar_Take_01.wav",
    format: "wav",
    duration_seconds: 45.2,
    created_at: "2026-09-20T10:00:00Z",
    waveform_peaks_path: "owner/111.peaks.json",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    filename: "Drum_Loop_120bpm_100%.mp3",
    format: "mp3",
    duration_seconds: 12.0,
    created_at: "2026-09-19T10:00:00Z",
    waveform_peaks_path: "owner/222.peaks.json",
  },
];

type MockOptions = {
  user?: { id: string } | null;
  files?: FileListItem[];
  error?: { message: string } | null;
};

function createMockSupabase(options: MockOptions = {}) {
  let tableQueried: string | null = null;
  let selectedColumns: string | null = null;
  let ilikeColumn: string | null = null;
  let ilikePattern: string | null = null;
  let orderColumn: string | null = null;
  let orderAscending: boolean | null = null;

  const client = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.user !== undefined ? options.user : { id: "user-123" },
        },
        error: null,
      }),
    },
    from: (table: string) => {
      tableQueried = table;
      const builder = {
        select: (columns: string) => {
          selectedColumns = columns;
          return builder;
        },
        ilike: (column: string, pattern: string) => {
          ilikeColumn = column;
          ilikePattern = pattern;
          return builder;
        },
        order: async (column: string, opts: { ascending: boolean }) => {
          orderColumn = column;
          orderAscending = opts.ascending;
          if (options.error) {
            return { data: null, error: options.error };
          }
          return { data: options.files ?? SAMPLE_FILES, error: null };
        },
      };
      return builder;
    },
    getCaptured: () => ({
      tableQueried,
      selectedColumns,
      ilikeColumn,
      ilikePattern,
      orderColumn,
      orderAscending,
    }),
  };

  return client as unknown as SupabaseClient<Database> & {
    getCaptured: () => {
      tableQueried: string | null;
      selectedColumns: string | null;
      ilikeColumn: string | null;
      ilikePattern: string | null;
      orderColumn: string | null;
      orderAscending: boolean | null;
    };
  };
}

describe("searchAudioFiles", () => {
  it("fails when session is absent", async () => {
    const supabase = createMockSupabase({ user: null });
    const result = await searchAudioFiles(supabase, "guitar");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /log in/i);
    }
    assert.equal(supabase.getCaptured().tableQueried, null);
  });

  it("fetches all files when query is empty, blank, or null", async () => {
    for (const emptyQuery of [null, undefined, "", "   ", "\t\n "]) {
      const supabase = createMockSupabase();
      const result = await searchAudioFiles(supabase, emptyQuery);

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.files, SAMPLE_FILES);
      }

      const captured = supabase.getCaptured();
      assert.equal(captured.tableQueried, "audio_files");
      assert.equal(captured.selectedColumns, AUDIO_SEARCH_COLUMNS);
      assert.equal(captured.ilikeColumn, null);
      assert.equal(captured.ilikePattern, null);
      assert.equal(captured.orderColumn, "created_at");
      assert.equal(captured.orderAscending, false);
    }
  });

  it("applies case-insensitive ILIKE pattern for active queries", async () => {
    const supabase = createMockSupabase();
    const result = await searchAudioFiles(supabase, "Guitar");

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.files, SAMPLE_FILES);
    }

    const captured = supabase.getCaptured();
    assert.equal(captured.tableQueried, "audio_files");
    assert.equal(captured.selectedColumns, AUDIO_SEARCH_COLUMNS);
    assert.equal(captured.ilikeColumn, "filename");
    assert.equal(captured.ilikePattern, "%Guitar%");
    assert.equal(captured.orderColumn, "created_at");
    assert.equal(captured.orderAscending, false);
  });

  it("escapes SQL wildcards in queries without throwing", async () => {
    const supabase = createMockSupabase();
    const result = await searchAudioFiles(supabase, "100%_loop\\take");

    assert.equal(result.ok, true);
    const captured = supabase.getCaptured();
    assert.equal(captured.ilikeColumn, "filename");
    assert.equal(captured.ilikePattern, "%100\\%\\_loop\\\\take%");
  });

  it("returns a friendly error on database failure", async () => {
    const supabase = createMockSupabase({
      error: { message: "Database connection timeout" },
    });
    const result = await searchAudioFiles(supabase, "test");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /couldn't load search results/i);
    }
  });
});
