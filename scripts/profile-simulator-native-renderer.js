"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const simulatorPath = path.join(root, "simulateur-port.html");
const portText = fs.readFileSync(path.join(root, "examples", "la-trinite-sur-mer.kjp"), "utf8");
const quick = process.argv.includes("--quick");
const headless = process.argv.includes("--headless");
const allowSoftware = process.argv.includes("--allow-software");
const warmupFrames = quick ? 8 : 30;
const measuredFrames = quick ? 30 : 120;
const repetitions = quick ? 1 : 3;
const viewport = { width: 1280, height: 800 };
const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-visible-profile-"));
const scenes = quick
  ? [{ id: "la-trinite-top-dark", view: "top", theme: "dark" }]
  : [
      { id: "la-trinite-top-dark", view: "top", theme: "dark" },
      { id: "la-trinite-skipper-chart", view: "skipper", theme: "chart" }
    ];

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const staticResources = report => report.resources.map(resource => ({
  role: resource.role,
  owner: resource.owner,
  family: resource.family,
  geometry: resource.geometry,
  attributes: resource.attributes.map(attribute => ({
    name: attribute.name,
    buffer: attribute.buffer,
    array: attribute.array,
    version: attribute.version,
    bytes: attribute.bytes,
    hash: attribute.hash
  }))
}));

async function collectRun(browser, backend, scene, dpr, repetition) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  const errors = [], warnings = [], externalRequests = [];
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
    else if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("request", request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  await page.addInitScript(() => {
    let callbacks = new Map(), nextId = 0, timestamp = 1000;
    window.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    window.__n5RunFrames = (count, collectState = false) => {
      const states = [];
      for (let index = 0; index < count; index++) {
        const pending = callbacks;
        callbacks = new Map();
        timestamp += 1000 / 60;
        for (const callback of pending.values()) callback(timestamp);
        if (collectState) states.push({
          snapshot: window.__PORTANCE_TEST__.snapshot(),
          camera: window.__PORTANCE_TEST__.cameraReport()
        });
      }
      return states;
    };
    const uploads = { calls: 0, bytes: 0, created: 0, deleted: 0 };
    for (const name of ["bufferData", "bufferSubData", "createBuffer", "deleteBuffer"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id === "kjp-native-static-prototype") {
          if (name === "createBuffer") uploads.created++;
          else if (name === "deleteBuffer") uploads.deleted++;
          else {
            const data = args[name === "bufferData" ? 1 : 2];
            uploads.calls++;
            uploads.bytes += typeof data === "number" ? data : data?.byteLength || 0;
          }
        }
        return result;
      };
    }
    window.__n5Uploads = uploads;
  });
  try {
    const url = new URL(pathToFileURL(simulatorPath));
    url.searchParams.set("test", "1");
    url.searchParams.set("renderer", "legacy");
    await page.goto(url.href);
    await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
    await page.evaluate(({ backend, portText, scene }) => {
      const api = window.__PORTANCE_TEST__;
      api.importPort(portText);
      api.reset({ x: 200, y: 305, heading: .5084, u: 1 });
      api.selectVisualTheme(scene.theme);
      api.selectCameraView(scene.view);
      api.selectWorldRenderer(backend);
      api.setControls({ throttleTarget: .55, rudderTarget: .12 });
      document.querySelector("#pauseButton").click();
    }, { backend, portText, scene });
    await page.evaluate(count => window.__n5RunFrames(count), warmupFrames);
    const before = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.resetRenderPerformanceSamples();
      return {
        world: api.worldRendererReport(),
        uploads: { ...window.__n5Uploads }
      };
    });
    const states = await page.evaluate(count => window.__n5RunFrames(count, true), measuredFrames);
    const after = await page.evaluate(async backend => {
      const api = window.__PORTANCE_TEST__;
      const world = api.worldRendererReport();
      let occupiedPixels = null;
      if (backend === "native") {
        const image = new Image();
        image.src = world.image || api.worldRendererReport({ images: true }).image;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 80;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        occupiedPixels = Array.from({ length: canvas.width * canvas.height }, (_, index) => pixels[index * 4 + 3] > 24)
          .filter(Boolean).length;
      }
      return {
        performance: api.renderPerformanceReport(),
        world,
        uploads: { ...window.__n5Uploads },
        occupiedPixels,
        stage: {
          renderer: getComputedStyle(document.querySelector(backend === "native" ? "#kjp-native-static-prototype" : "#worldScene")).display,
          overlayPointerEvents: getComputedStyle(document.querySelector("#scene")).pointerEvents
        }
      };
    }, backend);
    const screenshot = await page.locator(".stage").screenshot({ animations: "disabled" });
    const screenshotName = `${scene.id}-dpr${dpr}-r${repetition + 1}-${backend}.png`;
    fs.writeFileSync(path.join(outputDirectory, screenshotName), screenshot);

    assert.deepEqual(errors, [], `${backend}: erreurs runtime`);
    assert.deepEqual(externalRequests, [], `${backend}: requêtes réseau`);
    assert.equal(after.performance.sampleCount, measuredFrames);
    assert.ok(after.performance.p50CpuMs >= 0 && after.performance.p95CpuMs >= after.performance.p50CpuMs);
    assert.equal(after.stage.renderer, "block");
    assert.notEqual(after.stage.overlayPointerEvents, "none");
    if (backend === "native") {
      assert.equal(after.world.active, "native");
      assert.equal(after.world.routing.projectedWorldBuilds, before.world.routing.projectedWorldBuilds);
      assert.equal(after.world.routing.renderFrames, before.world.routing.renderFrames);
      assert.deepEqual(staticResources(after.world), staticResources(before.world));
      assert.deepEqual(after.world.memory, before.world.memory);
      assert.equal(after.world.resourceBuilds, before.world.resourceBuilds);
      assert.deepEqual(after.uploads, before.uploads, "les frames mesurées retransfèrent des attributs statiques");
      assert.ok(after.occupiedPixels > 100, "le canevas natif visible est vide");
    } else {
      assert.equal(after.world.active, "legacy");
      assert.ok(after.performance.renderer?.drawCalls > 0);
    }
    return {
      backend,
      scene: scene.id,
      dpr,
      repetition,
      cpuMs: {
        average: after.performance.averageCpuMs,
        p50: after.performance.p50CpuMs,
        p95: after.performance.p95CpuMs,
        p99: after.performance.p99CpuMs
      },
      snapshotsSha256: sha256(JSON.stringify(states.map(state => state.snapshot))),
      camerasSha256: sha256(JSON.stringify(states.map(state => state.camera))),
      screenshot: screenshotName,
      screenshotSha256: sha256(screenshot),
      occupiedPixels: after.occupiedPixels,
      routing: after.world.routing,
      draw: after.world.draw || after.performance.renderer,
      memory: after.world.memory || after.performance.renderer?.memory || null,
      uploads: after.uploads,
      warnings
    };
  } finally {
    await page.close();
  }
}

function rendererDescription(info) {
  return JSON.stringify(info?.gpu?.devices || info?.gpu || {});
}

async function main() {
  const report = {
    protocol: "native-visible-full-path-cpu-v1",
    generatedAt: new Date().toISOString(),
    complete: false,
    qualificationRun: !quick,
    quick,
    headless,
    allowSoftware,
    warmupFrames,
    measuredFrames,
    repetitions,
    viewport,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    sourceSha256: sha256(fs.readFileSync(simulatorPath)),
    portSha256: sha256(portText),
    scope: "Boucle produit complète et canvas visible attaché : pas fixe, interpolation, visibilité, préparation monde, renderer sélectionné, overlays Canvas 2D, audio muet et interface. Temps CPU de render(); compositing et achèvement GPU exclus.",
    activity: "La Trinité, pose (200,305,.5084), u=1 m/s, throttle cible .55, barre .12 rad, sans flux. Temps RAF rejoué par pas de 1/60 s.",
    pairs: []
  };
  const browser = await chromium.launch({ headless });
  try {
    report.browser = browser.version();
    const cdp = await browser.newBrowserCDPSession();
    report.system = await cdp.send("SystemInfo.getInfo");
    const software = /SwiftShader|llvmpipe|softpipe|software/i.test(rendererDescription(report.system));
    report.hardwareVerified = !software;
    assert.ok(allowSoftware || !software, "renderer logiciel détecté ; utiliser --allow-software pour une mesure déclarée non matérielle");
    for (const scene of scenes) for (const dpr of (quick ? [1] : [1, 2])) {
      for (let repetition = 0; repetition < repetitions; repetition++) {
        const order = repetition % 2 ? ["native", "legacy"] : ["legacy", "native"];
        const runs = [];
        for (const backend of order) {
          const run = await collectRun(browser, backend, scene, dpr, repetition);
          runs.push(run);
          console.log(`${scene.id} DPR ${dpr} paire ${repetition + 1} ${backend}: p50/p95/p99 ${run.cpuMs.p50.toFixed(2)}/${run.cpuMs.p95.toFixed(2)}/${run.cpuMs.p99.toFixed(2)} ms`);
        }
        const legacy = runs.find(run => run.backend === "legacy");
        const native = runs.find(run => run.backend === "native");
        assert.equal(native.snapshotsSha256, legacy.snapshotsSha256, "divergence physique/fonctionnelle");
        assert.equal(native.camerasSha256, legacy.camerasSha256, "divergence caméra");
        report.pairs.push({
          scene: scene.id,
          dpr,
          repetition,
          runs,
          ratio: {
            p50: native.cpuMs.p50 / legacy.cpuMs.p50,
            p95: native.cpuMs.p95 / legacy.cpuMs.p95,
            p99: native.cpuMs.p99 / legacy.cpuMs.p99
          }
        });
      }
    }
    const ratios = report.pairs.map(pair => pair.ratio);
    report.summary = {
      pairedRuns: ratios.length,
      nativeFasterP50: ratios.filter(ratio => ratio.p50 < 1).length,
      nativeFasterP95: ratios.filter(ratio => ratio.p95 < 1).length,
      medianP50Ratio: ratios.map(ratio => ratio.p50).sort((a, b) => a - b)[Math.floor(ratios.length / 2)],
      medianP95Ratio: ratios.map(ratio => ratio.p95).sort((a, b) => a - b)[Math.floor(ratios.length / 2)]
    };
    if (!quick) {
      assert.ok(report.summary.nativeFasterP50 >= Math.ceil(ratios.length * .75), "gain p50 non reproductible");
      assert.ok(report.summary.nativeFasterP95 >= Math.ceil(ratios.length * .75), "gain p95 non reproductible");
      assert.ok(report.summary.medianP50Ratio < 1 && report.summary.medianP95Ratio < 1, "gain médian absent");
    }
    report.complete = true;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(outputDirectory, "profile.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Profil visible et captures : ${outputDirectory}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
