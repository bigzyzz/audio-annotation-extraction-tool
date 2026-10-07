import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateStats,
  renderAsciiHistogram,
  SimulatedRealtimeMesh,
  runSimulatedBenchmark,
} from "./benchmark-concurrency.js";

describe("calculateStats", () => {
  it("handles empty latency arrays gracefully", () => {
    const stats = calculateStats([]);
    assert.equal(stats.sampleCount, 0);
    assert.equal(stats.minMs, 0);
    assert.equal(stats.maxMs, 0);
    assert.equal(stats.avgMs, 0);
    assert.equal(stats.medianMs, 0);
    assert.equal(stats.passedSla, true);
  });

  it("calculates accurate min, max, avg, and percentiles for samples", () => {
    const sample = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
    const stats = calculateStats(sample, 2000);

    assert.equal(stats.sampleCount, 10);
    assert.equal(stats.minMs, 50);
    assert.equal(stats.maxMs, 500);
    assert.equal(stats.avgMs, 275);
    assert.equal(stats.medianMs, 250);
    assert.equal(stats.p90Ms, 450);
    assert.equal(stats.p95Ms, 500);
    assert.equal(stats.successRatePercent, 100);
    assert.equal(stats.passedSla, true);
  });

  it("fails SLA when p95 exceeds the 2000ms threshold", () => {
    const slowSamples = [100, 200, 500, 1800, 2200, 2500, 3100];
    const stats = calculateStats(slowSamples, 2000);

    assert.equal(stats.sampleCount, 7);
    assert.ok(stats.p95Ms > 2000);
    assert.equal(stats.passedSla, false);
  });
});

describe("renderAsciiHistogram", () => {
  it("renders a non-empty chart for latency arrays", () => {
    const sample = [40, 50, 60, 70, 80, 90, 100, 110, 120];
    const chart = renderAsciiHistogram(sample, 4);

    assert.ok(chart.includes("ms - "));
    assert.ok(chart.includes("█"));
  });

  it("handles empty or constant values without crashing", () => {
    assert.equal(renderAsciiHistogram([]), "No latency data.");
    const constantChart = renderAsciiHistogram([100, 100, 100]);
    assert.ok(constantChart.includes("All latencies: 100ms"));
  });
});

describe("SimulatedRealtimeMesh", () => {
  it("initializes N clients and broadcasts to all N-1 peer clients", async () => {
    const clientCount = 5;
    const mesh = new SimulatedRealtimeMesh(clientCount);
    const clients = mesh.getClients();

    assert.equal(clients.length, clientCount);

    const receivedMessages: string[] = [];
    for (const c of clients) {
      mesh.subscribe(c, (msg) => {
        receivedMessages.push(`${c}:${msg.id}`);
      });
    }

    const sender = clients[0]!;
    const metrics = await mesh.broadcast(sender, "INSERT", 1);

    // Exactly 4 peer clients should receive the broadcast
    assert.equal(metrics.length, 4);
    assert.equal(receivedMessages.length, 4);

    for (const m of metrics) {
      assert.equal(m.sourceClientId, sender);
      assert.notEqual(m.targetClientId, sender);
      assert.ok(m.latencyMs > 0);
      assert.ok(m.latencyMs < 2000);
    }
  });
});

describe("runSimulatedBenchmark", () => {
  it("runs full multi-client benchmark suite and meets R7 < 2000ms SLA", async () => {
    const report = await runSimulatedBenchmark({
      clients: 5,
      iterations: 5,
      maxLatencyThresholdMs: 2000,
    });

    assert.equal(report.concurrency, 5);
    assert.equal(report.mode, "simulated");
    assert.ok(report.overallStats.sampleCount > 0);
    assert.ok(report.overallStats.p95Ms < 2000);
    assert.equal(report.overallStats.passedSla, true);

    // Check scenarios were evaluated
    assert.ok("Staggered Collaborative Annotations" in report.scenarioStats);
    assert.ok("Simultaneous 5-Client Mutation Burst" in report.scenarioStats);
    assert.ok("Rapid OCC Updates" in report.scenarioStats);
    assert.ok("Deletion Propagation" in report.scenarioStats);
  });
});
