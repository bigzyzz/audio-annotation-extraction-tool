import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateAnnotationInput,
  ANNOTATION_VALIDATION_ERRORS,
} from "./annotation-validate";

describe("validateAnnotationInput", () => {
  it("approves valid point annotation with label", () => {
    const result = validateAnnotationInput({
      start: 12.5,
      end: null,
      isRange: false,
      durationSeconds: 120,
      label: "Snare drop",
    });

    assert.equal(result.ok, true);
    assert.equal(result.boundsOk, true);
    assert.equal(result.contentOk, true);
    assert.equal(result.error, null);
  });

  it("approves valid range annotation with comment", () => {
    const result = validateAnnotationInput({
      start: 5.0,
      end: 15.2,
      isRange: true,
      durationSeconds: 60,
      comment: "EQ needs boost here",
    });

    assert.equal(result.ok, true);
    assert.equal(result.boundsOk, true);
    assert.equal(result.contentOk, true);
    assert.equal(result.error, null);
  });

  it("rejects negative start time", () => {
    const result = validateAnnotationInput({
      start: -1.5,
      end: 10,
      isRange: true,
      durationSeconds: 60,
      label: "Chorus",
    });

    assert.equal(result.ok, false);
    assert.equal(result.boundsOk, false);
    assert.equal(result.field, "start");
    assert.equal(result.error, ANNOTATION_VALIDATION_ERRORS.negativeStart);
  });

  it("rejects start time exceeding audio duration", () => {
    const result = validateAnnotationInput({
      start: 65,
      end: null,
      isRange: false,
      durationSeconds: 60,
      label: "Outro",
    });

    assert.equal(result.ok, false);
    assert.equal(result.boundsOk, false);
    assert.equal(result.field, "start");
    assert.match(result.error ?? "", /Start time cannot exceed audio duration/);
  });

  it("rejects end time earlier than or equal to start time in a range", () => {
    const result1 = validateAnnotationInput({
      start: 10,
      end: 8,
      isRange: true,
      durationSeconds: 60,
      label: "Bridge",
    });

    assert.equal(result1.ok, false);
    assert.equal(result1.boundsOk, false);
    assert.equal(result1.field, "end");
    assert.equal(result1.error, ANNOTATION_VALIDATION_ERRORS.endBeforeStart);

    const result2 = validateAnnotationInput({
      start: 10,
      end: 10,
      isRange: true,
      durationSeconds: 60,
      label: "Bridge",
    });

    assert.equal(result2.ok, false);
    assert.equal(result2.boundsOk, false);
    assert.equal(result2.field, "end");
    assert.equal(result2.error, ANNOTATION_VALIDATION_ERRORS.endBeforeStart);
  });

  it("rejects range shorter than 0.05 seconds", () => {
    const result = validateAnnotationInput({
      start: 10.0,
      end: 10.02,
      isRange: true,
      durationSeconds: 60,
      label: "Click",
    });

    assert.equal(result.ok, false);
    assert.equal(result.boundsOk, false);
    assert.equal(result.field, "end");
    assert.equal(result.error, ANNOTATION_VALIDATION_ERRORS.tooShort);
  });

  it("rejects end time exceeding track duration", () => {
    const result = validateAnnotationInput({
      start: 50,
      end: 65,
      isRange: true,
      durationSeconds: 60,
      label: "Outro fade",
    });

    assert.equal(result.ok, false);
    assert.equal(result.boundsOk, false);
    assert.equal(result.field, "end");
    assert.match(result.error ?? "", /End time cannot exceed audio duration/);
  });

  it("rejects when both label and comment are empty whitespace", () => {
    const result = validateAnnotationInput({
      start: 10,
      end: 20,
      isRange: true,
      durationSeconds: 60,
      label: "   ",
      comment: "",
    });

    assert.equal(result.ok, false);
    assert.equal(result.boundsOk, true);
    assert.equal(result.contentOk, false);
    assert.equal(result.field, "content");
    assert.equal(result.error, ANNOTATION_VALIDATION_ERRORS.emptyContent);
  });
});
