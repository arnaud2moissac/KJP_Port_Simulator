"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

test("performance HTML: ×2 < 250 ms par seconde réelle", { timeout: 60000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });
  await page.route("https://www.googletagmanager.com/**", route => route.fulfill({ status: 200, body: "" }));
  await page.goto(pathToFileURL(path.resolve(__dirname, "../../simulateur-port.html")).href + "?test=1");
  await page.waitForFunction(() => window.__PORTANCE_TEST__?.worldRendererReport().player?.model?.ready);
  const benchmarkMilliseconds = await page.evaluate(() => {
    const api = window.__PORTANCE_TEST__;
    api.reset({ x: 200, y: 200, heading: 0 });
    api.selectTimeScale(2);
    api.setControls({ throttleTarget: .6, rudderTarget: 18 * Math.PI / 180 });
    const start = performance.now();
    api.advanceWall(1);
    return performance.now() - start;
  });
  t.diagnostic(JSON.stringify({ browser: browser.version(), benchmarkMilliseconds, budgetMs: 250 }));
  assert.ok(benchmarkMilliseconds < 250,
    `×2 trop coûteux: ${benchmarkMilliseconds.toFixed(1)} ms pour une seconde réelle`);
});
