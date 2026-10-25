"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { babelParse, traverse } = require("../node_modules/playwright/lib/transform/babelBundle.js");
const { loadCatalogs, localizedTemplate } = require("./localization-assets.js");
const root = path.resolve(__dirname, "..");

function check(catalogs = loadCatalogs({ directory: path.join(root, "src/generateur-port/locales") })) {
  const reference = catalogs.find(catalog => catalog.code === "fr").messages;
  const template = fs.readFileSync(path.join(root, "src/generateur-port/template.html"), "utf8");
  localizedTemplate(template, catalogs);
  const failures = [];
  const known = key => {
    if (!(key in reference)) failures.push(`Unknown generator translation key: ${key}`);
  };
  for (const file of ["src/generateur-port/main.js", "src/ports/kjp-codec.js",
    "src/ports/osm-import.js", "src/ports/pontoon-decomposition.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    traverse(babelParse(source, file), {
      CallExpression(p) {
        if (["t", "msg"].includes(p.node.callee.name) && p.node.arguments[0]?.type === "StringLiteral") {
          known(p.node.arguments[0].value);
        }
      },
      ObjectProperty(p) {
        if (["key", "messageKey"].includes(p.node.key.name) && p.node.value.type === "StringLiteral") {
          known(p.node.value.value);
        }
      }
    });
  }
  const html = template.slice(0, template.indexOf('<script>\nwindow.__KJP_GENERATOR_LOCALES__'));
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*)>([^<]*)/g)) {
    const [, tag, attrs, raw] = match;
    if (["script", "style"].includes(tag)) continue;
    if (/\p{L}/u.test(raw.trim()) && !attrs.includes("data-i18n=")
      && !/^(KJP Port Simulator|OpenStreetMap|OpenSeaMap|V)$/.test(raw.trim())) {
      failures.push(`Unbound generator text: ${raw.trim().slice(0, 100)}`);
    }
    for (const attr of attrs.matchAll(/\b(aria-label|title|placeholder)="([^"]+)"/g)) {
      if (!attrs.includes("data-i18n-attr=") && !/^https:/.test(attr[2])) {
        failures.push(`Unbound generator ${attr[1]}: ${attr[2]}`);
      }
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`Generator: ${catalogs.length} languages, ${Object.keys(reference).length} messages; catalogs, guides and bindings validated.`);
  return catalogs;
}
if (require.main === module) check();
module.exports = { check };
