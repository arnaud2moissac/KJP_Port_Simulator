#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function usage() {
  return [
    "Usage:",
    "  node compare-trajectories.js <before.json> <after.json>",
    "       [--absolute 1e-6] [--relative 1e-6] [--limit 50]",
    "",
    "Code de sortie 0 : identiques dans les tolérances ; 1 : différences ; 2 : erreur."
  ].join("\n");
}

function parseArgs(argv) {
  const positional = [];
  const result = { absolute: 1e-6, relative: 1e-6, limit: 50 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else if (["--absolute", "--relative", "--limit"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Valeur manquante : ${argument}`);
      result[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new Error(`Argument inconnu : ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  result.before = positional[0];
  result.after = positional[1];
  result.absolute = Number(result.absolute);
  result.relative = Number(result.relative);
  result.limit = Number(result.limit);
  if (!Number.isFinite(result.absolute) || result.absolute < 0) {
    throw new Error("Tolérance absolue invalide.");
  }
  if (!Number.isFinite(result.relative) || result.relative < 0) {
    throw new Error("Tolérance relative invalide.");
  }
  if (!Number.isInteger(result.limit) || result.limit < 1 || result.limit > 10000) {
    throw new Error("limit doit être un entier entre 1 et 10000.");
  }
  return result;
}

function readJson(filename) {
  const absolute = path.resolve(filename);
  if (!fs.existsSync(absolute)) throw new Error(`Fichier introuvable : ${absolute}`);
  return { absolute, value: JSON.parse(fs.readFileSync(absolute, "utf8")) };
}

function compare(before, after, options) {
  const differences = [];
  const warnings = [];
  let numericCompared = 0;
  let maximumAbsolute = 0;
  let maximumRelative = 0;

  function add(pathname, type, beforeValue, afterValue, extra = {}) {
    differences.push({ path: pathname || "$", type, before: beforeValue, after: afterValue, ...extra });
  }

  function visit(left, right, pathname) {
    if (typeof left === "number" && typeof right === "number") {
      numericCompared += 1;
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        if (!Object.is(left, right)) add(pathname, "non-finite", left, right);
        return;
      }
      const absolute = Math.abs(right - left);
      const scale = Math.max(Math.abs(left), Math.abs(right), Number.EPSILON);
      const relative = absolute / scale;
      maximumAbsolute = Math.max(maximumAbsolute, absolute);
      maximumRelative = Math.max(maximumRelative, relative);
      if (absolute > options.absolute && relative > options.relative) {
        add(pathname, "numeric", left, right, { absolute, relative });
      }
      return;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        add(pathname, "type", left, right);
        return;
      }
      if (left.length !== right.length) {
        add(`${pathname}.length`, "length", left.length, right.length);
      }
      const count = Math.min(left.length, right.length);
      for (let index = 0; index < count; index += 1) {
        visit(left[index], right[index], `${pathname}[${index}]`);
      }
      return;
    }

    const leftObject = left !== null && typeof left === "object";
    const rightObject = right !== null && typeof right === "object";
    if (leftObject || rightObject) {
      if (!leftObject || !rightObject) {
        add(pathname, "type", left, right);
        return;
      }
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of [...keys].sort()) {
        const nextPath = pathname ? `${pathname}.${key}` : key;
        if (!(key in left)) add(nextPath, "added", undefined, right[key]);
        else if (!(key in right)) add(nextPath, "removed", left[key], undefined);
        else visit(left[key], right[key], nextPath);
      }
      return;
    }

    if (!Object.is(left, right)) add(pathname, "value", left, right);
  }

  visit(before, after, "");

  for (const [label, object] of [["before", before], ["after", after]]) {
    if (object && typeof object === "object") {
      if (!("profileId" in object)) warnings.push(`${label}: profileId absent.`);
      if (!("profileVersion" in object)) warnings.push(`${label}: profileVersion absent.`);
      if (!("physicsVersion" in object)) warnings.push(`${label}: physicsVersion absent.`);
    }
  }

  return {
    equalWithinTolerance: differences.length === 0,
    numericCompared,
    maximumAbsolute,
    maximumRelative,
    differenceCount: differences.length,
    differences: differences.slice(0, options.limit),
    omittedDifferences: Math.max(0, differences.length - options.limit),
    warnings
  };
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
  if (!args.before || !args.after) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const before = readJson(args.before);
    const after = readJson(args.after);
    const result = compare(before.value, after.value, args);
    const output = {
      ok: result.equalWithinTolerance,
      before: before.absolute,
      after: after.absolute,
      tolerances: { absolute: args.absolute, relative: args.relative },
      ...result
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!output.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  }
}

main();
