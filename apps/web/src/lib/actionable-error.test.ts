import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatActionableError, extractErrorMessage } from "./actionable-error";

describe("actionable-error helper (Nielsen H9)", () => {
  describe("extractErrorMessage", () => {
    it("handles string, Error instance, and custom error object", () => {
      assert.equal(extractErrorMessage("simple error"), "simple error");
      assert.equal(extractErrorMessage(new Error("standard error")), "standard error");
      assert.equal(extractErrorMessage({ message: "object error" }), "object error");
      assert.equal(extractErrorMessage(null), "");
      assert.equal(extractErrorMessage(undefined), "");
    });
  });

  describe("auth errors", () => {
    it("formats invalid credentials with demo recovery advice", () => {
      const result = formatActionableError("Invalid login credentials", "auth");
      assert.equal(result.title, "Incorrect Email or Password");
      assert.match(result.recoveryAdvice, /Demo Login/);
      assert.equal(result.retryable, true);
    });

    it("formats unconfirmed email error with spam check advice", () => {
      const result = formatActionableError("Email not confirmed", "auth");
      assert.equal(result.title, "Email Not Confirmed");
      assert.match(result.recoveryAdvice, /inbox/);
    });

    it("formats rate limit error with cooldown advice", () => {
      const result = formatActionableError("over_email_send_rate_limit", "auth");
      assert.equal(result.title, "Too Many Attempts");
      assert.match(result.recoveryAdvice, /wait/);
    });

    it("formats username already registered", () => {
      const result = formatActionableError("That username is already taken", "auth");
      assert.equal(result.title, "Account Already Exists");
      assert.match(result.recoveryAdvice, /different username/);
    });
  });

  describe("upload errors", () => {
    it("formats 50 MB size limit error with compression advice", () => {
      const result = formatActionableError("That file is over the 50 MB limit.", "upload");
      assert.equal(result.title, "File Exceeds Size Limit");
      assert.match(result.recoveryAdvice, /compressing/);
    });

    it("formats format/extension mismatch error", () => {
      const result = formatActionableError("Only MP3 and WAV files are allowed.", "upload");
      assert.equal(result.title, "Unsupported or Corrupted Audio File");
      assert.match(result.recoveryAdvice, /genuine MP3 or WAV/);
    });

    it("formats network upload failure", () => {
      const result = formatActionableError("Storage network connection failed", "upload");
      assert.equal(result.title, "Upload Interrupted");
      assert.match(result.recoveryAdvice, /internet connection/);
    });
  });

  describe("annotation errors", () => {
    it("formats empty note error", () => {
      const result = formatActionableError("At least one of label or comment must be provided.", "annotation");
      assert.equal(result.title, "Annotation Cannot Be Empty");
      assert.match(result.recoveryAdvice, /short label/);
    });

    it("formats invalid timestamp bounds error", () => {
      const result = formatActionableError("End time cannot be earlier than start time.", "annotation");
      assert.equal(result.title, "Invalid Timestamp Range");
      assert.match(result.recoveryAdvice, /handles on the waveform/);
    });

    it("formats OCC collaborator conflict", () => {
      const result = formatActionableError("Modified by another user (OCC conflict)", "annotation");
      assert.equal(result.title, "Collaborator Conflict Detected");
      assert.match(result.recoveryAdvice, /Keep My Draft/);
    });
  });

  describe("extraction errors", () => {
    it("formats invalid extraction range", () => {
      const result = formatActionableError("Range exceeds track duration", "extraction");
      assert.equal(result.title, "Invalid Extraction Range");
      assert.match(result.recoveryAdvice, /total duration/);
    });

    it("formats download URL failure", () => {
      const result = formatActionableError("Could not sign download URL", "extraction");
      assert.equal(result.title, "Download Link Unavailable");
      assert.match(result.recoveryAdvice, /download again/);
    });
  });

  describe("fallback generic errors", () => {
    it("gracefully classifies unknown errors with general recovery steps", () => {
      const result = formatActionableError("Something completely unexpected happened", "general");
      assert.equal(result.title, "Action Could Not Be Completed");
      assert.match(result.recoveryAdvice, /try again/);
    });
  });
});
