"use strict";

// Diagnostic reproductible uniquement : aucune modification du produit.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const Codec = require("../src/ports/kjp-codec.js");
const root = path.resolve(__dirname, "..");
const output = path.resolve(process.env.KJP_AUDIT_OUTPUT || path.join(root, ".validation-runs/kjp-security"));

function base() {
  const d = Codec.createEmpty({ id: "audit-baseline", name: "Port témoin", latitude: 47.586, longitude: -3.03 });
  d.metadata.createdAt = d.metadata.updatedAt = "2026-10-07T00:00:00.000Z";
  d.schemaVersion = 1;
  d.structures.pontoons = [{ id: "p1", type: "pontoon", center: { east: 0, north: 0 }, length: 30, width: 3, heading: 0, height: .5 }];
  d.berths = [{ id: "b1", parentId: "p1", side: "port", center: { east: 0, north: 8 }, heading: 0, length: 12, width: 4, maxLength: 12, maxBeam: 4, isVisitor: true, name: "Visiteurs" }];
  d.navigation.entries = [{ id: "e1", name: "Entrée", position: { east: -25, north: -25 }, heading: 0 }];
  return Codec.normalizeDocument(d, { freeze: false });
}

function corpus() {
  const cases = [];
  function add(id, mutate, family = "validation") {
    const d = base();
    d.metadata.id = id;
    d.metadata.name = id;
    mutate(d);
    cases.push({ id, family, text: JSON.stringify(d) });
  }
  cases.push({ id: "baseline", family: "valid", text: JSON.stringify(base()) });
  for (const version of [1, 2, 3]) add(`valid-v${version}`, d => {
    d.schemaVersion = version;
    if (version === 1) { delete d.structures.buoys; delete d.structures.pontoons[0].vertical; }
    if (version < 3) { delete d.structures.pendilles; delete d.editor.pendilleGroups; }
  }, "valid");
  for (const [id, value] of [
    ["script", "<script>window.__auditExecuted=1</script>"],
    ["event", "<img src=x onerror=window.__auditExecuted=1>"],
    ["svg", "<svg onload=window.__auditExecuted=1>"],
    ["escaped-html", "&lt;img src=x onerror&#61;window.__auditExecuted&#61;1&gt;"],
    ["markup", "<img src=https://audit.invalid/pixel><a href='https://audit.invalid'>Lien</a>"],
    ["unicode", "<scrıpt>window.__auditExecuted=1</scrıpt>"],
    ["benign-word", "bonjour onshore=calme"],
    ["long-text", "x".repeat(20001)]
  ]) add(`text-${id}`, d => { d.metadata.comment = value; d.berths[0].name = value; }, "xss");
  for (const [id, url] of [
    ["https", "https://audit.invalid/capitainerie"], ["http", "http://audit.invalid/capitainerie"],
    ["javascript", "javascript:window.__auditExecuted=1"], ["data", "data:text/html,audit"],
    ["file", "file:///etc/passwd"], ["blob", "blob:https://audit.invalid/id"],
    ["relative", "//audit.invalid/x"], ["control", "java\nscript:window.__auditExecuted=1"],
    ["credentials", "https://trusted.invalid@audit.invalid/x"],
    ["encoded", "https://audit.invalid/%3Cscript%3E"]
  ]) add(`url-${id}`, d => { d.metadata.harborMasterUrl = url; d.sources = [{ provider: "Audit", attribution: "Audit", license: "Test", url }]; }, "url");
  for (const key of ["__proto__", "constructor", "prototype"]) for (const nested of [false, true]) {
    add(`key-${key}-${nested ? "nested" : "root"}`, d => {
      Object.defineProperty(nested ? d.metadata : d, key, { value: { auditPolluted: 1 }, enumerable: true });
    }, "prototype");
  }
  add("key-tostring-unused", d => { d.extension = { toString: "bad", valueOf: "bad" }; }, "prototype");
  add("date-object", d => { d.metadata.createdAt = { toString: "bad" }; }, "integrity");
  add("berth-name-object", d => { d.berths[0].name = { toString: "bad" }; }, "integrity");
  add("restore-poisoned-draft", d => { d.berths[0].name = { toString: "bad" }; }, "integrity");
  add("pontoon-parent-object", d => { d.structures.pontoons[0].parentId = { toString: "bad" }; }, "integrity");
  add("group-parameters-missing", d => { d.editor.catwayGroups = [{ id: "g1", parentId: "p1", memberIds: [] }]; }, "integrity");
  add("null-metadata", d => { d.metadata = null; });
  add("wrong-structures", d => { d.structures.pontoons = {}; });
  add("legacy-wrong-structures", d => { d.schemaVersion = 1; d.structures.pontoons = {}; });
  add("missing-parent", d => { d.berths[0].parentId = "absent"; });
  add("duplicate-id", d => { d.berths[0].id = "p1"; });
  add("unknown-version", d => { d.schemaVersion = 99; });
  add("unknown-field", d => { d.extension = { label: "conservé", url: "https://audit.invalid/extension" }; });
  add("number-overflow", d => { d.extension = "TOKEN_OVERFLOW"; });
  cases[cases.length - 1].text = cases[cases.length - 1].text.replace('"TOKEN_OVERFLOW"', "1e400");
  add("coordinate-outside", d => { d.navigation.entries[0].position.east = 20001; });
  add("polar-origin", d => { d.georeference.origin.latitude = 90; });
  for (const depth of [100, 1000, 5000]) {
    const text = JSON.stringify(base()).slice(0, -1) + ',"extension":' + '['.repeat(depth) + '0' + ']'.repeat(depth) + '}';
    cases.push({ id: `depth-${depth}`, family: "availability", text });
  }
  add("long-key", d => { d["k".repeat(500000)] = null; }, "availability");
  add("many-errors", d => { d.structures.obstacles = Array.from({ length: 50000 }, () => null); }, "availability");
  for (const count of [1000, 10000, 100000]) add(`many-points-${count}`, d => {
    d.structures.obstacles = [{ id: "o1", type: "obstacle", width: 1, height: 1,
      vertical: { datum: "waterline", mode: "fixed", baseZ: 0, topZ: 1, deckZ: 1 },
      points: Array.from({ length: count }, (_, i) => ({ east: i % 2, north: (i % 4) / 2 })) }];
  }, "availability");
  add("quadratic-groups", d => {
    d.editor.catwayGroups = Array.from({ length: 100 }, (_, i) => ({ id: `g${i}`, parentId: "p1", memberIds: Array(5000).fill("absent") }));
  }, "availability");
  add("degenerate-land", d => { d.structures.landAreas = [{ id: "land1", points: [{ east: 0, north: 0 }, { east: 0, north: 0 }, { east: 0, north: 0 }] }]; }, "geometry");
  add("crossed-land", d => { d.structures.landAreas = [{ id: "land1", points: [{ east: 0, north: 0 }, { east: 10, north: 10 }, { east: 0, north: 10 }, { east: 10, north: 0 }] }]; }, "geometry");
  cases.push({ id: "truncated", family: "validation", text: '{"format":"KJP"' });
  cases.push({ id: "root-array", family: "validation", text: "[]" });
  cases.push({ id: "bom", family: "validation", text: "\uFEFF" + JSON.stringify(base()) });
  cases.push({ id: "oversize", family: "availability", text: " ".repeat(Codec.LIMITS.fileBytes + 1) });
  cases.push({ id: "duplicate-json-key", family: "validation", text: JSON.stringify(base()).replace('"format":"KJP"', '"format":"BAD","format":"KJP"') });
  return cases;
}

function child() {
  const input = fs.readFileSync(0, "utf8"), started = performance.now();
  const result = { bytes: Buffer.byteLength(input), prototypeBefore: Object.prototype.auditPolluted || null };
  try {
    const d = Codec.parse(input);
    result.parse = "accepted";
    result.version = d.schemaVersion;
    result.portId = d.metadata.id;
    result.extensionPreserved = d.extension !== undefined;
    try { Codec.toRuntimeTopology(d); result.runtime = "accepted"; }
    catch (e) { result.runtime = e.name; result.runtimeMessage = e.message.slice(0, 200); }
    try { result.exportBytes = Buffer.byteLength(Codec.serialize(d)); result.serialize = "accepted"; }
    catch (e) { result.serialize = e.name; result.serializeMessage = e.message.slice(0, 200); }
  } catch (e) {
    result.parse = e.name;
    result.errorCodes = [...new Set((e.errors || []).map(x => x.code))];
    result.errors = e.errors?.length || 0;
    result.messageLength = e.message.length;
    result.message = e.message.slice(0, 200);
  }
  result.prototypeAfter = Object.prototype.auditPolluted || null;
  result.milliseconds = +(performance.now() - started).toFixed(2);
  result.maxRssKiB = process.resourceUsage().maxRSS;
  console.log(JSON.stringify(result));
}

function codecAudit() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  const selected = (process.env.KJP_AUDIT_CASES || "").split(",").filter(Boolean);
  for (const c of corpus().filter(c => !selected.length || selected.includes(c.id))) {
    const run = spawnSync(process.execPath, [__filename, "--child"], { input: c.text, encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 });
    const result = { id: c.id, family: c.family, ...(run.stdout ? JSON.parse(run.stdout) : { parse: run.error?.code || "process-failed", signal: run.signal, stderr: run.stderr.slice(0, 200) }) };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  fs.writeFileSync(path.join(output, "codec.json"), JSON.stringify({ head: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: root }).stdout.trim(), node: process.version, results }, null, 2) + "\n");
}

function performanceAudit() {
  const referencePath = process.env.KJP_AUDIT_REFERENCE || path.join(root, ".validation-runs/kjp-security/reference-codec.js");
  const reference = require(path.resolve(referencePath));
  const quantile = (samples, q) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * q) - 1];
  const results = [];
  for (const file of ["la_Trinite.kjp", "examples/la-trinite-sur-mer.kjp"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (JSON.stringify(reference.toRuntimeTopology(reference.parse(text))) !== JSON.stringify(Codec.toRuntimeTopology(Codec.parse(text)))) {
      throw new Error(`Topology changed: ${file}`);
    }
    const samples = { reference: [], candidate: [] };
    const count = Number(process.env.KJP_AUDIT_SAMPLES || 30);
    for (let i = 0; i < count + 5; i++) {
      for (const name of i % 2 ? ["candidate", "reference"] : ["reference", "candidate"]) {
        const api = name === "reference" ? reference : Codec;
        const started = performance.now();
        const document = api.parse(text);
        const runtime = api.toRuntimeTopology(document);
        if (runtime.name !== document.metadata.name) throw new Error("runtime mismatch");
        if (i >= 5) samples[name].push(performance.now() - started);
      }
    }
    const summary = Object.fromEntries(Object.entries(samples).map(([k, s]) => [k, {
      medianMs: +quantile(s, .5).toFixed(2), p95Ms: +quantile(s, .95).toFixed(2), samples: s.length
    }]));
    results.push({ file, ...summary, samples });
    console.log(JSON.stringify({ file, ...summary }));
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "performance.json"), JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, reference: referencePath, results }, null, 2) + "\n");
}

async function browserAudit() {
  const { chromium } = require("playwright");
  const http = require("node:http");
  const { pathToFileURL } = require("node:url");
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const all = corpus();
  const ids = (process.env.KJP_AUDIT_CASES || "valid-v1,valid-v2,valid-v3,text-script,text-event,text-escaped-html,text-markup,text-unicode,url-https,url-credentials,key-__proto__-root,key-constructor-nested,date-object,berth-name-object,group-parameters-missing,restore-poisoned-draft,unknown-field,legacy-wrong-structures,depth-5000,many-errors,many-points-1000,many-points-10000,degenerate-land,crossed-land,truncated,oversize").split(",");
  const modes = (process.env.KJP_AUDIT_MODES || "simulator:file:native,generator:file,simulator:http:native,generator:http").split(",");
  try {
    for (const mode of modes) for (const caseId of ids) {
      const [product, transport, renderer] = mode.split(":");
      const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const events = { requests: [], errors: [], dialogs: [], downloads: [], navigations: [] };
      context.on("request", r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(origin)) events.requests.push({ url: r.url(), type: r.resourceType() }); });
      context.on("page", p => {
        p.on("pageerror", e => events.errors.push(e.message));
        p.on("console", m => { if (m.type() === "error") events.errors.push(m.text()); });
        p.on("dialog", async d => { events.dialogs.push({ type: d.type(), message: d.message() }); await d.dismiss(); });
        p.on("download", d => events.downloads.push(d.suggestedFilename()));
        p.on("framenavigated", f => { if (f === p.mainFrame()) events.navigations.push(f.url()); });
      });
      // Toute sortie distante est interceptée ; seules les pages locales sont servies.
      await context.route(/^https?:/, route => {
        if (route.request().url().startsWith(origin)) return route.continue();
        const script = route.request().resourceType() === "script";
        return route.fulfill({ status: 200, contentType: script ? "application/javascript" : "text/plain", body: "" });
      });
      await context.addInitScript(() => {
        window.__auditExecuted = 0;
        window.__auditTicks = 0;
        setInterval(() => window.__auditTicks++, 100);
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const html = process.env.KJP_AUDIT_REFERENCE_HTML
        ? `.validation-runs/kjp-security/reference-${product}.html`
        : product === "simulator" ? "simulateur-port.html" : "generateur-port.html";
      const url = new URL(transport === "file" ? pathToFileURL(path.join(root, html)).href : `${origin}/${html}`);
      if (renderer === "canvas") url.searchParams.set("renderer", "canvas");
      const input = product === "simulator" ? "#portFileInput" : "#importInput";
      const snapshot = () => page.evaluate(async product => {
        const s = { executed: window.__auditExecuted, ticks: window.__auditTicks,
          polluted: Object.prototype.auditPolluted || null, payloadElements: document.querySelectorAll('img[src*="audit.invalid"], script[src*="audit.invalid"], iframe[src*="audit.invalid"]').length,
          testApi: Boolean(window.__PORTANCE_TEST__ || window.__KJP_GENERATOR_TEST__),
          toast: document.querySelector(product === "simulator" ? "#impactToast" : "#toast")?.textContent,
          source: document.querySelector("#portSourceSelect")?.value,
          portName: product === "simulator" ? document.querySelector("#portInfoName")?.textContent : document.querySelector("#portName")?.value,
          url: document.querySelector("#portInfoUrl")?.getAttribute("href"),
          comment: product === "simulator" ? document.querySelector("#portInfoDetails")?.textContent : document.querySelector("#portComment")?.value,
          saveState: document.querySelector("#saveState")?.textContent,
          worldRenderer: document.body.dataset.worldRenderer,
          nativeCanvas: Boolean(document.querySelector('canvas[aria-hidden="true"]')) };
        if (product === "generator") s.draft = await new Promise(resolve => {
          const req = indexedDB.open("portance-port-generator", 1);
          req.onerror = () => resolve({ error: true });
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("drafts")) { db.close(); resolve(null); return; }
            const read = db.transaction("drafts").objectStore("drafts").get("current");
            read.onsuccess = () => { const d = read.result; db.close(); resolve(d ? { id: d.metadata.id, name: d.metadata.name, berthName: d.berths[0]?.name, createdAt: d.metadata.createdAt, extension: d.extension } : null); };
            read.onerror = () => { db.close(); resolve({ error: true }); };
          };
        });
        return s;
      }, product);
      const importText = async text => {
        const started = performance.now();
        await page.locator(input).setInputFiles({ name: "audit.kjp", mimeType: "application/json", buffer: Buffer.from(text) });
        await page.waitForFunction(selector => document.querySelector(selector).value === ""
          || document.querySelector("#impactToast")?.textContent.includes("taille supérieure à 10 Mo"), input, { polling: 100 });
        await page.waitForTimeout(800);
        return +(performance.now() - started).toFixed(2);
      };
      try {
        await page.goto(url.href, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);
        const startup = await snapshot();
        console.log(JSON.stringify({ mode, startup, chromium: browser.version() }));
        results.push({ mode, caseId, startup, chromium: browser.version() });
        for (const id of [caseId]) {
          const c = all.find(x => x.id === id);
          if (!c) throw new Error(`Unknown audit case: ${id}`);
          await importText(all.find(x => x.id === "baseline").text);
          const before = await snapshot();
          const counts = Object.fromEntries(Object.entries(events).map(([k, v]) => [k, v.length]));
          const r = { mode, id, bytes: Buffer.byteLength(c.text), before };
          try {
            if (id === "restore-poisoned-draft" && product === "generator") {
              await page.evaluate(text => new Promise((resolve, reject) => {
                const request = indexedDB.open("portance-port-generator", 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                  const db = request.result, transaction = db.transaction("drafts", "readwrite");
                  transaction.objectStore("drafts").put(JSON.parse(text), "current");
                  transaction.oncomplete = () => { db.close(); resolve(); };
                  transaction.onerror = () => { db.close(); reject(transaction.error); };
                };
              }), c.text);
              await page.reload({ waitUntil: "domcontentloaded" });
              await page.waitForTimeout(800);
              r.restoredPoison = await snapshot();
              await importText(all.find(x => x.id === "baseline").text);
              r.recovered = await snapshot();
            }
            r.importMilliseconds = await importText(c.text);
            r.after = await snapshot();
            if (["berth-name-object", "group-parameters-missing"].includes(id) && product === "generator") {
              // Positions vérifiées sur la capture du port témoin, viewport 1440×900.
              await page.mouse.click(795, id === "berth-name-object" ? 315 : 395);
              await page.waitForTimeout(250);
              r.selected = await snapshot();
            }
            if (["date-object", "berth-name-object", "group-parameters-missing", "unknown-field", "text-markup", "many-points-10000"].includes(id)) {
              await page.screenshot({ path: path.join(output, `${mode.replaceAll(":", "-")}-${id}.png`) });
              if (product === "generator") {
                const download = page.waitForEvent("download");
                await page.locator("#exportButton").click();
                const d = await download;
                await d.saveAs(path.join(output, `${mode.replaceAll(":", "-")}-${id}-export.kjp`));
                r.export = { filename: d.suggestedFilename(), bytes: fs.statSync(path.join(output, `${mode.replaceAll(":", "-")}-${id}-export.kjp`)).size };
              }
              await page.reload({ waitUntil: "domcontentloaded" });
              await page.waitForTimeout(800);
              r.reloaded = await snapshot();
              if (["berth-name-object", "group-parameters-missing"].includes(id) && product === "generator") {
                await page.mouse.click(795, id === "berth-name-object" ? 315 : 395);
                await page.waitForTimeout(250);
                r.selectedAfterReload = await snapshot();
              }
            }
            if (id === "url-https" && product === "simulator") {
              await page.locator("#portInfoButton").click();
              const popupPromise = page.waitForEvent("popup");
              await page.locator("#portInfoUrl").click();
              const popup = await popupPromise;
              await popup.waitForLoadState("domcontentloaded");
              r.popup = { url: popup.url(), opener: await popup.evaluate(() => Boolean(window.opener)) };
              await popup.close();
            }
          } catch (e) { r.failure = { name: e.name, message: e.message.slice(0, 300) }; }
          r.events = Object.fromEntries(Object.entries(events).map(([k, v]) => [k, v.slice(counts[k])]));
          if (process.argv.includes("--expect-fixed")) {
            const accepted = ["valid-v1", "valid-v2", "valid-v3", "text-escaped-html", "text-markup", "text-unicode", "url-https", "url-credentials", "unknown-field", "many-points-1000", "degenerate-land", "crossed-land"];
            const rejected = !accepted.includes(id);
            r.verification = !r.failure && r.after?.executed === 0 && r.after?.polluted === null
              && r.after?.payloadElements === 0 && r.after?.testApi === false && r.events.errors.length === 0
              && (!rejected || (r.after.portName === before.portName
                && (product !== "generator" || r.after.draft?.id === before.draft?.id)))
              && (!r.restoredPoison || (r.restoredPoison.portName === "Nouveau port" && r.recovered.draft?.id === "audit-baseline"));
            if (!r.verification) process.exitCode = 1;
          }
          results.push(r);
          fs.writeFileSync(path.join(output, "browser.json"), JSON.stringify(results, null, 2) + "\n");
          console.log(JSON.stringify({ mode, id, milliseconds: r.importMilliseconds, verification: r.verification, after: r.after, reloaded: r.reloaded, failure: r.failure, errors: r.events.errors, requests: r.events.requests.length }));
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

if (process.argv.includes("--child")) child();
else if (process.argv.includes("--codec")) codecAudit();
else if (process.argv.includes("--performance")) performanceAudit();
else if (process.argv.includes("--emit")) {
  const i = process.argv.indexOf("--emit"), c = corpus().find(x => x.id === process.argv[i + 1]);
  if (!c || !process.argv[i + 2]) throw new Error("Usage: --emit CASE destination.kjp");
  fs.writeFileSync(process.argv[i + 2], c.text);
} else if (process.argv.includes("--browser")) {
  // Chargé uniquement pour les essais navigateur.
  browserAudit().catch(e => { console.error(e); process.exitCode = 1; });
} else console.log("Usage: node scripts/audit-kjp-import.js --codec | --browser | --performance | --emit CASE destination.kjp");
