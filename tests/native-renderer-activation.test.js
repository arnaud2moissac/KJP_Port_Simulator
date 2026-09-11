"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const simulatorPath = path.join(root, "simulateur-port.html");
const portText = fs.readFileSync(path.join(root, "examples", "la-trinite-sur-mer.kjp"), "utf8");
const simulatorUrl = pathToFileURL(simulatorPath);

const waitFrames = (page, count = 3) => page.evaluate(frames => new Promise(resolve => {
  const next = remaining => requestAnimationFrame(() => remaining > 1 ? next(remaining - 1) : resolve());
  next(frames);
}), count);

function url(parameters = {}) {
  const value = new URL(simulatorUrl);
  for (const [key, setting] of Object.entries(parameters)) value.searchParams.set(key, setting);
  return value.href;
}

function observe(page) {
  const errors = [], warnings = [], externalRequests = [];
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
    else if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("request", request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  return { errors, warnings, externalRequests };
}

test("Three natif N6 — activation produit, appareils, import et retour à Legacy", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  for (const configuration of [
    { id: "desktop", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    { id: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ]) {
    const page = await browser.newPage(configuration);
    const observed = observe(page);
    await page.goto(simulatorUrl.href);
    await page.waitForSelector('body[data-world-renderer="native"]');
    await waitFrames(page, 5);
    const first = await page.evaluate(() => {
      const native = document.querySelector("#kjp-native-static-prototype");
      const overlay = document.querySelector("#scene");
      const stage = document.querySelector(".stage").getBoundingClientRect();
      return {
        renderer: document.body.dataset.worldRenderer,
        testApi: typeof window.__PORTANCE_TEST__,
        native: {
          connected: native?.isConnected,
          display: native ? getComputedStyle(native).display : null,
          pointerEvents: native ? getComputedStyle(native).pointerEvents : null,
          ariaHidden: native?.getAttribute("aria-hidden"),
          width: native?.width,
          height: native?.height,
          glError: native?.getContext("webgl2")?.getError()
        },
        legacyDisplay: getComputedStyle(document.querySelector("#worldScene")).display,
        overlayPointerEvents: getComputedStyle(overlay).pointerEvents,
        stage: { width: stage.width, height: stage.height },
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    assert.equal(first.renderer, "native");
    assert.equal(first.testApi, "undefined");
    assert.equal(first.native.connected, true);
    assert.equal(first.native.display, "block");
    assert.equal(first.native.pointerEvents, "none");
    assert.equal(first.native.ariaHidden, "true");
    assert.equal(first.native.glError, 0);
    assert.equal(first.legacyDisplay, "none");
    assert.notEqual(first.overlayPointerEvents, "none");
    const effectiveDpr = Math.min(configuration.deviceScaleFactor, 2);
    assert.equal(first.native.width, Math.round(first.stage.width * effectiveDpr));
    assert.equal(first.native.height, Math.round(first.stage.height * effectiveDpr));
    assert.equal(first.overflow, false);
    const initialImage = await page.locator(".stage").screenshot();
    assert.ok(initialImage.length > 20_000, `${configuration.id}: scène vide`);
    if (configuration.id === "desktop") await page.locator("#skipperViewButton").click();
    await page.locator("#themeToggle").click();
    await waitFrames(page, 4);
    const changedImage = await page.locator(".stage").screenshot();
    assert.notDeepEqual(changedImage, initialImage, `${configuration.id}: interaction visuelle sans effet`);
    assert.deepEqual(observed.errors, []);
    assert.deepEqual(observed.externalRequests, []);
    assert.ok(observed.warnings.every(message => /^The AudioContext was not allowed to start\./.test(message)
      || /^\[\.WebGL-.*GPU stall due to ReadPixels/.test(message)), JSON.stringify(observed.warnings));
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2 });
  const observed = observe(page);
  await page.goto(url({ test: "1" }));
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().routing.nativeFrames > 2);
  const initial = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(initial.defaultRenderer, "native");
  assert.equal(initial.startupRenderer, "native");
  assert.equal(initial.requestedRenderer, null);
  assert.equal(initial.active, "native");
  assert.equal(initial.legacyDefault, false);

  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), portText);
  await waitFrames(page, 5);
  const imported = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(imported.active, "native");
  assert.ok(imported.catalog.owners.some(owner => owner.family === "land"));
  assert.ok(imported.catalog.owners.some(owner => owner.family === "buoy"));
  await page.setViewportSize({ width: 840, height: 620 });
  await waitFrames(page, 4);
  const resized = await page.evaluate(() => {
    const report = window.__PORTANCE_TEST__.worldRendererReport();
    const bounds = document.querySelector("#scene").getBoundingClientRect();
    return { report, width: bounds.width, height: bounds.height };
  });
  assert.equal(resized.report.camera.width, resized.width);
  assert.equal(resized.report.camera.height, resized.height);

  await page.evaluate(() => {
    if (!window.__PORTANCE_TEST__.snapshot().controls.paused) document.querySelector("#pauseButton").click();
  });
  await waitFrames(page, 2);
  const beforeRollback = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("legacy"));
  await waitFrames(page, 3);
  const legacy = await page.evaluate(() => ({
    state: window.__PORTANCE_TEST__.snapshot(),
    report: window.__PORTANCE_TEST__.worldRendererReport()
  }));
  assert.deepEqual(legacy.state, beforeRollback);
  assert.equal(legacy.report.active, "legacy");
  assert.equal(legacy.report.canvas.nativeConnected, false);
  assert.equal(legacy.report.canvas.legacyDisplay, "block");
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("native"));
  await waitFrames(page, 4);
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), beforeRollback);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).active, "native");
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.externalRequests, []);
  await page.close();

  const fallback = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const fallbackObserved = observe(fallback);
  await fallback.goto(url({ test: "1", failNativeStartup: "1" }));
  await fallback.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  await waitFrames(fallback, 3);
  const fallbackReport = await fallback.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(fallbackReport.defaultRenderer, "native");
  assert.equal(fallbackReport.startupRenderer, "native");
  assert.equal(fallbackReport.active, "legacy");
  assert.match(fallbackReport.nativeInfrastructureError, /injecté/);
  assert.equal(fallbackReport.canvas.nativeConnected, false);
  assert.equal(fallbackReport.canvas.legacyDisplay, "block");
  assert.equal(await fallback.evaluate(() => document.body.dataset.worldRenderer), "legacy");
  assert.deepEqual(fallbackObserved.errors, []);
  assert.ok(fallbackObserved.warnings.some(message => /utilisation de Legacy/.test(message)));
  await fallback.close();

  const override = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const overrideObserved = observe(override);
  await override.goto(url({ test: "1", renderer: "legacy" }));
  await override.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  await waitFrames(override, 3);
  const overrideReport = await override.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(overrideReport.defaultRenderer, "native");
  assert.equal(overrideReport.startupRenderer, "legacy");
  assert.equal(overrideReport.requestedRenderer, "legacy");
  assert.equal(overrideReport.active, "legacy");
  assert.equal(overrideReport.canvas.nativeConnected, false);
  assert.deepEqual(overrideObserved.errors, []);
  await override.close();

  const productOverride = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const productOverrideObserved = observe(productOverride);
  await productOverride.goto(url({ renderer: "legacy" }));
  await productOverride.waitForSelector('body[data-world-renderer="legacy"]');
  await waitFrames(productOverride, 3);
  assert.equal(await productOverride.evaluate(() => typeof window.__PORTANCE_TEST__), "undefined");
  assert.equal(await productOverride.locator("#kjp-native-static-prototype").count(), 0);
  assert.equal(await productOverride.locator("#worldScene").evaluate(element => getComputedStyle(element).display), "block");
  assert.deepEqual(productOverrideObserved.errors, []);
  assert.deepEqual(productOverrideObserved.externalRequests, []);
  await productOverride.close();
});

test("Three natif N6 — soak skipper sans dérive de ressources", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const observed = observe(page);
  await page.addInitScript(() => {
    let callbacks = new Map(), nextId = 0, time = 1000, maximumPending = 0;
    window.requestAnimationFrame = callback => {
      callbacks.set(++nextId, callback);
      maximumPending = Math.max(maximumPending, callbacks.size);
      return nextId;
    };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    window.__n6Uploads = { calls: 0, bytes: 0 };
    for (const name of ["bufferData", "bufferSubData"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id === "kjp-native-static-prototype") {
          const data = args[name === "bufferData" ? 1 : 2];
          window.__n6Uploads.calls++;
          window.__n6Uploads.bytes += typeof data === "number" ? data : data?.byteLength || 0;
        }
        return result;
      };
    }
    window.__n6Step = count => {
      for (let index = 0; index < count; index++) {
        const pending = callbacks;
        callbacks = new Map();
        time += 1000 / 60;
        for (const callback of pending.values()) callback(time);
      }
      return { pending: callbacks.size, maximumPending };
    };
  });
  await page.goto(url({ test: "1" }));
  await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -27.35, heading: 0, u: 1 });
    api.selectCameraView("skipper");
    api.selectVisualTheme("dark");
    api.setControls({ throttleTarget: .42, rudderTarget: .08 });
    window.__n6Step(12);
    document.querySelector("#pauseButton").click();
  });
  const before = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    snapshot: window.__PORTANCE_TEST__.snapshot(),
    uploads: { ...window.__n6Uploads }
  }));
  let loop;
  for (let chunk = 0; chunk < 12; chunk++) {
    loop = await page.evaluate(() => window.__n6Step(100));
  }
  const after = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    snapshot: window.__PORTANCE_TEST__.snapshot(),
    uploads: { ...window.__n6Uploads }
  }));
  const fingerprint = report => report.resources.map(resource => ({
    role: resource.role,
    owner: resource.owner,
    family: resource.family,
    geometry: resource.geometry,
    attributes: resource.attributes.map(attribute => ({
      name: attribute.name, buffer: attribute.buffer, array: attribute.array,
      version: attribute.version, bytes: attribute.bytes, hash: attribute.hash
    }))
  }));
  assert.equal(loop.pending, 1);
  assert.equal(loop.maximumPending, 1);
  assert.equal(after.report.active, "native");
  assert.equal(after.report.routing.projectedWorldBuilds, before.report.routing.projectedWorldBuilds);
  assert.equal(after.report.routing.renderFrames, before.report.routing.renderFrames);
  assert.deepEqual(fingerprint(after.report), fingerprint(before.report));
  assert.deepEqual(after.report.memory, before.report.memory);
  assert.deepEqual(after.uploads, before.uploads);
  assert.notDeepEqual(after.snapshot.motion, before.snapshot.motion);
  assert.ok(after.snapshot.timing.simulatedSeconds - before.snapshot.timing.simulatedSeconds > 19);
  assert.notDeepEqual(after.report.camera, before.report.camera);
  assert.equal(after.report.glError, 0);
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.externalRequests, []);
  t.diagnostic(`1200 images skipper, ${after.snapshot.timing.simulatedSeconds.toFixed(2)} s simulées, ${after.report.memory.geometries} géométries stables`);
});
