const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const KJPCodec = require("../src/ports/kjp-codec.js");

const simulatorPath = path.resolve(__dirname, "..", "simulateur-port.html");
const simulatorUrl = new URL(pathToFileURL(simulatorPath));
simulatorUrl.searchParams.set("test", "1");
const largePortText = fs.readFileSync(path.resolve(__dirname, "..", "examples", "la-trinite-sur-mer.kjp"), "utf8");
const emptyPort = KJPCodec.createEmpty({ id: "understand-empty", name: "Contrôle Comprendre" });
emptyPort.navigation.entries.push({ id: "entry", position: { east: 0, north: 0 }, heading: 0 });
const emptyPortText = KJPCodec.serialize(emptyPort);

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

test("vent GPU — déplacement signé, longueur bornée, occlusion et un seul draw", async t => {
  const { build } = require("esbuild");
  const bundle = await build({
    stdin: { resolveDir: path.resolve(__dirname, ".."), contents: `
      import { Scene, OrthographicCamera, WebGLRenderer, Mesh, PlaneGeometry, MeshBasicMaterial } from 'three';
      import { createNativeFlowResources } from './src/simulateur-port/rendering/native-flow-resources.mjs';
      globalThis.windProbe = { Scene, OrthographicCamera, WebGLRenderer, Mesh, PlaneGeometry, MeshBasicMaterial, createNativeFlowResources };
    ` }, bundle: true, write: false, format: "iife"
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const results = await page.evaluate(() => {
    const P = windProbe;
    const resources = P.createNativeFlowResources({ fields: [{ id: "wind", kind: "filaments",
      capacity: 256, width: 2.1, color: "rgba(98,219,227,.58)" }] });
    const scene = new P.Scene();
    scene.add(resources.group);
    const renderer = new P.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setSize(400, 400); renderer.setClearColor(0, 0);
    const camera = new P.OrthographicCamera(-10, 10, 10, -10, .035, 100);
    const seed = resources.group.children[0].geometry.attributes.seed.array;
    const x = seed[0] * 500, y = seed[1] * 500;
    camera.position.set(x, y, 10); camera.lookAt(x, y, 0);
    const pixels = new Uint8Array(400 * 400 * 4);
    const capture = (vector, time) => {
      resources.update({ fields: [{ id: "wind", color: "rgba(98,219,227,.58)", vector, time,
        domain: { minX: 0, minY: 0, width: 500, height: 500 }, count: 1 }] },
      { width: 400, height: 400, near: .035 });
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      gl.readPixels(0, 0, 400, 400, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let mass = 0, cx = 0, cy = 0, minX = 400, maxX = -1, minY = 400, maxY = -1;
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];
        if (!alpha) continue;
        const px = (i / 4) % 400, py = Math.floor(i / 4 / 400);
        mass += alpha; cx += alpha * px; cy += alpha * py;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
      return { mass, x: cx / mass, y: cy / mass, width: maxX - minX + 1,
        height: maxY - minY + 1, calls: renderer.info.render.calls, glError: gl.getError() };
    };
    const directions = [[4,0],[-4,0],[0,4],[0,-4]].map(vector => ({
      vector, before: capture(vector, 0), after: capture(vector, .1)
    }));
    const calm = capture([0,0], 0);
    const zoomed = capture([40,0], 0);
    const cover = new P.Mesh(new P.PlaneGeometry(40, 40), new P.MeshBasicMaterial({ color: 0x224466 }));
    cover.position.set(x, y, 1); scene.add(cover);
    capture([0,0], 0); const opaque = [...pixels];
    capture([4,0], 0); const occluded = pixels.every((value, index) => value === opaque[index]);
    resources.dispose(); cover.geometry.dispose(); cover.material.dispose(); renderer.dispose();
    return { directions, calm, zoomed, occluded };
  });
  for (const { vector, before, after } of results.directions) {
    assert.ok(before.mass > 0 && after.mass > 0);
    assert.ok(Math.abs(after.x - before.x - vector[0] * 2) < .7, JSON.stringify({ vector, before, after }));
    assert.ok(Math.abs(after.y - before.y - vector[1] * 2) < .7, JSON.stringify({ vector, before, after }));
    assert.equal(after.calls, 1);
    assert.equal(after.glError, 0);
  }
  assert.equal(results.calm.mass, 0);
  assert.equal(results.calm.calls, 0);
  assert.ok(results.zoomed.width <= 36, "traînée plafonnée à 35 pixels plus rasterisation");
  assert.equal(results.occluded, true, "un objet opaque masque entièrement les filaments derrière lui");
  assert.deepEqual(errors, []);
});

test("renderer natif — persistance, caméra, composition 2D et flux", async t => {
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
        if (this.canvas.id === "kjp-native-world") {
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
  await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
  await settle(page, 4);
  const initial = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(initial.active, "native");
  assert.equal(initial.defaultRenderer, "native");
  assert.equal(initial.startupRenderer, "native");
  assert.equal(initial.requestedRenderer, null);
  assert.equal(initial.canvas.nativeConnected, true);

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: -Math.PI / 2, u: 0 });
    api.selectCameraView("top");
    api.selectVisualTheme("dark");
  });
  await settle(page, 3);
  const initialSnapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  const initialMooring = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().rendered);
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
  assert.equal(first.report.canvas.nativePointerEvents, "none");
  assert.notEqual(first.report.canvas.overlayPointerEvents, "none");
  assert.equal(first.report.routing.lastFrame.backend, "native");
  assert.equal(first.report.routing.lastFrame.projectedWorld, false);
  assert.equal(first.report.routing.lastFrame.renderFrame, false);
  assert.equal(first.report.routing.lastFrame.projectedPolygons, 0);
  assert.ok(first.report.routing.lastFrame.overlayLayers.every(layer => layer >= 9));
  assert.deepEqual(first.snapshot, initialSnapshot, "le rendu ne modifie pas la simulation");
  assert.deepEqual(first.mooring, initialMooring, "les hitTargets restent reconstruits par la couche 2D");
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
  const beforeUnderstand = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(await page.locator('[data-mode="understand"]').count(), 1,
    "le produit ne doit exposer qu'un mode Comprendre");
  const navigationMaterial = beforeUnderstand.materials.find(
    material => material.role === "boat.playerHull"
  )?.id;
  await page.locator('[data-mode="understand"]').click();
  await settle(page, 4);
  const understand = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(understand.catalog.wireframeMaterials, 0);
  assert.equal(understand.player.wireframe, false);
  assert.equal(understand.player.radiograph, true);
  assert.equal(understand.player.model.appearance.radiograph, true);
  assert.equal(understand.player.model.appearance.wireframe, false);
  assert.equal(understand.player.model.appearance.vertexColors, false);
  assert.equal(understand.player.model.waterlineClipping.organsClipped, false);
  assert.equal(understand.player.model.sourceGroups.totalTriangles, 1948);
  assert.equal(understand.player.understanding.enabled, true);
  assert.equal(understand.player.understanding.capacity, 64);
  assert.equal(understand.player.understanding.propeller.visible, true);
  assert.equal(understand.player.understanding.depth.forcesTest, false);
  assert.equal(understand.player.understanding.depth.forcesWrite, false);
  assert.deepEqual(persistentGeometry(understand), persistentGeometry(beforeUnderstand),
    "le mode Comprendre change les matériaux sans reconstruire les géométries");
  const understandUploads = await page.evaluate(() => ({ ...window.__n4Uploads }));
  await settle(page, 5);
  assert.deepEqual(await page.evaluate(() => ({ ...window.__n4Uploads })), understandUploads,
    "une vue Comprendre inchangée ne retransfère ni géométrie ni matrices de forces");
  await page.locator('[data-mode="navigation"]').click();
  await settle(page, 3);
  const restored = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(restored.player.radiograph, false);
  assert.equal(restored.player.model.appearance.radiograph, false);
  assert.equal(restored.player.model.appearance.vertexColors, true);
  assert.equal(restored.player.model.waterlineClipping.organsClipped, true);
  assert.equal(restored.player.understanding.forceCount, 0);
  assert.equal(restored.player.understanding.propeller.visible, false);
  assert.equal(restored.materials.find(material => material.role === "boat.playerHull")?.id,
    navigationMaterial, "la sortie restaure la matière Navigation d'origine");
  assert.deepEqual(persistentGeometry(restored), persistentGeometry(beforeUnderstand));
  await page.locator('[data-mode="understand"]').click();
  await settle(page, 3);

  await page.evaluate(() => {
    window.__PORTANCE_TEST__.reset({ x: 25, y: -38, heading: 0 }, {
      windSpeedKn: 12, windFromDeg: 300, currentSpeedKn: 1.4, currentFromDeg: 215
    });
    window.__PORTANCE_TEST__.advance(.2);
  });
  await settle(page, 4);
  const flowing = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.ok(flowing.flow.wind.segments > 0);
  assert.equal(flowing.flow.wind.kind, "filaments");
  assert.equal(flowing.flow.wind.drawCalls, 1);
  assert.ok(flowing.flow.wind.particles <= 256);
  assert.ok(flowing.flow.current.segments > 0);
  assert.ok(flowing.player.understanding.forceCount > 0);
  assert.deepEqual(persistentGeometry(flowing), persistentGeometry(afterMotion));
  const windGeometry = report => report.resources.find(resource => resource.role === "flow:wind");
  const windSnapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  await settle(page, 8);
  const pausedWind = await page.evaluate(() => ({
    world: window.__PORTANCE_TEST__.worldRendererReport(),
    snapshot: window.__PORTANCE_TEST__.snapshot()
  }));
  assert.deepEqual(pausedWind.snapshot, windSnapshot, "le shader ne change aucun état physique");
  assert.deepEqual(pausedWind.world.flow.wind, flowing.flow.wind, "le vent reste figé en pause");
  assert.deepEqual(windGeometry(pausedWind.world), windGeometry(flowing));
  await page.evaluate(() => window.__PORTANCE_TEST__.advance(.3));
  await settle(page, 3);
  const advectedWind = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.ok(advectedWind.flow.wind.time > flowing.flow.wind.time);
  assert.deepEqual(windGeometry(advectedWind), windGeometry(flowing),
    "l'advection GPU ne transfère pas les buffers du vent");
  assert.deepEqual(advectedWind.flow.wind.vector, flowing.flow.wind.vector,
    "toutes les particules utilisent le vecteur de vent uniforme existant");
  const windTargets = await page.evaluate(() => window.__PORTANCE_TEST__.understandingHitReport().targets);
  assert.ok(windTargets.some(target => target.label === "Fardage proue"));
  assert.ok(windTargets.some(target => target.label === "Fardage poupe"));
  const flowSceneRect = await page.locator("#scene").boundingBox();
  for (const label of ["Fardage proue", "Fardage poupe"]) {
    const hit = windTargets.find(target => target.label === label);
    await page.mouse.move(flowSceneRect.x + (hit.a.x + hit.b.x) / 2,
      flowSceneRect.y + (hit.a.y + hit.b.y) / 2);
    await settle(page, 2);
    assert.ok((await page.locator("#forceTooltip").textContent()).startsWith(`${label} · `),
      `${label} absent au survol`);
  }

  await page.evaluate(text => {
    const api = window.__PORTANCE_TEST__;
    api.importPort(text);
    api.reset({ x: 0, y: 0, heading: 0 }, { windSpeedKn: 0, currentSpeedKn: 0 });
    api.setControls({ throttleTarget: -.8, rudderTarget: 35 * Math.PI / 180 });
    api.advance(5);
    api.selectCameraView("top");
  }, emptyPortText);
  await settle(page, 4);
  const reverse = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    return {
      motion: api.snapshot().motion,
      pivots: api.understandingPivotTargets(),
      targets: api.understandingHitReport().targets,
      forces: api.understandingForceReport().parts
    };
  });
  for (const label of ["Moteur · poussée de l'hélice", "Pas d'hélice", "Safran", "Quille", "Coque · traînée"]) {
    assert.ok(reverse.targets.some(target => target.label === label), `${label} absent des survols`);
  }
  assert.ok(reverse.pivots.water.visible);
  assert.ok(Math.abs(reverse.pivots.water.position[0] + reverse.motion.v / reverse.motion.r) < 1e-6);
  assert.ok(Math.abs(reverse.pivots.water.position[1] - reverse.motion.u / reverse.motion.r) < 1e-6,
    "le pivot affiché doit annuler les deux composantes de la vitesse locale");
  assert.ok(Math.abs(reverse.pivots.water.position[1]) > 1,
    "en marche arrière, le centre instantané n'est pas artificiellement ramené sur l'axe du bateau");
  const sceneRect = await page.locator("#scene").boundingBox();
  for (const label of ["Moteur · poussée de l'hélice", "Pas d'hélice", "Safran", "Quille", "Coque · traînée"]) {
    const hit = reverse.targets.find(target => target.label === label);
    await page.mouse.move(sceneRect.x + (hit.a.x + hit.b.x) / 2,
      sceneRect.y + (hit.a.y + hit.b.y) / 2);
    await settle(page, 2);
    assert.equal(await page.locator("#forceTooltip").isVisible(), true, `${label} non accessible au survol`);
    assert.ok((await page.locator("#forceTooltip").textContent()).startsWith(`${label} · `),
      `${label} masqué au survol par une autre force`);
  }
  await page.locator('[data-mode="navigation"]').click();
  assert.equal(await page.locator("#forceTooltip").isVisible(), false);
  await page.locator('[data-mode="understand"]').click();
  await settle(page, 2);

  const beforeResizeGeometry = persistentGeometry(await page.evaluate(() => (
    window.__PORTANCE_TEST__.worldRendererReport()
  )));
  await page.setViewportSize({ width: 840, height: 620 });
  await settle(page, 5);
  const resized = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    rect: document.querySelector("#scene").getBoundingClientRect().toJSON()
  }));
  assert.equal(resized.report.camera.width, resized.rect.width);
  assert.equal(resized.report.camera.height, resized.rect.height);
  assert.deepEqual(persistentGeometry(resized.report), beforeResizeGeometry);

  const largePortFlow = await page.evaluate(async text => {
    const api = window.__PORTANCE_TEST__;
    api.importPort(text);
    const pose = api.snapshot().motion;
    api.selectVisualTheme("dark");
    const capture = async (view, environment) => {
      api.reset(pose, environment);
      api.selectCameraView(view);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return api.worldRendererReport({ images: true }).image;
    };
    const pixels = async source => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const difference = async (baseline, source) => {
      const candidate = await pixels(source);
      let count = 0;
      for (let offset = 0; offset < baseline.length; offset += 4) {
        if (Math.abs(candidate[offset] - baseline[offset])
          + Math.abs(candidate[offset + 1] - baseline[offset + 1])
          + Math.abs(candidate[offset + 2] - baseline[offset + 2])
          + Math.abs(candidate[offset + 3] - baseline[offset + 3]) > 24) count++;
      }
      return count;
    };
    const results = {};
    for (const view of ["top", "skipper"]) {
      const none = await capture(view, {});
      const wind = await capture(view, { windSpeedKn: 12, windFromDeg: 300 });
      const current = await capture(view, { currentSpeedKn: 1.4, currentFromDeg: 215 });
      const baseline = await pixels(none);
      results[view] = {
        windPixels: await difference(baseline, wind),
        currentPixels: await difference(baseline, current)
      };
    }
    return results;
  }, largePortText);
  for (const [view, flow] of Object.entries(largePortFlow)) {
    assert.ok(flow.windPixels > 20, `grand port ${view} : vent invisible (${flow.windPixels} pixels)`);
    assert.ok(flow.currentPixels > 20, `grand port ${view} : courant invisible (${flow.currentPixels} pixels)`);
  }

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.selectCameraView("top");
    api.selectVisualTheme("chart");
  });
  await settle(page, 4);
  const largeGrid = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    return {
      port: api.topologyReport().bounds,
      grid: api.visualThemeReport().grid,
      layer: api.worldRendererReport().layers["chart-grid"]
    };
  });
  assert.ok(largeGrid.layer, "la grille native reste visible sur un grand port");
  for (const axis of ["X", "Y"]) {
    assert.ok(largeGrid.grid.bounds[`min${axis}`] <= largeGrid.port[`min${axis}`]);
    assert.ok(largeGrid.grid.bounds[`max${axis}`] >= largeGrid.port[`max${axis}`]);
    assert.ok((largeGrid.grid.bounds[`max${axis}`] - largeGrid.grid.bounds[`min${axis}`])
      / largeGrid.grid.adaptiveStepMeters <= 186,
    "la densité de la grille reste bornée sur un grand port");
  }

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.failNextNativeInfrastructureBuild();
    api.restoreBuiltInPort();
  });
  await settle(page, 4);
  const recovered = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(recovered.active, "canvas");
  assert.equal(recovered.canvas.nativeConnected, false);
  assert.equal(recovered.canvas.fallbackActive, true);
  assert.match(recovered.nativeInfrastructureError, /injecté/);
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.selectWorldRenderer("native");
    api.reset({ x: 25, y: -38, heading: 0 });
  });
  await settle(page, 4);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport())).active, "native");

  const beforeFallback = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("canvas"));
  await settle(page, 4);
  const rolledBack = await page.evaluate(() => ({
    report: window.__PORTANCE_TEST__.worldRendererReport(),
    snapshot: window.__PORTANCE_TEST__.snapshot()
  }));
  assert.equal(rolledBack.report.active, "canvas");
  assert.equal(rolledBack.report.canvas.nativeConnected, false);
  assert.equal(rolledBack.report.canvas.fallbackActive, true);
  assert.deepEqual(rolledBack.snapshot, beforeFallback);
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);

  t.diagnostic(`Grand port : ${JSON.stringify(largePortFlow)} pixels de flux visibles`);
  t.diagnostic(`Renderer natif : ${first.report.catalog.owners.length} propriétaires persistants, ${nativeOpaque} pixels natifs non transparents`);
  t.diagnostic(`Routage final : ${JSON.stringify(rolledBack.report.routing)}`);
});
