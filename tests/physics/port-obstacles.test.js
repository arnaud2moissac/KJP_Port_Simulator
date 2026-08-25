"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const fs = require("node:fs");
const path = require("node:path");
const Physics = require("../../src/simulateur-port/physics-core.js");

function runContactCase(dt, obstacle) {
  const simulator = Physics.createSimulator({
    environment: { windSpeedKn: 0, currentSpeedKn: 0, propWalk: 0 },
    obstacles: obstacle
  });
  simulator.reset({
    pose: { east: 0, north: 0, heading: Math.PI / 2 },
    velocity: { u: 0.8, v: 0, r: 0 }
  });
  const samples = [];
  for (let index = 0; index < Math.round(12 / dt); index += 1) {
    simulator.step({ throttle: 0, rudder: 0 }, dt);
    const snapshot = simulator.snapshot();
    if (index % Math.max(1, Math.round(0.2 / dt)) === 0) {
      samples.push([snapshot.pose.east, snapshot.pose.north, snapshot.velocity.u]);
    }
  }
  return { snapshot: simulator.snapshot(), samples };
}

test("contacts analytiques: rectangle orienté, digue courbe et terre polygonale", () => {
  const rectangle = {
    id: "rotated",
    east: 0,
    north: 0,
    width: 10,
    height: 2,
    heading: Math.PI / 4
  };
  const inside = Physics.pointRectContact(0, 0, rectangle);
  assert.ok(inside.distance < 0);
  assert.ok(Math.abs(Math.hypot(inside.normalEast, inside.normalNorth) - 1) < 1e-10);
  const outside = Physics.pointRectContact(5, -5, rectangle);
  assert.ok(outside.distance > 0);

  const joinedCatway = {
    id: "joined-catway",
    east: 0,
    north: 0,
    width: 10,
    height: 2,
    heading: Math.PI / 2,
    hiddenFaces: ["x0"]
  };
  const internalRoot = Physics.pointRectContact(-5.1, 0, joinedCatway);
  const accessibleSide = Physics.pointRectContact(0, -1.1, joinedCatway);
  assert.equal(internalRoot.face, "x0");
  assert.equal(Physics.isContactSurfaceEnabled(internalRoot, joinedCatway), false);
  assert.equal(accessibleSide.face, "y1");
  assert.equal(Physics.isContactSurfaceEnabled(accessibleSide, joinedCatway), true);

  const line = Physics.pointPolylineContact(2, 1.2, {
    width: 2,
    points: [
      { east: 0, north: 0 },
      { east: 2, north: 0 },
      { east: 4, north: 2 }
    ]
  });
  assert.ok(line.distance < 0.3);

  const polygon = {
    points: [
      { east: 0, north: 0 },
      { east: 8, north: 0 },
      { east: 8, north: 8 },
      { east: 0, north: 8 }
    ]
  };
  assert.equal(Physics.pointInPolygon(4, 4, polygon.points), true);
  assert.equal(Physics.pointInPolygon(-1, 4, polygon.points), false);
  assert.ok(Physics.pointPolygonContact(4, 4, polygon).distance < 0);
  assert.ok(Physics.pointPolygonContact(-1, 4, polygon).distance > 0);

  const buoy = Physics.pointCircleContact(2, 0, {
    east: 0,
    north: 0,
    radius: 1.2
  });
  assert.ok(Math.abs(buoy.distance - 0.8) < 1e-12);
  assert.deepEqual(
    { east: buoy.normalEast, north: buoy.normalNorth },
    { east: 1, north: 0 }
  );
});

test("contacts portuaires: absence de traversée et convergence 60/120/240 Hz", () => {
  const cases = [
    {
      rectangles: [{
        id: "pontoon-rotated",
        east: 8,
        north: 0,
        width: 12,
        height: 1.5,
        heading: Math.PI / 4
      }]
    },
    {
      polylines: [{
        id: "curved-breakwater",
        width: 2,
        points: [
          { east: 7, north: -12 },
          { east: 7, north: -3 },
          { east: 8, north: 3 },
          { east: 10, north: 12 }
        ]
      }]
    },
    {
      polygons: [{
        id: "land",
        points: [
          { east: 7, north: -20 },
          { east: 30, north: -20 },
          { east: 30, north: 20 },
          { east: 7, north: 20 }
        ]
      }]
    },
    {
      circles: [{
        id: "navigation-buoy",
        east: 8,
        north: 0,
        radius: 0.8
      }]
    }
  ];
  for (const obstacle of cases) {
    const at60 = runContactCase(1 / 60, obstacle);
    const at120 = runContactCase(1 / 120, obstacle);
    const at240 = runContactCase(1 / 240, obstacle);
    for (const result of [at60, at120, at240]) {
      assert.ok(result.snapshot.contacts.impacts >= 1);
      assert.ok(result.snapshot.pose.east < 8.2);
      assert.ok(Number.isFinite(result.snapshot.pose.east + result.snapshot.velocity.u));
    }
    assert.ok(Math.abs(at60.snapshot.pose.east - at120.snapshot.pose.east) < 0.08);
    assert.ok(Math.abs(at240.snapshot.pose.east - at120.snapshot.pose.east) < 0.08);
  }
});

function createLargeObstacles() {
  const definition = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "fixtures", "kjp-large-port-definition.json"),
    "utf8"
  ));
  const rectangles = [];
  const boats = [];
  const { columns, rowPitchMeters, columnPitchMeters } = definition.grid;
  for (let index = 0; index < definition.counts.pontoons + definition.counts.catways; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    rectangles.push({
      id: `structure-${index}`,
      east: 500 + column * columnPitchMeters,
      north: 500 + row * rowPitchMeters,
      width: index < definition.counts.pontoons ? 18 : 10,
      height: index < definition.counts.pontoons ? 2.4 : 0.8,
      heading: Math.PI / 2 + (index % 7) * 0.03
    });
  }
  for (let index = 0; index < definition.counts.staticBoats; index += 1) {
    boats.push({
      id: `boat-${index}`,
      east: 600 + (index % columns) * columnPitchMeters,
      north: -600 - Math.floor(index / columns) * rowPitchMeters,
      heading: Math.PI / 2,
      length: 9,
      beam: 3
    });
  }
  return { rectangles, boats };
}

test("grand port: index spatial sur 2 000 structures et 1 000 bateaux, P95 < 1 ms", () => {
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
  assert.ok(p95 < 1, `P95 ${p95.toFixed(3)} ms`);
});
