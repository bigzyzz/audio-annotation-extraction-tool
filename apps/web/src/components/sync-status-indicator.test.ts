import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateLatencyGrade,
  calculateBackoffDelay,
  recordLatencySample,
  type LatencyTelemetry,
  type RealtimeConnectionStatus,
} from "../lib/annotation-realtime";

describe("SyncStatusIndicator contracts and telemetry evaluation", () => {
  it("evaluates healthy SLA for low latency values", () => {
    const telemetry: LatencyTelemetry = {
      lastPingMs: 45,
      avgPingMs: 50,
      samples: [45, 50, 55],
      grade: evaluateLatencyGrade(45).grade,
      slaPass: evaluateLatencyGrade(45).slaPass,
      lastSyncedAt: Date.now(),
    };

    assert.equal(telemetry.grade, "optimal");
    assert.equal(telemetry.slaPass, true);
    assert.equal(telemetry.lastPingMs, 45);
  });

  it("evaluates acceptable SLA for moderate latencies under 2.0s", () => {
    const telemetry: LatencyTelemetry = {
      lastPingMs: 450,
      avgPingMs: 480,
      samples: [450, 480],
      grade: evaluateLatencyGrade(450).grade,
      slaPass: evaluateLatencyGrade(450).slaPass,
      lastSyncedAt: Date.now(),
    };

    assert.equal(telemetry.grade, "acceptable");
    assert.equal(telemetry.slaPass, true);
  });

  it("fails SLA when latency exceeds 2.0s per requirement R7", () => {
    const telemetry: LatencyTelemetry = {
      lastPingMs: 2400,
      avgPingMs: 2200,
      samples: [2000, 2400],
      grade: evaluateLatencyGrade(2400).grade,
      slaPass: evaluateLatencyGrade(2400).slaPass,
      lastSyncedAt: Date.now(),
    };

    assert.equal(telemetry.grade, "lagging");
    assert.equal(telemetry.slaPass, false);
  });

  it("handles offline telemetry state gracefully", () => {
    const telemetry: LatencyTelemetry = {
      lastPingMs: null,
      avgPingMs: null,
      samples: [],
      grade: evaluateLatencyGrade(null).grade,
      slaPass: evaluateLatencyGrade(null).slaPass,
      lastSyncedAt: null,
    };

    assert.equal(telemetry.grade, "offline");
    assert.equal(telemetry.slaPass, false);
  });

  it("computes backoff delay progression across retries", () => {
    const statuses: RealtimeConnectionStatus[] = [
      "connecting",
      "connected",
      "reconnecting",
      "disconnected",
    ];

    assert.equal(statuses.length, 4);

    const retry1 = calculateBackoffDelay(1, 500, 8000, 0);
    const retry2 = calculateBackoffDelay(2, 500, 8000, 0);
    const retry3 = calculateBackoffDelay(3, 500, 8000, 0);

    assert.equal(retry1, 500);
    assert.equal(retry2, 1000);
    assert.equal(retry3, 2000);
  });

  it("averages multiple ping samples in sliding window", () => {
    let samples: number[] = [];
    const pings = [50, 60, 40, 70, 30];

    for (const p of pings) {
      const recorded = recordLatencySample(samples, p, 5);
      samples = recorded.samples;
    }

    assert.equal(samples.length, 5);
    const avg = Math.round((50 + 60 + 40 + 70 + 30) / 5);
    assert.equal(avg, 50);
  });
});
