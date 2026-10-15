"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { stubSimulatorAnalytics, isSimulatorAnalyticsRequest } = require("./helpers/simulator-network.js");

const root = path.resolve(__dirname, "..");
const dufourId = "dufour-310-gl-2014-deep-keel-experimental";
const sunId = "sun-odyssey-36i-pedagogical";
const assetName = "kjp_dufour_310_gl_2014_dimfix_rudders.glb";
const close = (actual, expected, tolerance = 1e-5) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`
);

test("Dufour dimfix — dimensions et structure mesurées sur les triangles chargés", async t => {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { Box3, Vector3 } = await import("three");
  const bytes = fs.readFileSync(path.join(root, assetName));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
    "12b51b6eedc5f3a7503a4b07918e8a33ac46b37077b6e2fc302d232d1dcf229c");
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""
  );
  const meshes = [];
  gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
  assert.equal(meshes.length, 1);
  const mesh = meshes[0], geometry = mesh.geometry;
  const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
  assert.equal(position.count, 4354);
  assert.equal(geometry.index.count / 3, 1970);
  assert.equal(geometry.getAttribute("color").normalized, true);
  assert.equal(mesh.material.metalness, 0);
  close(mesh.material.roughness, .87);
  assert.equal(gltf.animations.length, 0);
  const points = (start, triangles) => Array.from({ length: triangles * 3 }, (_, offset) => (
    new Vector3().fromBufferAttribute(position, geometry.index.getX(start * 3 + offset))
  ));
  const box = (start, triangles) => new Box3().setFromPoints(points(start, triangles));
  const hull = box(0, 54).union(box(108, 110)).union(box(218, 138)).union(box(356, 6));
  const full = box(0, 1970), underwater = box(218, 138), keel = box(1850, 88);
  const waterline = points(218, 138).filter(point => Math.abs(point.y) < 1e-7);
  const waterlineBox = new Box3().setFromPoints(waterline);
  const mast = box(1382, 28);
  close(hull.max.z - hull.min.z, 9.35);
  close(hull.max.x - hull.min.x, 3.31);
  close(full.max.z - full.min.z, 9.67);
  close(waterlineBox.max.z - waterlineBox.min.z, 8.70);
  close(-keel.min.y, 1.90);
  close(mast.max.y, 14.56);
  close((hull.min.z + hull.max.z) / 2, -.125);
  close(underwater.max.y, 0);

  // Réflexion des positions des jantes et des deux safrans, indépendamment
  // des noms ou des dimensions déclarées dans extras.
  const mirroredBounds = (first, second) => {
    close(first.min.x, -second.max.x); close(first.max.x, -second.min.x);
    for (const axis of ["y", "z"]) {
      close(first.min[axis], second.min[axis]); close(first.max[axis], second.max[axis]);
    }
  };
  mirroredBounds(box(958, 128), box(1142, 128));
  mirroredBounds(box(1938, 16), box(1954, 16));
  for (const start of [1938, 1954]) {
    const rudderBox = box(start, 16);
    close(rudderBox.max.y - rudderBox.min.y, .82);
    close(rudderBox.max.y, -.10);
    let projectedDoubleArea = 0;
    for (let triangle = start; triangle < start + 16; triangle++) {
      const [a, b, c] = points(triangle, 1);
      projectedDoubleArea += Math.abs(
        (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y)
      ) / 2;
    }
    // Les deux faces d'une lame fermée couvrent deux fois sa projection.
    close(projectedDoubleArea / 2, .31);
  }

  const originalBytes = fs.readFileSync(path.join(root, "kjp_dufour_310_gl_2014_dimfix.glb"));
  assert.equal(crypto.createHash("sha256").update(originalBytes).digest("hex"),
    "e4db9395319edaa673f03ca94a7e552ccd65e9bacf24bba10704db540061e4d7");
  const original = await new GLTFLoader().parseAsync(
    originalBytes.buffer.slice(originalBytes.byteOffset, originalBytes.byteOffset + originalBytes.byteLength), ""
  );
  const originalMesh = original.scene.getObjectByProperty("isMesh", true);
  assert.deepEqual(geometry.index.array, originalMesh.geometry.index.array);
  assert.deepEqual(geometry.getAttribute("color").array, originalMesh.geometry.getAttribute("color").array);
  assert.deepEqual(mesh.userData, originalMesh.userData);
  const rudderVertices = new Set(Array.from({ length: 32 * 3 }, (_, offset) => geometry.index.getX(1938 * 3 + offset)));
  assert.equal(rudderVertices.size, 60);
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (rudderVertices.has(vertex)) continue;
    for (const attribute of ["position", "normal"]) {
      const actual = geometry.getAttribute(attribute), expected = originalMesh.geometry.getAttribute(attribute);
      assert.deepEqual([actual.getX(vertex), actual.getY(vertex), actual.getZ(vertex)],
        [expected.getX(vertex), expected.getY(vertex), expected.getZ(vertex)], `${attribute} hors safran ${vertex}`);
    }
  }
  const va = new Vector3(), vb = new Vector3(), vc = new Vector3(), cross = new Vector3();
  for (let offset = 0; offset < geometry.index.count; offset += 3) {
    const indices = [0, 1, 2].map(index => geometry.index.getX(offset + index));
    va.fromBufferAttribute(position, indices[0]);
    vb.fromBufferAttribute(position, indices[1]);
    vc.fromBufferAttribute(position, indices[2]);
    cross.crossVectors(vb.sub(va), vc.sub(va));
    assert.ok(cross.length() > 1e-9, `triangle dégénéré ${offset / 3}`);
    for (const index of indices) {
      const authored = new Vector3().fromBufferAttribute(normal, index);
      close(authored.length(), 1, 1e-4);
      assert.ok(cross.dot(authored) > 0, `normale opposée ${offset / 3}`);
    }
  }
  // Écart structurel réel documenté : le bord de pont et le haut de coque
  // emploient des stations longitudinales différentes. Ce n'est pas corrigé.
  const upperHull = box(0, 54), deckEdge = box(472, 54);
  close(deckEdge.max.z - upperHull.max.z, .12);
  t.diagnostic(`Coque ${hull.max.z - hull.min.z} × ${hull.max.x - hull.min.x} m ; LWL ${waterlineBox.max.z - waterlineBox.min.z} m ; TE ${-keel.min.y} m ; mât ${mast.max.y} m ; chaque safran : 0,82 m / 0,31 m². Autres pièces inchangées.`);
});

test("Dufour dimfix — activation native, cache, Comprendre, interactions et repli iso-physique", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "fr-FR" });
  await stubSimulatorAnalytics(page);
  const errors = [], remote = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && !isSimulatorAnalyticsRequest(request.url())) remote.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("kjp.vesselProfile.v1", "dufour-310-gl-2014-deep-keel-experimental");
    const raf = requestAnimationFrame.bind(window);
    let pending = [], time = 1000;
    window.requestAnimationFrame = callback => { pending.push(callback); return pending.length; };
    window.__dufourStep = () => new Promise(resolve => raf(() => {
      const callbacks = pending; pending = []; time += 1000 / 60;
      callbacks.forEach(callback => callback(time)); resolve();
    }));
  });
  const url = pathToFileURL(path.join(root, "simulateur-port.html"));
  url.search = "?test=1";
  await page.goto(url.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready);
  const step = async (count = 4) => { for (let i = 0; i < count; i++) await page.evaluate(() => window.__dufourStep()); };
  await step();
  const first = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  const model = first.player.model;
  assert.equal(model.asset.name, assetName);
  assert.equal(model.loadCount, 1);
  assert.equal(model.geometry.triangles, 1970);
  assert.equal(model.sourceGroups.assetFingerprint, 0xe81ac2df);
  assert.deepEqual(model.transform.scale, [1, 1, 1]);
  assert.deepEqual(model.transform.position, [.2075, 0, .02]);
  assert.deepEqual(model.transform.rotation, [Math.PI / 2, Math.PI / 2, 0]);
  assert.equal(model.appearance.color, "#ffffff");
  close(model.bounds.hull.size[0], 9.35);
  close(model.bounds.full.size[0], 9.67);
  assert.equal(first.canvas.nativePointerEvents, "none");
  const source = await page.evaluate(() => window.__PORTANCE_TEST__.nativePlayerSourceReport());
  assert.equal(source.some(owner => owner.id === "profile-silhouette"), false);
  assert.equal(source.filter(owner => owner.family === "player-fender").length, 6);

  // Vraie commande clavier et sélection d'un taquet Canvas avec le GLB présent.
  await page.locator("#scene").focus();
  await page.keyboard.press("ArrowRight"); await step();
  assert.notEqual((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.rudderTarget, 0);
  const cleat = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().boatCleats.find(c => c.screen));
  assert.ok(cleat);
  const stage = await page.locator("#scene").boundingBox();
  await page.mouse.click(stage.x + cleat.screen.x, stage.y + cleat.screen.y); await step();
  assert.ok((await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport())).selected);

  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 30, y: -32, heading: 0 }, { windSpeedKn: 5 });
    api.setControls({ throttleTarget: .5, rudderTarget: .2 }); api.advance(8);
  });
  await page.locator('[data-mode="understand"]').click(); await step();
  for (const view of ["translation", "rotation"]) {
    await page.locator(`[data-understand-view="${view}"]`).click(); await step();
    const radiograph = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
    assert.equal(radiograph.player.model.appearance.radiograph, true);
    assert.equal(radiograph.player.model.waterlineClipping.organsClipped, false);
    assert.equal(radiograph.player.model.sourceGroups.parts.filter(part => part.name.startsWith("rudder_")).length, 2);
    assert.equal(radiograph.glError, 0);
  }
  const snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport().core);
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("canvas")); await step();
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.placementReport().core), snapshot);
  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("native"));
  await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready); await step();
  const recreated = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(recreated.player.model.geometry.uuid, model.geometry.uuid);
  assert.equal(recreated.player.model.loadCount, 1);

  for (const id of [sunId, dufourId]) {
    await page.evaluate(id => window.__PORTANCE_TEST__.selectVesselProfile(id), id);
    await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready); await step();
  }
  const returned = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(returned.player.model.geometry.uuid, model.geometry.uuid);
  assert.equal(returned.player.model.loadCount, 1);
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);

  // Le GLB est actif au chargement ordinaire, sans paramètre de recette.
  url.search = ""; await page.goto(url.href);
  await page.waitForSelector("#scene"); await step();
  assert.equal(await page.evaluate(() => window.__PORTANCE_TEST__), undefined);
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#kjp-native-world");
    return canvas?.isConnected && canvas.width > 0;
  });
  assert.equal(await page.locator("#boatProfileSelect").inputValue(), dufourId);

  url.search = "?test=1"; await page.goto(url.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready); await step();
  const ordinary = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
  assert.equal(ordinary.player.model.asset.name, assetName);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.nativePlayerSourceReport())).some(owner => owner.id === "profile-silhouette"), false);
});

test("Dufour dimfix — échec de chargement relayé au secours Canvas", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: "fr-FR" });
  await stubSimulatorAnalytics(page);
  await page.addInitScript(() => localStorage.setItem(
    "kjp.vesselProfile.v1", "dufour-310-gl-2014-deep-keel-experimental"
  ));
  const url = pathToFileURL(path.join(root, "simulateur-port.html"));
  url.search = "?test=1&failNativePlayerModel=1";
  await page.goto(url.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().active === "canvas");
  const failed = await page.evaluate(() => ({
    renderer: window.__PORTANCE_TEST__.worldRendererReport(),
    state: window.__PORTANCE_TEST__.snapshot()
  }));
  assert.match(failed.renderer.nativeInfrastructureError, /échec de chargement injecté/);
  assert.equal(failed.state.vesselProfileId, dufourId);
  assert.equal(failed.state.controls.paused, true);
  assert.equal(failed.renderer.canvas.fallbackActive, true);
  assert.equal(failed.renderer.canvas.nativeConnected, false);
  assert.equal(failed.state.moorings.current.length, 2);
});
