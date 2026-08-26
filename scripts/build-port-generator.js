"use strict";

const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { projectAssets } = require("./embed-project-readme.js");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(root, "src", "generateur-port", "template.html");
const entryPath = path.join(root, "src", "generateur-port", "main.js");
const outputPath = path.join(root, "generateur-port.html");
const cssMarker = "/*__PORT_GENERATOR_CSS__*/";
const jsMarker = "/*__PORT_GENERATOR_JS__*/";
const readmeMarker = "<!--__README_HTML__-->";
const logoMarker = "__KJP_LOGO_DATA_URI__";

async function bundle() {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    outdir: path.join(root, ".generator-build"),
    format: "iife",
    platform: "browser",
    target: ["safari15", "chrome100", "firefox100"],
    minify: false,
    legalComments: "inline",
    loader: {
      ".png": "dataurl",
      ".svg": "dataurl"
    }
  });
  const javascript = result.outputFiles.find(file => file.path.endsWith(".js"))?.text;
  const css = result.outputFiles.find(file => file.path.endsWith(".css"))?.text || "";
  if (!javascript) throw new Error("Bundle JavaScript absent.");
  return { javascript, css };
}

async function build() {
  const template = fs.readFileSync(templatePath, "utf8");
  if (
    !template.includes(cssMarker)
    || !template.includes(jsMarker)
    || !template.includes(readmeMarker)
    || !template.includes(logoMarker)
  ) {
    throw new Error("Marqueurs de build absents du générateur.");
  }
  const { logoDataUri, readmeHtml } = projectAssets(root);
  const { javascript, css } = await bundle();
  const output = template
    .replace(cssMarker, () => css.trim())
    .replace(jsMarker, () => javascript.trim())
    .replace(readmeMarker, () => readmeHtml)
    .replaceAll(logoMarker, logoDataUri);
  if (
    output.includes(cssMarker)
    || output.includes(jsMarker)
    || output.includes(readmeMarker)
    || output.includes(logoMarker)
  ) {
    throw new Error("Un marqueur subsiste dans le générateur.");
  }
  if (/<script[^>]+src=|<link[^>]+rel=["']stylesheet["'][^>]+href=/i.test(output)) {
    throw new Error("Le générateur contient une ressource JavaScript/CSS externe.");
  }
  return output;
}

(async () => {
  const output = await build();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current !== output) {
      console.error("generateur-port.html n'est pas synchronisé avec ses sources.");
      process.exitCode = 1;
    } else {
      console.log("generateur-port.html est autonome et synchronisé.");
    }
  } else {
    fs.writeFileSync(outputPath, output);
    console.log(`Construit: ${outputPath}`);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
