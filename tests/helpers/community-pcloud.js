"use strict";
const crypto = require("node:crypto");
const { config } = require("../../src/ports/port-library.js");
const hash = text => crypto.createHash("sha256").update(text).digest("hex");
function catalogEntry(record) {
  let metadata;
  try { metadata = JSON.parse(record.text).metadata; } catch { metadata = { name: "Fichier invalide" }; }
  const entry = { filename: record.name, size: record.size ?? Buffer.byteLength(record.text), sha256: hash(record.text) };
  for (const key of ["id", "name", "author", "createdAt", "updatedAt"]) if (metadata?.[key] !== undefined) entry[key] = metadata[key];
  return entry;
}
function multipartFiles(buffer, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  if (!boundary) throw new Error("Missing multipart boundary");
  return buffer.toString("utf8").split("--" + (boundary[1] || boundary[2])).flatMap(part => {
    const split = part.indexOf("\r\n\r\n"), filename = /filename="([^"]+)"/.exec(part.slice(0, split));
    return filename ? [{ name: filename[1], text: part.slice(split + 4).replace(/\r\n$/, "") }] : [];
  });
}
function communityPcloud(state) {
  let sequence = 1000;
  const prepare = () => {
    for (const record of state.community) {
      if (!record.fileId) { record.fileId = String(sequence); sequence += 10; }
    }
  };
  const manifest = record => record.manifestText ?? JSON.stringify({ version: 1, ports: [catalogEntry(record)] });
  function tree() {
    prepare();
    return { isfolder: true, id: "d1", folderid: 1, name: "KJP_ports", contents: state.community.map(record => ({
      isfolder: true, id: `d${record.fileId}`, name: `Publication ${record.fileId}`, contents: [
        { isfolder: false, id: `f${record.fileId}`, fileid: Number(record.fileId), name: record.name,
          size: record.size ?? Buffer.byteLength(record.text), modified: record.modified || "2026-10-25T18:00:00Z" },
        ...(record.manifest === false ? [] : [{ isfolder: false, id: `f${Number(record.fileId) + 1}`,
          fileid: Number(record.fileId) + 1, name: "catalog.json", size: Buffer.byteLength(manifest(record)) }])
      ]
    })) };
  }
  async function fetcher(address, options = {}) {
    const url = new URL(address), method = url.pathname.slice(1), params = Object.fromEntries(url.searchParams);
    const json = data => Response.json(data, { headers: { "Access-Control-Allow-Origin": "*" } });
    if ((state.pcloudStatus || 200) !== 200) return new Response("{}", { status: state.pcloudStatus });
    if (method === "showpublink") {
      if (params.code !== config.publicCode) return json({ result: 7001 });
      if (state.beforeCommunity) await state.beforeCommunity();
      return json({ result: 0, metadata: state.mockTree || tree() });
    }
    if (method === "getpubtextfile") {
      prepare();
      if (params.code !== config.publicCode) return json({ result: 7001 });
      const port = state.community.find(record => record.fileId === params.fileid);
      const catalog = state.community.find(record => Number(record.fileId) + 1 === Number(params.fileid) && record.manifest !== false);
      if (!port && !catalog) return json({ result: 2009 });
      if (port && state.beforeLoad) await state.beforeLoad();
      if (port?.loadStatus) return new Response("{}", { status: port.loadStatus });
      return new Response(port ? port.loadText ?? port.text : manifest(catalog), { headers: { "Content-Type": "text/plain;charset=UTF-8" } });
    }
    if (method === "currentserver") return json({ result: 0, hostname: state.uploadHost || "eapi8.pcloud.com" });
    if (method === "uploadtolink") {
      if (state.uploadError) return json({ result: state.uploadError });
      if (params.code !== config.uploadCode || !params.names || params.filescount !== "2") return json({ result: 2001 });
      const files = [];
      for (const [, blob] of options.body.entries()) files.push({ name: blob.name, text: await blob.text() });
      state.writes.push(...files.map(file => ({ ...file, method: "POST" })));
      const port = files.find(file => /\.kjp$/i.test(file.name)), catalog = files.find(file => file.name === "catalog.json");
      state.savedCatalog = JSON.parse(catalog.text);
      if (!state.dropPublication) state.community.push({ ...port, manifestText: catalog.text, manifest: !state.dropCatalog });
      return json({ result: 0 });
    }
    throw new Error("Unexpected pCloud method: " + method);
  }
  return { fetcher, hash, tree };
}
module.exports = { communityPcloud, catalogEntry, multipartFiles };
