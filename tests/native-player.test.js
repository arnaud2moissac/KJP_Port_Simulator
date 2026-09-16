"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const KJPCodec = require("../src/ports/kjp-codec.js");

const root = path.resolve(__dirname, "..");
const simulatorUrl = pathToFileURL(path.join(root, "simulateur-port.html"));
simulatorUrl.searchParams.set("test", "1");
const emptyPort = KJPCodec.createEmpty({ id: "native-player-empty", name: "Contrôle joueur natif" });
emptyPort.navigation.entries.push({ id: "entry", position: { east: 0, north: 0 }, heading: 0 });
const emptyPortText = KJPCodec.serialize(emptyPort);
const near = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;

async function pageFor(browser, dpr = 1) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (/^https?:/.test(request.url())) errors.push(request.url()); });
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    let pending = [], time = 1000;
    window.requestAnimationFrame = callback => { pending.push(callback); return pending.length; };
    const uploads = { calls: 0, bytes: 0 };
    for (const name of ["bufferData", "bufferSubData"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id === "kjp-native-world") {
          const data = args[name === "bufferData" ? 1 : 2];
          uploads.calls++;
          uploads.bytes += typeof data === "number" ? data : data?.byteLength || 0;
        }
        return result;
      };
    }
    window.__playerStep = () => new Promise((resolve, reject) => raf(() => {
      try {
        const callbacks = pending; pending = []; time += 1000 / 60;
        callbacks.forEach(callback => callback(time));
        resolve({
          report: window.__PORTANCE_TEST__.worldRendererReport({ images: true }),
          snapshot: window.__PORTANCE_TEST__.snapshot(),
          uploads: { ...uploads },
          queued: pending.length
        });
      } catch (error) { reject(error); }
    }));
  });
  await page.goto(simulatorUrl.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready);
  return { page, errors };
}

const step = page => page.evaluate(() => window.__playerStep());
const playerResources = report => report.resources.filter(resource => resource.owner?.startsWith("player"));
const staticResources = report => playerResources(report).filter(resource => resource.owner !== "player-propeller:blades");

test("joueur natif — GLB calé, chargé une fois et indépendant de la physique", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { page, errors } = await pageFor(browser);
  const first = await step(page);
  const model = first.report.player.model;
  assert.equal(first.report.active, "native");
  assert.equal(model.ready, true);
  assert.equal(model.error, null);
  assert.equal(model.loadCount, 1);
  assert.equal(model.asset.name, "kjp_sun_odyssey_36i.glb");
  assert.equal(model.asset.bytes, 136444);
  assert.equal(model.asset.noPhysicsData, true);
  assert.ok(model.asset.excludedFunctionalEquipment.includes("mooring_lines"));
  assert.ok(model.asset.excludedFunctionalEquipment.includes("fenders"));
  assert.deepEqual(model.transform.scale, [1, 1, 1]);
  assert.deepEqual(model.transform.position, [0, 0, .02]);
  assert.deepEqual(model.transform.rotation, [Math.PI / 2, Math.PI / 2, 0]);
  assert.equal(model.geometry.vertices, 4306);
  assert.equal(model.geometry.triangles, 1948);
  assert.equal(model.geometry.normals, true);
  assert.equal(model.geometry.vertexColors, true);
  assert.ok(near(model.calibration.hullLength, 10.69));
  assert.ok(near(model.calibration.hullBeam, 3.59));
  assert.ok(near(model.calibration.simulatorLength, 10.94));
  assert.ok(near(model.calibration.simulatorBeam, 3.59));
  assert.ok(near(model.calibration.longitudinalClearance, .25));
  assert.ok(near(model.calibration.transverseClearance, 0));
  assert.ok(near(model.bounds.hull.size[0], 10.69));
  assert.ok(near(model.bounds.hull.size[1], 3.59));
  assert.deepEqual(model.waterlineClipping, {
    enabled: true,
    organsClipped: true,
    worldZ: .02,
    sourceY: 0,
    hiddenSide: "below"
  });
  assert.equal(model.sourceGroups.totalTriangles, 1948);
  assert.equal(
    Object.values(model.sourceGroups.trianglesByRole).reduce((sum, count) => sum + count, 0),
    1948
  );
  assert.ok(model.sourceGroups.trianglesByRole.organ > 0);
  assert.ok(model.sourceGroups.trianglesByRole.silhouette > 0);
  assert.equal(model.sourceGroups.assetFingerprint, 0x1fb19642);
  assert.deepEqual(model.sourceGroups.trianglesByRole,
    { hull: 164, silhouette: 234, organ: 104, roof: 66, hidden: 1380 });
  const glbPart = name => model.sourceGroups.parts.find(part => part.name === name);
  assert.equal(glbPart("hull_underwater").role, "hidden");
  assert.equal(glbPart("keel_fin").start / 3, 1844);
  assert.equal(glbPart("keel_bulb").start / 3, 1856);
  assert.equal(glbPart("rudder").start / 3, 1932);
  assert.ok(glbPart("keel_fin").bounds.max[1] < 0, "la vraie quille GLB est immergée");
  assert.ok(glbPart("rudder").bounds.max[1] < 0, "le vrai safran GLB est immergé");
  assert.ok(glbPart("mast_and_rigging").bounds.max[1] > 10);
  assert.equal(glbPart("mast_and_rigging").role, "hidden");
  assert.equal(glbPart("wheel_and_cockpit_furniture").role, "hidden");
  assert.equal(glbPart("deck_fittings").role, "hidden");
  assert.equal(first.report.localClippingEnabled, true);
  const sourceOwners = await page.evaluate(() => (
    window.__PORTANCE_TEST__.nativePlayerSourceReport({ geometry: true }).owners
  ));
  assert.equal(sourceOwners.some(owner => owner.family === "player"), false,
    "l'enveloppe de collision corrigée ne doit plus être affichée");

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 20, y: 30, heading: .35, u: 1 });
    api.selectCameraView("skipper");
    api.setControls({ throttleTarget: .5, throttleActual: .5 });
    document.querySelector("#pauseButton").click();
  });
  const warmed = await step(page);
  const fixed = staticResources(warmed.report);
  for (let index = 0; index < 20; index++) {
    const frame = await step(page);
    assert.equal(frame.queued, 1);
    assert.deepEqual(staticResources(frame.report), fixed);
    assert.equal(frame.report.player.pose.x, frame.report.presentation.pose.x);
    assert.equal(frame.report.player.pose.y, frame.report.presentation.pose.y);
  }

  await page.evaluate(() => document.querySelector("#pauseButton").click());
  const beforeCamera = await step(page);
  const box = await page.locator("#scene").boundingBox();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .4);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width * .7 + 45, box.y + box.height * .4 + 18);
  await page.mouse.up({ button: "right" });
  const afterCamera = await step(page);
  assert.deepEqual(staticResources(afterCamera.report), staticResources(beforeCamera.report));
  assert.deepEqual(afterCamera.uploads, beforeCamera.uploads,
    "la caméra ne retransfère pas la coque ou ses accessoires");

  const modelGeometry = model.geometry.uuid;
  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), emptyPortText);
  const imported = await step(page);
  assert.equal(imported.report.player.model.geometry.uuid, modelGeometry);
  assert.equal(imported.report.player.model.loadCount, 1);
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("canvas"));
  await step(page);
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("native"));
  await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
  const recreated = await step(page);
  assert.equal(recreated.report.player.model.geometry.uuid, modelGeometry,
    "la géométrie GLB partagée survit au cycle de renderer");
  assert.equal(recreated.report.player.model.loadCount, 1);
  assert.deepEqual(errors, []);
  t.diagnostic(`Calage GLB : ${JSON.stringify({ bounds: model.bounds, calibration: model.calibration })}`);
});

test("joueur natif — lisible dans les vues, thèmes et DPR qualifiés", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  let cases = 0;
  for (const dpr of [1, 2]) {
    const { page, errors } = await pageFor(browser, dpr);
    for (const theme of ["dark", "chart"]) {
      for (const view of ["top", "skipper"]) {
        await page.evaluate(({ theme, view }) => {
          const api = window.__PORTANCE_TEST__;
          api.restoreBuiltInPort();
          api.reset({ x: 25, y: -38, heading: -Math.PI / 2 });
          api.selectVisualTheme(theme);
          api.selectCameraView(view);
        }, { theme, view });
        const frame = await step(page);
        const pixels = await page.evaluate(async source => {
          const image = new Image(); image.src = source; await image.decode();
          const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let visible = 0;
          for (let offset = 3; offset < data.length; offset += 4) if (data[offset] > 32) visible++;
          return visible;
        }, frame.report.image);
        assert.ok(pixels > 500, `${theme}/${view}/DPR${dpr}: scène vide`);
        assert.equal(frame.report.player.model.ready, true);
        assert.equal(frame.report.glError, 0);
        cases++;
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  t.diagnostic(`${cases} cadrages du joueur qualifiés`);
});
