"use strict";
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "../..");
const definitions = require("../browser-cases.json");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
after(async () => { if (browser) await (await browser).close(); });

async function instrumentPage(raw, controlled) {
  if (controlled) await raw.addInitScript(() => {
    const callbacks = new Map();
    let id = 0;
    window.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
    window.cancelAnimationFrame = token => callbacks.delete(token);
    window.__KJP_TEST_PAINT__ = () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      const time = performance.now();
      for (const callback of pending) callback(time);
    };
  });
  let painting = false;
  const paint = async () => {
    if (!controlled || painting || raw.isClosed()) return;
    painting = true;
    try { await raw.evaluate(() => window.__KJP_TEST_PAINT__?.()); }
    finally { painting = false; }
  };
  const transact = async operation => {
    await paint();
    let complete = false;
    const pump = (async () => {
      while (!complete) {
        await delay(25);
        if (!complete && !raw.isClosed()) await paint();
      }
    })();
    try { return await operation(); }
    finally { complete = true; await pump; await paint(); }
  };
  const locator = value => new Proxy(value, { get(target, property) {
    const member = target[property];
    if (typeof member !== "function") return member;
    if (["locator", "getByRole", "getByText", "getByLabel", "getByTestId", "filter", "nth", "first", "last"].includes(property)) {
      return (...args) => locator(member.apply(target, args));
    }
    return (...args) => transact(() => member.apply(target, args));
  } });
  const input = value => new Proxy(value, { get(target, property) {
    const member = target[property];
    return typeof member === "function" ? (...args) => transact(() => member.apply(target, args)) : member;
  } });
  return new Proxy(raw, { get(target, property) {
    if (["keyboard", "mouse", "touchscreen"].includes(property)) return input(target[property]);
    if (["locator", "getByRole", "getByText", "getByLabel", "getByTestId"].includes(property)) {
      return (...args) => locator(target[property](...args));
    }
    if (property === "waitForTimeout") return async ms => { await delay(ms); await paint(); };
    if (property === "waitForFunction") return (fn, arg, options = {}) =>
      transact(() => target.waitForFunction(fn, arg, { ...options, polling: 25 }));
    if (["evaluate", "setViewportSize", "reload", "click", "selectOption", "fill", "waitForSelector", "waitForEvent", "screenshot"].includes(property)) return (...args) =>
      transact(() => target[property](...args));
    if (property === "goto") return (url, options = {}) => transact(() => target.goto(url, {
      ...options, waitUntil: options.waitUntil || "domcontentloaded"
    }));
    const value = target[property];
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

function browserCase(definition, callback) {
  if (typeof definition === "string") definition = definitions.find(record => `${record.product}:${record.id}` === definition);
  if (!definition) throw new Error("Unknown browser case");
  const requested = (process.env.KJP_TEST_GROUPS || "").split(",").filter(Boolean);
  const ids = (process.env.KJP_TEST_CASES || "").split(",").filter(Boolean);
  if (requested.length && !requested.includes(definition.group)) return;
  if (ids.length && !ids.includes(definition.id)) return;
  const name = `[${definition.product}:${definition.id}] ${definition.name}`;
  test(name, { timeout: 120000 }, async t => {
    browser ||= chromium.launch({ headless: true });
    const engine = await browser;
    const context = await engine.newContext({ locale: "fr-FR", viewport: definition.product === "simulator"
      ? { width: 1280, height: 800 } : { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const raw = await context.newPage();
    const runtimeErrors = [], externalRequests = [];
    raw.on("pageerror", error => runtimeErrors.push(error.message));
    raw.on("console", message => { if (message.type() === "error") runtimeErrors.push(message.text()); });
    raw.on("request", request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    await context.route(/https:\/\/(?:www\.googletagmanager\.com|(?:www|region\d+)\.google-analytics\.com)\//,
      route => route.fulfill({ status: 200, body: "", contentType: "application/javascript" }));
    t.after(async () => {
      await context.close();
      assert.deepEqual(runtimeErrors, [], `${definition.id}: browser errors`);
    });
    const controlled = definition.product === "simulator" && definition.renderer !== "native";
    const page = await instrumentPage(raw, controlled);
    const url = new URL(pathToFileURL(path.join(root, definition.product === "simulator"
      ? "simulateur-port.html" : "generateur-port.html")));
    url.searchParams.set("test", "1");
    if (controlled) url.searchParams.set("renderer", "canvas");
    await page.goto(url.href);
    await page.waitForFunction(product => Boolean(window[product === "simulator"
      ? "__PORTANCE_TEST__" : "__KJP_GENERATOR_TEST__"]), definition.product);
    if (definition.product === "simulator") {
      await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
      if (definition.renderer === "native") await page.waitForFunction(() =>
        window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
    } else if (definition.fixture === "demo") {
      await page.evaluate(() => window.__KJP_GENERATOR_TEST__.loadDemonstration());
    }
    let exported;
    if (definition.fixture === "export") exported = await page.evaluate(() => {
      window.__KJP_GENERATOR_TEST__.loadDemonstration();
      return window.__KJP_GENERATOR_TEST__.exportText();
    });
    await callback({ page, browser: engine, context, runtimeErrors, errors: runtimeErrors, externalRequests, exported }, t);
  });
}
module.exports = { browserCase, instrumentPage };
