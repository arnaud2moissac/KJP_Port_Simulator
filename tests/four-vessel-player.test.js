"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { stubSimulatorAnalytics, isSimulatorAnalyticsRequest } = require("./helpers/simulator-network.js");
const Profiles = require("../src/simulateur-port/vessel-profiles.js");
const measurements = require("../docs/four-vessel-glb-geometry.json");

const root = path.resolve(__dirname, "..");
const models = measurements.vessels.map(model => model.id === "pogo-40-s4-twin-rudder-experimental"
  ? { ...model, file: "KJP_Class40_lazybag.glb" }
  : model.id === "contessa-26-long-keel-experimental" ? { ...model, file: "KJP_Contessa26_rouge_lazybag.glb" }
  : model.id === "oceanis-48-fixed-keel-experimental" ? { ...model, file: "KJP_Oceanis48_lazybag.glb" }
  : model.id === "sun-odyssey-24-2-fixed-keel-experimental" ? { ...model, file: "KJP_SunOdyssey242.glb" } : model);
const assets = new Map([
  [Profiles.COMMERCIAL_PROFILE_IDS[0], "kjp_sun_odyssey_36i.glb"],
  [Profiles.COMMERCIAL_PROFILE_IDS[1], "kjp_dufour_310_gl_2014_dimfix_rudders.glb"],
  ...models.map(model => [model.id, model.file])
]);
function url(parameters = {}) {
  const value = pathToFileURL(path.join(root, "simulateur-port.html"));
  for (const [key, setting] of Object.entries(parameters)) value.searchParams.set(key, setting);
  return value.href;
}
async function pageFor(browser, id) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: "fr-FR" });
  await stubSimulatorAnalytics(page);
  const errors = [], warnings = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
    else if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && !isSimulatorAnalyticsRequest(request.url())) external.push(request.url());
  });
  await page.addInitScript(profileId => {
    if (!localStorage.getItem("kjp.vesselProfile.v1")) localStorage.setItem("kjp.vesselProfile.v1", profileId);
    const raf = requestAnimationFrame.bind(window);
    let pending = [], time = 1000;
    window.requestAnimationFrame = callback => { pending.push(callback); return pending.length; };
    window.__vesselFrame = () => new Promise(resolve => raf(() => {
      const callbacks = pending; pending = []; time += 1000 / 60;
      callbacks.forEach(callback => callback(time)); resolve();
    }));
  }, id);
  return { page, errors, warnings, external };
}
async function frames(page, count = 4) {
  for (let i = 0; i < count; i++) await page.evaluate(() => window.__vesselFrame());
}
async function ready(page, id) {
  await page.waitForFunction(({ id, asset }) => {
    const api = window.__PORTANCE_TEST__, report = api?.worldRendererReport();
    return api?.snapshot().vesselProfileId === id && report.player?.model?.ready && report.player.model.asset.name === asset;
  }, { id, asset: assets.get(id) });
  await frames(page);
}
const core = page => page.evaluate(() => window.__PORTANCE_TEST__.placementReport().core);
async function drive(page) {
  return page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.loadScenario("free");
    api.reset({ x: 25, y: 48, heading: 0 }, { windSpeedKn: 12, windFromDeg: 90, currentSpeedKn: 0 });
    api.setControls({ gearTarget: 1, throttleTarget: .3, rudderTarget: .2 });
    api.advance(3);
    return api.placementReport().core;
  });
}

test("six bateaux — modèles propres, cache, commandes, picking et radiographie sans déplacement physique", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { page, errors, external } = await pageFor(browser, Profiles.DEFAULT_PROFILE_ID);
  await page.goto(url({ test: 1 }));
  const geometries = new Map();
  for (const [id, asset] of assets) {
    await page.evaluate(id => window.__PORTANCE_TEST__.selectVesselProfile(id), id);
    await ready(page, id);
    await page.locator('[data-mode="navigation"]').click();
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("free"); api.reset({ x: 30, y: -32, heading: 0 }); api.selectCameraView("top");
    });
    await frames(page);
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
    assert.equal(report.player.model.asset.name, asset);
    assert.equal(report.player.model.loadCount, 1);
    assert.equal(report.glError, 0);
    assert.equal(report.canvas.nativePointerEvents, "none");
    geometries.set(id, report.player.model.geometry.uuid);
    const source = await page.evaluate(() => window.__PORTANCE_TEST__.nativePlayerSourceReport());
    assert.equal(source.some(owner => owner.id === "profile-silhouette"), false);
    assert.equal(source.filter(owner => owner.family === "player-fender").length, 6);
    await page.locator("#scene").focus();
    await page.keyboard.press("ArrowRight"); await frames(page);
    assert.notEqual((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.rudderTarget, 0);
    const cleat = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().boatCleats.find(c => c.screen));
    assert.ok(cleat, id + ": taquet projeté");
    const stage = await page.locator("#scene").boundingBox();
    await page.mouse.click(stage.x + cleat.screen.x, stage.y + cleat.screen.y); await frames(page);
    assert.ok((await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport())).selected, id + ": picking Canvas");
    const native = await drive(page);
    await page.locator('[data-mode="understand"]').click();
    for (const view of ["translation", "rotation"]) {
      await page.evaluate(view => window.__PORTANCE_TEST__.setUnderstandView(view), view); await frames(page);
      const xray = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
      assert.equal(xray.player.model.appearance.radiograph, true);
      assert.equal(xray.player.model.waterlineClipping.organsClipped, false);
      assert.equal(xray.glError, 0);
      const rudders = Profiles.COMPILED_PROFILES[id].rudders.length;
      assert.equal(xray.player.model.sourceGroups.parts.filter(part => part.name.startsWith("rudder")).length, rudders);
      assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.rudderAxisReport())).axes.length, rudders);
      assert.deepEqual(await core(page), native, id + ": vue " + view);
    }
    await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("canvas")); await frames(page);
    assert.deepEqual(await core(page), native, id + ": changement vers Canvas");
    assert.deepEqual(await drive(page), native, id + ": trajectoire Canvas/native");
    await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("native")); await ready(page, id);
    assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).player.model.geometry.uuid, geometries.get(id));
  }
  for (const id of assets.keys()) {
    await page.evaluate(id => window.__PORTANCE_TEST__.selectVesselProfile(id), id); await ready(page, id);
    const model = (await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).player.model;
    assert.equal(model.geometry.uuid, geometries.get(id), id + ": géométrie réutilisée après changement de bateau");
    assert.equal(model.loadCount, 1);
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});

test("six bateaux — erreurs GLB, absence WebGL et perte de contexte gardent les mêmes états au secours", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const id of assets.keys()) {
    const reference = await pageFor(browser, id);
    await reference.page.goto(url({ test: 1 })); await ready(reference.page, id);
    const expected = await drive(reference.page);
    const beforeLoss = await core(reference.page);
    await reference.page.locator("#kjp-native-world").evaluate(canvas => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    await frames(reference.page);
    await reference.page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().active === "canvas");
    await frames(reference.page);
    const lost = await reference.page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
    assert.match(lost.nativeInfrastructureError, /contexte WebGL perdu/);
    assert.deepEqual(await core(reference.page), beforeLoss, id + ": perte de contexte injectée");
    assert.deepEqual(await drive(reference.page), expected);
    assert.deepEqual(reference.errors, []); assert.deepEqual(reference.external, []);
    assert.ok(reference.warnings.some(message => /secours Canvas 2D/.test(message)));
    await reference.page.close();
    for (const failure of ["glb", "webgl"]) {
      const observed = await pageFor(browser, id), page = observed.page;
      if (failure === "webgl") await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          return /^webgl2?$/.test(kind) ? null : original.call(this, kind, ...args);
        };
      });
      await page.goto(url({ test: 1, ...(failure === "glb" ? { failNativePlayerModel: 1 } : {}) }));
      await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
      await frames(page);
      await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().active === "canvas");
      await frames(page);
      const report = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
      assert.match(report.nativeInfrastructureError, failure === "glb" ? /chargement injecté/ : /WebGL2 indisponible/);
      assert.equal(report.canvas.fallbackActive, true); assert.equal(report.canvas.nativeConnected, false);
      assert.deepEqual(await drive(page), expected, id + ": trajectoire au secours " + failure);
      for (const view of ["translation", "rotation"]) {
        await page.locator('[data-mode="understand"]').click();
        await page.evaluate(view => window.__PORTANCE_TEST__.setUnderstandView(view), view); await frames(page);
        assert.deepEqual(await core(page), expected);
      }
      assert.deepEqual(observed.errors, []); assert.deepEqual(observed.external, []);
      assert.ok(observed.warnings.some(message => /secours Canvas 2D/.test(message)));
      await page.close();
    }
  }
});

test("quatre GLB — activation produit ordinaire et sélection persistante sans API de recette", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const model of models) {
    const { page, errors, external } = await pageFor(browser, model.id);
    await page.goto(url()); await page.waitForSelector('body[data-world-renderer="native"]'); await frames(page);
    assert.equal(await page.evaluate(() => typeof window.__PORTANCE_TEST__), "undefined");
    assert.equal(await page.locator("#boatProfileSelect").inputValue(), model.id);
    assert.ok((await page.locator(".stage").screenshot()).length > 20_000);
    await page.goto(url({ test: 1 })); await ready(page, model.id);
    assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).player.model.asset.name, model.file);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await page.close();
  }
});
