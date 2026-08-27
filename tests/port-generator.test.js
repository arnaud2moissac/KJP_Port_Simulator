"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Codec = require("../src/ports/kjp-codec.js");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const generatorPath = path.join(projectRoot, "generateur-port.html");
const simulatorPath = path.join(projectRoot, "simulateur-port.html");

function testUrl(file) {
  const url = new URL(pathToFileURL(file));
  url.searchParams.set("test", "1");
  return url.href;
}

function createLargePortText() {
  const definition = JSON.parse(fs.readFileSync(
    path.join(__dirname, "fixtures", "kjp-large-port-definition.json"),
    "utf8"
  ));
  const document = Codec.createEmpty({
    id: "large-port-fixture",
    name: "Grand port déterministe",
    latitude: definition.origin.latitude,
    longitude: definition.origin.longitude,
    generatorVersion: definition.generatorVersion
  });
  document.metadata.createdAt = "2026-07-30T00:00:00.000Z";
  document.metadata.updatedAt = "2026-07-30T00:00:00.000Z";
  const { columns, rowPitchMeters, columnPitchMeters } = definition.grid;
  for (let index = 0; index < definition.counts.pontoons; index += 1) {
    document.structures.pontoons.push({
      id: `large-pontoon-${index}`,
      type: "pontoon",
      center: {
        east: 500 + (index % columns) * columnPitchMeters,
        north: 500 + Math.floor(index / columns) * rowPitchMeters
      },
      length: 18,
      width: 2.4,
      heading: (index % 7) * 0.03,
      height: 0.55
    });
  }
  for (let index = 0; index < definition.counts.catways; index += 1) {
    document.structures.catways.push({
      id: `large-catway-${index}`,
      type: "catway",
      center: {
        east: 500 + (index % columns) * columnPitchMeters,
        north: 1100 + Math.floor(index / columns) * rowPitchMeters
      },
      length: 10,
      width: 0.75,
      heading: Math.PI / 2 + (index % 5) * 0.02,
      height: 0.5
    });
  }
  for (let index = 0; index < definition.counts.staticBoats; index += 1) {
    document.staticBoats.push({
      id: `large-boat-${index}`,
      berthId: "",
      center: {
        east: 500 + (index % columns) * columnPitchMeters,
        north: -500 - Math.floor(index / columns) * rowPitchMeters
      },
      heading: Math.PI / 2,
      length: 9,
      beam: 3
    });
  }
  document.navigation.entries = [{
    id: "entry-main",
    name: "Entrée",
    position: { east: 0, north: 0 },
    heading: 0
  }];
  return Codec.serialize(document);
}

test("générateur communautaire KJP — navigateur, édition et intégration", async t => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  const externalRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", request => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });

  await page.goto(testUrl(generatorPath));
  await page.waitForFunction(() => Boolean(window.__KJP_GENERATOR_TEST__));
  await page.waitForTimeout(250);

  await t.test("l’identité KJP et l’aide README sont intégrées au générateur autonome", async () => {
    const initial = await page.evaluate(() => ({
      eyebrow: document.querySelector(".brand .eyebrow")?.textContent.trim(),
      logo: document.querySelector(".brand-mark")?.getAttribute("src"),
      favicon: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
      dialogOpen: document.querySelector("#readmeDialog")?.open
    }));
    assert.equal(initial.eyebrow, "KJP Port Simulator");
    assert.match(initial.logo, /^data:image\/png;base64,/);
    assert.equal(initial.favicon, initial.logo);
    assert.equal(initial.dialogOpen, false);

    await page.click("#readmeHelpButton");
    const help = await page.evaluate(() => ({
      open: document.querySelector("#readmeDialog").open,
      text: document.querySelector("#readmeDialog").textContent
    }));
    assert.equal(help.open, true);
    assert.match(help.text, /Versions de la release 1\.1/);
    assert.match(help.text, /Arnaud de Moissac/);
    await page.click("#closeReadmeHelp");
  });

  await t.test("le livrable est un HTML autonome avec OpenLayers 10.10 intégré", () => {
    const html = fs.readFileSync(generatorPath, "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    assert.equal(packageJson.devDependencies.ol, "10.10.0");
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/i);
    assert.match(html, /OpenLayers/);
    assert.match(html, /tiles\.openseamap\.org/);
    assert.match(html, /data\.geopf\.fr\/wmts/);
    assert.match(html, /overpass-api\.de/);
    assert.match(html, /maps\.mail\.ru\/osm\/tools\/overpass/);
    assert.match(html, /overpass\.private\.coffee/);
    assert.match(html, /gall\.openstreetmap\.de/);
    assert.match(html, /lambert\.openstreetmap\.de/);
    assert.match(html, /maxRounds:\s*5/);
  });

  await t.test("aucune requête cartographique ou géographique n'est émise avant une action", async () => {
    assert.deepEqual(externalRequests, []);
    const report = await page.evaluate(() => ({
      layers: window.__KJP_GENERATOR_TEST__.layers(),
      requests: window.__KJP_GENERATOR_TEST__.networkRequests()
    }));
    assert.equal(report.layers.enabled, false);
    assert.equal(report.layers.osm, false);
    assert.equal(report.layers.seamark, false);
    assert.equal(report.layers.orthophoto, false);
    assert.deepEqual(report.requests, []);
  });

  await t.test("les actions d'édition sont dans le header et les calques restent compacts", async () => {
    const report = await page.evaluate(() => {
      const parent = selector => document.querySelector(selector).parentElement;
      return {
        undoInHeader: Boolean(document.querySelector("#undoButton").closest(".app-header")),
        redoInHeader: Boolean(document.querySelector("#redoButton").closest(".app-header")),
        deleteInHeader: Boolean(document.querySelector("#deleteButton").closest(".app-header")),
        undoInRail: Boolean(document.querySelector("#undoButton").closest(".tool-rail")),
        satelliteLabel: document.querySelector("#orthoLayerToggle").closest("label").textContent.trim(),
        opacityInline: parent("#orthoOpacity").classList.contains("layer-opacity")
          && parent("#orthoOpacity").parentElement.classList.contains("layer-row"),
        seedControl: Boolean(document.querySelector("#occupancySeed")),
        obsoletePrivacyText: document.body.textContent.includes(
          "Aucune requête cartographique n’est émise avant cette action."
        )
      };
    });
    assert.equal(report.undoInHeader, true);
    assert.equal(report.redoInHeader, true);
    assert.equal(report.deleteInHeader, true);
    assert.equal(report.undoInRail, false);
    assert.equal(report.satelliteLabel, "Satellite");
    assert.equal(report.opacityInline, true);
    assert.equal(report.seedControl, false);
    assert.equal(report.obsoletePrivacyText, false);
  });

  await t.test("les valeurs par défaut et les champs de série suivent le mode choisi", async () => {
    await page.evaluate(() => window.__KJP_GENERATOR_TEST__.resetWorkspace());
    let report = await page.evaluate(() => ({
      document: window.__KJP_GENERATOR_TEST__.snapshot(),
      mode: document.querySelector("#catwayMode").value,
      spacing: Number(document.querySelector("#catwaySpacing").value),
      catwayWidth: Number(document.querySelector("#catwayWidth").value),
      marginEnd: Number(document.querySelector("#catwayMarginEnd").value),
      berthWidth: Number(document.querySelector("#berthWidth").value),
      countHidden: document.querySelector("#catwayCountField").hidden,
      spacingHidden: document.querySelector("#catwaySpacingField").hidden
    }));
    assert.equal(report.document.metadata.source, "OpenStreetMap");
    assert.equal(report.document.editor.defaultBerthWidth, 4);
    assert.equal(report.mode, "spacing");
    assert.equal(report.spacing, 10);
    assert.equal(report.catwayWidth, 0.6);
    assert.equal(report.marginEnd, 0);
    assert.equal(report.berthWidth, 4);
    assert.equal(report.countHidden, true);
    assert.equal(report.spacingHidden, false);

    await page.evaluate(() => {
      const mode = document.querySelector("#catwayMode");
      mode.value = "count";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    report = await page.evaluate(() => ({
      countHidden: document.querySelector("#catwayCountField").hidden,
      spacingHidden: document.querySelector("#catwaySpacingField").hidden
    }));
    assert.deepEqual(report, { countHidden: false, spacingHidden: true });

    await page.locator("details.metadata-panel summary").click();
    await page.locator("#portSource").fill("Relevé communautaire");
    await page.locator("#portSource").dispatchEvent("change");
    assert.equal(
      await page.evaluate(() => window.__KJP_GENERATOR_TEST__.snapshot().metadata.source),
      "Relevé communautaire"
    );
  });

  let exported;
  await t.test("la démonstration exerce groupes, taquets, places, bateaux, entrée et export", async () => {
    const report = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      const document = api.loadDemonstration();
      const text = api.exportText();
      return {
        text,
        document,
        rendered: api.renderReport()
      };
    });
    exported = report.text;
    assert.equal(report.document.schemaVersion, 3);
    assert.equal(report.document.structures.pontoons.length, 1);
    assert.equal(report.document.structures.catways.length, 8);
    assert.ok(report.document.structures.catways.every(catway => (
      catway.attachment?.rootOverlap === 0.15
      && catway.vertical?.deckZ === report.document.structures.pontoons[0].vertical?.deckZ
    )));
    assert.equal(report.document.structures.cleats.length, 48);
    assert.equal(report.document.navigation.entries.length, 1);
    assert.equal(report.rendered.entries.length, 1);
    assert.equal(report.rendered.entries[0].geometryType, "LineString");
    assert.equal(report.rendered.entries[0].coordinateCount, 2);
    assert.ok(Math.abs(report.rendered.entries[0].arrowLength - 15) < 1e-6);
    assert.equal(report.document.structures.buoys.length, 1);
    assert.equal(report.document.berths.filter(berth => berth.isVisitor).length, 1);
    assert.ok(report.document.staticBoats.length > 0);
    assert.ok(report.rendered.features > 50);
    assert.match(exported, /^(\{\n  "berths")/);
    assert.doesNotMatch(exported, /data:image|tileData|imageBlob/i);
  });

  await t.test("une série de pendilles crée places, prises, corps-morts et taquets liés", async () => {
    await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      const document = api.loadDemonstration();
      api.select(document.structures.pontoons[0].id);
    });
    await page.locator("#pendilleMode").selectOption("count");
    await page.locator("#pendilleCount").fill("3");
    await page.locator("#createPendilleSeries").click();
    const report = await page.evaluate(() => {
      const document = window.__KJP_GENERATOR_TEST__.snapshot();
      return {
        pendilles: document.structures.pendilles,
        groups: document.editor.pendilleGroups,
        berths: document.berths.filter(berth => berth.pendilleId),
        boats: document.staticBoats.filter(boat => boat.berthId?.startsWith("berth-")),
        exportText: window.__KJP_GENERATOR_TEST__.exportText()
      };
    });
    assert.equal(report.pendilles.length, 3);
    assert.equal(report.groups.length, 1);
    assert.equal(report.berths.length, 3);
    assert.ok(report.boats.length >= 3);
    assert.ok(report.pendilles.every(item => (
      item.anchor.depth === 3
      && item.line.workingStrain === 0.15
      && item.line.maximumLength <= 200
    )));
    assert.doesNotThrow(() => Codec.parse(report.exportText));
  });

  await t.test("import → réexport reste strictement identique", async () => {
    await page.locator("#importInput").setInputFiles({
      name: "port-test.kjp",
      mimeType: "application/json",
      buffer: Buffer.from(exported, "utf8")
    });
    await page.waitForFunction(() => (
      window.__KJP_GENERATOR_TEST__.snapshot().metadata.id === "port-test-kjp"
    ));
    const second = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.exportText());
    assert.equal(second, exported);
  });

  await t.test("l’entrée se place par glissement comme une flèche avec un cap nautique", async () => {
    const mapBox = await page.locator("#map").boundingBox();
    assert.ok(mapBox);
    await page.locator('[data-tool="entry"]').click();
    const start = {
      x: mapBox.x + mapBox.width * 0.42,
      y: mapBox.y + mapBox.height * 0.56
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => (
      window.__KJP_GENERATOR_TEST__.renderReport().tool === "select"
    ));
    const report = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      const snapshot = api.snapshot();
      const entry = snapshot.navigation.entries[0];
      api.select(entry.id);
      return {
        entry,
        render: api.renderReport().entries[0],
        headingLabel: document.querySelector("#headingPropertyLabel").textContent,
        headingValue: Number(document.querySelector('[data-property="headingDeg"]').value)
      };
    });
    assert.ok(Math.abs(report.entry.heading) < 0.03, "un glissement vers la droite doit viser l’est");
    assert.ok(Math.abs(report.render.nauticalHeading - 90) < 1.5);
    assert.equal(report.render.geometryType, "LineString");
    assert.equal(report.headingLabel, "Cap nautique (°)");
    assert.ok(Math.abs(report.headingValue - 90) < 1.5);

    await page.locator('[data-property="headingDeg"]').fill("270");
    await page.locator('[data-property="headingDeg"]').dispatchEvent("change");
    const updated = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      return {
        entry: api.snapshot().navigation.entries[0],
        render: api.renderReport().entries[0]
      };
    });
    assert.ok(Math.abs(Math.abs(updated.entry.heading) - Math.PI) < 1e-9);
    assert.ok(Math.abs(updated.render.nauticalHeading - 270) < 1e-9);
  });

  await t.test("les panneaux latéraux restent réouvrables après leur masquage", async () => {
    await page.locator("#collapseLeft").click();
    assert.equal(await page.locator("#expandLeft").isVisible(), true);
    await page.locator("#expandLeft").click();
    await page.locator("#collapseRight").click();
    assert.equal(await page.locator("#expandRight").isVisible(), true);
    await page.locator("#expandRight").click();
    const report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.panelReport());
    assert.deepEqual(report, {
      leftCollapsed: false,
      rightCollapsed: false,
      candidatesOpen: false
    });
  });

  await t.test("les candidats occupent le panneau droit et se sélectionnent globalement ou par catégorie", async () => {
    const fixture = JSON.parse(fs.readFileSync(
      path.join(__dirname, "fixtures", "osm-port-sample.json"),
      "utf8"
    ));
    const initial = await page.evaluate(response => (
      window.__KJP_GENERATOR_TEST__.showCandidateFixture(response)
    ), fixture);
    assert.ok(initial.total >= 4);
    assert.equal(initial.selected, 0);
    assert.ok(initial.categories.pontoon > 0);
    assert.equal(initial.categories.buoy, 1);
    const layout = await page.evaluate(() => {
      const drawer = document.querySelector("#candidateDrawer").getBoundingClientRect();
      const map = document.querySelector(".map-workspace").getBoundingClientRect();
      const inspector = getComputedStyle(document.querySelector(".right-panel"));
      return {
        drawerLeft: drawer.left,
        drawerWidth: drawer.width,
        mapRight: map.right,
        inspectorDisplay: inspector.display
      };
    });
    assert.ok(layout.drawerLeft >= layout.mapRight - 1, "le panneau ne recouvre pas la carte");
    assert.ok(layout.drawerWidth <= 400);
    assert.equal(layout.inspectorDisplay, "none");

    await page.waitForTimeout(320);
    const focusedIndex = initial.total - 1;
    const pixel = await page.evaluate(index => (
      window.__KJP_GENERATOR_TEST__.candidatePixel(index)
    ), focusedIndex);
    await page.locator("#map").click({ position: { x: pixel[0], y: pixel[1] } });
    await page.waitForFunction(index => (
      window.__KJP_GENERATOR_TEST__.candidateReport().focusedIndex === index
    ), focusedIndex);
    let report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.candidateReport());
    assert.equal(report.focusedIndex, focusedIndex);
    assert.equal(await page.locator(`[data-candidate-row-index="${focusedIndex}"]`).evaluate(
      element => element.classList.contains("focused")
    ), true);

    await page.locator('[data-candidate-category="pontoon"]').click();
    report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.candidateReport());
    assert.equal(report.selectedByCategory.pontoon, initial.categories.pontoon);
    await page.locator('[data-candidate-category="pontoon"]').click();
    report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.candidateReport());
    assert.equal(report.selectedByCategory.pontoon || 0, 0);
    await page.locator('[data-candidate-category="pontoon"]').click();
    await page.locator("#selectAllCandidates").click();
    report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.candidateReport());
    assert.equal(report.selected, report.total);
    await page.locator("#rejectCandidates").click();
    report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.candidateReport());
    assert.equal(report.selected, 0);
    assert.equal(report.open, true);
    await page.locator("#closeCandidates").click();
    report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.candidateReport());
    assert.equal(report.open, false);
  });

  await t.test("le polygone d’analyse limite l’emprise sans masquer la carte", async () => {
    await page.locator("#drawAnalysisPolygon").click();
    const mapBox = await page.locator("#map").boundingBox();
    const points = [
      [mapBox.x + mapBox.width * 0.35, mapBox.y + mapBox.height * 0.35],
      [mapBox.x + mapBox.width * 0.65, mapBox.y + mapBox.height * 0.35],
      [mapBox.x + mapBox.width * 0.65, mapBox.y + mapBox.height * 0.65],
      [mapBox.x + mapBox.width * 0.35, mapBox.y + mapBox.height * 0.65]
    ];
    for (const point of points.slice(0, -1)) await page.mouse.click(...point);
    await page.mouse.dblclick(...points.at(-1));
    await page.waitForFunction(() => (
      window.__KJP_GENERATOR_TEST__.analysisReport().polygon?.length >= 3
    ));
    const report = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      return { analysis: api.analysisReport() };
    });
    assert.equal(report.analysis.features, 1);
    assert.ok(report.analysis.polygon.length >= 3);
    assert.ok(report.analysis.scope.polygon);
    assert.equal(await page.locator("#clearAnalysisPolygon").isEnabled(), true);
    await page.locator("#clearAnalysisPolygon").click();
    const cleared = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.analysisReport());
    assert.equal(cleared.polygon, null);
    assert.equal(cleared.features, 0);
  });

  await t.test("la découpe de ponton est prévisualisée puis créée seulement après validation", async () => {
    const fixture = JSON.parse(fs.readFileSync(
      path.join(__dirname, "fixtures", "osm-port-sample.json"),
      "utf8"
    ));
    const before = await page.evaluate(response => {
      const api = window.__KJP_GENERATOR_TEST__;
      api.resetWorkspace();
      api.showCandidateFixture(response);
      return api.snapshot();
    }, fixture);
    const proposal = await page.evaluate(() => (
      window.__KJP_GENERATOR_TEST__.proposeDecomposition(0)
    ));
    assert.equal(proposal.available, true);
    assert.equal(proposal.continuityValid, true);
    assert.equal(await page.locator("#decompositionPreview").isVisible(), true);
    const unchanged = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.snapshot());
    assert.equal(unchanged.structures.pontoons.length, before.structures.pontoons.length);
    await page.locator("#confirmDecomposition").click();
    const after = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.snapshot());
    assert.equal(after.structures.pontoons.length, 1);
    assert.ok(after.structures.catways.length >= 1);
    assert.ok(after.structures.catways.every(catway => (
      catway.attachment?.parentId === after.structures.pontoons[0].id
      && catway.attachment.rootOverlap === 0.15
      && catway.vertical.deckZ === after.structures.pontoons[0].vertical.deckZ
    )));
    assert.equal(await page.locator("#decompositionPreview").isVisible(), false);
    assert.equal(await page.locator("#candidateDrawer").isVisible(), true);
    assert.equal(
      await page.evaluate(() => window.__KJP_GENERATOR_TEST__.candidateReport().open),
      true,
      "valider une découpe ne doit pas quitter le mode analyse"
    );
    await page.locator("#closeCandidates").click();
  });

  await t.test("les outils de carte ajoutent réellement un objet à la souris", async () => {
    const before = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      return api.loadDemonstration().structures.pontoons.length;
    });
    await page.waitForTimeout(320);
    await page.locator('[data-tool="pontoon"]').click();
    const box = await page.locator("#map").boundingBox();
    await page.locator("#map").click({
      position: { x: box.width * 0.62, y: box.height * 0.54 }
    });
    await page.waitForFunction(count => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.length === count + 1
    ), before);
    const report = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.renderReport());
    assert.equal(report.tool, "select");
    assert.ok(report.selected);
    const createdPontoon = await page.evaluate(() => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.at(-1)
    ));
    assert.equal(createdPontoon.width, 2);

    const buoyBefore = await page.evaluate(() => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.buoys.length
    ));
    await page.locator('[data-tool="buoy"]').click();
    await page.locator("#map").click({
      position: { x: box.width * 0.55, y: box.height * 0.46 }
    });
    await page.waitForFunction(count => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.buoys.length === count + 1
    ), buoyBefore);
    const buoy = await page.evaluate(() => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.buoys.at(-1)
    ));
    assert.equal(buoy.seamarkType, "buoy_lateral");
    assert.equal(buoy.category, "port");
    assert.equal(buoy.shape, "can");
    assert.deepEqual(buoy.colours, ["red"]);
    assert.equal(buoy.collision, true);

    await page.locator("#buoyCategory").selectOption("starboard");
    const starboard = await page.evaluate(() => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.buoys.at(-1)
    ));
    assert.equal(starboard.category, "starboard");
    assert.equal(starboard.shape, "conical");
    assert.deepEqual(starboard.colours, ["green"]);

    await page.locator("#buoySeamarkType").selectOption("mooring");
    const mooring = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      const document = api.snapshot();
      const buoy = document.structures.buoys.at(-1);
      return {
        buoy,
        cleats: document.structures.cleats.filter(cleat => cleat.parentId === buoy.id),
        exported: api.exportText()
      };
    });
    assert.equal(mooring.buoy.seamarkType, "mooring");
    assert.equal(mooring.buoy.category, "buoy");
    assert.equal(mooring.buoy.shape, "spherical");
    assert.deepEqual(mooring.buoy.colours, ["yellow"]);
    assert.equal(mooring.cleats.length, 1);
    assert.equal(mooring.cleats[0].z, mooring.buoy.height);
    assert.doesNotThrow(() => Codec.parse(mooring.exported));
    assert.equal(await page.locator("#inspectorTitle").textContent(), "Bouée corps mort");

    await page.locator("#buoySeamarkType").selectOption("buoy_lateral");
    const navigationBuoy = await page.evaluate(() => {
      const document = window.__KJP_GENERATOR_TEST__.snapshot();
      const buoy = document.structures.buoys.at(-1);
      return {
        seamarkType: buoy.seamarkType,
        cleats: document.structures.cleats.filter(cleat => cleat.parentId === buoy.id).length
      };
    });
    assert.deepEqual(navigationBuoy, { seamarkType: "buoy_lateral", cleats: 0 });
  });

  await t.test("les poignées de longueur et d'angle restent synchronisées avec les champs", async () => {
    const selected = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      const document = api.loadDemonstration();
      const pontoon = document.structures.pontoons[0];
      api.select(pontoon.id);
      return { id: pontoon.id, length: pontoon.length };
    });
    await page.waitForTimeout(350);
    const mapBox = await page.locator("#map").boundingBox();
    const absolute = pixel => ({ x: mapBox.x + pixel[0], y: mapBox.y + pixel[1] });

    let handles = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.rectangleHandleReport());
    assert.equal(handles.objectId, selected.id);
    assert.equal(handles.handles.filter(handle => handle.kind === "length").length, 2);
    assert.equal(handles.handles.filter(handle => handle.kind === "rotate").length, 1);

    const positive = handles.handles.find(handle => handle.kind === "length" && handle.sign === 1);
    const negative = handles.handles.find(handle => handle.kind === "length" && handle.sign === -1);
    const direction = {
      x: positive.pixel[0] - negative.pixel[0],
      y: positive.pixel[1] - negative.pixel[1]
    };
    const norm = Math.hypot(direction.x, direction.y);
    await page.mouse.move(...Object.values(absolute(positive.pixel)));
    await page.mouse.down();
    await page.mouse.move(
      mapBox.x + positive.pixel[0] + direction.x / norm * 35,
      mapBox.y + positive.pixel[1] + direction.y / norm * 35,
      { steps: 5 }
    );
    await page.mouse.up();
    let object = await page.evaluate(id => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.find(item => item.id === id)
    ), selected.id);
    assert.ok(object.length > selected.length, "la poignée d'extrémité doit allonger le ponton");

    handles = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.rectangleHandleReport());
    const rotation = handles.handles.find(handle => handle.kind === "rotate");
    const center = handles.centerPixel;
    await page.mouse.move(...Object.values(absolute(rotation.pixel)));
    await page.mouse.down();
    await page.mouse.move(mapBox.x + center[0] + 85, mapBox.y + center[1], { steps: 6 });
    await page.mouse.up();
    object = await page.evaluate(id => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.find(item => item.id === id)
    ), selected.id);
    assert.ok(Math.abs(object.heading) > 0.2, "la poignée de rotation doit modifier le cap");

    await page.locator('[data-property="headingDeg"]').fill("37");
    await page.locator('[data-property="headingDeg"]').dispatchEvent("change");
    let synchronized = await page.evaluate(id => {
      const api = window.__KJP_GENERATOR_TEST__;
      const object = api.snapshot().structures.pontoons.find(item => item.id === id);
      return { object, render: api.renderReport() };
    }, selected.id);
    assert.ok(Math.abs(synchronized.object.heading * 180 / Math.PI - 37) < 1e-9);
    assert.deepEqual(synchronized.render.mapSelected, [selected.id]);

    handles = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.rectangleHandleReport());
    const lengthHandle = handles.handles.find(handle => handle.kind === "length" && handle.sign === 1);
    const beforeSecondDrag = synchronized.object.length;
    await page.mouse.move(...Object.values(absolute(lengthHandle.pixel)));
    await page.mouse.down();
    await page.mouse.move(
      mapBox.x + lengthHandle.pixel[0] + 24,
      mapBox.y + lengthHandle.pixel[1] - 18,
      { steps: 5 }
    );
    await page.mouse.up();
    synchronized = await page.evaluate(id => {
      const api = window.__KJP_GENERATOR_TEST__;
      const object = api.snapshot().structures.pontoons.find(item => item.id === id);
      return { object, render: api.renderReport() };
    }, selected.id);
    assert.notEqual(synchronized.object.length, beforeSecondDrag);
    assert.ok(Math.abs(synchronized.object.heading * 180 / Math.PI - 37) < 1e-9);
    assert.deepEqual(synchronized.render.mapSelected, [selected.id]);

    const emptyPixel = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.emptyMapPixel());
    assert.ok(emptyPixel, "une zone vide de la carte doit être disponible");
    await page.mouse.click(mapBox.x + emptyPixel[0], mapBox.y + emptyPixel[1]);
    await page.waitForFunction(() => (
      window.__KJP_GENERATOR_TEST__.renderReport().selected === null
    ));
    const deselected = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.renderReport());
    assert.deepEqual(deselected.mapSelected, []);
  });

  await t.test("une erreur d'export identifie et recentre l'objet à corriger", async () => {
    const target = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      const document = api.loadDemonstration();
      const parent = document.structures.pontoons[0];
      parent.length = 10;
      const catway = document.structures.catways.find(item => (
        Math.abs(item.attachment?.station || 0) > parent.length / 2
      ));
      api.setDocument(document);
      return { id: catway.id };
    });
    await page.locator("#exportButton").click();
    const toast = page.locator("#toast");
    await toast.waitFor({ state: "visible" });
    assert.match(await toast.textContent(), new RegExp(target.id));
    assert.equal(await page.locator(".toast-action").textContent(), "Afficher l’objet");
    await page.locator(".toast-action").click();
    await page.waitForFunction(id => (
      window.__KJP_GENERATOR_TEST__.renderReport().selected === id
    ), target.id);
    const focused = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.renderReport());
    assert.deepEqual(focused.mapSelected, [target.id]);
  });

  await t.test("la largeur demandée dimensionne les places et les bateaux s'y adaptent", async () => {
    await page.evaluate(() => window.__KJP_GENERATOR_TEST__.loadDemonstration());
    await page.locator("#berthWidth").fill("2.8");
    await page.locator("#computeBerthsButton").click();
    await page.locator("#occupancyRate").fill("100");
    await page.locator("#populateBoatsButton").click();
    const narrow = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.snapshot());
    assert.equal(narrow.editor.defaultBerthWidth, 2.8);
    assert.ok(narrow.berths.length > 0);
    assert.ok(narrow.berths.every(berth => Math.abs(berth.width - 2.8) < 1e-9));
    assert.ok(narrow.staticBoats.length > 0);
    for (const boat of narrow.staticBoats) {
      const berth = narrow.berths.find(item => item.id === boat.berthId);
      assert.ok(berth);
      assert.ok(boat.length <= berth.maxLength + 1e-9);
      assert.ok(boat.beam <= berth.maxBeam + 1e-9);
      assert.ok(boat.beam <= berth.width - 0.3 + 1e-9);
    }
    const narrowMaximumBeam = Math.max(...narrow.staticBoats.map(boat => boat.beam));

    await page.locator("#berthWidth").fill("7.2");
    await page.locator("#computeBerthsButton").click();
    await page.locator("#populateBoatsButton").click();
    const wide = await page.evaluate(() => window.__KJP_GENERATOR_TEST__.snapshot());
    assert.equal(wide.editor.defaultBerthWidth, 7.2);
    assert.ok(wide.berths.every(berth => Math.abs(berth.width - 7.2) < 1e-9));
    assert.ok(
      Math.max(...wide.staticBoats.map(boat => boat.beam)) > narrowMaximumBeam,
      "les bateaux des places larges doivent pouvoir être plus larges"
    );
  });

  await t.test("sélection, dimensions, annulation/rétablissement et raccourcis clavier restent opérationnels", async () => {
    const before = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      const document = api.snapshot();
      const pontoon = document.structures.pontoons[0];
      api.select(pontoon.id);
      return { id: pontoon.id, length: pontoon.length };
    });
    await page.locator('[data-property="length"]').fill("94");
    await page.locator('[data-property="length"]').dispatchEvent("change");
    let current = await page.evaluate(id => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.find(item => item.id === id).length
    ), before.id);
    assert.equal(current, 94);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
    current = await page.evaluate(id => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.find(item => item.id === id).length
    ), before.id);
    assert.equal(current, before.length);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z");
    current = await page.evaluate(id => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.find(item => item.id === id).length
    ), before.id);
    assert.equal(current, 94);
  });

  await t.test("l'orthophoto se masque, règle son opacité et n'est référencée que comme aide visuelle", async () => {
    await page.locator("#orthoLayerToggle").check();
    await page.locator("#orthoOpacity").fill("31");
    const report = await page.evaluate(() => {
      const api = window.__KJP_GENERATOR_TEST__;
      return {
        layers: api.layers(),
        sources: api.snapshot().sources,
        exported: api.exportText()
      };
    });
    assert.equal(report.layers.orthophoto, false, "les cartes n'ont pas encore été autorisées");
    assert.equal(report.layers.orthophotoOpacity, 0.31);
    const source = report.sources.find(item => item.provider === "IGN BD ORTHO");
    assert.ok(source);
    assert.equal(source.embedded, false);
    assert.doesNotMatch(report.exported, /data:image|imageBlob|tileData/i);
  });

  await t.test("Nouveau port remet complètement l'éditeur à zéro", async () => {
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#newPortButton").click();
    await page.waitForFunction(() => {
      const document = window.__KJP_GENERATOR_TEST__.snapshot();
      return (
        document.metadata.name === "Nouveau port"
        && document.structures.pontoons.length === 0
        && document.structures.catways.length === 0
        && document.staticBoats.length === 0
        && document.berths.length === 0
      );
    });
    const report = await page.evaluate(() => ({
      document: window.__KJP_GENERATOR_TEST__.snapshot(),
      panels: window.__KJP_GENERATOR_TEST__.panelReport(),
      candidates: window.__KJP_GENERATOR_TEST__.candidateReport(),
      analysis: document.querySelector("#analysisStats").textContent
    }));
    assert.equal(report.document.navigation.entries.length, 0);
    assert.equal(
      report.document.sources.some(source => source.kind === "vector"),
      false,
      "aucune source OSM du port précédent ne subsiste"
    );
    assert.ok(report.document.sources.every(source => source.kind === "orthophoto"));
    assert.deepEqual(report.panels, {
      leftCollapsed: false,
      rightCollapsed: false,
      candidatesOpen: false
    });
    assert.equal(report.candidates.total, 0);
    assert.equal(report.analysis, "Aucune zone analysée");
  });

  await t.test("l'interface tablette replie l'inspecteur et conserve des cibles tactiles", async () => {
    const tabletContext = await browser.newContext({
      viewport: { width: 900, height: 760 },
      hasTouch: true,
      isMobile: false
    });
    const tablet = await tabletContext.newPage();
    await tablet.goto(testUrl(generatorPath));
    await tablet.waitForFunction(() => Boolean(window.__KJP_GENERATOR_TEST__));
    const report = await tablet.evaluate(() => ({
      rightCollapsed: document.querySelector(".right-panel").classList.contains("collapsed"),
      mapWidth: document.querySelector("#map").getBoundingClientRect().width,
      toolMinimum: Math.min(...Array.from(document.querySelectorAll(".tool")).map(
        element => element.getBoundingClientRect().height
      )),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    assert.equal(report.rightCollapsed, true);
    assert.ok(report.mapWidth > 700);
    assert.ok(report.toolMinimum >= 43);
    assert.ok(report.overflow <= 1);
    await tablet.locator("#expandRight").tap();
    assert.equal(await tablet.locator(".right-panel").isVisible(), true);
    await tablet.locator("#collapseRight").tap();
    assert.equal(await tablet.locator("#expandRight").isVisible(), true);
    const before = await tablet.evaluate(() => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.length
    ));
    await tablet.locator('[data-tool="pontoon"]').tap();
    const mapBox = await tablet.locator("#map").boundingBox();
    await tablet.touchscreen.tap(
      mapBox.x + mapBox.width * 0.68,
      mapBox.y + mapBox.height * 0.52
    );
    await tablet.waitForFunction(count => (
      window.__KJP_GENERATOR_TEST__.snapshot().structures.pontoons.length === count + 1
    ), before);
    await tabletContext.close();
  });

  await t.test("le simulateur importe atomiquement KJP au point d'entrée, au neutre et sans conditions", async () => {
    const simulator = await context.newPage();
    const simulatorErrors = [];
    simulator.on("pageerror", error => simulatorErrors.push(error.message));
    await simulator.goto(testUrl(simulatorPath));
    await simulator.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
    const communityDocument = Codec.parse(exported, { freeze: false });
    communityDocument.structures.buoys.push({
      id: "mooring-buoy-browser",
      type: "buoy",
      position: { east: -20, north: -28 },
      radius: 0.65,
      height: 1.3,
      seamarkType: "mooring",
      category: "buoy",
      shape: "spherical",
      colours: ["yellow"],
      name: "Corps mort test",
      collision: true
    });
    communityDocument.structures.cleats.push({
      id: "cleat-mooring-browser",
      parentId: "mooring-buoy-browser",
      localPosition: { longitudinal: 0, transverse: 0 },
      z: 1.3,
      orientation: 0
    });
    const portWithMooring = Codec.serialize(communityDocument);
    await simulator.locator("#portFileInput").setInputFiles({
      name: "port-test.kjp",
      mimeType: "application/json",
      buffer: Buffer.from(portWithMooring, "utf8")
    });
    await simulator.waitForFunction(() => (
      window.__PORTANCE_TEST__.topologyReport().id === "port-test-kjp"
    ));
    const report = await simulator.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const topology = api.topologyReport();
      const snapshot = api.snapshot();
      const geometry = api.geometryReport();
      const mooring = api.mooringReport();
      const buoy = topology.buoys[0];
      api.reset({
        x: buoy.x - 7,
        y: buoy.y,
        heading: 0,
        u: 0.8,
        v: 0,
        r: 0
      });
      const buoyContact = api.advance(10);
      const stableId = topology.id;
      let rejection = null;
      try {
        api.importPort('{"format":"KJP","schemaVersion":99}');
      } catch (error) {
        rejection = error.message;
      }
      const afterInvalid = api.topologyReport();
      return { topology, snapshot, geometry, mooring, buoyContact, stableId, rejection, afterInvalid };
    });
    assert.equal(report.topology.communityPort, true);
    assert.equal(report.topology.visitorBerths.length, 1);
    assert.equal(report.topology.buoys.length, 2);
    assert.equal(report.topology.buoys[0].category, "starboard");
    const mooringCleat = report.mooring.shoreCleats.find(
      cleat => cleat.parentId === "mooring-buoy-browser"
    );
    assert.ok(mooringCleat);
    assert.equal(mooringCleat.kind, "buoy");
    assert.equal(mooringCleat.x, -20);
    assert.equal(mooringCleat.y, -28);
    assert.equal(report.snapshot.scenario.id, "community");
    assert.equal(report.snapshot.controls.throttleTarget, 0);
    assert.equal(report.snapshot.controls.rudderTarget, 0);
    assert.equal(report.snapshot.environment.windSpeedKn, 0);
    assert.equal(report.snapshot.environment.currentSpeedKn, 0);
    assert.equal(report.geometry.ok, true);
    assert.ok(report.buoyContact.contacts.impacts >= 1, "la bouée importée est un obstacle physique");
    assert.match(report.rejection, /invalide/i);
    assert.equal(report.afterInvalid.id, report.stableId, "un fichier invalide ne modifie pas le port courant");

    const largeText = createLargePortText();
    const large = await simulator.evaluate(text => {
      const api = window.__PORTANCE_TEST__;
      api.importPort(text);
      return api.topologyReport();
    }, largeText);
    assert.equal(large.id, "large-port-fixture");
    assert.equal(large.obstacleIndex.records, 3000);
    assert.equal(large.renderIndex.records, 3000);
    assert.ok(large.renderIndex.visible < large.renderIndex.records);

    const restored = await simulator.evaluate(() => window.__PORTANCE_TEST__.restoreBuiltInPort());
    assert.equal(restored.topology, "la-trinite-pedagogique");
    assert.equal(restored.scenario, "dockForward");
    assert.equal(restored.communityPort, false);

    await simulator.locator("#portSourceSelect").selectOption("community");
    await simulator.waitForFunction(() => (
      window.__PORTANCE_TEST__.topologyReport().id === "large-port-fixture"
    ));
    assert.equal(
      await simulator.locator("#portSourceSelect").inputValue(),
      "community"
    );
    await simulator.locator("#portSourceSelect").selectOption("builtIn");
    await simulator.waitForFunction(() => (
      window.__PORTANCE_TEST__.topologyReport().id === "la-trinite-pedagogique"
    ));
    assert.equal(
      await simulator.locator("#portSourceSelect").inputValue(),
      "builtIn"
    );
    assert.deepEqual(simulatorErrors, []);
    await simulator.close();
  });

  await t.test("aucune erreur d'exécution n'est apparue", () => {
    assert.deepEqual(errors, []);
  });

  await context.close();
  await browser.close();
});
