"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const simulatorPath = path.join(projectRoot, "simulateur-port.html");
const topologyPath = path.join(projectRoot, "ports", "la-trinite-pedagogique.js");
const portTopology = require(topologyPath);
const KJPCodec = require(path.join(projectRoot, "src", "ports", "kjp-codec.js"));
const trajectoryFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "port-trajectories.json"), "utf8")
);
const simulatorUrl = pathToFileURL(simulatorPath);
const testUrl = new URL(simulatorUrl);
testUrl.searchParams.set("test", "1");

function createPortInformationText() {
  const document = KJPCodec.createEmpty({
    id: "port-informations-test",
    name: "Port des informations",
    latitude: 47.58626,
    longitude: -3.02937,
    generatorVersion: "test"
  });
  Object.assign(document.metadata, {
    author: "Équipage Test",
    source: "OpenStreetMap + relevé local",
    harborMasterUrl: "https://example.com/capitainerie",
    openingHours: "08:00–20:00",
    currentAdvice: "Éviter le jusant dans le chenal nord.",
    comment: "Appeler la capitainerie avant l'entrée.",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z"
  });
  document.navigation.entries.push({
    id: "entry-information-test",
    name: "Entrée principale",
    position: { east: 0, north: 0 },
    heading: 0
  });
  return KJPCodec.serialize(document);
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => (
    value <= .04045
      ? value / 12.92
      : ((value + .055) / 1.055) ** 2.4
  ));
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)]
    .sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

test("simulateur de port — cohérence, physique et non-régression", async t => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });
  const runtimeErrors = [];
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => runtimeErrors.push(`page: ${error.message}`));

  await page.goto(testUrl.href);
  await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));

  await t.test("la topologie métrique reste interchangeable mais est intégrée au HTML autonome", async () => {
    const html = fs.readFileSync(simulatorPath, "utf8");
    assert.match(
      html,
      /<script data-port-topology="embedded">/
    );
    assert.doesNotMatch(html, /<script[^>]+data-port-topology[^>]+src=/);
    assert.match(html, /id:\s*"la-trinite-pedagogique"/);
    assert.equal(portTopology.schemaVersion, 2);
    assert.equal(portTopology.id, "la-trinite-pedagogique");
    assert.deepEqual(portTopology.units, {
      distance: "m",
      speed: "m/s",
      angle: "rad"
    });
    assert.equal(portTopology.referenceBoat.length, 10.94);
    assert.equal(portTopology.referenceBoat.beam, 3.59);
    assert.ok(Object.isFrozen(portTopology));
    assert.ok(Object.isFrozen(portTopology.structures.docks));
    assert.ok(Object.isFrozen(portTopology.structures.mooringCleats));

    for (const structure of [
      ...portTopology.structures.docks,
      ...portTopology.structures.catways
    ]) {
      assert.ok(Number.isFinite(structure.x + structure.y + structure.w + structure.h));
      assert.ok(structure.w > 0 && structure.h > 0);
      assert.ok(structure.x - structure.w / 2 >= portTopology.bounds.minX);
      assert.ok(structure.x + structure.w / 2 <= portTopology.bounds.maxX);
      assert.ok(structure.y - structure.h / 2 >= portTopology.bounds.minY);
      assert.ok(structure.y + structure.h / 2 <= portTopology.bounds.maxY);
      assert.ok([structure.baseZ, structure.topZ, structure.deckZ].every(Number.isFinite));
      assert.ok(Math.abs(structure.topZ - structure.baseZ - structure.height) < 1e-9);
      assert.ok(structure.deckZ >= structure.baseZ && structure.deckZ <= structure.topZ);
    }

    const browserReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.topologyReport()
    );
    assert.deepEqual(browserReport.units, portTopology.units);
    assert.deepEqual(browserReport.referenceBoat, portTopology.referenceBoat);
    assert.equal(browserReport.id, portTopology.id);
  });

  await t.test("les préférences par défaut sont le thème nuit, le son actif et moins de 0,6 nd pour frapper", async () => {
    const defaults = await page.evaluate(() => ({
      theme: window.__PORTANCE_TEST__.visualThemeReport(),
      audio: window.__PORTANCE_TEST__.engineAudioReport(),
      mooring: window.__PORTANCE_TEST__.mooringReport(),
      attachInput: document.querySelector("#mooringAttachSpeed").value,
      attachReadout: document.querySelector(
        '[data-value-for="mooringAttachSpeed"]'
      ).textContent
    }));
    assert.equal(defaults.theme.id, "dark");
    assert.equal(defaults.theme.cssTheme, "dark");
    assert.equal(defaults.theme.toggle.pressed, "false");
    assert.match(defaults.theme.toggle.ariaLabel, /carte marine clair/);
    assert.equal(defaults.audio.supported, true);
    assert.equal(defaults.audio.enabled, true);
    assert.equal(defaults.audio.started, true);
    assert.equal(defaults.audio.button.pressed, "true");
    assert.match(defaults.audio.button.ariaLabel, /Couper le son/);
    assert.equal(defaults.mooring.policy.defaultAttachSpeedKn, .6);
    assert.equal(defaults.mooring.policy.attachSpeedKn, .6);
    assert.equal(defaults.attachInput, "0.6");
    assert.equal(defaults.attachReadout, "0,6 nd");
  });

  await t.test("la navigation reste prioritaire et les commandes ne débordent plus du header", async () => {
    const initial = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      };
      const topbar = document.querySelector(".topbar");
      return {
        headerOverflow: topbar.scrollWidth - topbar.clientWidth,
        stage: box(".stage"),
        workspace: box("#workspace"),
        portPanelParent: document.querySelector("#portSourceSelect").closest("aside")?.id,
        lessonParent: document.querySelector("#lessonCard").closest("aside")?.id,
        actionParents: ["pauseButton", "resetButton", "cameraButton"].map(id => (
          document.querySelector(`#${id}`).closest("header")?.className || null
        ))
      };
    });

    assert.ok(initial.headerOverflow <= 1, `débordement du header: ${initial.headerOverflow}px`);
    assert.equal(initial.portPanelParent, "sidebar");
    assert.equal(initial.lessonParent, "sidebar");
    assert.deepEqual(initial.actionParents, ["topbar", "topbar", "topbar"]);
    assert.ok(initial.stage.width / initial.workspace.width >= 0.7);

    await page.locator("#sidebarToggle").click();
    await page.waitForTimeout(240);
    const collapsed = await page.evaluate(() => ({
      expanded: document.querySelector("#sidebarToggle").getAttribute("aria-expanded"),
      collapsed: document.querySelector("#workspace").classList.contains("sidebar-collapsed"),
      stageWidth: document.querySelector(".stage").getBoundingClientRect().width,
      workspaceWidth: document.querySelector("#workspace").getBoundingClientRect().width
    }));
    assert.equal(collapsed.expanded, "false");
    assert.equal(collapsed.collapsed, true);
    assert.ok(collapsed.stageWidth / collapsed.workspaceWidth > 0.98);

    await page.locator("#sidebarToggle").click();
    await page.waitForTimeout(240);
    assert.equal(
      await page.locator("#sidebarToggle").getAttribute("aria-expanded"),
      "true"
    );

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(100);
    const tablet = await page.evaluate(() => {
      const header = document.querySelector(".topbar");
      const tools = document.querySelector(".header-tools").getBoundingClientRect();
      const skipper = document.querySelector("#skipperViewButton").getBoundingClientRect();
      const sidebar = document.querySelector("#sidebar").getBoundingClientRect();
      return {
        overflow: header.scrollWidth - header.clientWidth,
        toolsRight: tools.right,
        skipperVisible: skipper.width > 0 && skipper.height > 0,
        sidebarTop: sidebar.top,
        workspaceTop: document.querySelector("#workspace").getBoundingClientRect().top
      };
    });
    assert.ok(tablet.overflow <= 1);
    assert.ok(tablet.toolsRight <= 768);
    assert.equal(tablet.skipperVisible, true);
    assert.equal(tablet.sidebarTop, tablet.workspaceTop);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(100);
  });

  await t.test("les informations KJP, les raccourcis et les aides du header sont accessibles", async () => {
    const portText = createPortInformationText();
    await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), portText);
    await page.locator("#portInfoButton").click();
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.portInformationReport());
    assert.equal(report.open, true);
    assert.equal(report.metadata.name, "Port des informations");
    assert.equal(report.metadata.author, "Équipage Test");
    assert.equal(report.metadata.source, "OpenStreetMap + relevé local");
    assert.equal(report.metadata.openingHours, "08:00–20:00");
    assert.equal(report.metadata.currentAdvice, "Éviter le jusant dans le chenal nord.");
    assert.equal(report.metadata.comment, "Appeler la capitainerie avant l'entrée.");
    assert.match(report.rows.join(" "), /Équipage Test/);
    assert.match(report.rows.join(" "), /OpenStreetMap \+ relevé local/);
    assert.match(report.rows.join(" "), /08:00–20:00/);
    assert.match(report.rows.join(" "), /jusant/);
    assert.match(report.rows.join(" "), /capitainerie avant l'entrée/);
    assert.equal(report.url, "https://example.com/capitainerie");
    assert.match(report.shortcuts, /Maj.*déplacer la carte autour du bateau/);
    assert.ok(report.headerTitles.every(item => item.title.length > 0));

    const source = fs.readFileSync(path.join(projectRoot, "src", "simulateur-port", "template.html"), "utf8");
    assert.doesNotMatch(source, /cabinRoofWorld|cockpitRim|anchorWell|transomCap/);
    assert.match(source, /boat\.vesselType !== "motorboat"/);

    await page.locator("#portInfoButton").click();
    await page.evaluate(() => window.__PORTANCE_TEST__.restoreBuiltInPort());
    await page.locator("#portInfoButton").click();
    const pedagogicalPort = await page.evaluate(
      () => window.__PORTANCE_TEST__.portInformationReport()
    );
    assert.equal(pedagogicalPort.metadata.author, "Arnaud de Moissac");
    assert.match(pedagogicalPort.rows.join(" "), /Arnaud de Moissac/);
    await page.locator("#portInfoButton").click();
  });

  await t.test("un mètre, un nœud et une seconde ont la même échelle partout", async () => {
    const reports = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("dockForward");
      const display = api.displayScaleReport();
      api.reset(
        { x: 200, y: 200, heading: 0 },
        {
          windSpeedKn: 10,
          windFromDeg: 270,
          currentSpeedKn: 1,
          currentFromDeg: 270
        }
      );
      return {
        display,
        units: api.unitCoherenceReport()
      };
    });

    assert.equal(reports.display.topologyUnits.distance, "m");
    assert.equal(reports.display.worldUnitsPerMeter, 1);
    assert.ok(reports.display.oneMeterPixels > 0);
    assert.ok(
      Math.abs(reports.display.tenMetersPixels / reports.display.oneMeterPixels - 10) < 1e-9
    );
    assert.ok(
      Math.abs(reports.display.boatMetersFromProjection - 10.94) < 1e-9
    );
    assert.ok(
      Math.abs(reports.display.catwayMetersFromProjection - 12.6) < 1e-9
    );

    const { units } = reports;
    assert.equal(units.knotMetersPerSecond, 0.514444);
    assert.equal(units.physicsKnotMetersPerSecond, units.knotMetersPerSecond);
    assert.equal(units.topologyDistanceUnit, "m");
    assert.equal(units.topologySpeedUnit, "m/s");
    for (const flow of [units.current, units.wind]) {
      assert.ok(Math.abs(flow.visualVector.east - flow.physicsVector.east) < 1e-12);
      assert.ok(Math.abs(flow.visualVector.north - flow.physicsVector.north) < 1e-12);
      assert.ok(Math.abs(flow.particleOneSecond.east - flow.physicsVector.east) < 1e-12);
      assert.ok(Math.abs(flow.particleOneSecond.north - flow.physicsVector.north) < 1e-12);
      assert.ok(
        Math.abs(
          flow.screenPixelsPerSecond / flow.localPixelsPerMeter
          - flow.speedMetersPerSecond
        ) < 1e-9
      );
    }
    assert.ok(
      Math.abs(
        units.wind.speedMetersPerSecond / units.current.speedMetersPerSecond
        - 10
      ) < 1e-12
    );

    const motion = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 200, y: 200, heading: 0 });
      api.setControls({ throttleTarget: 0.5 });
      return api.advance(5);
    });
    await page.waitForTimeout(50);
    const displayedKnots = Number(
      (await page.locator("#sogValue").textContent())
        .replace("−", "-")
        .replace(",", ".")
    );
    assert.ok(
      Math.abs(displayedKnots - motion.signedGroundSpeed / 0.514444) <= 0.051,
      "la vitesse affichée ne correspond pas à la vitesse physique"
    );
  });

  await t.test("la vue Skipper reste liée à l'axe du bateau", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 20, y: 30, heading: .35 });
      const initial = api.selectCameraView("skipper");
      api.setControls({
        throttleTarget: .55,
        rudderTarget: 25 * Math.PI / 180
      });
      api.advance(8);
      const afterTurn = api.cameraReport();
      const moorings = api.mooringReport();
      const canvas = document.querySelector("#scene");
      const pointer = (type, properties) => canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 901,
          pointerType: "mouse",
          ...properties
        })
      );
      pointer("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 190
      });
      pointer("pointermove", {
        buttons: 1,
        clientX: 600,
        clientY: 150
      });
      pointer("pointerup", {
        button: 0,
        clientX: 600,
        clientY: 150
      });
      const afterOrbit = api.cameraReport();
      pointer("pointerdown", {
        button: 0,
        shiftKey: true,
        clientX: 120,
        clientY: 180
      });
      pointer("pointermove", {
        buttons: 1,
        shiftKey: true,
        clientX: 310,
        clientY: 280
      });
      pointer("pointerup", {
        button: 0,
        shiftKey: true,
        clientX: 310,
        clientY: 280
      });
      const afterPan = api.cameraReport();
      return { initial, afterTurn, afterOrbit, afterPan, moorings };
    });

    for (const report of [result.initial, result.afterTurn]) {
      assert.equal(report.view, "skipper");
      assert.equal(report.anatomy, false);
      assert.ok(Math.abs(report.headingRelativeToBoat) < 1e-12);
      assert.ok(Math.abs(report.eyeLocal[0] + 8.2) < 1e-12);
      assert.ok(Math.abs(report.eyeLocal[1]) < 1e-12);
      assert.ok(Math.abs(report.eyeLocal[2] - 5.1) < 1e-12);
      assert.ok(report.forward[2] < 0, "le skipper ne regarde pas légèrement vers le pont");
      assert.ok(report.nearClipMeters <= .05, "le plan proche reste trop agressif");
      assert.ok(report.skipperRenderDistanceMeters >= 600, "la scène lointaine est encore tronquée");
      assert.ok(report.visibleHarborObjects > 0, "le port disparaît de la vue Skipper");
    }
    assert.ok(
      Math.abs(result.afterOrbit.skipperYawOffset) > 70 * Math.PI / 180,
      "la vue Skipper reste bloquée à ±70°"
    );
    assert.ok(
      Math.hypot(...result.afterPan.skipperPan) > 1,
      "le panoramique est encore bloqué en vue Skipper"
    );
    assert.ok(
      result.moorings.boatCleats.filter(cleat => cleat.screen).length >= 5,
      "les taquets du bateau ne sont pas suffisamment visibles en vue Skipper"
    );
    assert.ok(
      Math.abs(result.afterTurn.position[0] - result.initial.position[0]) > .1
      || Math.abs(result.afterTurn.position[1] - result.initial.position[1]) > .1
    );
    assert.equal(
      await page.locator("#skipperViewButton").getAttribute("aria-pressed"),
      "true"
    );
    assert.equal(
      await page.locator("#topViewButton").getAttribute("aria-pressed"),
      "false"
    );
  });

  await t.test("le zoom arrière couvre l'échelle d'un port complet", async () => {
    const zoom = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.selectCameraView("top");
      const canvas = document.querySelector("#scene");
      canvas.dispatchEvent(new WheelEvent("wheel", {
        deltaY: 10000,
        cancelable: true
      }));
      const far = api.cameraReport();
      canvas.dispatchEvent(new WheelEvent("wheel", {
        deltaY: -10000,
        cancelable: true
      }));
      const near = api.cameraReport();
      return { far, near };
    });

    assert.equal(zoom.far.distance, zoom.far.maximumDistance);
    assert.equal(zoom.near.distance, zoom.near.minimumDistance);
    assert.ok(zoom.far.maximumDistance >= 1000);
    assert.ok(
      zoom.far.maximumDistance / zoom.near.minimumDistance >= 60,
      "la plage de zoom reste trop courte pour un port réel"
    );
  });

  await t.test("l'axe visuel du safran part de la poupe sur 120 % de la coque", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 12, y: -8, heading: .7 });
      api.setControls({
        rudderTarget: 35 * Math.PI / 180,
        rudderActual: 24 * Math.PI / 180
      });
      const starboard = api.rudderAxisReport();
      api.setControls({ rudderActual: -24 * Math.PI / 180 });
      const port = api.rudderAxisReport();
      return { starboard, port };
    });

    for (const axis of [result.starboard, result.port]) {
      assert.equal(axis.lengthFactor, 1.2);
      assert.ok(Math.abs(axis.length / axis.boatLength - 1.2) < 1e-12);
      assert.ok(Math.abs(axis.worldLength - axis.length) < 1e-12);
      assert.ok(Math.abs(axis.startLocal[0] + 4.35) < 1e-12);
      assert.ok(Math.abs(axis.startLocal[1]) < 1e-12);
    }
    assert.ok(Math.abs(result.starboard.relativeAngle - 24 * Math.PI / 180) < 1e-12);
    assert.ok(Math.abs(result.port.relativeAngle + 24 * Math.PI / 180) < 1e-12);
    assert.match(
      fs.readFileSync(simulatorPath, "utf8"),
      /addRudderAxis\(\);/
    );
  });

  await t.test("le thème carte marine reste lisible dans tous les rendus", async () => {
    const sampleScene = async () => {
      const image = await page.locator(".stage").screenshot();
      return { encodedBytes: image.length };
    };

    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.selectCameraView("top");
      api.selectVisualTheme("dark");
      api.reset(
        { x: 25, y: -27.35, heading: 0 },
        {
          windSpeedKn: 12,
          windFromDeg: 300,
          currentSpeedKn: 1.4,
          currentFromDeg: 215
        }
      );
      api.setControls({
        throttleTarget: .5,
        throttleActual: .5,
        rudderTarget: 24 * Math.PI / 180,
        rudderActual: 24 * Math.PI / 180
      });
    });
    await page.locator('[data-mode="understand"]').click();
    await page.waitForTimeout(100);
    const darkCanvas = await sampleScene();
    const darkReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.visualThemeReport()
    );
    assert.equal(darkReport.id, "dark");
    assert.equal(darkReport.toggle.text, "");
    assert.equal(darkReport.toggle.pressed, "false");
    assert.match(darkReport.toggle.ariaLabel, /carte marine clair/);
    assert.deepEqual(darkReport.compositor, {
      themeId: "dark",
      background: "linear-gradient(180deg, #0b4351, #0a3847 52%, #072b37)",
      owner: "stage",
      canvasBackground: "transparent"
    });

    await page.locator("#themeToggle").click();
    await page.waitForTimeout(100);
    const chartCanvas = await sampleScene();
    const chartReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.visualThemeReport()
    );
    assert.equal(chartReport.id, "chart");
    assert.equal(chartReport.cssTheme, "chart");
    assert.match(chartReport.colorScheme, /light/);
    assert.equal(chartReport.bathymetry, false);
    assert.equal(chartReport.water.mode, "flat-chart");
    assert.equal(chartReport.water.depthContours, false);
    assert.equal(chartReport.grid.enabled, true);
    assert.ok(chartReport.grid.adaptiveStepMeters >= 10);
    assert.equal(chartReport.toggle.text, "");
    assert.equal(chartReport.toggle.pressed, "true");
    assert.match(chartReport.toggle.ariaLabel, /thème nocturne/);
    assert.ok(
      relativeLuminance(chartReport.water.base)
        > relativeLuminance(darkReport.water.base) + .35,
      "le thème carte marine n'est pas sensiblement plus clair"
    );
    assert.ok(darkCanvas.encodedBytes > 20_000, "le rendu nocturne paraît vide");
    assert.ok(chartCanvas.encodedBytes > 20_000, "le thème clair a aplati la scène");

    await page.locator("#themeToggle").click();
    await page.waitForTimeout(300);
    const restoredDarkCanvas = await sampleScene();
    const restoredDarkReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.visualThemeReport()
    );
    assert.equal(restoredDarkReport.id, "dark");
    assert.deepEqual(
      restoredDarkReport.compositor,
      darkReport.compositor,
      "le compositeur conserve le fond clair après le retour au thème nocturne"
    );
    assert.ok(restoredDarkCanvas.encodedBytes > 20_000, "le retour au thème nocturne a vidé la scène");

    await page.locator("#themeToggle").click();
    await page.waitForTimeout(300);

    const semanticKeys = ["wind", "current", "force", "contact", "rudder", "goal"];
    const semanticColors = semanticKeys.map(key => chartReport.semantic[key]);
    assert.equal(new Set(semanticColors).size, semanticColors.length);
    for (const [index, color] of semanticColors.entries()) {
      assert.match(color, /^#[0-9a-f]{6}$/i);
      assert.ok(
        contrastRatio(chartReport.water.base, color) >= 4,
        `${semanticKeys[index]} manque de contraste sur l'eau`
      );
    }
    assert.notEqual(chartReport.boat.playerHull, chartReport.water.base);
    assert.notEqual(chartReport.harbor.pontoon, chartReport.water.base);
    assert.notEqual(chartReport.harbor.catway, chartReport.water.base);
    assert.notEqual(chartReport.semantic.rudder, chartReport.semantic.current);

    for (const view of ["top", "anatomy", "skipper"]) {
      const report = await page.evaluate(selected => {
        const api = window.__PORTANCE_TEST__;
        api.selectCameraView(selected);
        return api.visualThemeReport();
      }, view);
      await page.waitForTimeout(80);
      const canvas = await sampleScene();
      assert.equal(report.id, "chart");
      assert.equal(report.grid.enabled, view !== "skipper");
      assert.ok(canvas.encodedBytes > 20_000, `${view}: rendu cartographique trop uniforme`);
    }

    await page.setViewportSize({ width: 320, height: 720 });
    await page.evaluate(() => window.__PORTANCE_TEST__.selectCameraView("top"));
    await page.waitForTimeout(100);
    const compact = await page.evaluate(() => {
      const toggle = document.querySelector("#themeToggle").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        toggleVisible: toggle.width > 0 && toggle.height > 0,
        toggleInside: toggle.left >= 0 && toggle.right <= innerWidth,
        buttonText: document.querySelector("#themeToggle").textContent.trim()
      };
    });
    assert.equal(compact.overflow, false);
    assert.equal(compact.toggleVisible, true);
    assert.equal(compact.toggleInside, true);
    assert.equal(compact.buttonText, "");

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.selectCameraView("top");
      api.selectVisualTheme("chart");
      api.loadScenario("dockForward");
    });
    await page.locator('[data-mode="navigation"]').click();
  });

  await t.test("le vent droit et le courant ondulé restent visibles dans la scène 3D", async () => {
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.selectVisualTheme("dark");
      api.selectCameraView("top");
      api.reset(
        { x: 25, y: -27.35, heading: 0 },
        {
          windSpeedKn: 12,
          windFromDeg: 270,
          currentSpeedKn: 2,
          currentFromDeg: 180
        }
      );
    });
    await page.waitForTimeout(80);
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.visualReport());
    assert.equal(report.flow.wind.shape, "straight");
    assert.equal(report.flow.current.shape, "wave");
    assert.ok(report.flow.wind.width >= 1.8);
    assert.ok(report.flow.current.width >= 2);
    assert.ok(report.flow.wind.renderedSegments >= 25);
    assert.ok(report.flow.current.renderedSegments >= 200);
  });

  await t.test("le son moteur suit le régime sans échantillon externe ni niveau agressif", async () => {
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.selectCameraView("top");
      api.loadScenario("dockForward");
    });
    await page.waitForTimeout(80);
    const idle = await page.evaluate(
      () => window.__PORTANCE_TEST__.engineAudioReport()
    );
    assert.equal(idle.supported, true);
    assert.equal(idle.enabled, true);
    assert.equal(idle.started, true);
    assert.equal(idle.profile.source, "procedural-webaudio");
    assert.equal(idle.profile.externalAssets, false);
    assert.equal(idle.profile.cylinders, 3);
    assert.equal(idle.profile.strokes, 4);
    assert.equal(idle.profile.firingEventsPerRevolution, 1.5);
    assert.equal(idle.profile.volumeMultiplier, 1.3);
    assert.ok(idle.profile.startupFadeSeconds >= .15);
    assert.deepEqual(idle.profile.layers, [
      "combustion-pulses",
      "mechanical-harmonic",
      "filtered-broadband-noise"
    ]);
    assert.equal(idle.button.text, "");
    assert.equal(idle.button.pressed, "true");
    assert.match(idle.button.ariaLabel, /Couper le son/);
    assert.ok(
      Math.abs(idle.targets.firingFrequencyHz - idle.targets.engineRpm / 40) < 1e-12
    );
    assert.ok(idle.targets.estimatedPeakOutputGain < .04);

    await page.locator("#engineSoundButton").click();
    await page.waitForTimeout(30);
    const muted = await page.evaluate(
      () => window.__PORTANCE_TEST__.engineAudioReport()
    );
    assert.equal(muted.enabled, false);
    assert.equal(muted.button.pressed, "false");
    assert.match(muted.button.ariaLabel, /Activer le son/);

    await page.locator("#engineSoundButton").click();
    await page.waitForTimeout(100);
    const enabled = await page.evaluate(
      () => window.__PORTANCE_TEST__.engineAudioReport()
    );
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.started, true);
    assert.equal(enabled.error, "");
    assert.ok(["running", "suspended"].includes(enabled.contextState));
    assert.equal(enabled.button.pressed, "true");
    assert.match(enabled.button.ariaLabel, /Couper le son/);

    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.setControls({ throttleTarget: .85 });
      api.advance(4);
    });
    await page.waitForTimeout(100);
    const loaded = await page.evaluate(
      () => window.__PORTANCE_TEST__.engineAudioReport()
    );
    assert.ok(loaded.targets.engineRpm > idle.targets.engineRpm);
    assert.ok(loaded.targets.firingFrequencyHz > idle.targets.firingFrequencyHz);
    assert.ok(loaded.targets.mechanicalFrequencyHz > idle.targets.mechanicalFrequencyHz);
    assert.ok(loaded.targets.lowpassFrequencyHz > idle.targets.lowpassFrequencyHz);
    assert.ok(loaded.targets.estimatedPeakOutputGain < .04);
  });

  await t.test("×2 double le temps simulé sans changer le pas ni la trajectoire", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const run = (scale, wallSeconds) => {
        api.reset({ x: 200, y: 200, heading: 0 });
        api.selectTimeScale(scale);
        api.setControls({
          throttleTarget: .55,
          rudderTarget: 14 * Math.PI / 180
        });
        const state = api.advanceWall(wallSeconds);
        return {
          motion: state.motion,
          contacts: state.contacts,
          propulsion: state.propulsion,
          simulatedSeconds: state.timing.simulatedSeconds,
          acousticFrequencyHz: api.engineAudioReport().targets.firingFrequencyHz
        };
      };
      const normal = run(1, 8);
      const accelerated = run(2, 4);
      const report = api.timeScaleReport();
      const theme = api.visualThemeReport();

      api.reset({ x: 200, y: 200, heading: 0 });
      api.selectTimeScale(2);
      api.setControls({
        throttleTarget: .6,
        rudderTarget: 18 * Math.PI / 180
      });
      const start = performance.now();
      api.advanceWall(1);
      const benchmarkMilliseconds = performance.now() - start;
      return {
        normal,
        accelerated,
        report,
        theme,
        benchmarkMilliseconds
      };
    });

    assert.deepEqual(result.accelerated.motion, result.normal.motion);
    assert.deepEqual(result.accelerated.contacts, result.normal.contacts);
    assert.deepEqual(result.accelerated.propulsion, result.normal.propulsion);
    assert.equal(
      result.accelerated.acousticFrequencyHz,
      result.normal.acousticFrequencyHz,
      "×2 a artificiellement doublé la hauteur du son moteur"
    );
    assert.ok(Math.abs(result.normal.simulatedSeconds - 8) < 1e-12);
    assert.equal(
      result.accelerated.simulatedSeconds,
      result.normal.simulatedSeconds
    );
    assert.equal(result.report.scale, 2);
    assert.equal(result.report.fixedDt, 1 / 120);
    assert.equal(result.report.physicsStepsPerRealSecond, 240);
    assert.equal(result.report.calculationPolicy, "full-fixed-step");
    assert.equal(result.report.degradedPhysics, false);
    assert.equal(result.report.button.text, "×2");
    assert.equal(result.report.button.pressed, "true");
    assert.match(result.report.button.ariaLabel, /vitesse normale/);
    assert.equal(result.report.playerHull, result.report.acceleratedPlayerHull);
    assert.notEqual(result.report.playerHull, result.report.normalPlayerHull);
    assert.equal(result.theme.boat.activePlayerHull, result.theme.boat.acceleratedHull);
    assert.ok(
      result.benchmarkMilliseconds < 250,
      `×2 trop coûteux: ${result.benchmarkMilliseconds.toFixed(1)} ms pour une seconde réelle`
    );

    await page.locator("#timeScaleButton").click();
    const normalReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.timeScaleReport()
    );
    assert.equal(normalReport.scale, 1);
    assert.equal(normalReport.button.pressed, "false");
    assert.equal(normalReport.playerHull, normalReport.normalPlayerHull);
  });

  await t.test("les vitesses affichées sont signées selon l'erre du bateau", async () => {
    const readDisplays = async () => {
      await page.waitForTimeout(50);
      return {
        sog: await page.locator("#sogValue").textContent(),
        stw: await page.locator("#stwValue").textContent()
      };
    };
    const parseDisplay = value => Number(
      value.replace("−", "-").replace(",", ".")
    );

    const ahead = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 200, y: 200, heading: 0 });
      api.setControls({ throttleTarget: 0.5 });
      return api.advance(5);
    });
    const aheadDisplay = await readDisplays();
    assert.match(aheadDisplay.sog, /^\+/);
    assert.match(aheadDisplay.stw, /^\+/);
    assert.ok(
      Math.abs(parseDisplay(aheadDisplay.sog) - ahead.signedGroundSpeed / 0.514444) <= 0.051
    );
    assert.ok(
      Math.abs(parseDisplay(aheadDisplay.stw) - ahead.signedWaterSpeed / 0.514444) <= 0.051
    );

    const astern = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 200, y: 200, heading: 0 });
      api.setControls({ throttleTarget: -0.5 });
      return api.advance(5);
    });
    const asternDisplay = await readDisplays();
    assert.match(asternDisplay.sog, /^−/);
    assert.match(asternDisplay.stw, /^−/);
    assert.ok(
      Math.abs(parseDisplay(asternDisplay.sog) - astern.signedGroundSpeed / 0.514444) <= 0.051
    );
    assert.ok(
      Math.abs(parseDisplay(asternDisplay.stw) - astern.signedWaterSpeed / 0.514444) <= 0.051
    );

    await page.evaluate(() => window.__PORTANCE_TEST__.reset(
      { x: 200, y: 200, heading: 0 }
    ));
    const stoppedDisplay = await readDisplays();
    assert.equal(stoppedDisplay.sog, "0,0");
    assert.equal(stoppedDisplay.stw, "0,0");
  });

  await t.test("aucun bateau ne chevauche un ponton, un catway ou un autre bateau", async () => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.geometryReport());
    assert.equal(report.ok, true, report.failures.join("\n"));
    assert.deepEqual(report.counts, {
      docks: 5,
      catways: 30,
      mooringCleats: 226,
      staticBoats: 18,
      scenarios: 10
    });
    assert.equal(report.connections.length, 30);
    assert.ok(report.connections.every(connection => (
      connection.overlap >= .095
      && connection.overlap <= .255
      && Math.abs(connection.renderedOverlap) <= .005
      && Number.isFinite(connection.deckGap)
    )));
    const flushConnections = report.connections.filter(connection => connection.connector === "flush");
    const hingeConnections = report.connections.filter(connection => connection.connector === "hinge");
    assert.equal(flushConnections.length, 24);
    assert.equal(hingeConnections.length, 6);
    assert.equal(
      report.connections.some(connection => connection.connector === "ramp"),
      false,
      "aucune rampe ne doit être inventée"
    );
    assert.ok(flushConnections.every(connection => connection.surfaceOpeningWidth >= .7));
    assert.ok(hingeConnections.every(connection => (
      connection.deckGap > .08
      && connection.surfaceOpeningWidth === 0
    )));
  });

  await t.test("les taquets du port sont métriques, réalistes et référencés", async () => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.geometryReport().mooring);
    assert.equal(report.ok, true, report.failures.join("\n"));
    assert.equal(report.count, 226);
    assert.equal(report.catwayCleats, 180);
    assert.equal(report.pontoonCleats, 40);
    assert.equal(report.initialLines.length, 10);
    assert.ok(report.initialLines.every(line => line.length <= 20));

    const parents = new Map([
      ...portTopology.structures.docks,
      ...portTopology.structures.catways
    ].map(structure => [structure.id, structure]));
    const ids = new Set();
    for (const cleat of portTopology.structures.mooringCleats) {
      assert.equal(ids.has(cleat.id), false, `taquet dupliqué ${cleat.id}`);
      ids.add(cleat.id);
      assert.ok(["catway", "ponton", "quay"].includes(cleat.kind));
      assert.ok([cleat.x, cleat.y, cleat.z, cleat.orientation].every(Number.isFinite));
      const parent = parents.get(cleat.parentId);
      assert.ok(parent, `parent absent pour ${cleat.id}`);
      assert.ok(Math.abs(cleat.x - parent.x) <= parent.w / 2 + 1e-9);
      assert.ok(Math.abs(cleat.y - parent.y) <= parent.h / 2 + 1e-9);
    }
    for (const catway of portTopology.structures.catways) {
      const cleats = portTopology.structures.mooringCleats.filter(
        cleat => cleat.parentId === catway.id
      );
      assert.equal(cleats.length, 6);
      assert.deepEqual(
        [...new Set(cleats.map(cleat => cleat.edge))].sort(),
        ["north", "south"]
      );
      assert.deepEqual(
        [...new Set(cleats.map(cleat => cleat.station))].sort(),
        ["mid", "root", "tip"]
      );
    }
  });

  await t.test("les départs au ponton restaurent deux aussières viscoélastiques", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const states = {};
      for (const id of ["dockForward", "dockReverse", "reverse", "mooring", "approach", "free"]) {
        states[id] = api.loadScenario(id).moorings.current;
      }
      api.loadScenario("dockForward");
      api.clearMoorings();
      const cleared = api.snapshot().moorings.current.length;
      const restored = api.loadScenario("dockForward").moorings.current;
      return {
        states,
        cleared,
        restored,
        policy: {
          attachBelow: api.mooringActionAllowed("attach", .5999),
          attachAtLimit: api.mooringActionAllowed("attach", .6),
          detachAt: api.mooringActionAllowed("detach", 3),
          detachAbove: api.mooringActionAllowed("detach", 3.00001)
        }
      };
    });
    for (const id of ["dockForward", "dockReverse", "reverse", "mooring"]) {
      assert.equal(result.states[id].length, 2, `${id}: deux aussières attendues`);
      assert.ok(result.states[id].every(line => line.length <= 20 && line.taut));
    }
    assert.equal(result.states.approach.length, 0);
    assert.equal(result.states.free.length, 0);
    assert.equal(result.cleared, 0);
    assert.equal(result.restored.length, 2);
    assert.equal(result.policy.attachBelow.ok, true);
    assert.equal(result.policy.attachAtLimit.ok, false);
    assert.equal(result.policy.detachAt.ok, true);
    assert.equal(result.policy.detachAbove.ok, false);
  });

  await t.test("les pendilles intégrées se prennent, deviennent porteuses puis se libèrent immédiatement", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const departure = api.loadScenario("medDeparture");
      const strongWind = api.replayPendilleStrongWind();
      api.loadScenario("medDeparture");
      const initial = {
        pendilles: departure.pendilles,
        lines: departure.moorings.current,
        phase: departure.scenario.phase,
        windSpeedKn: departure.environment.windSpeedKn,
        strongWindSpeedKn: strongWind.environment.windSpeedKn,
        replayButtonHidden: document.querySelector("#strongWindReplay").hidden
      };
      const released = api.releasePendille("pendille-med-2");
      const clear = released.snapshot.pendilles.find(item => item.id === "pendille-med-2");
      api.reset({ x: -90, y: 37.5, heading: -Math.PI / 2 });
      const pickup = api.pickupPendille("pendille-med-2", "bow-starboard");
      const secured = api.advance(12);
      return {
        initial,
        released: released.result,
        clear,
        pickup: pickup.result,
        securedPendille: secured.pendilles.find(item => item.id === "pendille-med-2"),
        securedLine: secured.moorings.current.find(line => line.sourceType === "pendille")
      };
    });
    assert.equal(result.initial.pendilles.length, 3);
    assert.equal(result.initial.pendilles.find(item => item.id === "pendille-med-2").state, "secured");
    assert.equal(result.initial.lines.filter(line => line.sourceType === "pendille").length, 1);
    assert.equal(result.initial.phase, "release-leeward");
    assert.equal(result.initial.windSpeedKn, 10);
    assert.equal(result.initial.strongWindSpeedKn, 15);
    assert.equal(result.initial.replayButtonHidden, true);
    assert.equal(result.released.ok, true);
    assert.equal(result.clear.state, "available");
    assert.equal(result.clear.danger, false);
    assert.equal(result.pickup.ok, true);
    assert.equal(result.securedPendille.state, "secured");
    assert.equal(result.securedLine.sourceType, "pendille");
    assert.equal(result.securedLine.workingLoadN, 12000);
    assert.ok(result.securedLine.maximumLength > 20);
  });

  await t.test("la calibration experte règle effectivement le seuil de pose des aussières", async () => {
    const expert = page.locator("#expertDetails");
    await expert.evaluate(element => {
      element.open = true;
    });
    const input = page.locator("#mooringAttachSpeed");
    assert.equal(await input.inputValue(), "0.6");
    assert.equal(
      await page.locator('[data-value-for="mooringAttachSpeed"]').textContent(),
      "0,6 nd"
    );

    await input.evaluate(element => {
      element.value = "0.7";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const calibrated = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      return {
        below: api.mooringActionAllowed("attach", .6999),
        atLimit: api.mooringActionAllowed("attach", .7),
        report: api.mooringReport()
      };
    });
    assert.equal(calibrated.below.ok, true);
    assert.equal(calibrated.below.maximum, .7);
    assert.equal(calibrated.atLimit.ok, false);
    assert.equal(calibrated.report.policy.attachSpeedKn, .7);
    assert.equal(
      await page.locator('[data-value-for="mooringAttachSpeed"]').textContent(),
      "0,7 nd"
    );

    await input.evaluate(element => {
      element.value = "0.6";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(
      (await page.evaluate(
        () => window.__PORTANCE_TEST__.mooringReport()
      )).policy.attachSpeedKn,
      .6
    );
  });

  await t.test("un taquet du bateau accepte deux aussières et refuse la troisième", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("dockForward");
      api.clearMoorings();
      const initial = api.mooringReport();
      const boat = initial.boatCleats.find(cleat => cleat.id === "bow-port");
      const shores = initial.shoreCleats
        .map(cleat => ({
          id: cleat.id,
          distance: Math.hypot(
            cleat.world[0] - boat.world[0],
            cleat.world[1] - boat.world[1],
            cleat.world[2] - boat.world[2]
          )
        }))
        .filter(cleat => cleat.distance <= initial.policy.maximumLength)
        .sort((left, right) => left.distance - right.distance);
      const afterFirst = api.attachMooring(boat.id, shores[0].id);
      const afterSecond = api.attachMooring(boat.id, shores[1].id);
      const afterThird = api.attachMooring(boat.id, shores[2].id);
      return { afterFirst, afterSecond, afterThird };
    });
    const cleatState = report => report.boatCleats.find(
      cleat => cleat.id === "bow-port"
    );
    assert.equal(result.afterFirst.lines.length, 1);
    assert.deepEqual(
      [cleatState(result.afterFirst).lineCount, cleatState(result.afterFirst).full],
      [1, false]
    );
    assert.equal(result.afterSecond.lines.length, 2);
    assert.deepEqual(
      [cleatState(result.afterSecond).lineCount, cleatState(result.afterSecond).full],
      [2, true]
    );
    assert.equal(result.afterThird.lines.length, 2);
    assert.equal(result.afterThird.policy.maximumLinesPerBoatCleat, 2);
  });

  await t.test("le défi 4 enseigne une sortie complète sur garde", async () => {
    const runs = await page.evaluate(() => {
      const runChallenge = () => {
        const api = window.__PORTANCE_TEST__;
        let state = api.loadScenario("mooring");
        const definition = api.scenarioReport().mooring;
        const challenge = definition.mooringChallenge;
        const phases = [state.scenario.phase];
        const initialLines = state.moorings.current.length;

        let report = api.attachMooring(
          challenge.springBoatCleatId,
          challenge.springShoreCleatId
        );
        const spring = report.lines.find(line => (
          line.boatCleatId === challenge.springBoatCleatId
          && line.shoreCleatId === challenge.springShoreCleatId
        ));
        const attached = {
          slack: spring.slack,
          taut: spring.taut,
          lines: report.lines.length
        };
        state = api.advance(1 / 120);
        phases.push(state.scenario.phase);

        for (const id of challenge.initialLineIds) api.detachMooring(id);
        state = api.advance(1 / 120);
        phases.push(state.scenario.phase);

        api.setMooringLength(spring.id, spring.distance);
        state = api.advance(2);
        phases.push(state.scenario.phase);

        api.setControls({ throttleTarget: -.4, rudderTarget: 0 });
        let reverseSeconds = 0;
        while (!state.scenario.challenge.pivotAchieved && reverseSeconds < 25) {
          state = api.advance(.25);
          reverseSeconds += .25;
        }
        phases.push(state.scenario.phase);
        const openingDeg = state.scenario.challenge.maximumOpeningDeg;

        api.setControls({ throttleTarget: 0, rudderTarget: 0 });
        let neutralSeconds = 0;
        while (
          (
            Math.abs(state.controls.throttleActual) > .05
            || state.groundSpeed / .514444 > challenge.safeReleaseSpeedKn
          )
          && neutralSeconds < 8
        ) {
          state = api.advance(.25);
          neutralSeconds += .25;
        }
        phases.push(state.scenario.phase);

        api.detachMooring(spring.id);
        state = api.advance(.1);
        phases.push(state.scenario.phase);

        api.setControls({
          throttleTarget: .15,
          rudderTarget: 10 * Math.PI / 180
        });
        let exitSeconds = 0;
        while (state.motion.x < 18 && exitSeconds < 35) {
          state = api.advance(.25);
          exitSeconds += .25;
        }
        api.setControls({ throttleTarget: 0, rudderTarget: 0 });
        while (!state.scenario.complete && exitSeconds < 50) {
          state = api.advance(.25);
          exitSeconds += .25;
        }

        return {
          initialLines,
          environment: definition.environment,
          attached,
          phases,
          reverseSeconds,
          neutralSeconds,
          exitSeconds,
          openingDeg,
          complete: state.scenario.complete,
          score: state.scenario.score,
          challenge: state.scenario.challenge,
          contacts: state.contacts,
          remainingLines: state.moorings.current.length,
          pose: state.motion
        };
      };
      return [runChallenge(), runChallenge()];
    });

    assert.deepEqual(runs[0], runs[1], "le défi d’aussières doit être déterministe");
    const result = runs[0];
    assert.equal(result.initialLines, 2);
    assert.deepEqual(result.environment, {
      windSpeedKn: 8,
      windFromDeg: 180,
      currentSpeedKn: 0,
      currentFromDeg: 0
    });
    assert.equal(result.attached.lines, 3);
    assert.ok(Math.abs(result.attached.slack - .8) < 1e-9);
    assert.equal(result.attached.taut, false);
    assert.deepEqual(result.phases, [
      "rig-spring",
      "release-lines",
      "take-up",
      "pivot",
      "neutral",
      "release-spring",
      "exit"
    ]);
    assert.ok(result.reverseSeconds <= 25);
    assert.ok(result.openingDeg >= 20 && result.openingDeg <= 35);
    assert.equal(result.challenge.safeRelease, true);
    assert.equal(result.challenge.unsafeReleases, 0);
    assert.equal(result.complete, true);
    assert.ok(result.score >= 80);
    assert.equal(result.contacts.severe, 0);
    assert.ok(result.contacts.maxImpact < .4);
    assert.equal(result.remainingLines, 0);
  });

  await t.test("clics souris et tactiles frappent, règlent puis larguent une aussière sans déplacer la caméra", async () => {
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("dockForward");
      api.clearMoorings();
      api.selectCameraView("top");
    });
    await page.waitForTimeout(80);
    const canvasBox = await page.locator("#scene").boundingBox();
    const beforeCamera = await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport());
    let report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    const boat = report.boatCleats.find(cleat => cleat.id === "bow-port");
    const shore = report.shoreCleats.find(
      cleat => cleat.id === "cleat-catway-central-east-9.5-south-tip"
    );
    assert.ok(boat.screen && shore.screen);

    await page.mouse.click(canvasBox.x + boat.screen.x, canvasBox.y + boat.screen.y);
    await page.mouse.click(canvasBox.x + shore.screen.x, canvasBox.y + shore.screen.y);
    await page.waitForTimeout(50);
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.equal(report.lines.length, 1);
    assert.ok(report.lines[0].length <= 20);
    const initialLength = report.lines[0].length;
    const middleOfLine = points => {
      if (points.length === 2) {
        return {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2
        };
      }
      const point = points[Math.floor(points.length / 2)];
      return { x: point.x, y: point.y };
    };
    let projectedLine = report.lines[0].projectedPoints;
    let linePoint = middleOfLine(projectedLine);

    await page.mouse.move(canvasBox.x + linePoint.x, canvasBox.y + linePoint.y);
    await page.mouse.down();
    await page.mouse.move(
      canvasBox.x + linePoint.x,
      canvasBox.y + linePoint.y - 80,
      { steps: 5 }
    );
    await page.mouse.up();
    await page.waitForTimeout(40);
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.equal(report.lines.length, 1, "un glissement ne doit pas larguer l'aussière");
    assert.ok(
      Math.abs(report.lines[0].targetLength - (initialLength + 2)) < 1e-8,
      "glisser vers le haut doit allonger l'aussière"
    );
    assert.equal(report.lines[0].length, initialLength, "le test est en pause");

    projectedLine = report.lines[0].projectedPoints;
    linePoint = middleOfLine(projectedLine);
    await page.mouse.move(canvasBox.x + linePoint.x, canvasBox.y + linePoint.y);
    await page.mouse.down();
    await page.mouse.move(
      canvasBox.x + linePoint.x,
      canvasBox.y + linePoint.y + 84,
      { steps: 7 }
    );
    await page.mouse.up();
    await page.waitForTimeout(40);
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.ok(
      Math.abs(report.lines[0].targetLength - (initialLength - .1)) < 1e-8,
      "glisser vers le bas doit raccourcir l'aussière"
    );

    const haulState = await page.evaluate(
      () => window.__PORTANCE_TEST__.advance(4)
    );
    assert.ok(
      haulState.groundSpeed <= .2 * .514444 + 1e-6,
      "la reprise seule a fait dépasser 0,2 nd au bateau"
    );
    await page.waitForTimeout(50);
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.ok(Math.abs(report.lines[0].length - report.lines[0].targetLength) < 1e-8);
    assert.ok(report.lines[0].distance <= report.lines[0].length + .00101);
    const afterCamera = await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport());
    assert.equal(afterCamera.yaw, beforeCamera.yaw);
    assert.equal(afterCamera.pitch, beforeCamera.pitch);
    assert.equal(afterCamera.distance, beforeCamera.distance);

    projectedLine = report.lines[0].projectedPoints;
    linePoint = middleOfLine(projectedLine);
    await page.mouse.click(canvasBox.x + linePoint.x, canvasBox.y + linePoint.y);
    await page.waitForTimeout(40);
    const detachState = await page.evaluate(() => ({
      report: window.__PORTANCE_TEST__.mooringReport(),
      snapshot: window.__PORTANCE_TEST__.snapshot(),
      toast: document.querySelector("#impactToast").textContent
    }));
    assert.equal(
      detachState.report.lines.length,
      0,
      JSON.stringify({
        speedKn: detachState.snapshot.groundSpeed / .514444,
        toast: detachState.toast,
        projectedPoints: detachState.report.lines[0]?.projectedPoints
      })
    );

    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("dockForward");
      api.clearMoorings();
      api.selectCameraView("top");
    });
    await page.waitForTimeout(50);
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    const touchBoat = report.boatCleats.find(cleat => cleat.id === "stern-port");
    const touchShore = report.shoreCleats.find(
      cleat => cleat.id === "cleat-catway-central-east-9.5-south-root"
    );
    const dispatchTouch = async (point, awayFrom) => {
      const dx = point.x - awayFrom.x;
      const dy = point.y - awayFrom.y;
      const distance = Math.hypot(dx, dy) || 1;
      const offsetX = dx / distance * 14;
      const offsetY = dy / distance * 14;
      await page.dispatchEvent("#scene", "pointerdown", {
        pointerId: 91,
        pointerType: "touch",
        button: 0,
        clientX: canvasBox.x + point.x + offsetX,
        clientY: canvasBox.y + point.y + offsetY
      });
      await page.dispatchEvent("#scene", "pointerup", {
        pointerId: 91,
        pointerType: "touch",
        button: 0,
        clientX: canvasBox.x + point.x + offsetX,
        clientY: canvasBox.y + point.y + offsetY
      });
    };
    await dispatchTouch(touchShore.screen, touchBoat.screen);
    await dispatchTouch(touchBoat.screen, touchShore.screen);
    await page.waitForTimeout(50);
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.equal(report.lines.length, 1, "la zone tactile élargie doit sélectionner les taquets");

    const middleBoat = report.boatCleats.find(cleat => cleat.id === "mid-port");
    await page.mouse.click(canvasBox.x + middleBoat.screen.x, canvasBox.y + middleBoat.screen.y);
    assert.ok((await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport())).selected);
    await page.keyboard.press("Escape");
    assert.equal(
      (await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport())).selected,
      null
    );
  });

  await t.test("les jauges compactes affichent et règlent séparément consigne et longueur actuelle", async () => {
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("dockForward");
      api.clearMoorings();
      api.selectCameraView("top");
    });
    await page.waitForTimeout(50);
    let empty = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.equal(empty.gauges.hidden, true);
    assert.equal(empty.gauges.chipHidden, true);
    assert.equal(empty.gauges.count, 0);

    const attached = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const report = api.mooringReport();
      const boat = report.boatCleats.find(cleat => cleat.id === "bow-port");
      const shore = report.shoreCleats
        .filter(cleat => cleat.screen)
        .sort((first, second) => {
          const firstDistance = Math.hypot(
            first.world[0] - boat.world[0],
            first.world[1] - boat.world[1]
          );
          const secondDistance = Math.hypot(
            second.world[0] - boat.world[0],
            second.world[1] - boat.world[1]
          );
          return firstDistance - secondDistance;
        })[0];
      return api.attachMooring(boat.id, shore.id);
    });
    assert.equal(attached.lines.length, 1);
    await page.waitForTimeout(40);
    let report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.equal(report.gauges.hidden, false);
    assert.equal(report.gauges.chipHidden, false);
    assert.equal(report.gauges.count, 1);
    assert.equal(report.gauges.columns, 3);
    assert.ok(Math.abs(report.gauges.panelWidth - report.gauges.chipWidth) < 0.5);
    assert.ok(report.gauges.itemHeight >= 155);
    assert.equal(report.gauges.items[0].markerShape, "triangles");
    assert.ok(Math.abs(
      Number(report.gauges.items[0].rangeMaximum)
      - Number(report.gauges.items[0].rangeMinimum)
      - 10
    ) < 1e-8);
    assert.equal(
      report.gauges.items[0].actual,
      report.lines[0].distance.toFixed(3)
    );

    const gauge = page.locator(".mooring-gauge").first();
    const gaugeBox = await gauge.boundingBox();
    const cameraBefore = await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport());
    const initialLength = report.lines[0].length;
    await page.mouse.move(gaugeBox.x + gaugeBox.width / 2, gaugeBox.y + gaugeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      gaugeBox.x + gaugeBox.width / 2,
      gaugeBox.y + gaugeBox.height / 2 - 40,
      { steps: 5 }
    );
    await page.mouse.up();
    await page.waitForTimeout(30);
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    const expectedTarget = Math.round((initialLength + 1) * 10) / 10;
    assert.ok(Math.abs(report.lines[0].targetLength - expectedTarget) < 1e-8);
    assert.equal(report.lines[0].length, initialLength, "la simulation en pause ne doit pas faire sauter la longueur actuelle");
    assert.equal(report.gauges.items[0].target, expectedTarget.toFixed(1));
    assert.equal(report.gauges.items[0].actual, report.lines[0].distance.toFixed(3));
    const cameraAfter = await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport());
    assert.equal(cameraAfter.yaw, cameraBefore.yaw);
    assert.equal(cameraAfter.pitch, cameraBefore.pitch);
    assert.equal(cameraAfter.distance, cameraBefore.distance);

    await page.evaluate(() => window.__PORTANCE_TEST__.advance(1));
    report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
    assert.ok(Math.abs(report.lines[0].length - report.lines[0].targetLength) < 1e-8);
    assert.equal(report.gauges.items[0].actual, report.lines[0].distance.toFixed(3));

    const overflow = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const used = new Map();
      while (api.mooringReport().lines.length < 7) {
        const current = api.mooringReport();
        const boat = current.boatCleats.find(cleat => !cleat.full);
        const shore = current.shoreCleats
          .map(cleat => ({
            cleat,
            distance: Math.hypot(
              cleat.world[0] - boat.world[0],
              cleat.world[1] - boat.world[1]
            )
          }))
          .filter(candidate => candidate.distance <= current.policy.maximumLength)
          .sort((first, second) => first.distance - second.distance)[used.get(boat.id) || 0];
        if (!shore) break;
        used.set(boat.id, (used.get(boat.id) || 0) + 1);
        api.attachMooring(boat.id, shore.cleat.id);
      }
      return api.mooringReport();
    });
    assert.equal(overflow.lines.length, 7);
    assert.equal(overflow.gauges.count, 7);
    assert.ok(overflow.gauges.clientHeight >= 330);
    assert.ok(overflow.gauges.scrollHeight > overflow.gauges.clientHeight);

    const maximum = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const line = api.mooringReport().lines[0];
      api.setMooringLength(line.id, 20);
      return api.mooringReport();
    });
    assert.equal(maximum.lines[0].targetLength, 20);
    assert.equal(Number(maximum.gauges.items[0].rangeMaximum), 20);
    assert.equal(Number(maximum.gauges.items[0].rangeMinimum), 10);
    assert.equal(Number(maximum.gauges.items[0].targetPosition), 0);
  });

  await t.test("les aussières restent lisibles dans les trois vues et les deux thèmes", async () => {
    for (const theme of ["dark", "chart"]) {
      await page.evaluate(selectedTheme => {
        const api = window.__PORTANCE_TEST__;
        api.loadScenario("dockForward");
        api.selectVisualTheme(selectedTheme);
      }, theme);
      for (const view of ["top", "anatomy", "skipper"]) {
        await page.evaluate(selectedView => {
          window.__PORTANCE_TEST__.selectCameraView(selectedView);
        }, view);
        await page.waitForTimeout(45);
        const report = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport());
        assert.equal(report.lines.length, 2);
        assert.ok(report.rendered.lines >= (view === "skipper" ? 1 : 2));
        assert.notEqual(report.colors.slack, report.colors.taut);
        assert.notEqual(report.colors.selected, report.colors.taut);
        assert.notEqual(report.colors.boatCleat, report.colors.boatCleatOutline);
        assert.notEqual(report.colors.boatCleat, report.colors.slack);
        assert.equal(
          report.lines.filter(line => line.projectedPoints.length >= 2).length,
          report.rendered.lines
        );
        assert.ok(report.rendered.cleats >= (view === "skipper" ? 2 : 6));
      }
    }
    await page.evaluate(() => {
      window.__PORTANCE_TEST__.selectVisualTheme("chart");
      window.__PORTANCE_TEST__.selectCameraView("top");
    });
  });

  await t.test("chaque intervalle offre deux postes et chaque bateau longe un catway", async () => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.geometryReport());
    assert.equal(report.berthing.ok, true, report.berthing.failures.join("\n"));
    assert.equal(report.berthing.occupiedSlotCount, 18);
    assert.ok(report.berthing.doubleOccupiedIntervals >= 3);
    assert.equal(report.berthing.catwayPitch, 9);
    assert.ok(Math.abs(report.berthing.berthOpening - 8.3) < 1e-9);
    assert.ok(
      report.berthing.referenceTwoBoatClearance
      >= report.berthing.minimumBetweenBoats
    );
    assert.equal(report.berthing.thirdReferenceBoatFits, false);
    assert.ok(report.berthing.minimumDoubleIntervalClearance >= .3);
    assert.ok(
      report.berthing.berthOpening < portTopology.referenceBoat.beam * 3,
      "trois Sun Odyssey tiennent encore entre deux catways"
    );

    const catwayById = new Map(
      portTopology.structures.catways.map(catway => [catway.id, catway])
    );
    const intervals = new Map();
    for (const boat of portTopology.staticBoats.filter(item => item.mooringType !== "pendille")) {
      assert.ok(["south", "north"].includes(boat.berthSlot));
      assert.ok(Number.isFinite(boat.berthRow));
      const catway = catwayById.get(boat.catwayId);
      assert.ok(catway, `${boat.id}: catway absent`);
      assert.equal(catway.berthSide, boat.berth);
      const lateralGap = (
        Math.abs(boat.y - catway.y)
        - boat.beam / 2
        - catway.h / 2
      );
      assert.ok(
        Math.abs(lateralGap - boat.fenderGap) < 1e-9,
        `${boat.id}: n'est pas contre son catway`
      );
      const key = `${boat.berth}:${boat.berthRow}`;
      const slots = intervals.get(key) || [];
      slots.push(boat.berthSlot);
      intervals.set(key, slots);
    }
    for (const slots of intervals.values()) {
      assert.ok(slots.length <= 2);
      assert.equal(new Set(slots).size, slots.length);
    }
    assert.ok(
      [...intervals.values()].some(slots => (
        slots.includes("south") && slots.includes("north")
      )),
      "aucun intervalle ne montre ses deux postes occupés"
    );
  });

  await t.test("Rejoindre sa place cible un poste libre contre le catway sud", async () => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.geometryReport());
    const target = report.berthing.targetBerth;
    const scenarios = await page.evaluate(
      () => window.__PORTANCE_TEST__.scenarioReport()
    );
    const goal = scenarios.approach.goal;
    assert.equal(target.id, "place-approche-pedagogique");
    assert.equal(target.berthSlot, "south");
    assert.equal(goal.berthId, target.id);
    assert.equal(goal.catwayId, target.catwayId);
    assert.ok(Math.hypot(goal.x - target.x, goal.y - target.y) < 1e-9);
    assert.notEqual(
      goal.y,
      target.berthRow,
      "la cible est encore au milieu des deux postes"
    );

    const completed = await page.evaluate(({ x, y, heading }) => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("approach");
      api.reset({ x, y, heading });
      return api.advance(1.5);
    }, goal);
    assert.equal(completed.scenario.complete, true);

    const oldMidpoint = await page.evaluate(({ heading, berthRow }) => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("approach");
      api.reset({ x: 7.25, y: berthRow, heading });
      return api.advance(1.5);
    }, { heading: goal.heading, berthRow: target.berthRow });
    assert.equal(oldMidpoint.scenario.complete, false);
  });

  await t.test("chaque place rejoint un chenal dimensionné pour le voilier", async () => {
    const navigation = await page.evaluate(
      () => window.__PORTANCE_TEST__.geometryReport().navigation
    );
    assert.equal(navigation.ok, true, navigation.failures.join("\n"));
    assert.equal(navigation.allBerthsAccessible, true);
    assert.equal(navigation.allExitLanesAccessible, true);
    assert.equal(navigation.berthRoutes.length, 18);
    assert.equal(navigation.exitLanes.length, 3);
    assert.ok(
      navigation.minimumFairway >= navigation.requiredFairway,
      `chenal ${navigation.minimumFairway} m < seuil ${navigation.requiredFairway} m`
    );
    assert.ok(
      navigation.berthOpening >= navigation.requiredBerthOpening,
      `place ${navigation.berthOpening} m < seuil ${navigation.requiredBerthOpening} m`
    );
    assert.ok(navigation.outerTurningDepth > navigation.designTurningDiameter);
  });

  await t.test("les sorties libèrent la place sans choc et quittent les pare-battages", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const runUntilFairway = (id, throttle, limitSeconds) => {
        let state = api.loadScenario(id);
        api.clearMoorings();
        api.setControls({ throttleTarget: throttle, rudderTarget: 0 });
        let elapsed = 0;
        while (state.motion.x < 20.2 && elapsed < limitSeconds) {
          state = api.advance(.5);
          elapsed += .5;
        }
        return {
          elapsed,
          x: state.motion.x,
          u: state.motion.u,
          impact: state.contacts.maxImpact,
          activeContacts: state.contacts.active
        };
      };
      return {
        forward: runUntilFairway("dockForward", .65, 35),
        reverse: runUntilFairway("dockReverse", -.8, 60)
      };
    });
    assert.ok(result.forward.x >= 20.2, `sortie avant arrêtée à ${result.forward.x} m`);
    assert.ok(result.reverse.x >= 20.2, `sortie arrière arrêtée à ${result.reverse.x} m`);
    assert.ok(result.forward.u > 0);
    assert.ok(result.reverse.u < 0);
    assert.ok(result.forward.impact <= .2);
    assert.ok(result.reverse.impact <= .2);
    assert.equal(result.forward.activeContacts, 0);
    assert.equal(result.reverse.activeContacts, 0);
  });

  await t.test("les situations commencent sans conditions et avec le seul appui statique attendu", async () => {
    const { report, initialContacts } = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const scenarios = api.scenarioReport();
      const contacts = {};
      for (const id of ["dockForward", "dockReverse", "approach"]) {
        api.loadScenario(id);
        contacts[id] = api.advance(1 / 120).contacts.active;
      }
      return { report: scenarios, initialContacts: contacts };
    });
    for (const required of ["dockForward", "dockReverse", "approach"]) {
      assert.ok(report[required], `situation absente: ${required}`);
    }
    assert.ok(initialContacts.dockForward <= 1, "dockForward: plusieurs contacts initiaux parasites");
    assert.ok(initialContacts.dockReverse <= 1, "dockReverse: plusieurs contacts initiaux parasites");
    assert.equal(initialContacts.approach, 0, "approach: contact initial parasite");
    for (const [id, scenario] of Object.entries(report)) {
      assert.equal(
        scenario.environment.windSpeedKn,
        id === "mooring" ? 8 : ["medDock", "medDeparture"].includes(id) ? 10 : 0,
        `${id}: vent initial inattendu`
      );
      assert.equal(scenario.environment.currentSpeedKn, 0, `${id}: courant initial non nul`);
    }
  });

  await t.test("invariants du corps rigide et du safran", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const initial = { x: 200, y: 200, heading: 0 };
      const stillStart = api.reset(initial);
      const stillEnd = api.advance(4);

      api.reset(initial);
      api.setControls({
        rudderTarget: 35 * Math.PI / 180,
        rudderActual: 35 * Math.PI / 180
      });
      const rudderWithoutFlow = api.advance(3);

      api.reset(initial);
      api.setControls({
        throttleTarget: .6,
        throttleActual: .6,
        rudderTarget: 30 * Math.PI / 180,
        rudderActual: 30 * Math.PI / 180
      });
      const rudderWithPropWash = api.advance(2.5);
      return { stillStart, stillEnd, rudderWithoutFlow, rudderWithPropWash };
    });

    assert.ok(Math.abs(result.stillEnd.motion.x - result.stillStart.motion.x) < 1e-9);
    assert.ok(Math.abs(result.stillEnd.motion.y - result.stillStart.motion.y) < 1e-9);
    assert.ok(Math.abs(result.stillEnd.motion.heading - result.stillStart.motion.heading) < 1e-9);
    assert.ok(Math.abs(result.rudderWithoutFlow.motion.heading) < 1e-9);
    assert.ok(Math.abs(result.rudderWithPropWash.motion.heading) > .01);
    assert.ok(result.rudderWithPropWash.groundSpeed > .08);
  });

  await t.test("le moteur scientifique est intégré avec une masse définie positive", async () => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.physicsReport());
    assert.equal(report.version, "5.2.0");
    const matrix = report.mass.matrix;
    assert.equal(matrix.length, 3);
    assert.equal(matrix[1][2], matrix[2][1]);
    assert.ok(matrix[0][0] > 0);
    assert.ok(matrix[0][0] * matrix[1][1] > 0);
    assert.ok(matrix[1][1] * matrix[2][2] - matrix[1][2] ** 2 > 0);
    assert.equal(report.profile.id, "sun-odyssey-36i-pedagogical");
    assert.equal(report.profile.version, "5.2.0");
    assert.equal(report.profile.schemaVersion, 3);
  });

  await t.test("franc-bord lisible et cotes visuelles indépendantes de la physique", async () => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.visualReport());
    assert.ok(report.renderedFreeboard >= 1, "le bateau paraît trop bas sur l'eau");
    assert.ok(report.playerCabinRoofZ > report.playerDeckZ + .5);
    assert.ok(report.bowMarkerX > 0, "le repère d'étrave doit être placé vers l'avant");
    assert.equal(report.physicsCanoeDraft, .68);
    assert.notEqual(report.renderedFreeboard, report.physicsCanoeDraft);
  });

  await t.test("non-régression marche avant: la barre ne renverse plus le bateau", async () => {
    const responses = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const initial = { x: 200, y: 200, heading: 0 };
      const values = {};
      for (const degrees of [0, 5, 15, 25, 35]) {
        api.reset(initial);
        api.setControls({
          throttleTarget: .5,
          rudderTarget: degrees * Math.PI / 180
        });
        values[degrees] = api.advance(5);
      }
      return values;
    });
    for (const degrees of [0, 5, 15, 25, 35]) {
      assert.ok(
        responses[degrees].motion.u > 0,
        `${degrees}° de barre a inversé la marche avant`
      );
      assert.ok(Number.isFinite(responses[degrees].propulsion.thrust));
    }
    assert.ok(Math.abs(responses[15].motion.r) > Math.abs(responses[5].motion.r));
    assert.ok(Math.abs(responses[25].motion.r) > Math.abs(responses[15].motion.r));
    assert.ok(Math.abs(responses[35].motion.r) > Math.abs(responses[25].motion.r));
    assert.ok(
      Math.abs(responses[35].motion.r) - Math.abs(responses[25].motion.r)
      < Math.abs(responses[15].motion.r) - Math.abs(responses[5].motion.r)
    );
    assert.ok(responses[15].diagnostics.pivotWaterX > 0);
  });

  await t.test("barre toute: le voilier sans propulseur conserve une avance", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      // Loin des ouvrages : ce test isole la giration hydrodynamique.
      const initial = { x: 200, y: 200, heading: 0 };
      api.reset(initial, { propWalk: 0 });
      api.setControls({
        throttleTarget: 1,
        rudderTarget: 35 * Math.PI / 180
      });
      const fullRudder = api.advance(30);

      api.reset(initial, { propWalk: 0 });
      api.setControls({ throttleTarget: 1, rudderTarget: 0 });
      const straight = api.advance(30);
      const profile = api.physicsReport().profile;
      return { fullRudder, straight, profile };
    });
    const radius = (
      result.fullRudder.groundSpeed
      / Math.abs(result.fullRudder.motion.r)
    );
    assert.equal(result.profile.configuration.bowThruster, false);
    assert.equal(result.profile.configuration.sternThruster, false);
    assert.ok(radius > result.profile.dimensions.lengthOverall * .5);
    assert.ok(result.fullRudder.motion.u > result.straight.motion.u * .4);
    assert.ok(
      result.fullRudder.forceParts.every(
        force => !/thruster|propulseur/i.test(force.name)
      )
    );
  });

  await t.test("effet de pas, inertie et entraînement par le courant", async () => {
    const result = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const initial = { x: 200, y: 200, heading: 0 };

      api.reset(initial, { propWalk: 1 });
      api.setControls({ throttleTarget: -.8, throttleActual: -.8 });
      const reverse = api.advance(1.5);

      api.reset(initial);
      api.setControls({ throttleTarget: .7, throttleActual: .7 });
      const powered = api.advance(2);
      api.setControls({ throttleTarget: 0 });
      const coasting = api.advance(.6);

      const currentStart = api.reset(initial, {
        currentSpeedKn: 1,
        currentFromDeg: 270
      });
      const currentEnd = api.advance(8);
      return { reverse, powered, coasting, currentStart, currentEnd };
    });

    assert.ok(result.reverse.motion.v > 0, "la poupe doit marcher vers bâbord en arrière");
    assert.ok(result.reverse.motion.r < 0, "le pas arrière doit faire abattre l'étrave à tribord");
    assert.ok(result.powered.groundSpeed > .1);
    assert.ok(result.coasting.groundSpeed > .08, "l'erre ne doit pas disparaître au neutre");
    assert.ok(result.currentEnd.motion.u > 0, "le courant d'ouest doit entraîner le bateau vers l'est");
    assert.ok(result.currentEnd.waterSpeed < result.currentStart.waterSpeed);
  });

  await t.test("seuils de contact des pare-battages", async () => {
    const classes = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      return [.1, .2, .21, .4, .41].map(speed => api.impactClass(speed));
    });
    assert.deepEqual(classes, ["safe", "safe", "warning", "warning", "severe"]);
  });

  await t.test("le cran neutre interdit une inversion sur un appui continu", async () => {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await page.locator("#scene").focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.evaluate(() => {
      for (let index = 0; index < 8; index++) {
        window.dispatchEvent(new KeyboardEvent("keydown", {
          key: "ArrowDown",
          repeat: index > 0,
          cancelable: true
        }));
      }
    });
    await page.waitForTimeout(50);
    assert.equal(await page.locator("#throttleLabel").textContent(), "Neutre");
    assert.match(await page.locator("#neutralGate").textContent(), /relâchez/);

    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", {
      key: "ArrowDown"
    })));
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(50);
    assert.match(await page.locator("#throttleLabel").textContent(), /Arrière/);
  });

  await t.test("Q commande l'avant et W l'arrière sur clavier AZERTY", async () => {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await page.locator("#scene").focus();
    await page.keyboard.press("q");
    let snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, .05);
    await page.waitForFunction(() => (
      document.querySelector("#throttleLabel")?.textContent === "Avant · 5 %"
    ));
    assert.equal(await page.locator("#throttleLabel").textContent(), "Avant · 5 %");
    await page.keyboard.press("Q");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, .1);

    await page.evaluate(() => {
      for (let index = 0; index < 5; index += 1) {
        window.dispatchEvent(new KeyboardEvent("keydown", {
          key: "w",
          repeat: index > 0,
          cancelable: true
        }));
      }
    });
    await page.waitForTimeout(60);
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, 0);
    assert.match(await page.locator("#neutralGate").textContent(), /relâchez/);

    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", {
      key: "w",
      cancelable: true
    })));
    await page.keyboard.press("W");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, -.1);
    assert.match(await page.locator(".keyboard-help").textContent(), /Q.*W/s);
  });

  await t.test("la silhouette de collision reprend exactement le rayon physique des pare-battages", async () => {
    const visual = await page.evaluate(() => window.__PORTANCE_TEST__.visualReport());
    assert.equal(visual.collision.fenderRadius, visual.physicsFenderRadius);
    assert.equal(visual.fender.model, "vertical-rectangular-panel");
    assert.equal(visual.fender.radius, visual.physicsFenderRadius);
    assert.ok(visual.fender.width > 0 && visual.fender.thickness > 0);
    assert.equal(visual.fender.width, .35);
    assert.equal(visual.fender.thickness, .35);
    assert.equal(visual.fender.radius, .175);
    assert.ok(visual.fender.height >= visual.fender.radius * 2);
    assert.equal(visual.fender.thickness, visual.fender.radius * 2);
    assert.ok(visual.fender.clearances.every(item => Math.abs(item.gap) <= .021));
    assert.equal(visual.renderer.webgl2, true);
    assert.ok(visual.renderer.depthBits >= 16);
    assert.equal(visual.renderer.painterFallback, false);
    assert.equal(visual.renderer.depthEncoding, "logarithmic");
    assert.ok(visual.renderer.polygonLayerDepthStep >= 1e-4);
    assert.equal(visual.renderer.triangulationFailures, 0);
    assert.ok(visual.renderer.farClipMeters >= 6000);
    assert.equal(visual.flow.wind.shape, "straight");
    assert.equal(visual.flow.current.shape, "wave");
    assert.ok(visual.flow.current.amplitudeMeters >= .2);
    assert.ok(visual.collision.hullHaloWidth >= 6);
    assert.ok(visual.collision.hullOutlineWidth >= 2.5);
    assert.ok(visual.collision.skipperOutlineWidth > visual.collision.hullOutlineWidth);
    assert.deepEqual(visual.boatMesh, {
      cockpit: "recessed-ring",
      overlappingCockpitSurfaces: false
    });
  });

  await t.test("le pipeline WebGL réutilise ses caches et limite les uploads par image", async () => {
    await page.waitForTimeout(120);
    const performanceReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.renderPerformanceReport()
    );
    assert.ok(performanceReport.sampleCount > 0);
    assert.equal(performanceReport.interpolation, "fixed-step-visual");
    assert.equal(performanceReport.cameraSmoothing, "time-based");
    assert.equal(performanceReport.lastFrameVisibilityComputations, 1);
    assert.ok(performanceReport.staticGeometryCacheEntries > 0);
    assert.ok(performanceReport.staticCacheHits > 0);
    assert.ok(performanceReport.precomputedBoxGeometries > 0);
    assert.ok(performanceReport.precomputedShoreCleats > 0);
    assert.ok(performanceReport.renderer.drawCalls <= 4);
    assert.equal(
      performanceReport.renderer.bufferUploads,
      performanceReport.renderer.drawCalls
    );
  });

  await t.test("une ligne pointillée projetée hors écran ne peut plus saturer le rendu", async () => {
    const report = await page.evaluate(
      () => window.__PORTANCE_TEST__.rendererGuardReport()
    );
    assert.equal(report.fallback, undefined);
    assert.equal(report.finite, true);
    assert.equal(report.dashLimitHits, 0);
    assert.equal(report.acceptedLineSegments, 1);
    assert.equal(report.rejectedLineSegments, 0);
    assert.ok(report.floats > 0);
    assert.ok(
      report.triangles <= report.maximumDashSegments * 2,
      "la tessellation doit rester strictement bornée"
    );
    assert.ok(
      report.floats < 25000,
      `trop de données générées après clipping: ${report.floats} flottants`
    );
  });

  await t.test("les bouées suivent les couleurs et formes IALA A", async () => {
    const report = await page.evaluate(() => {
      const appearance = window.__PORTANCE_TEST__.buoyAppearanceReport;
      return {
        port: appearance({ seamarkType: "buoy_lateral", category: "port", colours: ["green"], shape: "conical" }),
        starboard: appearance({ seamarkType: "buoy_lateral", category: "starboard", colours: ["red"], shape: "can" }),
        north: appearance({ seamarkType: "buoy_cardinal", category: "north" }),
        east: appearance({ seamarkType: "buoy_cardinal", category: "east" }),
        south: appearance({ seamarkType: "buoy_cardinal", category: "south" }),
        west: appearance({ seamarkType: "buoy_cardinal", category: "west" }),
        isolatedDanger: appearance({ seamarkType: "buoy_isolated_danger" }),
        safeWater: appearance({ seamarkType: "buoy_safe_water" }),
        special: appearance({ seamarkType: "buoy_special_purpose" })
      };
    });
    assert.deepEqual(report.port, { shape: "can", colours: ["red"] });
    assert.deepEqual(report.starboard, { shape: "conical", colours: ["green"] });
    assert.deepEqual(report.north.colours, ["yellow", "black"]);
    assert.deepEqual(report.east.colours, ["black", "yellow", "black"]);
    assert.deepEqual(report.south.colours, ["black", "yellow"]);
    assert.deepEqual(report.west.colours, ["yellow", "black", "yellow"]);
    assert.deepEqual(report.isolatedDanger.colours, ["black", "red", "black"]);
    assert.deepEqual(report.safeWater.colours, ["red", "white", "red", "white"]);
    assert.deepEqual(report.special.colours, ["yellow"]);
  });

  await t.test("les flèches pilotent toujours le bateau après clic sur un paramètre", async () => {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    const wind = page.locator("#windSpeed");
    await wind.click();
    const windBefore = await wind.inputValue();
    await page.keyboard.press("ArrowUp");
    let snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, .05);
    assert.equal(await wind.inputValue(), windBefore, "la flèche a modifié le curseur de vent");

    await page.locator("#anatomyButton").click();
    await page.keyboard.press("ArrowRight");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.ok(snapshot.controls.rudderTarget < 0);
    assert.equal(
      await page.locator("#anatomyButton").getAttribute("aria-pressed"),
      "true"
    );
  });

  await t.test("commandes tactiles façon jeu: glissement persistant et cran neutre", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));

    const layout = await page.evaluate(() => {
      const helm = document.querySelector(".touch-helm").getBoundingClientRect();
      const engine = document.querySelector(".touch-engine").getBoundingClientRect();
      const desktop = document.querySelector(".control-dock").getBoundingClientRect();
      const slider = document.querySelector("#touchHelmSlider").getBoundingClientRect();
      const button = document.querySelector("#touchThrottleUp").getBoundingClientRect();
      return {
        helm: { left: helm.left, right: helm.right, width: helm.width },
        engine: { left: engine.left, right: engine.right, width: engine.width },
        desktopVisible: desktop.width > 0 && desktop.height > 0,
        slider: { width: slider.width, height: slider.height },
        button: { width: button.width, height: button.height },
        middle: innerWidth / 2
      };
    });
    assert.ok(layout.helm.right < layout.middle);
    assert.ok(layout.engine.left > layout.middle);
    assert.equal(layout.desktopVisible, false);
    assert.ok(layout.slider.width >= 90 && layout.slider.height >= 44);
    assert.ok(layout.button.width >= 52 && layout.button.height >= 52);

    const helmSlider = page.locator("#touchHelmSlider");
    const helmBox = await helmSlider.boundingBox();
    const helmY = helmBox.y + helmBox.height / 2;
    await page.mouse.move(helmBox.x + helmBox.width / 2, helmY);
    await page.mouse.down();
    await page.mouse.move(helmBox.x + helmBox.width * .08, helmY, { steps: 8 });
    await page.mouse.up();
    let snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.ok(snapshot.controls.rudderTarget >= 20 * Math.PI / 180);
    const heldRudder = snapshot.controls.rudderTarget;
    await page.waitForTimeout(180);
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(
      snapshot.controls.rudderTarget,
      heldRudder,
      "la barre s'est recentrée après relâchement"
    );

    await page.mouse.move(helmBox.x + helmBox.width * .08, helmY);
    await page.mouse.down();
    await page.mouse.move(helmBox.x + helmBox.width * .92, helmY, { steps: 10 });
    await page.mouse.up();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.ok(snapshot.controls.rudderTarget <= -20 * Math.PI / 180);

    await page.locator("#touchCenterRudder").click();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.rudderTarget, 0);

    await page.evaluate(() => window.__PORTANCE_TEST__.setControls({
      throttleTarget: .1
    }));
    const throttleDown = page.locator("#touchThrottleDown");
    const throttleBox = await throttleDown.boundingBox();
    await page.mouse.move(
      throttleBox.x + throttleBox.width / 2,
      throttleBox.y + throttleBox.height / 2
    );
    await page.mouse.down();
    await page.waitForTimeout(520);
    await page.mouse.up();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, 0, "le maintien a traversé le neutre");

    await throttleDown.click();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, -.1);
    await page.locator("#touchThrottleNeutral").click();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, 0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(100);
  });

  await t.test("les trois situations rejouent leur trajectoire étalon exactement", async () => {
    assert.equal(trajectoryFixture.profileId, "sun-odyssey-36i-pedagogical");
    assert.equal(trajectoryFixture.profileVersion, "5.2.0");
    assert.equal(trajectoryFixture.physicsVersion, "5.1.0");
    const trajectories = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const scripts = {
        dockForward: { throttle: .4, rudder: -8 * Math.PI / 180 },
        dockReverse: { throttle: -.4, rudder: -8 * Math.PI / 180 },
        approach: { throttle: .3, rudder: 5 * Math.PI / 180 }
      };
      const replay = id => {
        api.loadScenario(id);
        api.clearMoorings();
        api.setControls({
          throttleTarget: scripts[id].throttle,
          rudderTarget: scripts[id].rudder
        });
        const points = [];
        for (let second = 1; second <= 6; second++) {
          const state = api.advance(1);
          points.push({
            second,
            x: Number(state.motion.x.toFixed(9)),
            y: Number(state.motion.y.toFixed(9)),
            heading: Number(state.motion.heading.toFixed(9)),
            u: Number(state.motion.u.toFixed(9)),
            v: Number(state.motion.v.toFixed(9)),
            r: Number(state.motion.r.toFixed(9)),
            impact: Number(state.contacts.maxImpact.toFixed(9))
          });
        }
        return points;
      };
      return Object.fromEntries(
        Object.keys(scripts).map(id => [id, [replay(id), replay(id)]])
      );
    });
    const mismatches = {};
    for (const [id, [first, second]] of Object.entries(trajectories)) {
      assert.deepEqual(first, second, `${id}: trajectoire non déterministe`);
      assert.ok(first.every(point => Object.values(point).every(Number.isFinite)));
      if (JSON.stringify(first) !== JSON.stringify(trajectoryFixture.trajectories[id])) {
        mismatches[id] = first;
      }
    }
    assert.deepEqual(
      mismatches,
      {},
      `écart à la trajectoire étalon; toute mise à jour doit être justifiée dans le rapport\n${JSON.stringify(mismatches)}`
    );
  });

  await t.test("non-régression finale hors ligne, ordinateur et mobile", async () => {
    const html = fs.readFileSync(simulatorPath, "utf8");
    const topologySource = fs.readFileSync(topologyPath, "utf8");
    assert.doesNotMatch(html, /https?:\/\//);
    assert.doesNotMatch(html, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);
    assert.doesNotMatch(topologySource, /https?:\/\//);
    assert.doesNotMatch(topologySource, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);

    await page.goto(simulatorUrl.href);
    await page.waitForTimeout(500);
    const desktopImage = await page.locator(".stage").screenshot();
    const desktop = await page.evaluate(() => {
      const canvas = document.querySelector("#worldScene");
      const options = Array.from(document.querySelectorAll("#scenarioSelect option"))
        .map(option => option.value);
      return {
        canvas: { width: canvas.width, height: canvas.height },
        options,
        wind: document.querySelector("#windChipValue").textContent,
        current: document.querySelector("#currentChipValue").textContent,
        rpm: document.querySelector("#rpmValue").textContent,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    assert.ok(desktop.canvas.width > 700 && desktop.canvas.height > 500);
    assert.ok(desktopImage.length > 20_000, "la scène 3D paraît vide ou uniforme");
    assert.deepEqual(
      desktop.options.slice(0, 3),
      ["dockForward", "dockReverse", "approach"]
    );
    assert.ok(desktop.options.includes("mooring"));
    assert.ok(desktop.options.includes("medDock"));
    assert.ok(desktop.options.includes("medDeparture"));
    assert.match(desktop.wind, /^0(?:,0)? nd$/);
    assert.match(desktop.current, /^0(?:,0)? nd$/);
    assert.match(desktop.rpm, /^\d+$/);
    assert.equal(desktop.overflow, false);

    await page.screenshot({ path: "/tmp/simulateur-port-non-regression-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobile = await page.evaluate(() => {
      const controls = document.querySelector(".touch-controls").getBoundingClientRect();
      const lesson = document.querySelector(".lesson-card").getBoundingClientRect();
      const overlap = !(
        controls.right < lesson.left
        || controls.left > lesson.right
        || controls.bottom < lesson.top
        || controls.top > lesson.bottom
      );
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        overlap,
        controlsInside: controls.left >= 0 && controls.right <= innerWidth,
        visible: controls.width > 0 && controls.height > 0
      };
    });
    assert.equal(mobile.overflow, false);
    assert.equal(mobile.overlap, false);
    assert.equal(mobile.controlsInside, true);
    assert.equal(mobile.visible, true);
    await page.screenshot({ path: "/tmp/simulateur-port-non-regression-mobile.png" });
    assert.deepEqual(runtimeErrors, []);
  });

  await browser.close();
});
