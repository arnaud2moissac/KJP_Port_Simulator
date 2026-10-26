"use strict";
const { test } = require("node:test");
const Codec = require("../../src/ports/kjp-codec.js");
const { communityPcloud } = require("../helpers/community-pcloud.js");
const assert = require("node:assert/strict");
const { config, parseCatalog, responseText, verifyHash, createPublicLibrary } = require("../../src/ports/port-library.js");
const entry = { filename: "test.kjp", fileId: "123", size: 2, id: "stable-port", name: "Port test", author: "Test" };

test("catalogues et flux bornés : chemins, doublons et empreintes invalides sont refusés", async () => {
  for (const patch of [{ filename: "../outside.kjp" }, { filename: "a\\b.kjp" }, { fileId: "https://evil.test" }, { size: -1 }, { sha256: "bad" }]) {
    assert.throws(() => parseCatalog(JSON.stringify({ version: 1, ports: [{ ...entry, ...patch }] }), "community"));
  }
  assert.throws(() => parseCatalog(JSON.stringify({ version: 1, ports: [entry, entry] }), "community"));
  assert.equal(parseCatalog(JSON.stringify({ version: 1, ports: [entry] }), "community")[0].key, "community:123");
  await assert.rejects(responseText(new Response("12345"), 4), { libraryCode: "too.large" });
  await assert.rejects(verifyHash("changed", "0".repeat(64)), { libraryCode: "changed" });
});

function portText(name = "Port test", id = "stable-port") {
  const document = Codec.createEmpty({ name, id });
  document.metadata.author = "Auteur / KJP";
  document.navigation.entries.push({ id: "entry", name: "Entrée", position: { east: 0, north: 0 }, heading: 0 });
  return Codec.serialize(document);
}
function fixture(community = [], options = {}) {
  const state = { community, writes: [], ...options };
  const memory = communityPcloud(state), calls = [];
  const library = createPublicLibrary({ fetcher: async (url, options) => {
    calls.push({ url, ...options });
    return memory.fetcher(url, options);
  } });
  return { ...memory, state, calls, library };
}

test("un visiteur sans compte publie le KJP et son catalogue puis les relit par API", async () => {
  const f = fixture(), text = portText();
  await f.library.save({ text, filename: "test.kjp", confirmOverwrite: () => assert.fail("new file") });
  assert.deepEqual(f.state.writes.map(w => w.name), ["test.kjp", "catalog.json"]);
  assert.equal(f.state.savedCatalog.ports[0].sha256, f.hash(text));
  assert.equal(f.state.savedCatalog.ports[0].size, Buffer.byteLength(text));
  assert.ok(f.calls.every(call => call.credentials === "omit" && !call.headers));
  const upload = f.calls.find(call => call.method === "POST"), url = new URL(upload.url);
  assert.equal(url.hostname, "eapi8.pcloud.com");
  assert.equal(url.searchParams.get("names"), "Auteur   KJP");
  assert.equal(url.searchParams.get("filescount"), "2");
  assert.equal([...upload.body.values()].length, 2);
  const row = (await f.library.catalog()).rows[0];
  assert.equal(await f.library.load(row), text);
});

test("les petits catalogues suffisent à afficher la dernière version sans télécharger les ports", async () => {
  const f = fixture([{ name: "test.kjp", text: portText("Ancienne") },
    { name: "renamed.kjp", text: portText("Nouvelle"), modified: "2026-10-26T18:00:00Z" }]);
  const { rows } = await f.library.catalog();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.name, "Nouvelle");
  const reads = f.calls.filter(call => new URL(call.url).pathname === "/getpubtextfile");
  assert.equal(reads.length, 2);
  assert.ok(reads.every(call => !f.state.community.some(record => new URL(call.url).searchParams.get("fileid") === record.fileId)));
});

test("refuser une mise à jour n'écrit rien; l'accepter conserve l'ancien dépôt et affiche le nouveau", async () => {
  const original = { name: "test.kjp", text: portText() }, f = fixture([original]);
  const originalText = original.text;
  const text = portText("Port renommé");
  assert.equal(await f.library.save({ text, filename: "renamed.kjp", confirmOverwrite: () => false }), null);
  assert.equal(f.state.writes.length, 0);
  await f.library.save({ text, filename: "renamed.kjp", confirmOverwrite: name => { assert.equal(name, "test.kjp"); return true; } });
  assert.equal(f.state.community.length, 2);
  assert.equal(original.text, originalText);
  assert.equal((await f.library.catalog()).rows[0].metadata.name, "Port renommé");
});

test("une publication concurrente pendant la confirmation impose de relire la bibliothèque", async () => {
  const f = fixture([{ name: "test.kjp", text: portText() }]);
  await assert.rejects(f.library.save({ text: portText("Ma version"), filename: "test.kjp", confirmOverwrite: () => {
    f.state.community.push({ name: "test.kjp", text: portText("Autre version") }); return true;
  } }), { libraryCode: "changed" });
  assert.equal(f.state.writes.length, 0);
});

test("les KJP sans manifeste sont découverts; les catalogues ne peuvent référencer un autre dossier", async () => {
  const a = { name: "manual.kjp", text: portText("Manuel"), manifest: false };
  const b = { name: "other.kjp", text: portText("Autre", "other"), manifestText: JSON.stringify({ version: 1,
    ports: [{ ...entry, filename: "manual.kjp", name: "Usurpé" }] }) };
  const f = fixture([a, b, { name: "ignore.txt", text: "ignored", manifest: false }]);
  const { rows } = await f.library.catalog();
  assert.deepEqual(rows.map(row => row.metadata.name).sort(), ["Autre", "Manuel"]);
  assert.equal(f.calls.some(call => new URL(call.url).searchParams.get("fileid") === f.state.community[2].fileId), false);
  assert.equal(await f.library.load(rows.find(row => row.metadata.name === "Manuel")), a.text);
});

test("quotas, serveur arbitraire et fausse publication réussie sont signalés", async () => {
  for (const [options, expected] of [[{ uploadError: 7007 }, "quota"], [{ uploadHost: "evil.test" }, "network"],
    [{ dropPublication: true }, "publication.pending"]]) {
    const f = fixture([], options);
    await assert.rejects(f.library.save({ text: portText(), filename: "test.kjp", confirmOverwrite: () => true }), { libraryCode: expected });
    assert.equal(f.calls.some(call => new URL(call.url).hostname === "evil.test"), false);
  }
  const f = fixture([], { dropCatalog: true });
  await f.library.save({ text: portText(), filename: "test.kjp", confirmOverwrite: () => true });
  assert.equal((await f.library.catalog()).rows.length, 1, "a missing companion catalogue is recoverable");
});

test("les limites et changements de contenu protègent le chargement", async () => {
  const f = fixture([{ name: "test.kjp", text: portText() }, { name: "large.kjp", text: portText("Large", "large"),
    manifest: false, size: 10 * 1024 * 1024 + 1 }]);
  const { rows } = await f.library.catalog(), row = rows.find(row => row.filename === "test.kjp");
  assert.equal(rows.find(row => row.filename === "large.kjp").ready, false);
  assert.equal(f.calls.some(call => new URL(call.url).searchParams.get("fileid") === f.state.community[1].fileId), false);
  f.state.community[0].loadText = portText("Changed");
  await assert.rejects(f.library.load(row), { libraryCode: "changed" });
  await assert.rejects(f.library.load({ ...row, fileId: "https://evil.test" }), { libraryCode: "invalid.catalog" });
  await assert.rejects(f.library.save({ text: "{}", filename: "test.kjp" }), { libraryCode: "invalid.port" });
});

test("la publication fonctionne depuis un fichier local, localhost ou un autre hébergement", async () => {
  const previous = globalThis.location;
  try {
    for (const address of ["file:///tmp/generateur-port.html", "http://localhost:8080/editor.html", "https://example.test/ports/editor.html"]) {
      globalThis.location = new URL(address);
      const f = fixture();
      await f.library.save({ text: portText(), filename: "test.kjp", confirmOverwrite: () => assert.fail("new file") });
      assert.deepEqual(f.state.writes.map(write => write.name), ["test.kjp", "catalog.json"]);
    }
  } finally { globalThis.location = previous; }
});
