import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyListMessage } from "./file-list";

describe("emptyListMessage", () => {
  it("returns default empty library message when search query is empty or whitespace", () => {
    const expected = "No tracks yet. Upload an MP3 or WAV to get started.";
    assert.equal(emptyListMessage(), expected);
    assert.equal(emptyListMessage(null), expected);
    assert.equal(emptyListMessage(undefined), expected);
    assert.equal(emptyListMessage(""), expected);
    assert.equal(emptyListMessage("   "), expected);
    assert.equal(emptyListMessage("\t\n"), expected);
  });

  it("returns distinct search miss message when query is active", () => {
    assert.equal(
      emptyListMessage("acoustic"),
      'No tracks match "acoustic". Try another search or clear the search field.',
    );
    assert.equal(
      emptyListMessage("  drum loop  "),
      'No tracks match "drum loop". Try another search or clear the search field.',
    );
  });
});
