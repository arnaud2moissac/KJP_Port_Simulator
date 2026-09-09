"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const simulatorPath = path.join(root, "simulateur-port.html");
const communityPortPath = path.join(root, "examples", "la-trinite-sur-mer.kjp");
const baselineDirectory = path.join(root, "tests", "visual-baselines", "legacy");
const updateBaseline = process.argv.includes("--update");
// Les références ne sont réécrites que sur demande explicite.
const outputDirectory = updateBaseline
  ? baselineDirectory
  : fs.mkdtempSync(path.join(require("node:os").tmpdir(), "kjp-render-candidate-"));
const viewport = { width: 1280, height: 800 };
const fixedAnimationTimeMs = 12_345;

const scenes = Object.freeze([
  {
    id: "built-in-dark-top-navigation",
    port: "built-in",
    theme: "dark",
    view: "top",
    mode: "navigation"
  },
  {
    id: "built-in-chart-top-understand",
    port: "built-in",
    theme: "chart",
    view: "top",
    mode: "understand",
    environment: {
      windSpeedKn: 12,
      windFromDeg: 300,
      currentSpeedKn: 1.4,
      currentFromDeg: 215
    }
  },
  {
    id: "built-in-dark-anatomy-understand",
    port: "built-in",
    theme: "dark",
    view: "anatomy",
    mode: "understand"
  },
  {
    id: "built-in-chart-skipper-navigation",
    port: "built-in",
    theme: "chart",
    view: "skipper",
    mode: "navigation"
  },
  {
    id: "la-trinite-dark-top-navigation",
    port: "la-trinite-sur-mer",
    theme: "dark",
    view: "top",
    mode: "navigation"
  },
  {
    id: "la-trinite-chart-skipper-navigation",
    port: "la-trinite-sur-mer",
    theme: "chart",
    view: "skipper",
    mode: "navigation"
  }
]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function waitForStableFrames(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function configureScene(page, scene, communityPortText) {
  if (scene.port === "built-in") {
    await page.evaluate(() => window.__PORTANCE_TEST__.restoreBuiltInPort());
  } else {
    await page.evaluate(
      text => window.__PORTANCE_TEST__.importPort(text),
      communityPortText
    );
  }

  await page.evaluate(selected => {
    const api = window.__PORTANCE_TEST__;
    if (selected.port === "built-in") api.loadScenario("dockForward");
    api.selectVisualTheme(selected.theme);
    api.selectCameraView(selected.view);
    if (selected.environment) {
      api.reset(
        { x: 25, y: -27.35, heading: 0 },
        selected.environment
      );
    }
  }, scene);
  await page.locator(`[data-mode="${scene.mode}"]`).click();
  await waitForStableFrames(page);
}

async function captureScene(browser, browserVersion, scene, communityPortText) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  const externalRequests = [];

  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("request", request => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url());
  });
  await page.addInitScript(fixedTime => {
    const browserRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => browserRequestAnimationFrame(
      () => callback(fixedTime)
    );
  }, fixedAnimationTimeMs);

  const simulatorUrl = new URL(pathToFileURL(simulatorPath));
  simulatorUrl.searchParams.set("test", "1");
  await page.goto(simulatorUrl.href);
  await page.waitForFunction(() => Boolean(window.__PORTANCE_TEST__));
  await configureScene(page, scene, communityPortText);
  // Les notifications d'import expirent en temps réel, indépendamment du temps
  // visuel fixé. Attendre leur fin évite de capturer un toast selon la vitesse GPU.
  await page.waitForFunction(
    () => !document.querySelector("#impactToast").classList.contains("visible")
  );
  await page.waitForTimeout(750);

  // Chromium/SwiftShader peut livrer une première lecture incomplète d'un
  // canevas WebGL transparent. Une lecture de chauffe rend l'étalon final
  // indépendant de ce démarrage à froid.
  await page.locator(".stage").screenshot({ animations: "disabled" });
  await waitForStableFrames(page);

  const diagnostics = await page.evaluate(() => ({
    camera: window.__PORTANCE_TEST__.cameraReport(),
    performance: window.__PORTANCE_TEST__.renderPerformanceReport(),
    theme: window.__PORTANCE_TEST__.visualThemeReport(),
    topology: window.__PORTANCE_TEST__.topologyReport(),
    visual: window.__PORTANCE_TEST__.visualReport()
  }));
  const imagePath = path.join(outputDirectory, `${scene.id}.png`);
  const image = await page.locator(".stage").screenshot({
    path: imagePath,
    animations: "disabled"
  });
  const stage = await page.locator(".stage").evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: bounds.width,
      height: bounds.height,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage
    };
  });
  await page.close();

  if (errors.length) {
    throw new Error(`${scene.id}: erreurs runtime\n${errors.join("\n")}`);
  }
  if (externalRequests.length) {
    throw new Error(
      `${scene.id}: requêtes réseau interdites\n${externalRequests.join("\n")}`
    );
  }
  if (!diagnostics.visual.renderer.webgl2) {
    throw new Error(`${scene.id}: le renderer Legacy WebGL2 n'est pas disponible`);
  }

  return {
    ...scene,
    image: path.relative(root, imagePath),
    imageBytes: image.length,
    imageSha256: sha256(image),
    browser: `Chromium ${browserVersion}`,
    viewport,
    stage,
    deviceScaleFactor: 1,
    fixedAnimationTimeMs,
    diagnostics
  };
}

async function main() {
  if (!fs.existsSync(simulatorPath)) {
    throw new Error("simulateur-port.html absent ; lancez npm run build:simulator");
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const baseline = updateBaseline ? null : JSON.parse(fs.readFileSync(
    path.join(baselineDirectory, "manifest.json"), "utf8"
  ));
  const communityPortText = fs.readFileSync(communityPortPath, "utf8");
  const browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const results = [];

  try {
    for (const scene of scenes) {
      process.stdout.write(`Capture ${scene.id}... `);
      const result = await captureScene(
        browser,
        browserVersion,
        scene,
        communityPortText
      );
      results.push(result);
      console.log(
        `${Math.round(result.imageBytes / 1024)} KiB, `
        + `P95 CPU ${result.diagnostics.performance.p95CpuMs.toFixed(2)} ms`
      );
    }
  } finally {
    await browser.close();
  }

  const manifestPath = path.join(outputDirectory, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    renderer: "legacy-webgl2",
    generatedAt: new Date().toISOString(),
    source: path.relative(root, simulatorPath),
    communityPort: path.relative(root, communityPortPath),
    scenes: results
  }, null, 2)}\n`);
  console.log(`Captures écrites dans ${outputDirectory}`);
  if (baseline) {
    const differences = results.filter(result => {
      const reference = baseline.scenes.find(scene => scene.id === result.id);
      return !reference || reference.imageSha256 !== result.imageSha256;
    });
    if (differences.length) {
      throw new Error(`Écart visuel : ${differences.map(scene => scene.id).join(", ")}`);
    }
    console.log(`${results.length}/${baseline.scenes.length} empreintes Legacy identiques`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
