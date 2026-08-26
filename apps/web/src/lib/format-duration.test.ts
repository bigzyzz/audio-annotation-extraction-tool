import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDurationSeconds } from "./format-duration";

describe("formatDurationSeconds", () => {
  it("formats under an hour as m:ss", () => {
    assert.equal(formatDurationSeconds(0), "0:00");
    assert.equal(formatDurationSeconds(5.4), "0:05");
    assert.equal(formatDurationSeconds(65), "1:05");
  });

  it("formats an hour or more as h:mm:ss", () => {
    assert.equal(formatDurationSeconds(3600), "1:00:00");
    assert.equal(formatDurationSeconds(3723), "1:02:03");
  });
});
