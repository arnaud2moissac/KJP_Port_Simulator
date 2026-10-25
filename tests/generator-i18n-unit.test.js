"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { create } = require("../src/simulateur-port/i18n.js");
const { check } = require("../scripts/check-generator-i18n.js");
const { loadCatalogs } = require("../scripts/localization-assets.js");
const OSM = require("../src/ports/osm-import.js");
const Decomposition = require("../src/ports/pontoon-decomposition.js");
const catalogs = loadCatalogs({ directory: path.resolve(__dirname, "../src/generateur-port/locales") });

test("generator catalogs and guides are complete; another language needs no application change", () => {
  check(catalogs);
  const extra = { ...catalogs[0], code: "it", nativeName: "Italiano", shortLabel: "IT",
    messages: { ...catalogs[0].messages, "ui.nouveau.port": "Nuovo porto" } };
  const i18n = create([...catalogs, extra], { navigator: { languages: ["it-IT"] } });
  assert.equal(i18n.t("ui.nouveau.port"), "Nuovo porto");
  assert.equal(i18n.supportedLocales().length, 4);
});

test("generator storage is independent and descriptors reformat numbers and Breton plurals", () => {
  const storage = new Map([["kjp.simulator.locale", "en"], ["kjp.generator.locale", "br"]]);
  const host = { navigator: { languages: ["fr-FR"] }, localStorage: {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
  } };
  const generator = create(catalogs, host, { storageKey: "kjp.generator.locale" });
  const simulator = create(catalogs, host);
  assert.equal(generator.getLocale(), "br");
  assert.equal(simulator.getLocale(), "en");
  const message = generator.descriptor("toast.berths", { count: 2, width: { number: 4.25, digits: 1 } });
  assert.match(generator.resolve(message), /4,3/);
  for (const count of [0, 1, 2, 3, 1000000]) {
    assert.equal(generator.t("count.boats", { count }), `${count} bag`);
  }
  generator.setLocale("en");
  assert.match(generator.resolve(message), /4\.3/);
  assert.equal(storage.get("kjp.simulator.locale"), "en");
  assert.equal(storage.get("kjp.generator.locale"), "en");
  assert.deepEqual(generator.report().missingKeys, []);
  const partial = catalogs.map(c => ({ ...c, messages: { ...c.messages } }));
  delete partial.find(c => c.code === "en").messages["ui.nouveau.port"];
  const fallback = create(partial, { navigator: { languages: ["en"] } });
  assert.equal(fallback.t("ui.nouveau.port"), "Nouveau port");
  assert.deepEqual(fallback.report().missingKeys, ["en:ui.nouveau.port"]);
});

test("OSM and decomposition diagnostics preserve French messages and carry translations", () => {
  const i18n = create(catalogs, { navigator: { languages: ["en"] } });
  assert.throws(() => OSM.validateAnalysisBounds({}), error => {
    assert.equal(error.message, "Emprise géographique incomplète.");
    assert.equal(i18n.resolve(error), "Incomplete geographic bounds.");
    return true;
  });
  const proposal = Decomposition.proposePontoonDecomposition([], 0);
  assert.equal(proposal.available, false);
  assert.match(i18n.resolve(proposal.reasonMessage), /selected OpenStreetMap pontoon/);
  assert.deepEqual(i18n.report().missingKeys, []);
});
