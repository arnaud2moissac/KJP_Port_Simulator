#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const result = {
    tolerance: 1e-7,
    surge: [-1.5, -0.5, 0, 0.5, 1.5],
    sway: [-0.6, -0.2, 0, 0.2, 0.6],
    yaw: [-0.15, -0.04, 0, 0.04, 0.15]
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else if (["--module", "--profile", "--tolerance"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Valeur manquante : ${argument}`);
      result[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Argument inconnu : ${argument}`);
    }
  }
  result.tolerance = Number(result.tolerance);
  if (!Number.isFinite(result.tolerance) || result.tolerance < 0) {
    throw new Error("Tolérance invalide.");
  }
  return result;
}

function usage() {
  return [
    "Usage:",
    "  node check-passivity.js --module <physics-core.js>",
    "       [--profile <profile.json>] [--tolerance 1e-7]"
  ].join("\n");
}

function loadProfile(filename) {
  if (!filename) return undefined;
  const absolute = path.resolve(filename);
  if (!fs.existsSync(absolute)) throw new Error(`Profil introuvable : ${absolute}`);
  if (path.extname(absolute).toLowerCase() === ".json") {
    return JSON.parse(fs.readFileSync(absolute, "utf8"));
  }
  const loaded = require(absolute);
  return loaded.DEFAULT_PROFILE || loaded.profile || loaded.default || loaded;
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
    const profile = loadProfile(args.profile);
    const environment = {
      windSpeedKn: 0,
      windFromDeg: 0,
      currentSpeedKn: 0,
      currentFromDeg: 0,
      propWalk: 0
    };
    const simulator = physics.createSimulator({ profile, environment, obstacles: [] });
    const violations = [];
    let maximumPositivePower = 0;
    let minimumPassivePower = 0;
    let samples = 0;

    for (const u of args.surge) {
      for (const v of args.sway) {
        for (const r of args.yaw) {
          simulator.reset({
            pose: { east: 0, north: 0, heading: 0 },
            velocity: { u, v, r }
          }, environment);
          const inspection = simulator.inspectForces();
          const passive = inspection.forces.filter(force => force.category === "passive");
          const power = passive.reduce((total, force) => total + force.power, 0);
          samples += 1;
          maximumPositivePower = Math.max(maximumPositivePower, power);
          minimumPassivePower = Math.min(minimumPassivePower, power);
          const finite = [
            inspection.total.X,
            inspection.total.Y,
            inspection.total.N,
            power
          ].every(Number.isFinite);
          if (!finite || power > args.tolerance) {
            violations.push({
              state: { u, v, r },
              power,
              finite,
              sources: passive.map(force => ({
                source: force.source,
                power: force.power
              }))
            });
          }
        }
      }
    }

    const output = {
      ok: violations.length === 0,
      module: modulePath,
      physicsVersion: physics.VERSION || null,
      profileId: simulator.getProfile?.().id || profile?.id || null,
      tolerance: args.tolerance,
      samples,
      maximumPositivePower,
      minimumPassivePower,
      violations: violations.slice(0, 20),
      omittedViolations: Math.max(0, violations.length - 20)
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!output.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  }
}

main();
