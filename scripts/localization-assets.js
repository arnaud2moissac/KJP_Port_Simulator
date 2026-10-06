"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { renderReadme } = require("./embed-project-readme.js");
const { create } = require("../src/simulateur-port/i18n.js");
const root = path.resolve(__dirname, "..");
function parameters(value) {
  return [...new Set(String(value).match(/\{\w+\}/g) || [])].sort().join(",");
}
function loadCatalogs({ includeGuides = false } = {}) {
  const directory = path.join(root, "src/simulateur-port/locales");
  const catalogs = fs.readdirSync(directory).filter(file => file.endsWith(".json")).sort()
    .map(file => {
      const catalog = JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
      Intl.getCanonicalLocales(catalog.code);
      if (file !== `${catalog.code}.json` || !catalog.nativeName || !catalog.shortLabel
        || !["ltr", "rtl"].includes(catalog.direction)) throw new Error(`Invalid locale metadata: ${file}`);
      const guide = path.resolve(root, catalog.guide);
      if (!guide.startsWith(root + path.sep) || !fs.existsSync(guide)) throw new Error(`Missing guide: ${file}`);
      const markdown = fs.readFileSync(guide, "utf8");
      for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
        if (!fs.existsSync(path.resolve(path.dirname(guide), match[1]))) {
          throw new Error(`Missing guide image: ${catalog.code}/${match[1]}`);
        }
      }
      return includeGuides ? { ...catalog, guideHtml: renderReadme(markdown, path.dirname(guide)) } : catalog;
    });
  const reference = catalogs.find(catalog => catalog.code === "fr");
  if (new Set(catalogs.map(c => c.code.toLowerCase())).size !== catalogs.length) throw new Error("Duplicate locale codes");
  if (!reference) throw new Error("Missing French reference catalog");
  const keys = Object.keys(reference.messages).sort();
  for (const catalog of catalogs) {
    if (JSON.stringify(Object.keys(catalog.messages).sort()) !== JSON.stringify(keys)) {
      throw new Error(`Translation key mismatch: ${catalog.code}`);
    }
    for (const key of keys) {
      const expected = reference.messages[key], actual = catalog.messages[key];
      if (typeof expected !== typeof actual) throw new Error(`Translation type mismatch: ${catalog.code}/${key}`);
      const variants = typeof expected === "object" ? Object.keys(actual) : [null];
      if (typeof expected === "object") {
        const categories = new Set(new Intl.PluralRules(catalog.code).resolvedOptions().pluralCategories);
        if (typeof actual.other !== "string" || variants.some(variant => !categories.has(variant))) {
          throw new Error(`Plural mismatch: ${catalog.code}/${key}`);
        }
      }
      for (const variant of variants) {
        const a = variant ? actual[variant] : actual;
        const e = variant ? expected.other : expected;
        if (typeof a !== "string" || /<\/?[a-z][^>]*>/i.test(a)) throw new Error(`HTML in translation: ${catalog.code}/${key}`);
        if (parameters(a) !== parameters(e)) throw new Error(`Translation parameters mismatch: ${catalog.code}/${key}`);
        if (e && !a) throw new Error(`Empty translation: ${catalog.code}/${key}`);
      }
    }
  }
  return catalogs.sort((left, right) => left.code === "fr" ? -1 : right.code === "fr" ? 1 : left.code.localeCompare(right.code));
}
function localizedTemplate(template, catalogs) {
  const i18n = create(catalogs);
  for (const match of template.matchAll(/data-i18n(?:-attr)?="([^"]+)"/g)) {
    for (const binding of match[1].split(";")) {
      const key = binding.includes(":") ? binding.split(":")[1] : binding;
      if (!(key in catalogs.find(c => c.code === "fr").messages)) throw new Error(`Unknown HTML translation key: ${key}`);
    }
  }
  return template.replace(/(<[\w-]+\b[^>]*data-i18n="([^"]+)"[^>]*>)([^<]*)(<\/[^>]+>)/g,
    (_, open, key, text, close) => open + i18n.t(key).replaceAll("&", "&amp;").replaceAll("<", "&lt;") + close);
}
module.exports = { loadCatalogs, localizedTemplate };
