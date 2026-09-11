const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");

const simulatorPath = path.resolve(__dirname, "..", "simulateur-port.html");
const simulatorUrl = new URL(pathToFileURL(simulatorPath));
simulatorUrl.searchParams.set("test", "1");
simulatorUrl.searchParams.set("renderer", "legacy");

const settle = (page, frames = 3) => page.evaluate(count => new Promise(resolve => {
  const next = remaining => requestAnimationFrame(() => (
    remaining > 1 ? next(remaining - 1) : resolve()
  ));
  next(count);
}), frames);

const digest = value => createHash("sha256").update(value).digest("hex");
const persistentGeometry = report => report.resources
  .filter(resource => !["flow", "chart-grid", "player-propeller"].includes(resource.family))
  .map(resource => ({ role: resource.role, geometry: resource.geometry,
    attributes: resource.attributes.map(attribute => ({
      name: attribute.name,
      buffer: attribute.buffer,
      array: attribute.array,
      version: attribute.version,
      bytes: attribute.bytes
    })) }));

test("Three natif N4 — boucle visible, composition 2D et routage sans RenderFrame", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1 });
  const errors = [];
  const remoteRequests = [];
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", request => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  await page.addInitScript(() => {
    const originalRequestAnimationFrame = requestAnimationFrame.bind(window);
    let mainPending = 0;
    window.__n4Raf = { mainRequests: 0, mainPending: 0, maximumMainPending: 0 };
    window.requestAnimationFrame = callback => {
      const main = callback.name === "render";
      if (main) {
        mainPending++;
        window.__n4Raf.mainRequests++;
        window.__n4Raf.mainPending = mainPending;
        window.__n4Raf.maximumMainPending = Math.max(window.__n4Raf.maximumMainPending, mainPending);
      }
      return originalRequestAnimationFrame(time => {
        if (main) {
          mainPending--;
          window.__n4Raf.mainPending = mainPending;
        }
        callback(time);
      });
    };
    const uploads = { calls: 0, bytes: 0 };
    for (const name of ["bufferData", "bufferSubData"]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id === "kjp-native-static-prototype") {
          const data = args[name === "bufferData" ? 1 : 2];
          uploads.calls++;
          uploads.bytes += typeof data === "number" ? data : data?.byteLength || 0;
        }
        return result;
      };
    }
    window.__n4Uploads = uploads;
  });

  await page.goto(simulatorUrl.href);
  await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  await settle(page, 4);
  const initial = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(initial.active, "legacy");
  assert.equal(initial.defaultRenderer, "native");
  assert.equal(initial.startupRenderer, "legacy");
  assert.equal(initial.requestedRenderer, "legacy");
  assert.equal(initial.legacyDefault, false);
  assert.equal(initial.canvas.nativeConnected, false);

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: -Math.PI / 2, u: 0 });
    api.selectCameraView("top");
    api.selectVisualTheme("dark");
  });
  await settle(page, 3);
  const legacySnapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  const legacyMooring = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().rendered);

  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("native"));
  await settle(page, 6);
  const first = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport({ images: true }),
    snapshot: window.__PORTANCE_TEST__.snapshot(),
    mooring: window.__PORTANCE_TEST__.mooringReport().rendered,
    uploads: { ...window.__n4Uploads },
    raf: { ...window.__n4Raf }
  }));
  assert.equal(first.report.active, "native");
  assert.equal(first.report.attached, true);
  assert.equal(first.report.canvas.nativeConnected, true);
  assert.equal(first.report.canvas.nativeDisplay, "block");
  assert.equal(first.report.canvas.legacyDisplay, "none");
  assert.equal(first.report.canvas.nativePointerEvents, "none");
  assert.notEqual(first.report.canvas.overlayPointerEvents, "none");
  assert.equal(first.report.routing.lastFrame.backend, "native");
  assert.equal(first.report.routing.lastFrame.projectedWorld, false);
  assert.equal(first.report.routing.lastFrame.renderFrame, false);
  assert.equal(first.report.routing.lastFrame.projectedPolygons, 0);
  assert.ok(first.report.routing.lastFrame.overlayLayers.every(layer => layer >= 9));
  assert.deepEqual(first.snapshot, legacySnapshot, "la sélection du renderer ne modifie pas la simulation");
  assert.deepEqual(first.mooring, legacyMooring, "les hitTargets restent reconstruits par la couche 2D");
  assert.equal(first.raf.maximumMainPending, 1, "une seule boucle principale reste planifiée");
  assert.equal(first.raf.mainPending, 1);
  assert.ok(first.report.catalog.owners.some(owner => owner.family === "shore-cleat"));
  assert.ok(first.report.catalog.owners.some(owner => owner.family === "dock"));
  assert.ok(first.report.player.localCoordinates);
  assert.ok(first.report.flow.wind && first.report.flow.current);
  assert.equal(first.report.glError, 0);
  const nativeOpaque = await page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset]) opaque++;
    }
    return opaque;
  }, first.report.image);
  assert.ok(nativeOpaque > 500, "le canvas natif visible contient le monde");

  const stableRouting = first.report.routing;
  const stableGeometry = persistentGeometry(first.report);
  await settle(page, 8);
  const stable = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    uploads: { ...window.__n4Uploads }
  }));
  assert.equal(stable.report.routing.projectedWorldBuilds, stableRouting.projectedWorldBuilds);
  assert.equal(stable.report.routing.renderFrames, stableRouting.renderFrames);
  assert.deepEqual(persistentGeometry(stable.report), stableGeometry);
  assert.deepEqual(stable.uploads, first.uploads,
    "caméra immobile et flux nuls : aucun attribut géométrique retransféré après initialisation");

  const stageBox = await page.locator("#scene").boundingBox();
  const boatHit = stable.report.presentation.hitTargets.cleats.find(hit => (
    hit.endpoint.type === "boat" && hit.enabled
  ));
  assert.ok(boatHit, "un taquet du bateau reste cliquable au-dessus du monde natif");
  const linesBeforePicking = (await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport())).lines.length;
  await page.mouse.click(stageBox.x + boatHit.x, stageBox.y + boatHit.y);
  await settle(page, 3);
  const selected = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(selected.presentation.hitTargets.cleats.some(hit => (
    hit.endpoint.type === "shore" && hit.enabled
  )), true);
  const shoreHit = selected.presentation.hitTargets.cleats.find(hit => (
    hit.endpoint.type === "shore" && hit.enabled
  ));
  await page.mouse.click(stageBox.x + shoreHit.x, stageBox.y + shoreHit.y);
  await settle(page, 3);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport())).lines.length,
    linesBeforePicking + 1, "le picking Canvas 2D frappe encore une aussière");

  await page.mouse.move(stageBox.x + stageBox.width * .65, stageBox.y + stageBox.height * .45);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(stageBox.x + stageBox.width * .65 + 35, stageBox.y + stageBox.height * .45 + 18);
  await page.mouse.up({ button: "right" });
  await settle(page, 5);
  const gestured = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    uploads: { ...window.__n4Uploads }
  }));
  assert.deepEqual(persistentGeometry(gestured.report), stableGeometry);
  assert.deepEqual(gestured.uploads, stable.uploads,
    "un mouvement de caméra ne retransfère pas les attributs statiques");
  assert.notDeepEqual(gestured.report.camera, stable.report.camera);

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: -Math.PI / 2, u: 1 });
    api.selectCameraView("skipper");
  });
  await settle(page, 5);
  const beforeMotion = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport({ images: true }));
  await page.evaluate(() => window.__PORTANCE_TEST__.advance(1));
  await settle(page, 8);
  const afterMotion = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport({ images: true }));
  assert.notDeepEqual(afterMotion.player.pose, beforeMotion.player.pose);
  assert.notDeepEqual(afterMotion.camera, beforeMotion.camera,
    "la caméra existante suit le bateau dans le renderer natif");
  assert.notEqual(digest(afterMotion.image), digest(beforeMotion.image),
    "le port visible évolue avec le mouvement de caméra");
  assert.deepEqual(persistentGeometry(afterMotion), persistentGeometry(beforeMotion),
    "le mouvement utilise matrices et caméra sans reconstruire le monde");

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: -Math.PI / 2 });
    api.selectCameraView("top");
    api.selectVisualTheme("chart");
  });
  await settle(page, 5);
  const chart = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.ok(chart.layers["chart-grid"]);
  const gridBuilds = chart.routing.nativeGridBuilds;
  await settle(page, 5);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport().routing.nativeGridBuilds)), gridBuilds,
    "la grille persiste tant que maille et étendue ne changent pas");
  await page.evaluate(() => window.__PORTANCE_TEST__.selectCameraView("skipper"));
  await settle(page, 4);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).layers["chart-grid"], undefined);
  await page.evaluate(() => window.__PORTANCE_TEST__.selectCameraView("anatomy"));
  await settle(page, 4);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).player.visibility["player-anatomy"], true);

  await page.evaluate(() => window.__PORTANCE_TEST__.reset({ x: 25, y: -38, heading: 0 }, {
    windSpeedKn: 12, windFromDeg: 300, currentSpeedKn: 1.4, currentFromDeg: 215
  }));
  await settle(page, 4);
  const flowing = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.ok(flowing.flow.wind.segments > 0);
  assert.ok(flowing.flow.current.segments > 0);
  assert.deepEqual(persistentGeometry(flowing), persistentGeometry(afterMotion));

  const beforeResizeGeometry = persistentGeometry(flowing);
  await page.setViewportSize({ width: 840, height: 620 });
  await settle(page, 5);
  const resized = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    rect: document.querySelector("#scene").getBoundingClientRect().toJSON()
  }));
  assert.equal(resized.report.camera.width, resized.rect.width);
  assert.equal(resized.report.camera.height, resized.rect.height);
  assert.deepEqual(persistentGeometry(resized.report), beforeResizeGeometry);

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.failNextNativeInfrastructureBuild();
    api.restoreBuiltInPort();
  });
  await settle(page, 4);
  const recovered = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(recovered.active, "legacy");
  assert.equal(recovered.canvas.nativeConnected, false);
  assert.equal(recovered.canvas.legacyDisplay, "block");
  assert.match(recovered.nativeInfrastructureError, /injecté/);
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.selectWorldRenderer("native");
    api.reset({ x: 25, y: -38, heading: 0 });
  });
  await settle(page, 4);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).active, "native");

  const beforeRollback = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("legacy"));
  await settle(page, 4);
  const rolledBack = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    snapshot: window.__PORTANCE_TEST__.snapshot()
  }));
  assert.equal(rolledBack.report.active, "legacy");
  assert.equal(rolledBack.report.canvas.nativeConnected, false);
  assert.equal(rolledBack.report.canvas.legacyDisplay, "block");
  assert.deepEqual(rolledBack.snapshot, beforeRollback);
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);

  t.diagnostic(`N4 : ${first.report.catalog.owners.length} propriétaires persistants, ${nativeOpaque} pixels natifs non transparents`);
  t.diagnostic(`Routage final : ${JSON.stringify(rolledBack.report.routing)}`);
});
