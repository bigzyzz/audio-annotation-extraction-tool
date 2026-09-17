import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAnnotationStamp } from "./annotation-panel";

describe("formatAnnotationStamp", () => {
  it("formats a point and a range", () => {
    assert.equal(formatAnnotationStamp(1.2, null), "1.20s");
    assert.equal(formatAnnotationStamp(1, 2.5), "1.00s – 2.50s");
  });
});
