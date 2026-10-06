"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const definitions = require("../tests/browser-cases.json");
const root = path.resolve(__dirname, "..");
function argument(name, argv) { const index = argv.indexOf(`--${name}`); return index < 0 ? null : argv[index + 1]; }
function browserSelection(product, group, caseId) {
  const available = definitions.filter(record => record.product === product);
  for (const [selection, property] of [[group, "group"], [caseId, "id"]]) {
    if (selection?.split(",").some(value => !available.some(record => record[property] === value))) {
      throw new Error(`Unknown test selection: ${product}/${selection}`);
    }
  }
  const records = available.filter(record => (!group || group.split(",").includes(record.group))
    && (!caseId || caseId.split(",").includes(record.id)));
  if (!records.length) throw new Error(`Empty test selection: ${product}/${group || caseId || "all"}`);
  return records;
}
function physicalSelection(files, pattern) {
  const filter = pattern && new RegExp(pattern);
  const names = files.flatMap(file => [...fs.readFileSync(path.join(root, file), "utf8")
    .matchAll(/^test\(("(?:[^"\\]|\\.)*")/gm)].map(match => JSON.parse(match[1])))
    .filter(name => !filter || filter.test(name));
  if (!names.length) throw new Error(`Empty physics selection: ${pattern || files.join(",")}`);
  return names;
}
function plan(argv) {
  const route = argument("route", argv), product = argument("product", argv) || "simulator";
  const group = argument("group", argv), caseId = argument("case", argv), suite = argument("suite", argv);
  const browser = owner => {
    const selected = browserSelection(owner, group, caseId);
    return { label: `${owner}:${group || caseId || "all"}`, files: [owner === "simulator" ? "tests/simulateur-port.test.js" : "tests/port-generator.test.js"],
      env: { KJP_TEST_GROUPS: group || "", KJP_TEST_CASES: caseId || "" },
      expected: selected.map(record => `[${record.product}:${record.id}] ${record.name}`) };
  };
  const check = owner => ({ label: `build:${owner}`, command: [process.execPath,
    owner === "simulator" ? "scripts/build-simulateur-port.js" : "scripts/build-port-generator.js", "--check"] });
  const tests = (label, files) => ({ label, files,
    ...(files.every(file => file.startsWith("tests/physics/")) ? { expected: physicalSelection(files) } : {}) });
  const physics = tests("physics:functional", ["tests/physics/port-physics.test.js", "tests/physics/wind-current-profiles.test.js", "tests/physics/port-obstacles.test.js"]);
  const ports = tests("ports", ["tests/ports/kjp-codec.test.js", "tests/ports/pontoon-decomposition.test.js"]);
  const i18n = tests("i18n", ["tests/simulator-i18n-unit.test.js", "tests/simulator-i18n-ui.test.js"]);
  if (suite === "simulator" || suite === "generator") return [browser(suite)];
  if (suite === "performance") return [tests("performance", ["tests/performance/physics-performance.test.js", "tests/performance/simulator-budget.test.js"])];
  if (suite === "i18n" && group && !["unit", "ui", "all"].includes(group)) throw new Error(`Unknown i18n group: ${group}`);
  if (suite === "i18n") return [tests("i18n:" + (group || "all"), group === "unit"
    ? ["tests/simulator-i18n-unit.test.js"] : group === "ui" ? ["tests/simulator-i18n-ui.test.js"]
      : ["tests/simulator-i18n-unit.test.js", "tests/simulator-i18n-ui.test.js"])];
  if (!["simulator", "generator", "all"].includes(product)) throw new Error(`Unknown product: ${product}`);
  if (route === "patch-local") {
    if (product === "all") throw new Error("patch-local requires one product");
    return [check(product)];
  }
  if (route === "ui-check") {
    if (product === "all" || (!group && !caseId)) throw new Error("ui-check requires a product and a group/case");
    return [check(product), browser(product)];
  }
  if (route === "physics-check") {
    const component = argument("component", argv);
    const patterns = { mass: "matrice de masse|repères", hull: "cross-flow|décélération naturelle|immobilité", propulsion: "hélice continue|chaîne mécanique|crash-stop|gaz avant|marche arrière", rudder: "safran|virage accéléré", moorings: "aussières|pendilles" };
    if (component === "transversal") return [check("simulator"), physics,
      { ...browserSelectionStage("trajectories"), label: "simulator:trajectories" }];
    if (component === "environment") return [check("simulator"), tests("physics:environment", ["tests/physics/wind-current-profiles.test.js"]),
      { label: "wind-current:audit", command: [process.execPath, "scripts/audit-wind-current.js", "--check"] }];
    if (component === "contacts") return [check("simulator"), tests("physics:contacts", ["tests/physics/port-obstacles.test.js"])];
    if (!patterns[component]) throw new Error("physics-check requires a known --component");
    const files = ["tests/physics/port-physics.test.js"];
    return [check("simulator"), { ...tests(`physics:${component}`, files),
      pattern: patterns[component], expected: physicalSelection(files, patterns[component]) }];
  }
  if (route === "release-check") {
    const stages = [];
    if (product !== "generator") stages.push(check("simulator"), { label: "i18n:catalogs", command: [process.execPath, "scripts/check-simulator-i18n.js"] }, physics, i18n, browserSelectionStage());
    if (product !== "simulator") stages.push(check("generator"), ports, { label: "generator:all", files: ["tests/port-generator.test.js"], expected: browserSelection("generator").map(r => `[${r.product}:${r.id}] ${r.name}`) });
    if (product !== "generator") stages.push(tests("renderer:qualification", ["tests/native-rendering.test.js", "tests/native-world-renderer.test.js", "tests/native-player.test.js", "tests/native-renderer-activation.test.js", "tests/native-renderer-qualification.test.js", "tests/understanding-rotation.test.js"]));
    return stages;
  }
  throw new Error("Choose --route patch-local|ui-check|physics-check|release-check, or --suite");
}
function browserSelectionStage(group) {
  const selected = browserSelection("simulator", group);
  return { label: `simulator:${group || "all"}`, files: ["tests/simulateur-port.test.js"], env: { KJP_TEST_GROUPS: group || "" }, expected: selected.map(r => `[${r.product}:${r.id}] ${r.name}`) };
}
function executionSucceeded(stage, data, status) {
  if (status !== 0) return false;
  const executed = data.cases.filter(c => c.status !== "skipped" && !/\.test\.js$/.test(c.name));
  if (stage.files && (!executed.length || executed.some(c => c.status !== "passed"))) return false;
  return !stage.expected || JSON.stringify(executed.map(c => c.name).sort()) === JSON.stringify([...stage.expected].sort());
}
function run(argv) {
  if (argv.includes("--list")) { console.log(JSON.stringify(plan(argv), null, 2)); return; }
  const folder = path.join(root, ".validation-runs"); fs.mkdirSync(folder, { recursive: true });
  const log = { startedAt: new Date().toISOString(), args: argv, node: process.version,
    platform: `${process.platform}/${process.arch}`, cpu: os.cpus()[0]?.model, cpuCount: os.cpus().length,
    retries: 0, stages: [] };
  const previous = argument("retry-of", argv);
  if (previous) {
    const previousPath = path.resolve(root, previous);
    if (path.dirname(previousPath) !== folder) throw new Error("--retry-of must name a .validation-runs report");
    const parent = JSON.parse(fs.readFileSync(previousPath, "utf8"));
    log.retryOf = previous; log.retries = parent.retries + 1;
  }
  let stages;
  try { stages = plan(argv); }
  catch (error) { log.selectionError = error.message; stages = []; process.exitCode = 1; console.error(error.message); }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-validation-"));
  for (const [index, stage] of stages.entries()) {
    console.log(`Validation ${stage.label}${stage.expected ? ` — ${stage.expected.length} selected cases` : ""}`);
    const report = path.join(temporary, `${index}.json`), start = performance.now();
    const command = stage.command || [process.execPath, "--test", "--test-concurrency=1",
      "--test-reporter=./scripts/validation-reporter.js", ...(stage.pattern ? [`--test-name-pattern=${stage.pattern}`] : []), ...stage.files];
    const result = spawnSync(command[0], command.slice(1), { cwd: root, stdio: "inherit",
      env: { ...process.env, KJP_TEST_GROUPS: "", KJP_TEST_CASES: "", ...stage.env, KJP_TEST_REPORT: report } });
    const data = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : { cases: [] };
    const success = executionSucceeded(stage, data, result.status);
    log.stages.push({ label: stage.label, durationMs: performance.now() - start,
      expected: stage.expected || null, executed: data.cases, diagnostics: data.diagnostics || [], success });
    if (!success) { process.exitCode = 1; console.error(`Validation failed or selection not actually executed: ${stage.label}`); break; }
  }
  log.durationMs = log.stages.reduce((sum, stage) => sum + stage.durationMs, 0);
  const target = path.join(folder, `${log.startedAt.replace(/[:.]/g, "-")}-${process.pid}.json`);
  fs.writeFileSync(target, JSON.stringify(log, null, 2) + "\n");
  console.log(`Validation report: ${target}`);
  fs.rmSync(temporary, { recursive: true });
}
if (require.main === module) { try { run(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { plan, browserSelection, executionSucceeded };
