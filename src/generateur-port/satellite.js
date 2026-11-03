// Satellite image transport and presence checks; never imports editor geometry.
// Routing masks include coastal margins. Manual source selection remains available.
const CONFIG = require("./satellite-config.json");
const DAY = 86400000;
const WORLD = 20037508.342789244;
const PROVIDERS = {
  ign: {
    name: "IGN BD ORTHO",
    version: "current",
    maxZoom: 19,
    persistent: true,
    attribution: "\xA9 IGN \xB7 BD ORTHO",
    license: "Licence ouverte Etalab 2.0",
    reference: "https://geoservices.ign.fr/bdortho",
    url: (z, x, y) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM_0_19&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`
  },
  esri: {
    name: "Esri World Imagery",
    version: "current",
    maxZoom: 19,
    persistent: false,
    attribution: "Powered by Esri | Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    license: "Esri terms of use",
    reference: "https://www.esri.com/en-us/legal/terms/full-master-agreement",
    url: (z, x, y) => `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${encodeURIComponent(CONFIG.esriApiKey)}`
  },
  eox: {
    name: "EOX Sentinel-2 cloudless 2025",
    version: "2025",
    maxZoom: 14,
    persistent: true,
    attribution: "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)",
    license: "CC BY-NC-SA 4.0",
    reference: "https://cloudless.eox.at/documentation/license",
    url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/${z}/${y}/${x}.jpg`
  }
};
function escapeCredit(text) {
  return String(text).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}
function mapAttribution(provider) {
  const info = PROVIDERS[provider];
  if (provider === "ign") return "© IGN · BD ORTHO";
  const label = provider === "esri" ? 'Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>' : '© <a href="https://cloudless.eox.at/" target="_blank" rel="noopener">EOX</a> · Copernicus 2025';
  return `<details class="satellite-credit"><summary>${label}</summary><span>${escapeCredit(info.attribution)} · <a href="${info.reference}" target="_blank" rel="noopener">${escapeCredit(info.license)}</a></span></details>`;
}
// Satellite JPEG tiles are opaque. Subtract higher paint rectangles to track only
// sources whose pixels survive compositing, without reading the rendered canvas.
function visibleProviders(painted) {
  const covered = [], visible = new Set();
  for (const {provider, rect} of [...painted].reverse()) {
    if (rect[0] >= rect[2] || rect[1] >= rect[3]) continue;
    let fragments = [rect];
    for (const [a,b,c,d] of covered) {
      const next = [];
      for (const [x,y,z,w] of fragments) {
        const left=Math.max(x,a), top=Math.max(y,b), right=Math.min(z,c), bottom=Math.min(w,d);
        if (left>=right || top>=bottom) { next.push([x,y,z,w]);continue; }
        if(y<top)next.push([x,y,z,top]);if(bottom<w)next.push([x,bottom,z,w]);
        if(x<left)next.push([x,top,left,bottom]);if(right<z)next.push([right,top,z,bottom]);
      }
      fragments=next;if(!fragments.length)break;
    }
    if(fragments.length)visible.add(provider);
    covered.push(rect);
  }
  return visible;
}
const FRANCE = [[-5.25, 48.6], [-4.9, 47.7], [-2.1, 46.6], [-1.85, 43.3], [-1.4, 43.1], [0.7, 42.55], [3.3, 42.35], [3.4, 43.15], [6.1, 42.95], [7.65, 43.7], [7.1, 44.25], [7.2, 45], [6.85, 45.9], [7.65, 47.6], [8.25, 48.95], [7.4, 49.2], [6.35, 49.55], [5.7, 49.6], [4.8, 50.2], [4.1, 50], [2.55, 51.2], [1.5, 50.95], [0, 49.8], [-2, 49.85], [-2, 48.8]];
const TERRITORIES = [[8.4, 41.25, 9.7, 43.15], [-61.9, 15.8, -60.95, 16.6], [-61.35, 14.3, -60.75, 14.95], [-54.7, 2, -51.5, 5.9], [55.15, -21.5, 55.95, -20.8], [44.9, -13.1, 45.4, -12.55], [-56.6, 46.7, -56, 47.3], [-63.2, 17.8, -62.75, 18.2], [-62.95, 17.8, -62.7, 18], [163.4, -23, 168.3, -19.4], [-178.3, -14.5, -175.9, -13.1], [-155, -28, -134, -7]];
function insidePolygon(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [a, b] = p[i], [c, d] = p[j];
    if (b > y !== d > y && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}
function inFrance(lon, lat) {
  return insidePolygon(lon, lat, FRANCE) || TERRITORIES.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n);
}
function geographic(extent) {
  const lon = (x) => x / WORLD * 180, lat = (y) => Math.atan(Math.sinh(y / WORLD * Math.PI)) * 180 / Math.PI;
  const width = Math.min(360, lon(extent[2] - extent[0]));
  const west = ((lon(extent[0]) + 180) % 360 + 360) % 360 - 180;
  return { west, south: lat(extent[1]), east: west + width, north: lat(extent[3]) };
}
function parts(b) {
  return b.east > 180 ? [{ ...b, east: 180 }, { ...b, west: -180, east: b.east - 360 }] : [b];
}
function query(b) {
  return `[out:json][timeout:8];(${parts(b).map((p) => `nwr["seamark:type"](${p.south},${p.west},${p.north},${p.east});`).join("")});out count;`;
}
function parseCount(data) {
  if (data?.remark || data?.elements?.length !== 1 || data.elements[0].type !== "count" || !/^\d+$/.test(data.elements[0].tags?.total)) throw Error("Incomplete Overpass count");
  return Number(data.elements[0].tags.total) > 0;
}
function contains(a, b) {
  return a.west <= b.west && a.east >= b.east && a.south <= b.south && a.north >= b.north;
}
function tiles(extent, zoom) {
  const n = 2 ** zoom, span = 2 * WORLD / n, output = [];
  for (let x = Math.floor((extent[0] + WORLD) / span); x <= Math.ceil((extent[2] + WORLD) / span) - 1; x++)
    for (let y = Math.max(0, Math.floor((WORLD - extent[3]) / span)); y <= Math.min(n - 1, Math.ceil((WORLD - extent[1]) / span) - 1); y++)
      output.push({ z: zoom, x: (x % n + n) % n, y, left: x * span - WORLD, top: WORLD - y * span, span });
  return output;
}
class Store {
  constructor(onFailure) {
    this.failed = false;
    this.onFailure = onFailure;
    this.db = this.open();
  }
  fail() {
    if (!this.failed) {
      this.failed = true;
      this.onFailure();
    }
  }
  open() {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open("kjp-satellite", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("tiles", { keyPath: "key" });
          r.result.createObjectStore("presence", { keyPath: "key" });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => {
          this.fail();
          resolve(null);
        };
        r.onblocked = () => {
          this.fail();
          resolve(null);
        };
      } catch {
        this.fail();
        resolve(null);
      }
    });
  }
  async run(store, mode, action) {
    const db = await this.db;
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(store, mode), req = action(tx.objectStore(store));
        let value = null;
        if (req) req.onsuccess = () => {
          value = req.result;
        };
        tx.oncomplete = () => resolve(value);
        tx.onerror = tx.onabort = () => {
          this.fail();
          resolve(null);
        };
      } catch {
        this.fail();
        resolve(null);
      }
    });
  }
  get(store, key) {
    return this.run(store, "readonly", (s) => s.get(key));
  }
  all(store) {
    return this.run(store, "readonly", (s) => s.getAll());
  }
  async put(store, value) {
    await this.run(store, "readwrite", (s) => s.put(value));
    const rows = await this.all(store) || [];
    rows.sort((a, b) => a.used - b.used);
    let size = rows.reduce((sum, r) => sum + (r.blob?.size || 0), 0), count = rows.length;
    const remove = [];
    for (const row of rows) {
      if (store === "tiles" ? size <= 256 * 1024 * 1024 : count <= 512) break;
      size -= row.blob?.size || 0;
      count--;
      remove.push(row.key);
    }
    if (remove.length) await this.run(store, "readwrite", (s) => {
      for (const key of remove) s.delete(key);
    });
  }
  clear() {
    return this.run("tiles", "readwrite", (s) => s.clear());
  }
}
class Satellite {
  constructor({ changed, status, used, endpoint, fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), store = null }) {
    Object.assign(this, { changed, status, used, endpoint, fetchImpl, now });
    this.memory = /* @__PURE__ */ new Map();
    this.presence = /* @__PURE__ */ new Map();
    this.disabled = /* @__PURE__ */ new Set();
    this.controllers = /* @__PURE__ */ new Set();
    this.epoch = 0;
    this.lastPresence = -Infinity;
    this.seamarkTiles = new Map();
    this.retryAt = 0;
    this.analysis = false;
    this.state = "cache";
    this.providers = new Set();
    this.view = null;
    this.store = store || new Store(() => {
      this.storageUnavailable = true;
      this.emit();
    });
    this.busy = false;
    this.queued = false;
  }
  emit() {
    this.status?.({ state: this.state, providers: [...this.providers], storageUnavailable: !!this.storageUnavailable });
  }
  cancel() {
    this.epoch++;
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
    clearTimeout(this.timer);
    clearTimeout(this.presenceTimer);
  }
  update(view) {
    this.cancel();
    this.view = view;
    this.providers = /* @__PURE__ */ new Set();
    this.state = view.zoom < 16 ? "zoom" : "cache";
    this.emit();
    this.changed();
    this.timer = setTimeout(() => this.refresh(), 300);
  }
  chain(includeDisabled = false) {
    const b = geographic(this.view.extent), lon = ((b.west + b.east) / 2 + 180) % 360 - 180;
    let first = this.view.mode === "auto" ? inFrance(lon, (b.south + b.north) / 2) ? "ign" : "esri" : this.view.mode;
    return (this.view.mode === "ign" ? ["ign"] : first === "ign" ? ["ign", "esri", "eox"] : first === "esri" ? ["esri", "eox"] : ["eox"]).filter((p) => (includeDisabled || !this.disabled.has(p)) && (p !== "esri" || CONFIG.esriApiKey));
  }
  async cached(provider, tile) {
    const p = PROVIDERS[provider], key = `${provider}/${p.version}/${tile.z}/${tile.x}/${tile.y}`;
    if (this.memory.has(key)) return this.memory.get(key);
    if (!p.persistent) return null;
    const row = await this.store.get("tiles", key);
    if (!row) return null;
    try {
      const image = await this.decode(row.blob);
      const record = { ...row, image };
      this.memory.set(key, record);
      row.used = this.now();
      void this.store.run("tiles", "readwrite", (s) => s.put(row));
      this.trim();
      return record;
    } catch {
      return null;
    }
  }
  trim() {
    while (this.memory.size > 512) this.memory.delete(this.memory.keys().next().value);
  }
  decode(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(Error("image"));
      };
      img.src = url;
    });
  }
  allowed(epoch, provider = "esri") {
    return epoch === this.epoch && this.view?.enabled && (provider !== "esri" ||
      this.view.zoom >= 16 && (this.view.local || this.proof === JSON.stringify(geographic(this.view.extent))));
  }
  async seamarkPresence(epoch) {
    const extent = this.view.extent;
    const wanted = tiles(extent, Math.min(18, Math.floor(this.view.zoom)));
    if (wanted.length > 32) return null;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 8000);
    let found = false, incomplete = false;
    try {
      await Promise.all(Array.from({ length: Math.min(4, wanted.length) }, async () => {
        while (wanted.length && !found && epoch === this.epoch && !controller.signal.aborted) {
          const tile = wanted.shift(), key = `${tile.z}/${tile.x}/${tile.y}`;
          try {
            let cached = this.seamarkTiles.get(key);
            if (!cached || this.now() - cached.at >= DAY) {
              const response = await this.fetchImpl(`https://tiles.openseamap.org/seamark/${key}.png`, { signal: controller.signal, cache: "default" });
              if (!response.ok) throw Error("OpenSeaMap unavailable");
              const image = await this.decode(await response.blob());
              if (epoch !== this.epoch) return;
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height;
              if (canvas.width !== 256 || canvas.height !== 256) throw Error("Invalid seamark tile");
              const context = canvas.getContext("2d");context.drawImage(image, 0, 0);
              const pixels = context.getImageData(0, 0, 256, 256).data;
              // OpenSeaMap has a transparent background; reject opaque error images.
              if (!pixels.some((value, index) => index % 4 === 3 && value === 0)) throw Error("Opaque seamark tile");
              cached = { pixels, at: this.now() };this.seamarkTiles.set(key, cached);
              while (this.seamarkTiles.size > 128) this.seamarkTiles.delete(this.seamarkTiles.keys().next().value);
            }
            const x0 = Math.max(0, Math.floor((extent[0] - tile.left) / tile.span * 256));
            const x1 = Math.min(256, Math.ceil((extent[2] - tile.left) / tile.span * 256));
            const y0 = Math.max(0, Math.floor((tile.top - extent[3]) / tile.span * 256));
            const y1 = Math.min(256, Math.ceil((tile.top - extent[1]) / tile.span * 256));
            for (let y = y0; y < y1 && !found; y++) for (let x = x0; x < x1; x++) {
              if (cached.pixels[(y * 256 + x) * 4 + 3] > 0) { found = true; break; }
            }
          } catch { incomplete = true; }
        }
      }));
      return epoch !== this.epoch ? null : found ? true : incomplete || controller.signal.aborted ? null : false;
    } finally { clearTimeout(timeout); this.controllers.delete(controller); }
  }
  async rememberPresence(key, b, present) {
    const row = { key, bounds: b, present, at: this.now(), used: this.now() };
    this.presence.set(key, row);
    while (this.presence.size > 512) this.presence.delete(this.presence.keys().next().value);
    await this.store.put("presence", row);
    return present;
  }
  async presenceCheck(epoch, b) {
    const key = JSON.stringify(b), now = this.now();
    if (!this.presence.size) {
      for (const r of await this.store.all("presence") || []) this.presence.set(r.key, r);
    }
    if (epoch !== this.epoch) return false;
    const match = [...this.presence.values()].find((r) => now - r.at < DAY && (r.key === key || !r.present && contains(r.bounds, b)));
    if (match) return match.present;
    const width = (b.east - b.west) * 111320 * Math.cos((b.south + b.north) * Math.PI / 360), height = (b.north - b.south) * 111320;
    if (width > 1e4 || height > 1e4) {
      this.state = "zoom";
      return false;
    }
    if (this.analysis) return false;
    if (this.retryAt > now) {
      const present = await this.seamarkPresence(epoch);
      if (present !== null && epoch === this.epoch) return this.rememberPresence(key, b, present);
      this.state = "unavailable"; return false;
    }
    const wait = Math.max(1e3 - (now - this.view.at), 1e4 - (now - this.lastPresence));
    if (wait > 0) {
      this.presenceTimer = setTimeout(() => this.refresh(), wait + 5);
      return false;
    }
    this.state = "checking";
    this.emit();
    this.lastPresence = now;
    const c = new AbortController();
    this.controllers.add(c);
    const timeout = setTimeout(() => c.abort(), 1e4);
    try {
      const response = await this.fetchImpl(this.endpoint(), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: `data=${encodeURIComponent(query(b))}`, signal: c.signal });
      if (!response.ok) {
        const value = response.headers.get("Retry-After");
        this.retryAt = Math.max(now + 6e4, /^\d+$/.test(value || "") ? now + Number(value) * 1e3 : Date.parse(value) || 0);
        throw Error("overpass");
      }
      const present = parseCount(await response.json());
      if (epoch !== this.epoch) return false;
      const row = { key, bounds: b, present, at: this.now(), used: this.now() };
      this.presence.set(key, row);
      while (this.presence.size > 512) this.presence.delete(this.presence.keys().next().value);
      void this.store.put("presence", row);
      this.state = "cache";
      return present;
    } catch {
      if (epoch === this.epoch) {
        this.retryAt = Math.max(this.retryAt, this.now() + 6e4);
        const present = await this.seamarkPresence(epoch);
        if (present !== null && epoch === this.epoch) return this.rememberPresence(key, b, present);
        this.state = "unavailable";
        this.presenceTimer = setTimeout(() => this.refresh(), this.retryAt - this.now() + 5);
      }
      return false;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(c);
    }
  }
  async refresh() {
    if (this.busy) {
      this.queued = true;
      return;
    }
    this.busy = true;
    const epoch = this.epoch;
    try {
      if (!this.view?.enabled) return;
      const chain = this.chain();
      const jobs = [];
      for (const provider of chain) for (const tile of tiles(this.view.extent, Math.min(Math.floor(this.view.zoom), PROVIDERS[provider].maxZoom))) {
        const row = await this.cached(provider, tile);
        jobs.push({ provider, tile, row });
      }
      if (epoch !== this.epoch) return;
      this.changed();
      this.proof = null;
      const forceRefresh = this.forceRefresh;
      this.forceRefresh = false;
      for (const provider of chain) {
        const work = jobs.filter(j => j.provider === provider && (forceRefresh || !j.row || this.now() - j.row.at > 90 * DAY));
        if (!work.length) { this.state = provider === "eox" ? "coarse" : "cache";this.emit();return; }
        if (provider === "esri" && this.view.zoom >= 16 && !this.view.local) {
          const b = geographic(this.view.extent);
          if (await this.presenceCheck(epoch, b)) this.proof = JSON.stringify(b);
          if (epoch !== this.epoch) return;
        }
        if (!this.allowed(epoch, provider)) continue;
        this.state = "loading";this.emit();
        let failed = false;
        await Promise.all(Array.from({ length: Math.min(4, work.length) }, async () => {
          while (work.length && this.allowed(epoch, provider) && !this.disabled.has(provider)) {
            const job = work.shift();
            try { await this.download(job, epoch); }
            catch { if (epoch === this.epoch) failed = true; }
          }
        }));
        if (epoch !== this.epoch) return;
        if (!failed && !this.disabled.has(provider)) {
          this.state = provider === "eox" ? "coarse" : "ready";this.emit();return;
        }
      }
      this.state = this.providers.has("eox") ? "coarse" : this.providers.size ? "ready" : "error";
      this.emit();
    } finally {
      this.busy = false;
      if (this.queued) {
        this.queued = false;
        void this.refresh();
      }
    }
  }
  async esriAttribution(signal) {
    if (!this.credits) this.credits = (async () => {
      try {
        const response = await this.fetchImpl(`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer?f=json&token=${encodeURIComponent(CONFIG.esriApiKey)}`, { signal, cache: "default" });
        if (!response.ok) return;
        const metadata = await response.json();
        if (typeof metadata.copyrightText === "string" && metadata.copyrightText) {
          PROVIDERS.esri.attribution = `Powered by Esri | ${metadata.copyrightText}`;
        }
      } catch { /* The fallback credits remain visible if metadata is unavailable. */ }
    })();
    return this.credits;
  }
  async download({ provider, tile }, epoch) {
    if (!this.allowed(epoch, provider)) return;
    const p = PROVIDERS[provider], c = new AbortController();
    this.controllers.add(c);
    const timeout = setTimeout(() => c.abort(), 15e3);
    try {
      if (provider === "esri") await this.esriAttribution(c.signal);
      if (!this.allowed(epoch, provider)) return;
      const response = await this.fetchImpl(p.url(tile.z, tile.x, tile.y), { signal: c.signal, cache: "default" });
      if (!response.ok) {
        if ([401, 403, 429].includes(response.status)) this.disabled.add(provider);
        throw Error(`HTTP ${response.status}`);
      }
      if (provider === "esri" && response.headers.get("Content-Type")?.includes("json")) {
        const error = (await response.json()).error;
        if ([401, 403, 429, 498, 499].includes(error?.code)) this.disabled.add(provider);
        throw Error("Esri imagery unavailable");
      }
      const blob = await response.blob(), image = await this.decode(blob);
      if (!this.allowed(epoch, provider)) return;
      const key = `${provider}/${p.version}/${tile.z}/${tile.x}/${tile.y}`, row = { key, blob, at: this.now(), used: this.now() };
      this.memory.set(key, { ...row, image });
      this.trim();
      if (p.persistent) await this.store.put("tiles", row);
      this.changed();
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(c);
    }
  }
  draw(context, extent, width, height) {
    if (!this.view?.enabled) return;
    const painted = [], providers = this.chain(true).reverse();
    for (const provider of providers) {
      const available = [...this.memory.entries()].filter(([key]) => key.startsWith(`${provider}/`))
        .map(([key, row]) => ({ row, coordinates: key.split("/").slice(2).map(Number) }))
        .sort((a, b) => a.coordinates[0] - b.coordinates[0]);
      for (const { row, coordinates: [z, x, y] } of available) {
        const span = 2 * WORLD / 2 ** z;
        let left = x * span - WORLD;
        left += Math.round(((extent[0] + extent[2]) / 2 - left - span / 2) / (2 * WORLD)) * 2 * WORLD;
        const top = WORLD - y * span;
        if (left + span < extent[0] || left > extent[2] || top < extent[1] || top - span > extent[3]) continue;
        context.drawImage(row.image, (left - extent[0]) / (extent[2] - extent[0]) * width,
          (extent[3] - top) / (extent[3] - extent[1]) * height,
          span / (extent[2] - extent[0]) * width, span / (extent[3] - extent[1]) * height);
        painted.push({ provider, rect: [Math.max(left,extent[0]),Math.max(top-span,extent[1]),Math.min(left+span,extent[2]),Math.min(top,extent[3])] });
      }
    }
    const visible = visibleProviders(painted);
    const changed = visible.size !== this.providers.size || [...visible].some(provider => !this.providers.has(provider));
    this.providers = visible;
    for (const provider of visible) this.used(provider, PROVIDERS[provider]);
    if (changed) this.emit();
  }

  retry() {
    this.disabled.clear();
    this.retryAt = 0;
    this.lastPresence = -Infinity;
    this.forceRefresh = true;
    this.update({ ...this.view, at: this.now() });
  }
  async clear() {
    this.cancel();
    this.memory.clear();
    await this.store.clear();
    this.changed();
    this.state = "cache";
    this.emit();
  }
  report() {
    return { state: this.state, providers: [...this.providers], persistent: this.store.failed ? false : true, memory: this.memory.size, disabled: [...this.disabled] };
  }
}
module.exports = { Satellite, PROVIDERS, mapAttribution, visibleProviders, inFrance, geographic, query, parseCount, tiles, contains };
