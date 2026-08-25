#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function usage() {
  return [
    "Usage:",
    "  node run-physics-matrix.js --module <physics-core.js>",
    "       [--profile <profile.js|json>] [--seconds 10] [--dt 0.008333333333333333]",
    "       [--repeats 2]"
  ].join("\n");
}

function parseArgs(argv) {
  const result = { seconds: 10, dt: 1 / 120, repeats: 2 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else if (["--module", "--profile", "--seconds", "--dt", "--repeats"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Valeur manquante : ${argument}`);
      result[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Argument inconnu : ${argument}`);
    }
  }
  result.seconds = Number(result.seconds);
  result.dt = Number(result.dt);
  result.repeats = Number(result.repeats);
  if (!Number.isFinite(result.seconds) || result.seconds <= 0 || result.seconds > 600) {
    throw new Error("seconds doit appartenir à ]0, 600].");
  }
  if (!Number.isFinite(result.dt) || result.dt <= 0 || result.dt > 0.1) {
    throw new Error("dt doit appartenir à ]0, 0,1].");
  }
  if (!Number.isInteger(result.repeats) || result.repeats < 1 || result.repeats > 10) {
    throw new Error("repeats doit être un entier entre 1 et 10.");
  }
  return result;
}

function loadObject(filename) {
  if (!filename) return undefined;
  const absolute = path.resolve(filename);
  if (!fs.existsSync(absolute)) throw new Error(`Fichier introuvable : ${absolute}`);
  if (path.extname(absolute).toLowerCase() === ".json") {
    return JSON.parse(fs.readFileSync(absolute, "utf8"));
  }
  delete require.cache[require.resolve(absolute)];
  const loaded = require(absolute);
  return loaded.DEFAULT_PROFILE || loaded.profile || loaded.default || loaded;
}

function finiteDeep(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteDeep);
  if (value && typeof value === "object") return Object.values(value).every(finiteDeep);
  return true;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function compactSnapshot(snapshot, knot, degree) {
  return {
    pose: {
      east: snapshot.pose.east,
      north: snapshot.pose.north,
      headingDeg: snapshot.pose.heading / degree
    },
    velocity: {
      surgeKn: snapshot.velocity.u / knot,
      swayKn: snapshot.velocity.v / knot,
      yawDegS: snapshot.velocity.r / degree
    },
    waterRelative: {
      surgeKn: snapshot.waterRelative.u / knot,
      swayKn: snapshot.waterRelative.v / knot,
      yawDegS: snapshot.waterRelative.r / degree
    },
    groundSpeedKn: snapshot.diagnostics.groundSpeed / knot,
    waterSpeedKn: snapshot.diagnostics.waterSpeed / knot,
    contacts: snapshot.contacts,
    time: snapshot.time
  };
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function environment(overrides = {}) {
  return {
    windSpeedKn: 0,
    windFromDeg: 0,
    currentSpeedKn: 0,
    currentFromDeg: 0,
    propWalk: 0,
    ...overrides
  };
}

function matrixDefinitions(degree) {
  return [
    {
      id: "calm",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: 0, rudder: 0 },
      environment: environment()
    },
    {
      id: "ahead-half",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: 0.5, rudder: 0 },
      environment: environment()
    },
    {
      id: "astern-half",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: -0.5, rudder: 0 },
      environment: environment()
    },
    {
      id: "coast-ahead",
      initialVelocity: { u: 0.8, v: 0, r: 0 },
      controls: { throttle: 0, rudder: 0 },
      environment: environment()
    },
    {
      id: "coast-astern",
      initialVelocity: { u: -0.8, v: 0, r: 0 },
      controls: { throttle: 0, rudder: 0 },
      environment: environment()
    },
    {
      id: "turn-ahead-15",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: 0.5, rudder: 15 * degree },
      environment: environment()
    },
    {
      id: "wind-beam-12",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: 0, rudder: 0 },
      environment: environment({ windSpeedKn: 12, windFromDeg: 90 })
    },
    {
      id: "current-beam-1",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: 0, rudder: 0 },
      environment: environment({ currentSpeedKn: 1, currentFromDeg: 90 })
    },
    {
      id: "wind-current-same",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: 0, rudder: 0 },
      environment: environment({
        windSpeedKn: 12,
        windFromDeg: 90,
        currentSpeedKn: 1,
        currentFromDeg: 90
      })
    },
    {
      id: "wind-current-opposed",
      initialVelocity: { u: 0, v: 0, r: 0 },
      controls: { throttle: 0, rudder: 0 },
      environment: environment({
        windSpeedKn: 12,
        windFromDeg: 90,
        currentSpeedKn: 1,
        currentFromDeg: 270
      })
    }
  ];
}

function causalChecks(id, snapshot) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
  if (id === "calm") {
    add("immobility", snapshot.diagnostics.groundSpeed < 1e-10, snapshot.diagnostics.groundSpeed);
  } else if (id === "ahead-half") {
    add("ahead-causality", snapshot.velocity.u > 0, snapshot.velocity.u);
  } else if (id === "astern-half") {
    add("astern-causality", snapshot.velocity.u < 0, snapshot.velocity.u);
  } else if (id === "coast-ahead") {
    add("ahead-dissipation", snapshot.velocity.u >= 0 && snapshot.velocity.u < 0.8, snapshot.velocity.u);
  } else if (id === "coast-astern") {
    add("astern-dissipation", snapshot.velocity.u <= 0 && snapshot.velocity.u > -0.8, snapshot.velocity.u);
  } else if (id === "turn-ahead-15") {
    add("turn-keeps-headway", snapshot.velocity.u > 0, snapshot.velocity.u);
    add("turn-produces-yaw", Math.abs(snapshot.velocity.r) > 1e-5, snapshot.velocity.r);
  } else if (id.includes("wind") || id.includes("current")) {
    add("environment-produces-motion", snapshot.diagnostics.groundSpeed > 0, snapshot.diagnostics.groundSpeed);
  }
  return checks;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.module) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const modulePath = path.resolve(args.module);
    const physics = require(modulePath);
    if (typeof physics.createSimulator !== "function") {
      throw new Error("Le module doit exporter createSimulator().");
    }
    let profile = loadObject(args.profile);
    if (profile && typeof physics.compileVesselProfile === "function") {
      profile = physics.compileVesselProfile(profile);
    }
    const degree = physics.DEG || Math.PI / 180;
    const knot = physics.KNOT || 0.514444;
    const definitions = matrixDefinitions(degree);
    const stepDurationsMs = [];
    const cases = [];
    let allFinite = true;
    let deterministic = true;
    let causal = true;

    for (const definition of definitions) {
      const runs = [];
      for (let repeat = 0; repeat < args.repeats; repeat += 1) {
        const simulator = physics.createSimulator({
          profile,
          environment: definition.environment,
          obstacles: []
        });
        simulator.reset({
          pose: { east: 0, north: 0, heading: 0 },
          velocity: definition.initialVelocity
        }, definition.environment);
        const steps = Math.round(args.seconds / args.dt);
        for (let step = 0; step < steps; step += 1) {
          const started = process.hrtime.bigint();
          simulator.step(definition.controls, args.dt);
          stepDurationsMs.push(Number(process.hrtime.bigint() - started) / 1e6);
        }
        const snapshot = simulator.snapshot();
        const compact = compactSnapshot(snapshot, knot, degree);
        const checks = causalChecks(definition.id, snapshot);
        runs.push({
          hash: hash(compact),
          finite: finiteDeep(compact) && finiteDeep(simulator.forceBreakdown()),
          checks,
          final: compact,
          forceSources: [...new Set(
            simulator.forceBreakdown().map(force => force.source)
          )].sort()
        });
      }
      const hashes = new Set(runs.map(run => run.hash));
      const caseDeterministic = hashes.size === 1;
      const caseFinite = runs.every(run => run.finite);
      const caseCausal = runs.every(run => run.checks.every(check => check.pass));
      allFinite = allFinite && caseFinite;
      deterministic = deterministic && caseDeterministic;
      causal = causal && caseCausal;
      cases.push({
        id: definition.id,
        deterministic: caseDeterministic,
        finite: caseFinite,
        causal: caseCausal,
        hash: runs[0].hash,
        checks: runs[0].checks,
        final: runs[0].final,
        forceSources: runs[0].forceSources
      });
    }

    const simulatorForProfile = physics.createSimulator({
      profile,
      environment: environment(),
      obstacles: []
    });
    const resolvedProfile = simulatorForProfile.getProfile?.() || profile || physics.DEFAULT_PROFILE;
    const performance = {
      samples: stepDurationsMs.length,
      meanMs: stepDurationsMs.reduce((sum, value) => sum + value, 0) / stepDurationsMs.length,
      p95Ms: percentile(stepDurationsMs, 0.95),
      maximumMs: Math.max(...stepDurationsMs)
    };
    const output = {
      ok: allFinite && deterministic && causal,
      format: "nautical-physics-matrix-v1",
      module: modulePath,
      physicsVersion: physics.VERSION || null,
      profileId: resolvedProfile?.id || null,
      profileVersion: resolvedProfile?.version || null,
      dt: args.dt,
      seconds: args.seconds,
      repeats: args.repeats,
      summary: { allFinite, deterministic, causal },
      performance,
      cases
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!output.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  }
}

main();
