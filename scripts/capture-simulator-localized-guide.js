"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
async function capture(code) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "src/simulateur-port/locales", `${code}.json`), "utf8"));
  const images = [...fs.readFileSync(path.join(root, catalog.guide), "utf8").matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
    .map(match => path.resolve(path.dirname(path.join(root, catalog.guide)), match[1]));
  const browser = await chromium.launch({ headless: true });
  try {
    let page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: code });
    await page.route("https://www.googletagmanager.com/**", route => route.fulfill({ status: 200, body: "", contentType: "application/javascript" }));
    await page.goto(pathToFileURL(path.join(root, "simulateur-port.html")).href + "?test=1");
    await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
    await page.evaluate(code => window.__PORTANCE_TEST__.selectLocale(code), code);
    const save = async index => {
      if (process.argv[3] !== undefined && index !== Number(process.argv[3])) return;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const target = images[index].replace(/(?:\.[a-z]{2})?\.jpg$/, `.${code}.jpg`);
      await page.screenshot({ path: target, type: "jpeg", quality: 88 });
      console.log(path.relative(root, target));
    };
    await save(0);
    const desktopPage = page;
    page = await browser.newPage({ viewport: { width: 1024, height: 768 }, locale: code, hasTouch: true });
    await page.route("https://www.googletagmanager.com/**", route => route.fulfill({ status: 200, body: "", contentType: "application/javascript" }));
    await page.goto(pathToFileURL(path.join(root, "simulateur-port.html")).href + "?test=1");
    await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
    await page.evaluate(code => window.__PORTANCE_TEST__.selectLocale(code), code);
    await save(1);
    await page.close();
    page = desktopPage;
    await page.evaluate(() => {
      const api = window.__PORTANCE_TEST__;
      api.loadScenario("halfTurn");
      api.setControls({ throttleTarget: .55, rudderTarget: -.4 });
      api.advance(3);
    });
    await page.locator('[data-mode="understand"]').click();
    await page.locator('[data-understand-view="rotation"]').click();
    await save(2);
    await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("medDeparture"));
    await page.locator('[data-mode="navigation"]').click();
    await save(3);
  } finally { await browser.close(); }
}
capture(process.argv[2] || "en").catch(error => { console.error(error); process.exitCode = 1; });
