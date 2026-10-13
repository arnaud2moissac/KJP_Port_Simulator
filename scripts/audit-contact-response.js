"use strict";

// Diagnostic only: exercise the real core, never replace its contact law.
// Synthetic single-point cases are not vessel profiles or release fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const Physics = require("../src/simulateur-port/physics-core.js");
const clone = value => structuredClone(value);
const wall = { id: "audit-quay", east: -10, north: 0, width: 20, height: 100, heading: Math.PI / 2 };
const zeroEnvironment = { windSpeedKn: 0, currentSpeedKn: 0, propWalk: 0 };

function kinetic(snapshot) {
  const v = [snapshot.velocity.u, snapshot.velocity.v, snapshot.velocity.r];
  return .5 * v.reduce((sum, value, i) => sum + value
    * snapshot.massMatrix[i].reduce((row, coefficient, j) => row + coefficient * v[j], 0), 0);
}

function points(profile) {
  return [
    ...profile.contacts.fenders.map(f => ({ x: f.x, y: f.y, radius: profile.contacts.fenderRadius, stiffness: profile.contacts.fenderStiffness })),
    ...profile.contacts.hullEnvelope.map(p => ({ x: p.position.x, y: p.position.y, radius: p.radius, stiffness: profile.contacts.hullStiffness }))
  ];
}

function springEnergy(snapshot, contactPoints, obstacle) {
  // Post-processing of the existing linear spring, not a second force solver.
  return contactPoints.reduce((sum, point) => {
    const world = Physics.localPointToWorld(snapshot.pose, point.x, point.y);
    const penetration = Math.max(0, point.radius - Physics.pointRectContact(world.east, world.north, obstacle).distance);
    return sum + .5 * point.stiffness * penetration ** 2;
  }, 0);
}

function singlePoint(profile, material) {
  const copy = clone(profile);
  // Identical contact location/radius; only material-specific core properties differ.
  copy.contacts.fenders = material === "fender"
    ? [{ ...copy.contacts.fenders[0], id: "audit-fender", x: 0, y: 0 }] : [];
  copy.contacts.hullEnvelope = material === "hull"
    ? [{ ...copy.contacts.hullEnvelope[0], id: "audit-hull", position: { x: 0, y: 0, z: 0 }, radius: .175 }] : [];
  copy.contacts.fenderRadius = .175;
  return copy;
}

function runImpact(profile, { material, speed, hz, geometry }) {
  const simulator = Physics.createSimulator({ profile, obstacles: { rectangles: [wall] }, environment: zeroEnvironment });
  const initialEast = Math.max(...points(profile).map(p => -p.x + p.radius)) + .01;
  simulator.reset({ pose: { east: initialEast, north: 0, heading: Math.PI / 2 }, velocity: { u: -speed, v: 0, r: 0 } });
  const initial = simulator.snapshot();
  const initialEnergy = kinetic(initial);
  const samplePoints = points(profile);
  let first = null, release = null, beforeImpact = null, previous = initial;
  let maxPenetration = 0, peakForce = 0, maxEnergy = initialEnergy, maxMechanicalEnergy = initialEnergy, correctionThresholdReached = false, forceLimitReached = false;
  const types = new Set();
  for (let i = 0; i < 8 * hz; i++) {
    const snapshot = simulator.step({ throttle: 0, rudder: 0, gear: 0 }, 1 / hz);
    for (const value of [...Object.values(snapshot.pose), ...Object.values(snapshot.velocity)]) assert.ok(Number.isFinite(value));
    maxEnergy = Math.max(maxEnergy, kinetic(snapshot));
    maxMechanicalEnergy = Math.max(maxMechanicalEnergy, kinetic(snapshot) + springEnergy(snapshot, samplePoints, wall));
    if (snapshot.contacts.current.length) {
      if (first === null) { first = snapshot.time; beforeImpact = previous; }
      for (const contact of snapshot.contacts.current) {
        types.add(contact.type);
        maxPenetration = Math.max(maxPenetration, contact.penetration);
        peakForce = Math.max(peakForce, contact.normalForce);
        correctionThresholdReached ||= contact.penetration > .045;
        forceLimitReached ||= contact.normalForce >= profile.contacts.forceLimit * (1 - 1e-9);
      }
    } else if (first !== null && snapshot.diagnostics.groundVelocity.east > 0) {
      // Require geometric separation as well: the contact list is evaluated within a step.
      const separated = samplePoints.every(point => {
        const world = Physics.localPointToWorld(snapshot.pose, point.x, point.y);
        return Physics.pointRectContact(world.east, world.north, wall).distance >= point.radius;
      });
      if (separated) { release = snapshot; break; }
    }
    previous = snapshot;
  }
  assert.ok(first !== null && release && beforeImpact, `${profile.id}/${material}/${speed}: impact and release required`);
  assert.ok(maxEnergy <= initialEnergy * 1.002 + 1e-6, "kinetic energy exceeds initially available energy");
  assert.ok(maxMechanicalEnergy <= initialEnergy * 1.002 + 1e-6, "kinetic plus spring energy exceeds initially available energy");
  const incoming = -beforeImpact.diagnostics.groundVelocity.east;
  return {
    profileId: profile.id, profileVersion: profile.version, massKg: profile.mass.displacement,
    material, geometry, speedMs: speed, hz, incomingMs: incoming,
    outgoingMs: release.diagnostics.groundVelocity.east,
    apparentRestitution: release.diagnostics.groundVelocity.east / incoming,
    impactDurationS: release.time - first,
    peakForceN: peakForce, maxPenetrationM: maxPenetration,
    incomingEnergyJ: kinetic(beforeImpact), outgoingEnergyJ: kinetic(release),
    outgoingEnergyRatio: kinetic(release) / kinetic(beforeImpact),
    maximumKineticRatio: maxEnergy / initialEnergy,
    maximumMechanicalRatio: maxMechanicalEnergy / initialEnergy,
    correctionThresholdReached, forceLimitReached, contactTypes: [...types],
    headingChangeRad: release.pose.heading - initial.pose.heading
  };
}

function runSideApproach({ noFenders = false, windSpeedKn = 0, speed = .15 }) {
  const profile = clone(Physics.DEFAULT_PROFILE);
  if (noFenders) profile.contacts.fenders = [];
  const reach = Math.max(...points(profile).map(p => -p.y + p.radius));
  const quay = { id: "side-quay", east: 0, north: 0, width: 100, height: .7, heading: Math.PI / 2 };
  const simulator = Physics.createSimulator({ profile, obstacles: { rectangles: [quay] }, environment: {
    ...zeroEnvironment, windSpeedKn, windFromDeg: 180
  } });
  simulator.reset({ pose: { east: 0, north: -.35 - reach - .03, heading: Math.PI / 2 }, velocity: { u: 0, v: -speed, r: 0 } });
  let first = null, release = null, incoming = null, outgoing = null, previous = simulator.snapshot();
  let peakForce = 0, penetration = 0, contactFramesLastTenSeconds = 0, contactBeginnings = 0, wasContact = false;
  let maximumSeparationAfterRelease = null;
  const contactPoints = points(profile);
  const types = new Set();
  for (let i = 0; i < 40 * 120; i++) {
    const snapshot = simulator.step({ throttle: 0, rudder: 0, gear: 0 }, 1 / 120);
    const contact = snapshot.contacts.current.length > 0;
    if (contact && !wasContact) contactBeginnings++;
    if (contact && first === null) { first = snapshot.time; incoming = previous.diagnostics.groundVelocity.north; }
    if (!contact && first !== null && release === null && snapshot.diagnostics.groundVelocity.north < 0) {
      release = snapshot.time; outgoing = -snapshot.diagnostics.groundVelocity.north;
      maximumSeparationAfterRelease = 0;
    }
    if (release !== null) {
      const gap = Math.min(...contactPoints.map(point => {
        const world = Physics.localPointToWorld(snapshot.pose, point.x, point.y);
        return Physics.pointRectContact(world.east, world.north, quay).distance - point.radius;
      }));
      maximumSeparationAfterRelease = Math.max(maximumSeparationAfterRelease, gap);
    }
    if (snapshot.time > 30 && contact) contactFramesLastTenSeconds++;
    for (const item of snapshot.contacts.current) {
      types.add(item.type); peakForce = Math.max(peakForce, item.normalForce); penetration = Math.max(penetration, item.penetration);
    }
    for (const value of [...Object.values(snapshot.pose), ...Object.values(snapshot.velocity)]) assert.ok(Number.isFinite(value));
    previous = snapshot; wasContact = contact;
  }
  const final = simulator.snapshot();
  return {
    noFenders, windSpeedKn, speedMs: speed, firstContactS: first, firstReleaseS: release,
    apparentFirstRestitution: release !== null ? outgoing / incoming : null,
    firstIncomingMs: incoming, firstOutgoingMs: outgoing, contactBeginnings,
    contactFractionLastTenSeconds: contactFramesLastTenSeconds / 1200,
    peakForceN: peakForce, maxPenetrationM: penetration, contactTypes: [...types],
    finalGroundSpeedMs: final.diagnostics.groundSpeed, finalYawRateRadS: final.velocity.r,
    finalNormalSpeedMs: final.diagnostics.groundVelocity.north,
    finalTangentialSpeedMs: final.diagnostics.groundVelocity.east,
    headingChangeRad: final.pose.heading - Math.PI / 2,
    maximumSeparationAfterReleaseM: maximumSeparationAfterRelease
  };
}

function audit() {
  const isolated = [];
  for (const profile of Object.values(Physics.COMPILED_PROFILES)) {
    for (const material of ["fender", "hull"]) {
      const diagnosticProfile = singlePoint(profile, material);
      for (const speed of [.05, .15, .3, .6]) {
        for (const hz of [120, 240, 480]) {
          isolated.push(runImpact(diagnosticProfile, { material, speed, hz, geometry: "synthetic-single-point" }));
        }
      }
    }
  }
  const realistic = [
    runSideApproach({ speed: .05 }), runSideApproach({ speed: .15 }),
    runSideApproach({ noFenders: true, speed: .05 }), runSideApproach({ noFenders: true, speed: .15 }),
    runSideApproach({ speed: 0, windSpeedKn: 15 })
  ];
  const report = {
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" }).trim(),
    physicsVersion: Physics.VERSION, referenceProfile: Physics.DEFAULT_PROFILE.id, referenceProfileVersion: Physics.DEFAULT_PROFILE.version,
    method: "Core API; quays fixed; no waves/current/lines; water forces retained. Single-point diagnostic geometry is not a vessel. Apparent restitution is not measured material restitution.",
    frequencyNote: "120/240/480 Hz are real integration steps; a 60 Hz caller is internally subdivided to 120 Hz.",
    isolated, realistic
  };
  const outputIndex = process.argv.indexOf("--out");
  if (outputIndex >= 0) fs.writeFileSync(path.resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2) + "\n");
  if (outputIndex >= 0) console.log(`${isolated.length} isolated impacts + ${realistic.length} side approaches; saved ${process.argv[outputIndex + 1]}`);
  else console.log(JSON.stringify(report, null, 2));
  return report;
}
if (require.main === module) audit();
module.exports = { audit };
