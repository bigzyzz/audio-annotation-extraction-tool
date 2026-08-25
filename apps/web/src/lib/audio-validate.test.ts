import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { validateAudioFile } from "./audio-validate";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fileFrom(
  name: string,
  type: string,
  bytes: Uint8Array,
): File {
  return new File([bytes], name, { type });
}

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixtures, name)));
}

describe("validateAudioFile", () => {
  it("accepts a real tiny WAV", async () => {
    const result = await validateAudioFile(
      fileFrom("click.wav", "audio/wav", loadFixture("tiny.wav")),
    );
    assert.deepEqual(result, { ok: true, format: "wav" });
  });

  it("accepts a real tiny MP3 (ID3 header)", async () => {
    const result = await validateAudioFile(
      fileFrom("click.mp3", "audio/mpeg", loadFixture("tiny.mp3")),
    );
    assert.deepEqual(result, { ok: true, format: "mp3" });
  });

  it("accepts MP3 that starts with a frame sync (no ID3)", async () => {
    const frame = new Uint8Array(loadFixture("tiny.mp3").subarray(10));
    assert.equal(frame[0], 0xff);
    const result = await validateAudioFile(
      fileFrom("bare.mp3", "audio/mpeg", frame),
    );
    assert.deepEqual(result, { ok: true, format: "mp3" });
  });

  it("rejects a .txt renamed to .mp3 (US5)", async () => {
    const junk = new TextEncoder().encode("this is not audio");
    const result = await validateAudioFile(
      fileFrom("secret.mp3", "audio/mpeg", junk),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /contents don't match/i);
    }
  });

  it("rejects a WAV header saved as .mp3", async () => {
    const result = await validateAudioFile(
      fileFrom("spoof.mp3", "audio/mpeg", loadFixture("tiny.wav")),
    );
    assert.equal(result.ok, false);
  });

  it("rejects a non-audio extension", async () => {
    const result = await validateAudioFile(
      fileFrom("notes.txt", "text/plain", loadFixture("tiny.wav")),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /only mp3 and wav/i);
    }
  });

  it("rejects a MIME that does not match the extension", async () => {
    const result = await validateAudioFile(
      fileFrom("click.mp3", "image/png", loadFixture("tiny.mp3")),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /type doesn't match/i);
    }
  });

  it("rejects an empty file", async () => {
    const result = await validateAudioFile(
      fileFrom("empty.wav", "audio/wav", new Uint8Array()),
    );
    assert.equal(result.ok, false);
  });

  it("allows missing MIME when extension and magic agree", async () => {
    const result = await validateAudioFile(
      fileFrom("click.wav", "", loadFixture("tiny.wav")),
    );
    assert.deepEqual(result, { ok: true, format: "wav" });
  });
});
