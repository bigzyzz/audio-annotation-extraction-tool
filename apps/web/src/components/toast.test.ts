import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateToastId, createToastHelpers, type ToastOptions } from "./toast";

describe("toast notification system", () => {
  it("generates unique sequential IDs", () => {
    const id1 = generateToastId();
    const id2 = generateToastId();
    assert.notEqual(id1, id2);
    assert.match(id1, /^toast-\d+-\d+$/);
    assert.match(id2, /^toast-\d+-\d+$/);
  });

  it("delegates helper methods to showToast with correct types", () => {
    const calls: ToastOptions[] = [];
    const helpers = createToastHelpers((opts) => {
      calls.push(opts);
      return "mock-id";
    });

    helpers.success("Success title", "Success message");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "success");
    assert.equal(calls[0].title, "Success title");
    assert.equal(calls[0].message, "Success message");

    helpers.error("Error title", "Error message");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].type, "error");

    helpers.info("Info title");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].type, "info");

    helpers.warning("Warning title");
    assert.equal(calls.length, 4);
    assert.equal(calls[3].type, "warning");
  });
});
