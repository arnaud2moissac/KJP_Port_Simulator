"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCatalogs } = require("../scripts/localization-assets.js");
const Codec = require("../src/ports/kjp-codec.js");
const catalogs = loadCatalogs();
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { instrumentPage } = require("./helpers/browser-harness.js");
const url = pathToFileURL(path.resolve(__dirname, "../simulateur-port.html")).href + "?test=1&renderer=canvas";

test("French and English are complete offline and language switches preserve state", { timeout: 240000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [browserLocale, expected] of [["fr-FR", "fr"], ["en-GB", "en"], ["zz-ZZ", "fr"]]) {
      const context = await browser.newContext({ locale: browserLocale, viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
      const page = await instrumentPage(await context.newPage(), true);
      const errors = [], network = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("https://www.googletagmanager.com/**", route => route.fulfill({ status: 200, body: "", contentType: "application/javascript" }));
      page.on("request", request => { if (/https?:/.test(request.url()) && !request.url().includes("googletagmanager")) network.push(request.url()); });
      await page.goto(url, { timeout: 60000 });
      await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
      assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.localeReport())).locale, expected);
      if (browserLocale === "en-GB") {
        const assertEnglish = async () => {
          const surface = await page.evaluate(() => [
            document.body.innerText,
            ...Array.from(document.querySelectorAll("[aria-label], [aria-valuetext], [title]"))
              .flatMap(element => ["aria-label", "aria-valuetext", "title"].map(attribute => element.getAttribute(attribute) || ""))
          ].join("\n"));
          const french = catalogs.find(c => c.code === "fr").messages;
          const english = catalogs.find(c => c.code === "en").messages;
          for (const [key, value] of Object.entries(french)) {
            if (typeof value !== "string" || value === english[key] || value.length < 12 || /\{/.test(value)) continue;
            assert.equal(surface.includes(value), false, `French text remains: ${key}`);
          }
        };
        for (const language of ["fr", "en"]) {
          await page.evaluate(code => window.__PORTANCE_TEST__.selectLocale(code), language);
          const scenarios = await page.evaluate(() => Object.keys(window.__PORTANCE_TEST__.scenarioReport()));
          for (const id of scenarios) {
            const lesson = await page.evaluate(id => {
              const api = window.__PORTANCE_TEST__;
              api.loadScenario(id);
              return { title: document.querySelector("#lessonTitle").textContent, copy: document.querySelector("#lessonCopy").textContent };
            }, id);
            const catalog = catalogs.find(c => c.code === language).messages;
            assert.equal(lesson.title, catalog[`scenario.${id}.title`]);
            assert.equal(lesson.copy, catalog[`scenario.${id}.copy`]);
            if (language === "en") await assertEnglish();
          }
        }
        const preserved = await page.evaluate(() => {
          const api = window.__PORTANCE_TEST__;
          api.loadScenario("medDeparture");
          api.setControls({ throttleTarget: .3, rudderTarget: -.2 });
          const before = api.snapshot(), camera = api.cameraReport(), scenarios = api.scenarioReport();
          api.selectLocale("fr"); api.selectLocale("en");
          return { before, after: api.snapshot(), camera, cameraAfter: api.cameraReport(), scenarios, scenariosAfter: api.scenarioReport() };
        });
        assert.deepEqual(preserved.before, preserved.after);
        assert.deepEqual(preserved.camera, preserved.cameraAfter);
        assert.deepEqual(preserved.scenarios, preserved.scenariosAfter);
        await page.evaluate(() => {
          const api = window.__PORTANCE_TEST__;
          const id = api.mooringReport().lines[0].id;
          api.detachMooring(id);
        });
        assert.match(await page.locator("#impactToast").textContent(), /released/);
        await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("fr"));
        assert.match(await page.locator("#impactToast").textContent(), /larguée/);
        await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("en"));
        assert.match(await page.locator("#impactToast").textContent(), /released/);
        await page.evaluate(() => {
          const api = window.__PORTANCE_TEST__;
          api.loadScenario("halfTurn");
          api.setControls({ throttleTarget: .4, rudderTarget: -.3 });
          api.advance(2);
        });
        await page.locator('[data-mode="understand"]').click();
        await page.waitForFunction(() => window.__PORTANCE_TEST__.understandingHitReport().targets.some(target => target.kind === "force"));
        const target = await page.evaluate(() => window.__PORTANCE_TEST__.understandingHitReport().targets.find(target => target.kind === "force"));
        const box = await page.locator("#scene").boundingBox();
        await page.mouse.move(box.x + (target.a.x + target.b.x) / 2, box.y + (target.a.y + target.b.y) / 2);
        await page.waitForFunction(() => !document.querySelector("#forceTooltip").hidden);
        const tooltipSwitch = await page.evaluate(() => {
          const api = window.__PORTANCE_TEST__;
          const before = document.querySelector("#forceTooltip").textContent;
          api.selectLocale("fr");
          const french = document.querySelector("#forceTooltip").textContent;
          api.selectLocale("en");
          return { before, french, after: document.querySelector("#forceTooltip").textContent };
        });
        assert.notEqual(tooltipSwitch.french, tooltipSwitch.before);
        assert.equal(tooltipSwitch.after, tooltipSwitch.before);
        await assertEnglish();
        await page.evaluate(() => document.querySelector("#expertDetails").open = true);
        await assertEnglish();
        await page.locator("#portInfoButton").click();
        await assertEnglish();
        assert.equal(await page.locator("#portInfoName").textContent(), "Harbour - training basin");
        await page.locator("#closePortInfo").click();
        await page.locator("#portFileInput").setInputFiles({
          name: "invalid.kjp", mimeType: "application/json", buffer: Buffer.from("{")
        });
        await page.waitForFunction(() => document.querySelector("#impactToast").textContent.includes("Harbour refused"));
        assert.match(await page.locator("#impactToast").textContent(), /unreadable JSON/);
        await assertEnglish();
        await page.locator("#readmeHelpButton").click();
        const guide = await page.locator(".project-help-content").textContent();
        assert.match(guide, /Understanding Expert calibration/);
        assert.match(guide, /French content/);
        assert.equal(await page.locator(".project-help-content img").count(), 4);
        await assertEnglish();
        await page.locator("#closeReadmeHelp").click();
        await page.selectOption("#languageSelect", "fr");
        await page.reload();
        assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.localeReport())).source, "storage");
        assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.localeReport())).locale, "fr");
        await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("en"));
        await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("medDeparture"));
        for (const width of [1280, 1024, 390, 360]) {
          await page.setViewportSize({ width, height: 844 });
          const bounds = await page.locator("#languageSelect").boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `language selector overflow at ${width}`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const overlap = await page.evaluate(() => {
            const hud = document.querySelector(".hud").getBoundingClientRect();
            const readout = document.querySelector(".environment-readout").getBoundingClientRect();
            return readout.width > 0 && readout.height > 0 && hud.right > readout.left
              && hud.left < readout.right && hud.bottom > readout.top && hud.top < readout.bottom;
          });
          assert.equal(overlap, false, `instruments overlap environment readouts at ${width}`);
        }
        const imported = Codec.createEmpty({ name: "Port Français — texte auteur", latitude: 47.586, longitude: -3.03 });
        imported.metadata.comment = "Conserver ce commentaire français.";
        imported.navigation.entries.push({ id: "entry", name: "Entrée originale", position: { east: 0, north: 0 }, heading: 0 });
        const result = await page.evaluate(text => {
          const api = window.__PORTANCE_TEST__;
          api.importPort(text);
          api.selectLocale("fr"); api.selectLocale("en");
          return api.portInformationReport();
        }, Codec.serialize(imported));
        assert.equal(result.metadata.name, imported.metadata.name);
        assert.equal(result.metadata.comment, imported.metadata.comment);
        assert.ok(result.rows.includes("Author") || result.rows.includes("Comment"));
      }
      assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.localeReport().missingKeys), []);
      assert.deepEqual(errors, []);
      assert.deepEqual(network, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test("Breton localizes scenarios, live messages and the offline guide without changing the boat", { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "br-FR", viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  try {
    const page = await instrumentPage(await context.newPage(), true);
    const errors = [], network = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await context.route("https://www.googletagmanager.com/**", route => route.fulfill({ status: 200, body: "", contentType: "application/javascript" }));
    page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().includes("googletagmanager")) network.push(request.url()); });
    await page.goto(url, { timeout: 60000 });
    await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.localeReport());
    assert.equal(report.locale, "br");
    assert.equal(report.source, "browser");
    assert.deepEqual([...report.available].sort(), ["br", "en", "fr"]);
    assert.equal(await page.locator('#languageSelect option[value="br"]').textContent(), "Bzh");
    assert.equal(await page.locator('#languageSelect option[value="br"]').getAttribute("title"), "Brezhoneg");
    assert.equal(await page.locator("html").getAttribute("lang"), "br");
    assert.equal(await page.locator("html").getAttribute("dir"), "ltr");
    assert.equal(await page.evaluate(() => window.KJPI18n.formatNumber(1.25, 2)), "1,25");
    assert.equal(await page.evaluate(() => window.KJPI18n.formatDate("2026-10-07T12:00:00Z")), "07/10/2026");
    const breton = catalogs.find(catalog => catalog.code === "br").messages;
    assert.equal(await page.title(), breton["ui.kjp.port.simulator.understand.your.boat.in.harbour"]);
    assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), breton["ui.educational.harbour.manoeuvring.simulator.for.cruising.sailboats"]);
    const assertBreton = async () => {
      const surface = await page.evaluate(() => [document.body.innerText,
        ...Array.from(document.querySelectorAll("[aria-label], [aria-valuetext], [title]"))
          .flatMap(element => ["aria-label", "aria-valuetext", "title"].map(attribute => element.getAttribute(attribute) || ""))
      ].join("\n"));
      for (const [key, value] of Object.entries(catalogs.find(catalog => catalog.code === "fr").messages)) {
        if (typeof value !== "string" || value === breton[key] || value.length < 12 || /\{/.test(value)) continue;
        assert.equal(surface.includes(value), false, `French application text remains in Breton: ${key}`);
      }
    };
    for (const id of await page.evaluate(() => Object.keys(window.__PORTANCE_TEST__.scenarioReport()))) {
      const lesson = await page.evaluate(id => {
        window.__PORTANCE_TEST__.loadScenario(id);
        return { title: document.querySelector("#lessonTitle").textContent, copy: document.querySelector("#lessonCopy").textContent };
      }, id);
      assert.equal(lesson.title, breton[`scenario.${id}.title`]);
      assert.equal(lesson.copy, breton[`scenario.${id}.copy`]);
      await assertBreton();
    }
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("medDeparture");
      api.setControls({ throttleTarget: .3, rudderTarget: -.2 });
      api.advance(.5);
      const slider = document.querySelector("#windage");
      slider.value = "115";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      // A boat-relative view avoids including ordinary top-view follow smoothing
      // in the before/after comparison while also checking that the view stays selected.
      api.selectCameraView("skipper");
    });
    const preserved = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const settings = () => Array.from(document.querySelectorAll('input[type="range"]')).map(input => [input.id, input.value]);
      const before = { boat: api.snapshot(), camera: api.cameraReport(), settings: settings() };
      for (const code of ["fr", "en", "br"]) api.selectLocale(code);
      return { before, after: { boat: api.snapshot(), camera: api.cameraReport(), settings: settings() } };
    });
    for (const field of ["boat", "camera", "settings"]) {
      assert.equal(JSON.stringify(preserved.after[field]), JSON.stringify(preserved.before[field]), `${field} changed on language switch`);
    }
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.detachMooring(api.mooringReport().lines[0].id);
    });
    assert.equal(await page.locator("#impactToast").textContent(), breton["toast.line.released"]);
    await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("en"));
    assert.match(await page.locator("#impactToast").textContent(), /released/);
    await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("br"));
    assert.equal(await page.locator("#impactToast").textContent(), breton["toast.line.released"]);
    assert.equal(await page.locator("#diagnosticText").textContent(), breton["diagnostic.simulation.paused.forces.remain.visible.but.time.has"]);
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("halfTurn");
      api.setControls({ throttleTarget: .4, rudderTarget: -.3 });
      api.advance(2);
    });
    await page.locator('[data-mode="understand"]').click();
    await page.waitForFunction(() => window.__PORTANCE_TEST__.understandingHitReport().targets.some(target => target.kind === "force"));
    const target = await page.evaluate(() => window.__PORTANCE_TEST__.understandingHitReport().targets.find(target => target.kind === "force"));
    const box = await page.locator("#scene").boundingBox();
    await page.mouse.move(box.x + (target.a.x + target.b.x) / 2, box.y + (target.a.y + target.b.y) / 2);
    await page.waitForFunction(() => !document.querySelector("#forceTooltip").hidden);
    const tooltip = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const before = document.querySelector("#forceTooltip").textContent;
      api.selectLocale("fr");
      const french = document.querySelector("#forceTooltip").textContent;
      api.selectLocale("br");
      return { before, french, after: document.querySelector("#forceTooltip").textContent };
    });
    assert.notEqual(tooltip.french, tooltip.before);
    assert.equal(tooltip.after, tooltip.before);
    await page.evaluate(() => document.querySelector("#expertDetails").open = true);
    await assertBreton();
    await page.locator("#portInfoButton").click();
    assert.equal(await page.locator("#portInfoName").textContent(), breton["port.builtIn.name"]);
    await assertBreton();
    await page.locator("#closePortInfo").click();
    await page.locator("#portFileInput").setInputFiles({ name: "invalid.kjp", mimeType: "application/json", buffer: Buffer.from("{") });
    await page.waitForFunction(() => document.querySelector("#impactToast").textContent.includes("Porzh nac'het"));
    assert.match(await page.locator("#impactToast").textContent(), /JSON dilennus/);
    await assertBreton();
    await page.locator("#readmeHelpButton").click();
    const guide = await page.locator(".project-help-content").textContent();
    assert.match(guide, /Kompren ar « Kalibradur arbennik »/);
    assert.match(guide, /endalc'had e galleg/);
    assert.match(guide, /Babourzh \/ Tribourzh/);
    assert.equal(await page.locator(".project-help-content img").count(), 4);
    await page.waitForFunction(() => [...document.querySelectorAll(".project-help-content img")].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll(".project-help-content img")].every(image => image.src.startsWith("data:image/"))), true);
    await assertBreton();
    await page.locator("#closeReadmeHelp").click();
    for (const width of [1280, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await page.locator("#languageSelect").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `Bzh selector overflow at ${width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.selectOption("#languageSelect", "en");
    await page.selectOption("#languageSelect", "br");
    await page.reload();
    const stored = await page.evaluate(() => window.__PORTANCE_TEST__.localeReport());
    assert.equal(stored.locale, "br");
    assert.equal(stored.source, "storage");
    const imported = Codec.createEmpty({ name: "Port français — texte auteur", latitude: 47.586, longitude: -3.03 });
    imported.metadata.comment = "Conserver ce commentaire français.";
    imported.navigation.entries.push({ id: "entry", name: "Entrée originale", position: { east: 0, north: 0 }, heading: 0 });
    const information = await page.evaluate(text => {
      const api = window.__PORTANCE_TEST__;
      api.importPort(text);
      api.selectLocale("en"); api.selectLocale("br");
      return api.portInformationReport();
    }, Codec.serialize(imported));
    assert.equal(information.metadata.name, imported.metadata.name);
    assert.equal(information.metadata.comment, imported.metadata.comment);
    assert.ok(information.rows.includes(breton["ui.comment"]));
    assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.localeReport().missingKeys), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
  } finally { await context.close(); await browser.close(); }
});
