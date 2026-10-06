"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { plan, browserSelection, executionSucceeded } = require("../scripts/run-validation.js");
const definitions = require("./browser-cases.json");

test("every browser case is registered once and can run independently", () => {
  const registered = [];
  for (const file of ["simulateur-port.test.js", "port-generator.test.js"]) {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    registered.push(...[...source.matchAll(/browserCase\("([^"]+)"/g)].map(match => match[1]));
    assert.doesNotMatch(source, /await t\.test\(/);
  }
  assert.equal(registered.length, 75);
  assert.equal(new Set(registered).size, 75);
  assert.deepEqual(registered.sort(), definitions.map(r => `${r.product}:${r.id}`).sort());
  for (const record of definitions) assert.equal(browserSelection(record.product, null, record.id).length, 1);
});

test("local routes cannot implicitly escalate to release or performance", () => {
  assert.equal(plan(["--route", "patch-local"])[0].label, "build:simulator");
  assert.equal(plan(["--route", "patch-local", "--product", "generator"])[0].label, "build:generator");
  const controls = plan(["--route", "ui-check", "--group", "controls"]);
  assert.equal(controls.length, 2);
  assert.equal(controls[1].expected.length, 7);
  const one = plan(["--route", "ui-check", "--case", "controls.48"]);
  assert.equal(one[1].expected.length, 1);
  const hull = plan(["--route", "physics-check", "--component", "hull"]);
  assert.equal(hull.length, 2);
  assert.ok(hull[1].pattern);
  assert.equal(hull[1].expected.length, 3);
  assert.equal(plan(["--route", "physics-check", "--component", "mass"])[1].expected.length, 1);
  assert.equal(plan(["--route", "physics-check", "--component", "transversal"])[1].expected.length, 53);
  assert.throws(() => plan(["--route", "ui-check"]));
  assert.throws(() => plan(["--route", "physics-check"]));
  assert.throws(() => plan(["--suite", "simulator", "--group", "missing"]));
  assert.throws(() => plan(["--suite", "simulator", "--group", "controls,missing"]));
  assert.throws(() => plan(["--suite", "simulator", "--case", "controls.48,missing"]));
  assert.throws(() => plan(["--suite", "simulator", "--case", "missing"]));
  assert.throws(() => plan(["--suite", "i18n", "--group", "missing"]));
  assert.equal(browserSelection("simulator", null, "controls.48,controls.47").length, 2);
});

test("release covers localization and runs each file and renderer qualification once", () => {
  const stages = plan(["--route", "release-check", "--product", "all"]);
  const files = stages.flatMap(stage => stage.files || []);
  assert.equal(new Set(files).size, files.length);
  assert.equal(stages.filter(stage => stage.label === "renderer:qualification").length, 1);
  assert.ok(files.includes("tests/simulator-i18n-unit.test.js"));
  assert.ok(files.includes("tests/simulator-i18n-ui.test.js"));
  assert.equal(files.some(file => file.includes("performance/")), false);
  assert.equal(plan(["--suite", "performance"])[0].files.length, 2);
});

test("a file sentinel, skipped case, empty or broader selection never passes", () => {
  const stage = { files: ["test.test.js"], expected: ["wanted"] };
  const row = name => ({ name, status: "passed" });
  for (const cases of [[], [row("test.test.js")], [row("other")], [row("wanted"), row("extra")],
    [{ name: "wanted", status: "skipped" }], [{ name: "wanted", status: "failed" }]]) {
    assert.equal(executionSucceeded(stage, { cases }, 0), false);
  }
  assert.equal(executionSucceeded(stage, { cases: [row("wanted")] }, 0), true);
  assert.equal(executionSucceeded(stage, { cases: [row("wanted")] }, 1), false);
});
