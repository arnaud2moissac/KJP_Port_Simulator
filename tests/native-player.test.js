"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const KJPCodec = require("../src/ports/kjp-codec.js");

const root = path.resolve(__dirname, "..");
const simulatorUrl = pathToFileURL(path.join(root, "simulateur-port.html"));
simulatorUrl.searchParams.set("test", "1");
const emptyPort = KJPCodec.createEmpty({ id: "native-player-empty", name: "Banc joueur natif" });
emptyPort.navigation.entries.push({ id: "entry", position: { east: 0, north: 0 }, heading: 0 });
const emptyPortText = KJPCodec.serialize(emptyPort);
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

async function pageFor(browser, dpr = 1) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const errors = [], warnings = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") {
      if (/^The AudioContext was not allowed to start\./.test(message.text())
        || /^\[\.WebGL-.*GPU stall due to ReadPixels/.test(message.text())
        || /^Canvas2D: Multiple readback operations/.test(message.text())) warnings.push(message.text());
      else errors.push(message.text());
    }
  });
  page.on("request", request => { if (/^https?:/.test(request.url())) errors.push(request.url()); });
  await page.addInitScript(() => {
    const originalRAF = requestAnimationFrame.bind(window);
    let pending = [], time = 1000;
    window.requestAnimationFrame = callback => { pending.push(callback); return pending.length; };
    const live = new Set();
    const uploads = { calls: 0, bytes: 0, created: 0, deleted: 0, data: 0, subData: 0 };
    const bound = new Map();
    const prototype = WebGL2RenderingContext.prototype;
    const originalBind = prototype.bindBuffer;
    prototype.bindBuffer = function (target, buffer) {
      const result = originalBind.call(this, target, buffer);
      if (this.canvas.id === "kjp-native-static-prototype") bound.set(target, buffer);
      return result;
    };
    for (const name of ["bufferData", "bufferSubData", "createBuffer", "deleteBuffer"]) {
      const original = prototype[name];
      prototype[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id === "kjp-native-static-prototype") {
          if (name === "createBuffer") { live.add(result); uploads.created++; }
          else if (name === "deleteBuffer") { if (live.delete(args[0])) uploads.deleted++; }
          else {
            const data = args[name === "bufferData" ? 1 : 2];
            const offset = args[3] || 0, length = args[4];
            uploads.calls++;
            uploads.bytes += typeof data === "number" ? data
              : length ? length * data.BYTES_PER_ELEMENT
                : data.byteLength - offset * (data.BYTES_PER_ELEMENT || 1);
            uploads[name === "bufferData" ? "data" : "subData"]++;
          }
        }
        return result;
      };
    }
    window.__n3Step = () => new Promise((resolve, reject) => originalRAF(() => {
      try {
        const callbacks = pending; pending = []; time += 1000 / 60;
        callbacks.forEach(callback => callback(time));
        const api = window.__PORTANCE_TEST__;
        resolve({
          snapshot: api.snapshot(),
          report: api.nativeStaticPrototypeReport({ images: true }),
          uploads: { ...uploads, live: live.size },
          queued: pending.length,
          world: document.querySelector("#worldScene").toDataURL(),
          overlay: document.querySelector("#scene").toDataURL()
        });
      } catch (error) { reject(error); }
    }));
  });
  await page.goto(simulatorUrl.href);
  return { page, errors, warnings };
}

const step = page => page.evaluate(() => window.__n3Step());
const playerResources = report => report.resources.filter(resource => resource.owner?.startsWith("player"));
const staticPlayerResources = report => playerResources(report).filter(resource => resource.owner !== "player-propeller:blades");
const identityOnly = resources => resources.map(resource => ({ ...resource,
  attributes: resource.attributes.map(({ version, hash: ignored, ...attribute }) => attribute)
}));

test("Three natif N3 — pose interpolée, persistance, états variables et repli", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  let reference;
  for (const enabled of [false, true]) {
    const { page, errors, warnings } = await pageFor(browser);
    await step(page);
    await page.evaluate(enabled => {
      const api = window.__PORTANCE_TEST__;
      api.restoreBuiltInPort(); api.loadScenario("dockForward");
      api.reset({ x: 20, y: 30, heading: .35, u: 1 });
      api.selectCameraView("top");
      api.setControls({ throttleTarget: .5, throttleActual: .5 });
      if (enabled) api.enableNativePlayerPrototype();
      document.querySelector("#pauseButton").click();
    }, enabled);
    const first = await step(page);
    if (enabled) {
      assert.equal(first.report.player.localCoordinates, true);
      assert.equal(first.report.player.catalog.owners.filter(owner => owner.family === "player").length, 1);
      assert.equal(first.report.player.catalog.owners.filter(owner => owner.family === "player-fender").length, 6);
      assert.ok(first.uploads.bytes > 0);
    }
    const frames = [];
    for (let index = 0; index < 20; index++) {
      const frame = await step(page);
      frames.push({ snapshot: frame.snapshot, presentation: frame.report.presentation,
        world: hash(frame.world), overlay: hash(frame.overlay) });
      assert.equal(frame.queued, 1, "une seule boucle RAF");
      if (enabled) {
        assert.deepEqual(frame.uploads, first.uploads, "aucun transfert de géométrie pendant le mouvement hors anatomie");
        assert.deepEqual(playerResources(frame.report), playerResources(first.report));
        assert.deepEqual(frame.report.player.pose, {
          x: frame.report.presentation.pose.x,
          y: frame.report.presentation.pose.y,
          heading: frame.report.presentation.pose.heading
        });
        assert.equal(frame.report.player.matrix[12], frame.report.player.pose.x);
        assert.equal(frame.report.player.matrix[13], frame.report.player.pose.y);
        assert.ok(Math.abs(frame.report.player.matrix[0] - Math.cos(frame.report.player.pose.heading)) < 1e-12);
        assert.ok(Math.abs(frame.report.player.matrix[1] - Math.sin(frame.report.player.pose.heading)) < 1e-12);
      }
    }
    if (!enabled) reference = frames;
    else {
      assert.deepEqual(frames, reference, "simulation, interpolation, caméra, rendu actif et picking inchangés");
      assert.notEqual(frames[0].snapshot.motion.x, frames.at(-1).snapshot.motion.x);
      await page.evaluate(() => document.querySelector("#pauseButton").click());

      for (const view of ["top", "anatomy", "skipper"]) {
        await page.evaluate(view => window.__PORTANCE_TEST__.selectCameraView(view), view);
        const before = await step(page);
        const box = await page.locator("#scene").boundingBox();
        await page.mouse.move(box.x + box.width * .72, box.y + box.height * .38);
        await page.mouse.down({ button: "right" });
        await page.mouse.move(box.x + box.width * .72 + 45, box.y + box.height * .38 + 18);
        await page.mouse.up({ button: "right" });
        const after = await step(page);
        assert.deepEqual(after.uploads, before.uploads, `${view}: la caméra ne retransfère pas la coque`);
        assert.deepEqual(playerResources(after.report), playerResources(before.report));
        const panField = view === "skipper" ? "skipperPan" : "pan";
        assert.notDeepEqual(after.report.presentation.cameraSettings[panField], before.report.presentation.cameraSettings[panField]);
      }

      const beforeTheme = await step(page);
      await page.evaluate(() => window.__PORTANCE_TEST__.selectVisualTheme("chart"));
      const chart = await step(page);
      assert.deepEqual(chart.uploads, beforeTheme.uploads);
      assert.deepEqual(chart.report.resources, beforeTheme.report.resources);
      assert.notDeepEqual(chart.report.materials, beforeTheme.report.materials);
      await page.evaluate(() => window.__PORTANCE_TEST__.selectVisualTheme("dark"));
      await step(page);

      const beforeDynamic = await step(page);
      await page.evaluate(() => {
        const api = window.__PORTANCE_TEST__;
        api.reset({ x: 20, y: 30, heading: .35, u: 1 });
        api.selectCameraView("anatomy");
        api.setControls({ throttleTarget: .5, throttleActual: .5 });
        document.querySelector("#pauseButton").click();
      });
      const dynamicFrames = [];
      for (let index = 0; index < 3; index++) dynamicFrames.push(await step(page));
      for (let index = 1; index < dynamicFrames.length; index++) {
        const previous = dynamicFrames[index - 1], next = dynamicFrames[index];
        assert.deepEqual(staticPlayerResources(next.report), staticPlayerResources(previous.report), "coque et appendices statiques inchangés");
        assert.deepEqual(identityOnly(playerResources(next.report)), identityOnly(playerResources(previous.report)), "les buffers conservent leur identité");
        assert.equal(next.uploads.created, previous.uploads.created);
        assert.equal(next.uploads.deleted, previous.uploads.deleted);
        assert.equal(next.uploads.calls - previous.uploads.calls, 1, "un seul buffer dynamique transféré");
        assert.equal(next.uploads.bytes - previous.uploads.bytes, next.report.player.propeller.bufferBytes);
        assert.equal(next.report.player.propeller.updates, previous.report.player.propeller.updates + 1);
      }
      assert.ok(dynamicFrames[0].uploads.calls > beforeDynamic.uploads.calls);
      await page.evaluate(() => document.querySelector("#pauseButton").click());

      await page.evaluate(() => {
        const api = window.__PORTANCE_TEST__;
        api.selectCameraView("top");
        api.reset({ x: 20, y: 30, heading: Math.PI - .0012, r: .1 });
        document.querySelector("#pauseButton").click();
      });
      let previousHeading = null;
      for (let index = 0; index < 8; index++) {
        const frame = await step(page);
        assert.equal(frame.report.player.pose.heading, frame.report.presentation.pose.heading);
        if (previousHeading !== null) {
          const delta = Math.atan2(Math.sin(frame.report.player.pose.heading - previousHeading), Math.cos(frame.report.player.pose.heading - previousHeading));
          assert.ok(Math.abs(delta) < .05, "interpolation continue au franchissement de ±π");
        }
        previousHeading = frame.report.player.pose.heading;
      }
      await page.evaluate(() => document.querySelector("#pauseButton").click());

      let beforeContact;
      for (const side of ["starboard", "port"]) {
        await page.evaluate(side => {
          const api = window.__PORTANCE_TEST__;
          api.restoreBuiltInPort();
          api.reset({ x: 25, y: -43.92, heading: side === "starboard" ? 0 : Math.PI,
            v: side === "starboard" ? -.05 : .05 });
          api.advance(1 / 120); api.selectCameraView("top");
        }, side);
        beforeContact = await step(page);
        const contact = beforeContact.report.player.contactFenders;
        assert.ok(contact.length > 0, `${side}: le contact physique sélectionne le pare-battage natif correspondant`);
        const contactColor = await page.evaluate(() => window.__PORTANCE_TEST__.visualThemeReport().semantic.contact.slice(1));
        for (const index of contact) {
          const materials = beforeContact.report.materials.filter(material => material.role?.startsWith(`player.fender.${index}.`));
          assert.ok(materials.length > 0 && materials.every(material => material.color === contactColor));
        }
      }
      const uploadBeforeScale = beforeContact.uploads;
      await page.evaluate(() => window.__PORTANCE_TEST__.selectTimeScale(2));
      const accelerated = await step(page);
      assert.deepEqual(accelerated.uploads, uploadBeforeScale, "contacts et couleurs restent des mises à jour de matériaux");
      const activeHull = await page.evaluate(() => window.__PORTANCE_TEST__.visualThemeReport().boat.activePlayerHull.slice(1));
      assert.equal(accelerated.report.materials.find(material => material.role === "boat.playerHull").color, activeHull);

      const beforePort = playerResources(accelerated.report);
      await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), emptyPortText);
      const afterPort = await step(page);
      assert.deepEqual(playerResources(afterPort.report), beforePort, "un changement de port ne reconstruit pas le joueur");
      await page.evaluate(() => { window.__PORTANCE_TEST__.disposeNativeStaticPrototype(); window.__PORTANCE_TEST__.disposeNativeStaticPrototype(); });
      const disposed = await step(page);
      assert.equal(disposed.report.active, false); assert.equal(disposed.uploads.live, 0);
      t.diagnostic(`Ressources N3 : ${JSON.stringify({
        owners: first.report.player.catalog.owners.length,
        geometries: first.report.player.catalog.geometryCount,
        materials: first.report.player.catalog.materialCount,
        objects: playerResources(first.report).length,
        propellerBufferBytes: dynamicFrames.at(-1).report.player.propeller.bufferBytes
      })}`);
    }
    assert.deepEqual(errors, []);
    t.diagnostic(`${enabled ? "joueur natif" : "référence"}: ${warnings.length} avertissements autoplay/readPixels connus`);
    await page.close();
  }
});

test("Three natif N3 — fidélité visuelle du joueur, trois vues et deux thèmes", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-n3-player-"));
  let cases = 0;
  for (const dpr of [1, 2]) {
    const { page, errors } = await pageFor(browser, dpr);
    await step(page);
    await page.evaluate(text => {
      const api = window.__PORTANCE_TEST__;
      api.importPort(text); api.reset({ x: 0, y: 0, heading: .62 });
      api.enableNativePlayerPrototype({ staticBoats: false, seamarks: false });
      api.isolateNativeInfrastructure({ family: "omission-forcée" });
      api.enableSurfaceComparison({ boats: true });
    }, emptyPortText);
    for (const theme of ["dark", "chart"]) for (const view of ["top", "anatomy", "skipper"]) {
      await page.evaluate(({ theme, view }) => {
        const api = window.__PORTANCE_TEST__; api.selectVisualTheme(theme); api.selectCameraView(view);
      }, { theme, view });
      await step(page); await step(page);
      const result = await page.evaluate(async () => {
        const api = window.__PORTANCE_TEST__;
        const before = JSON.stringify(api.snapshot());
        const native = api.nativeStaticPrototypeReport({ images: true });
        const legacy = api.surfaceComparisonReport({ images: true });
        async function pixels(url) {
          const image = new Image(); image.src = url; await image.decode();
          const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 160;
          const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, 256, 160);
          return Array.from(context.getImageData(0, 0, 256, 160).data);
        }
        const actual = await pixels(native.image), expected = await pixels(legacy.images.legacy);
        let actualCount = 0, expectedCount = 0, matched = 0, actualWeight = 0, expectedWeight = 0;
        const actualColor = [0,0,0], expectedColor = [0,0,0];
        for (let index = 0; index < 256 * 160; index++) {
          const a = actual[index*4+3], b = expected[index*4+3];
          if (a > 8) actualCount++;
          if (b > 8) {
            expectedCount++;
            const x = index % 256, y = Math.floor(index / 256);
            let found = false;
            for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
              const px=x+dx,py=y+dy;
              if (px>=0&&px<256&&py>=0&&py<160&&actual[(py*256+px)*4+3]>8) found=true;
            }
            if (found) matched++;
          }
          actualWeight += a; expectedWeight += b;
          for (let channel=0; channel<3; channel++) {
            actualColor[channel] += actual[index*4+channel] * a;
            expectedColor[channel] += expected[index*4+channel] * b;
          }
        }
        return {
          native: native.image, legacy: legacy.images.legacy,
          actual: actualCount, expected: expectedCount, recall: matched / expectedCount,
          colorError: Math.max(...actualColor.map((value,index) => Math.abs(value/actualWeight-expectedColor[index]/expectedWeight))),
          glError: native.glError, unchanged: before === JSON.stringify(api.snapshot()),
          anatomyVisible: ["player-anatomy","player-propeller"].every(family => native.player.visibility[family])
        };
      });
      assert.equal(result.glError, 0); assert.equal(result.unchanged, true);
      assert.ok(result.expected > 12 && result.actual > 12, `${theme}/${view}: joueur absent`);
      assert.ok(result.recall >= .82, `${theme}/${view}: silhouette incomplète (${result.recall})`);
      assert.ok(result.actual <= result.expected * 1.7 + 40, `${theme}/${view}: silhouette débordante`);
      assert.ok(result.colorError < 42, `${theme}/${view}: couleur/contraste incohérent (${result.colorError})`);
      assert.equal(result.anatomyVisible, view === "anatomy");
      if (dpr === 1) for (const name of ["native", "legacy"]) {
        fs.writeFileSync(path.join(directory, `${theme}-${view}-${name}.png`), Buffer.from(result[name].split(",")[1], "base64"));
      }
      cases++;
    }
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__; api.selectCameraView("top"); api.isolateNativePlayer({ family: "omission-forcée" });
    });
    await step(page);
    const omitted = await page.evaluate(async () => {
      const image = new Image(); image.src = window.__PORTANCE_TEST__.nativeStaticPrototypeReport({ images: true }).image; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width=64; canvas.height=40;
      const context=canvas.getContext("2d");context.drawImage(image,0,0,64,40);
      const data=context.getImageData(0,0,64,40).data;
      let count=0;for(let index=3;index<data.length;index+=4)if(data[index]>8)count++;
      return count;
    });
    assert.equal(omitted, 0, "l'omission forcée doit rendre le banc vide");
    await page.evaluate(() => { window.__PORTANCE_TEST__.disposeNativeStaticPrototype(); window.__PORTANCE_TEST__.disposeSurfaceComparison(); });
    assert.deepEqual(errors, []); await page.close();
  }
  t.diagnostic(`${cases} cadrages du joueur ; captures ${directory}`);
});
