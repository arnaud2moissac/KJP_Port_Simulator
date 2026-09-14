"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const scenes = require("./simulator-render-scenes.js");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, "tests", "visual-baselines", "native");
const update = process.argv.includes("--update");
const htmlIndex = process.argv.indexOf("--html");
const simulatorPath = htmlIndex >= 0
  ? path.resolve(process.argv[htmlIndex + 1])
  : path.join(root, "simulateur-port.html");
if (htmlIndex >= 0 && !process.argv[htmlIndex + 1]) throw new Error("Chemin --html absent");
const candidateDirectory = update
  ? outputDirectory
  : fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-baseline-candidate-"));
const portText = fs.readFileSync(path.join(root, "examples", "la-trinite-sur-mer.kjp"), "utf8");
const fixedTime = 12_345;
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

async function settle(page, count = 3) {
  await page.evaluate(frames => new Promise(resolve => {
    const next = remaining => requestAnimationFrame(() => remaining > 1 ? next(remaining - 1) : resolve());
    next(frames);
  }), count);
}

async function configure(page, scene) {
  await page.evaluate(({ scene, portText }) => {
    const api = window.__PORTANCE_TEST__;
    if (scene.port === "built-in") {
      api.restoreBuiltInPort();
      api.loadScenario("dockForward");
    } else {
      api.importPort(portText);
    }
    api.selectVisualTheme(scene.theme);
    api.selectCameraView(scene.view);
    if (scene.environment) api.reset({ x: 25, y: -27.35, heading: 0 }, scene.environment);
  }, { scene, portText });
  await page.locator(`[data-mode="${scene.mode}"]`).click();
  await page.waitForFunction(() => window.__PORTANCE_TEST__.worldRendererReport().player?.model?.ready);
  await settle(page, 4);
}

async function main() {
  if (!fs.existsSync(simulatorPath)) throw new Error(`HTML absent : ${simulatorPath}`);
  fs.mkdirSync(candidateDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const scene of scenes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      page.on("request", request => { if (/^https?:/i.test(request.url())) requests.push(request.url()); });
      await page.addInitScript(time => {
        const raf = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => raf(() => callback(time));
      }, fixedTime);
      const url = new URL(pathToFileURL(simulatorPath));
      url.searchParams.set("test", "1");
      await page.goto(url.href);
      await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
      await configure(page, scene);
      const file = path.join(candidateDirectory, `${scene.id}.png`);
      const source = await page.evaluate(() => (
        window.__PORTANCE_TEST__.worldRendererReport({ images: true }).image
      ));
      const image = Buffer.from(source.split(",")[1], "base64");
      fs.writeFileSync(file, image);
      const report = await page.evaluate(() => ({
        renderer: window.__PORTANCE_TEST__.worldRendererReport().active,
        snapshot: window.__PORTANCE_TEST__.snapshot(),
        camera: window.__PORTANCE_TEST__.cameraReport(),
        mooring: window.__PORTANCE_TEST__.mooringReport().rendered
      }));
      if (report.renderer !== "native") throw new Error(`${scene.id}: renderer ${report.renderer}`);
      if (errors.length || requests.length) throw new Error(`${scene.id}: ${[...errors, ...requests].join("\n")}`);
      results.push({ ...scene, image: path.relative(root, file), imageBytes: image.length,
        imageSha256: sha256(image), reportSha256: sha256(JSON.stringify(report)) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const manifest = {
    schemaVersion: 1,
    renderer: "three-native",
    sourceTag: "threejs-migration-legacy-final",
    sourceCommit: "78fb7d148fe065d6fa2479dc8c1eaae151f755e1",
    browser: `Chromium ${browser.version()}`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    fixedTime,
    scenes: results
  };
  fs.writeFileSync(path.join(candidateDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${results.length} références natives écrites dans ${candidateDirectory}`);
  if (!update) console.log("Candidat uniquement ; utiliser --update pour accepter une nouvelle référence.");
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
