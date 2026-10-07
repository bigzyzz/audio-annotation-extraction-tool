import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCollaboratorColor,
  getCollaboratorInitials,
  parsePresenceState,
  createThrottler,
  COLLABORATOR_PALETTE,
} from "./presence.js";

describe("getCollaboratorColor", () => {
  it("returns a deterministic color object from palette", () => {
    const colorA1 = getCollaboratorColor("user-123");
    const colorA2 = getCollaboratorColor("user-123");
    const colorB = getCollaboratorColor("user-456");

    assert.deepEqual(colorA1, colorA2);
    assert.ok(COLLABORATOR_PALETTE.some((p) => p.hex === colorA1.hex));
    assert.ok(typeof colorB.bg === "string");
  });
});

describe("getCollaboratorInitials", () => {
  it("extracts 2 initials for compound usernames", () => {
    assert.equal(getCollaboratorInitials("alice_producer"), "AP");
    assert.equal(getCollaboratorInitials("bob.engineer"), "BE");
    assert.equal(getCollaboratorInitials("Jane Doe"), "JD");
  });

  it("extracts initials for simple usernames and cleans prefixes", () => {
    assert.equal(getCollaboratorInitials("@producer"), "PR");
    assert.equal(getCollaboratorInitials("bob"), "BO");
    assert.equal(getCollaboratorInitials("x"), "X");
    assert.equal(getCollaboratorInitials(""), "??");
  });
});

describe("parsePresenceState", () => {
  it("returns empty list for empty presence state", () => {
    assert.deepEqual(parsePresenceState({}), []);
  });

  it("parses, deduplicates, and sorts presence entries", () => {
    const rawState = {
      "user-1": [
        {
          userId: "user-1",
          username: "alice",
          joinedAt: 1000,
          lastActiveAt: 1000,
          playheadSeconds: 15.2,
        },
      ],
      "user-2": [
        {
          userId: "user-2",
          username: "bob",
          joinedAt: 2000,
          lastActiveAt: 2500,
          playheadSeconds: 42.0,
        },
      ],
    };

    const result = parsePresenceState(rawState, "user-2");

    assert.equal(result.length, 2);
    // Current user ("user-2") should be sorted first
    assert.equal(result[0]?.userId, "user-2");
    assert.equal(result[0]?.username, "bob");
    assert.equal(result[0]?.playheadSeconds, 42.0);

    assert.equal(result[1]?.userId, "user-1");
    assert.equal(result[1]?.username, "alice");
    assert.equal(result[1]?.playheadSeconds, 15.2);
  });
});

describe("createThrottler", () => {
  it("executes first invocation immediately and throttles trailing calls", async () => {
    const calls: number[] = [];
    const throttler = createThrottler<number>((val) => {
      calls.push(val);
    }, 50);

    throttler.invoke(1);
    assert.deepEqual(calls, [1]);

    // Fast successive calls during throttle window
    throttler.invoke(2);
    throttler.invoke(3);
    throttler.invoke(4);
    assert.deepEqual(calls, [1]); // Still only 1 executed

    // Wait for trailing edge to trigger
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(calls, [1, 4]); // 4 was delivered as trailing edge
  });

  it("flushes pending invocation immediately when flush() is called", () => {
    const calls: string[] = [];
    const throttler = createThrottler<string>((val) => {
      calls.push(val);
    }, 100);

    throttler.invoke("a");
    throttler.invoke("b");
    assert.deepEqual(calls, ["a"]);

    throttler.flush();
    assert.deepEqual(calls, ["a", "b"]);
  });

  it("cancels pending invocation when cancel() is called", async () => {
    const calls: number[] = [];
    const throttler = createThrottler<number>((val) => {
      calls.push(val);
    }, 50);

    throttler.invoke(10);
    throttler.invoke(20);
    throttler.cancel();

    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.deepEqual(calls, [10]); // 20 was cancelled
  });
});
