"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const playwright = require("playwright");

const root = path.resolve(__dirname, "..");
const simulatorPath = path.join(root, "simulateur-port.html");
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? path.resolve(root, process.argv[outputIndex + 1]) : null;
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error("Chemin --output absent");
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-activation-"));
const engines = ["chromium", "firefox", "webkit"];
const devices = [
  { id: "desktop-dpr1", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  { id: "compact-dpr2", viewport: { width: 1024, height: 720 }, deviceScaleFactor: 2 },
  { id: "mobile-dpr3", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 }
];
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

async function settle(page, count = 4) {
  await page.evaluate(frames => new Promise(resolve => {
    const next = remaining => requestAnimationFrame(() => remaining > 1 ? next(remaining - 1) : resolve());
    next(frames);
  }), count);
}

async function runCase(browser, engine, device) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    ...(engine === "chromium" && device.id === "mobile-dpr3" ? { isMobile: true, hasTouch: true } : {})
  });
  const page = await context.newPage();
  const errors = [], warnings = [], externalRequests = [];
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
    else if (message.type() === "warning") warnings.push(message.text());
  });
  page.on("request", request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  try {
    await page.goto(pathToFileURL(simulatorPath).href);
    await page.waitForSelector('body[data-world-renderer="native"]');
    await settle(page, 5);
    const first = await page.evaluate(() => {
      const native = document.querySelector("#kjp-native-static-prototype");
      const stage = document.querySelector(".stage").getBoundingClientRect();
      const touchControls = document.querySelector(".touch-controls").getBoundingClientRect();
      const controlDock = document.querySelector(".control-dock").getBoundingClientRect();
      return {
        renderer: document.body.dataset.worldRenderer,
        canvas: {
          connected: native?.isConnected,
          display: native ? getComputedStyle(native).display : null,
          pointerEvents: native ? getComputedStyle(native).pointerEvents : null,
          width: native?.width,
          height: native?.height,
          glError: native?.getContext("webgl2")?.getError()
        },
        stage: { width: stage.width, height: stage.height },
        controls: {
          touch: { left: touchControls.left, right: touchControls.right, width: touchControls.width, height: touchControls.height },
          dock: { left: controlDock.left, right: controlDock.right, width: controlDock.width, height: controlDock.height }
        },
        legacyDisplay: getComputedStyle(document.querySelector("#worldScene")).display,
        overlayPointerEvents: getComputedStyle(document.querySelector("#scene")).pointerEvents,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    assert.equal(first.renderer, "native");
    assert.equal(first.canvas.connected, true);
    assert.equal(first.canvas.display, "block");
    assert.equal(first.canvas.pointerEvents, "none");
    assert.equal(first.canvas.glError, 0);
    const effectiveDpr = Math.min(device.deviceScaleFactor, 2);
    assert.equal(first.canvas.width, Math.round(first.stage.width * effectiveDpr));
    assert.equal(first.canvas.height, Math.round(first.stage.height * effectiveDpr));
    assert.equal(first.legacyDisplay, "none");
    assert.notEqual(first.overlayPointerEvents, "none");
    assert.equal(first.overflow, false);
    const controls = device.id === "mobile-dpr3" ? first.controls.touch : first.controls.dock;
    assert.ok(controls.width > 0 && controls.height > 0);
    assert.ok(controls.left >= 0 && controls.right <= device.viewport.width);
    const before = await page.locator(".stage").screenshot();
    if (device.id === "desktop-dpr1") await page.locator("#skipperViewButton").click();
    await page.locator("#themeToggle").click();
    if (device.id === "desktop-dpr1") await page.locator('[data-mode="understand"]').click();
    await settle(page, 5);
    const after = await page.locator(".stage").screenshot();
    assert.ok(before.length > 20_000 && after.length > 20_000);
    assert.notEqual(sha256(after), sha256(before));
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    assert.ok(warnings.every(message => /AudioContext (?:was not allowed to start|was prevented from starting automatically)/.test(message)
      || /^\[\.WebGL-.*GPU stall due to ReadPixels/.test(message)), JSON.stringify(warnings));
    const name = `${engine}-${device.id}`;
    fs.writeFileSync(path.join(artifacts, `${name}-initial.png`), before);
    fs.writeFileSync(path.join(artifacts, `${name}-changed.png`), after);
    return { engine, device: device.id, status: "passed", viewport: device.viewport,
      requestedDeviceScaleFactor: device.deviceScaleFactor,
      initialSha256: sha256(before), changedSha256: sha256(after),
      stage: first.stage, canvas: first.canvas };
  } finally {
    await context.close();
  }
}

async function main() {
  const report = {
    schemaVersion: 1,
    protocol: "native-default-browser-device-matrix-v1",
    generatedAt: new Date().toISOString(),
    status: "running",
    sourceSha256: sha256(fs.readFileSync(simulatorPath)),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    headless: true,
    browserVersions: {},
    matrix: []
  };
  try {
    for (const engine of engines) {
      const browser = await playwright[engine].launch({ headless: true });
      try {
        report.browserVersions[engine] = browser.version();
        for (const device of devices) {
          const result = await runCase(browser, engine, device);
          report.matrix.push(result);
          console.log(`${engine} ${device.id}: natif visible et interactions réussis`);
        }
      } finally { await browser.close(); }
    }
    report.status = "passed";
    report.summary = { passed: report.matrix.length, expected: engines.length * devices.length };
  } catch (error) {
    report.status = "failed";
    report.error = String(error.stack || error.message || error);
    throw error;
  } finally {
    report.captures = { retained: false, policy: "Inspection locale temporaire ; empreintes SHA-256 archivées dans la matrice." };
    const destination = outputPath || path.join(artifacts, "report.json");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Rapport : ${destination}`);
    console.log(`Captures : ${artifacts}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
