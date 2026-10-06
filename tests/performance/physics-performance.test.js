"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const Physics = require("../../src/simulateur-port/physics-core.js");
const { createLargeObstacles } = require("../helpers/large-port-obstacles.js");
const DT = 1 / 120;
const DEG = Physics.DEG;

// Original thresholds: qualification only, never part of a functional route.
test("performance core: 10 000 pas, douze aussières, moyenne et P95 < 1 ms", t => {
  const simulator = Physics.createSimulator();
  for (const cleat of Physics.DEFAULT_PROFILE.mooring.cleats) {
    const point = Physics.localPointToWorld(simulator.snapshot().pose, cleat.x, cleat.y);
    for (let lineIndex = 1; lineIndex <= 2; lineIndex += 1) {
      assert.equal(simulator.attachMooring({
        id: `performance-${cleat.id}-${lineIndex}`,
        boatCleatId: cleat.id,
        shoreCleatId: `performance-shore-${cleat.id}-${lineIndex}`,
        shorePoint: {
          east: point.east - 6,
          north: point.north,
          z: cleat.z
        }
      }).ok, true);
    }
  }
  const start = performance.now();
  const batchDurations = [];
  for (let batch = 0; batch < 500; batch += 1) {
    const batchStart = performance.now();
    for (let offset = 0; offset < 20; offset += 1) {
      const index = batch * 20 + offset;
      const phase = index % 1200;
      const throttle = phase < 400 ? 0.65 : phase < 800 ? -0.45 : 0;
      const rudder = ((index % 71) - 35) * DEG;
      simulator.step({ throttle, rudder }, DT);
    }
    batchDurations.push((performance.now() - batchStart) / 20);
    const snapshot = simulator.snapshot();
    assert.ok([
      snapshot.pose.east,
      snapshot.pose.north,
      snapshot.pose.heading,
      snapshot.velocity.u,
      snapshot.velocity.v,
      snapshot.velocity.r,
      snapshot.propulsion.thrust,
      snapshot.propulsion.advanceRatio
    ].every(Number.isFinite));
  }
  const elapsed = performance.now() - start;
  const average = elapsed / 10000;
  batchDurations.sort((left, right) => left - right);
  const p95 = batchDurations[Math.floor(batchDurations.length * .95)];
  const x2AverageWorkPerRealSecond = average * 240;
  const x2P95WorkPerRealSecond = p95 * 240;
  t.diagnostic(JSON.stringify({ averageMs: average, p95Ms: p95, x2AverageWorkPerRealSecond, x2P95WorkPerRealSecond }));
  assert.ok(average < 1, `coût moyen hors budget: ${average.toFixed(3)} ms/pas`);
  assert.ok(p95 < 1, `95e percentile hors budget: ${p95.toFixed(3)} ms/pas`);
  assert.ok(
    x2AverageWorkPerRealSecond < 240,
    `×2 consommerait ${x2AverageWorkPerRealSecond.toFixed(1)} ms par seconde réelle`
  );
  assert.ok(
    x2P95WorkPerRealSecond < 240,
    `×2 dépasserait le budget p95: ${x2P95WorkPerRealSecond.toFixed(1)} ms/s`
  );
});

test("performance grand port: 3 000 obstacles, P95 < 1 ms", t => {
  const simulator = Physics.createSimulator({
    obstacles: createLargeObstacles(),
    environment: { windSpeedKn: 0, currentSpeedKn: 0, propWalk: 0 }
  });
  simulator.reset({
    pose: { east: 0, north: 0, heading: Math.PI / 2 },
    velocity: { u: 0.4, v: 0, r: 0 }
  });
  const report = simulator.getObstacleIndexReport();
  assert.equal(report.records, 3000);
  assert.ok(report.cells > 0);
  const durations = [];
  for (let index = 0; index < 600; index += 1) {
    const start = performance.now();
    simulator.step({ throttle: 0, rudder: 0 }, 1 / 120);
    if (index >= 100) durations.push(performance.now() - start);
  }
  durations.sort((first, second) => first - second);
  const p95 = durations[Math.floor(durations.length * 0.95)];
  t.diagnostic(JSON.stringify({ p95Ms: p95, records: report.records, cells: report.cells }));
  assert.ok(p95 < 1, `P95 ${p95.toFixed(3)} ms`);
});
