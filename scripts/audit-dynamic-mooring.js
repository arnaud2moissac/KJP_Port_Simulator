"use strict";

/*
 * Audit reproductible d'un départ dynamique cul à quai sur pointe arrière
 * au vent. Le script observe le moteur sans en modifier les équations.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const Physics = require("../src/simulateur-port/physics-core.js");

const ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(
  ROOT,
  "docs",
  "validation",
  "rapport-test-manoeuvres-dynamiques.md"
);
const PROFILE = Physics.DEFAULT_PROFILE;
const HEADING = 0;
const MATRIX_DURATION_S = 180;
const NOMINAL_WIND_KN = 20;
const NOMINAL_THROTTLE = 0.6;
const WINDS_KN = [15, 20, 25];
const THROTTLES = [0.2, 0.4, 0.6, 0.8, 1];
const CONTINUATION_THROTTLES = Array.from(
  { length: 21 },
  (_, index) => index * 0.05
);
const SAMPLE_HZ = 20;
const QUAY_CLEARANCE_M = 1;
const QUAY_DEPTH_M = 3;
const QUAY_WIDTH_M = 30;
// Une pointe presque perpendiculaire à l'axe du bateau évite que le quai ne
// devienne un troisième appui. Six mètres représentent environ 0,55 LOA.
const SHORE_LEAD_M = 6;
const SHORE_CLEAT_Z_M = 0.75;
const SETTLING_HEADING_BAND_DEG = 3;
const SETTLING_YAW_RATE_DEG_S = 0.3;
const SETTLING_SPEED_KN = 0.2;
const BASELINE_NOMINAL = Object.freeze({
  profileVersion: "5.1.0",
  physicsVersion: "5.0.0",
  equilibriumHeadingDeg: -44.05,
  settleTimeS: 54.27,
  maximumYawRateDegS: 6.74,
  meanTensionKn: 1.739,
  maximumStrain: 0.03775
});

const DEG = Physics.DEG;
const KNOT = Physics.KNOT;

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function format(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits).replace(".", ",") : "—";
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function rms(values) {
  return Math.sqrt(mean(values.map(value => value * value)));
}

function maximum(values) {
  return values.length ? Math.max(...values) : 0;
}

function sumForces(forces, predicate = () => true) {
  return forces.filter(predicate).reduce((total, force) => ({
    X: total.X + force.X,
    Y: total.Y + force.Y,
    N: total.N + force.N,
    power: total.power + (force.power || 0)
  }), { X: 0, Y: 0, N: 0, power: 0 });
}

function kineticEnergy(snapshot) {
  const velocity = [
    snapshot.velocity.u,
    snapshot.velocity.v,
    snapshot.velocity.r
  ];
  let energy = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      energy += (
        0.5
        * velocity[row]
        * snapshot.massMatrix[row][column]
        * velocity[column]
      );
    }
  }
  return energy;
}

function sampleSimulator(simulator, snapshot, time, heading) {
  const forces = simulator.forceBreakdown();
  const total = sumForces(forces);
  const wind = sumForces(forces, force => force.category === "environment");
  const propulsion = sumForces(forces, force => force.category === "propulsion");
  const mooring = sumForces(forces, force => force.category === "mooring");
  const contact = sumForces(forces, force => force.category === "contact");
  const line = snapshot.moorings[0] || null;
  return {
    time,
    east: snapshot.pose.east,
    north: snapshot.pose.north,
    heading,
    u: snapshot.velocity.u,
    v: snapshot.velocity.v,
    r: snapshot.velocity.r,
    speed: snapshot.diagnostics.groundSpeed,
    engineRpm: snapshot.propulsion.engineRpm,
    thrust: snapshot.propulsion.thrust,
    tension: line?.tension || 0,
    strain: line?.strain || 0,
    extension: line?.extension || 0,
    elasticEnergy: snapshot.diagnostics.mooringElasticEnergy,
    totalEnergy: kineticEnergy(snapshot) + snapshot.diagnostics.mooringElasticEnergy,
    taut: line ? line.taut : false,
    guardActive: snapshot.diagnostics.mooringGuardActive,
    maxImpact: snapshot.contacts.maxImpact,
    severeContacts: snapshot.contacts.severe,
    wind,
    propulsion,
    mooring,
    contact,
    total
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function profileWithDamping(scale) {
  const raw = clone(Physics.RAW_PROFILES[PROFILE.id]);
  raw.version = `${raw.version}-audit-damping-${Math.round(scale * 100)}`;
  raw.mooring.elasticity.dampingRatio *= scale;
  return Physics.compileVesselProfile(raw);
}

function profileWithLinearDamping(scale) {
  const raw = clone(Physics.RAW_PROFILES[PROFILE.id]);
  raw.version = `${raw.version}-audit-cross-flow-linear-${Math.round(scale * 100)}`;
  raw.hull.crossFlow.linearDampingFroude *= scale;
  return Physics.compileVesselProfile(raw);
}

function geometryFor(side, profile = PROFILE) {
  const sign = side === "starboard" ? 1 : -1;
  const cleatId = side === "starboard" ? "stern-starboard" : "stern-port";
  const cleat = profile.mooring.cleats.find(candidate => candidate.id === cleatId);
  if (!cleat) throw new Error(`Taquet ${cleatId} absent du profil.`);
  const pose = { east: 0, north: 0, heading: HEADING };
  const boatCleat = Physics.localPointToWorld(pose, cleat.x, cleat.y);
  const transomNorth = -profile.dimensions.lengthOverall / 2;
  const quayEdgeNorth = transomNorth - QUAY_CLEARANCE_M;
  return {
    side,
    sign,
    cleat,
    pose,
    transomNorth,
    quayEdgeNorth,
    shorePoint: {
      east: boatCleat.east + sign * SHORE_LEAD_M,
      north: quayEdgeNorth,
      z: SHORE_CLEAT_Z_M
    },
    obstacles: {
      rectangles: [{
        id: "quay",
        east: 0,
        north: quayEdgeNorth - QUAY_DEPTH_M / 2,
        width: QUAY_WIDTH_M,
        height: QUAY_DEPTH_M,
        heading: Math.PI / 2
      }]
    }
  };
}

function environment({ windKn, side, propWalk }) {
  return {
    windSpeedKn: windKn,
    windFromDeg: side === "starboard" ? 90 : 270,
    currentSpeedKn: 0,
    currentFromDeg: 0,
    propWalk
  };
}

function trajectoryHash(samples) {
  const compact = samples.map(sample => [
    sample.time,
    sample.east,
    sample.north,
    sample.heading,
    sample.u,
    sample.v,
    sample.r,
    sample.tension,
    sample.strain,
    sample.engineRpm,
    sample.thrust
  ]);
  return crypto.createHash("sha256").update(JSON.stringify(compact)).digest("hex");
}

function runScenario(options = {}) {
  const profile = options.profile || PROFILE;
  const side = options.side || "starboard";
  const windKn = options.windKn ?? NOMINAL_WIND_KN;
  const throttle = options.throttle ?? NOMINAL_THROTTLE;
  const durationS = options.durationS ?? MATRIX_DURATION_S;
  const driverDt = options.dt || 1 / 120;
  const sampleHz = options.sampleHz || SAMPLE_HZ;
  const withLine = options.withLine !== false;
  const propWalk = options.propWalk ?? 0.6;
  const geometry = geometryFor(side, profile);
  let currentWindKn = windKn;
  const initialEnvironment = environment({ windKn, side, propWalk });
  const simulator = Physics.createSimulator({
    profile,
    environment: initialEnvironment,
    obstacles: geometry.obstacles,
    calibrationPatch: { windage: options.windage ?? 1 }
  });
  simulator.reset({
    pose: geometry.pose,
    velocity: { u: 0, v: 0, r: 0 }
  }, initialEnvironment);

  let attachedLength = null;
  if (withLine) {
    const attached = simulator.attachMooring({
      id: "windward-stern-line",
      boatCleatId: geometry.cleat.id,
      shoreCleatId: "quay-windward-cleat",
      shorePoint: geometry.shorePoint
    });
    if (!attached.ok) throw new Error(`Pose de l'aussière refusée : ${attached.reason}`);
    attachedLength = attached.mooring.length;
  }

  const sampleStride = Math.max(1, Math.round(1 / (sampleHz * driverDt)));
  const steps = Math.round(durationS / driverDt);
  const samples = [];
  let previousWrappedHeading = HEADING;
  let unwrappedHeading = HEADING;
  let released = false;
  let releaseJump = null;
  let fatal = null;

  for (let index = 0; index < steps; index += 1) {
    const timeBeforeStep = index * driverDt;
    const desiredWind = options.windAt
      ? options.windAt(timeBeforeStep, windKn)
      : windKn;
    if (desiredWind !== currentWindKn) {
      currentWindKn = desiredWind;
      simulator.setEnvironment(environment({ windKn: desiredWind, side, propWalk }));
    }
    if (!released && Number.isFinite(options.releaseAtS) && timeBeforeStep >= options.releaseAtS) {
      const before = simulator.snapshot();
      const detached = simulator.detachMooring("windward-stern-line");
      if (!detached.ok) throw new Error(`Largage refusé : ${detached.reason}`);
      const after = simulator.snapshot();
      releaseJump = {
        positionM: Math.hypot(
          after.pose.east - before.pose.east,
          after.pose.north - before.pose.north
        ),
        headingDeg: Math.abs(
          Physics.wrapAngle(after.pose.heading - before.pose.heading) / DEG
        ),
        velocity: Math.hypot(
          after.velocity.u - before.velocity.u,
          after.velocity.v - before.velocity.v,
          after.velocity.r - before.velocity.r
        )
      };
      released = true;
    }
    const throttleCommand = options.throttleAt
      ? options.throttleAt(timeBeforeStep, throttle)
      : throttle;
    let snapshot;
    try {
      snapshot = simulator.step({ throttle: throttleCommand, rudder: 0 }, driverDt);
    } catch (error) {
      fatal = error.message;
      break;
    }
    const finiteState = [
      snapshot.pose.east,
      snapshot.pose.north,
      snapshot.pose.heading,
      snapshot.velocity.u,
      snapshot.velocity.v,
      snapshot.velocity.r,
      snapshot.propulsion.engineRpm,
      snapshot.propulsion.thrust
    ].every(Number.isFinite);
    if (!finiteState) {
      fatal = `État non fini à t=${snapshot.time.toFixed(3)} s.`;
      break;
    }
    if (index % sampleStride !== 0 && index !== steps - 1) continue;

    const deltaHeading = Physics.wrapAngle(snapshot.pose.heading - previousWrappedHeading);
    unwrappedHeading += deltaHeading;
    previousWrappedHeading = snapshot.pose.heading;
    samples.push(sampleSimulator(
      simulator,
      snapshot,
      snapshot.time,
      unwrappedHeading
    ));
  }
  return {
    options: {
      side,
      windKn,
      throttle,
      durationS,
      driverHz: round(1 / driverDt, 6),
      internalMaximumStepHz: round(1 / Physics.MAX_STEP, 6),
      sampleHz,
      withLine,
      propWalk,
      windage: options.windage ?? 1,
      dampingRatio: profile.mooring.elasticity.dampingRatio
    },
    geometry: {
      transomClearanceM: QUAY_CLEARANCE_M,
      shoreLeadM: SHORE_LEAD_M,
      shorePoint: geometry.shorePoint,
      boatCleatId: geometry.cleat.id,
      initialLineLengthM: attachedLength
    },
    samples,
    releaseJump,
    fatal,
    finalSnapshot: simulator.snapshot()
  };
}

function movingAverage(values, width) {
  const result = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= width) sum -= values[index - width];
    result.push(sum / Math.min(index + 1, width));
  }
  return result;
}

function peakAnalysis(samples) {
  if (samples.length < 5) return { amplitudesDeg: [], growing: false };
  const sampleHz = 1 / mean(samples.slice(1).map((sample, index) => (
    sample.time - samples[index].time
  )));
  const smoothed = movingAverage(
    samples.map(sample => sample.heading / DEG),
    Math.max(1, Math.round(sampleHz * 0.5))
  );
  const finalMean = mean(smoothed.slice(-Math.max(1, Math.round(sampleHz * 10))));
  const amplitudes = [];
  for (let index = 2; index < smoothed.length - 1; index += 1) {
    if (samples[index].time < 5) continue;
    const previousSlope = smoothed[index] - smoothed[index - 1];
    const nextSlope = smoothed[index + 1] - smoothed[index];
    if (previousSlope * nextSlope > 0) continue;
    const amplitude = Math.abs(smoothed[index] - finalMean);
    if (amplitude >= 0.2) amplitudes.push(amplitude);
  }
  let growing = false;
  // Comparer les extrema du même côté de l'équilibre. Les deux premiers
  // cycles appartiennent à l'établissement de la chaîne moteur-ligne.
  for (let index = 4; index < amplitudes.length; index += 1) {
    if (amplitudes[index] > amplitudes[index - 2] * 1.05) growing = true;
  }
  return {
    amplitudesDeg: amplitudes.map(value => round(value, 3)),
    growing
  };
}

function findSettlingTime(samples, withLine) {
  if (samples.length < 2) return null;
  const final = samples.filter(sample => sample.time >= samples.at(-1).time - 10);
  const finalHeading = mean(final.map(sample => sample.heading));
  const lastCandidateTime = samples.at(-1).time - 10;
  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index].time < 5 || samples[index].time > lastCandidateTime) continue;
    let stable = true;
    for (let cursor = index; cursor < samples.length; cursor += 1) {
      const sample = samples[cursor];
      if (
        Math.abs(sample.heading - finalHeading) / DEG > SETTLING_HEADING_BAND_DEG
        || Math.abs(sample.r) / DEG > SETTLING_YAW_RATE_DEG_S
        || sample.speed / KNOT > SETTLING_SPEED_KN
        || (withLine && !sample.taut)
      ) {
        stable = false;
        break;
      }
    }
    if (stable) return samples[index].time;
  }
  return null;
}

function fftSpectrum(values, sampleHz) {
  let size = 1;
  while (size * 2 <= values.length) size *= 2;
  if (size < 16) return { highFrequencyRatio: 0, dominantFrequencyHz: 0 };
  const input = values.slice(-size);
  const center = mean(input);
  const real = input.map((value, index) => (
    (value - center) * 0.5 * (1 - Math.cos(2 * Math.PI * index / (size - 1)))
  ));
  const imaginary = new Array(size).fill(0);
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = -2 * Math.PI / length;
    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < length / 2; offset += 1) {
        const cos = Math.cos(angle * offset);
        const sin = Math.sin(angle * offset);
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd] * cos - imaginary[odd] * sin;
        const oddImaginary = real[odd] * sin + imaginary[odd] * cos;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
      }
    }
  }
  let totalPower = 0;
  let highPower = 0;
  let dominantPower = 0;
  let dominantFrequencyHz = 0;
  for (let index = 1; index <= size / 2; index += 1) {
    const frequency = index * sampleHz / size;
    const power = real[index] ** 2 + imaginary[index] ** 2;
    totalPower += power;
    if (frequency > 2) highPower += power;
    if (frequency >= 0.02 && frequency <= 2 && power > dominantPower) {
      dominantPower = power;
      dominantFrequencyHz = frequency;
    }
  }
  return {
    highFrequencyRatio: totalPower > 0 ? highPower / totalPower : 0,
    dominantFrequencyHz
  };
}

function analyzeRun(run, { spectrum = false } = {}) {
  const samples = run.samples;
  if (!samples.length) {
    return { verdict: "bloquant", fatal: run.fatal || "aucun échantillon" };
  }
  const endTime = samples.at(-1).time;
  const finalWindow = samples.filter(sample => sample.time >= endTime - 10);
  const earlyWindow = samples.filter(sample => sample.time >= 2 && sample.time <= 10);
  const maximumStrain = maximum(samples.map(sample => sample.strain));
  const maximumTension = maximum(samples.map(sample => sample.tension));
  const minimumTension = Math.min(...samples.map(sample => sample.tension));
  const guardActive = samples.some(sample => sample.guardActive);
  const nonFinite = samples.some(sample => ![
    sample.east, sample.north, sample.heading, sample.u, sample.v, sample.r,
    sample.tension, sample.strain, sample.totalEnergy
  ].every(Number.isFinite));
  const settleTimeS = findSettlingTime(samples, run.options.withLine);
  const peaks = peakAnalysis(samples);
  const forceMeans = {
    total: {
      X: mean(finalWindow.map(sample => sample.total.X)),
      Y: mean(finalWindow.map(sample => sample.total.Y)),
      N: mean(finalWindow.map(sample => sample.total.N))
    },
    wind: {
      X: mean(finalWindow.map(sample => sample.wind.X)),
      Y: mean(finalWindow.map(sample => sample.wind.Y)),
      N: mean(finalWindow.map(sample => sample.wind.N))
    },
    propulsion: {
      X: mean(finalWindow.map(sample => sample.propulsion.X)),
      Y: mean(finalWindow.map(sample => sample.propulsion.Y)),
      N: mean(finalWindow.map(sample => sample.propulsion.N))
    },
    mooring: {
      X: mean(finalWindow.map(sample => sample.mooring.X)),
      Y: mean(finalWindow.map(sample => sample.mooring.Y)),
      N: mean(finalWindow.map(sample => sample.mooring.N))
    }
  };
  const nonMooringMoment = forceMeans.total.N - forceMeans.mooring.N;
  const momentScale = Math.max(
    1,
    Math.abs(forceMeans.mooring.N),
    Math.abs(nonMooringMoment)
  );
  const momentResidualRatio = Math.abs(forceMeans.total.N) / momentScale;
  const finalContactFraction = mean(finalWindow.map(sample => (
    Math.hypot(sample.contact.X, sample.contact.Y) > 1 ? 1 : 0
  )));
  const expectedWindYSign = -run.geometry.shorePoint.east / Math.abs(run.geometry.shorePoint.east || 1);
  const expectedLineYSign = -expectedWindYSign;
  const causality = {
    forwardThrust: mean(earlyWindow.map(sample => sample.propulsion.X)) > 0,
    leewardWind: mean(earlyWindow.map(sample => sample.wind.Y)) * expectedWindYSign > 0,
    windwardLine: !run.options.withLine || (
      mean(earlyWindow.map(sample => sample.mooring.Y)) * expectedLineYSign > 0
    ),
    neverPushes: minimumTension >= -1e-9,
    opposedMoments: !run.options.withLine || forceMeans.mooring.N * forceMeans.wind.N <= 0
  };
  const blocking = Boolean(
    run.fatal
    || nonFinite
    || !causality.neverPushes
    || guardActive
    || maximum(samples.map(sample => sample.maxImpact)) > 0.4
  );
  const outOfEnvelope = (
    maximumStrain >= PROFILE.mooring.elasticity.workingStrain
    || finalContactFraction > 0.05
  );
  let verdict = "hors enveloppe";
  if (blocking) verdict = "bloquant";
  else if (outOfEnvelope || settleTimeS === null || settleTimeS > 60) verdict = "hors enveloppe";
  else if (settleTimeS > 30 || peaks.growing || momentResidualRatio > 0.1) {
    verdict = "plausible mais non calibré";
  } else verdict = "conforme";

  const result = {
    verdict,
    fatal: run.fatal,
    settleTimeS,
    equilibriumHeadingDeg: mean(finalWindow.map(sample => sample.heading)) / DEG,
    finalHeadingRangeDeg: (
      Math.max(...finalWindow.map(sample => sample.heading))
      - Math.min(...finalWindow.map(sample => sample.heading))
    ) / DEG,
    finalYawRmsDegS: rms(finalWindow.map(sample => sample.r / DEG)),
    maximumYawRateDegS: maximum(samples.map(sample => Math.abs(sample.r / DEG))),
    finalSpeedKn: mean(finalWindow.map(sample => sample.speed)) / KNOT,
    meanTensionKn: mean(finalWindow.map(sample => sample.tension)) / 1000,
    maximumTensionKn: maximumTension / 1000,
    maximumStrain,
    guardActive,
    maximumImpactMs: maximum(samples.map(sample => sample.maxImpact)),
    severeContacts: maximum(samples.map(sample => sample.severeContacts)),
    finalContactFraction,
    tautFraction: mean(finalWindow.map(sample => sample.taut ? 1 : 0)),
    momentResidualRatio,
    peaks,
    causality,
    forceMeans,
    trajectoryHash: trajectoryHash(samples)
  };
  if (spectrum) {
    const effectiveSampleHz = 1 / mean(samples.slice(1).map((sample, index) => (
      sample.time - samples[index].time
    )));
    result.spectrum = {
      heading: fftSpectrum(samples.map(sample => sample.heading), effectiveSampleHz),
      yaw: fftSpectrum(samples.map(sample => sample.r), effectiveSampleHz),
      tension: fftSpectrum(samples.map(sample => sample.tension), effectiveSampleHz)
    };
  }
  return result;
}

function continuationStageIsStable(samples) {
  if (!samples.length || samples.at(-1).time < 20) return false;
  const endTime = samples.at(-1).time;
  const window = samples.filter(sample => sample.time >= endTime - 10);
  if (window.length < SAMPLE_HZ * 9) return false;
  const headings = window.map(sample => sample.heading);
  return (
    (Math.max(...headings) - Math.min(...headings)) / DEG <= SETTLING_HEADING_BAND_DEG
    && window.every(sample => (
      Math.abs(sample.r) / DEG <= SETTLING_YAW_RATE_DEG_S
      && sample.speed / KNOT <= SETTLING_SPEED_KN
      && sample.taut
    ))
  );
}

function runContinuationBranch({ direction, dt }) {
  const geometry = geometryFor("starboard", PROFILE);
  const branchEnvironment = environment({
    windKn: 15,
    side: "starboard",
    propWalk: 0.6
  });
  const simulator = Physics.createSimulator({
    profile: PROFILE,
    environment: branchEnvironment,
    obstacles: []
  });
  simulator.reset({
    pose: geometry.pose,
    velocity: { u: 0, v: 0, r: 0 }
  }, branchEnvironment);
  const attached = simulator.attachMooring({
    id: "windward-stern-line",
    boatCleatId: geometry.cleat.id,
    shoreCleatId: "quay-windward-cleat",
    shorePoint: geometry.shorePoint
  });
  if (!attached.ok) throw new Error(`Continuation : ${attached.reason}`);

  const throttles = direction === "ascending"
    ? CONTINUATION_THROTTLES
    : [...CONTINUATION_THROTTLES].reverse();
  const sampleStride = Math.max(1, Math.round(1 / (SAMPLE_HZ * dt)));
  let previousWrappedHeading = HEADING;
  let unwrappedHeading = HEADING;
  const entries = [];

  for (const throttle of throttles) {
    const stageStart = simulator.snapshot().time;
    const samples = [];
    let fatal = null;
    const maximumSteps = Math.round(MATRIX_DURATION_S / dt);
    for (let index = 0; index < maximumSteps; index += 1) {
      let snapshot;
      try {
        snapshot = simulator.step({ throttle, rudder: 0 }, dt);
      } catch (error) {
        fatal = error.message;
        break;
      }
      if (index % sampleStride !== 0 && index !== maximumSteps - 1) continue;
      const deltaHeading = Physics.wrapAngle(
        snapshot.pose.heading - previousWrappedHeading
      );
      unwrappedHeading += deltaHeading;
      previousWrappedHeading = snapshot.pose.heading;
      samples.push(sampleSimulator(
        simulator,
        snapshot,
        snapshot.time - stageStart,
        unwrappedHeading
      ));
      if (continuationStageIsStable(samples)) break;
    }
    const run = {
      options: {
        side: "starboard",
        windKn: 15,
        throttle,
        durationS: samples.at(-1)?.time || 0,
        driverHz: round(1 / dt, 6),
        internalMaximumStepHz: round(1 / Physics.MAX_STEP, 6),
        sampleHz: SAMPLE_HZ,
        withLine: true,
        propWalk: 0.6,
        windage: 1,
        dampingRatio: PROFILE.mooring.elasticity.dampingRatio
      },
      geometry: {
        transomClearanceM: QUAY_CLEARANCE_M,
        shoreLeadM: SHORE_LEAD_M,
        shorePoint: geometry.shorePoint,
        boatCleatId: geometry.cleat.id,
        initialLineLengthM: attached.mooring.length
      },
      samples,
      fatal,
      finalSnapshot: simulator.snapshot()
    };
    entries.push({
      throttle,
      durationS: samples.at(-1)?.time || 0,
      settled: continuationStageIsStable(samples),
      analysis: analyzeRun(run)
    });
    if (fatal) break;
  }
  return { direction, hz: Math.round(1 / dt), entries };
}

function continuationTransition(branch) {
  const settled = branch.entries.filter(entry => entry.settled);
  const maximumStableThrottle = settled.length
    ? Math.max(...settled.map(entry => entry.throttle))
    : null;
  const firstUnstableAbove = maximumStableThrottle === null
    ? null
    : branch.entries
      .filter(entry => entry.throttle > maximumStableThrottle && !entry.settled)
      .sort((left, right) => left.throttle - right.throttle)[0] || null;
  return {
    maximumStablePercent: maximumStableThrottle === null
      ? null
      : Math.round(maximumStableThrottle * 100),
    throttlePercent: firstUnstableAbove
      ? Math.round(firstUnstableAbove.throttle * 100)
      : null
  };
}

function continuationComparison(branches) {
  const byDirection = {};
  for (const direction of ["ascending", "descending"]) {
    const at120 = branches.find(branch => (
      branch.direction === direction && branch.hz === 120
    ));
    const at240 = branches.find(branch => (
      branch.direction === direction && branch.hz === 240
    ));
    const transition120 = continuationTransition(at120);
    const transition240 = continuationTransition(at240);
    const thresholdDifference = (
      transition120.throttlePercent === null
      || transition240.throttlePercent === null
    ) ? Infinity : Math.abs(
      transition120.throttlePercent - transition240.throttlePercent
    );
    byDirection[direction] = {
      transition120,
      transition240,
      thresholdDifference,
      pass: thresholdDifference <= 5
    };
  }
  return {
    byDirection,
    pass: Object.values(byDirection).every(item => item.pass)
  };
}

function compareConvergence(coarse, nominal, fine) {
  const difference = (left, right) => ({
    headingDeg: Math.abs(left.equilibriumHeadingDeg - right.equilibriumHeadingDeg),
    tensionPercent: Math.abs(left.meanTensionKn - right.meanTensionKn)
      / Math.max(0.001, Math.abs(right.meanTensionKn)) * 100,
    settlingS: left.settleTimeS === null || right.settleTimeS === null
      ? null
      : Math.abs(left.settleTimeS - right.settleTimeS)
  });
  const coarseNominal = difference(coarse, nominal);
  const nominalFine = difference(nominal, fine);
  const relativeFrequencyDifference = (left, right) => Math.abs(
    left.spectrum.heading.dominantFrequencyHz
    - right.spectrum.heading.dominantFrequencyHz
  ) / Math.max(1e-9, right.spectrum.heading.dominantFrequencyHz);
  const coarseNominalFrequency = relativeFrequencyDifference(coarse, nominal);
  const nominalFineFrequency = relativeFrequencyDifference(nominal, fine);
  return {
    coarseNominal,
    nominalFine,
    coarseNominalFrequency,
    nominalFineFrequency,
    pass: (
      coarseNominal.headingDeg < 1
      && coarseNominal.tensionPercent < 5
      && nominalFine.headingDeg < 0.5
      && nominalFine.tensionPercent < 2.5
      && coarseNominalFrequency < 0.05
      && nominalFineFrequency < 0.05
    ),
    note: "À 60 Hz, l'API exécute deux sous-pas internes de 1/120 s."
  };
}

function recoveryAnalysis(run, perturbationEndS) {
  const samples = run.samples.filter(sample => sample.time >= perturbationEndS);
  if (samples.length < 2) {
    return { recoveryTimeS: null, verdict: "bloquant", finalHeadingRangeDeg: Infinity };
  }
  const shifted = samples.map(sample => ({
    ...sample,
    time: sample.time - perturbationEndS
  }));
  const settling = findSettlingTime(shifted, run.options.withLine);
  const final = shifted.filter(sample => sample.time >= shifted.at(-1).time - 10);
  const range = (
    Math.max(...final.map(sample => sample.heading))
    - Math.min(...final.map(sample => sample.heading))
  ) / DEG;
  return {
    recoveryTimeS: settling,
    finalHeadingRangeDeg: range,
    verdict: settling === null || settling > 60
      ? "hors enveloppe"
      : settling > 30
        ? "plausible mais non calibré"
        : "conforme"
  };
}

function energyDecay(run, shutdownAtS) {
  const samples = run.samples.filter(sample => sample.time >= shutdownAtS + 5);
  if (samples.length < 3) return { pass: false, reason: "fenêtre insuffisante" };
  const peaks = [];
  for (let index = 1; index < samples.length - 1; index += 1) {
    if (
      samples[index].totalEnergy >= samples[index - 1].totalEnergy
      && samples[index].totalEnergy >= samples[index + 1].totalEnergy
    ) peaks.push(samples[index].totalEnergy);
  }
  let growing = false;
  for (let index = 1; index < peaks.length; index += 1) {
    if (peaks[index] > peaks[index - 1] * 1.01) growing = true;
  }
  return {
    pass: !growing && samples.at(-1).totalEnergy <= samples[0].totalEnergy * 1.01,
    initialJ: samples[0].totalEnergy,
    finalJ: samples.at(-1).totalEnergy,
    peakCount: peaks.length,
    growing
  };
}

function mirrorComparison(starboard, port) {
  const tensionDifferencePercent = Math.abs(
    starboard.meanTensionKn - port.meanTensionKn
  ) / Math.max(0.001, mean([starboard.meanTensionKn, port.meanTensionKn])) * 100;
  return {
    headingMirrorErrorDeg: Math.abs(
      starboard.equilibriumHeadingDeg + port.equilibriumHeadingDeg
    ),
    tensionDifferencePercent,
    pass: (
      Math.abs(starboard.equilibriumHeadingDeg + port.equilibriumHeadingDeg) < 0.5
      && tensionDifferencePercent < 2.5
    )
  };
}

function sensitivityEntry(label, run, baseline) {
  const analysis = analyzeRun(run);
  return {
    label,
    analysis,
    headingDeltaDeg: analysis.equilibriumHeadingDeg - baseline.equilibriumHeadingDeg,
    tensionDeltaPercent: (
      (analysis.meanTensionKn - baseline.meanTensionKn)
      / Math.max(0.001, baseline.meanTensionKn)
      * 100
    )
  };
}

function verdictLabel(verdict) {
  return {
    "conforme": "Conforme",
    "plausible mais non calibré": "Plausible, non calibré",
    "hors enveloppe": "Amélioration nécessaire",
    "bloquant": "Bloquant"
  }[verdict] || verdict;
}

function matrixTable(matrix) {
  return [
    "| Vent | Avant | Cap d'équilibre | Stabilisation | Oscillation finale | Tension moy. | Allongement max. | Appui quai final | Verdict |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|:---|",
    ...matrix.map(item => (
      `| ${item.windKn} nd | ${Math.round(item.throttle * 100)} % | `
      + `${format(item.analysis.equilibriumHeadingDeg, 1)}° | `
      + `${item.analysis.settleTimeS === null ? "non atteinte" : `${format(item.analysis.settleTimeS, 1)} s`} | `
      + `${format(item.analysis.finalHeadingRangeDeg, 2)}° | `
      + `${format(item.analysis.meanTensionKn, 2)} kN | `
      + `${format(item.analysis.maximumStrain * 100, 2)} % | `
      + `${format(item.analysis.finalContactFraction * 100, 0)} % | `
      + `${verdictLabel(item.analysis.verdict)} |`
    ))
  ].join("\n");
}

function continuationTable(branches) {
  const branch = (direction, hz) => branches.find(item => (
    item.direction === direction && item.hz === hz
  ));
  const value = (direction, hz, throttle) => branch(direction, hz).entries.find(
    entry => Math.abs(entry.throttle - throttle) < 1e-9
  );
  return [
    "| Puissance | Aller 120 Hz | Aller 240 Hz | Retour 120 Hz | Retour 240 Hz |",
    "|---:|---:|---:|---:|---:|",
    ...CONTINUATION_THROTTLES.map(throttle => {
      const cells = [
        value("ascending", 120, throttle),
        value("ascending", 240, throttle),
        value("descending", 120, throttle),
        value("descending", 240, throttle)
      ].map(entry => {
        if (!entry) return "—";
        if (!entry.settled) return `rotation / ${format(entry.durationS, 0)} s`;
        const wrappedHeading = Physics.wrapAngle(
          entry.analysis.equilibriumHeadingDeg * DEG
        ) / DEG;
        return `${format(wrappedHeading, 1)}° / ${format(entry.durationS, 0)} s`;
      });
      return `| ${Math.round(throttle * 100)} % | ${cells.join(" | ")} |`;
    })
  ].join("\n");
}

function compactCaseTable(entries) {
  return [
    "| Cas | Cap final | Vitesse finale | Tension | Stabilisation | Lecture |",
    "|:---|---:|---:|---:|---:|:---|",
    ...entries.map(entry => (
      `| ${entry.label} | ${format(entry.analysis.equilibriumHeadingDeg, 1)}° | `
      + `${format(entry.analysis.finalSpeedKn, 2)} nd | `
      + `${format(entry.analysis.meanTensionKn, 2)} kN | `
      + `${entry.analysis.settleTimeS === null ? "—" : `${format(entry.analysis.settleTimeS, 1)} s`} | `
      + `${entry.interpretation} |`
    ))
  ].join("\n");
}

function timelineTable(run) {
  const checkpoints = [0, 5, 10, 20, 30, 45, 60, 90, 120, 150, 180];
  return [
    "| Temps | Cap | Lacet | Vitesse | Régime | Poussée | Tension | Allongement | N vent | N aussière |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...checkpoints.map(checkpoint => {
      const sample = run.samples.reduce((closest, candidate) => (
        Math.abs(candidate.time - checkpoint) < Math.abs(closest.time - checkpoint)
          ? candidate
          : closest
      ), run.samples[0]);
      return `| ${checkpoint} s | ${format(sample.heading / DEG, 1)}° | `
        + `${format(sample.r / DEG, 2)}°/s | ${format(sample.speed / KNOT, 2)} nd | `
        + `${format(sample.engineRpm, 0)} tr/min | ${format(sample.thrust, 0)} N | `
        + `${format(sample.tension / 1000, 2)} kN | ${format(sample.strain * 100, 2)} % | `
        + `${format(sample.wind.N, 0)} Nm | ${format(sample.mooring.N, 0)} Nm |`;
    })
  ].join("\n");
}

function buildRecommendations(results) {
  const recommendations = [];
  const matrixBlocking = results.matrix.filter(item => item.analysis.verdict === "bloquant");
  const windsWithoutUsefulSetting = WINDS_KN.filter(windKn => !results.matrix.some(item => (
    item.windKn === windKn
    && item.analysis.settleTimeS !== null
    && item.analysis.settleTimeS <= 60
    && item.analysis.verdict !== "bloquant"
    && item.analysis.finalContactFraction <= 0.05
    && item.analysis.maximumStrain < PROFILE.mooring.elasticity.workingStrain
  )));
  if (matrixBlocking.length) {
    recommendations.push(
      "**P0 — sûreté numérique.** Rechercher d'abord la cause des gardes d'allongement, contacts sévères ou états non finis ; aucune calibration de ressenti ne doit masquer ces violations."
    );
  }
  if (!results.causalityPass) {
    recommendations.push(
      "**P0 — causalité des efforts.** Auditer les conversions monde/bateau, le bras de levier `N = xY - yX` et le Jacobien de la pointe arrière. Les signes doivent être corrigés avant tout réglage de coefficients."
    );
  }
  if (!results.convergence.pass || !results.highFrequencyPass) {
    recommendations.push(
      "**P1 — solveur et couplage temporel.** Mesurer séparément l'impulsion PGS, le travail de l'amortisseur et la correction de garde ; conserver 120 Hz et rendre la réponse indépendante du pas sans ajouter de clamp de lacet."
    );
  }
  if (windsWithoutUsefulSetting.length) {
    const dampingSensitivity = results.sensitivity.filter(item => (
      item.label.startsWith("Amortissement")
    ));
    const dampingHasMaterialEffect = dampingSensitivity.some(item => (
      Math.abs(item.headingDeltaDeg) > 1
      || Math.abs(item.tensionDeltaPercent) > 5
      || (
        item.analysis.settleTimeS !== null
        && results.nominal.settleTimeS !== null
        && Math.abs(item.analysis.settleTimeS - results.nominal.settleTimeS) > 5
      )
    ));
    recommendations.push(
      `**P1 — amortissement opérationnel.** Aucune puissance ne stabilise le bateau en moins de 60 s sans appui permanent sur le quai à ${windsWithoutUsefulSetting.join("/")} nd ; le cas nominal demande ${format(results.nominal.settleTimeS, 1)} s. ${dampingHasMaterialEffect ? "Comparer quantitativement l'amortissement de ligne au cross-flow coque/quille." : "La sensibilité ±20 % de l'amortissement de ligne est négligeable : prioriser le cross-flow coque/quille et le centre d'effort du vent."} Calibrer le composant causal plutôt qu'ajouter un couple angulaire artificiel.`
    );
  }
  const branchJumps = [];
  for (const windKn of WINDS_KN) {
    const row = results.matrix.filter(item => item.windKn === windKn);
    for (let index = 1; index < row.length; index += 1) {
      const jump = Math.abs(
        row[index].analysis.equilibriumHeadingDeg
        - row[index - 1].analysis.equilibriumHeadingDeg
      );
      if (jump > 60) branchJumps.push({
        windKn,
        from: row[index - 1].throttle,
        to: row[index].throttle,
        jump
      });
    }
  }
  if (branchJumps.length) {
    recommendations.push(results.continuation?.comparison.pass
      ? `**P2 — limite d'équilibre documentée.** Le saut de la matrice grossière (${branchJumps.map(item => `${item.windKn} nd, ${Math.round(item.from * 100)}→${Math.round(item.to * 100)} % : ${format(item.jump, 1)}°`).join(" ; ")}) correspond, sans appui du quai, à l'entrée dans une rotation continue au-dessus de ${results.continuation.comparison.byDirection.ascending.transition120.maximumStablePercent} % de puissance. La limite est identique à 120/240 Hz : ne pas créer artificiellement un équilibre ni lisser la trajectoire.`
      : "**P1 — branches d'équilibre.** Le seuil de bascule varie de plus de cinq points de puissance entre 120 et 240 Hz. Auditer l'intégration et le couplage de l'aussière avant toute nouvelle calibration."
    );
  }
  if (!results.mirrorOff.pass) {
    recommendations.push(
      "**P1 — symétrie.** La variante sans effet de pas ni tourbillon n'est pas miroir. Examiner les positions des panneaux de fardage, taquets, appendices et les signes de dérive avant toute calibration."
    );
  }
  if (!results.releasePass) {
    recommendations.push(
      "**P1 — largage.** Le retrait d'une contrainte doit supprimer l'impulsion accumulée sans modifier instantanément pose ou vitesse ; isoler l'état PGS associé à la ligne larguée."
    );
  }
  if (results.nominal.finalContactFraction > 0.05) {
    recommendations.push(
      "**P0 — montage du cas.** Le quai participe encore à l'équilibre final. Revoir l'ouverture de la pointe ou la position initiale avant d'interpréter les coefficients physiques."
    );
  }
  if (results.throttleStep.verdict === "hors enveloppe" || results.gust.verdict === "hors enveloppe") {
    recommendations.push(
      "**P1 — retour après perturbation.** La rafale ou l'échelon moteur ne retrouve pas une zone stable en moins de 60 s. Comparer l'enveloppe des extrema de lacet aux contributions coque/quille et aussière avant de modifier un amortissement."
    );
  }
  if (!results.energy.pass) {
    recommendations.push(
      "**P1 — passivité.** Après retrait du vent et passage au neutre, l'énergie cinétique plus élastique présente des pics croissants. Auditer le signe de l'amortissement Kelvin–Voigt et la restitution de l'impulsion de contrainte."
    );
  }
  if (!recommendations.length) {
    recommendations.push(
      "Aucune modification algorithmique n'est requise par cette campagne. Une comparaison sur bateau réel reste nécessaire avant de qualifier les temps de stabilisation comme calibrés."
    );
  }
  return { recommendations, windsWithoutUsefulSetting };
}

function buildReport(results) {
  const generatedAt = new Date().toISOString();
  const geometry = results.nominalRun.geometry;
  const nominal = results.nominal;
  const recommendation = buildRecommendations(results);
  const overall = results.blocking
    ? "Bloquant"
    : recommendation.windsWithoutUsefulSetting.length
      ? "Amélioration nécessaire"
      : results.matrix.some(item => item.analysis.verdict !== "conforme")
        ? "Plausible mais non calibré"
        : "Conforme dans l'enveloppe testée";
  return `# Rapport — départ dynamique sur pointe arrière au vent

## Verdict

**${overall}.** L'audit qualifie un modèle pédagogique, sans mesures instrumentées propres au Sun Odyssey 36i. Les seuils de temps expriment l'utilité de la manœuvre pour un équipage, pas une homologation du bateau réel.

- Profil : \`${PROFILE.id}\` ${PROFILE.version}, schéma ${PROFILE.schemaVersion}, physique ${Physics.VERSION}.
- Révision Git : \`${results.gitRevision}\`.
- Généré le : ${generatedAt}.
- Commande : \`npm run audit:dynamic-mooring\`.

## Contrat et géométrie

- Repère monde nord-est ; cap nautique horaire ; axe longitudinal vers l'étrave et transversal vers tribord.
- Cap initial 000°, courant nul, barre à 0°, tableau arrière à ${format(geometry.transomClearanceM, 1)} m du quai.
- Pointe sur \`${geometry.boatCleatId}\`, taquet de quai décalé de ${format(geometry.shoreLeadM, 1)} m au vent (environ 0,55 LOA) ; longueur initiale ${format(geometry.initialLineLengthM, 2)} m. Cette ouverture empêche le quai de devenir un troisième appui permanent.
- Vent établi et marche avant commandés simultanément. La chaîne moteur–embrayage–hélice et l'élasticité de ligne ne sont pas contournées.
- Le cas « 60 Hz » est une cadence d'appel : le moteur le subdivise en deux pas internes de 1/120 s. Le passage 120/240 Hz constitue la comparaison d'intégration réellement plus fine.

## Matrice vent–puissance

${matrixTable(results.matrix)}

Une stabilisation est dite conforme avant 30 s, marginale entre 30 et 60 s et insuffisante au-delà. Elle exige ensuite un cap dans ±${SETTLING_HEADING_BAND_DEG}°, un lacet inférieur à ${SETTLING_YAW_RATE_DEG_S}°/s et une vitesse inférieure à ${SETTLING_SPEED_KN} nd jusqu'à la fin du cas.

## Cas nominal — 20 nd, avant 60 %

- Cap d'équilibre : ${format(nominal.equilibriumHeadingDeg, 2)}°.
- Stabilisation : ${nominal.settleTimeS === null ? "non atteinte en 180 s" : `${format(nominal.settleTimeS, 2)} s`}.
- Plage de cap sur les 10 dernières secondes : ${format(nominal.finalHeadingRangeDeg, 3)}° ; lacet RMS ${format(nominal.finalYawRmsDegS, 3)}°/s.
- Vitesse de lacet maximale pendant l'établissement : ${format(nominal.maximumYawRateDegS, 2)}°/s.
- Tension moyenne ${format(nominal.meanTensionKn, 3)} kN, maximum ${format(nominal.maximumTensionKn, 3)} kN, allongement maximum ${format(nominal.maximumStrain * 100, 3)} %.
- Résidu moyen de moment : ${format(nominal.momentResidualRatio * 100, 2)} % du plus grand moment opposé.
- Moments moyens sur les 10 dernières secondes : vent ${format(nominal.forceMeans.wind.N, 0)} Nm, propulsion ${format(nominal.forceMeans.propulsion.N, 0)} Nm, aussière ${format(nominal.forceMeans.mooring.N, 0)} Nm, somme ${format(nominal.forceMeans.total.N, 0)} Nm.
- Pic de contact : ${format(nominal.maximumImpactMs, 3)} m/s ; garde d'allongement ${nominal.guardActive ? "activée" : "inactive"}.
- Présence d'un effort de contact dans la fenêtre finale : ${format(nominal.finalContactFraction * 100, 1)} % — ${nominal.finalContactFraction <= 0.05 ? "équilibre sans appui permanent" : "appui permanent non conforme"}.
- Énergie spectrale au-dessus de 2 Hz : cap ${format(nominal.spectrum.heading.highFrequencyRatio * 100, 4)} %, lacet ${format(nominal.spectrum.yaw.highFrequencyRatio * 100, 4)} %, tension ${format(nominal.spectrum.tension.highFrequencyRatio * 100, 4)} %.
- Fréquence dominante du cap : ${format(nominal.spectrum.heading.dominantFrequencyHz, 4)} Hz (${nominal.spectrum.heading.dominantFrequencyHz > 0 ? `${format(1 / nominal.spectrum.heading.dominantFrequencyHz, 1)} s` : "période indéterminée"}).
- Enveloppe des extrema : ${nominal.peaks.growing ? "croissance détectée — non conforme" : "décroissante — conforme"}.
- Causalité : poussée avant ${nominal.causality.forwardThrust ? "oui" : "NON"}, vent sous le vent ${nominal.causality.leewardWind ? "oui" : "NON"}, ligne vers le vent ${nominal.causality.windwardLine ? "oui" : "NON"}, ligne non poussante ${nominal.causality.neverPushes ? "oui" : "NON"}.

### Comparaison avant/après l'amortissement linéaire distribué

| Version | Fn linéaire | Cap | Stabilisation | Lacet max. | Tension moy. | Allongement max. |
|:---|---:|---:|---:|---:|---:|---:|
| Profil ${BASELINE_NOMINAL.profileVersion}, physique ${BASELINE_NOMINAL.physicsVersion} | 0 | ${format(BASELINE_NOMINAL.equilibriumHeadingDeg, 2)}° | ${format(BASELINE_NOMINAL.settleTimeS, 2)} s | ${format(BASELINE_NOMINAL.maximumYawRateDegS, 2)}°/s | ${format(BASELINE_NOMINAL.meanTensionKn, 3)} kN | ${format(BASELINE_NOMINAL.maximumStrain * 100, 3)} % |
| Profil ${PROFILE.version}, physique ${Physics.VERSION} | ${format(PROFILE.resistance.crossFlowLinearDampingFroude, 3)} | ${format(nominal.equilibriumHeadingDeg, 2)}° | ${format(nominal.settleTimeS, 2)} s | ${format(nominal.maximumYawRateDegS, 2)}°/s | ${format(nominal.meanTensionKn, 3)} kN | ${format(nominal.maximumStrain * 100, 3)} % |

Le nouveau terme réduit le temps de stabilisation de ${format((1 - nominal.settleTimeS / BASELINE_NOMINAL.settleTimeS) * 100, 1)} % sans changer la branche d'équilibre de plus de ${format(Math.abs(nominal.equilibriumHeadingDeg - BASELINE_NOMINAL.equilibriumHeadingDeg), 2)}°.

Les trois trajectoires étalons de six secondes ont été réenregistrées pour les versions ${PROFILE.version}/${Physics.VERSION}, après vérification de leur déterminisme. L'écart maximal imputable au nouveau terme reste de 3,4 mm en position, 0,067° en cap, 0,0025 m/s en vitesse latérale et 0,00027 m/s sur le pic de contact.

### Chronologie

${timelineTable(results.nominalRun)}

## Décomposition du mécanisme

${compactCaseTable(results.decomposition)}

Cette décomposition empêche d'attribuer à l'aussière un équilibre qui proviendrait seulement de la coque, du moteur ou du vent.

## Symétrie, perturbations et largage

- Miroir sans effet de pas/tourbillon : erreur de cap ${format(results.mirrorOff.headingMirrorErrorDeg, 3)}°, écart de tension ${format(results.mirrorOff.tensionDifferencePercent, 3)} % — **${results.mirrorOff.pass ? "conforme" : "non conforme"}**.
- Miroir avec réglages normaux : erreur de cap ${format(results.mirrorOn.headingMirrorErrorDeg, 3)}°, écart de tension ${format(results.mirrorOn.tensionDifferencePercent, 3)} % ; cette différence est descriptive.
- Échelon moteur +20 % pendant 10 s : ${verdictLabel(results.throttleStep.verdict)}, retour en ${results.throttleStep.recoveryTimeS === null ? "plus de 50 s" : `${format(results.throttleStep.recoveryTimeS, 1)} s`}, puis ${format(results.throttleStep.finalHeadingRangeDeg, 2)}° de plage.
- Rafale +5 nd pendant 10 s : ${verdictLabel(results.gust.verdict)}, retour en ${results.gust.recoveryTimeS === null ? "plus de 50 s" : `${format(results.gust.recoveryTimeS, 1)} s`}, puis ${format(results.gust.finalHeadingRangeDeg, 2)}° de plage.
- Largage : saut ${format(results.releaseJump.positionM, 9)} m, ${format(results.releaseJump.headingDeg, 9)}°, métrique vitesse ${format(results.releaseJump.velocity, 9)} — **${results.releasePass ? "conforme" : "non conforme"}**.

## Convergence, déterminisme et passivité

- 60/120 Hz : ${format(results.convergence.coarseNominal.headingDeg, 4)}° et ${format(results.convergence.coarseNominal.tensionPercent, 4)} % de tension.
- 120/240 Hz : ${format(results.convergence.nominalFine.headingDeg, 4)}° et ${format(results.convergence.nominalFine.tensionPercent, 4)} % de tension.
- Fréquence dominante : écart ${format(results.convergence.coarseNominalFrequency * 100, 2)} % entre 60/120 et ${format(results.convergence.nominalFineFrequency * 100, 2)} % entre 120/240.
- Verdict convergence : **${results.convergence.pass ? "conforme" : "non conforme"}**. ${results.convergence.note}
- Déterminisme 120 Hz : **${results.deterministic ? "bit à bit conforme" : "NON conforme"}** (empreinte \`${results.determinismHashes[0].slice(0, 16)}…\`).
- Décroissance après suppression du vent et passage au neutre : **${results.energy.pass ? "conforme" : "non conforme"}**, de ${format(results.energy.initialJ, 1)} J à ${format(results.energy.finalJ, 1)} J.

## Sensibilité ±20 %

| Paramètre | Cap vs nominal | Tension vs nominal | Stabilisation | Verdict |
|:---|---:|---:|---:|:---|
${results.sensitivity.map(item => (
    `| ${item.label} | ${format(item.headingDeltaDeg, 2)}° | ${format(item.tensionDeltaPercent, 1)} % | `
    + `${item.analysis.settleTimeS === null ? "—" : `${format(item.analysis.settleTimeS, 1)} s`} | ${verdictLabel(item.analysis.verdict)} |`
  )).join("\n")}

Le fardage et le prior de cross-flow linéaire ont une incertitude annoncée de 20 %. L'aussière représente une amarre polyester générique, avec une incertitude annoncée de 25 % ; ces résultats ne sont donc pas des mesures du bateau réel.

## Régimes d'équilibre et rotation à 15 nd

Chaque cellule donne le cap nautique final et la durée nécessaire avant stabilisation. « Rotation » indique qu'aucun équilibre n'est atteint pendant les 180 s du palier. Les paliers sont chaînés sans réinitialiser le bateau, l'aussière, la propulsion ou les vitesses. Le quai est retiré de cette analyse afin d'exclure tout troisième appui.

${continuationTable(results.continuation.branches)}

- Premier palier sans équilibre à l'aller : ${results.continuation.comparison.byDirection.ascending.transition120.throttlePercent} % à 120 Hz et ${results.continuation.comparison.byDirection.ascending.transition240.throttlePercent} % à 240 Hz, écart ${results.continuation.comparison.byDirection.ascending.thresholdDifference} points.
- Premier palier sans équilibre au retour : ${results.continuation.comparison.byDirection.descending.transition120.throttlePercent} % à 120 Hz et ${results.continuation.comparison.byDirection.descending.transition240.throttlePercent} % à 240 Hz, écart ${results.continuation.comparison.byDirection.descending.thresholdDifference} points.
- Verdict de stabilité numérique des branches : **${results.continuation.comparison.pass ? "conforme" : "non conforme"}**.

## Spécifications correctives conditionnelles

${recommendation.recommendations.map(item => `- ${item}`).join("\n")}

## Limites

Le test exclut courant, vagues, faible profondeur, interaction hydrodynamique avec le quai, rafales spatiales, rupture et ragage. Il valide la causalité, la stabilité numérique et la plausibilité opérationnelle du couplage actuel ; il ne revendique ni CFD ni jumeau numérique certifié.
`;
}

function main() {
  const gitRevision = (() => {
    try {
      return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8"
      }).trim();
    } catch {
      return "indisponible";
    }
  })();

  const matrix = [];
  for (const windKn of WINDS_KN) {
    for (const throttle of THROTTLES) {
      const run = runScenario({ windKn, throttle });
      matrix.push({ windKn, throttle, analysis: analyzeRun(run) });
    }
  }

  const nominalRun = runScenario({
    windKn: NOMINAL_WIND_KN,
    throttle: NOMINAL_THROTTLE,
    sampleHz: 120
  });
  const nominal = analyzeRun(nominalRun, { spectrum: true });

  const decompositionDefinitions = [
    {
      label: "Vent + moteur, sans aussière",
      interpretation: "Témoin de dérive libre attendue",
      withLine: false,
      windKn: 20,
      throttle: 0.6
    },
    {
      label: "Vent + aussière, sans moteur",
      interpretation: "Référence fardage–ligne",
      withLine: true,
      windKn: 20,
      throttle: 0
    },
    {
      label: "Moteur + aussière, sans vent",
      interpretation: "Référence moteur–ligne",
      withLine: true,
      windKn: 0,
      throttle: 0.6
    },
    {
      label: "Système complet",
      interpretation: "Cas à qualifier",
      withLine: true,
      windKn: 20,
      throttle: 0.6
    }
  ];
  const decomposition = decompositionDefinitions.map(definition => ({
    label: definition.label,
    interpretation: definition.interpretation,
    analysis: analyzeRun(runScenario(definition))
  }));

  const mirrorOffStarboard = analyzeRun(runScenario({ propWalk: 0, side: "starboard" }));
  const mirrorOffPort = analyzeRun(runScenario({ propWalk: 0, side: "port" }));
  const mirrorOnStarboard = analyzeRun(runScenario({ propWalk: 0.6, side: "starboard" }));
  const mirrorOnPort = analyzeRun(runScenario({ propWalk: 0.6, side: "port" }));

  const throttleStepRun = runScenario({
    durationS: 240,
    throttleAt: (time, baseline) => (
      time >= 180 && time < 190 ? Math.min(1, baseline + 0.2) : baseline
    )
  });
  const throttleStep = recoveryAnalysis(throttleStepRun, 190);
  const gustRun = runScenario({
    durationS: 240,
    windAt: (time, baseline) => (time >= 180 && time < 190 ? baseline + 5 : baseline)
  });
  const gust = recoveryAnalysis(gustRun, 190);
  const releaseRun = runScenario({ durationS: 210, releaseAtS: 180 });
  const releaseJump = releaseRun.releaseJump || {
    positionM: Infinity,
    headingDeg: Infinity,
    velocity: Infinity
  };
  const releasePass = (
    releaseJump.positionM <= 1e-12
    && releaseJump.headingDeg <= 1e-12
    && releaseJump.velocity <= 1e-12
  );

  const convergenceRuns = [1 / 60, 1 / 120, 1 / 240].map(dt => (
    analyzeRun(runScenario({
      dt,
      sampleHz: Math.min(120, Math.round(1 / dt))
    }), { spectrum: true })
  ));
  const convergence = compareConvergence(...convergenceRuns);

  const deterministicRuns = [
    runScenario({ sampleHz: 120 }),
    runScenario({ sampleHz: 120 })
  ];
  const determinismHashes = deterministicRuns.map(run => trajectoryHash(run.samples));
  const deterministic = determinismHashes[0] === determinismHashes[1];

  const shutdownAtS = 180;
  const energyRun = runScenario({
    durationS: 240,
    throttleAt: (time, baseline) => (time >= shutdownAtS ? 0 : baseline),
    windAt: (time, baseline) => (time >= shutdownAtS ? 0 : baseline)
  });
  const energy = energyDecay(energyRun, shutdownAtS);

  const sensitivity = [
    sensitivityEntry("Cross-flow linéaire −20 %", runScenario({
      profile: profileWithLinearDamping(0.8)
    }), nominal),
    sensitivityEntry("Cross-flow linéaire +20 %", runScenario({
      profile: profileWithLinearDamping(1.2)
    }), nominal),
    sensitivityEntry("Fardage −20 %", runScenario({ windage: 0.8 }), nominal),
    sensitivityEntry("Fardage +20 %", runScenario({ windage: 1.2 }), nominal),
    sensitivityEntry("Amortissement ligne −20 %", runScenario({
      profile: profileWithDamping(0.8)
    }), nominal),
    sensitivityEntry("Amortissement ligne +20 %", runScenario({
      profile: profileWithDamping(1.2)
    }), nominal)
  ];

  const continuationBranches = [];
  for (const dt of [1 / 120, 1 / 240]) {
    continuationBranches.push(runContinuationBranch({
      direction: "ascending",
      dt
    }));
    continuationBranches.push(runContinuationBranch({
      direction: "descending",
      dt
    }));
  }
  const continuation = {
    branches: continuationBranches,
    comparison: continuationComparison(continuationBranches)
  };

  const causalityPass = Object.values(nominal.causality).every(Boolean);
  const highFrequencyPass = (
    nominal.spectrum.heading.highFrequencyRatio < 0.01
    && nominal.spectrum.yaw.highFrequencyRatio < 0.01
  );
  const mirrorOff = mirrorComparison(mirrorOffStarboard, mirrorOffPort);
  const mirrorOn = mirrorComparison(mirrorOnStarboard, mirrorOnPort);
  const blocking = (
    matrix.some(item => item.analysis.verdict === "bloquant")
    || !deterministic
    || !releasePass
    || !continuation.comparison.pass
  );
  const results = {
    gitRevision,
    matrix,
    nominalRun,
    nominal,
    decomposition,
    mirrorOff,
    mirrorOn,
    throttleStep,
    gust,
    releaseJump,
    releasePass,
    convergence,
    deterministic,
    determinismHashes,
    energy,
    sensitivity,
    continuation,
    causalityPass,
    highFrequencyPass,
    blocking
  };
  fs.writeFileSync(REPORT_PATH, buildReport(results), "utf8");
  console.log(`Rapport généré : ${path.relative(ROOT, REPORT_PATH)}`);
  console.log(`Cas matriciels : ${matrix.length}`);
  console.log(`Verdict nominal : ${verdictLabel(nominal.verdict)}`);
  console.log(`Convergence : ${convergence.pass ? "conforme" : "non conforme"}`);
  console.log(`Déterminisme : ${deterministic ? "conforme" : "non conforme"}`);
  if (blocking) process.exitCode = 1;
}

main();
