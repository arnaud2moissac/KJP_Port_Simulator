"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { isSimulatorAnalyticsRequest, stubSimulatorAnalytics } = require("./helpers/simulator-network.js");

const simulator = pathToFileURL(path.resolve(__dirname, "..", "simulateur-port.html"));
const settle = (page, count = 3) => page.evaluate(count => new Promise(resolve => {
  const next = remaining => requestAnimationFrame(() => remaining > 1 ? next(remaining - 1) : resolve());
  next(count);
}), count);

async function open(browser, parameters = {}, options = {}, setup = null) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "fr-FR", ...options });
  await stubSimulatorAnalytics(page);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && !isSimulatorAnalyticsRequest(request.url())) requests.push(request.url());
  });
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.__waterTime = 12_345;
    window.requestAnimationFrame = callback => raf(() => callback(window.__waterTime));
  });
  if (setup) await page.addInitScript(setup);
  const url = new URL(simulator);
  for (const [key, value] of Object.entries({ test: "1", ...parameters })) url.searchParams.set(key, value);
  await page.goto(url.href);
  await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  return { page, errors, requests };
}

const ready = async page => {
  await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
  await settle(page, 5);
};
const background = page => page.evaluate(() => ({
  water: window.__PORTANCE_TEST__.visualThemeReport().water,
  css: getComputedStyle(document.querySelector(".stage")).background,
  vignette: getComputedStyle(document.querySelector(".stage-vignette")).backgroundImage
}));
const geometry = world => world.resources.filter(resource => resource.family !== "chart-grid")
  .map(resource => ({ role: resource.role, geometry: resource.geometry, attributes: resource.attributes }));
const noErrors = observed => {
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.requests, []);
};

test("eau — défaut daylight, option réversible et éligibilité des thèmes/modes", { timeout: 120_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const observed = await open(browser);
  const { page } = observed;
  await ready(page);
  const initial = await background(page);
  assert.equal(initial.water.requestedStyle, "daylight");
  assert.equal(initial.water.activeStyle, "daylight");
  assert.equal(initial.water.base, "#19434f");
  assert.equal(initial.vignette, "none");
  for (let cycle = 0; cycle < 2; cycle++) for (const theme of ["dark", "chart"]) {
    for (const mode of ["navigation", "translation", "rotation"]) {
      await page.locator(`[data-mode="${mode === "navigation" ? "navigation" : "understand"}"]`).click();
      await page.evaluate(({ theme, mode }) => {
        const api = window.__PORTANCE_TEST__;
        api.selectVisualTheme(theme);
        if (mode !== "navigation") api.setUnderstandView(mode);
        api.selectWaterStyle("simple");
      }, { theme, mode });
      await settle(page);
      const simple = await background(page);
      await page.evaluate(() => window.__PORTANCE_TEST__.selectWaterStyle("daylight"));
      await settle(page);
      const day = await background(page);
      assert.equal(day.water.requestedStyle, "daylight");
      const eligible = theme === "dark" && mode === "navigation";
      assert.equal(day.water.activeStyle, eligible ? "daylight" : "simple");
      if (eligible) {
        assert.notEqual(day.css, simple.css);
        assert.equal(day.vignette, "none");
      } else {
        assert.equal(day.css, simple.css, `${theme}/${mode} conserve le fond simple`);
        assert.equal(day.vignette, simple.vignette);
      }
    }
  }
  noErrors(observed);
  await page.close();
  const simple = await open(browser, { water: "simple" });
  await ready(simple.page);
  const historical = await background(simple.page);
  assert.equal(historical.water.requestedStyle, "simple");
  assert.equal(historical.water.activeStyle, "simple");
  assert.notEqual(historical.css, initial.css);
  noErrors(simple);
  await simple.page.close();
  const invalid = await open(browser, { water: "unknown" });
  await ready(invalid.page);
  assert.equal((await background(invalid.page)).water.activeStyle, "simple");
  assert.equal((await background(invalid.page)).css, historical.css);
  noErrors(invalid);
  await invalid.page.close();
});

test("eau — bascules sans allocation, upload ni compilation ; destruction du renderer", { timeout: 120_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const observed = await open(browser, { water: "daylight" }, { deviceScaleFactor: 2 }, () => {
    const records = new Map();
    const record = gl => {
      if (!records.has(gl)) records.set(gl, { canvas: gl.canvas, calls: {} });
      return records.get(gl);
    };
    for (const method of ["createBuffer", "deleteBuffer", "bufferData", "bufferSubData",
      "createTexture", "deleteTexture", "texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D",
      "compressedTexImage2D", "compressedTexSubImage2D", "createProgram", "deleteProgram", "compileShader"]) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) {
        if (this.canvas.id === "kjp-native-world") {
          const current = record(this);
          current.calls[method] = (current.calls[method] || 0) + 1;
        }
        return original.apply(this, args);
      };
    }
    window.__waterGpu = () => [...records].map(([gl, { canvas, calls }]) => ({
      calls: { ...calls }, lost: gl.isContextLost(), connected: canvas.isConnected,
      width: canvas.width, height: canvas.height
    }));
  });
  const { page } = observed;
  await ready(page);
  const capture = () => page.evaluate(() => ({
    world: window.__PORTANCE_TEST__.worldRendererReport({ images: true }),
    state: window.__PORTANCE_TEST__.snapshot(), gpu: window.__waterGpu(),
    overlay: document.querySelector("#scene").toDataURL()
  }));
  const before = await capture();
  for (let index = 0; index < 12; index++) {
    await page.evaluate(index => window.__PORTANCE_TEST__.selectWaterStyle(index % 2 ? "daylight" : "simple"), index);
    await settle(page, 2);
  }
  const after = await capture();
  assert.deepEqual(after.gpu, before.gpu, "ni allocation, ni transfert, ni compilation après chauffe");
  assert.deepEqual(geometry(after.world), geometry(before.world));
  assert.deepEqual(after.world.memory, before.world.memory);
  for (const key of ["calls", "triangles", "points", "lines"]) assert.equal(after.world.draw[key], before.world.draw[key]);
  assert.equal(after.world.image, before.world.image);
  assert.equal(after.overlay, before.overlay);
  assert.deepEqual(after.state, before.state);
  assert.equal(after.world.player.model.loadCount, 1);
  assert.equal(after.gpu[0].width, Math.round(after.world.camera.width * 2));
  assert.equal(after.gpu[0].height, Math.round(after.world.camera.height * 2));
  for (let cycle = 0; cycle < 3; cycle++) {
    const state = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("canvas"));
    await settle(page);
    const disposed = await page.evaluate(() => ({
      gpu: window.__waterGpu(),
      background: document.querySelector(".stage").style.background,
      vignette: document.querySelector(".stage").style.getPropertyValue("--stage-vignette"),
      state: window.__PORTANCE_TEST__.snapshot()
    }));
    assert.ok(disposed.gpu.every(record => record.lost && !record.connected && record.width === 0 && record.height === 0));
    assert.equal(disposed.background, "");
    assert.equal(disposed.vignette, "");
    assert.deepEqual(disposed.state, state, "dispose ne change pas la simulation");
    await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("native"));
    await ready(page);
    assert.equal((await background(page)).water.activeStyle, "daylight");
    assert.equal(await page.locator("#kjp-native-world").count(), 1);
    assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), state);
  }
  noErrors(observed);
  await page.close();
});

test("eau — horloge, pause, ×2, réinitialisation et mouvement réduit", { timeout: 120_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const appearances = [];
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const observed = await open(browser, { water: "daylight" }, { reducedMotion });
    const { page } = observed;
    await ready(page);
    for (const view of ["top", "skipper"]) {
      await page.evaluate(view => window.__PORTANCE_TEST__.selectCameraView(view), view);
      await settle(page);
      const before = await background(page);
      if (view === "top") assert.equal(before.water.horizonY, 0);
      else assert.ok(before.water.horizonY > 0);
      await page.evaluate(() => {
        window.__waterStyleWrites = 0;
        window.__waterObserver?.disconnect();
        window.__waterObserver = new MutationObserver(records => { window.__waterStyleWrites += records.length; });
        window.__waterObserver.observe(document.querySelector(".stage"), { attributes: true, attributeFilter: ["style"] });
        window.__waterTime += 60_000;
        window.__PORTANCE_TEST__.selectTimeScale(2);
      });
      await settle(page, 8);
      assert.equal((await background(page)).css, before.css);
      assert.equal(await page.evaluate(() => window.__waterStyleWrites), 0, "aucune réécriture du fond au repos");
      await page.evaluate(() => window.__PORTANCE_TEST__.advanceWall(.2));
      await settle(page);
      assert.equal((await background(page)).css, before.css);
      appearances.push({ view, css: before.css });
    }
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await settle(page);
    assert.equal((await background(page)).water.activeStyle, "daylight");
    noErrors(observed);
    await page.close();
  }
  assert.deepEqual(appearances.slice(0, 2), appearances.slice(2), "mouvement réduit : même eau statique");
});

test("eau — fond simple dans tous les secours Canvas, sans état physique parasite", { timeout: 120_000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const cases = [
    { parameters: { renderer: "canvas" } },
    { parameters: { failNativeStartup: "1" }, error: /construction injecté/ },
    { parameters: { failNativePlayerModel: "1" }, error: /chargement injecté/ },
    { setup: () => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /^webgl2?$/.test(type) ? null : original.call(this, type, ...args);
      };
    }, error: /WebGL2 indisponible/ },
    { trigger: async page => page.evaluate(() => {
      window.__PORTANCE_TEST__.failNextNativeInfrastructureBuild();
      window.__PORTANCE_TEST__.restoreBuiltInPort();
    }), error: /construction injecté/ },
    { trigger: async page => page.evaluate(() => {
      document.querySelector("#kjp-native-world").dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    }), error: /contexte WebGL perdu/, preservesState: true }
  ];
  for (const configuration of cases) {
    const observed = await open(browser, { water: "daylight", ...configuration.parameters }, {}, configuration.setup);
    const { page } = observed;
    let state;
    if (configuration.trigger) {
      await ready(page);
      state = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
      await configuration.trigger(page);
    }
    await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().active === "canvas");
    await settle(page);
    const result = await page.evaluate(() => ({
      world: window.__PORTANCE_TEST__.worldRendererReport(),
      state: window.__PORTANCE_TEST__.snapshot(),
      background: document.querySelector(".stage").style.background,
      vignette: document.querySelector(".stage").style.getPropertyValue("--stage-vignette"),
      image: document.querySelector("#scene").toDataURL()
    }));
    if (configuration.error) assert.match(result.world.nativeInfrastructureError, configuration.error);
    if (configuration.preservesState) assert.deepEqual(result.state, state);
    assert.equal(result.world.canvas.nativeConnected, false);
    assert.equal(result.background, "");
    assert.equal(result.vignette, "");
    assert.equal((await background(page)).water.activeStyle, "simple");
    await page.evaluate(() => window.__PORTANCE_TEST__.selectWaterStyle("simple"));
    await settle(page);
    assert.equal(await page.evaluate(() => document.querySelector("#scene").toDataURL()), result.image,
      "l'option ne change pas un pixel du secours Canvas");
    noErrors(observed);
    await page.close();
  }
});
