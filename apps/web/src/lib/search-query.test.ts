import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  escapeIlikePattern,
  matchesSearchQuery,
  parseSearchQuery,
} from "./search-query";

describe("escapeIlikePattern", () => {
  it("leaves strings without metacharacters unchanged", () => {
    assert.equal(escapeIlikePattern("drum track"), "drum track");
    assert.equal(escapeIlikePattern("solo-vocal-01"), "solo-vocal-01");
  });

  it("escapes percent signs", () => {
    assert.equal(escapeIlikePattern("100%"), "100\\%");
    assert.equal(escapeIlikePattern("%intro%"), "\\%intro\\%");
  });

  it("escapes underscores", () => {
    assert.equal(escapeIlikePattern("take_01"), "take\\_01");
    assert.equal(escapeIlikePattern("_master_"), "\\_master\\_");
  });

  it("escapes backslashes", () => {
    assert.equal(escapeIlikePattern("dir\\file"), "dir\\\\file");
  });

  it("escapes combinations without double-escaping backslashes", () => {
    assert.equal(
      escapeIlikePattern("mix_100%\\final"),
      "mix\\_100\\%\\\\final",
    );
  });
});

describe("parseSearchQuery", () => {
  it("returns empty for null, undefined, empty, or whitespace strings", () => {
    assert.deepEqual(parseSearchQuery(null), { empty: true });
    assert.deepEqual(parseSearchQuery(undefined), { empty: true });
    assert.deepEqual(parseSearchQuery(""), { empty: true });
    assert.deepEqual(parseSearchQuery("   "), { empty: true });
    assert.deepEqual(parseSearchQuery("\t\n\r  "), { empty: true });
  });

  it("builds the %pattern% and normalizes non-empty queries", () => {
    const result = parseSearchQuery("Acoustic Guitar");
    assert.deepEqual(result, {
      empty: false,
      pattern: "%Acoustic Guitar%",
      term: "Acoustic Guitar",
      normalized: "acoustic guitar",
    });
  });

  it("trims leading and trailing whitespace from the query", () => {
    const result = parseSearchQuery("   Synth Lead   ");
    assert.deepEqual(result, {
      empty: false,
      pattern: "%Synth Lead%",
      term: "Synth Lead",
      normalized: "synth lead",
    });
  });

  it("escapes ILIKE wildcards in the built pattern", () => {
    const result = parseSearchQuery("demo_take_100%");
    assert.deepEqual(result, {
      empty: false,
      pattern: "%demo\\_take\\_100\\%%",
      term: "demo_take_100%",
      normalized: "demo_take_100%",
    });
  });
});

describe("matchesSearchQuery", () => {
  const filename = "Acoustic_Guitar_Take_01.wav";

  it("matches all filenames when query is empty or blank", () => {
    assert.equal(matchesSearchQuery(filename, null), true);
    assert.equal(matchesSearchQuery(filename, undefined), true);
    assert.equal(matchesSearchQuery(filename, ""), true);
    assert.equal(matchesSearchQuery(filename, "   "), true);
  });

  it("matches substrings case-insensitively", () => {
    assert.equal(matchesSearchQuery(filename, "acoustic"), true);
    assert.equal(matchesSearchQuery(filename, "GUITAR"), true);
    assert.equal(matchesSearchQuery(filename, "take"), true);
    assert.equal(matchesSearchQuery(filename, ".WAV"), true);
  });

  it("rejects non-matching queries", () => {
    assert.equal(matchesSearchQuery(filename, "piano"), false);
    assert.equal(matchesSearchQuery(filename, "vocal"), false);
  });

  it("matches literal characters accurately", () => {
    assert.equal(matchesSearchQuery("track_1.mp3", "track_1"), true);
    assert.equal(matchesSearchQuery("track-1.mp3", "track_1"), false);
    assert.equal(matchesSearchQuery("mix_100%.wav", "100%"), true);
    assert.equal(matchesSearchQuery("mix_100.wav", "100%"), false);
  });
});
