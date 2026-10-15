"use strict";

// Captures candidates seulement : aucune référence de test n'est actualisée.
// Usage : node scripts/capture-simulator-water-comparison.js --reference <avant.html> --output <dossier> [--scene <id>]
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const { isSimulatorAnalyticsRequest, stubSimulatorAnalytics } = require("../tests/helpers/simulator-network.js");

const root = path.resolve(__dirname, "..");
const argument = name => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) {
    throw new Error(`Argument requis : ${name} <chemin>`);
  }
  return path.resolve(process.argv[index + 1]);
};
const referencePath = argument("--reference");
const output = argument("--output");
const candidatePath = path.join(root, "simulateur-port.html");
assert.notEqual(referencePath, candidatePath, "conserver un HTML de référence distinct");
const portText = fs.readFileSync(path.join(root, "examples", "la-trinite-sur-mer.kjp"), "utf8");
const digest = value => createHash("sha256").update(value).digest("hex");
const viewport = { width: 1440, height: 900 };
const fixedTime = 12_345;
const scenes = [
  { id: "small-top-calm", view: "top", wind: 0, current: 0 },
  { id: "small-top-wind", view: "top", wind: 12, current: 0 },
  { id: "small-top-current", view: "top", wind: 0, current: 1.4 },
  { id: "small-top-combined", view: "top", wind: 12, current: 1.4 },
  { id: "small-skipper-combined", view: "skipper", wind: 12, current: 1.4 },
  { id: "small-top-moorings", view: "top", wind: 12, current: 1.4, scenario: "mooring" },
  { id: "large-top-combined", port: "large", view: "top", wind: 12, current: 1.4, zoom: 800 },
  { id: "large-skipper-combined", port: "large", view: "skipper", wind: 12, current: 1.4 }
];
const sceneIndex = process.argv.indexOf("--scene");
const selection = sceneIndex < 0 ? scenes : scenes.filter(scene => scene.id === process.argv[sceneIndex + 1]);
assert.ok(selection.length, "scène --scene absente ou inconnue");

const settle = (page, frames = 5) => page.evaluate(count => new Promise(resolve => {
  const next = remaining => requestAnimationFrame(() => remaining > 1 ? next(remaining - 1) : resolve());
  next(count);
}), frames);

async function openPage(browser, htmlPath, style) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: "fr-FR" });
  const errors = [], requests = [];
  await stubSimulatorAnalytics(page);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => {
    if (/^https?:/i.test(request.url()) && !isSimulatorAnalyticsRequest(request.url())) requests.push(request.url());
  });
  await page.addInitScript(time => {
    const raf = requestAnimationFrame.bind(window);
    window.__waterCaptureTime = time;
    window.requestAnimationFrame = callback => raf(() => callback(window.__waterCaptureTime));
  }, fixedTime);
  const url = new URL(pathToFileURL(htmlPath));
  url.searchParams.set("test", "1");
  if (style) url.searchParams.set("water", style);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready);
  return { page, errors, requests };
}

async function configure(page, scene) {
  await page.evaluate(({ scene, portText }) => {
    const api = window.__PORTANCE_TEST__;
    if (scene.port === "large") {
      api.importPort(portText);
      api.reset({ x: 200, y: 305, heading: .5084 });
    } else api.loadScenario(scene.scenario || "dockForward");
    api.selectVisualTheme("dark");
    api.selectCameraView(scene.view);
    api.setControls({ rudderTarget: .12, rudderActual: .12 });
    for (const [id, value] of Object.entries({
      windSpeed: scene.wind, windDirection: 300, currentSpeed: scene.current, currentDirection: 215
    })) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, { scene, portText });
  if (scene.zoom) await page.locator("#scene").dispatchEvent("wheel", { deltaY: scene.zoom });
  await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
  await settle(page);
}

async function capture(page, name) {
  const report = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    const world = api.worldRendererReport({ images: true });
    return {
      snapshot: api.snapshot(), camera: api.cameraReport(),
      moorings: api.mooringReport().rendered,
      water: api.visualThemeReport(),
      native: world.image,
      overlay: document.getElementById("scene").toDataURL(),
      active: world.active, glError: world.glError,
      memory: world.memory, draw: world.draw
    };
  });
  assert.equal(report.active, "native");
  assert.equal(report.glError, 0);
  const file = `${name}.png`;
  const clip = await page.locator(".stage").boundingBox();
  assert.ok(clip, "zone de simulation visible");
  const png = await page.screenshot({ clip, path: path.join(output, file), animations: "disabled", timeout: 60_000 });
  return { ...report, file, sha256: digest(png) };
}

function samePresentation(a, b) {
  assert.deepEqual(b.snapshot, a.snapshot, "état physique et commandes appariés");
  assert.deepEqual(b.camera, a.camera, "caméras appariées");
  assert.deepEqual(b.moorings, a.moorings, "amarres et picking appariés");
  assert.equal(b.native, a.native, "pixels du canvas Three inchangés");
  assert.equal(b.overlay, a.overlay, "pixels des overlays inchangés");
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const provenance = htmlPath => ({ path: htmlPath, sha256: digest(fs.readFileSync(htmlPath)) });
  const sources = { reference: provenance(referencePath), candidate: provenance(candidatePath) };
  const writeManifest = () => fs.writeFileSync(path.join(output, "comparison.json"), `${JSON.stringify({
    ...sources, browser: `Chromium ${browser.version()}`, viewport, deviceScaleFactor: 1,
    locale: "fr-FR", fixedTime, scenes: results,
    selectedScenes: selection.map(scene => scene.id), complete: results.length === selection.length,
    scope: "Captures candidates des fonds simple et jour, sans qualification de performances"
  }, null, 2)}\n`);
  try {
    for (const scene of selection) {
      const before = await openPage(browser, referencePath, "simple");
      const candidate = await openPage(browser, candidatePath, "daylight");
      try {
        await configure(before.page, scene);
        await configure(candidate.page, scene);
        const reference = await capture(before.page, `${scene.id}-before`);
        await candidate.page.evaluate(() => window.__PORTANCE_TEST__.selectWaterStyle("simple"));
        await settle(candidate.page);
        const simple = await capture(candidate.page, `${scene.id}-simple`);
        samePresentation(reference, simple);
        assert.equal(simple.sha256, reference.sha256, `${scene.id} : le fond simple conserve les pixels de référence`);
        await candidate.page.evaluate(() => window.__PORTANCE_TEST__.selectWaterStyle("daylight"));
        await settle(candidate.page);
        const daylight = await capture(candidate.page, `${scene.id}-daylight`);
        assert.equal(daylight.water.water.activeStyle, "daylight");
        samePresentation(simple, daylight);
        // Une caméra et une simulation figées ne font pas évoluer le fond.
        await candidate.page.evaluate(() => { window.__waterCaptureTime += 20_000; });
        await settle(candidate.page, 4);
        assert.equal(await candidate.page.evaluate(() => window.__PORTANCE_TEST__.visualThemeReport().compositor.background),
          daylight.water.compositor.background);
        assert.deepEqual(before.errors, []);
        assert.deepEqual(candidate.errors, []);
        assert.deepEqual(before.requests, []);
        assert.deepEqual(candidate.requests, []);
        results.push({ ...scene,
          reference: { file: reference.file, sha256: reference.sha256 },
          simple: { file: simple.file, sha256: simple.sha256, exactReference: true },
          daylight: { file: daylight.file, sha256: daylight.sha256 },
          background: daylight.water.compositor.background,
          horizonY: daylight.water.water.horizonY,
          stateSha256: digest(JSON.stringify(daylight.snapshot)),
          cameraSha256: digest(JSON.stringify(daylight.camera)),
          memory: daylight.memory, draw: daylight.draw,
          nativePixelsUnchanged: true, overlayPixelsUnchanged: true,
          errors: [], unexpectedRequests: []
        });
        writeManifest();
        console.log(`${scene.id} : référence/simple identiques, fond jour isolé, console OK`);
      } finally {
        await before.page.close();
        await candidate.page.close();
      }
    }
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
