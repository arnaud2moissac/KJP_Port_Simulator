"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const scenes = require("../scripts/simulator-render-scenes.js");

const root = path.resolve(__dirname, "..");
const portText = fs.readFileSync(path.join(root, "examples", "la-trinite-sur-mer.kjp"), "utf8");
const simulatorUrl = new URL(pathToFileURL(path.join(root, "simulateur-port.html")));
simulatorUrl.searchParams.set("test", "1");
const viewport = { width: 1280, height: 800 };
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const baselineDirectory = path.join(root, "tests", "visual-baselines", "native");
const baseline = JSON.parse(fs.readFileSync(path.join(baselineDirectory, "manifest.json"), "utf8"));

async function createPage(browser, dpr = 1) {
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
    let callbacks = new Map(), nextId = 0, timestamp = 12_345, maximumPending = 0;
    window.requestAnimationFrame = callback => {
      callbacks.set(++nextId, callback);
      maximumPending = Math.max(maximumPending, callbacks.size);
      return nextId;
    };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    window.__n5Uploads = { calls: 0, bytes: 0 };
    for (const name of ["bufferData", "bufferSubData"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id === "kjp-native-world") {
          const data = args[name === "bufferData" ? 1 : 2];
          window.__n5Uploads.calls++;
          window.__n5Uploads.bytes += typeof data === "number" ? data : data?.byteLength || 0;
        }
        return result;
      };
    }
    window.__n5Step = (count = 1) => {
      for (let index = 0; index < count; index++) {
        const pending = callbacks;
        callbacks = new Map();
        for (const callback of pending.values()) callback(timestamp);
      }
    };
    window.__n5Progress = count => {
      const states = [];
      for (let index = 0; index < count; index++) {
        const pending = callbacks;
        callbacks = new Map();
        timestamp += 1000 / 60;
        for (const callback of pending.values()) callback(timestamp);
        states.push({
          snapshot: window.__PORTANCE_TEST__.snapshot(),
          camera: window.__PORTANCE_TEST__.cameraReport()
        });
      }
      return states;
    };
    window.__n5Soak = count => {
      for (let index = 0; index < count; index++) {
        const pending = callbacks;
        callbacks = new Map();
        timestamp += 1000 / 60;
        for (const callback of pending.values()) callback(timestamp);
      }
      return { pending: callbacks.size, maximumPending };
    };
  });
  await page.goto(simulatorUrl.href);
  await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  await page.evaluate(() => window.__n5Step(3));
  return { page, errors, warnings, externalRequests };
}

async function configure(page, scene) {
  await page.evaluate(({ scene, portText }) => {
    const api = window.__PORTANCE_TEST__;
    if (scene.port === "built-in") {
      api.restoreBuiltInPort();
      api.loadScenario("dockForward");
    } else api.importPort(portText);
    api.selectVisualTheme(scene.theme);
    api.selectCameraView(scene.view);
    if (scene.environment) api.reset({ x: 25, y: -27.35, heading: 0 }, scene.environment);
    document.querySelector(`[data-mode="${scene.mode}"]`).click();
    document.querySelector("#impactToast").classList.remove("visible");
    window.__n5Step(4);
  }, { scene, portText });
}

async function capture(page) {
  await page.waitForFunction(() => (
    window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready
  ));
  return page.evaluate(async () => {
    const api = window.__PORTANCE_TEST__;
    window.__n5Step(5);
    const world = api.worldRendererReport({ images: true });
    return {
      snapshot: api.snapshot(),
      camera: api.cameraReport(),
      scale: api.displayScaleReport(),
      mooring: api.mooringReport(),
      overlay: document.querySelector("#scene").toDataURL(),
      worldImage: world.image,
      report: world,
      interaction: {
        overlayPointerEvents: getComputedStyle(document.querySelector("#scene")).pointerEvents,
        nativePointerEvents: document.querySelector("#kjp-native-world")
          ? getComputedStyle(document.querySelector("#kjp-native-world")).pointerEvents : null
      }
    };
  });
}

async function visualMetrics(page, reference, candidate, transform = "none") {
  return page.evaluate(async ({ reference, candidate, transform }) => {
    const width = 160, height = 100;
    async function decode(url, mutation) {
      const image = new Image(); image.src = url; await image.decode();
      const source = document.createElement("canvas"); source.width = width; source.height = height;
      const sourceContext = source.getContext("2d");
      sourceContext.drawImage(image, 0, 0, width, height);
      if (mutation === "none") return sourceContext.getImageData(0, 0, width, height).data;
      const target = document.createElement("canvas"); target.width = width; target.height = height;
      const context = target.getContext("2d");
      if (mutation === "omission") return context.getImageData(0, 0, width, height).data;
      if (mutation === "displacement") context.drawImage(source, Math.round(width * .32), 0);
      if (mutation === "miniature") context.drawImage(source, width * .4, height * .4, width * .2, height * .2);
      if (mutation === "unreadable") {
        const tiny = document.createElement("canvas"); tiny.width = 12; tiny.height = 8;
        tiny.getContext("2d").drawImage(source, 0, 0, tiny.width, tiny.height);
        context.imageSmoothingEnabled = true;
        context.drawImage(tiny, 0, 0, width, height);
      }
      return context.getImageData(0, 0, width, height).data;
    }
    const expected = await decode(reference, "none"), actual = await decode(candidate, transform);
    function describe(data) {
      let count = 0, edges = 0, minX = width, minY = height, maxX = -1, maxY = -1;
      const occupied = new Uint8Array(width * height);
      for (let index = 0; index < occupied.length; index++) {
        if (data[index * 4 + 3] <= 20) continue;
        occupied[index] = 1; count++;
        const x = index % width, y = Math.floor(index / width);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const other of [index + 1, index + width]) {
          if (other >= occupied.length || (other === index + 1 && x === width - 1)) continue;
          let delta = 0;
          for (let channel = 0; channel < 4; channel++) delta = Math.max(delta, Math.abs(data[index * 4 + channel] - data[other * 4 + channel]));
          if (delta > 28) edges++;
        }
      }
      return { count, edges, occupied, bbox: count ? { minX, minY, maxX, maxY,
        width: maxX - minX + 1, height: maxY - minY + 1,
        centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 } : null };
    }
    const a = describe(expected), b = describe(actual);
    let matchedExpected = 0;
    for (let index = 0; index < a.occupied.length; index++) {
      if (!a.occupied[index]) continue;
      const x = index % width, y = Math.floor(index / width);
      let found = false;
      for (let dy = -2; dy <= 2 && !found; dy++) for (let dx = -2; dx <= 2; dx++) {
        const tx = x + dx, ty = y + dy;
        if (tx >= 0 && tx < width && ty >= 0 && ty < height && b.occupied[ty * width + tx]) { found = true; break; }
      }
      if (found) matchedExpected++;
    }
    const ratio = (value, base) => base ? value / base : 0;
    const metrics = {
      expectedPixels: a.count,
      actualPixels: b.count,
      coverageRecall: ratio(matchedExpected, a.count),
      pixelRatio: ratio(b.count, a.count),
      edgeRatio: ratio(b.edges, a.edges),
      centerDx: a.bbox && b.bbox ? Math.abs(b.bbox.centerX - a.bbox.centerX) / width : 1,
      centerDy: a.bbox && b.bbox ? Math.abs(b.bbox.centerY - a.bbox.centerY) / height : 1,
      widthRatio: a.bbox && b.bbox ? ratio(b.bbox.width, a.bbox.width) : 0,
      heightRatio: a.bbox && b.bbox ? ratio(b.bbox.height, a.bbox.height) : 0
    };
    return {
      metrics,
      gates: {
        presence: a.count > 20 && b.count >= Math.max(20, a.count * .65) && b.count <= a.count * 1.4,
        // Le gabarit GLB est contrôlé séparément dans native-player.test.js ;
        // ce seuil monde détecte une omission ou un déplacement du joueur.
        alignment: metrics.coverageRecall >= .80 && metrics.centerDx <= .16 && metrics.centerDy <= .16,
        scale: metrics.widthRatio >= .65 && metrics.widthRatio <= 1.4 && metrics.heightRatio >= .65 && metrics.heightRatio <= 1.4,
        stroke: b.edges >= 20 && metrics.edgeRatio >= .50 && metrics.edgeRatio <= 2
      }
    };
  }, { reference, candidate, transform });
}

test("renderer natif — références sémantiques, DPR et mutations", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-qualification-"));
  const cases = [
    ...scenes.map(scene => ({ scene, dpr: 1 })),
    ...scenes.filter(scene => ["built-in-dark-top-navigation", "built-in-chart-skipper-navigation"].includes(scene.id))
      .map(scene => ({ scene, dpr: 2 }))
  ];
  const diagnostics = [];
  let mutationSource = null;
  for (const { scene, dpr } of cases) {
    const { page, errors, warnings, externalRequests } = await createPage(browser, dpr);
    await configure(page, scene);
    const native = await capture(page);
    const candidate = Buffer.from(native.worldImage.split(",")[1], "base64");
    fs.writeFileSync(path.join(output, `${scene.id}-dpr${dpr}-native.png`), candidate);
    const referenceRecord = baseline.scenes.find(record => record.id === scene.id);
    assert.ok(referenceRecord, `${scene.id}: référence native absente`);
    const referenceBuffer = fs.readFileSync(path.join(root, referenceRecord.image));
    const reference = `data:image/png;base64,${referenceBuffer.toString("base64")}`;
    if (dpr === 1) {
      const report = { renderer: native.report.active, snapshot: native.snapshot,
        camera: native.camera, mooring: native.mooring.rendered };
      assert.equal(sha256(JSON.stringify(report)), referenceRecord.reportSha256,
        `${scene.id}: état fonctionnel différent de la référence`);
    }
    assert.equal(native.interaction.nativePointerEvents, "none");
    assert.notEqual(native.interaction.overlayPointerEvents, "none");
    assert.equal(native.report.glError, 0);
    assert.equal(native.report.routing.lastFrame.backend, "native");
    assert.equal(native.report.routing.lastFrame.projectedWorld, false);
    assert.equal(native.report.routing.lastFrame.renderFrame, false);

    const owners = new Set(native.report.resources.map(resource => resource.owner));
    const missingOwners = native.report.catalog.owners.filter(owner => !owners.has(owner.key));
    assert.deepEqual(missingOwners, [], `${scene.id}: propriétaires sans ressource visible`);
    const sourceFamilies = await page.evaluate(() => [...new Set(
      window.__PORTANCE_TEST__.nativeInfrastructureSourceReport().map(owner => owner.family)
    )].sort());
    const nativeFamilies = [...new Set(native.report.catalog.owners.map(owner => owner.family))].sort();
    assert.ok(sourceFamilies.every(family => nativeFamilies.includes(family)), `${scene.id}: famille source omise`);
    assert.equal(native.report.player.localCoordinates, true);
    if (scene.environment) {
      assert.ok(native.report.flow.wind.segments > 0);
      assert.ok(native.report.flow.current.segments > 0);
    }

    const comparison = await visualMetrics(page, reference, native.worldImage);
    assert.ok(Object.values(comparison.gates).every(Boolean), `${scene.id}/DPR${dpr}: ${JSON.stringify(comparison)}`);
    const overlayComparison = await visualMetrics(page, native.overlay, native.overlay);
    assert.ok(overlayComparison.metrics.expectedPixels > 20 && overlayComparison.gates.stroke,
      `${scene.id}/DPR${dpr}: couche Canvas 2D illisible`);
    diagnostics.push({ id: scene.id, dpr, ...comparison.metrics,
      overlayPixelRatio: overlayComparison.metrics.pixelRatio,
      referenceSha256: referenceRecord.imageSha256, nativeSha256: sha256(candidate) });
    if (!mutationSource && scene.id === "built-in-dark-top-navigation" && dpr === 1) {
      mutationSource = { page, reference, native: native.worldImage };
    } else await page.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    assert.ok(warnings.every(message => /^The AudioContext was not allowed to start\./.test(message)
      || /^\[\.WebGL-.*GPU stall due to ReadPixels/.test(message)), JSON.stringify(warnings));
  }

  assert.ok(mutationSource);
  for (const [mutation, gate] of [["omission", "presence"], ["displacement", "alignment"],
    ["miniature", "scale"], ["unreadable", "stroke"]]) {
    const result = await visualMetrics(mutationSource.page, mutationSource.reference, mutationSource.native, mutation);
    assert.equal(result.gates[gate], false, `${mutation}: le seuil ${gate} doit détecter la mutation ${JSON.stringify(result)}`);
  }
  const pointerMutation = await mutationSource.page.evaluate(() => {
    const overlay = document.querySelector("#scene");
    overlay.style.pointerEvents = "none";
    return getComputedStyle(overlay).pointerEvents !== "none";
  });
  assert.equal(pointerMutation, false, "le seuil d'interaction détecte une couche de picking désactivée");
  await mutationSource.page.close();
  t.diagnostic(`${diagnostics.length} scènes/DPR qualifiés ; captures ${output}`);
  t.diagnostic(JSON.stringify(diagnostics));
});

test("renderer natif — progression contrôlée reproductible et caméra mobile", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const view of ["top", "skipper"]) {
    const runs = [];
    for (const run of ["reference", "candidate"]) {
      const { page, errors, externalRequests } = await createPage(browser);
      await page.evaluate(view => {
        const api = window.__PORTANCE_TEST__;
        api.restoreBuiltInPort();
        api.loadScenario("dockForward");
        api.reset({ x: 25, y: -38, heading: -Math.PI / 2, u: 1 });
        api.selectVisualTheme("chart");
        api.selectCameraView(view);
        api.setControls({ throttleTarget: .55, rudderTarget: .12 });
        window.__n5Step(8);
        document.querySelector("#pauseButton").click();
      }, view);
      const before = await page.evaluate(() => ({
        snapshot: window.__PORTANCE_TEST__.snapshot(),
        world: window.__PORTANCE_TEST__.worldRendererReport()
      }));
      const states = await page.evaluate(() => window.__n5Progress(30));
      const after = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
      assert.deepEqual(errors, []);
      assert.deepEqual(externalRequests, []);
      assert.ok(states.at(-1).snapshot.timing.simulatedSeconds > before.snapshot.timing.simulatedSeconds);
      assert.notDeepEqual(states.at(-1).snapshot.motion, before.snapshot.motion);
      assert.notDeepEqual(states.at(-1).camera, states[0].camera, `${view}: caméra immobile`);
      assert.equal(after.routing.projectedWorldBuilds, before.world.routing.projectedWorldBuilds);
      const fingerprint = report => report.resources.map(resource => ({
        role: resource.role, geometry: resource.geometry,
        attributes: resource.attributes.map(attribute => ({
          name: attribute.name, version: attribute.version, bytes: attribute.bytes, hash: attribute.hash
        }))
      }));
      assert.deepEqual(fingerprint(after), fingerprint(before.world), `${view}/${run}: ressources reconstruites`);
      runs.push(states);
      await page.close();
    }
    assert.deepEqual(runs[1], runs[0], `${view}: progression native non reproductible`);
  }
});

test("renderer natif — soak skipper sans dérive de ressources", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { page, errors, externalRequests } = await createPage(browser, 2);
  await page.waitForFunction(() => (
    window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready
  ));
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -27.35, heading: 0, u: 1 });
    api.selectCameraView("skipper");
    api.selectVisualTheme("dark");
    api.setControls({ throttleTarget: .42, rudderTarget: .08 });
    window.__n5Step(12);
    document.querySelector("#pauseButton").click();
  });
  const before = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    snapshot: window.__PORTANCE_TEST__.snapshot(),
    uploads: { ...window.__n5Uploads }
  }));
  const loop = await page.evaluate(() => window.__n5Soak(1200));
  const after = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    snapshot: window.__PORTANCE_TEST__.snapshot(),
    uploads: { ...window.__n5Uploads }
  }));
  const fingerprint = report => report.resources.map(resource => ({
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
  assert.equal(loop.pending, 1);
  assert.equal(loop.maximumPending, 1);
  assert.equal(after.report.active, "native");
  assert.equal(after.report.routing.projectedWorldBuilds, before.report.routing.projectedWorldBuilds);
  assert.deepEqual(fingerprint(after.report), fingerprint(before.report));
  assert.deepEqual(after.report.memory, before.report.memory);
  assert.deepEqual(after.uploads, before.uploads);
  assert.notDeepEqual(after.snapshot.motion, before.snapshot.motion);
  assert.ok(after.snapshot.timing.simulatedSeconds - before.snapshot.timing.simulatedSeconds > 19);
  assert.notDeepEqual(after.report.camera, before.report.camera);
  assert.equal(after.report.glError, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await page.close();
  t.diagnostic(`1200 images skipper, ${after.snapshot.timing.simulatedSeconds.toFixed(2)} s simulées, ${after.report.memory.geometries} géométries stables`);
});
