import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEMO_PERSONAS,
  getDemoPersona,
} from "./demo-accounts";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

describe("DEMO_PERSONAS", () => {
  it("provides valid configurations for Alice and Bob", () => {
    const personas = [DEMO_PERSONAS.alice, DEMO_PERSONAS.bob];

    for (const persona of personas) {
      assert.ok(persona.name);
      assert.ok(persona.role);
      assert.match(persona.email, /^.+@.+\..+$/);
      assert.ok(persona.password.length >= 8);
      assert.match(persona.username, USERNAME_REGEX);
    }
  });

  it("has distinct emails, usernames, and roles for each persona", () => {
    assert.notEqual(DEMO_PERSONAS.alice.email, DEMO_PERSONAS.bob.email);
    assert.notEqual(
      DEMO_PERSONAS.alice.username,
      DEMO_PERSONAS.bob.username,
    );
    assert.notEqual(DEMO_PERSONAS.alice.role, DEMO_PERSONAS.bob.role);
  });
});

describe("getDemoPersona", () => {
  it("returns the corresponding persona for valid IDs", () => {
    assert.equal(getDemoPersona("alice")?.id, "alice");
    assert.equal(getDemoPersona("bob")?.id, "bob");
  });

  it("returns undefined for unknown IDs", () => {
    assert.equal(getDemoPersona("charlie"), undefined);
    assert.equal(getDemoPersona(""), undefined);
  });
});
