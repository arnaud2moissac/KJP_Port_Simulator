"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCatalogs } = require("../scripts/localization-assets.js");
const Codec = require("../src/ports/kjp-codec.js");
const catalogs = loadCatalogs();
const { create } = require("../src/simulateur-port/i18n.js");

test("locale negotiation, storage failure, fallback, plurals and formatted descriptors", () => {
  const baseCatalogs = catalogs.filter(catalog => ["fr", "en"].includes(catalog.code));
  for (const [languages, stored, expected, source] of [
    [["fr-CA"], null, "fr", "browser"], [["en-GB"], null, "en", "browser"],
    [["de-DE"], null, "fr", "fallback"], [["de", "en-US"], null, "en", "browser"],
    [["en"], "fr", "fr", "storage"], [["fr"], "xx", "fr", "browser"]
  ]) {
    const instance = create(baseCatalogs, { navigator: { languages }, localStorage: { getItem: () => stored } });
    assert.equal(instance.getLocale(), expected);
    assert.equal(instance.report().source, source);
  }
  const instance = create(baseCatalogs, { navigator: { languages: ["en"] }, localStorage: {
    getItem() { throw new Error("storage disabled"); }, setItem() { throw new Error("storage disabled"); }
  } });
  assert.equal(instance.t("ui.lines.count", { count: 1 }), "1 line");
  assert.equal(instance.t("ui.lines.count", { count: 2 }), "2 lines");
  const descriptor = instance.descriptor("toast.line.length.set.m", { value1: { number: 1.25, digits: 1 } });
  assert.equal(instance.resolve(descriptor), "Line length set · 1.3 m.");
  instance.setLocale("fr");
  assert.equal(instance.resolve(descriptor), "Longueur d'aussière réglée · 1,3 m.");
  const partial = baseCatalogs.map(c => c.code === "en" ? { ...c, messages: { ...c.messages } } : c);
  delete partial.find(c => c.code === "en").messages["ui.neutral"];
  const fallback = create(partial, { navigator: { languages: ["en"] } });
  assert.equal(fallback.t("ui.neutral"), "Neutre");
  assert.deepEqual(fallback.report().missingKeys, ["en:ui.neutral"]);
  assert.equal(fallback.setLocale("unsupported"), false);
  const extra = { ...catalogs.find(c => c.code === "en"), code: "pt-BR", nativeName: "Português", shortLabel: "PT", messages: { ...catalogs[0].messages, "ui.neutral": "Neutro" } };
  const extended = create([...baseCatalogs, extra], { navigator: { languages: ["pt-br"] } });
  assert.equal(extended.getLocale(), "pt-br");
  assert.equal(extended.t("ui.neutral"), "Neutro");
  assert.equal(extended.supportedLocales().length, 3);
  const polish = { ...extra, code: "pl", messages: { ...extra.messages, "ui.lines.count": {
    one: "{count} lina", few: "{count} liny", many: "{count} lin", other: "{count} liny"
  } } };
  const pluralInstance = create([...baseCatalogs, polish], { navigator: { languages: ["pl-PL"] } });
  assert.equal(pluralInstance.t("ui.lines.count", { count: 2 }), "2 liny");
  assert.equal(pluralInstance.t("ui.lines.count", { count: 5 }), "5 lin");
});

test("KJP validation keeps the old error contract and adds translation parameters", () => {
  assert.throws(() => Codec.parse("{"), error => {
    const entry = error.errors[0];
    assert.equal(entry.code, "json");
    assert.match(entry.message, /JSON illisible/);
    assert.equal(typeof entry.messageKey, "string");
    assert.ok(entry.messageParams.value1);
    return true;
  });
});
