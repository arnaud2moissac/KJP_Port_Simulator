"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const portText = fs.readFileSync(path.join(root, "examples/la-trinite-sur-mer.kjp"), "utf8");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-render-profile-"));
const quick = process.argv.includes("--quick");
const options = quick ? { warmup: 3, samples: 3 } : { warmup: 30, samples: 120 };
const viewport = { width: 1280, height: 800 };
const hash = data => crypto.createHash("sha256").update(data).digest("hex");

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function configure(page, scene, builtIn = false) {
  await page.evaluate(({ scene, text, builtIn }) => {
    const api = window.__PORTANCE_TEST__;
    if (builtIn) api.restoreBuiltInPort(); else api.importPort(text);
    api.reset(builtIn ? { x: 25, y: -38, heading: 0 } : { x: 200, y: 305, heading: .5084 });
    api.selectVisualTheme(scene.theme);
    api.selectCameraView(scene.view);
    if (scene.wide) document.querySelector("#scene").dispatchEvent(new WheelEvent("wheel", { deltaY: 10000, cancelable: true }));
    api.enableSurfaceComparison({ world: true });
  }, { scene, text: portText, builtIn });
  await settle(page);
}

async function measure(page, settings) {
  const result = await page.evaluate(settings => {
    const api = window.__PORTANCE_TEST__;
    const before = JSON.stringify(api.snapshot());
    const result = api.surfacePerformanceReport(settings);
    return { ...result, unchanged: before === JSON.stringify(api.snapshot()) };
  }, settings);
  assert.equal(result.unchanged, true, "le profilage modifie la simulation");
  assert.deepEqual(result.glErrors, [0, 0]);
  assert.equal(result.legacy.drawCalls, result.three.drawCalls);
  assert.equal(result.uploads.legacy.uploadedBytes, result.uploads.three.uploadedBytes);
  assert.equal(result.uploads.legacy.allocations, 0, "anneau Legacy insuffisamment chauffé");
  assert.equal(result.uploads.three.allocations, 0);
  assert.equal(result.three.measuredReallocations, 0);
  for (const distribution of Object.values(result.cpuMs)) {
    assert.equal(distribution.samples.length, settings.samples);
    assert.ok(distribution.samples.every(value => Number.isFinite(value) && value >= 0));
    assert.ok(distribution.p50 <= distribution.p95 && distribution.p95 <= distribution.p99);
  }
  return result;
}

async function compare(page, name, images = false) {
  const report = await page.evaluate(images => window.__PORTANCE_TEST__.surfaceComparisonReport({ composite: true, images }), images);
  assert.deepEqual(report.glErrors, [0, 0]);
  assert.equal(report.pixels.equal, true, `${name}: monde différent`);
  assert.equal(report.compositedPixels.equal, true, `${name}: overlays différents`);
  assert.equal(report.overlayUnchanged, true);
  if (images) {
    const projected = await page.evaluate(() => window.__PORTANCE_TEST__.surfaceComparisonReport({ composite: true, projectedInput: true }));
    assert.equal(projected.pixels.equal, true, `${name}: entrée projetée différente`);
    assert.equal(projected.compositedPixels.equal, true);
    assert.deepEqual(projected.glErrors, [0, 0]);
  }
  if (images) for (const [backend, data] of Object.entries(report.images)) {
    fs.writeFileSync(path.join(output, `${name}-${backend}.png`), Buffer.from(data.split(",")[1], "base64"));
  }
  delete report.images;
  return report;
}

function resources(report, caches) {
  return {
    bufferFloats: report.three.bufferFloats, geometries: report.three.geometries,
    textures: report.three.textures, programs: report.three.programs,
    colorCacheEntries: report.three.colorCacheEntries, reallocations: report.three.reallocations,
    staticGeometryCacheEntries: caches.staticGeometryCacheEntries,
    precomputedBoxGeometries: caches.precomputedBoxGeometries,
    precomputedShoreCleats: caches.precomputedShoreCleats
  };
}

async function main() {
  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), quick, complete: false,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model, threeRevision: (await import("three")).REVISION,
    sourceSha256: hash(fs.readFileSync(path.join(root, "simulateur-port.html"))), portSha256: hash(portText),
    viewport, activity: "paused, navigation, RAF timestamp 12345 ms", options,
    selection: "Maximum submitted triangles among dense top/anatomy/skipper and whole-port top, both themes; per DPR. Not a universal worst case.",
    results: []
  };
  const browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  try {
    for (const dpr of [1, 2]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("request", request => { if (/^https?:/.test(request.url())) errors.push(request.url()); });
      await page.addInitScript(() => {
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => raf(() => callback(12345));
      });
      await page.goto(`${pathToFileURL(path.join(root, "simulateur-port.html")).href}?test=1`);
      await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
      await page.locator('[data-mode="navigation"]').click();
      const scan = [];
      for (const theme of ["dark", "chart"]) for (const view of ["top", "anatomy", "skipper", "whole-port"]) {
        const scene = { theme, view: view === "whole-port" ? "top" : view, wide: view === "whole-port" };
        await configure(page, scene);
        const comparison = await compare(page, `scan-${theme}-${view}-dpr${dpr}`);
        scan.push({ scene, triangles: comparison.three.gpuTriangles, polygons: comparison.worldPolygons });
      }
      const selected = [...scan].sort((a, b) => b.triangles - a.triangles)[0];
      await configure(page, selected.scene);
      const before = await compare(page, `dense-dpr${dpr}`, true);
      const camera = await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport());
      const runs = [];
      const soak = [];
      report.results.push({ dpr, scan, selected, camera, runs, soak, errors });
      for (let repetition = 0; repetition < (quick ? 1 : 3); repetition += 1) {
        console.log(`DPR ${dpr}, ${JSON.stringify(selected.scene)}, répétition ${repetition + 1}...`);
        const run = await measure(page, { ...options, orderOffset: repetition });
        runs.push(run);
        console.log(`P95 CPU projeté Legacy ${run.cpuMs.legacy.p95.toFixed(2)} ms, Three ${run.cpuMs.three.p95.toFixed(2)} ms; ${run.three.gpuTriangles} triangles, ${run.uploads.three.uploadedBytes} octets/frame`);
      }
      const after = await compare(page, `after-profile-dpr${dpr}`);
      assert.equal(before.worldPolygons, after.worldPolygons);
      const cdp = await page.context().newCDPSession(page);
      const cycles = quick ? 3 : 20;
      for (let cycle = 0; cycle < cycles; cycle += 1) {
        for (const builtIn of [true, false]) {
          await configure(page, selected.scene, builtIn);
          const result = await measure(page, { warmup: 6, samples: 1 });
          const caches = await page.evaluate(() => window.__PORTANCE_TEST__.renderPerformanceReport());
          await cdp.send("HeapProfiler.collectGarbage");
          const heap = await cdp.send("Runtime.getHeapUsage");
          const row = { cycle, port: builtIn ? "built-in" : "la-trinite", resources: resources(result, caches), heap };
          if (cycle >= 2) {
            const baseline = soak.find(item => item.cycle === 1 && item.port === row.port);
            assert.deepEqual(row.resources, baseline.resources, `ressources instables: ${row.port}, cycle ${cycle}`);
          }
          soak.push(row);
        }
        if ((cycle + 1) % 5 === 0) console.log(`DPR ${dpr}, imports ${cycle + 1}/${cycles}, ressources stables`);
      }
      for (const port of ["built-in", "la-trinite"]) {
        const rows = soak.filter(row => row.port === port && row.cycle >= 1);
        const baseline = rows[0].heap.usedSize;
        assert.ok(rows.at(-1).heap.usedSize <= baseline * 1.15 + 2 * 1024 * 1024, `${port}: croissance du tas JS après GC`);
      }
      await compare(page, `after-soak-dpr${dpr}`);
      await page.evaluate(() => window.__PORTANCE_TEST__.disposeSurfaceComparison());
      await configure(page, selected.scene);
      await compare(page, `recreated-dpr${dpr}`);
      assert.deepEqual(errors, []);
      await page.close();
    }
    report.complete = true;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "profile.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Profil et captures : ${output}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
