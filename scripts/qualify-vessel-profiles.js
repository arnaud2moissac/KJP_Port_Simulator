"use strict";

// Banc sans DOM : les efforts et l'intégration restent exclusivement dans le moteur.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { once } = require("node:events");
const { finished } = require("node:stream/promises");
const Physics = require("../src/simulateur-port/physics-core.js");
const KNOT = Physics.KNOT;
const DEG = Physics.DEG;
const DT = 1 / 120;
const NOMINAL = Object.freeze({ windSpeedKn: 0, windFromDeg: 0, currentSpeedKn: 0, currentFromDeg: 0, propWalk: 0.6 });
const NEUTRAL = Object.freeze({ gear: 0, throttle: 0, rudder: 0 });

function fingerprint(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function energy(snapshot) {
  const v = [snapshot.velocity.u, snapshot.velocity.v, snapshot.velocity.r];
  return v.reduce((sum, left, i) => sum + v.reduce((row, right, j) => row + 0.5 * left * snapshot.massMatrix[i][j] * right, 0), 0);
}

function scenarioDefinitions() {
  const cases = [];
  const add = (family, suffix, seconds, options = {}) => cases.push({ id: family + "." + suffix, family, seconds, ...options });
  for (const throttle of [0, 0.15, 0.30, 0.50]) add("A", String(throttle), 30, { gear: 1, throttle });
  for (const throttle of [0, 0.30, 0.60]) add("B", String(throttle), 240, { uKn: 2, gear: throttle ? -1 : 0, throttle, stopping: true });
  add("B2", "loaded", 240, { loadedReversal: true });
  for (const propWalk of [0.6, 0]) for (const throttle of [0, 0.15, 0.30, 0.50]) {
    add("C", throttle + ".walk" + propWalk, 30, { gear: -1, throttle, environment: { propWalk } });
  }
  for (const [family, uKn, gear] of [["D", 2, 1], ["E", -1, -1]]) for (const rudderDeg of [-25, -15, 15, 25]) {
    add(family, String(rudderDeg), 120, { uKn, gear, throttle: 0.30, rudderDeg });
  }
  for (const uKn of [0, 0.25, -0.25]) for (const gear of [0, 1, -1]) for (const rudderDeg of [0, -15, 15, -25, 25]) {
    add("F", [uKn, gear, rudderDeg].join("."), 10, { uKn, gear, throttle: gear ? 0.15 : 0, rudderDeg, environment: { propWalk: 0 } });
  }
  for (const windSpeedKn of [6, 12, 20]) for (const windFromDeg of [90, 270]) for (const uKn of [0, 1]) {
    add("G", [windSpeedKn, windFromDeg, uKn].join("."), 120, { uKn, environment: { windSpeedKn, windFromDeg } });
  }
  for (const uKn of [0, 0.25, -0.25]) for (const gear of [1, -1]) for (const throttle of [0.15, 0.30]) for (const propWalk of [0.6, 0]) {
    add("H", [uKn, gear, throttle, propWalk].join("."), 20, { uKn, gear, throttle, environment: { propWalk } });
  }
  for (const mirror of [1, -1]) add("I", String(mirror), 60, { mirror });
  for (const vKn of [-0.2, 0.2]) add("J", "sway" + vKn, 60, { uKn: 2, vKn });
  for (const uKn of [0, 2]) for (const rDegS of [-2, 2]) add("J", "yaw" + uKn + "." + rDegS, 60, { uKn, rDegS });
  for (const speedKn of [0.2, 0.5]) for (const glancing of [false, true]) add("K", "contact." + speedKn + "." + glancing, 60, { contact: true, speedKn, glancing });
  for (const mooringMode of ["slack", "taut", "wind"]) add("K", "mooring." + mooringMode, 60, { mooringMode, environment: mooringMode === "wind" ? { windSpeedKn: 12, windFromDeg: 90 } : {} });
  return cases;
}

function setup(profile, definition, physics) {
  const environment = { ...NOMINAL, ...definition.environment };
  const halfBeam = profile.dimensions.beam / 2;
  const velocity = { u: (definition.uKn || 0) * KNOT, v: (definition.vKn || 0) * KNOT, r: (definition.rDegS || 0) * DEG };
  let obstacles = {};
  if (definition.contact) {
    velocity.v = definition.speedKn * KNOT;
    velocity.u = definition.glancing ? definition.speedKn * KNOT : 0;
    const extent = Math.max(...profile.contacts.fenders.map(f => Math.abs(f.y) + profile.contacts.fenderRadius));
    obstacles = { rectangles: [{ id: "qualification-wall", east: extent + 0.55, north: 0, width: 1, height: profile.dimensions.lengthOverall * 8 }] };
  }
  const simulator = physics.createSimulator({ profile, environment, obstacles });
  simulator.reset({ pose: { east: 0, north: 0, heading: 0 }, velocity });
  if (definition.mooringMode) {
    for (const cleat of profile.mooring.cleats.filter(c => c.station !== "mid")) {
      const outward = cleat.side === "port" ? -1 : 1;
      const offset = physics.bodyToWorld(cleat.x, cleat.y + outward * 3, 0);
      const attached = simulator.attachMooring({ id: "line-" + cleat.id, boatCleatId: cleat.id, shoreCleatId: "shore-" + cleat.id,
        shorePoint: { east: offset.east, north: offset.north, z: cleat.z }, length: definition.mooringMode === "slack" ? 3.5 : 3 });
      if (!attached.ok) throw new Error(profile.id + ": " + attached.reason);
    }
  }
  return { simulator, environment };
}

function commands(definition, time, reversed) {
  if (definition.loadedReversal) return { gear: reversed ? -1 : 1, throttle: reversed ? 0.60 : 0.30, rudder: 0 };
  if (definition.family === "I") {
    const phase = time % 20;
    return phase < 8 ? { gear: 1, throttle: 0.25, rudder: definition.mirror * 25 * DEG }
      : phase < 10 ? NEUTRAL : phase < 18 ? { gear: -1, throttle: 0.25, rudder: -definition.mirror * 25 * DEG } : NEUTRAL;
  }
  return { gear: definition.gear || 0, throttle: definition.throttle || 0, rudder: (definition.rudderDeg || 0) * DEG };
}

function compact(snapshot, inspection, heading, distance) {
  return { time: snapshot.time, pose: snapshot.pose, headingUnwrapped: heading, velocity: snapshot.velocity, waterRelative: snapshot.waterRelative,
    groundSpeed: snapshot.diagnostics.groundSpeed, waterSpeed: snapshot.diagnostics.waterSpeed, distance, energy: energy(snapshot),
    acceleration: inspection.acceleration, total: inspection.total,
    forces: inspection.forces.map(f => ({ source: f.source, X: f.X, Y: f.Y, N: f.N, applicationPoint: f.applicationPoint, power: f.power, category: f.category })),
    propulsion: snapshot.propulsion.units.map(p => ({ id: p.id, engineRpm: p.engineRpm, shaftRps: p.shaftRps, gearState: p.gearState,
      enginePower: p.enginePower, shaftPower: p.shaftPower })),
    propellers: inspection.propeller.units, rudders: inspection.rudder.units, appendages: inspection.appendages, wind: inspection.wind,
    contacts: snapshot.contacts.current, moorings: snapshot.moorings.map(m => ({ id: m.id, tension: m.tension, strain: m.strain,
      length: m.length, distance: m.distance, extension: m.extension, taut: m.taut,
      elasticEnergy: m.elasticEnergy, guardActive: m.guardActive })) };
}

function runScenario(profile, definition, options = {}) {
  const physics = options.physics || Physics;
  const dt = options.dt || DT;
  const { simulator, environment } = setup(profile, definition, physics);
  let previous = simulator.snapshot();
  let heading = previous.pose.heading;
  let distance = 0;
  let reversedAt = null;
  let reversedSpeedKn = null;
  let reversalDistance = 0;
  let nextSample = 0;
  let resultStatus = "completed";
  let commandShifts = 0;
  let previousGear = 0;
  let effectiveShifts = 0;
  let previousEffective = "neutral";
  let domainWind = false;
  const samples = [];
  const milestones = {};
  const events = [];
  const metrics = { maximumSpeedKn: 0, maximumLateralAcceleration: 0, peakContactForceN: 0, peakPenetrationM: 0,
    peakTensionN: 0, peakStrain: 0, mooringGuardSteps: 0, stoppedAtS: null, stoppedDistanceM: null, surgeSignChangedAtS: null,
    heading90AtS: null, advance90M: null, transfer90M: null, advance180M: null, transfer180M: null,
    target1KnAtS: null, target2KnAtS: null, target3KnAtS: null, opposingThrustDelayS: null, maximumYawRateRadS: 0,
    minEast: Infinity, maxEast: -Infinity, minNorth: Infinity, maxNorth: -Infinity };
  const initial = previous;
  const seconds = options.seconds === undefined ? definition.seconds : Math.min(options.seconds, definition.seconds);
  const count = Math.round(seconds / dt);
  const sample = snapshot => {
    const inspection = simulator.inspectForces();
    for (const p of inspection.wind.panels || []) if (p.speed > 20 * KNOT) domainWind = true;
    const value = compact(snapshot, inspection, heading, distance);
    if (options.record !== false) samples.push(value);
    for (const t of [0.5, 1, 2, 5, 10, 20, 30]) if (Math.abs(snapshot.time - t) < dt / 2) milestones[String(t)] = value;
    return inspection;
  };
  const mark = (type, snapshot, input) => events.push({ type, command: input,
    state: compact(snapshot, simulator.inspectForces(), heading, distance) });
  sample(previous);
  for (let index = 0; index < count; index++) {
    const time = index * dt;
    const reverseNow = definition.forcedReverseS === undefined ? previous.velocity.u >= 2 * KNOT : time + 1e-9 >= definition.forcedReverseS;
    if (definition.loadedReversal && reversedAt === null && reverseNow) {
      reversedAt = time; reversedSpeedKn = previous.velocity.u / KNOT; reversalDistance = distance;
      mark("loaded-reversal", previous, commands(definition, time, true));
    }
    if (definition.loadedReversal && reversedAt === null && time >= 120) { resultStatus = "target-not-reached"; break; }
    if (reversedAt !== null && time - reversedAt >= 120) { resultStatus = "stop-not-reached"; break; }
    const input = commands(definition, time, reversedAt !== null);
    if (input.gear !== previousGear) { commandShifts++; previousGear = input.gear; }
    const next = simulator.step(input, dt);
    if (![next.pose.east, next.pose.north, next.pose.heading, ...Object.values(next.velocity)].every(Number.isFinite)) throw new Error("État non fini : " + profile.id + "/" + definition.id);
    distance += Math.hypot(next.pose.east - previous.pose.east, next.pose.north - previous.pose.north);
    heading += physics.wrapAngle(next.pose.heading - previous.pose.heading);
    const speed = next.diagnostics.waterSpeed / KNOT;
    metrics.maximumSpeedKn = Math.max(metrics.maximumSpeedKn, speed);
    metrics.maximumLateralAcceleration = Math.max(metrics.maximumLateralAcceleration, Math.abs((next.velocity.v - previous.velocity.v) / dt));
    metrics.maximumYawRateRadS = Math.max(metrics.maximumYawRateRadS, Math.abs(next.velocity.r));
    const effective = next.propulsion.units[0].gearState;
    if ((effective === "ahead" || effective === "astern") && effective !== previousEffective) { effectiveShifts++; previousEffective = effective; }
    for (const station of profile.geometry.gunwale) for (const side of [-1, 1]) {
      const p = physics.bodyToWorld(station.x, station.halfBeam * side, next.pose.heading);
      metrics.minEast = Math.min(metrics.minEast, next.pose.east + p.east); metrics.maxEast = Math.max(metrics.maxEast, next.pose.east + p.east);
      metrics.minNorth = Math.min(metrics.minNorth, next.pose.north + p.north); metrics.maxNorth = Math.max(metrics.maxNorth, next.pose.north + p.north);
    }
    for (const c of next.contacts.current) {
      metrics.peakContactForceN = Math.max(metrics.peakContactForceN, c.normalForce);
      metrics.peakPenetrationM = Math.max(metrics.peakPenetrationM, c.penetration);
    }
    for (const m of next.moorings) {
      metrics.peakTensionN = Math.max(metrics.peakTensionN, m.tension); metrics.peakStrain = Math.max(metrics.peakStrain, m.strain);
      if (m.guardActive) metrics.mooringGuardSteps++;
    }
    for (const target of [1, 2, 3]) if (metrics["target" + target + "KnAtS"] === null && Math.abs(next.velocity.u) >= target * KNOT) {
      metrics["target" + target + "KnAtS"] = next.time; mark("speed-" + target + "-kn", next, input);
    }
    const deltaHeading = Math.abs(heading - initial.pose.heading);
    if (metrics.heading90AtS === null && deltaHeading >= Math.PI / 2) { metrics.heading90AtS = next.time; metrics.advance90M = next.pose.north; metrics.transfer90M = next.pose.east; }
    if (metrics.advance180M === null && deltaHeading >= Math.PI) { metrics.advance180M = next.pose.north; metrics.transfer180M = next.pose.east; }
    const stopping = definition.stopping || reversedAt !== null;
    if (stopping && metrics.stoppedAtS === null && next.diagnostics.waterSpeed < 0.1 * KNOT) {
      metrics.stoppedAtS = next.time - (reversedAt || 0); metrics.stoppedDistanceM = distance - reversalDistance;
      mark("below-0.1-kn", next, input);
    }
    if (stopping && metrics.surgeSignChangedAtS === null && previous.velocity.u > 0 && next.velocity.u <= 0) {
      metrics.surgeSignChangedAtS = next.time - (reversedAt || 0); mark("surge-zero", next, input);
    }
    if (stopping && metrics.opposingThrustDelayS === null && next.propulsion.thrust < 0) {
      metrics.opposingThrustDelayS = next.time - (reversedAt || 0); mark("opposing-thrust", next, input);
    }
    if (next.time + dt / 2 >= nextSample + 0.1) { sample(next); nextSample += 0.1; }
    previous = next;
    if (speed > 4) { resultStatus = "speed-domain-exceeded"; mark("speed-domain-exceeded", next, input); break; }
    // Garder le premier passage u=0 après le seuil d'arrêt en marche arrière.
    // Au neutre, aucun changement de signe n'est exigé pour terminer l'arrêt.
    if (!options.fixedDuration && stopping && metrics.stoppedAtS !== null
      && (input.gear === 0 || metrics.surgeSignChangedAtS !== null)) break;
  }
  const final = simulator.snapshot();
  const inspection = simulator.inspectForces();
  if (options.record !== false && samples.at(-1)?.time !== final.time) sample(final);
  if ((definition.stopping || definition.loadedReversal) && metrics.stoppedAtS === null && metrics.surgeSignChangedAtS === null && resultStatus === "completed") resultStatus = "stop-not-reached";
  const radius = Math.abs(final.velocity.r) > 1e-5 ? final.diagnostics.waterSpeed / Math.abs(final.velocity.r) : null;
  // Rayon instantané uniquement : aucune hypothèse de cercle stabilisé.
  Object.assign(metrics, { durationS: final.time, distanceM: distance, distanceLwl: distance / profile.dimensions.waterline,
    headingChangeDeg: (heading - initial.pose.heading) / DEG, commandShifts, effectiveShifts, reversedAtS: reversedAt, reversedSpeedKn,
    finalSpeedKn: final.diagnostics.waterSpeed / KNOT, finalYawRateRadS: final.velocity.r, instantaneousRadiusM: radius,
    sweptWidthM: metrics.maxEast - metrics.minEast, sweptLengthM: metrics.maxNorth - metrics.minNorth,
    initialEnergyJ: energy(initial), finalEnergyJ: energy(final), apparentWindOutside20Kn: domainWind });
  return { scenario: definition, environment, dt, status: resultStatus, metrics, milestones,
    initial, final, finalInspection: inspection, events, samples };
}

function convergence(profile, definition, options = {}) {
  let target = definition;
  let seconds = options.seconds === undefined ? definition.seconds : options.seconds;
  if (definition.loadedReversal) {
    const preparation = runScenario(profile, definition, { record: false });
    if (preparation.metrics.reversedAtS === null) return { scenarioId: definition.id, pass: false, reason: "entry-speed-not-reached" };
    target = { ...definition, forcedReverseS: preparation.metrics.reversedAtS };
    seconds = preparation.metrics.reversedAtS + Math.min(5, preparation.metrics.stoppedAtS || 5);
  }
  const requestedDurationS = seconds;
  const domainCheck = runScenario(profile, target, { seconds, fixedDuration: true, record: false });
  const domainLimited = domainCheck.status === "speed-domain-exceeded";
  // Comparer un horizon commun situé avant le franchissement du domaine,
  // jamais trois instants d'arrêt dépendant chacun de la fréquence.
  if (domainLimited) seconds = Math.floor((domainCheck.metrics.durationS - 2 * DT) / DT) * DT;
  const runs = [120, 240, 480].map(hz => runScenario(profile, target, { ...options, seconds, fixedDuration: true, dt: 1 / hz, record: false }));
  const error = (a, b) => ({ positionM: Math.hypot(a.final.pose.east - b.final.pose.east, a.final.pose.north - b.final.pose.north),
    headingRad: Math.abs(Physics.wrapAngle(a.final.pose.heading - b.final.pose.heading)),
    speedMps: Math.hypot(a.final.velocity.u - b.final.velocity.u, a.final.velocity.v - b.final.velocity.v),
    yawRadS: Math.abs(a.final.velocity.r - b.final.velocity.r), durationS: Math.abs(a.final.time - b.final.time) });
  const comparisons = [error(runs[0], runs[1]), error(runs[1], runs[2])];
  const within = e => e.positionM <= profile.dimensions.lengthOverall * 0.01 && e.headingRad <= 0.5 * DEG && e.speedMps <= 0.01 && e.yawRadS <= 0.001 && e.durationS < 1e-7;
  return { scenarioId: definition.id, frequencies: [120, 240, 480], commandReversalAtS: target.forcedReverseS ?? null,
    requestedDurationS, durationS: seconds, domainLimited, comparisons, pass: comparisons.every(within) };
}

// Quadrature géométrique de diagnostic, jamais une nouvelle loi hydrodynamique.
function discretizeAppendageOutline(outline, count, template) {
  const clip = (points, edge, greater) => {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const insideA = greater ? a[0] >= edge : a[0] <= edge;
      const insideB = greater ? b[0] >= edge : b[0] <= edge;
      if (insideA) result.push(a);
      if (insideA !== insideB) { const t = (edge - a[0]) / (b[0] - a[0]); result.push([edge, a[1] + t * (b[1] - a[1])]); }
    }
    return result;
  };
  const min = Math.min(...outline.map(p => p[0])), max = Math.max(...outline.map(p => p[0]));
  return Array.from({ length: count }, (_, i) => {
    const polygon = clip(clip(outline, min + (max - min) * i / count, true), min + (max - min) * (i + 1) / count, false);
    let area = 0, mx = 0, mz = 0;
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j], b = polygon[(j + 1) % polygon.length], cross = a[0] * b[1] - b[0] * a[1];
      area += cross; mx += (a[0] + b[0]) * cross; mz += (a[1] + b[1]) * cross;
    }
    return { ...structuredClone(template), id: "outline-band-" + (i + 1), area: Math.abs(area / 2), position: { x: mx / (3 * area), y: 0, z: mz / (3 * area) } };
  });
}

function sensitivityReport(profile) {
  const raw = Physics.RAW_PROFILES[profile.id];
  const groups = [
    ["mass.displacement"], ["geometry.wettedArea"], ["geometry.lpp"],
    ["mass.yawRadius"], ["mass.addedMassModel.surgeMassRatio"], ["mass.addedMassModel.sectionalScale"],
    ["geometry.canoeDraft"], ["hull.axialResistance.surgeLinear"], ["hull.axialResistance.surgeQuadratic"],
    ["hull.axialResistance.waveRise"], ["hull.axialResistance.waveOnset"], ["hull.crossFlow.cd"], ["hull.crossFlow.areaFactor"], ["hull.crossFlow.linearDampingFroude"],
    ...["dx", "breadthFactor", "shape"].map(field => raw.geometry.hullSections.map((_, i) => "geometry.hullSections." + i + "." + field)),
    ...["area", "span", "aspectRatio", "position.x", "coefficients.efficiency", "coefficients.cd0", "coefficients.normalCd90", "coefficients.stallStartDeg", "coefficients.stallEndDeg"].map(field => raw.appendages.map((_, i) => "appendages." + i + "." + field)),
    ...["area", "span", "aspectRatio", "position.x", "position.y", "position.z", "stock.chordFraction", "maxAngleDeg", "coefficients.efficiency", "coefficients.cd0", "coefficients.normalCd90", "coefficients.stallStartDeg", "coefficients.stallEndDeg", "slipstream.contractionRatio", "slipstream.downstreamVelocityFactor", "slipstream.upstreamVelocityFactor", "slipstream.swirlFraction", "slipstream.flowStraightening", "slipstream.momentumSafetyFactor"].map(field => raw.rudders.map((_, i) => "rudders." + i + "." + field)),
    ["steering.maximumRudderRateDegS"],
    ...["position.x", "position.z", "engine.idleRpm", "engine.maxRpm", "engine.dynamics.inertiaKgM2", "engine.dynamics.frictionNm", "engine.dynamics.governorKpNmPerRadS", "engine.dynamics.governorKiNmPerRad", "gearbox.ratioAhead", "gearbox.ratioAstern", "gearbox.efficiency", "gearbox.clutch.capacityEngineNm", "gearbox.clutch.stiffnessNmPerRadS", "gearbox.clutch.disengageTimeS", "gearbox.clutch.neutralDwellS", "gearbox.clutch.engageTimeS", "propeller.shaft.inertiaKgM2", "propeller.shaft.viscousFrictionNmPerRadS", "propeller.shaft.coulombFrictionNm"].map(field => ["propulsors.0." + field]),
    raw.propulsors[0].engine.dynamics.torqueCurve.map((_, i) => "propulsors.0.engine.dynamics.torqueCurve." + i + ".torqueNm"),
    ...["thrust", "torque"].map(field => raw.propulsors[0].propeller.fourQuadrant[field].map((_, i) => "propulsors.0.propeller.fourQuadrant." + field + "." + i)),
    ["propulsors.0.propeller.diameter"], ["propulsors.0.propeller.pitch"], ["propulsors.0.propeller.expandedAreaRatio"],
    ["propulsors.0.transverseWalk.base"], ["propulsors.0.transverseWalk.gain"],
    ["aerodynamics.referenceWindHeight"], ["aerodynamics.verticalProfile.exponent"],
    ...["area", "cdNormal", "cdTangential", "exposure", "center.x", "center.z"].map(field => raw.aerodynamics.panels.map((_, i) => "aerodynamics.panels." + i + "." + field)),
    ["contacts.fenderStiffness"], ["contacts.hullStiffness"], ["contacts.dampingRatio"],
    ["contacts.fenderRadius"], ["contacts.hullRadius"], ["contacts.hullFriction"], ["contacts.fenderFriction"], ["contacts.forceLimit"],
    ...["maxLength", "maximumHaulInducedSpeed", "humanPullForce", "haulInRate", "payOutRate", "tautTolerance", "elasticity.workingLoadN", "elasticity.dampingRatio", "elasticity.hardeningGain", "elasticity.workingStrain", "elasticity.maximumStrain"].map(field => ["mooring." + field])
  ];
  const get = (object, field) => field.split(".").reduce((value, key) => value[key], object);
  const set = (object, field, value) => { const keys = field.split("."), key = keys.pop(); get(object, keys.join("."))[key] = value; };
  const cases = scenarioDefinitions();
  const records = [];
  for (const fields of groups) for (const factor of [.8, 1.2]) {
    const next = structuredClone(raw);
    let bounded = false;
    for (const field of fields) {
      let value = get(raw, field) * factor;
      if (field.endsWith("position.x") || field.endsWith("center.x")) { const limit = [raw.geometry.gunwale[0].x + .05, raw.geometry.gunwale.at(-1).x - .05]; const clamped = Math.min(limit[1], Math.max(limit[0], value)); bounded ||= clamped !== value; value = clamped; }
      if (field.startsWith("rudders.") && field.endsWith("position.z")) { const rudder = raw.rudders[Number(field.split(".")[1])]; const clamped = Math.min(-rudder.span / 2 - .02, Math.max(-raw.geometry.draft + rudder.span / 2, value)); bounded ||= clamped !== value; value = clamped; }
      if (field.startsWith("rudders.") && field.endsWith(".span")) { const rudder = raw.rudders[Number(field.split(".")[1])]; const clamped = Math.min(value, 2 * Math.min(-rudder.position.z - .02, raw.geometry.draft + rudder.position.z)); bounded ||= clamped !== value; value = clamped; }
      if (field === "propulsors.0.position.z") { const radius = raw.propulsors[0].propeller.diameter / 2; const clamped = Math.min(-radius - .02, Math.max(-raw.geometry.draft + radius, value)); bounded ||= clamped !== value; value = clamped; }
      if (field === "mooring.elasticity.workingStrain") { const clamped = Math.min(raw.mooring.elasticity.maximumStrain - .001, value); bounded ||= clamped !== value; value = clamped; }
      if (field === "mooring.elasticity.maximumStrain") { const clamped = Math.max(raw.mooring.elasticity.workingStrain + .001, value); bounded ||= clamped !== value; value = clamped; }
      if (field.endsWith("gearbox.efficiency") || field.endsWith("coefficients.efficiency") || field.endsWith("breadthFactor") || field.endsWith(".shape") || field.endsWith(".exposure") || field.endsWith("flowStraightening")) { const clamped = Math.min(1, value); bounded ||= clamped !== value; value = clamped; }
      set(next, field, value);
    }
    const compiled = Physics.compileVesselProfile(next);
    const simulator = Physics.createSimulator({ profile: compiled, environment: { ...NOMINAL, propWalk: 0 } });
    simulator.reset({ velocity: { u: .7, v: .15, r: .02 } });
    const inspection = simulator.inspectForces();
    const passive = inspection.forces.filter(f => f.category === "passive").every(f => f.power <= 1e-7);
    const caseId = fields[0].startsWith("contacts.") ? "K.contact.0.5.false" : fields[0].startsWith("mooring.") ? "K.mooring.wind" : fields[0].startsWith("aerodynamics.") ? "G.12.90.0" : "D.25";
    const result = runScenario(compiled, cases.find(d => d.id === caseId), { seconds: 8, record: false });
    const finite = [...Object.values(result.final.pose), ...Object.values(result.final.velocity)].every(Number.isFinite);
    records.push({ fields, factor, bounded, actual: fields.map(field => get(next, field)), passive, finite,
      massPositive: Physics.massMatrixIsPositiveDefinite(Physics.computeMassMatrix(compiled).matrix), scenarioId: caseId, metrics: result.metrics });
  }
  return { profileId: profile.id, method: "one independent parameter family at a time; mirrored components varied together; geometric positions bounded to hull and immersion", records,
    pass: records.every(r => r.passive && r.finite && r.massPositive) };
}

function csv(rows) {
  const fields = ["profileId", "scenarioId", "status", ...Object.keys(rows[0]?.metrics || {})];
  const cell = v => JSON.stringify(v === undefined || v === null ? "" : v);
  return fields.join(",") + "\n" + rows.map(row => fields.map(key => cell(row[key] ?? row.metrics[key])).join(",")).join("\n") + "\n";
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    process.stdout.write("Usage: node scripts/qualify-vessel-profiles.js [--profiles commercial|all|id,id] [--families A,B,B2,...,K] [--out directory] [--diagnostics] [--summary-only] [--module physics-core.js]\nRaw records: gzip JSON; --summary-only records metrics and final-state hashes without 10 Hz samples.\n");
    return;
  }
  const value = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const physics = value("--module") ? require(path.resolve(value("--module"))) : Physics;
  const selection = value("--profiles") || "commercial";
  const ids = selection === "all" ? Object.keys(physics.COMPILED_PROFILES) : selection === "commercial" ? physics.COMMERCIAL_PROFILE_IDS : selection.split(",");
  const families = value("--families")?.split(",");
  const definitions = scenarioDefinitions().filter(d => !families || families.includes(d.family));
  if (!definitions.length || !ids.length || ids.some(id => !physics.COMPILED_PROFILES[id])) throw new Error("Sélection vide ou profil inconnu");
  const output = path.resolve(value("--out") || "/tmp/kjp-vessel-qualification");
  fs.mkdirSync(output, { recursive: true });
  if (argv.includes("--diagnostics")) {
    const report = ids.map(id => {
      const profile = physics.COMPILED_PROFILES[id];
      return { profileId: id, sensitivity: sensitivityReport(profile),
        convergence: definitions.filter(d => ["B2", "D", "F", "K"].includes(d.family)).map(d => convergence(profile, d)) };
    });
    fs.writeFileSync(path.join(output, "diagnostics.json"), JSON.stringify(report, null, 2) + "\n");
    if (report.some(r => !r.sensitivity.pass || r.convergence.some(c => !c.pass))) process.exitCode = 1;
    process.stdout.write("Diagnostics : " + path.join(output, "diagnostics.json") + "\n");
    return;
  }
  const rows = [];
  for (const id of ids) {
    const profile = physics.COMPILED_PROFILES[id];
    const filename = path.join(output, id + ".json.gz");
    const destination = fs.createWriteStream(filename);
    const compressed = zlib.createGzip({ level: 6 });
    compressed.pipe(destination);
    const write = async text => { if (!compressed.write(text)) await once(compressed, "drain"); };
    const header = { profileId: id, profileVersion: profile.version, schemaVersion: profile.schemaVersion,
      physicsVersion: physics.VERSION, profileSha256: fingerprint(profile), dt: DT, mass: physics.computeMassMatrix(profile) };
    await write(JSON.stringify(header).slice(0, -1) + ',"records":[');
    for (let index = 0; index < definitions.length; index++) {
      const definition = definitions[index];
      const result = runScenario(profile, definition, { physics, record: !argv.includes("--summary-only") });
      rows.push({ profileId: id, profileSha256: fingerprint(profile), scenarioId: definition.id, status: result.status, finalSha256: fingerprint(result.final), metrics: result.metrics });
      await write((index ? "," : "") + JSON.stringify(result));
      if ((index + 1) % 20 === 0) process.stdout.write(id + ": " + (index + 1) + "/" + definitions.length + "\n");
    }
    compressed.end("]}");
    await finished(destination);
    process.stdout.write(id + ": " + definitions.length + " scénarios\n");
  }
  fs.writeFileSync(path.join(output, "metrics.csv"), csv(rows));
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ physicsVersion: physics.VERSION, profiles: ids, scenarios: definitions, rows }, null, 2) + "\n");
  process.stdout.write("Résultats : " + output + "\n");
}

module.exports = { DT, NOMINAL, NEUTRAL, energy, fingerprint, scenarioDefinitions, runScenario, convergence, discretizeAppendageOutline, sensitivityReport, main };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
