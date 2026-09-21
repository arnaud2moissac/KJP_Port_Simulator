"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const fs = require("node:fs");
const path = require("node:path");
const Physics = require("../../src/simulateur-port/physics-core.js");
const KJPCodec = require("../../src/ports/kjp-codec.js");

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

function gunwaleAt(gunwale, x) {
  const foundIndex = gunwale.findIndex(point => point.x >= x);
  const rightIndex = Math.min(
    gunwale.length - 1,
    Math.max(1, foundIndex < 0 ? gunwale.length - 1 : foundIndex)
  );
  const left = gunwale[rightIndex - 1];
  const right = gunwale[rightIndex];
  const ratio = (x - left.x) / (right.x - left.x);
  return {
    halfBeam: left.halfBeam + (right.halfBeam - left.halfBeam) * ratio,
    z: left.z + (right.z - left.z) * ratio
  };
}

test("profil joueur: enveloppe, pare-battages et taquets sont calés sur le rail de fargue", () => {
  const profile = Physics.DEFAULT_PROFILE;
  const gunwale = profile.geometry.gunwale;
  const envelope = profile.contacts.hullEnvelope;
  assert.equal(profile.version, "5.6.0");
  assert.equal(profile.contacts.hullFriction, 0.30);
  assert.equal(profile.contacts.fenderFriction, 0.03);
  const compatible = JSON.parse(JSON.stringify(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  ));
  delete compatible.contacts.hullFriction;
  delete compatible.contacts.fenderFriction;
  compatible.contacts.friction = 0.24;
  const compiledCompatible = Physics.compileVesselProfile(compatible);
  assert.equal(compiledCompatible.contacts.hullFriction, 0.24);
  assert.equal(compiledCompatible.contacts.fenderFriction, 0.24);
  assert.equal(gunwale.length, 15);
  assert.equal(envelope.length, 30);
  assert.deepEqual(gunwale[0], { x: -4.8, halfBeam: 1.22, z: 1.137 });
  assert.deepEqual(gunwale.at(-1), { x: 5.297, halfBeam: 0, z: 1.166 });
  assert.equal(Math.max(...gunwale.map(point => point.halfBeam)), 1.795);

  for (const sample of envelope) {
    assert.ok(Number.isFinite(sample.position.x + sample.position.y + sample.radius));
    assert.ok(Math.abs(
      Math.hypot(
        sample.reference.x - sample.position.x,
        sample.reference.y - sample.position.y
      ) - sample.radius
    ) < 1e-12, `${sample.id}: le cercle doit être tangent à sa référence`);
  }
  assert.equal(Math.min(...envelope.map(sample => sample.reference.x)), -4.8);
  assert.equal(Math.max(...envelope.map(sample => sample.reference.x)), 5.297);
  assert.equal(Math.max(...envelope.map(sample => Math.abs(sample.reference.y))), 1.795);

  for (const fender of profile.contacts.fenders) {
    const distance = Math.hypot(
      fender.x - fender.attachment.x,
      fender.y - fender.attachment.y
    );
    assert.ok(Math.abs(
      distance - (profile.contacts.fenderRadius - fender.preload)
    ) < 1e-12, `${fender.id}: précharge incohérente`);
    const rail = gunwaleAt(gunwale, fender.attachment.x);
    assert.ok(Math.abs(Math.abs(fender.attachment.y) - rail.halfBeam) < 1e-12);
    assert.ok(Math.abs(fender.attachment.z - rail.z) < 1e-12);
  }

  for (const cleat of profile.mooring.cleats) {
    const distance = Math.hypot(
      cleat.x - cleat.attachment.x,
      cleat.y - cleat.attachment.y
    );
    assert.ok(Math.abs(distance - 0.07) < 1e-12, `${cleat.id}: retrait au rail incohérent`);
    assert.ok(Math.abs(cleat.z - cleat.attachment.z - 0.04) < 1e-12);
  }
});

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

function runGlancingFender(dt, inwardSpeed, { atTip = false } = {}) {
  const raw = JSON.parse(JSON.stringify(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  ));
  raw.contacts.fenders = raw.contacts.fenders.filter(
    fender => fender.id === "fender-mid-port"
  );
  const catway = {
    id: "test-catway",
    center: { east: 0, north: 0 },
    length: 12.6,
    width: 0.7,
    heading: 0,
    endShape: "rounded"
  };
  const simulator = Physics.createSimulator({
    profile: raw,
    environment: { windSpeedKn: 0, currentSpeedKn: 0, propWalk: 0 },
    obstacles: atTip
      ? { polygons: [{ id: catway.id, points: KJPCodec.catwayPlanform(catway) }] }
      : { rectangles: [{
        id: catway.id,
        east: 0,
        north: 0,
        width: catway.length,
        height: catway.width,
        heading: Math.PI / 2
      }] }
  });
  simulator.reset({
    pose: { east: atTip ? 4 : -4, north: -2.425, heading: Math.PI / 2 },
    velocity: { u: atTip ? 0.8 : 0.5, v: -inwardSpeed, r: 0 }
  });
  const duration = atTip ? 6 : 2;
  let maximumPenetration = 0;
  let maximumFrictionRatio = 0;
  let lastContactTime = null;
  for (let index = 0; index < Math.round(duration / dt); index += 1) {
    simulator.step({ throttle: 0, rudder: 0 }, dt);
    for (const contact of simulator.snapshot().contacts.current) {
      assert.equal(contact.material, "fender");
      assert.equal(contact.frictionCoefficient, 0.03);
      maximumPenetration = Math.max(maximumPenetration, contact.penetration);
      if (contact.normalForce > 0) {
        maximumFrictionRatio = Math.max(
          maximumFrictionRatio,
          Math.abs(contact.tangentForce) / contact.normalForce
        );
      }
      lastContactTime = index * dt;
    }
  }
  return {
    snapshot: simulator.snapshot(),
    maximumPenetration,
    maximumFrictionRatio,
    lastContactTime
  };
}

test("pare-battage cylindrique: roulement tangentiel sans affaiblir le contact normal", () => {
  for (const inwardSpeed of [0.15, 0.51]) {
    for (const dt of [1 / 60, 1 / 120, 1 / 240]) {
      const result = runGlancingFender(dt, inwardSpeed);
      const headingDelta = Math.abs(result.snapshot.pose.heading - Math.PI / 2);
      assert.ok(result.maximumFrictionRatio <= 0.03 + 1e-12);
      assert.ok(result.maximumPenetration < 0.08);
      if (inwardSpeed === 0.51) {
        assert.ok(result.snapshot.velocity.u >= 0.42);
        assert.ok(headingDelta < 0.5 * Math.PI / 180);
      }
    }
  }

  const raw = JSON.parse(JSON.stringify(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  ));
  raw.contacts.fenders = [];
  const simulator = Physics.createSimulator({
    profile: raw,
    obstacles: { rectangles: [{
      id: "flat-pontoon",
      east: 0,
      north: 0,
      width: 12.6,
      height: 0.7,
      heading: Math.PI / 2
    }] }
  });
  simulator.reset({
    pose: { east: -4, north: -2.15, heading: Math.PI / 2 },
    velocity: { u: 0.5, v: -0.15, r: 0 }
  });
  let hullContact = null;
  for (let index = 0; index < 120 && !hullContact; index += 1) {
    simulator.step({}, 1 / 120);
    hullContact = simulator.snapshot().contacts.current.find(
      contact => contact.material === "hull"
    );
  }
  assert.ok(hullContact, "le contact coque de contrôle doit être exercé");
  assert.equal(hullContact.frictionCoefficient, 0.30);
  assert.ok(Math.abs(hullContact.tangentForce) <= hullContact.normalForce * 0.30 + 1e-9);
});

test("embout arrondi: le pare-battage quitte le catway sans accrochage", () => {
  const results = [1 / 60, 1 / 120, 1 / 240].map(dt => runGlancingFender(dt, 0.1, {
    atTip: true
  }));
  for (const result of results) {
    assert.ok(result.lastContactTime < 1.5);
    assert.equal(result.snapshot.contacts.current.length, 0);
    assert.ok(result.snapshot.pose.east > 8.2);
    assert.ok(result.snapshot.velocity.u > 0.65);
    assert.ok(result.maximumPenetration < 0.04);
  }
  assert.ok(Math.abs(results[0].snapshot.pose.east - results[1].snapshot.pose.east) < 0.01);
  assert.ok(Math.abs(results[2].snapshot.pose.east - results[1].snapshot.pose.east) < 0.01);
});

test("pare-battage avant: la force normale conserve son bras de levier naturel", () => {
  const raw = JSON.parse(JSON.stringify(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  ));
  raw.contacts.fenders = raw.contacts.fenders.filter(
    fender => fender.id === "fender-bow-port"
  );
  const simulator = Physics.createSimulator({
    profile: raw,
    obstacles: { rectangles: [{
      id: "catway-side",
      east: 0,
      north: 0,
      width: 12.6,
      height: 0.7,
      heading: Math.PI / 2
    }] }
  });
  const initialHeading = 75 * Math.PI / 180;
  simulator.reset({
    pose: { east: -3, north: -2.55, heading: initialHeading },
    velocity: { u: 0.5, v: 0, r: 0 }
  });
  const materials = new Set();
  for (let index = 0; index < 240; index += 1) {
    simulator.step({}, 1 / 120);
    for (const contact of simulator.snapshot().contacts.current) {
      materials.add(contact.material);
    }
  }
  const result = simulator.snapshot();
  assert.deepEqual([...materials], ["fender"]);
  assert.ok(result.pose.heading > initialHeading, "l'étrave doit s'écarter du catway");
  assert.ok(result.velocity.u > 0.4, "le contact avant ne doit pas immobiliser le bateau");
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
