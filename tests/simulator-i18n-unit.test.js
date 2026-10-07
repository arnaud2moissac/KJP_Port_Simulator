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

test("Breton is discovered generically with Bzh, negotiation, all plural categories and live descriptors", () => {
  for (const [languages, stored, expected, source] of [
    [["br-FR", "fr"], null, "br", "browser"], [["en", "br"], "br", "br", "storage"],
    [["br"], "en", "en", "storage"], [["zz", "br-FR"], null, "br", "browser"]
  ]) {
    const instance = create(catalogs, { navigator: { languages }, localStorage: { getItem: () => stored } });
    assert.equal(instance.getLocale(), expected);
    assert.equal(instance.report().source, source);
  }
  const writes = [];
  const instance = create(catalogs, { navigator: { languages: ["fr"] }, localStorage: {
    getItem: () => null, setItem: (key, value) => writes.push([key, value])
  } });
  assert.deepEqual(instance.supportedLocales().find(locale => locale.code === "br"), {
    code: "br", nativeName: "Brezhoneg", shortLabel: "Bzh", direction: "ltr"
  });
  const descriptor = instance.descriptor("toast.line.length.set.m", { value1: { number: 1.25, digits: 1 } });
  assert.equal(instance.setLocale("br-FR"), true);
  assert.deepEqual(writes, [["kjp.simulator.locale", "br"]]);
  assert.equal(instance.resolve(descriptor), "Hirder an oser reoliet · 1,3 m.");
  assert.equal(instance.formatNumber(1.25, 2), "1,25");
  const date = "2026-10-07T12:00:00Z";
  assert.equal(instance.formatDate(date), new Intl.DateTimeFormat("br").format(new Date(date)));
  const breton = catalogs.find(catalog => catalog.code === "br").messages;
  // Lexique maritime 2025, p. 3: Oser = aussière; p. 4: Pontig = pontet, not catway.
  assert.equal(breton["ui.line.type"], "Oser");
  assert.equal(breton["validation.catway.absent"], "ponton bihan n'eus ket");
  const rules = new Intl.PluralRules("br");
  for (const [count, category] of [[1, "one"], [2, "two"], [3, "few"], [1000000, "many"], [0, "other"]]) {
    assert.equal(rules.select(count), category);
    for (const [key, variants] of Object.entries(breton).filter(([, value]) => typeof value === "object")) {
      assert.equal(typeof variants[category], "string", `${key}/${category}`);
      assert.equal(instance.t(key, { count, tension: "2,5" }),
        variants[category].replaceAll("{count}", count).replaceAll("{tension}", "2,5"));
    }
  }
  instance.setLocale("en");
  assert.equal(instance.resolve(descriptor), "Line length set · 1.3 m.");
  instance.setLocale("fr");
  assert.equal(instance.resolve(descriptor), "Longueur d'aussière réglée · 1,3 m.");
  assert.deepEqual(instance.report().missingKeys, []);
});

test("a catalog unsupported by Intl uses French formatting, not the device language", () => {
  const unsupported = { ...catalogs.find(catalog => catalog.code === "br"), code: "qaa" };
  assert.deepEqual(Intl.NumberFormat.supportedLocalesOf("qaa"), []);
  const instance = create([...catalogs, unsupported], { navigator: { languages: ["qaa"] } });
  assert.equal(instance.getLocale(), "qaa");
  assert.equal(instance.formatNumber(1.25, 2), "1,25");
  const date = "2026-10-07T12:00:00Z";
  assert.equal(instance.formatDate(date), new Intl.DateTimeFormat("fr").format(new Date(date)));
  assert.equal(instance.t("ui.lines.count", { count: 2 }), "2 oser");
  assert.deepEqual(instance.report().missingKeys, []);
});
