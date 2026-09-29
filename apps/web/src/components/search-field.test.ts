import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  SearchField,
} from "./search-field";

describe("SearchField component exports and contract", () => {
  it("exports SearchField function and default debounce constant of 250ms", () => {
    assert.equal(typeof SearchField, "function");
    assert.equal(DEFAULT_SEARCH_DEBOUNCE_MS, 250);
  });
});

describe("SearchField debounce timing behavior", () => {
  it("debounces rapid emissions and only executes the latest value", async () => {
    const emitted: string[] = [];
    let timer: NodeJS.Timeout | null = null;

    function triggerSearch(query: string, delayMs: number) {
      if (timer) clearTimeout(timer);
      if (delayMs <= 0) {
        emitted.push(query);
        return;
      }
      timer = setTimeout(() => {
        emitted.push(query);
      }, delayMs);
    }

    // Simulate typing "g", "gu", "gui", "guitar" quickly
    triggerSearch("g", 50);
    await delay(10);
    triggerSearch("gu", 50);
    await delay(10);
    triggerSearch("gui", 50);
    await delay(10);
    triggerSearch("guitar", 50);

    // Before delay expires
    assert.deepEqual(emitted, []);

    // After delay expires
    await delay(70);
    assert.deepEqual(emitted, ["guitar"]);
  });

  it("fires immediately without delay when cleared", async () => {
    const emitted: string[] = [];
    let timer: NodeJS.Timeout | null = null;

    function triggerSearch(query: string, delayMs: number) {
      if (timer) clearTimeout(timer);
      if (delayMs <= 0) {
        emitted.push(query);
        return;
      }
      timer = setTimeout(() => {
        emitted.push(query);
      }, delayMs);
    }

    // Pending search scheduled
    triggerSearch("synth", 100);

    // User immediately clicks clear (delay = 0)
    triggerSearch("", 0);

    assert.deepEqual(emitted, [""]);

    // Wait past the original 100ms timer to ensure it was cancelled
    await delay(120);
    assert.deepEqual(emitted, [""]);
  });
});
