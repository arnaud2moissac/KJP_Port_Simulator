"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { communityPcloud, multipartFiles } = require("./community-pcloud.js");
const { config } = require("../../src/ports/port-library.js");
const root = path.resolve(__dirname, "../..");
const editorApi = "https://api.github.com/repos/arnaud2moissac/KJP_Port_Simulator/contents/ports";
async function libraryFixture(page, product, records = [], community = []) {
  const state = { records, community, requests: [], pcloudRequests: [], writes: [], listStatus: 200, pcloudStatus: 200,
    beforeList: null, beforeLoad: null, beforeCommunity: null, extraEntries: [], communityConfigured: true,
    uploadError: 0 };
  const { fetcher } = communityPcloud(state);
  await page.route("https://arnaud2moissac.github.io/KJP_Port_Simulator/" + (product === "generator" ? "generateur" : "simulateur") + "-port.html*", route => {
    const html = fs.readFileSync(path.join(root, product === "generator" ? "generateur-port.html" : "simulateur-port.html"), "utf8")
      .replace(`uploadCode: "${config.uploadCode}"`, `uploadCode: "${state.communityConfigured ? config.uploadCode : ""}"`);
    return route.fulfill({ body: html, contentType: "text/html" });
  });
  await page.route(editorApi + "**", async route => {
    const url = new URL(route.request().url());
    state.requests.push(url.href);
    if (url.pathname.endsWith("/ports")) {
      if (state.beforeList) await state.beforeList();
      return route.fulfill({ status: state.listStatus, contentType: "application/json",
        headers: state.listStatus === 403 ? { "x-ratelimit-remaining": "0", "access-control-expose-headers": "X-RateLimit-Remaining" } : {},
        body: JSON.stringify(state.records.map(record => ({ type: "file", name: record.name, path: `ports/${record.name}`,
          size: record.size ?? Buffer.byteLength(record.text) })).concat(state.extraEntries)) });
    }
    const record = state.records.find(r => r.name === decodeURIComponent(url.pathname.split("/").at(-1)));
    if (!record) return route.fulfill({ status: 404, body: "{}" });
    if (state.beforeLoad) await state.beforeLoad();
    return route.fulfill({ status: record.loadStatus || 200, contentType: "application/json", body: record.loadText ?? record.text });
  });
  await page.route("https://raw.githubusercontent.com/arnaud2moissac/KJP_Port_Simulator/main/ports/**", async route => {
    state.requests.push(route.request().url());
    const filename = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1));
    const record = state.records.find(item => item.name === filename);
    return route.fulfill({ contentType: "application/json", body: record.text });
  });
  await page.route(/^https:\/\/eapi\d*\.pcloud\.com\//, async route => {
    const request = route.request(), url = new URL(request.url());
    state.requests.push(url.href);
    state.pcloudRequests.push({ method: request.method(), action: url.pathname.slice(1), headers: request.headers() });
    let body;
    if (request.method() === "POST") {
      body = new FormData();
      for (const file of multipartFiles(request.postDataBuffer(), request.headers()["content-type"])) {
        body.append("file", new Blob([file.text], { type: "application/json" }), file.name);
      }
    }
    const response = await fetcher(url.href, { body });
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.goto("https://arnaud2moissac.github.io/KJP_Port_Simulator/" + (product === "generator" ? "generateur" : "simulateur") + "-port.html?test=1&renderer=canvas");
  await page.waitForFunction(product => Boolean(window[product === "generator" ? "__KJP_GENERATOR_TEST__" : "__PORTANCE_TEST__"]), product);
  if (product === "simulator") await page.evaluate(() => window.__PORTANCE_TEST__.loadScenario("dockForward"));
  return state;
}
module.exports = { libraryFixture };
