"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const quick = process.argv.includes("--quick");
const headless = process.argv.includes("--headless");
const allowSoftware = process.argv.includes("--allow-software");
const owners = process.argv.includes("--owners");
const warmup = quick ? 3 : 30;
const samples = quick ? 6 : 120;
const output = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-active-profile-"));
const viewport = { width: 1280, height: 800 };
const portText = fs.readFileSync(path.join(root, "examples/la-trinite-sur-mer.kjp"), "utf8");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const p = ratio => sorted[Math.ceil(sorted.length * ratio) - 1];
  return { p50: p(.5), p95: p(.95), p99: p(.99),
    over16_67msRatio: values.filter(value => value > 1000 / 60).length / values.length };
};

async function run(browser, backend, dpr, repetition, scene) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  const errors = [];
  const warnings = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("request", request => { if (/^https?:/.test(request.url())) errors.push(request.url()); });
  try {
    // Le RAF natif cadence l'exécution, mais le temps présenté au simulateur
    // est rejoué. Chaque frame conserve sa physique et sa caméra déterministes.
    // Ce pilote n'existe que dans le navigateur du banc, jamais dans le HTML.
    await page.addInitScript(() => {
      const nativeRaf = window.requestAnimationFrame.bind(window);
      let callbacks = new Map(), nextId = 0, timestamp = 1000;
      window.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
      window.cancelAnimationFrame = id => callbacks.delete(id);
      window.__stepProfileFrame = () => new Promise((resolve, reject) => nativeRaf(realTimestamp => {
        try {
          const pending = callbacks;
          callbacks = new Map();
          timestamp += 1000 / 60;
          for (const callback of pending.values()) callback(timestamp);
          resolve(realTimestamp);
        } catch (error) { reject(error); }
      }));
    });
    await page.goto(`${pathToFileURL(path.join(root, "simulateur-port.html")).href}?test=1&renderer=legacy`);
    await page.evaluate(async ({ portText, scene }) => {
      const api = window.__PORTANCE_TEST__;
      document.querySelector('[data-mode="navigation"]').click();
      // Le chemin updateEngineAudio est exécuté ; aucune synthèse sonore active.
      document.querySelector("#engineSoundButton").click();
      api.importPort(portText);
      api.reset({ x: 200, y: 305, heading: .5084, u: 1 }, { windSpeedKn: 8, currentSpeedKn: .4 });
      api.selectVisualTheme(scene.theme);
      api.selectCameraView(scene.view);
      if (scene.wide) document.querySelector("#scene").dispatchEvent(new WheelEvent("wheel", { deltaY: 10000, cancelable: true }));
      for (let i = 0; i < 3; i += 1) await window.__stepProfileFrame();
      api.setControls({ throttleTarget: .55, rudderTarget: .12 });
    }, { portText, scene });

    const contexts = await page.evaluate(({ backend, total, owners }) =>
      window.__PORTANCE_TEST__.startActiveFrameProfile(backend, { captureAtFrame: total, owners }),
    { backend, total: warmup + samples, owners });
    const hardwareVerified = Object.values(contexts).every(context =>
      /ANGLE Metal Renderer: Apple|NVIDIA|AMD|Intel\(R\)/i.test(context.renderer)
      && !/SwiftShader|llvmpipe|softpipe|software/i.test(context.renderer));
    assert.ok(allowSoftware || hardwareVerified, `GPU matériel non confirmé : ${JSON.stringify(contexts)}`);
    const result = await page.evaluate(async ({ warmup, samples }) => {
      const api = window.__PORTANCE_TEST__;
      const before = api.snapshot();
      document.querySelector("#pauseButton").click();
      const snapshots = [], nativeRafTimestamps = [];
      for (let i = 0; i < warmup + samples; i += 1) {
        nativeRafTimestamps.push(await window.__stepProfileFrame());
        snapshots.push(api.snapshot()); // Hors du temps CPU render().
      }
      const profile = api.activeFrameProfileReport();
      const after = api.snapshot();
      api.stopActiveFrameProfile();
      const afterStop = api.snapshot();
      // Prouver la reprise Legacy et la disparition du diagnostic.
      document.querySelector("#pauseButton").click();
      await window.__stepProfileFrame();
      let stopped = false;
      try { api.activeFrameProfileReport(); } catch { stopped = true; }
      const recovered = api.visualReport().renderer;
      return { ...profile, before, after, afterStop, snapshots, nativeRafTimestamps, stopped, recovered };
    }, { warmup, samples });
    assert.deepEqual(errors, []);
    assert.ok(warnings.every(message => message.startsWith("The AudioContext was not allowed to start.")), JSON.stringify(warnings));
    assert.deepEqual(result.glErrors, [0, 0]);
    assert.equal(result.frameCount, warmup + samples, "plus d'un propriétaire de boucle");
    assert.equal(result.frames.length, warmup + samples);
    assert.deepEqual(result.after, result.afterStop, "le disposal modifie la physique");
    assert.ok(result.stopped && result.recovered.webgl2 && !result.recovered.painterFallback);
    assert.ok(result.after.timing.simulatedSeconds > result.before.timing.simulatedSeconds);
    assert.notDeepEqual(result.before.motion, result.after.motion, "activité immobile");
    const measured = result.frames.slice(warmup);
    assert.ok(measured.every(frame => Number.isFinite(frame.cpuMs) && frame.cpuMs >= 0 && frame.renderer.drawCalls > 0));
    const ownerCpuMs = owners ? Object.fromEntries(Object.keys(measured[0].ownerMs).map(key => {
      const values = measured.map(frame => frame.ownerMs[key]);
      assert.ok(values.every(value => Number.isFinite(value) && value >= 0), key);
      return [key, { ...distribution(values), shareOfTotalCpu: values.reduce((a, b) => a + b, 0)
        / measured.reduce((sum, frame) => sum + frame.cpuMs, 0) }];
    })) : null;
    if (owners) for (const frame of measured) {
      const sum = ["physics", "prepare", "snapshot", "backend", "overlaysUi"].reduce((sum, key) => sum + frame.ownerMs[key], 0);
      assert.ok(Math.abs(sum - frame.cpuMs) < .000001, "partition CPU incomplète");
    }
    const imageHashes = {};
    for (const [kind, data] of Object.entries(result.images)) {
      const bytes = Buffer.from(data.split(",")[1], "base64");
      imageHashes[kind] = hash(bytes);
      fs.writeFileSync(path.join(output, `${scene.view}-dpr${dpr}-r${repetition}-${backend}-${kind}.png`), bytes);
    }
    delete result.images;
    const snapshotsSha256 = hash(JSON.stringify(result.snapshots));
    delete result.snapshots;
    const replaySha256 = hash(JSON.stringify(result.frames.map(({ cpuMs, renderer, ownerMs, ...frame }) => frame)));
    const cpuMs = distribution(measured.map(frame => frame.cpuMs));
    console.log(`${scene.view} DPR ${dpr}, paire ${repetition + 1}, ${backend} : CPU p50/p95/p99 ${cpuMs.p50.toFixed(1)}/${cpuMs.p95.toFixed(1)}/${cpuMs.p99.toFixed(1)} ms`);
    if (owners) console.log(`Propriétaires CPU : ${JSON.stringify(ownerCpuMs)}`);
    return { backend, contexts, hardwareVerified, cpuMs, ownerCpuMs, snapshotsSha256, replaySha256, imageHashes, errors, warnings, ...result };
  } finally { await page.close(); }
}

async function main() {
  const report = {
    protocol: owners ? "active-loop-owners-cpu-v1" : "active-loop-projected-cpu-v1", generatedAt: new Date().toISOString(), complete: false,
    quick, headless, allowSoftware, warmup, samples, viewport,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model,
    threeRevision: (await import("three")).REVISION,
    sourceSha256: hash(fs.readFileSync(path.join(root, "simulateur-port.html"))), portSha256: hash(portText),
    scope: "Full render callback: fixed-step physics, interpolation, visibility, geometry/projection, immutable projected snapshot, one detached backend, Canvas2D overlays, audio update (muted), UI. CPU submission only; browser compositing, GPU completion and audio synthesis excluded. No world capture or second projection.",
    activity: "La Trinité, (200,305), heading .5084, initial u=1 m/s, throttle .55, rudder .12 rad, wind 8 kn and current .4 kn, time scale 1. Replayed RAF +1000/60 ms; not natural display cadence.",
    gpuTimeMs: null, gpuMemoryBytes: null,
    nativeRafNote: "Raw real RAF timestamps include harness snapshot collection between callbacks. They are not product FPS. CPU over16_67msRatio is a CPU budget exceedance, not a dropped-frame ratio.",
    owners, ownerNote: owners ? "Instrumented attribution pass, Three top 1200 m DPR 1 only. Five disjoint phases; compileMs/stageMs/submitMs are children of backend. Shares use sums of samples, never sums of percentiles. Not a Legacy/Three performance comparison." : null,
    results: []
  };
  const browser = await chromium.launch({ headless });
  try {
    report.browser = browser.version();
    const cdp = await browser.newBrowserCDPSession();
    report.systemGpu = (await cdp.send("SystemInfo.getInfo")).gpu;
    for (const scene of (owners ? [{ view: "top", theme: "chart", wide: true }]
      : [{ view: "top", theme: "chart", wide: true }, { view: "skipper", theme: "chart", wide: false }])) {
      for (const dpr of (owners ? [1] : [1, 2])) for (let repetition = 0; repetition < (quick ? 1 : 3); repetition += 1) {
        const pair = { scene, dpr, repetition, runs: [] };
        report.results.push(pair);
        for (const backend of (owners ? ["three"] : repetition % 2 ? ["three", "legacy"] : ["legacy", "three"])) {
          pair.runs.push(await run(browser, backend, dpr, repetition, scene));
        }
        if (owners) {
          const reference = report.results[0].runs[0];
          assert.equal(pair.runs[0].snapshotsSha256, reference.snapshotsSha256);
          assert.equal(pair.runs[0].replaySha256, reference.replaySha256);
          assert.deepEqual(pair.runs[0].imageHashes, reference.imageHashes);
          continue;
        }
        const [a, b] = pair.runs;
        assert.equal(a.snapshotsSha256, b.snapshotsSha256, "snapshots physiques différents");
        assert.equal(a.replaySha256, b.replaySha256, "caméra, temps ou complexité différents");
        assert.deepEqual(a.imageHashes, b.imageHashes, "pixels monde/composition différents en fin d'activité");
        for (let i = 0; i < a.frames.length; i += 1) {
          for (const key of ["drawCalls", "triangles", "triangulationFailures", "acceptedLineSegments", "rejectedLineSegments"]) {
            assert.equal(a.frames[i].renderer[key], b.frames[i].renderer[key], `${key}, frame ${i}`);
          }
        }
      }
    }
    report.complete = true;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "profile.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Profil actif et captures : ${output}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
