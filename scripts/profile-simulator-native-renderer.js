"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const candidatePath = path.join(root, "simulateur-port.html");
const portText = fs.readFileSync(path.join(root, "examples", "la-trinite-sur-mer.kjp"), "utf8");
const quick = process.argv.includes("--quick");
const headless = process.argv.includes("--headless");
const allowSoftware = process.argv.includes("--allow-software");
const referenceIndex = process.argv.indexOf("--reference");
const explicitReference = referenceIndex >= 0 ? process.argv[referenceIndex + 1] : null;
if (referenceIndex >= 0 && !explicitReference) throw new Error("Chemin --reference absent");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-profile-"));
const referencePath = explicitReference ? path.resolve(explicitReference) : path.join(temporary, "reference.html");
if (!explicitReference) {
  fs.writeFileSync(referencePath, execFileSync("git", [
    "show", "threejs-migration-legacy-final:simulateur-port.html"
  ], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
}
const warmupFrames = quick ? 8 : 30;
const measuredFrames = quick ? 30 : 120;
const repetitions = quick ? 1 : 3;
const dprs = quick ? [1] : [1, 2];
const scenes = quick
  ? [{ id: "la-trinite-top-dark", view: "top", theme: "dark" }]
  : [
      { id: "la-trinite-top-dark", view: "top", theme: "dark" },
      { id: "la-trinite-skipper-chart", view: "skipper", theme: "chart" }
    ];
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] || 0;
};

async function collect(browser, htmlPath, label, scene, dpr, repetition) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (/^https?:/i.test(request.url())) requests.push(request.url()); });
  await page.addInitScript(() => {
    let callbacks = new Map(), nextId = 0, timestamp = 1000;
    window.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    const uploads = { calls: 0, bytes: 0 };
    for (const name of ["bufferData", "bufferSubData"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id.startsWith("kjp-native-")) {
          const data = args[name === "bufferData" ? 1 : 2];
          uploads.calls++;
          uploads.bytes += typeof data === "number" ? data : data?.byteLength || 0;
        }
        return result;
      };
    }
    window.__profileUploads = uploads;
    window.__profileStep = count => {
      const durations = [], states = [], cameras = [];
      for (let index = 0; index < count; index++) {
        const pending = callbacks; callbacks = new Map(); timestamp += 1000 / 60;
        const started = performance.now();
        for (const callback of pending.values()) callback(timestamp);
        durations.push(performance.now() - started);
        states.push(window.__PORTANCE_TEST__.snapshot());
        cameras.push(window.__PORTANCE_TEST__.cameraReport());
      }
      return { durations, states, cameras };
    };
  });
  const url = new URL(pathToFileURL(htmlPath));
  url.searchParams.set("test", "1");
  await page.goto(url.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready);
  await page.evaluate(({ portText, scene }) => {
    const api = window.__PORTANCE_TEST__;
    api.importPort(portText);
    api.reset({ x: 200, y: 305, heading: .5084, u: 1 });
    api.selectVisualTheme(scene.theme);
    api.selectCameraView(scene.view);
    api.setControls({ throttleTarget: .55, throttleActual: .55, rudderTarget: .12 });
    document.querySelector("#pauseButton").click();
  }, { portText, scene });
  await page.evaluate(count => window.__profileStep(count), warmupFrames);
  const before = await page.evaluate(() => ({
    world: window.__PORTANCE_TEST__.worldRendererReport(),
    uploads: { ...window.__profileUploads }
  }));
  const measured = await page.evaluate(count => window.__profileStep(count), measuredFrames);
  const after = await page.evaluate(() => ({
    world: window.__PORTANCE_TEST__.worldRendererReport({ images: true }),
    uploads: { ...window.__profileUploads },
    renderer: (() => {
      const gl = document.querySelector('canvas[id^="kjp-native-"]').getContext("webgl2");
      return gl.getParameter(gl.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL || gl.RENDERER);
    })()
  }));
  const fingerprint = report => report.resources.map(resource => ({
    owner: resource.owner, geometry: resource.geometry,
    attributes: resource.attributes.map(attribute => ({
      name: attribute.name, version: attribute.version, bytes: attribute.bytes, hash: attribute.hash
    }))
  }));
  assert.equal(before.world.active, "native");
  assert.equal(after.world.active, "native");
  assert.equal(after.world.routing.projectedWorldBuilds, before.world.routing.projectedWorldBuilds);
  assert.deepEqual(after.uploads, before.uploads);
  assert.deepEqual(fingerprint(after.world), fingerprint(before.world));
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  assert.ok(Buffer.from(after.world.image.split(",")[1], "base64").length > 10_000);
  await page.close();
  return {
    label, scene: scene.id, dpr, repetition, renderer: after.renderer,
    p50Ms: percentile(measured.durations, .5),
    p95Ms: percentile(measured.durations, .95),
    p99Ms: percentile(measured.durations, .99),
    snapshotsSha256: sha256(JSON.stringify(measured.states)),
    camerasSha256: sha256(JSON.stringify(measured.cameras)),
    imageSha256: sha256(after.world.image),
    uploadsAfterWarmup: after.uploads.calls - before.uploads.calls
  };
}

async function main() {
  if (!fs.existsSync(candidatePath) || !fs.existsSync(referencePath)) throw new Error("HTML de profilage absent");
  const browser = await chromium.launch({ headless });
  const pairs = [];
  try {
    for (const scene of scenes) {
      for (const dpr of dprs) {
        for (let repetition = 0; repetition < repetitions; repetition++) {
          const order = repetition % 2
            ? [["candidate", candidatePath], ["reference", referencePath]]
            : [["reference", referencePath], ["candidate", candidatePath]];
          const runs = [];
          for (const [label, html] of order) {
            const run = await collect(browser, html, label, scene, dpr, repetition);
            runs.push(run);
            console.log(`${scene.id} DPR ${dpr} #${repetition + 1} ${label}: p95 ${run.p95Ms.toFixed(2)} ms`);
          }
          const reference = runs.find(run => run.label === "reference");
          const candidate = runs.find(run => run.label === "candidate");
          assert.equal(candidate.snapshotsSha256, reference.snapshotsSha256, "divergence fonctionnelle");
          assert.equal(candidate.camerasSha256, reference.camerasSha256, "divergence caméra");
          pairs.push({ scene: scene.id, dpr, repetition, reference, candidate,
            p95Ratio: candidate.p95Ms / reference.p95Ms });
        }
      }
    }
  } finally {
    await browser.close();
  }
  const software = pairs.some(pair => /SwiftShader|software/i.test(pair.candidate.renderer));
  const ratios = pairs.map(pair => pair.p95Ratio).sort((a, b) => a - b);
  const report = {
    schemaVersion: 2,
    reference: "threejs-migration-legacy-final",
    candidate: path.relative(root, candidatePath),
    artifacts: {
      referenceSha256: sha256(fs.readFileSync(referencePath)),
      candidateSha256: sha256(fs.readFileSync(candidatePath))
    },
    environment: { headless, software },
    protocol: { warmupFrames, measuredFrames, repetitions, pairedAlternatingOrder: true },
    pairs,
    summary: {
      medianP95Ratio: ratios[Math.floor(ratios.length / 2)],
      candidateNoSlowerThan15Percent: ratios[Math.floor(ratios.length / 2)] <= 1.15
    }
  };
  const output = path.join(temporary, "native-performance.json");
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  if (software && !allowSoftware) {
    throw new Error(`Renderer logiciel détecté ; relancer en rendu visible matériel. Rapport : ${output}`);
  }
  if (!software) assert.equal(report.summary.candidateNoSlowerThan15Percent, true,
    `régression p95 médiane : ${report.summary.medianP95Ratio}`);
  console.log(`Rapport : ${output}`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
