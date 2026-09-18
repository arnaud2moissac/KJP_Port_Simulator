"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const url = new URL(pathToFileURL(path.resolve(__dirname, "..", "simulateur-port.html")));
url.searchParams.set("test", "1");
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7,
  `${label}: ${actual} ≠ ${expected}`);

test("Comprendre — décomposition de rotation, invariants et secours Canvas", async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url.href);
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().active === "native");
  const analytic = await page.evaluate(() => {
    const decompose = window.__PORTANCE_TEST__.decomposeUnderstandingForce;
    return {
      transverse: decompose({ x: 2, y: 0, fx: 0, fy: -100, moment: -200 }),
      axial: decompose({ x: 2, y: 0, fx: 800, fy: 0, moment: 0 }),
      center: decompose({ x: 0, y: 0, fx: 10, fy: 20, moment: 0 }),
      centerCouple: decompose({ x: 0, y: 0, fx: 0, fy: 0, moment: -50 }),
      port: decompose({ x: 2, y: 0, fx: 0, fy: 100, moment: 200 }),
      oblique: decompose({ x: 3, y: 4, fx: 30, fy: 10, moment: -90 }),
      capped: decompose({ x: 2, y: 0, fx: 0, fy: -10000, moment: -20000 }),
      keel: decompose({ x: -.18, y: 0, fx: 0, fy: -272, moment: 48.96 }),
      rudder: decompose({ x: -4.35, y: 0, fx: 0, fy: -92, moment: 400.2 })
    };
  });
  closeTo(analytic.transverse.rotFx, 0, "transverse x");
  closeTo(analytic.transverse.rotFy, -100, "transverse y");
  closeTo(analytic.transverse.momentNm, 200, "moment positif vers tribord");
  closeTo(analytic.transverse.leverMeters, 2, "bras transverse");
  closeTo(analytic.axial.rotMagnitude, 0, "poussée axiale alignée");
  closeTo(analytic.axial.momentNm, 0, "moment axial nul");
  closeTo(analytic.center.rotMagnitude, 0, "r nul");
  closeTo(analytic.centerCouple.rotMagnitude, 0, "couple au centre sans flèche inventée");
  closeTo(analytic.centerCouple.momentNm, 50, "couple au centre conservé");
  closeTo(analytic.centerCouple.visualLength, 0, "un couple sans direction de force garde un marqueur");
  closeTo(analytic.port.momentNm, -200, "moment négatif vers bâbord");
  closeTo(analytic.oblique.rotFx * 3 + analytic.oblique.rotFy * 4, 0, "Frot perpendiculaire à r");
  closeTo(3 * analytic.oblique.rotFy - 4 * analytic.oblique.rotFx, -90,
    "Frot conserve le moment géométrique scène");
  closeTo(analytic.capped.visualLength, 12, "plafond visuel 12 m");
  closeTo(analytic.capped.rawVectorLength, 160, "échelle des moments avant plafond");
  closeTo(analytic.capped.momentNm, 20000, "moment non plafonné");
  assert.ok(analytic.keel.rotMagnitude > analytic.rudder.rotMagnitude,
    "la quille peut exercer une force perpendiculaire plus grande");
  assert.ok(Math.abs(analytic.keel.momentNm) < Math.abs(analytic.rudder.momentNm),
    "son petit bras de levier produit pourtant moins de moment");
  assert.ok(analytic.keel.visualLength < analytic.rudder.visualLength,
    "la lecture Rotation classe les flèches selon le moment, pas selon la force");

  await page.locator('[data-mode="understand"]').click();
  assert.equal(await page.locator('[data-understand-view="translation"]').getAttribute("aria-pressed"), "true");
  const reverseNative = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: Math.PI });
    api.setControls({ throttleTarget: -1, rudderTarget: 0 });
    api.advance(7);
    api.selectCameraView("top");
    api.setUnderstandView("rotation");
    return api.understandingRotationReport().parts.find(part => part.name === "Effet de pas");
  });
  await settle(page);
  closeTo(reverseNative.rotation.rotMagnitude, reverseNative.magnitude,
    "en arrière toute le pas d'hélice est entièrement perpendiculaire");
  assert.ok(reverseNative.rotation.visualLength > .5 && reverseNative.rotationArrowVisible,
    "la flèche native de pas d'hélice est lisible sans amplification propre à cette force");
  const reverseHit = await page.evaluate(() => window.__PORTANCE_TEST__.understandingHitReport().targets
    .find(target => target.label === "Pas d'hélice"));
  assert.ok(Math.hypot(reverseHit.b.x - reverseHit.a.x, reverseHit.b.y - reverseHit.a.y) > 10,
    "la flèche occupe plus de dix pixels dans la vue de dessus courante");
  const reverseRect = await page.locator("#scene").boundingBox();
  await page.mouse.click(reverseRect.x + reverseHit.a.x * .2 + reverseHit.b.x * .8,
    reverseRect.y + reverseHit.a.y * .2 + reverseHit.b.y * .8);
  await settle(page);
  assert.match(await page.locator("#forceTooltip").textContent(), /^Pas d'hélice · [+-−]/);
  const leverageCase = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: Math.PI }, {
      windSpeedKn: 0, currentSpeedKn: 0
    });
    api.setControls({ throttleTarget: -1, rudderTarget: 0 });
    api.advance(10);
    const parts = api.understandingRotationReport().parts;
    return {
      keel: parts.find(part => part.name === "Quille"),
      rudder: parts.find(part => part.name === "Safran")
    };
  });
  assert.ok(leverageCase.keel.rotation.rotMagnitude > leverageCase.rudder.rotation.rotMagnitude,
    "la quille exerce ici plus de force tangentielle que le safran");
  assert.ok(Math.abs(leverageCase.keel.rotation.momentNm)
    < Math.abs(leverageCase.rudder.rotation.momentNm),
  "le safran produit pourtant plus de moment grâce à son bras de levier");
  assert.ok(leverageCase.keel.rotation.visualLength < leverageCase.rudder.rotation.visualLength,
    "la longueur en Rotation suit l'ordre des moments physiques mesurés");
  await page.evaluate(() => window.__PORTANCE_TEST__.setUnderstandView("translation"));
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 0, y: 0, heading: 0 }, {
      windSpeedKn: 0, currentSpeedKn: 2.5, currentFromDeg: 0
    });
    api.advance(.5);
  });
  await settle(page);
  assert.equal(await page.locator('[data-understand-view="translation"]').getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#understandViewTabs").isVisible(), true);
  assert.equal(await page.locator("header [data-understand-view]").count(), 2);
  assert.equal(await page.locator("#understandMoment").count(), 0);
  const before = await page.evaluate(() => ({
    snapshot: window.__PORTANCE_TEST__.snapshot(),
    breakdown: window.__PORTANCE_TEST__.physicsForceBreakdown(),
    forces: window.__PORTANCE_TEST__.understandingForceReport(),
    geometry: window.__PORTANCE_TEST__.worldRendererReport().player.understanding.geometries
  }));
  await page.locator('[data-understand-view="rotation"]').click();
  await settle(page);
  const after = await page.evaluate(() => ({
    snapshot: window.__PORTANCE_TEST__.snapshot(),
    breakdown: window.__PORTANCE_TEST__.physicsForceBreakdown(),
    forces: window.__PORTANCE_TEST__.understandingForceReport(),
    report: window.__PORTANCE_TEST__.understandingRotationReport(),
    native: window.__PORTANCE_TEST__.worldRendererReport().player.understanding
  }));
  assert.deepEqual(after.snapshot, before.snapshot, "la bascule ne touche pas à la simulation");
  assert.deepEqual(after.breakdown, before.breakdown, "forceBreakdown reste exactement identique");
  assert.deepEqual(after.forces, before.forces, "la bascule ne touche pas aux forces physiques");
  assert.deepEqual(after.native.geometries, before.geometry, "les géométries restent persistantes");
  assert.equal(after.native.centerOfMass.visible, true);
  assert.deepEqual(after.native.centerOfMass.position, [0, 0, .75]);
  assert.equal(after.report.mode, "understand");
  assert.equal(after.report.view, "rotation");
  closeTo(after.report.momentScale, .008, "échelle commune des moments de Rotation");
  assert.equal(after.report.rotationLengthUnit, "N·m");
  closeTo(after.forces.scale, .0022, "échelle de Translation inchangée");
  closeTo(after.report.momentNm,
    -after.snapshot.forceParts.reduce((sum, part) => sum + part.moment, 0),
    "la synthèse somme toutes les forces brutes, visibles ou non");
  for (const part of after.report.parts) {
    closeTo(part.x * part.rotation.rotFy - part.y * part.rotation.rotFx,
      part.x * part.fy - part.y * part.fx, `${part.name}: moment géométrique`);
    closeTo(part.rotation.visualLength,
      part.rotation.rotMagnitude > 1e-9
        ? Math.min(12, Math.abs(part.rotation.momentNm) * .008) : 0,
      `${part.name}: longueur déterminée par le moment`);
    assert.ok(part.rotation.rawVectorLength <= 12 || part.rotationArrowVisible,
      `${part.name}: le plafond ne change pas la valeur brute`);
  }
  assert.equal(await page.locator("#understandMoment").count(), 0);
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.selectCameraView("skipper");
    api.selectVisualTheme("chart");
  });
  await settle(page);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport()))
    .player.understanding.centerOfMass.visible, true, "G reste visible en vue Skipper et thème carte");
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), before.snapshot,
    "la caméra et le thème ne touchent pas à la simulation");
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.selectCameraView("top");
    api.selectVisualTheme("dark");
  });
  await settle(page);
  assert.ok(after.report.parts.some(part => part.name.startsWith("Quille")));
  assert.ok(after.report.parts.some(part => part.name.startsWith("Safran")));
  assert.ok(!after.report.parts.some(part => part.name === "Courant"), "pas de force Courant fictive");
  assert.ok(after.report.parts.some(part => part.representation === "wind-resultant" && part.magnitude > 0),
    "le vent apparent existe même quand le vent vrai est nul");
  const wind = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 0, y: 0, heading: 0 }, { windSpeedKn: 16, windFromDeg: 270 });
    api.advance(.2);
    return { raw: api.snapshot().forceParts.filter(part => part.name === "Vent"),
      visual: api.understandingRotationReport().parts.filter(part => part.representation === "wind-resultant") };
  });
  assert.equal(wind.visual.length, 2);
  closeTo(wind.visual.reduce((sum, part) => sum + part.rotation.momentNm, 0),
    -wind.raw.reduce((sum, part) => sum + part.moment, 0), "moments du vent conservés");
  await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 0, y: 0, heading: 0 }, {
      windSpeedKn: 0, currentSpeedKn: 2.5, currentFromDeg: 0
    });
    api.advance(.5);
  });
  await settle(page);

  const hit = await page.evaluate(() => window.__PORTANCE_TEST__.understandingHitReport().targets
    .find(target => target.kind === "force"));
  const rect = await page.locator("#scene").boundingBox();
  await page.mouse.move(rect.x + hit.a.x, rect.y + hit.a.y);
  await settle(page);
  assert.equal(await page.locator("#forceTooltip").isVisible(), true);
  assert.match(await page.locator("#forceTooltip").textContent(), /N·m/);
  assert.doesNotMatch(await page.locator("#forceTooltip").textContent(), /F⊥|bras/);

  await page.evaluate(() => window.__PORTANCE_TEST__.selectWorldRenderer("canvas"));
  await settle(page);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.understandingRotationReport())).view, "rotation");
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), before.snapshot,
    "le secours ne touche pas à la simulation");
  const coincident = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 25, y: -38, heading: 0 });
    api.setControls({ throttleTarget: -.8, rudderTarget: .6 });
    api.advance(2);
    api.selectCameraView("top");
    return api.understandingRotationReport().parts
      .filter(part => part.name === "Hélice" || part.name === "Effet de pas")
      .map(part => ({ name: part.name, x: part.x, y: part.y,
        magnitude: part.magnitude, rotation: part.rotation,
        rotationArrowVisible: part.rotationArrowVisible }));
  });
  await settle(page);
  assert.equal(coincident.length, 2, "poussée et pas d'hélice sont tous deux inspectables");
  closeTo(coincident[0].x, coincident[1].x, "même abscisse d'application");
  closeTo(coincident[0].y, coincident[1].y, "même ordonnée d'application");
  const propWalk = coincident.find(part => part.name === "Effet de pas");
  closeTo(propWalk.rotation.rotMagnitude, propWalk.magnitude,
    "le pas d'hélice est entièrement contributif au lacet");
  assert.ok(propWalk.rotation.visualLength > .5 && propWalk.rotationArrowVisible,
    "le pas d'hélice en arrière est une flèche lisible avec l'échelle commune");
  const coincidentHits = await page.evaluate(() => {
    const targets = window.__PORTANCE_TEST__.understandingHitReport().targets;
    return {
      motor: targets.find(target => target.label.startsWith("Moteur")),
      propWalk: targets.find(target => target.label === "Pas d'hélice")
    };
  });
  assert.ok(coincidentHits.motor && coincidentHits.propWalk);
  const canvasRect = await page.locator("#scene").boundingBox();
  await page.mouse.click(canvasRect.x + coincidentHits.motor.a.x,
    canvasRect.y + coincidentHits.motor.a.y);
  await settle(page);
  assert.match(await page.locator("#forceTooltip").textContent(), /^Moteur/);
  assert.equal(await page.locator("#forceTooltip button").count(), 0,
    "l'infobulle ne contient aucun sélecteur de contributions");
  await page.mouse.click(canvasRect.x + coincidentHits.propWalk.a.x * .2
    + coincidentHits.propWalk.b.x * .8,
  canvasRect.y + coincidentHits.propWalk.a.y * .2
    + coincidentHits.propWalk.b.y * .8);
  await settle(page);
  assert.match(await page.locator("#forceTooltip").textContent(), /^Pas d'hélice/);
  await page.locator('[data-mode="navigation"]').click();
  assert.equal(await page.locator("#understandViewTabs").isVisible(), false);
  await page.locator('[data-mode="understand"]').click();
  assert.equal(await page.locator('[data-understand-view="rotation"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-understand-view="translation"]').click();
  assert.equal(await page.locator("#understandViewTabs").isVisible(), true);
  const replay = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    const run = switchView => {
      api.reset({ x: 25, y: -38, heading: 0 }, {
        windSpeedKn: 12, windFromDeg: 0, currentSpeedKn: 1.5, currentFromDeg: 90
      });
      api.setControls({ throttleTarget: -.6, rudderTarget: .4 });
      const first = api.advance(2);
      if (switchView) api.setUnderstandView("rotation");
      const final = api.advance(3);
      return { first, final, breakdown: api.physicsForceBreakdown() };
    };
    const translation = run(false);
    api.setUnderstandView("translation");
    const switched = run(true);
    return { translation, switched };
  });
  assert.deepEqual(replay.switched, replay.translation,
    "commandes, trajectoire et forceBreakdown sont identiques aux mêmes timestamps");
  await page.setViewportSize({ width: 390, height: 760 });
  await settle(page);
  const mobileHeader = await page.locator("header.topbar").boundingBox();
  const mobileSwitch = await page.locator("#understandViewTabs").boundingBox();
  assert.ok(mobileSwitch && mobileSwitch.x >= 0
    && mobileSwitch.x + mobileSwitch.width <= 390
    && mobileSwitch.y >= mobileHeader.y
    && mobileSwitch.y + mobileSwitch.height <= mobileHeader.y + mobileHeader.height,
  "le sélecteur reste entièrement dans le header mobile");
  assert.deepEqual(errors, []);
});
