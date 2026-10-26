"use strict";

// Storage/UI only. No dependency on simulation, rendering or physical models.
const config = Object.freeze(require("./library-config.json"));
const FILE_LIMIT = 10 * 1024 * 1024;
const CATALOG_LIMIT = 2 * 1024 * 1024;
const validId = value => typeof value === "string" && /^[\w-]{1,200}$/.test(value);
const validFilename = value => typeof value === "string" && value.length <= 240
  && !/[\\/\u0000-\u001f]/.test(value) && value !== ".." && /\.kjp$/i.test(value);
const failure = (code, extra = {}) => Object.assign(new Error(code), { libraryCode: code, ...extra });

function parseCatalog(text, source) {
  let data;
  try { data = JSON.parse(text); } catch { throw failure("invalid.catalog"); }
  if (data?.version !== 1 || !Array.isArray(data.ports) || data.ports.length > 5000) throw failure("invalid.catalog");
  const ids = new Set();
  return data.ports.map(entry => {
    if (!entry || !validFilename(entry.filename) || (source === "community" && !validId(entry.fileId))
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || (entry.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(entry.sha256))) throw failure("invalid.catalog");
    const id = source === "community" ? entry.fileId : entry.filename;
    if (ids.has(id) || ids.has(`name:${entry.filename.toLowerCase()}`)) throw failure("invalid.catalog");
    ids.add(id);
    ids.add(`name:${entry.filename.toLowerCase()}`);
    const metadata = {};
    for (const key of ["id", "name", "author", "createdAt", "updatedAt"]) {
      if (entry[key] !== undefined && (typeof entry[key] !== "string" || entry[key].length > 500)) throw failure("invalid.catalog");
      metadata[key] = entry[key] || "";
    }
    return { ...entry, source, key: `${source}:${id}`, name: entry.filename, metadata,
      ready: entry.size <= FILE_LIMIT, error: entry.size > FILE_LIMIT ? failure("too.large") : null };
  });
}

async function responseText(response, limit = FILE_LIMIT) {
  if (Number(response.headers.get("content-length")) > limit) throw failure("too.large");
  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    if (blob.size > limit) throw failure("too.large");
    return blob.text();
  }
  const decoder = new TextDecoder();
  let length = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw failure("too.large"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

async function hashText(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function verifyHash(text, expected) {
  if (expected && await hashText(text) !== expected) throw failure("changed");
}

function createPublicLibrary({ settings = config, fetcher = (...args) => fetch(...args) } = {}) {
  const apiOrigin = "https://eapi.pcloud.com";
  const folderUrl = "https://e.pcloud.link/publink/show?code=" + encodeURIComponent(settings.publicCode);
  const configured = () => validId(settings.publicCode) && validId(settings.uploadCode);
  const apiError = data => failure([7001, 7002, 7004, 2009].includes(data?.result) ? "not.found"
    : [2008, 7007, 7008].includes(data?.result) ? "quota"
      : [1000, 2000, 2003].includes(data?.result) ? "forbidden" : "network");
  async function request(method, params = {}, { signal, body, text = false, limit = CATALOG_LIMIT, host = apiOrigin } = {}) {
    if (!configured()) throw failure("not.configured");
    if (!/^https:\/\/eapi\d*\.pcloud\.com$/.test(host)) throw failure("network");
    const url = new URL(method, host);
    url.search = new URLSearchParams(params);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, body ? 120000 : 20000);
    try {
      const response = await fetcher(url.href, { signal: controller.signal, credentials: "omit", cache: "no-store",
        redirect: "follow", ...(body ? { method: "POST", body } : {}) });
      if (!response.ok) throw failure(response.status === 403 ? "forbidden" : "network", { status: response.status });
      const content = await responseText(response, limit);
      let data;
      try { data = JSON.parse(content); } catch { if (!text) throw failure("network"); }
      if (Number.isInteger(data?.result) && data.result !== 0) throw apiError(data);
      if (text) return content;
      if (data?.result !== 0) throw failure("network");
      return data;
    } catch (error) {
      if (signal?.aborted || error.libraryCode) throw error;
      throw failure("network");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
  function readText(file, signal, limit = FILE_LIMIT) {
    if (!/^\d+$/.test(String(file.fileid)) || file.size > limit) throw failure("too.large");
    // getpublinkdownload is restricted to pcloud.com referrers. This public text
    // endpoint streams UTF-8 JSON with CORS support, including our .kjp files.
    return request("getpubtextfile", { code: settings.publicCode, fileid: file.fileid,
      fromencoding: "utf-8", toencoding: "utf-8" }, { signal, text: true, limit });
  }
  async function catalog(signal) {
    const data = await request("showpublink", { code: settings.publicCode }, { signal });
    const files = [], folders = [], ids = new Set();
    function visit(folder, depth = 0) {
      if (depth > 32 || !folder?.isfolder || !Array.isArray(folder.contents)) throw failure("invalid.catalog");
      const children = [];
      for (const entry of folder.contents) {
        if (ids.size >= 5000 || !entry || ids.has(entry.id)) throw failure("invalid.catalog");
        ids.add(entry.id);
        if (entry.isfolder) { visit(entry, depth + 1); continue; }
        if (!Number.isSafeInteger(entry.fileid) || entry.fileid <= 0 || !Number.isSafeInteger(entry.size)
          || entry.size < 0 || typeof entry.name !== "string") throw failure("invalid.catalog");
        children.push(entry);
        if (validFilename(entry.name)) files.push(entry);
      }
      folders.push(children);
    }
    visit(data.metadata);
    const indexed = new Map();
    let next = 0;
    async function readFolder() {
      while (next < folders.length) {
        const entries = folders[next++];
        const manifest = entries.find(file => file.name === "catalog.json");
        if (!manifest) continue;
        try {
          const rows = parseCatalog(await readText(manifest, signal, CATALOG_LIMIT), "editor");
          for (const row of rows) {
            // A manifest can only describe a .kjp in its own upload folder.
            const file = entries.find(item => item.name === row.filename && item.size === row.size);
            if (file && validFilename(file.name)) indexed.set(file.fileid, { ...row, file });
          }
        } catch (error) { if (signal?.aborted) throw error; /* Unindexed files are read below. */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, folders.length) }, readFolder));
    const rows = new Array(files.length);
    next = 0;
    async function readPort() {
      while (next < files.length) {
        const index = next++, file = files[index];
        let row = indexed.get(file.fileid);
        if (!row) {
          row = parseCatalog(JSON.stringify({ version: 1, ports: [{ filename: file.name, size: file.size }] }), "editor")[0];
          if (row.ready) try {
            const text = await readText(file, signal);
            const metadata = JSON.parse(text)?.metadata;
            if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw failure("invalid.port");
            const entry = { filename: file.name, size: file.size, sha256: await hashText(text) };
            for (const key of ["id", "name", "author", "createdAt", "updatedAt"]) entry[key] = metadata[key] || "";
            row = parseCatalog(JSON.stringify({ version: 1, ports: [entry] }), "editor")[0];
          } catch (error) {
            if (signal?.aborted) throw error;
            row.error = error.libraryCode ? error : failure("invalid.port"); row.ready = false;
          }
        }
        rows[index] = { ...row, source: "community", fileId: String(file.fileid), key: `community:${file.fileid}`,
          uploadedAt: Date.parse(file.modified) || 0 };
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, readPort));
    // Anonymous uploads cannot overwrite files. Present the latest publication
    // for each stable port ID / filename, retaining older deposits in pCloud.
    rows.sort((a, b) => b.uploadedAt - a.uploadedAt || Number(b.fileId) - Number(a.fileId));
    const seen = new Set();
    return { rows: rows.filter(row => {
      const keys = [`name:${row.filename.toLowerCase()}`, ...(row.metadata.id ? [`id:${row.metadata.id}`] : [])];
      const duplicate = keys.some(key => seen.has(key));
      keys.forEach(key => seen.add(key));
      return !duplicate;
    }) };
  }
  async function load(row, signal) {
    if (row.source !== "community" || !/^\d+$/.test(row.fileId) || !validFilename(row.filename)) throw failure("invalid.catalog");
    const text = await readText({ fileid: row.fileId, size: row.size }, signal);
    await verifyHash(text, row.sha256);
    return text;
  }
  let saving = false;
  async function save({ text, filename, confirmOverwrite }) {
    if (!configured()) throw failure("not.configured");
    if (saving) throw failure("busy");
    if (!validFilename(filename)) throw failure("invalid.port");
    if (typeof text !== "string" || new Blob([text]).size > FILE_LIMIT) throw failure("too.large");
    saving = true;
    try {
      let metadata;
      try { metadata = JSON.parse(text).metadata; } catch { throw failure("invalid.port"); }
      if (typeof metadata?.id !== "string" || !metadata.id || typeof metadata.name !== "string" || !metadata.name.trim()) throw failure("invalid.port");
      const entry = { filename, size: new Blob([text]).size, sha256: await hashText(text) };
      for (const key of ["id", "name", "author", "createdAt", "updatedAt"]) entry[key] = metadata[key] || "";
      parseCatalog(JSON.stringify({ version: 1, ports: [entry] }), "editor");
      const findExisting = rows => rows.find(row => row.metadata.id === metadata.id
        || row.filename.toLowerCase() === filename.toLowerCase());
      const existing = findExisting((await catalog()).rows);
      if (existing) {
        if (!await confirmOverwrite(existing.filename)) return null;
        const current = findExisting((await catalog()).rows);
        if (!current || current.fileId !== existing.fileId || current.sha256 !== existing.sha256) throw failure("changed");
      }
      const server = await request("currentserver");
      if (!/^eapi\d*\.pcloud\.com$/.test(server.hostname)) throw failure("network");
      const body = new FormData();
      body.append("file", new Blob([text], { type: "application/json" }), filename);
      body.append("file", new Blob([JSON.stringify({ version: 1, ports: [entry] })], { type: "application/json" }), "catalog.json");
      const author = (metadata.author || "").replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 80) || "KJP";
      await request("uploadtolink", { code: settings.uploadCode, names: author,
        filescount: 2, nopartial: 1 }, { body, host: "https://" + server.hostname });
      const published = (await catalog()).rows.find(row => row.sha256 === entry.sha256 && row.filename === filename);
      if (!published) throw failure("publication.pending");
      return published;
    } finally { saving = false; }
  }
  return { folderUrl, configured, catalog, load, save };
}

module.exports = { config, parseCatalog, responseText, verifyHash, createPublicLibrary };
