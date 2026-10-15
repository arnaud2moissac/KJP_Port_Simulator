"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { isSimulatorAnalyticsRequest, stubSimulatorAnalytics } = require("../tests/helpers/simulator-network.js");

const root = path.resolve(__dirname, "..");
const candidatePath = path.join(root, "simulateur-port.html");
const portText = fs.readFileSync(path.join(root, "examples", "la-trinite-sur-mer.kjp"), "utf8");
const quick = process.argv.includes("--quick");
const headless = process.argv.includes("--headless");
const allowSoftware = process.argv.includes("--allow-software");
const frameTiming = process.argv.includes("--frame-timing");
const waterOption = name => {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!["simple", "daylight"].includes(value)) throw new Error(`${name} attend simple ou daylight`);
  return value;
};
const referenceWater = waterOption("--reference-water");
const candidateWater = waterOption("--candidate-water");
const waterComparison = referenceWater !== null || candidateWater !== null;
const referenceIndex = process.argv.indexOf("--reference");
const explicitReference = referenceIndex >= 0 ? process.argv[referenceIndex + 1] : null;
if (!explicitReference || explicitReference.startsWith("--")) {
  throw new Error("Référence HTML requise : utiliser --reference <HTML>");
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-profile-"));
const referencePath = path.resolve(explicitReference);
const warmupFrames = quick ? 8 : 30;
const measuredFrames = quick ? 30 : 120;
const repetitions = quick ? 1 : 3;
const dprs = quick ? [1] : [1, 2];
const scenes = quick
  ? [{ id: "la-trinite-top-dark", view: "top", theme: "dark" }]
  : [
      { id: "la-trinite-top-dark", view: "top", theme: "dark" },
      waterComparison
        ? { id: "la-trinite-skipper-dark", view: "skipper", theme: "dark" }
        : { id: "la-trinite-skipper-chart", view: "skipper", theme: "chart" }
    ];
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] || 0;
};

async function collect(browser, htmlPath, label, scene, dpr, repetition) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr, locale: "fr-FR" });
  await stubSimulatorAnalytics(page);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => {
    if (/^https?:/i.test(request.url()) && !isSimulatorAnalyticsRequest(request.url())) requests.push(request.url());
  });
  await page.addInitScript(() => {
    const realRaf = requestAnimationFrame.bind(window);
    let callbacks = new Map(), nextId = 0, timestamp = 1000;
    window.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    const uploads = { calls: 0, bytes: 0, textureCalls: 0, shaderCompilations: 0 };
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
    for (const name of ["texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D", "compileShader"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        if (this.canvas.id.startsWith("kjp-native-")) {
          if (name === "compileShader") uploads.shaderCompilations++;
          else uploads.textureCalls++;
        }
        return original.apply(this, args);
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
    // Les intervalles RAF laissent le navigateur présenter chaque image, y
    // compris le fond CSS. L'horloge KJP reste appariée à 60 pas par seconde.
    window.__profileFrameTiming = async ({ warmup, frames }) => {
      for (let index = 0; index < warmup; index++) {
        await new Promise(realRaf);
        window.__profileStep(1);
      }
      const gl = document.querySelector("#kjp-native-world").getContext("webgl2");
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      if (ext) gl.getParameter(ext.GPU_DISJOINT_EXT);
      const queries = [], intervals = [], states = [], cameras = [];
      let previous = await new Promise(realRaf), disjoint = false;
      for (let index = 0; index < frames; index++) {
        const now = await new Promise(realRaf);
        intervals.push(now - previous);
        previous = now;
        const query = ext ? gl.createQuery() : null;
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        try {
          const step = window.__profileStep(1);
          states.push(step.states[0]); cameras.push(step.cameras[0]);
        } finally {
          if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); queries.push(query); }
        }
        if (ext && gl.getParameter(ext.GPU_DISJOINT_EXT)) disjoint = true;
      }
      // Requêtes asynchrones seulement ; aucun finish() ni attente GPU active.
      // Spécification : https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
      const gpuMs = [];
      let pending = [...queries], invalid = 0;
      const deadline = performance.now() + 2000;
      while (pending.length && !disjoint && performance.now() < deadline) {
        await new Promise(realRaf);
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { disjoint = true; break; }
        const remaining = [];
        for (const query of pending) {
          if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) { remaining.push(query); continue; }
          const milliseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          if (Number.isFinite(milliseconds) && milliseconds > 0) gpuMs.push(milliseconds);
          else invalid++;
          gl.deleteQuery(query);
        }
        pending = remaining;
      }
      for (const query of pending) gl.deleteQuery(query);
      if (disjoint) { gpuMs.length = 0; invalid = queries.length; }
      else invalid += pending.length;
      return { intervals, states, cameras, gpu: {
        extensionAvailable: Boolean(ext), measured: gpuMs.length > 0,
        samplesMs: gpuMs, discarded: invalid, disjoint,
        scope: "WebGL natif seulement ; composition CSS hors requête GPU"
      } };
    };
  });
  const url = new URL(pathToFileURL(htmlPath));
  url.searchParams.set("test", "1");
  const water = label === "reference" ? referenceWater : candidateWater;
  if (water) url.searchParams.set("water", water);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready,
    null, { polling: 50 });
  await page.evaluate(({ portText, scene }) => {
    const api = window.__PORTANCE_TEST__;
    api.importPort(portText);
    api.reset({ x: 200, y: 305, heading: .5084, u: 1 });
    api.selectVisualTheme(scene.theme);
    api.selectCameraView(scene.view);
    api.setControls({ throttleTarget: .55, throttleActual: .55, rudderTarget: .12 });
  }, { portText, scene });
  // Amorcer en pause aligne lastFrame sur l'horloge appariée, quelle que soit
  // la durée de chargement de l'HTML. La physique démarre ensuite à 1/60 s.
  const activation = await page.evaluate(() => window.__profileStep(1));
  await page.evaluate(() => document.querySelector("#pauseButton").click());
  await page.evaluate(count => window.__profileStep(count), warmupFrames);
  const before = await page.evaluate(() => ({
    world: window.__PORTANCE_TEST__.worldRendererReport(),
    uploads: { ...window.__profileUploads }
  }));
  const measured = await page.evaluate(count => window.__profileStep(count), measuredFrames);
  const presented = frameTiming ? await page.evaluate(({ warmup, frames }) => (
    window.__profileFrameTiming({ warmup, frames })
  ), { warmup: warmupFrames, frames: measuredFrames }) : null;
  const after = await page.evaluate(() => ({
    world: window.__PORTANCE_TEST__.worldRendererReport({ images: true }),
    uploads: { ...window.__profileUploads },
    resolution: (() => {
      const canvas = document.querySelector("#kjp-native-world");
      const rect = canvas.getBoundingClientRect();
      return { cssWidth: rect.width, cssHeight: rect.height, width: canvas.width, height: canvas.height,
        devicePixelRatio, effectivePixelRatio: canvas.width / rect.width };
    })(),
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
  assert.equal(after.world.glError, 0);
  assert.equal(after.resolution.width, Math.round(after.resolution.cssWidth * Math.min(dpr, 2)));
  assert.equal(after.resolution.height, Math.round(after.resolution.cssHeight * Math.min(dpr, 2)));
  assert.equal(after.world.routing.projectedWorldBuilds, before.world.routing.projectedWorldBuilds);
  assert.deepEqual(after.uploads, before.uploads);
  assert.deepEqual(fingerprint(after.world), fingerprint(before.world));
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  assert.ok(Buffer.from(after.world.image.split(",")[1], "base64").length > 10_000);
  await page.close();
  return {
    label, scene: scene.id, water: water || "default", dpr, repetition, renderer: after.renderer,
    resolution: after.resolution,
    activationFirstFrameCpuMs: activation.durations[0],
    p50Ms: percentile(measured.durations, .5),
    p95Ms: percentile(measured.durations, .95),
    p99Ms: percentile(measured.durations, .99),
    snapshotsSha256: sha256(JSON.stringify(measured.states)),
    camerasSha256: sha256(JSON.stringify(measured.cameras)),
    imageSha256: sha256(after.world.image),
    uploadsAfterWarmup: after.uploads.calls - before.uploads.calls,
    textureUploadsAfterWarmup: after.uploads.textureCalls - before.uploads.textureCalls,
    shaderCompilationsAfterWarmup: after.uploads.shaderCompilations - before.uploads.shaderCompilations,
    ...(presented ? {
      frameIntervals: { samples: presented.intervals.length,
        p50Ms: percentile(presented.intervals, .5), p95Ms: percentile(presented.intervals, .95),
        p99Ms: percentile(presented.intervals, .99) },
      presentedSnapshotsSha256: sha256(JSON.stringify(presented.states)),
      presentedCamerasSha256: sha256(JSON.stringify(presented.cameras)),
      gpu: { ...presented.gpu, samplesMs: undefined, samples: presented.gpu.samplesMs.length,
        ...(presented.gpu.measured ? { p50Ms: percentile(presented.gpu.samplesMs, .5),
          p95Ms: percentile(presented.gpu.samplesMs, .95), p99Ms: percentile(presented.gpu.samplesMs, .99) } : {}) }
    } : {})
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
          if (frameTiming) {
            assert.equal(candidate.presentedSnapshotsSha256, reference.presentedSnapshotsSha256, "divergence fonctionnelle entre images présentées");
            assert.equal(candidate.presentedCamerasSha256, reference.presentedCamerasSha256, "divergence caméra entre images présentées");
          }
          pairs.push({ scene: scene.id, dpr, repetition, reference, candidate,
            p95Ratio: candidate.p95Ms / reference.p95Ms,
            ...(frameTiming ? { frameP95Ratio: candidate.frameIntervals.p95Ms / reference.frameIntervals.p95Ms } : {}) });
        }
      }
    }
  } finally {
    await browser.close();
  }
  const software = pairs.some(pair => /SwiftShader|software/i.test(pair.candidate.renderer));
  const ratios = pairs.map(pair => pair.p95Ratio).sort((a, b) => a - b);
  const report = {
    schemaVersion: 3,
    reference: referencePath,
    candidate: path.relative(root, candidatePath),
    artifacts: {
      referenceSha256: sha256(fs.readFileSync(referencePath)),
      candidateSha256: sha256(fs.readFileSync(candidatePath))
    },
    environment: { headless, software, browser: browser.version(), platform: os.platform(), arch: os.arch(),
      cpu: os.cpus()[0]?.model },
    protocol: { alignmentFrames: 1, warmupFrames, measuredFrames, repetitions, pairedAlternatingOrder: true,
      water: { reference: referenceWater, candidate: candidateWater }, frameTiming,
      activationScope: "première image après import du port, ressources initiales comprises ; pas un coût d'activation CSS isolé",
      cpuScope: "callback complet KJP ; ni durée GPU ni intervalle de présentation",
      frameScope: "intervalles RAF réels ; ni mesure directe du GPU ni coût CSS isolé" },
    pairs,
    summary: {
      medianP95Ratio: ratios[Math.floor(ratios.length / 2)],
      candidateNoSlowerThan15Percent: ratios[Math.floor(ratios.length / 2)] <= 1.15
    }
  };
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith("--"))) {
    throw new Error("Chemin --output absent");
  }
  const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(temporary, "native-performance.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
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
