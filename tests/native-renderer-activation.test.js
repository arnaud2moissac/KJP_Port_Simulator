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

const expectedBrowserWarnings = warnings => warnings.every(message => (
  /^The AudioContext was not allowed to start\./.test(message)
  || /^\[\.WebGL-.*GPU stall due to ReadPixels/.test(message)
));

const expectedBrowserErrors = errors => errors.every(message => (
  /^The AudioContext was not allowed to start\./.test(message)
));

test("renderer natif — démarrage produit, GLB, appareils et import", async t => {
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
    if (configuration.id === "desktop") await page.locator("#skipperViewButton").click();
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#kjp-native-world");
      return canvas && canvas.width > 0 && canvas.height > 0;
    });
    await waitFrames(page, 5);
    const state = await page.evaluate(() => {
      const native = document.querySelector("#kjp-native-world");
      const stage = document.querySelector(".stage").getBoundingClientRect();
      return {
        renderer: document.body.dataset.worldRenderer,
        testApi: typeof window.__PORTANCE_TEST__,
        native: {
          connected: native?.isConnected,
          pointerEvents: native ? getComputedStyle(native).pointerEvents : null,
          ariaHidden: native?.getAttribute("aria-hidden"),
          width: native?.width,
          height: native?.height,
          glError: native?.getContext("webgl2")?.getError()
        },
        stage: { width: stage.width, height: stage.height },
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    assert.equal(state.renderer, "native");
    assert.equal(state.testApi, "undefined");
    assert.equal(state.native.connected, true);
    assert.equal(state.native.pointerEvents, "none");
    assert.equal(state.native.ariaHidden, "true");
    assert.equal(state.native.glError, 0);
    const effectiveDpr = Math.min(configuration.deviceScaleFactor, 2);
    assert.equal(state.native.width, Math.round(state.stage.width * effectiveDpr));
    assert.equal(state.native.height, Math.round(state.stage.height * effectiveDpr));
    assert.equal(state.overflow, false);
    assert.ok((await page.locator(".stage").screenshot()).length > 20_000, configuration.id);
    assert.ok(expectedBrowserErrors(observed.errors), JSON.stringify(observed.errors));
    assert.deepEqual(observed.externalRequests, []);
    assert.ok(expectedBrowserWarnings(observed.warnings), JSON.stringify(observed.warnings));
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2 });
  const observed = observe(page);
  await page.goto(url({ test: "1" }));
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready);
  const initial = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(initial.active, "native");
  assert.equal(initial.player.model.error, null);
  assert.equal(initial.player.model.asset.name, "kjp_sun_odyssey_36i.glb");
  assert.equal(initial.player.model.loadCount, 1);

  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), portText);
  await waitFrames(page, 4);
  const imported = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(imported.active, "native");
  assert.equal(imported.player.model.loadCount, 1);
  assert.ok(imported.catalog.owners.some(owner => owner.family === "land"));
  await page.setViewportSize({ width: 840, height: 620 });
  await waitFrames(page, 3);
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.externalRequests, []);
  await page.close();
});

test("secours Canvas 2D — sélection, picking et reprise native préservent l'état", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 } });
  const observed = observe(page);
  await page.goto(url({ test: "1" }));
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready);
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: -Math.PI / 2 });
    api.selectCameraView("top");
  });
  await waitFrames(page, 3);
  const before = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("canvas"));
  await waitFrames(page, 3);
  const fallback = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(fallback.active, "canvas");
  assert.equal(fallback.canvas.fallbackActive, true);
  assert.equal(fallback.canvas.nativeConnected, false);
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), before);
  assert.ok((await page.locator(".stage").screenshot()).length > 20_000);

  const stage = await page.locator("#scene").boundingBox();
  const boat = fallback.presentation.hitTargets.cleats.find(hit => hit.endpoint.type === "boat" && hit.enabled);
  assert.ok(boat);
  await page.mouse.click(stage.x + boat.x, stage.y + boat.y);
  await waitFrames(page, 2);
  const selected = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  const shore = selected.presentation.hitTargets.cleats.find(hit => hit.endpoint.type === "shore" && hit.enabled);
  assert.ok(shore);
  const count = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().lines.length);
  await page.mouse.click(stage.x + shore.x, stage.y + shore.y);
  await waitFrames(page, 2);
  assert.equal(await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().lines.length), count + 1);

  const state = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("native"));
  await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), state);
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.externalRequests, []);
  await page.close();
});

test("secours Canvas 2D — démarrage, WebGL2, GLB, reconstruction et perte de contexte", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  async function expectFallback(parameters, setup = null, trigger = null, expected) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const observed = observe(page);
    if (setup) await page.addInitScript(setup);
    await page.goto(url({ test: "1", ...parameters }));
    await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
    if (trigger) await trigger(page);
    await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().active === "canvas");
    await waitFrames(page, 2);
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
    assert.match(report.nativeInfrastructureError, expected);
    assert.equal(report.canvas.nativeConnected, false);
    assert.equal(report.canvas.fallbackActive, true);
    assert.ok((await page.locator(".stage").screenshot()).length > 20_000);
    assert.ok(expectedBrowserErrors(observed.errors), JSON.stringify(observed.errors));
    assert.deepEqual(observed.externalRequests, []);
    assert.ok(observed.warnings.some(message => /secours Canvas 2D/.test(message)),
      JSON.stringify(observed.warnings));
    await page.close();
  }

  await expectFallback({ failNativeStartup: "1" }, null, null, /construction injecté/);
  await expectFallback({}, () => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /^webgl2?$/.test(kind) ? null : original.call(this, kind, ...args);
    };
  }, null, /WebGL2 indisponible/);
  await expectFallback({ failNativePlayerModel: "1" }, null, null, /chargement injecté/);
  await expectFallback({}, null, async page => {
    await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
    await page.evaluate(text => {
      window.__PORTANCE_TEST__.failNextNativeInfrastructureBuild();
      window.__PORTANCE_TEST__.importPort(text);
    }, portText);
  }, /construction injecté/);
  await expectFallback({}, null, async page => {
    await page.waitForSelector("#kjp-native-world");
    await page.locator("#kjp-native-world").evaluate(canvas => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
  }, /contexte WebGL perdu/);

  const override = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await override.goto(url({ test: "1", renderer: "canvas" }));
  await override.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  const report = await override.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(report.startupRenderer, "canvas");
  assert.equal(report.requestedRenderer, "canvas");
  assert.equal(report.active, "canvas");
  await override.close();
});
