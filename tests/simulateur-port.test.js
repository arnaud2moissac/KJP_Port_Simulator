"use strict";

const { browserCase } = require("./helpers/browser-harness.js");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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

const libraryApiUrl = "https://api.github.com/repos/arnaud2moissac/KJP_Port_Simulator/contents/ports";
const libraryRawUrl = "https://raw.githubusercontent.com/arnaud2moissac/KJP_Port_Simulator/main/ports/";

function libraryRecord(name, metadata = {}) {
  const document = KJPCodec.createEmpty({ id: `test-${name}`, name: "Port test" });
  Object.assign(document.metadata, metadata);
  document.navigation.entries.push({ id: "entry-test", name: "Entrée", position: { east: 0, north: 0 }, heading: 0 });
  return { name, text: JSON.stringify(document) };
}

async function stubPortLibrary(page, records) {
  const state = { records, listStatus: 200, extraEntries: [], beforeList: null,
    beforePreview: null, beforeLoad: null, active: 0, peak: 0, requests: [] };
  await page.route(`${libraryApiUrl}**`, async route => {
    const url = new URL(route.request().url());
    state.requests.push(url.href);
    if (url.pathname.endsWith("/ports")) {
      if (state.beforeList) await state.beforeList();
      return route.fulfill({ status: state.listStatus, contentType: "application/json",
        headers: state.listStatus === 403 ? { "x-ratelimit-remaining": "0", "access-control-expose-headers": "X-RateLimit-Remaining" } : {},
        body: JSON.stringify(state.records.map(record => ({ type: "file", name: record.name,
          path: `ports/${record.name}`, size: record.size ?? Buffer.byteLength(record.text),
          download_url: `${libraryRawUrl}${encodeURIComponent(record.name)}`
        })).concat(state.extraEntries)) });
    }
    const record = state.records.find(item => item.name === decodeURIComponent(url.pathname.split("/").at(-1)));
    assert.equal(route.request().headers().accept, "application/vnd.github.raw+json");
    if (state.beforeLoad) await state.beforeLoad();
    return route.fulfill({ status: record.loadStatus || 200, contentType: "application/json",
      body: record.loadText ?? record.text });
  });
  await page.route(`${libraryRawUrl}**`, async route => {
    const record = state.records.find(item => item.name === decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1)));
    state.requests.push(route.request().url());
    state.peak = Math.max(state.peak, ++state.active);
    try {
      if (state.beforePreview) await state.beforePreview();
      await route.fulfill({ status: record.previewStatus || 200, contentType: "application/json", body: record.text });
    } finally { state.active--; }
  });
  return state;
}

async function openReadyPortLibrary(page) {
  await page.selectOption("#portSourceSelect", "portLibrary");
  await page.waitForFunction(() => document.querySelector("#portLibraryStatus").textContent.includes("disponible"));
}

async function libraryOrder(page) {
  return page.locator("#portLibraryRows tr").evaluateAll(rows => rows.map(row => row.dataset.libraryFile));
}

function consumeLibraryHttpError(runtimeErrors, status) {
  // Chromium logs failed HTTP resources even when the application handles them.
  // Consume only the exact status deliberately returned by the network fixture.
  assert.match(runtimeErrors.shift() || "", new RegExp(`^Failed to load resource: the server responded with a status of ${status} \\(`));
}

browserCase("simulator:ports.library-list", async ({ page }, t) => {
  const records = [
    libraryRecord("treguier.kjp", { name: "Tréguier", author: "Glep", createdAt: "2026-10-04T16:26:09.398Z", updatedAt: "2026-10-05T19:19:22.602Z" }),
    libraryRecord("trinite.kjp", { name: "La Trinité sur mer", author: "A de Moissac" }),
    libraryRecord("sans-nom.KJP", { name: "", author: "", createdAt: "", updatedAt: "incorrect" }),
    libraryRecord("test.kjp", { name: "Port <script>test</script>", author: "<img src=x onerror=alert(1)>" }),
    libraryRecord("port-2.kjp", { name: "Port 2", author: "Équipage" })
  ];
  const state = await stubPortLibrary(page, records);
  state.extraEntries = [
    { type: "dir", name: "sous-dossier.kjp", path: "ports/sous-dossier.kjp" },
    { type: "file", name: "README.md", path: "ports/README.md" },
    { type: "file", name: "autre.kjp", path: "autre/autre.kjp" }
  ];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  t.after(release);
  state.beforePreview = () => pending;
  assert.equal(state.requests.length, 0);
  await page.selectOption("#portSourceSelect", "portLibrary");
  await page.waitForFunction(() => document.querySelectorAll("#portLibraryRows tr").length === 5);
  await page.locator('[data-library-sort="author"]').click();
  assert.equal(state.peak, 3);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.paused, true);
  release();
  await page.waitForFunction(() => document.querySelector("#portLibraryStatus").textContent === "5 ports disponibles");
  assert.equal(state.peak, 3);
  assert.equal(await page.locator('[data-library-sort="author"]').locator("..").getAttribute("aria-sort"), "ascending");
  const treguier = page.locator('#portLibraryRows tr[data-library-file="treguier.kjp"]');
  assert.deepEqual(await treguier.locator("td").allTextContents(), ["Tréguier", "Glep", "04/10/2026", "05/10/2026", "Charger"]);
  assert.deepEqual((await page.locator('#portLibraryRows tr[data-library-file="sans-nom.KJP"] td').allTextContents()).slice(0, 4), ["sans-nom", "—", "—", "—"]);
  assert.equal(await page.locator("#portLibraryRows script, #portLibraryRows img").count(), 0);
  const captureDir = process.env.KJP_LIBRARY_CAPTURE_DIR;
  if (captureDir) {
    fs.mkdirSync(captureDir, { recursive: true });
    await page.screenshot({ path: path.join(captureDir, "desktop.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".port-library-table").isVisible(), false);
  assert.equal(await page.locator(".port-library-mobile-sort").isVisible(), true);
  assert.equal(await page.locator("#portLibraryCards article").count(), 5);
  assert.equal(await page.locator("#portLibraryDialog").evaluate(element => element.scrollWidth <= element.clientWidth), true);
  if (captureDir) await page.screenshot({ path: path.join(captureDir, "mobile.png") });
  await page.locator("#closePortLibrary").click();
  for (const [locale, title] of [["en", "Harbour library"], ["br", "Levraoueg ar porzhioù"]]) {
    await page.selectOption("#languageSelect", locale);
    await page.selectOption("#portSourceSelect", "portLibrary");
    await page.waitForFunction(() => document.querySelector("#portLibraryRows button") && !document.querySelector("#portLibraryRows button").disabled);
    assert.equal(await page.locator("#portLibraryTitle").textContent(), title);
    assert.equal(await page.locator("#portLibrarySortSelect").inputValue(), "author");
    await page.locator("#closePortLibrary").click();
  }
});

browserCase("simulator:ports.library-sort", async ({ page, runtimeErrors }) => {
  const records = [
    libraryRecord("z.kjp", { name: "Écluse 10", author: "Zoé", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2025-12-01T00:00:00Z" }),
    libraryRecord("a.kjp", { name: "Port 2", author: "Anne", createdAt: "2025-12-31T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z" }),
    libraryRecord("b.kjp", { name: "Port 10", author: "Anne", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z" }),
    libraryRecord("missing.kjp", { name: "Sans dates", author: "", createdAt: "", updatedAt: "incorrect" }),
    libraryRecord("tie.kjp", { name: "Port 2", author: "Anne", createdAt: "2025-12-31T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z" }),
    libraryRecord("no-name.kjp", { name: "", author: "", createdAt: "incorrect", updatedAt: "" })
  ];
  const state = await stubPortLibrary(page, records);
  await openReadyPortLibrary(page);
  assert.deepEqual(await libraryOrder(page), ["z.kjp", "a.kjp", "tie.kjp", "b.kjp", "missing.kjp", "no-name.kjp"]);
  const expectations = {
    name: [["z.kjp", "a.kjp", "tie.kjp", "b.kjp", "missing.kjp", "no-name.kjp"], ["missing.kjp", "b.kjp", "a.kjp", "tie.kjp", "z.kjp", "no-name.kjp"]],
    author: [["a.kjp", "tie.kjp", "b.kjp", "z.kjp", "no-name.kjp", "missing.kjp"], ["z.kjp", "a.kjp", "tie.kjp", "b.kjp", "no-name.kjp", "missing.kjp"]],
    createdAt: [["a.kjp", "tie.kjp", "b.kjp", "z.kjp", "no-name.kjp", "missing.kjp"], ["z.kjp", "b.kjp", "a.kjp", "tie.kjp", "no-name.kjp", "missing.kjp"]],
    updatedAt: [["z.kjp", "a.kjp", "tie.kjp", "b.kjp", "no-name.kjp", "missing.kjp"], ["a.kjp", "tie.kjp", "b.kjp", "z.kjp", "no-name.kjp", "missing.kjp"]]
  };
  for (const [key, [ascending, descending]] of Object.entries(expectations)) {
    const button = page.locator(`[data-library-sort="${key}"]`);
    if (key !== "name") await button.click();
    assert.deepEqual(await libraryOrder(page), ascending, `${key} ascending`);
    assert.equal(await button.locator("..").getAttribute("aria-sort"), "ascending");
    await button.click();
    assert.deepEqual(await libraryOrder(page), descending, `${key} descending`);
    assert.equal(await button.locator("..").getAttribute("aria-sort"), "descending");
  }
  await page.locator('[data-library-sort="author"]').focus();
  await page.keyboard.press("Enter");
  assert.deepEqual(await libraryOrder(page), expectations.author[0]);
  await page.keyboard.press("Enter");
  assert.deepEqual(await libraryOrder(page), expectations.author[1]);
  await page.locator("#closePortLibrary").click();
  state.listStatus = 503;
  await page.selectOption("#portSourceSelect", "portLibrary");
  await page.waitForFunction(() => !document.querySelector("#retryPortLibrary").hidden);
  consumeLibraryHttpError(runtimeErrors, 503);
  state.listStatus = 200;
  await page.locator("#retryPortLibrary").click();
  await page.waitForFunction(() => document.querySelector("#portLibraryStatus").textContent === "6 ports disponibles");
  assert.deepEqual(await libraryOrder(page), expectations.author[1]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.selectOption("#portLibrarySortSelect", "updatedAt");
  assert.deepEqual(await libraryOrder(page), expectations.updatedAt[0]);
  await page.locator("#portLibrarySortDirection").click();
  assert.deepEqual(await libraryOrder(page), expectations.updatedAt[1]);
  assert.deepEqual(await page.locator("#portLibraryCards article").evaluateAll(cards => cards.map(card => card.dataset.libraryFile)), expectations.updatedAt[1]);
});

browserCase("simulator:ports.library-load", async ({ page }, t) => {
  const state = await stubPortLibrary(page, [libraryRecord("chosen.kjp", { name: "Port choisi", author: "Équipage" })]);
  await page.locator("#pauseButton").click();
  const before = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  await openReadyPortLibrary(page);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("p");
  const paused = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  assert.equal(paused.controls.paused, true);
  assert.equal(paused.controls.throttleTarget, before.controls.throttleTarget);
  assert.equal(paused.controls.rudderTarget, before.controls.rudderTarget);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#portLibraryDialog").evaluate(dialog => dialog.open), false);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.paused, false);
  assert.equal(await page.locator("#portSourceSelect").evaluate(element => element === document.activeElement), true);
  await page.locator("#pauseButton").click();
  await openReadyPortLibrary(page);
  await page.locator("#closePortLibrary").click();
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.paused, true);
  await openReadyPortLibrary(page);
  const box = await page.locator("#portLibraryDialog").boundingBox();
  await page.mouse.click(box.x - 5, box.y + 20);
  assert.equal(await page.locator("#portLibraryDialog").evaluate(dialog => dialog.open), false);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.paused, true);
  await page.selectOption("#scenarioSelect", "placement");
  const preparation = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  await openReadyPortLibrary(page);
  await page.keyboard.press("Escape");
  const restored = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(restored.active, true);
  assert.deepEqual(restored.draft, preparation.draft);
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  t.after(release);
  state.beforeLoad = () => loading;
  await openReadyPortLibrary(page);
  await page.locator("#portLibraryRows [data-library-load]").click();
  assert.equal(await page.locator("#portLibraryRows [data-library-load]").isDisabled(), true);
  release();
  await page.waitForFunction(() => !document.querySelector("#portLibraryDialog").open
    || document.querySelector("#portLibraryStatus").dataset.error === "true");
  assert.equal(await page.locator("#portLibraryDialog").evaluate(dialog => dialog.open), false,
    await page.locator("#portLibraryStatus").textContent());
  const report = await page.evaluate(() => window.__PORTANCE_TEST__.portInformationReport());
  assert.equal(report.metadata.name, "Port choisi");
  assert.equal(await page.locator("#portSourceSelect").inputValue(), "community");
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.paused, false);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).active, false);
});

browserCase("simulator:ports.library-errors", async ({ page, runtimeErrors }, t) => {
  const good = libraryRecord("good.kjp", { name: "Port disponible" });
  const state = await stubPortLibrary(page, []);
  const original = await page.evaluate(() => window.__PORTANCE_TEST__.portInformationReport());
  await openReadyPortLibrary(page);
  assert.equal(await page.locator("#portLibraryStatus").textContent(), "Aucun port disponible dans la bibliothèque.");
  await page.locator("#closePortLibrary").click();
  for (const status of [503, 403]) {
    state.listStatus = status;
    await page.selectOption("#portSourceSelect", "portLibrary");
    await page.waitForFunction(() => document.querySelector("#portLibraryStatus").dataset.error === "true");
    consumeLibraryHttpError(runtimeErrors, status);
    if (status === 403) assert.match(await page.locator("#portLibraryStatus").textContent(), /limite d’accès à GitHub/);
    await page.locator("#closePortLibrary").click();
  }
  state.listStatus = 200;
  state.records = [good, { name: "invalid.kjp", text: "{" },
    { ...libraryRecord("large.kjp"), size: KJPCodec.LIMITS.fileBytes + 1 }];
  await openReadyPortLibrary(page);
  assert.equal(await page.locator('#portLibraryRows [data-library-load="good.kjp"]').isDisabled(), false);
  assert.equal(await page.locator('#portLibraryRows [data-library-load="invalid.kjp"]').isDisabled(), true);
  assert.equal(await page.locator('#portLibraryRows [data-library-load="large.kjp"]').isDisabled(), true);
  assert.equal(state.requests.some(url => url === `${libraryRawUrl}large.kjp`), false);
  await page.locator("#closePortLibrary").click();
  state.records = [good];
  const invalid = JSON.parse(good.text);
  invalid.schemaVersion = 999;
  good.loadText = JSON.stringify(invalid);
  await page.selectOption("#scenarioSelect", "placement");
  const preparation = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  await openReadyPortLibrary(page);
  await page.locator("#portLibraryRows [data-library-load]").click();
  await page.waitForFunction(() => document.querySelector("#portLibraryStatus").dataset.error === "true");
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).active, true);
  assert.deepEqual((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).draft, preparation.draft);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.portInformationReport())).metadata.name, original.metadata.name);
  good.loadText = " ".repeat(KJPCodec.LIMITS.fileBytes + 1);
  await page.locator("#portLibraryRows [data-library-load]").click();
  await page.waitForFunction(() => document.querySelector("#portLibraryStatus").textContent.includes("10 Mo"));
  await page.locator("#closePortLibrary").click();
  delete good.loadText;
  let releaseLoad;
  const pendingLoad = new Promise(resolve => { releaseLoad = resolve; });
  t.after(releaseLoad);
  state.beforeLoad = () => pendingLoad;
  await openReadyPortLibrary(page);
  await page.locator("#portLibraryRows [data-library-load]").click();
  await page.keyboard.press("Escape");
  state.beforeLoad = null;
  await openReadyPortLibrary(page);
  releaseLoad();
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#portLibraryDialog").evaluate(dialog => dialog.open), true);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.portInformationReport())).metadata.name, original.metadata.name);
  await page.locator("#closePortLibrary").click();
  let releaseList;
  const pendingList = new Promise(resolve => { releaseList = resolve; });
  t.after(releaseList);
  state.beforeList = () => pendingList;
  await page.selectOption("#portSourceSelect", "portLibrary");
  await page.keyboard.press("Escape");
  state.beforeList = null;
  state.records = [];
  await openReadyPortLibrary(page);
  releaseList();
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#portLibraryRows tr").count(), 0);
  assert.equal(await page.locator("#portLibraryDialog").evaluate(dialog => dialog.open), true);
});

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

async function screenshotElement(page, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${selector}: zone absente`);
  return page.screenshot({ clip: box });
}

browserCase("simulator:placement.01", async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector("#windSpeed").value = 8;
    document.querySelector("#windSpeed").dispatchEvent(new Event("input"));
  });
  const before = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  await page.selectOption("#scenarioSelect", "placement");
  const draft = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(draft.active, true);
  assert.equal(draft.valid, true);
  assert.deepEqual(draft.core, before.core);
  assert.deepEqual(draft.environment, before.environment);
  assert.deepEqual(draft.draft, { x: 25, y: 48, heading: -Math.PI / 2 });
  assert.ok(draft.camera.distance > 53);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("q");
  const moved = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.ok(moved.draft.x < draft.draft.x);
  assert.notEqual(moved.draft.heading, draft.draft.heading);
  assert.deepEqual(moved.core, before.core);
  await page.keyboard.press("Escape");
  const cancelled = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(cancelled.active, false);
  assert.deepEqual(cancelled.core, before.core);
  assert.deepEqual(cancelled.controls, before.controls);
  assert.deepEqual(cancelled.camera, before.camera);
  assert.equal(cancelled.scenarioId, before.scenarioId);
});

browserCase("simulator:placement.02", async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector("#windSpeed").value = 9;
    document.querySelector("#windSpeed").dispatchEvent(new Event("input"));
    document.querySelector("#currentSpeed").value = .5;
    document.querySelector("#currentSpeed").dispatchEvent(new Event("input"));
  });
  await page.selectOption("#scenarioSelect", "placement");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("e");
  const draft = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  await page.click("#placementConfirm");
  const mooring = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(mooring.phase, "mooring");
  assert.equal(mooring.controls.paused, true);
  assert.equal(mooring.core.moorings.length, 0);
  assert.equal(await page.locator("#placementRose").isVisible(), false);
  await page.click("#placementConfirm");
  const started = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(started.active, false);
  assert.equal(started.scenarioId, "customDeparture");
  assert.equal(started.controls.paused, false);
  assert.equal(started.core.moorings.length, 0);
  assert.equal(started.controls.throttleTarget, 0);
  assert.equal(started.controls.rudderTarget, 0);
  assert.equal(started.camera.distance, 53);
  assert.deepEqual(started.environment, draft.environment);
  await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("customDeparture"));
  const replayed = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(replayed.core.pose.east, draft.draft.x);
  assert.equal(replayed.core.pose.north, draft.draft.y);
  assert.ok(Math.abs(replayed.core.pose.heading - Math.atan2(Math.sin(Math.PI / 2 - draft.draft.heading), Math.cos(Math.PI / 2 - draft.draft.heading))) < 1e-8);
  assert.ok(Object.values(replayed.core.velocity).every(value => value === 0));
  assert.equal(await page.locator('option[value="placement"]').count(), 1);
});

browserCase("simulator:placement.03", async ({ page }) => {
  const text = createPortInformationText();
  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), text);
  await page.selectOption("#scenarioSelect", "placement");
  const initial = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.deepEqual(initial.draft, { x: 0, y: 0, heading: 0 });
  const box = await page.locator("#scene").boundingBox();
  const center = initial.center;
  await page.mouse.move(box.x + center.x, box.y + center.y);
  await page.mouse.down();
  await page.mouse.move(box.x + center.x + 35, box.y + center.y + 10, { steps: 4 });
  await page.mouse.up();
  const translated = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.ok(translated.draft.x > 0);
  const handle = await page.locator("#placementHandlePort").boundingBox();
  const c = translated.center;
  await page.mouse.move(handle.x + 22, handle.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x + c.x + c.radius, box.y + c.y, { steps: 8 });
  await page.mouse.up();
  const rotated = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.notEqual(rotated.draft.heading, translated.draft.heading);
  assert.deepEqual(rotated.core, initial.core);
  await page.click("#placementConfirm");
  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), text);
  assert.equal(await page.locator('option[value="customDeparture"]').count(), 0);
});

browserCase("simulator:placement.04", async ({ page }) => {
  assert.equal(await page.evaluate(() => navigator.maxTouchPoints > 0), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.selectOption("#scenarioSelect", "placement");
  const initial = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  const box = await page.locator("#scene").boundingBox();
  const x = box.x + initial.center.x, y = box.y + initial.center.y;
  await page.locator("#scene").dispatchEvent("pointerdown", { pointerId: 71, pointerType: "touch", clientX: x, clientY: y, button: 0 });
  await page.locator("#scene").dispatchEvent("pointermove", { pointerId: 71, pointerType: "touch", clientX: x + 20, clientY: y, button: 0 });
  const moved = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.notEqual(moved.draft.x, initial.draft.x);
  await page.locator("#scene").dispatchEvent("pointerdown", { pointerId: 72, pointerType: "touch", clientX: x + 70, clientY: y, button: 0 });
  await page.locator("#scene").dispatchEvent("pointermove", { pointerId: 72, pointerType: "touch", clientX: x + 110, clientY: y + 20, button: 0 });
  const gesture = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.deepEqual(gesture.draft, moved.draft);
  assert.notEqual(gesture.camera.distance, moved.camera.distance);
  for (const pointerId of [71, 72]) await page.locator("#scene").dispatchEvent("pointerup", { pointerId, pointerType: "touch", clientX: x, clientY: y, button: 0 });
  assert.equal(await page.locator("#placementConfirm").isEnabled(), true);
  await page.click("#placementCancel");
  const restored = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.deepEqual(restored.core, initial.core);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.selectOption("#scenarioSelect", "placement");
  const rose = await page.locator("#placementRose").boundingBox();
  const toolbar = await page.locator("#placementToolbar").boundingBox();
  assert.ok(rose.y + rose.height <= toolbar.y);
  assert.ok(rose.y >= 0 && rose.y + rose.height <= 390);
  const landscape = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  const landscapeBox = await page.locator("#scene").boundingBox();
  await page.touchscreen.tap(landscapeBox.x + landscape.center.x, landscapeBox.y + landscape.center.y);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).armed, true);
  await page.touchscreen.tap(landscapeBox.x + landscape.center.x + 140, landscapeBox.y + landscape.center.y);
  assert.notDeepEqual((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).draft, landscape.draft);
});

browserCase("simulator:placement.05", async ({ page }, t) => {
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ["dark", "chart"]) {
      await page.evaluate(theme => window.__PORTANCE_TEST__.selectVisualTheme(theme), theme);
      await page.selectOption("#scenarioSelect", "placement");
      await page.waitForFunction(() => document.querySelector("#placementHeading").textContent.length > 0);
      t.diagnostic(width + "×" + height + " " + theme);
      const rendered = await page.evaluate(() => {
        const p = window.__PORTANCE_TEST__.placementReport();
        const world = window.__PORTANCE_TEST__.worldRendererReport();
        return { draft: p.draft, player: world.player?.pose, ready: world.player?.model?.ready };
      });
      assert.equal(rendered.ready, true);
      assert.deepEqual(rendered.player, rendered.draft);
      if (process.env.KJP_PLACEMENT_CAPTURE_DIR && theme === "dark" && [1440, 390].includes(width)) {
        fs.mkdirSync(process.env.KJP_PLACEMENT_CAPTURE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.KJP_PLACEMENT_CAPTURE_DIR, "placement-" + width + ".png") });
      }
      for (const id of ["#placementHandlePort", "#placementHandleStarboard", "#placementConfirm", "#placementCancel"]) {
        const box = await page.locator(id).boundingBox();
        assert.ok(box && box.width >= 44 && box.height >= 44);
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, id + ": horizontal fit");
        assert.ok(box.y >= 0 && box.y + box.height <= height + 1, id + ": vertical fit");
      }
      assert.equal(await page.locator(".control-dock").isVisible(), false);
      assert.equal(await page.locator(".touch-controls").isVisible(), false);
      assert.equal(await page.locator(".rose-cardinal, #placementFine, #placementFineToggle, #placementCapInput").count(), 0);
      await page.click("#placementConfirm");
      const mooring = await page.evaluate(() => ({
        placement: window.__PORTANCE_TEST__.placementReport(),
        player: window.__PORTANCE_TEST__.worldRendererReport().player?.pose
      }));
      assert.equal(mooring.placement.phase, "mooring");
      assert.deepEqual(mooring.player, rendered.draft);
      assert.ok(mooring.placement.mooringTargets.cleats.length > 0);
      await page.click("#placementCancel");
    }
  }
});

function placementQuayText(east) {
  const document = structuredClone(KJPCodec.parse(createPortInformationText()));
  document.navigation.entries[0].position.east = east;
  document.structures.obstacles.push({ id: "placement-quay", type: "quay", width: .1, height: 1,
    points: [{ east: 0, north: -20 }, { east: 0, north: 20 }] });
  return KJPCodec.serialize(document);
}

browserCase("simulator:placement.06", async ({ page }) => {
  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), placementQuayText(-15));
  await page.selectOption("#scenarioSelect", "placement");
  const before = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  const box = await page.locator("#scene").boundingBox();
  await page.mouse.click(box.x + before.center.x, box.y + before.center.y);
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).armed, true);
  await page.mouse.click(box.x + before.center.x + 240, box.y + before.center.y);
  const stopped = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(stopped.blocked, true);
  assert.equal(stopped.valid, true);
  assert.ok(stopped.draft.x > -15 && stopped.draft.x < -5);
  assert.deepEqual(stopped.core, before.core);
  assert.equal(await page.locator("#placementConfirm").isEnabled(), true);
});

browserCase("simulator:placement.07", async ({ page }) => {
  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), placementQuayText(-5));
  await page.selectOption("#scenarioSelect", "placement");
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).valid, false);
  assert.equal(await page.locator("#placementConfirm").isEnabled(), false);
  await page.keyboard.press("ArrowLeft");
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).valid, true);
  assert.equal(await page.locator("#placementConfirm").isEnabled(), true);
});

browserCase("simulator:placement.08", async ({ page }) => {
  for (const input of ["mouse", "touch"]) {
    await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), placementQuayText(-15));
    await page.selectOption("#scenarioSelect", "placement");
    const initial = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    const box = await page.locator("#scene").boundingBox();
    const x = box.x + initial.center.x, y = box.y + initial.center.y;
    const send = async (type, px, py) => {
      if (input === "touch") await page.locator("#scene").dispatchEvent(type, {
        pointerId: 83, pointerType: "touch", clientX: px, clientY: py, button: 0
      });
      else if (type === "pointerdown") { await page.mouse.move(px, py); await page.mouse.down(); }
      else if (type === "pointerup") await page.mouse.up();
      else await page.mouse.move(px, py, { steps: 8 });
    };
    await send("pointerdown", x, y);
    await send("pointermove", x + 240, y);
    const contact = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.equal(contact.blocked, true);
    await send("pointermove", x + 240, y - 100);
    const slid = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.equal(slid.sliding, true, input + ": tangential movement is accepted");
    assert.equal(slid.valid, true);
    assert.ok(slid.draft.y > contact.draft.y + 3);
    await send("pointermove", x + 228, y - 100);
    const away = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.ok(away.draft.x < slid.draft.x - .05, input + ": pulling back must not require crossing the old cursor target");
    assert.equal(away.valid, true);
    assert.deepEqual(away.core, initial.core);
    await send("pointerup", x + 228, y - 100);
    assert.equal(await page.locator("#placementConfirm").isEnabled(), true);
  }
});

function mooringPreparationText() {
  const document = structuredClone(KJPCodec.parse(placementQuayText(-12)));
  for (const [id, station] of [["prep-cleat-a", 18], ["prep-cleat-b", 22]]) {
    document.structures.cleats.push({ id, parentId: "placement-quay", z: 1, orientation: 0,
      attachment: { kind: "polyline-station", station, waterSide: "left" } });
  }
  return KJPCodec.serialize(document);
}

function preparedLineSettings(core) {
  return core.moorings.map(line => ({ id: line.id, boatCleatId: line.boatCleatId,
    shoreCleatId: line.shoreCleatId, length: line.length, targetLength: line.targetLength }));
}

browserCase("simulator:placement.09", async ({ page }) => {
  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), mooringPreparationText());
  await page.selectOption("#scenarioSelect", "placement");
  await page.click("#placementConfirm");
  const initial = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(initial.phase, "mooring");
  assert.equal(initial.controls.paused, true);
  assert.equal(await page.locator("#placementBanner strong").textContent(), "Amarrer");
  assert.equal(await page.locator("#placementConfirm").textContent(), "Démarrer ▶");
  assert.equal(await page.locator("#placementRose").isVisible(), false);
  assert.equal(await page.locator(".control-dock").isVisible(), false);
  const clickCleat = async (type, id, touch) => {
    const target = await page.evaluate(({ type, id }) => window.__PORTANCE_TEST__.placementReport()
      .mooringTargets.cleats.find(hit => hit.endpoint.type === type && hit.endpoint.id === id), { type, id });
    assert.ok(target, type + ": " + id);
    const box = await page.locator("#scene").boundingBox();
    if (touch) await page.touchscreen.tap(box.x + target.x, box.y + target.y);
    else await page.mouse.click(box.x + target.x, box.y + target.y);
  };
  await clickCleat("boat", "bow-port", false);
  await clickCleat("shore", "prep-cleat-a", false);
  await clickCleat("boat", "bow-starboard", true);
  await clickCleat("shore", "prep-cleat-b", true);
  const attached = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(attached.core.moorings.length, 2);
  const gauge = page.locator('.mooring-gauge[data-mooring-id="user-1"]');
  await gauge.focus();
  await page.keyboard.press("PageUp");
  const prepared = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(prepared.core.moorings[0].targetLength, Math.round((attached.core.moorings[0].targetLength + .5) * 10) / 10);
  assert.deepEqual(prepared.core.pose, initial.core.pose);
  assert.deepEqual(prepared.core.velocity, initial.core.velocity);
  assert.equal(prepared.simulationTime, initial.simulationTime);
  await page.evaluate(() => window.__PORTANCE_TEST__.advance(5));
  assert.deepEqual((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).core, prepared.core);
  const settings = preparedLineSettings(prepared.core);
  for (const [width, height] of [[1280, 800], [844, 390], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ["dark", "chart"]) {
      await page.evaluate(theme => window.__PORTANCE_TEST__.selectVisualTheme(theme), theme);
      const banner = await page.locator("#placementBanner").boundingBox();
      const readout = await page.locator(".environment-readout").boundingBox();
      const toolbar = await page.locator("#placementToolbar").boundingBox();
      assert.ok(banner.x + banner.width <= readout.x || banner.y + banner.height <= readout.y,
        width + "×" + height + ": instructions must not cover the mooring panel");
      assert.ok(readout.y + readout.height <= toolbar.y, width + "×" + height + ": panel must fit above actions");
      for (const id of ["#placementConfirm", "#placementCancel"]) {
        const box = await page.locator(id).boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
        assert.ok(box.y >= 0 && box.y + box.height <= height);
      }
      if (process.env.KJP_PLACEMENT_CAPTURE_DIR && theme === "dark" && [1280, 390].includes(width)) {
        fs.mkdirSync(process.env.KJP_PLACEMENT_CAPTURE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.KJP_PLACEMENT_CAPTURE_DIR, "mooring-preparation-" + width + ".png") });
      }
    }
  }
  for (const locale of ["en", "br", "fr"]) {
    await page.evaluate(locale => window.__PORTANCE_TEST__.selectLocale(locale), locale);
    const banner = await page.locator("#placementBanner").boundingBox();
    const panel = await page.locator(".environment-readout").boundingBox();
    assert.ok(banner.y + banner.height <= panel.y, locale + ": translated help must not cover mooring controls");
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click("#placementConfirm");
  const started = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(started.phase, "idle");
  assert.equal(started.controls.paused, false);
  assert.equal(started.scenarioId, "customDeparture");
  assert.equal(started.core.moorings.length, 2);
  await page.evaluate(() => window.__PORTANCE_TEST__.detachMooring("user-1"));
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).core.moorings.length, 1);
  await page.click("#resetButton");
  const restarted = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(restarted.core.moorings.length, 2);
  assert.deepEqual(restarted.core.moorings.map(line => line.targetLength), settings.map(line => line.targetLength));
  for (let repeat = 0; repeat < 2; repeat++) {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("customDeparture"));
    const replayed = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.deepEqual(preparedLineSettings(replayed.core), settings);
    assert.deepEqual(replayed.core.pose, prepared.core.pose);
    assert.ok(Object.values(replayed.core.velocity).every(value => value === 0));
    await page.evaluate(() => window.__PORTANCE_TEST__.detachMooring("user-1"));
  }
  await page.evaluate(() => window.__PORTANCE_TEST__.attachMooring("bow-port", "prep-cleat-a"));
  assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).core.moorings.length, 2);
});

browserCase("simulator:placement.10", async ({ page }) => {
  await page.evaluate(text => {
    const api = window.__PORTANCE_TEST__;
    api.importPort(text);
    api.loadScenario("community");
    api.attachMooring("bow-port", "prep-cleat-a");
    api.setMooringLength("user-1", 9);
  }, mooringPreparationText());
  const original = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(original.core.moorings.length, 1);
  for (const cancel of ["button", "Escape"]) {
    await page.selectOption("#scenarioSelect", "placement");
    await page.keyboard.press("ArrowLeft");
    await page.click("#placementConfirm");
    await page.evaluate(() => window.__PORTANCE_TEST__.attachMooring("bow-starboard", "prep-cleat-b"));
    const preparing = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.equal(preparing.phase, "mooring");
    assert.notDeepEqual(preparing.core, original.core);
    if (cancel === "button") await page.click("#placementCancel");
    else await page.keyboard.press("Escape");
    const restored = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.equal(restored.phase, "idle");
    assert.deepEqual(restored.core, original.core);
    assert.deepEqual(restored.controls, original.controls);
    assert.deepEqual(restored.camera, original.camera);
    assert.equal(restored.scenarioId, original.scenarioId);
    assert.equal(restored.simulationTime, original.simulationTime);
    assert.equal(await page.locator('option[value="customDeparture"]').count(), 0);
  }
});

browserCase("simulator:smoke.01", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const report = await page.evaluate(() => ({
      activeRenderer: window.__PORTANCE_TEST__.visualReport().renderer,
      three: {
        revision: window.KJPThreeRendering?.revision,
        renderer: window.KJPThreeRendering?.renderer,
        role: window.KJPThreeRendering?.role,
        activeByDefault: window.KJPThreeRendering?.activeByDefault
      }
    }));
    assert.equal(report.activeRenderer.webgl2, true);
    assert.equal(report.activeRenderer.painterFallback, false);
    assert.equal(report.activeRenderer.backend, "native");
    assert.equal(report.activeRenderer.glError, 0);
    assert.deepEqual(report.three, {
      revision: "186",
      renderer: "WebGLRenderer",
      role: "native-production",
      activeByDefault: true
    });

});

browserCase("simulator:guide.02", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const initial = await page.evaluate(() => ({
      kicker: document.querySelector(".brand-kicker")?.textContent.trim(),
      title: document.querySelector(".brand-title")?.textContent.trim(),
      logo: document.querySelector(".brand-mark")?.getAttribute("src"),
      favicon: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
      dialogOpen: document.querySelector("#readmeDialog")?.open
    }));
    assert.equal(initial.kicker, "KJP Port Simulator");
    assert.equal(initial.title, "comprendre son bateau au port");
    assert.match(initial.logo, /^data:image\/png;base64,/);
    assert.equal(initial.favicon, initial.logo);
    assert.equal(initial.dialogOpen, false);

    await page.click("#readmeHelpButton");
    const help = await page.evaluate(() => ({
      open: document.querySelector("#readmeDialog").open,
      text: document.querySelector("#readmeDialog").textContent,
      title: document.querySelector("#readmeDialogTitle").textContent,
      headings: Array.from(document.querySelectorAll("#readmeDialog h2, #readmeDialog h3"))
        .map(heading => heading.textContent.trim()),
      modelExplorerLink: (() => {
        const link = document.querySelector(
          '#readmeDialog a[href="output/modeles-physiques/explorer-les-modeles.html"]'
        );
        return link ? {
          href: link.getAttribute("href"),
          target: link.getAttribute("target"),
          rel: link.getAttribute("rel")
        } : null;
      })(),
      embeddedImages: Array.from(document.querySelectorAll("#readmeDialog img"))
        .map(image => ({
          source: image.src,
          width: image.clientWidth,
          height: image.clientHeight,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight
        }))
    }));
    assert.equal(help.open, true);
    assert.equal(help.title, "Guide utilisateur · KJP Port Simulator");
    assert.match(help.text, /Manœuvrer au port avec KJP Port Simulator/);
    assert.match(help.text, /Sur ordinateur/);
    assert.match(help.text, /Sur tablette ou téléphone/);
    assert.match(help.text, /Comprendre les « Réglages avancés »/);
    assert.match(help.text, /modèle utilisé pour le Sun Odyssey 36i/);
    assert.doesNotMatch(help.text, /Profondeur du port|petit fond|garde sous quille/);
    for (const heading of [
      "Manœuvrer au port avec KJP Port Simulator",
      "Repérer l'interface",
      "Choisir les commandes adaptées à votre écran",
      "Réaliser une première manœuvre en cinq minutes",
      "Progresser avec les situations et les défis",
      "Lire ce que fait le bateau",
      "Comprendre pourquoi le bateau tourne ou dérive",
      "Utiliser les pare-battages, les aussières et les pendilles",
      "Régler le vent, le courant et le bateau",
      "Comprendre les « Réglages avancés »",
      "Charger ou retrouver un port",
      "Pourquoi le comportement est crédible"
    ]) {
      assert.ok(help.headings.includes(heading), `rubrique du guide absente : ${heading}`);
    }
    assert.deepEqual(help.modelExplorerLink, {
      href: "output/modeles-physiques/explorer-les-modeles.html",
      target: "_blank",
      rel: "noopener noreferrer"
    });
    const [modelExplorerPage] = await Promise.all([
      page.waitForEvent("popup"),
      page.click(
        '#readmeDialog a[href="output/modeles-physiques/explorer-les-modeles.html"]'
      )
    ]);
    await modelExplorerPage.waitForLoadState("domcontentloaded");
    assert.equal(
      await modelExplorerPage.title(),
      "Fardage et parties immergées - modèles physiques KJP"
    );
    assert.equal(
      new URL(modelExplorerPage.url()).pathname,
      path.join(projectRoot, "output", "modeles-physiques", "explorer-les-modeles.html")
    );
    await modelExplorerPage.close();
    assert.equal(help.embeddedImages.length, 4);
    assert.equal(
      help.embeddedImages.every(image => image.source.startsWith("data:image/")),
      true
    );
    for (const image of help.embeddedImages) {
      assert.ok(image.naturalWidth > 0 && image.naturalHeight > 0);
      assert.ok(Math.abs(
        image.width / image.height - image.naturalWidth / image.naturalHeight
      ) < 0.01, "le guide doit afficher chaque capture sans la rogner");
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletHelp = await page.evaluate(() => ({
      dialogWidth: document.querySelector("#readmeDialog").getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
      contentOverflow: (
        document.querySelector(".project-help-content").scrollWidth
        - document.querySelector(".project-help-content").clientWidth
      ),
      images: Array.from(document.querySelectorAll("#readmeDialog img")).map(image => ({
        width: image.clientWidth,
        height: image.clientHeight,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      }))
    }));
    assert.ok(tabletHelp.dialogWidth <= tabletHelp.viewportWidth);
    assert.ok(tabletHelp.contentOverflow <= 1);
    for (const image of tabletHelp.images) {
      assert.ok(Math.abs(
        image.width / image.height - image.naturalWidth / image.naturalHeight
      ) < 0.01, "la tablette doit afficher chaque capture sans la rogner");
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click("#closeReadmeHelp");

});

browserCase("simulator:ports.03", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const html = fs.readFileSync(simulatorPath, "utf8");
    assert.match(
      html,
      /<script data-port-topology="embedded">/
    );
    assert.doesNotMatch(html, /<script[^>]+data-port-topology[^>]+src=/);
    assert.match(html, /id:\s*"port-pedagogique"/);
    assert.equal(portTopology.schemaVersion, 2);
    assert.equal(portTopology.id, "port-pedagogique");
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

browserCase("simulator:controls.04", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    // WebAudio starts on a real user gesture, formerly supplied by the preceding guide case.
    await page.locator(".brand").click();
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

browserCase("simulator:controls.53", async ({ page }) => {
    const before = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    for (const kind of ["wind", "current"]) {
      assert.equal(await page.locator(`label[for="${kind}Direction"]`).textContent(), "Direction");
      assert.equal(await page.locator(`#${kind}Direction`).inputValue(), "180");
      await page.locator(`#${kind}Direction`).evaluate(input => {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), before,
      "réappliquer la direction affichée doit conserver exactement l'état physique");

    for (const direction of [0, 90, 120, 180, 270, 359]) {
      for (const kind of ["wind", "current"]) {
        await page.locator(`#${kind}Direction`).evaluate((input, direction) => {
          input.value = String(direction);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }, direction);
        const heading = String(direction).padStart(3, "0");
        assert.equal(await page.locator(`#${kind}ChipDirection`).textContent(), `Direction ${heading}°`);
        assert.equal(await page.locator(`[data-value-for="${kind}Direction"]`).textContent(), `${heading}°`);
        assert.ok((await page.locator(`#${kind}Summary`).textContent()).endsWith(`· ${heading}°`));
        assert.equal(await page.locator(`#${kind}Arrow`).evaluate(element =>
          element.style.getPropertyValue("--rotation")), `${direction}deg`);
      }
      const environment = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().environment);
      assert.equal(environment.windFromDeg, (direction + 180) % 360);
      assert.equal(environment.currentFromDeg, (direction + 180) % 360);
    }
    // Displaying a new bearing preserves the existing world/physics vector convention.
    for (const [kind, speed] of [["wind", "12"], ["current", "1.4"]]) {
      await page.locator(`#${kind}Speed`).evaluate((input, value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, speed);
    }
    const units = await page.evaluate(() => window.__PORTANCE_TEST__.unitCoherenceReport());
    for (const kind of ["wind", "current"]) {
      for (const axis of ["east", "north"]) {
        assert.ok(Math.abs(units[kind].visualVector[axis] - units[kind].physicsVector[axis]) < 1e-9);
      }
      assert.ok(units[kind].visualVector.east < 0);
      assert.ok(units[kind].visualVector.north > 0);
    }
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    for (const kind of ["wind", "current"]) {
      assert.equal(await page.locator(`#${kind}Direction`).inputValue(), "180");
      assert.equal(await page.locator(`#${kind}ChipDirection`).textContent(), "Direction 180°");
    }
});

browserCase("simulator:interface.05", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:ports.06", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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
    const portBanner = await page.locator("#communityPortCard").innerText();
    assert.doesNotMatch(portBanner, /Équipage Test/);
    assert.doesNotMatch(portBanner, /47\.58626|-3\.02937/);
    assert.match(portBanner, /08:00–20:00/);
    assert.match(portBanner, /jusant/);
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
    assert.equal(pedagogicalPort.metadata.name, "Port - bassin pédagogique");
    assert.equal(pedagogicalPort.metadata.author, "KJP");
    assert.equal(pedagogicalPort.metadata.id, "port-pedagogique");
    assert.equal(pedagogicalPort.metadata.comment, undefined);
    assert.equal(pedagogicalPort.url, "https://github.com/arnaud2moissac/KJP_Port_Simulator");
    assert.match(pedagogicalPort.rows.join(" "), /KJP/);
    await page.locator("#portInfoButton").click();

});

browserCase("simulator:ports.07", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const select = page.locator("#portSourceSelect");
    const initialOptions = await select.locator("option").allTextContents();
    assert.equal(initialOptions[0], "Port pédagogique");
    assert.deepEqual(initialOptions.slice(-2), ["Charger la Trinité", "Construire un port"]);
    await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text),
      createPortInformationText());
    assert.deepEqual(await select.locator("option").allTextContents(), [
      "Port pédagogique", "Port des informations", "Bibliothèque de ports", "Charger la Trinité", "Construire un port"
    ]);
    assert.equal(await select.inputValue(), "community");

    const trinitePath = path.join(projectRoot, "la_Trinite.kjp");
    const triniteText = fs.readFileSync(trinitePath, "utf8");
    assert.equal(KJPCodec.parse(triniteText).metadata.name, "La Trinité sur mer");
    const triniteUrl = "https://arnaud2moissac.github.io/KJP_Port_Simulator/la_Trinite.kjp";
    await page.route(triniteUrl, route => route.fulfill({
      status: 200, contentType: "application/json", body: triniteText,
      headers: { "access-control-allow-origin": "*" }
    }));
    await select.selectOption("loadTrinite");
    await page.waitForFunction(() => document.querySelector("#impactToast").textContent
      === "Fichier trouvé, en cours de chargement…");
    await page.waitForFunction(() => window.__PORTANCE_TEST__.portInformationReport().metadata.name === "La Trinité sur mer");
    assert.equal(await page.locator("#impactToast").textContent(), "Fichier chargé · La Trinité sur mer");
    assert.equal(await select.inputValue(), "community");
    assert.deepEqual(await select.locator("option").allTextContents(), [
      "Port pédagogique", "La Trinité sur mer", "Bibliothèque de ports", "Charger la Trinité", "Construire un port"
    ]);
    await page.unroute(triniteUrl);

    await page.evaluate(() => {
      window.__originalPortWindowOpen = window.open;
      window.open = (...args) => { window.__portWindowOpen = args; return null; };
    });
    await select.selectOption("buildPort");
    assert.deepEqual(await page.evaluate(() => window.__portWindowOpen), [
      "https://arnaud2moissac.github.io/KJP_Port_Simulator/generateur-port.html",
      "_blank", "noopener,noreferrer"
    ]);
    assert.equal(await select.inputValue(), "community");
    await page.evaluate(() => { window.open = window.__originalPortWindowOpen; });
    await page.evaluate(() => window.__PORTANCE_TEST__.restoreBuiltInPort());

});

browserCase("simulator:rendering.08", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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
      Math.abs(displayedKnots - motion.groundSpeed / 0.514444) <= 0.051,
      "la vitesse affichée ne correspond pas à la vitesse physique"
    );

});

browserCase("simulator:camera.09", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:camera.10", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:rendering.11", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:rendering.12", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    // Raster comparison belongs to renderer qualification, not this theme interaction.
    const assertSceneReady = async () => {
      const report = await page.evaluate(() => ({
        visual: window.__PORTANCE_TEST__.visualReport().renderer,
        performance: window.__PORTANCE_TEST__.renderPerformanceReport().renderer
      }));
      assert.equal(report.visual.backend, "native");
      assert.equal(report.visual.glError, 0);
      assert.ok(report.performance.frames > 0);
      assert.ok(report.performance.memory.geometries > 0);
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
    await assertSceneReady();
    const darkReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.visualThemeReport()
    );
    assert.equal(darkReport.id, "dark");
    assert.equal(darkReport.toggle.text, "");
    assert.equal(darkReport.toggle.pressed, "false");
    assert.match(darkReport.toggle.ariaLabel, /carte marine clair/);
    assert.equal(darkReport.compositor.themeId, "dark");
    assert.equal(darkReport.compositor.owner, "stage");
    assert.equal(darkReport.compositor.canvasBackground, "transparent");
    assert.match(darkReport.compositor.background, /linear-gradient/);
    assert.ok(relativeLuminance(darkReport.water.sky.horizon) > relativeLuminance(darkReport.water.base));
    assert.equal(darkReport.presentation.mode, "understand");
    assert.equal(darkReport.presentation.radiograph, true);
    assert.equal(darkReport.presentation.wireframe, false);

    await page.locator("#themeToggle").click();
    await page.waitForTimeout(100);
    await assertSceneReady();
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

    await page.locator("#themeToggle").click();
    await page.waitForTimeout(300);
    await assertSceneReady();
    const restoredDarkReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.visualThemeReport()
    );
    assert.equal(restoredDarkReport.id, "dark");
    assert.deepEqual(
      restoredDarkReport.compositor,
      darkReport.compositor,
      "le compositeur conserve le fond clair après le retour au thème nocturne"
    );

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

    for (const view of ["top", "skipper"]) {
      const report = await page.evaluate(selected => {
        const api = window.__PORTANCE_TEST__;
        api.selectCameraView(selected);
        return api.visualThemeReport();
      }, view);
      await page.waitForTimeout(80);
      await assertSceneReady();
      assert.equal(report.id, "chart");
      assert.equal(report.grid.enabled, view !== "skipper");
      assert.equal(report.water.horizonY === 0, view === "top");
      if (view === "skipper") {
        assert.ok(report.water.horizonY > 0, "l'horizon n'est pas visible en vue Skipper");
        assert.ok(relativeLuminance(report.water.sky.horizon) > relativeLuminance(report.water.base));
      }
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

browserCase("simulator:rendering.13", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.worldRendererReport());
    assert.equal(report.active, "native");
    assert.equal(report.glError, 0);
    assert.equal(report.flow.wind.kind, "filaments");
    assert.equal(report.flow.current.kind, "arrows");
    for (const [id, speedKn] of [["wind", 12], ["current", 2]]) {
      const field = report.flow[id];
      assert.ok(field.particles > 0, id + ": visible particles");
      assert.equal(field.drawCalls, 1, id + ": instanced field is drawn");
      assert.ok(Math.abs(Math.hypot(...field.vector) - speedKn * .514444) < 1e-8,
        id + ": presentation preserves the physical speed in m/s");
    }

});

browserCase("simulator:rendering.14", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const unchangedBefore = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.selectWorldRenderer("native");
      api.selectCameraView("top");
      api.reset(
        { x: 200, y: 200, heading: 0 },
        {
          windSpeedKn: 12,
          windFromDeg: 270,
          currentSpeedKn: 0,
          currentFromDeg: 0,
          propWalk: 0
        }
      );
      const snapshot = api.snapshot();
      return {
        motion: snapshot.motion,
        controls: snapshot.controls,
        moorings: snapshot.moorings
      };
    });
    await page.locator('[data-mode="understand"]').click();
    const unchangedAfter = await page.evaluate(() => {
      const snapshot = window.__PORTANCE_TEST__.snapshot();
      return {
        motion: snapshot.motion,
        controls: snapshot.controls,
        moorings: snapshot.moorings
      };
    });
    assert.deepEqual(
      unchangedAfter,
      unchangedBefore,
      "changer de mode a modifié l'état physique"
    );

    const crosswind = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.advance(api.snapshot().timing.fixedDt);
      return {
        snapshot: api.snapshot(),
        report: api.understandingForceReport()
      };
    });
    const rawWind = crosswind.snapshot.forceParts.filter(part => part.name === "Vent");
    const representedWind = crosswind.report.parts.filter(
      part => part.representation === "wind-resultant"
    );
    const closeTo = (actual, expected, label) => assert.ok(
      Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)),
      `${label}: ${actual} au lieu de ${expected}`
    );
    const total = (parts, key) => parts.reduce(
      (sum, part) => sum + (Number.isFinite(part[key]) ? part[key] : 0),
      0
    );

    assert.ok(rawWind.length > 2, "le test doit couvrir plusieurs panneaux aérodynamiques");
    assert.ok(rawWind.every(part => Number.isFinite(part.power)));
    assert.deepEqual(
      representedWind.map(part => part.name),
      ["Vent avant", "Vent arrière"]
    );
    assert.equal(
      representedWind.reduce((sum, part) => sum + part.contributorCount, 0),
      rawWind.length,
      "un panneau a été omis ou affecté deux fois"
    );
    assert.equal(
      crosswind.snapshot.forceParts.some(part => part.name === "Vent avant"),
      false,
      "snapshot().forceParts ne doit pas devenir une vue de présentation"
    );
    assert.ok(representedWind.every(part => part.visible));

    for (const represented of representedWind) {
      const rawHalf = rawWind.filter(part => (
        represented.windHalf === "fore" ? part.x >= 0 : part.x < 0
      ));
      assert.equal(represented.contributorCount, rawHalf.length);
      assert.ok(
        represented.windHalf === "fore" ? represented.x >= 0 : represented.x < 0,
        `${represented.name}: centre d'effort placé dans la mauvaise demi-coque`
      );
      assert.ok(
        represented.windHalf === "fore"
          ? represented.centroid.x >= 0
          : represented.centroid.x < 0
      );
      for (const key of ["fx", "fy", "moment", "power"]) {
        closeTo(represented[key], total(rawHalf, key), `${represented.name} ${key}`);
      }
      closeTo(
        represented.x * represented.fy - represented.y * represented.fx,
        represented.moment,
        `${represented.name} moment sur la ligne d'action`
      );
      closeTo(
        represented.vectorLength,
        Math.hypot(represented.fx, represented.fy) * crosswind.report.scale,
        `${represented.name} échelle de la flèche`
      );
    }
    for (const key of ["fx", "fy", "moment", "power"]) {
      closeTo(total(representedWind, key), total(rawWind, key), `total aérodynamique ${key}`);
    }
    assert.ok(
      Math.hypot(total(representedWind, "fx"), total(representedWind, "fy"))
        > Math.hypot(rawWind[0].fx, rawWind[0].fy),
      "la représentation retombe sur le premier panneau"
    );

    await page.locator('[data-mode="navigation"]').click();
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await page.locator("#windSpeed").evaluate(input => {
      input.value = "12";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#windDirection").evaluate(input => {
      input.value = "180";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator('[data-mode="understand"]').click();
    const dock = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.advance(.5);
      const before = api.snapshot();
      const report = api.understandingForceReport();
      const after = api.snapshot();
      return { before, report, after };
    });
    assert.deepEqual(dock.after, dock.before, "le rapport de présentation modifie la simulation");
    const rawMoorings = dock.before.forceParts.filter(part => part.category === "mooring");
    const representedMoorings = dock.report.parts.filter(part => part.category === "mooring");
    assert.ok(rawMoorings.length > 0, "le scénario doit exercer au moins une aussière");
    assert.deepEqual(
      representedMoorings.map(({ mooringId, fx, fy, x, y, moment, tension }) => ({
        mooringId, fx, fy, x, y, moment, tension
      })),
      rawMoorings.map(({ mooringId, fx, fy, x, y, moment, tension }) => ({
        mooringId, fx, fy, x, y, moment, tension
      })),
      "les contributions individuelles des aussières ont été agrégées ou altérées"
    );
    const dockWind = dock.report.parts.filter(
      part => part.representation === "wind-resultant"
    );
    const windResultant = Math.hypot(total(dockWind, "fx"), total(dockWind, "fy"));
    const mooringResultant = Math.hypot(total(rawMoorings, "fx"), total(rawMoorings, "fy"));
    const mooringIndividualSum = rawMoorings.reduce(
      (sum, part) => sum + Math.hypot(part.fx, part.fy),
      0
    );
    assert.ok(windResultant > 0 && mooringResultant > 0);
    assert.ok(
      mooringIndividualSum + 1e-9 >= mooringResultant,
      "les tensions individuelles ont été confondues avec leur résultante vectorielle"
    );
    assert.equal(dockWind.length, 2);
    assert.ok(dockWind.every(part => part.visible));

    await page.locator('[data-mode="navigation"]').click();

});

browserCase("simulator:audio.15", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.locator(".brand").click();
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

browserCase("simulator:audio.16", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const touchPage = await browser.newPage({
      locale: "fr-FR",
      viewport: { width: 1024, height: 768 },
      isMobile: true,
      hasTouch: true
    });
    try {
      await touchPage.goto(testUrl.href);
      await touchPage.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
      const initial = await touchPage.evaluate(() => window.__PORTANCE_TEST__.engineAudioReport());
      assert.equal(initial.enabled, true);
      assert.equal(initial.started, false);
      const canvas = await touchPage.locator("#scene").boundingBox();
      await touchPage.touchscreen.tap(canvas.x + canvas.width / 2,
        canvas.y + canvas.height / 2);
      await touchPage.waitForFunction(() =>
        window.__PORTANCE_TEST__.engineAudioReport().contextState === "running"
      );
      const started = await touchPage.evaluate(() => window.__PORTANCE_TEST__.engineAudioReport());
      assert.equal(started.started, true);
      assert.equal(started.error, "");
    } finally {
      await touchPage.close();
    }

});

browserCase("simulator:controls.17", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

      return {
        normal,
        accelerated,
        report,
        theme
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

    await page.locator("#timeScaleButton").click();
    const normalReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.timeScaleReport()
    );
    assert.equal(normalReport.scale, 1);
    assert.equal(normalReport.button.pressed, "false");
    assert.equal(normalReport.playerHull, normalReport.normalPlayerHull);

});

browserCase("simulator:interface.18", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const readDisplays = async () => {
      await page.waitForTimeout(50);
      return {
        sog: await page.locator("#sogValue").textContent(),
        stw: await page.locator("#stwValue").textContent(),
        sogAxial: await page.locator("#sogAxialValue").textContent(),
        stwAxial: await page.locator("#stwAxialValue").textContent()
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
    assert.ok(
      Math.abs(parseDisplay(aheadDisplay.sog) - ahead.groundSpeed / 0.514444) <= 0.051
    );
    assert.ok(
      Math.abs(parseDisplay(aheadDisplay.stw) - ahead.waterSpeed / 0.514444) <= 0.051
    );
    assert.match(aheadDisplay.sogAxial, /^\+/);
    assert.match(aheadDisplay.stwAxial, /^\+/);
    assert.ok(
      Math.abs(parseDisplay(aheadDisplay.sogAxial) - ahead.signedGroundSpeed / 0.514444) <= 0.051
    );
    assert.ok(
      Math.abs(parseDisplay(aheadDisplay.stwAxial) - ahead.signedWaterSpeed / 0.514444) <= 0.051
    );

    const astern = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 200, y: 200, heading: 0 });
      api.setControls({ throttleTarget: -0.5 });
      return api.advance(5);
    });
    const asternDisplay = await readDisplays();
    assert.ok(
      Math.abs(parseDisplay(asternDisplay.sog) - astern.groundSpeed / 0.514444) <= 0.051
    );
    assert.ok(
      Math.abs(parseDisplay(asternDisplay.stw) - astern.waterSpeed / 0.514444) <= 0.051
    );
    assert.match(asternDisplay.sogAxial, /^−/);
    assert.match(asternDisplay.stwAxial, /^−/);
    assert.ok(
      Math.abs(parseDisplay(asternDisplay.sogAxial) - astern.signedGroundSpeed / 0.514444) <= 0.051
    );
    assert.ok(
      Math.abs(parseDisplay(asternDisplay.stwAxial) - astern.signedWaterSpeed / 0.514444) <= 0.051
    );

    const beamCurrent = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset(
        { x: 200, y: 200, heading: -110 * Math.PI / 180 },
        { currentSpeedKn: 2.5, currentFromDeg: 270 }
      );
      return api.advance(25);
    });
    const beamCurrentDisplay = await readDisplays();
    assert.ok(beamCurrent.groundSpeed / 0.514444 > 2.2);
    assert.ok(beamCurrent.signedGroundSpeed < 0);
    assert.ok(
      Math.abs(parseDisplay(beamCurrentDisplay.sog) - beamCurrent.groundSpeed / 0.514444) <= 0.051
    );
    assert.ok(
      Math.abs(parseDisplay(beamCurrentDisplay.sogAxial) - beamCurrent.signedGroundSpeed / 0.514444) <= 0.051
    );

    await page.evaluate(() => window.__PORTANCE_TEST__.reset(
      { x: 200, y: 200, heading: 0 }
    ));
    const stoppedDisplay = await readDisplays();
    assert.equal(stoppedDisplay.sog, "0,0");
    assert.equal(stoppedDisplay.stw, "0,0");
    assert.equal(stoppedDisplay.sogAxial, "0,0");
    assert.equal(stoppedDisplay.stwAxial, "0,0");

});

browserCase("simulator:topology.19", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.geometryReport());
    assert.equal(report.ok, true, report.failures.join("\n"));
    assert.deepEqual(report.counts, {
      docks: 5,
      catways: 30,
      mooringCleats: 226,
      staticBoats: 18,
      scenarios: 12
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

browserCase("simulator:topology.20", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:moorings.21", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:moorings.22", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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
      const pickup = api.pickupPendille("pendille-med-2", "stern-starboard");
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
    assert.equal(result.securedPendille.boatCleatId, "stern-starboard");
    assert.equal(result.securedLine.sourceType, "pendille");
    assert.equal(result.securedLine.workingLoadN, 12000);
    assert.ok(result.securedLine.maximumLength > 20);

});

browserCase("simulator:calibration.23", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const advanced = page.locator("#advancedDetails");
    await advanced.evaluate(element => {
      element.open = true;
    });
    assert.equal(await page.locator("#expertDetails").count(), 0);
    const advancedRanges = await advanced.locator('input[type="range"]').evaluateAll(inputs => (
      inputs.map(input => ({
        id: input.id,
        min: input.min,
        max: input.max,
        step: input.step,
        value: input.value
      }))
    ));
    assert.deepEqual(
      advancedRanges.map(input => input.id),
      [
        "mouseHelmSensitivity",
        "boatMass",
        "windage",
        "rudderEfficiency",
        "lateralResistance",
        "propWalk",
        "mooringAttachSpeed"
      ]
    );
    assert.deepEqual(advancedRanges, [
      { id: "mouseHelmSensitivity", min: "25", max: "300", step: "5", value: "100" },
      { id: "boatMass", min: "5700", max: "7800", step: "50", value: "6500" },
      { id: "windage", min: "60", max: "140", step: "1", value: "100" },
      { id: "rudderEfficiency", min: "60", max: "140", step: "1", value: "100" },
      { id: "lateralResistance", min: "60", max: "140", step: "1", value: "100" },
      { id: "propWalk", min: "0", max: "100", step: "1", value: "60" },
      { id: "mooringAttachSpeed", min: "0.1", max: "1", step: "0.1", value: "0.6" }
    ]);
    assert.deepEqual(
      await advanced.locator(".advanced-group-title").allTextContents(),
      ["Commandes", "Bateau"]
    );
    assert.equal(await advanced.locator("#propWalk").count(), 1);
    assert.equal(await page.locator('label[for="propWalk"]').textContent(), "Effet de pas · hélice");
    assert.equal(await page.locator("#windSpeed").evaluate(node => Boolean(node.closest("#advancedDetails"))), false);
    assert.equal(await page.locator("#currentSpeed").evaluate(node => Boolean(node.closest("#advancedDetails"))), false);

    const rotation = page.locator("#propulsorRotationControls button");
    assert.equal(await rotation.count(), 1);
    assert.equal((await rotation.textContent()).trim(), "Droitière ⇄");
    assert.equal(await rotation.getAttribute("aria-pressed"), "false");
    assert.match(await rotation.getAttribute("aria-label"), /shaft-propeller.*droitière.*gauchère/i);
    assert.equal(await page.locator("#propWalk").inputValue(), "60");

    const beforeToggle = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    await rotation.click();
    const afterToggle = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal((await rotation.textContent()).trim(), "Gauchère ⇄");
    assert.equal(await rotation.getAttribute("aria-pressed"), "true");
    assert.match(await page.locator("#propWalkDetails").textContent(), /tribord/);
    assert.equal(await page.locator("#propWalk").inputValue(), "60");
    assert.equal(afterToggle.propulsion.units[0].rotation, "left");
    assert.deepEqual(afterToggle.motion, beforeToggle.motion);
    assert.deepEqual(afterToggle.controls, beforeToggle.controls);
    assert.deepEqual(afterToggle.contacts, beforeToggle.contacts);
    assert.deepEqual(afterToggle.moorings, beforeToggle.moorings);
    assert.deepEqual(afterToggle.timing, beforeToggle.timing);
    const withoutRotation = propulsion => {
      const copy = structuredClone(propulsion);
      delete copy.rotation;
      copy.units.forEach(unit => delete unit.rotation);
      return copy;
    };
    assert.deepEqual(
      withoutRotation(afterToggle.propulsion),
      withoutRotation(beforeToggle.propulsion)
    );

    await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("en"));
    assert.equal((await rotation.textContent()).trim(), "Left-handed ⇄");
    assert.match(await page.locator("#propWalkDetails").textContent(), /starboard/);
    await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("br"));
    assert.equal((await rotation.textContent()).trim(), "Kleiz ⇄");
    await page.evaluate(() => window.__PORTANCE_TEST__.selectLocale("fr"));

    const restarted = await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockReverse"));
    assert.equal(restarted.propulsion.units[0].rotation, "left");
    await page.selectOption("#scenarioSelect", "placement");
    assert.equal(await rotation.isDisabled(), true);
    await page.click("#placementConfirm");
    const prepared = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.equal(prepared.phase, "mooring");
    assert.equal(prepared.core.propulsion.units[0].rotation, "left");
    await page.click("#placementCancel");
    const restored = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
    assert.equal(restored.core.propulsion.units[0].rotation, "left");
    assert.equal(await rotation.isDisabled(), false);
    assert.equal((await rotation.textContent()).trim(), "Gauchère ⇄");

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

browserCase("simulator:moorings.24", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:scenarios.25", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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
        while (!state.scenario.challenge.pivotAchieved && reverseSeconds < 26) {
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
    assert.ok(result.reverseSeconds <= 26);
    assert.ok(result.openingDeg >= 20 && result.openingDeg <= 35);
    assert.equal(result.challenge.safeRelease, true);
    assert.equal(result.challenge.unsafeReleases, 0);
    assert.equal(result.complete, true);
    assert.ok(result.score >= 80);
    assert.equal(result.contacts.severe, 0);
    assert.ok(result.contacts.maxImpact < .4);
    assert.equal(result.remainingLines, 0);

});

browserCase("simulator:moorings.26", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:moorings.27", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:moorings.28", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    for (const theme of ["dark", "chart"]) {
      await page.evaluate(selectedTheme => {
        const api = window.__PORTANCE_TEST__;
        api.loadScenario("dockForward");
        api.selectVisualTheme(selectedTheme);
      }, theme);
      for (const view of ["top", "skipper"]) {
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

browserCase("simulator:topology.29", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.geometryReport());
    assert.equal(report.berthing.ok, true, report.berthing.failures.join("\n"));
    assert.equal(report.berthing.occupiedSlotCount, 19);
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

browserCase("simulator:topology.30", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:topology.31", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const navigation = await page.evaluate(
      () => window.__PORTANCE_TEST__.geometryReport().navigation
    );
    assert.equal(navigation.ok, true, navigation.failures.join("\n"));
    assert.equal(navigation.allBerthsAccessible, true);
    assert.equal(navigation.allExitLanesAccessible, true);
    assert.equal(navigation.berthRoutes.length, 19);
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

browserCase("simulator:scenarios.32", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:topology.33", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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
        id === "mooring" ? 8 : ["medDock", "medDeparture", "starboardDock"].includes(id) ? 10 : 0,
        `${id}: vent initial inattendu`
      );
      assert.equal(scenario.environment.currentSpeedKn, 0, `${id}: courant initial non nul`);
    }

});

browserCase("simulator:physics.34", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:physics.35", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.physicsReport());
    assert.equal(report.version, "6.0.0");
    const matrix = report.mass.matrix;
    assert.equal(matrix.length, 3);
    assert.equal(matrix[1][2], matrix[2][1]);
    assert.ok(matrix[0][0] > 0);
    assert.ok(matrix[0][0] * matrix[1][1] > 0);
    assert.ok(matrix[1][1] * matrix[2][2] - matrix[1][2] ** 2 > 0);
    assert.equal(report.profile.id, "sun-odyssey-36i-pedagogical");
    assert.equal(report.profile.version, "6.0.1");
    assert.equal(report.profile.schemaVersion, 4);

});

browserCase("simulator:physics.36", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const responses = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      const initialHeading = Math.PI / 2;
      const run = windFromDeg => {
        api.reset({ x: 25, y: 48, heading: initialHeading }, {
          windSpeedKn: 12,
          windFromDeg,
          currentSpeedKn: 0,
          currentFromDeg: 0,
          propWalk: 0
        });
        return api.advance(60).motion.heading;
      };
      return {
        initialHeading,
        starboard: run(90),
        port: run(270)
      };
    });
    assert.ok(responses.starboard > responses.initialHeading + 2 * Math.PI / 180);
    assert.ok(responses.port < responses.initialHeading - 2 * Math.PI / 180);
    assert.ok(Math.abs(
      responses.starboard + responses.port - 2 * responses.initialHeading
    ) < 1e-8);

});

browserCase("simulator:rendering.37", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const report = await page.evaluate(() => window.__PORTANCE_TEST__.visualReport());
    assert.ok(report.renderedFreeboard >= 1, "le bateau paraît trop bas sur l'eau");
    assert.ok(report.playerCabinRoofZ > report.playerDeckZ + .5);
    assert.ok(report.bowMarkerX > 0, "le repère d'étrave doit être placé vers l'avant");
    assert.equal(report.physicsCanoeDraft, .68);
    assert.notEqual(report.renderedFreeboard, report.physicsCanoeDraft);

});

browserCase("simulator:physics.38", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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
    assert.ok(Math.abs(responses[35].motion.r) > Math.abs(responses[15].motion.r));
    assert.ok(
      Math.abs(responses[35].motion.r) < Math.abs(responses[25].motion.r),
      "le décrochage à la barre maximale doit réduire le taux de giration"
    );
    assert.ok(
      Math.abs(responses[35].motion.r) - Math.abs(responses[25].motion.r)
      < Math.abs(responses[15].motion.r) - Math.abs(responses[5].motion.r)
    );
    assert.ok(responses[15].diagnostics.pivotWaterX > 0);

});

browserCase("simulator:physics.39", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:physics.40", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:physics.41", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const classes = await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      return [.1, .2, .21, .4, .41].map(speed => api.impactClass(speed));
    });
    assert.deepEqual(classes, ["safe", "safe", "warning", "warning", "severe"]);

});

browserCase("simulator:controls.42", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await page.locator("#scene").focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.down("ArrowDown");
    try {
      await page.waitForFunction(() => (
        window.__PORTANCE_TEST__.snapshot().controls.throttleTarget === 0
        && document.querySelector("#neutralGate")?.textContent.includes("relâchez")
      ));
      assert.equal(await page.locator("#throttleLabel").textContent(), "Neutre");
      assert.match(await page.locator("#neutralGate").textContent(), /relâchez/);
    } finally {
      await page.keyboard.up("ArrowDown");
    }
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(50);
    assert.equal(await page.locator("#throttleLabel").textContent(), "AR ralenti");

});

browserCase("simulator:controls.43", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await page.locator("#scene").focus();
    await page.keyboard.press("q");
    let snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.gearTarget, 1);
    assert.equal(snapshot.controls.throttleTarget, 0);
    await page.waitForFunction(() => document.querySelector("#throttleLabel")?.textContent === "AV ralenti");
    await page.keyboard.press("Q");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, .05);
    await page.waitForFunction(() => (
      document.querySelector("#throttleLabel")?.textContent === "Avant · 5 %"
    ));
    assert.equal(await page.locator("#throttleLabel").textContent(), "Avant · 5 %");
    await page.keyboard.press("Q");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, .1);

    await page.keyboard.down("w");
    try {
      await page.waitForFunction(() => (
        window.__PORTANCE_TEST__.snapshot().controls.throttleTarget === 0
        && document.querySelector("#neutralGate")?.textContent.includes("relâchez")
      ));
      snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
      assert.equal(snapshot.controls.throttleTarget, 0);
      assert.match(await page.locator("#neutralGate").textContent(), /relâchez/);
    } finally {
      await page.keyboard.up("w");
    }
    await page.keyboard.press("W");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.gearTarget, -1);
    assert.equal(snapshot.controls.throttleTarget, 0);
    await page.keyboard.press("W");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, -.1);
    assert.match(await page.locator(".keyboard-help").textContent(), /Q.*W/s);

});

browserCase("simulator:rendering.44", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const visual = await page.evaluate(() => window.__PORTANCE_TEST__.visualReport());
    assert.equal(visual.collision.fenderRadius, visual.physicsFenderRadius);
    assert.equal(visual.fender.model, "vertical-cylinder");
    assert.equal(visual.fender.radius, visual.physicsFenderRadius);
    assert.equal(visual.fender.diameter, .35);
    assert.equal(visual.fender.radius, .175);
    assert.ok(visual.fender.height >= visual.fender.radius * 2);
    assert.ok(visual.fender.clearances.every(item => Math.abs(item.gap + .01) <= 1e-9));
    assert.deepEqual(visual.collisionEnvelope, {
      visible: false,
      reference: "gunwale",
      samples: 30
    });
    assert.equal(visual.renderer.webgl2, true);
    assert.equal(visual.renderer.painterFallback, false);
    assert.equal(visual.renderer.backend, "native");
    assert.equal(visual.renderer.glError, 0);
    assert.equal(visual.flow.wind.shape, "straight");
    assert.equal(visual.flow.current.shape, "wave");
    assert.ok(visual.flow.current.amplitudeMeters >= .2);
    assert.equal(visual.collision.hullVisible, false);
    assert.deepEqual(visual.boatMesh, {
      cockpit: "recessed-ring",
      overlappingCockpitSurfaces: false
    });

});

browserCase("simulator:rendering.45", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.waitForTimeout(120);
    const performanceReport = await page.evaluate(
      () => window.__PORTANCE_TEST__.renderPerformanceReport()
    );
    assert.ok(performanceReport.sampleCount > 0);
    assert.equal(performanceReport.interpolation, "fixed-step-visual");
    assert.equal(performanceReport.cameraSmoothing, "time-based");
    assert.equal(performanceReport.lastFrameVisibilityComputations, 1);
    assert.ok(performanceReport.precomputedBoxGeometries > 0);
    assert.ok(performanceReport.precomputedShoreCleats > 0);
    assert.equal(performanceReport.renderer.backend, "native");
    assert.ok(performanceReport.renderer.frames > 0);
    assert.ok(performanceReport.renderer.memory.geometries > 0);

});

browserCase("simulator:ports.46", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
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

browserCase("simulator:controls.54", async ({ page }) => {
  const scene = page.locator("#scene");
  await scene.evaluate(node => node.addEventListener("keyup", event => {
    if (event.key === "Alt") node.dataset.altKeyupSuppressed = String(event.defaultPrevented);
  }));
  const box = await scene.boundingBox();
  const x = box.x + box.width * .45, y = box.y + box.height * .3;
  await page.mouse.move(x, y);
  await scene.focus();
  const before = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await page.keyboard.down("Alt");
  assert.equal(await scene.getAttribute("data-mouse-mode"), "helm");
  await page.keyboard.down("Alt");
  await page.keyboard.up("Alt");
  assert.equal(await scene.getAttribute("data-mouse-mode"), "helm");
  assert.equal(await scene.getAttribute("data-alt-keyup-suppressed"), "true");
  await page.keyboard.press("Alt");
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await scene.dispatchEvent("keydown", { key: "Alt", code: "AltRight", altKey: true });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "helm");
  await scene.dispatchEvent("keydown", { key: "Alt", code: "AltRight", altKey: true, repeat: true });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "helm");
  await scene.dispatchEvent("keyup", { key: "Alt", code: "AltRight" });
  await page.mouse.click(x, y, { button: "right" });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await page.keyboard.press("Control+Alt");
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await page.mouse.click(x, y, { button: "right" });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "helm");
  await scene.dispatchEvent("contextmenu", { button: 2 });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "helm");
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot()), before);
  await page.keyboard.press("Escape");
  await page.mouse.down();
  await page.mouse.move(x + 15, y + 10);
  const camera = await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport());
  await page.keyboard.press("Alt");
  await page.mouse.up();
  await page.mouse.move(x + 15, y + 30);
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport()), camera,
    "la bascule doit terminer le glisser caméra sans geste résiduel");
});

browserCase("simulator:controls.55", async ({ page }) => {
  const scene = page.locator("#scene");
  const box = await scene.boundingBox();
  const x = box.x + box.width * .45, y = box.y + box.height * .3;
  const angle = () => page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget);
  const close = (actual, degrees) => assert.ok(Math.abs(actual - degrees * Math.PI / 180) < 1e-10);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { button: "right" });
  const camera = await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport());
  await page.mouse.move(x + 100, y);
  close(await angle(), -10);
  await page.mouse.move(x + 100, y + 100);
  close(await angle(), -10);
  await page.mouse.move(x + 50, y + 100);
  close(await angle(), -5);
  await page.mouse.move(x + 50, y + 100);
  close(await angle(), -5);
  await page.evaluate(({ x, y }) => {
    const scene = document.querySelector("#scene");
    for (const nextX of [x + 1000, x + 990]) scene.dispatchEvent(new PointerEvent("pointermove", {
      pointerType: "mouse", pointerId: 1, clientX: nextX, clientY: y
    }));
  }, { x, y });
  close(await angle(), -34);
  await scene.dispatchEvent("pointermove", { pointerType: "mouse", pointerId: 1, clientX: x - 1000, clientY: y });
  close(await angle(), 35);
  await scene.dispatchEvent("pointermove", { pointerType: "mouse", pointerId: 1, clientX: x - 990, clientY: y });
  close(await angle(), 34);
  await page.mouse.wheel(0, 100);
  await page.mouse.dblclick(x + 50, y + 100);
  await page.mouse.down();
  await page.mouse.move(x + 75, y + 120);
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport()), camera);
  const lines = await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().lines);
  const point = lines[0].projectedPoints[Math.floor(lines[0].projectedPoints.length / 2)];
  await page.mouse.click(box.x + point.x, box.y + point.y);
  assert.deepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.mooringReport().lines), lines,
    "cliquer une aussière en mode barre ne doit pas la larguer");
  const heldAngle = await angle();
  await page.mouse.move(10, 10);
  await page.mouse.move(x + 200, y);
  assert.equal(await angle(), heldAngle, "revenir dans la scène ne doit pas faire sauter la barre");
  await page.mouse.move(x + 190, y);
  close(await angle(), heldAngle * 180 / Math.PI + 1);
  for (const theme of ["dark", "chart"]) {
    await page.evaluate(theme => window.__PORTANCE_TEST__.selectVisualTheme(theme), theme);
    const cursor = await scene.evaluate(node => getComputedStyle(node).cursor);
    assert.match(cursor, /data:image\/svg\+xml/);
    assert.match(cursor, /16 16/);
    const image = await scene.evaluate(async node => {
      const src = getComputedStyle(node).cursor.match(/url\("([^\"]+)"\)/)[1];
      const image = new Image(); image.src = src; await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    });
    assert.deepEqual(image, [32, 32]);
  }
  const finalAngle = await angle();
  await page.keyboard.press("Escape");
  assert.equal(await angle(), finalAngle);
  await page.mouse.click(x + 200, y, { button: "middle" });
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(x + 230, y + 20);
  await page.mouse.up({ button: "middle" });
  assert.notDeepEqual(await page.evaluate(() => window.__PORTANCE_TEST__.cameraReport()), camera);
});

browserCase("simulator:controls.56", async ({ page, context }) => {
  const scene = page.locator("#scene");
  const reopen = () => page.goto(page.url());
  const box = await scene.boundingBox();
  const x = box.x + box.width * .45, y = box.y + box.height * .3;
  assert.equal(await page.locator("#mouseHelmSensitivity").inputValue(), "100");
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { button: "right" });
  await page.mouse.move(x + 10, y);
  const before = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget);
  await page.locator("#advancedDetails summary").click();
  await page.locator("#mouseHelmSensitivity").evaluate(input => {
    input.value = "200"; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "helm");
  assert.equal(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget), before);
  await page.mouse.move(x + 100, y);
  assert.equal(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget), before);
  await page.mouse.move(x + 110, y);
  assert.ok(Math.abs((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget))
    - before + 2 * Math.PI / 180) < 1e-10);
  await reopen();
  assert.equal(await page.locator("#mouseHelmSensitivity").inputValue(), "200");
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  assert.equal(await page.locator('[data-value-for="mouseHelmSensitivity"]').textContent(), "200 %");
  for (const value of ["NaN", "0", "301", "42", "Infinity"]) {
    await page.evaluate(value => localStorage.setItem("kjp.mouseHelmSensitivity", value), value);
    await reopen();
    assert.equal(await page.locator("#mouseHelmSensitivity").inputValue(), "100", value);
  }
  await context.addInitScript(() => Object.defineProperty(window, "localStorage", {
    get() { throw new DOMException("Storage unavailable", "SecurityError"); }
  }));
  await reopen();
  assert.equal(await page.locator("#mouseHelmSensitivity").inputValue(), "100");
  await page.locator("#mouseHelmSensitivity").evaluate(input => {
    input.value = "300"; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await page.locator('[data-value-for="mouseHelmSensitivity"]').textContent(), "300 %");
});

browserCase("simulator:controls.57", async ({ page }) => {
  const scene = page.locator("#scene");
  const box = await scene.boundingBox();
  const x = box.x + box.width * .45, y = box.y + box.height * .3;
  const enable = async () => { await page.mouse.click(x, y, { button: "right" }); };
  await enable();
  await page.mouse.move(x + 20, y);
  const held = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  assert.equal(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget), held);
  await enable();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await enable();
  await page.locator("#readmeHelpButton").click();
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await page.keyboard.press("Alt");
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await page.locator("#closeReadmeHelp").click();
  await enable();
  await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockReverse"));
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  await enable();
  await scene.dispatchEvent("pointerdown", { pointerId: 77, pointerType: "touch", clientX: x, clientY: y, button: 0 });
  await scene.dispatchEvent("pointermove", { pointerId: 77, pointerType: "touch", clientX: x + 30, clientY: y + 20 });
  await scene.dispatchEvent("pointerup", { pointerId: 77, pointerType: "touch", clientX: x + 30, clientY: y + 20, button: 0 });
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  assert.equal(await page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls.rudderTarget), 0);
  await enable();
  await page.selectOption("#scenarioSelect", "placement");
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  const placed = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  await scene.focus();
  await page.keyboard.press("Alt");
  await enable();
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  assert.deepEqual((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).core, placed.core);
  await page.locator("#placementCancel").click();
  await page.evaluate(text => window.__PORTANCE_TEST__.importPort(text), mooringPreparationText());
  await page.selectOption("#scenarioSelect", "placement");
  await page.locator("#placementConfirm").click();
  const mooring = await page.evaluate(() => window.__PORTANCE_TEST__.placementReport());
  assert.equal(mooring.phase, "mooring");
  await scene.focus();
  await page.keyboard.press("Alt");
  await enable();
  assert.equal(await scene.getAttribute("data-mouse-mode"), "normal");
  assert.deepEqual((await page.evaluate(() => window.__PORTANCE_TEST__.placementReport())).core, mooring.core);
});

browserCase("simulator:controls.47", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    const wind = page.locator("#windSpeed");
    await wind.click();
    const windBefore = await wind.inputValue();
    await page.keyboard.press("ArrowUp");
    let snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, 0);
    assert.equal(snapshot.controls.gearTarget, 1);
    assert.equal(await wind.inputValue(), windBefore, "la flèche a modifié le curseur de vent");

    assert.equal(await page.locator("#anatomyButton").count(), 0);
    await page.locator("#skipperViewButton").click();
    await page.keyboard.press("ArrowRight");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.ok(snapshot.controls.rudderTarget < 0);
    const rudderBeforePause = snapshot.controls.rudderTarget;
    if (snapshot.controls.paused) await page.locator("#pauseButton").click();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Space");
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.paused, true);
    assert.equal(snapshot.controls.rudderTarget, rudderBeforePause);
    assert.equal(
      await page.locator("#pauseButton").getAttribute("aria-pressed"),
      "true"
    );
    await page.keyboard.press("Space");
    assert.equal((await page.evaluate(() => window.__PORTANCE_TEST__.snapshot())).controls.paused, false);

});

browserCase("simulator:controls.48", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await page.locator("#scene").focus();

    await page.keyboard.down("ArrowUp");
    await page.keyboard.down("ArrowRight");
    let arrowUpHeld = true;
    let arrowRightHeld = true;
    try {
      await page.waitForFunction(() => {
        const controls = window.__PORTANCE_TEST__.snapshot().controls;
        return controls.throttleTarget >= .2
          && controls.rudderTarget <= -5 * Math.PI / 180;
      });
      const simultaneous = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
      assert.ok(
        simultaneous.controls.throttleTarget >= .2,
        "la poussée n'a pas continué à augmenter avec la barre maintenue"
      );
      assert.ok(
        simultaneous.controls.rudderTarget <= -5 * Math.PI / 180,
        "la barre n'a pas continué à tourner avec les gaz maintenus"
      );

      await page.keyboard.up("ArrowRight");
      arrowRightHeld = false;
      const afterRudderRelease = await page.evaluate(
        () => window.__PORTANCE_TEST__.snapshot()
      );
      const rudderAtRelease = afterRudderRelease.controls.rudderTarget;
      const throttleBeforeSingleHold = afterRudderRelease.controls.throttleTarget;
      await page.waitForTimeout(320);
      const throttleOnly = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
      assert.equal(throttleOnly.controls.rudderTarget, rudderAtRelease);
      assert.ok(throttleOnly.controls.throttleTarget > throttleBeforeSingleHold);

      await page.keyboard.up("ArrowUp");
      arrowUpHeld = false;
      const afterThrottleRelease = await page.evaluate(
        () => window.__PORTANCE_TEST__.snapshot()
      );
      const throttleAtRelease = afterThrottleRelease.controls.throttleTarget;
      await page.waitForTimeout(240);
      const released = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
      assert.equal(released.controls.rudderTarget, rudderAtRelease);
      assert.equal(released.controls.throttleTarget, throttleAtRelease);
    } finally {
      if (arrowRightHeld) await page.keyboard.up("ArrowRight");
      if (arrowUpHeld) await page.keyboard.up("ArrowUp");
    }

});

browserCase("simulator:controls.49", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));

    const layout = await page.evaluate(() => {
      const helm = document.querySelector(".touch-helm").getBoundingClientRect();
      const engine = document.querySelector(".touch-engine").getBoundingClientRect();
      const desktop = document.querySelector(".control-dock").getBoundingClientRect();
      const wheel = document.querySelector("#touchHelmWheel").getBoundingClientRect();
      const handle = document.querySelector("#touchThrottleNeutral").getBoundingClientRect();
      return {
        helm: { left: helm.left, right: helm.right, width: helm.width },
        engine: { left: engine.left, right: engine.right, width: engine.width },
        desktopVisible: desktop.width > 0 && desktop.height > 0,
        wheel: { width: wheel.width, height: wheel.height },
        handle: { width: handle.width, height: handle.height },
        middle: innerWidth / 2
      };
    });
    assert.ok(layout.helm.right < layout.middle);
    assert.ok(layout.engine.left > layout.middle);
    assert.equal(layout.desktopVisible, false);
    assert.ok(layout.wheel.width >= 80 && layout.wheel.height >= 80);
    assert.ok(layout.handle.width >= 52 && layout.handle.height >= 40);

    const helmBox = await page.locator("#touchHelmWheel").boundingBox();
    const helmX = helmBox.x + helmBox.width / 2;
    const helmY = helmBox.y + helmBox.height / 2;
    const radius = helmBox.width * .4;
    await page.mouse.move(helmX + radius, helmY);
    await page.mouse.down();
    for (let angle = -30; angle >= -180; angle -= 15) {
      await page.mouse.move(helmX + Math.cos(angle * Math.PI / 180) * radius,
        helmY + Math.sin(angle * Math.PI / 180) * radius);
    }
    await page.mouse.up();
    let snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.ok(Math.abs(snapshot.controls.rudderTarget) >= 15 * Math.PI / 180);
    const heldRudder = snapshot.controls.rudderTarget;
    await page.waitForTimeout(180);
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(
      snapshot.controls.rudderTarget,
      heldRudder,
      "la barre s'est recentrée après relâchement"
    );

    await page.locator("#touchCenterRudder").click();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.rudderTarget, 0);

    const throttleBox = await page.locator("#touchThrottleNeutral").boundingBox();
    const throttleX = throttleBox.x + throttleBox.width / 2;
    const throttleY = throttleBox.y + throttleBox.height / 2;
    await page.mouse.move(throttleX, throttleY);
    await page.mouse.down();
    await page.mouse.move(throttleX, throttleY - 14, { steps: 6 });
    await page.mouse.up();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, 0,
      "un déplacement de 14 px doit choisir le cran de ralenti");
    assert.equal(snapshot.controls.gearTarget, 1);

    const lowPowerHandle = await page.locator("#touchThrottleNeutral").boundingBox();
    await page.mouse.move(throttleX, lowPowerHandle.y + lowPowerHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(throttleX, throttleY - 44, { steps: 6 });
    await page.mouse.up();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.ok(snapshot.controls.throttleTarget > .5);

    const forwardHandle = await page.locator("#touchThrottleNeutral").boundingBox();
    await page.mouse.move(throttleX, forwardHandle.y + forwardHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(throttleX, throttleY + 35, { steps: 10 });
    await page.waitForTimeout(520);
    await page.mouse.up();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, 0, "le geste a traversé le neutre");

    const neutralHandle = await page.locator("#touchThrottleNeutral").boundingBox();
    await page.mouse.move(throttleX, neutralHandle.y + neutralHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(throttleX, throttleY + 30, { steps: 6 });
    await page.waitForTimeout(520);
    await page.mouse.up();
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.ok(snapshot.controls.throttleTarget < -.2);
    // The engine intentionally captures pointers on its parent, then neutral moves
    // the handle before pointerup. Verify real hit-testing and click its current
    // screen coordinates instead of Playwright's stationary-target click heuristic.
    const tap = await page.evaluate(() => {
      const handle = document.querySelector("#touchThrottleNeutral");
      const box = handle.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      return { x, y, reachable: handle.contains(document.elementFromPoint(x, y)) };
    });
    assert.equal(tap.reachable, true, "la poignée moteur est masquée au point de toucher");
    await page.mouse.click(tap.x, tap.y);
    snapshot = await page.evaluate(() => window.__PORTANCE_TEST__.snapshot());
    assert.equal(snapshot.controls.throttleTarget, 0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(100);

});

browserCase("simulator:controls.58", async ({ page }) => {
  await page.clock.install({ time: 1000 });
  await page.reload();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const read = () => page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls);
  for (const gear of [1, -1]) {
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
    await page.evaluate(gear => window.__PORTANCE_TEST__.selectTimeScale(gear > 0 ? 1 : 2), gear);
    await page.locator("#scene").focus();
    const key = gear > 0 ? "ArrowUp" : "ArrowDown";
    const opposite = gear > 0 ? "ArrowDown" : "ArrowUp";
    await page.keyboard.down(key);
    assert.equal((await read()).gearTarget, gear);
    assert.equal((await read()).throttleTarget, 0);
    await page.clock.runFor(499);
    assert.equal((await read()).throttleTarget, 0, "le cran doit durer au moins 500 ms");
    assert.equal(await page.locator("#throttleLabel").textContent(), gear > 0 ? "AV ralenti" : "AR ralenti");
    await page.clock.runFor(41);
    assert.equal((await read()).throttleTarget, gear > 0 ? .05 : -.1,
      "la reprise ne doit pas rattraper plusieurs crans d'un coup");
    await page.clock.runFor(1200);
    assert.equal((await read()).throttleTarget, gear, "un appui continu doit atteindre plein gaz");
    await page.keyboard.up(key);
    await page.clock.runFor(300);
    assert.equal((await read()).throttleTarget, gear);

    await page.evaluate(gear => window.__PORTANCE_TEST__.setControls({
      gearTarget: gear, throttleTarget: gear > 0 ? .05 : -.1
    }), gear);
    await page.keyboard.down(opposite);
    assert.equal((await read()).gearTarget, gear);
    assert.equal((await read()).throttleTarget, 0);
    await page.clock.runFor(499);
    assert.equal((await read()).gearTarget, gear, "la réduction doit aussi marquer le cran");
    await page.clock.runFor(41);
    assert.equal((await read()).gearTarget, 0);
    await page.clock.runFor(1200);
    assert.equal((await read()).gearTarget, 0, "le neutre impose toujours un relâchement");
    await page.keyboard.up(opposite);
    await page.keyboard.press(opposite);
    assert.equal((await read()).gearTarget, -gear);
    assert.equal((await read()).throttleTarget, 0);
    await page.clock.runFor(800);
    assert.equal((await read()).throttleTarget, 0, "relâcher conserve le ralenti");
  }
  await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
  await page.locator("#throttleUp").click();
  assert.equal((await read()).gearTarget, 1);
  assert.equal((await read()).throttleTarget, 0);
  await page.locator("#throttleUp").click();
  assert.equal((await read()).throttleTarget, .05, "un second clic distinct augmente immédiatement les gaz");
  await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
  await page.locator("#scene").focus();
  await page.keyboard.down("ArrowUp");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(800);
  assert.equal((await read()).throttleTarget, 0, "perdre le focus annule les répétitions");
  await page.keyboard.up("ArrowUp");
});

browserCase("simulator:controls.59", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.clock.install({ time: 1000 });
  await page.reload();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const read = () => page.evaluate(() => window.__PORTANCE_TEST__.snapshot().controls);
  const reset = () => page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
  const pointer = (type, dy = 0) => page.evaluate(({ type, dy }) => {
    const target = document.querySelector(type === "pointerdown" ? "#touchThrottleNeutral" : ".touch-engine");
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 91, pointerType: "touch", isPrimary: true,
      clientX: 900, clientY: 300 + dy, button: 0
    }));
  }, { type, dy });
  for (const gear of [1, -1]) {
    await reset();
    await pointer("pointerdown");
    await pointer("pointermove", -52 * gear);
    assert.equal((await read()).gearTarget, gear);
    assert.equal((await read()).throttleTarget, 0, "un saut vers plein gaz doit passer par le ralenti");
    await page.clock.runFor(499);
    assert.equal((await read()).throttleTarget, 0);
    assert.equal(await page.locator("#touchThrottleNeutral").getAttribute("aria-valuetext"),
      gear > 0 ? "AV ralenti" : "AR ralenti");
    assert.match(await page.locator(gear > 0 ? "#touchAheadIdleDetent" : "#touchAsternIdleDetent").getAttribute("class"), /active/);
    await page.clock.runFor(1);
    assert.equal((await read()).throttleTarget, gear);
    await pointer("pointerup");

    await pointer("pointerdown");
    await pointer("pointermove", 104 * gear);
    assert.equal((await read()).gearTarget, gear);
    assert.equal((await read()).throttleTarget, 0);
    await page.clock.runFor(499);
    assert.equal((await read()).gearTarget, gear);
    await page.clock.runFor(1);
    assert.equal((await read()).gearTarget, 0);
    await pointer("pointermove", 110 * gear);
    assert.equal((await read()).gearTarget, 0, "le même geste ne doit pas inverser la marche");
    await pointer("pointerup");

    await pointer("pointerdown");
    await pointer("pointermove", -14 * gear);
    await pointer("pointerup");
    await page.clock.runFor(800);
    assert.equal((await read()).gearTarget, gear);
    assert.equal((await read()).throttleTarget, 0);
    for (const distance of [11, 14, 17]) {
      await reset();
      await pointer("pointerdown");
      await pointer("pointermove", -distance * gear);
      await page.clock.runFor(540);
      assert.equal((await read()).gearTarget, gear);
      assert.equal((await read()).throttleTarget, 0, "la zone 11–17 px doit conserver le ralenti");
      await pointer("pointerup");
    }
  }

  for (const ending of ["pointerup", "pointercancel", "lostpointercapture", "blur", "reset", "Home"]) {
    await reset();
    await pointer("pointerdown");
    await pointer("pointermove", -52);
    if (ending === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (ending === "reset") await reset();
    else if (ending === "Home") await page.locator("#touchThrottleNeutral").dispatchEvent("keydown", { key: "Home" });
    else await pointer(ending);
    await page.clock.runFor(800);
    assert.equal((await read()).throttleTarget, 0, `${ending} doit annuler la reprise différée`);
    assert.equal((await read()).gearTarget, ending === "reset" || ending === "Home" ? 0 : 1);
  }
  await reset();
  await page.locator("#touchThrottleNeutral").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal((await read()).gearTarget, -1);
  assert.equal((await read()).throttleTarget, 0, "la poignée accessible doit avancer d'un seul cran");
  await page.keyboard.press("Home");
  assert.equal((await read()).gearTarget, 0);
  await page.clock.runFor(300);
  assert.equal((await read()).gearTarget, 0);
});

browserCase("simulator:camera.50", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => window.__PORTANCE_TEST__.selectCameraView("top"));
    const result = await page.evaluate(() => {
      const canvas = document.querySelector("#scene");
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const report = () => window.__PORTANCE_TEST__.cameraReport();
      const initial = report();
      const pointer = (type, id, px, py) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId: id, pointerType: "touch", isPrimary: id === 101,
        clientX: px, clientY: py, button: 0
      }));
      pointer("pointerdown", 101, x - 50, y);
      pointer("pointerdown", 102, x + 50, y);
      pointer("pointermove", 101, x - 100 + 40, y + 30);
      pointer("pointermove", 102, x + 100 + 40, y + 30);
      const moved = report();
      pointer("pointerup", 101, x - 60, y + 30);
      pointer("pointerup", 102, x + 140, y + 30);
      return { initial, moved };
    });
    assert.ok(result.moved.distance < result.initial.distance);
    assert.ok(Math.hypot(...result.moved.position.map((value, index) =>
      value - result.initial.position[index])) > 1);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('[data-mode="understand"]').click();
    await page.locator('[data-understand-view="rotation"]').click();
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 25, y: -38, heading: Math.PI });
      api.setControls({ throttleTarget: -1, rudderTarget: 0 });
      api.advance(7);
      api.selectCameraView("top");
    });
    await page.waitForTimeout(100);
    const inspection = await page.evaluate(() => {
      const canvas = document.querySelector("#scene");
      const rect = canvas.getBoundingClientRect();
      const targets = window.__PORTANCE_TEST__.understandingHitReport().targets;
      const target = targets.find(item => item.kind === "force"
        && Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y) > 12);
      if (!target) return { found: false };
      const x = rect.left + (target.a.x + target.b.x) / 2;
      const y = rect.top + (target.a.y + target.b.y) / 2;
      for (const type of ["pointerdown", "pointerup"]) {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId: 103, pointerType: "touch", isPrimary: true,
          clientX: x, clientY: y, button: 0
        }));
      }
      return { found: true, tooltip: window.__PORTANCE_TEST__.understandingHitReport().tooltip };
    });
    assert.equal(inspection.found, true);
    assert.equal(inspection.tooltip.visible, true);
    assert.ok(inspection.tooltip.text.length > 0);

});

browserCase("simulator:trajectories.51", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    assert.equal(trajectoryFixture.profileId, "sun-odyssey-36i-pedagogical");
    assert.equal(trajectoryFixture.profileVersion, "6.0.1");
    assert.equal(trajectoryFixture.physicsVersion, "6.0.0");
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

browserCase("simulator:smoke.52", async ({ page, browser, context, runtimeErrors, externalRequests, errors, exported }, t) => {
    const html = fs.readFileSync(simulatorPath, "utf8");
    const htmlWithoutReadmeLinks = html.replace(
      /<dialog class="project-help-dialog"[\s\S]*?<\/dialog>/,
      ""
    ).replace(
      /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-DQMS2JRBQ3"><\/script>/,
      ""
    );
    const topologySource = fs.readFileSync(topologyPath, "utf8");
    assert.doesNotMatch(
      htmlWithoutReadmeLinks,
      /(?:src|href)\s*=\s*["']https?:\/\//i
    );
    assert.doesNotMatch(html, /\b(XMLHttpRequest|WebSocket)\s*\(/);
    assert.doesNotMatch(topologySource, /https?:\/\//);
    assert.doesNotMatch(topologySource, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);

    externalRequests.length = 0;
    await page.goto(simulatorUrl.href);
    await page.waitForSelector('body[data-world-renderer="native"]');
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#scene");
      return canvas.width > 700 && canvas.height > 500;
    });
    const desktopImage = await screenshotElement(page, ".stage");
    const desktop = await page.evaluate(() => {
      const canvas = document.querySelector("#scene");
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
      ["dockForward", "dockReverse", "placement"]
    );
    assert.ok(desktop.options.includes("mooring"));
    assert.ok(desktop.options.includes("medDock"));
    assert.ok(desktop.options.includes("medDeparture"));
    assert.match(desktop.wind, /^0(?:,0)? nd$/);
    assert.match(desktop.current, /^0(?:,0)? nd$/);
    assert.match(desktop.rpm, /^\d+$/);
    assert.equal(desktop.overflow, false);
    const unexpectedRequests = externalRequests.filter(url => (
      !/^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-DQMS2JRBQ3$/i.test(url)
      && !/^https:\/\/(?:www|region\d+)\.google-analytics\.com\//i.test(url)
    ));
    assert.deepEqual(unexpectedRequests, []);

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
    assert.deepEqual(runtimeErrors, []);

});
