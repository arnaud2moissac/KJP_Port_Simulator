const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Satellite, geographic, inFrance, query, parseCount, tiles } = require("../src/generateur-port/satellite.js");
const store = () => ({ rows: /* @__PURE__ */ new Map(), all: async () => [], get: async () => null, put: async () => {
}, run: async () => null });
function engine(options = {}) {
  return new Satellite({ changed() {
  }, status() {
  }, used() {
  }, endpoint: () => "", store: store(), ...options });
}
const extent = [-39e4, 604e4, -389e3, 6041e3];
const view = { extent, zoom: 17, local: false, enabled: true, mode: "ign", at: 0 };
test("France routing includes coasts and overseas, excludes Canada and Europe outside France", () => {
  for (const [lon, lat] of [[-3.446, 47.644], [5.37, 43.3], [9.45, 42.7], [-61.55, 16.24], [55.5, -21.1]]) assert.equal(inFrance(lon, lat), true);
  for (const [lon, lat] of [[-73.55, 45.5], [-123.12, 49.28], [10, 53.5], [-9.14, 38.7]]) assert.equal(inFrance(lon, lat), false);
});
test("seamark query counts without geometry, splits antimeridian and validates complete counts", () => {
  const q = query({ south: 1, west: 179, north: 2, east: 181 });
  assert.match(q, /179,2,180/);
  assert.match(q, /-180,2,-179/);
  assert.match(q, /out count/);
  assert.doesNotMatch(q, /geom/);
  assert.equal(parseCount({ elements: [{ type: "count", tags: { total: "0" } }] }), false);
  assert.equal(parseCount({ elements: [{ type: "count", tags: { total: "4" } }] }), true);
  for (const data of [{ elements: [] }, { elements: [{ type: "node" }] }, { remark: "timeout", elements: [{ type: "count", tags: { total: "0" } }] }]) assert.throws(() => parseCount(data));
});
test("tile coordinates wrap at antimeridian and EOX native zoom stays at 14", () => {
  const ts = tiles([20037e3, 0, 20039e3, 1e3], 14);
  assert.ok(ts.every((t) => t.x >= 0 && t.x < 2 ** 14));
  assert.equal(geographic([20037e3, 0, 20039e3, 1e3]).east > 180, true);
});
test("no network without consent; only free fallback can load below Esri zoom threshold", async () => {
  let calls = 0;
  const e = engine({ fetchImpl: async () => {
    calls++;
    throw Error();
  } });
  e.view = { ...view, enabled: false }; await e.refresh();assert.equal(calls,0);
  assert.equal(e.allowed(0,"esri"),false);
  e.view = { ...view, zoom:15, mode:"esri" };assert.equal(e.allowed(0,"esri"),false);assert.equal(e.allowed(0,"eox"),true);
  e.cancel();
});
test("negative presence cache contains subviews; positive proof is exact only", async () => {
  let calls = 0;
  const e = engine({ now: () => 5e4, fetchImpl: async () => {
    calls++;
    return { ok: true, json: async () => ({ elements: [{ type: "count", tags: { total: "1" } }] }) };
  } });
  e.view = view;
  const b = geographic(extent), key = JSON.stringify(b);
  e.presence.set(key, { key, bounds: b, present: false, at: 5e4 });
  assert.equal(await e.presenceCheck(0, { ...b, west: b.west + 1e-4 }), false);
  assert.equal(calls, 0);
  e.presence.get(key).present = true;
  assert.equal(await e.presenceCheck(0, { ...b, west: b.west + 1e-4 }), true);
  assert.equal(calls, 1);
  e.cancel();
});
test("unavailable detection stays unknown and respects Retry-After", async () => {
  const e = engine({ now: () => 5e4, fetchImpl: async () => ({ ok: false, headers: new Headers({ "Retry-After": "120" }) }) });
  e.seamarkPresence = async () => null;
  e.view = view;
  assert.equal(await e.presenceCheck(0, geographic(extent)), false);
  assert.equal(e.state, "unavailable");
  assert.equal(e.presence.size, 0);
  assert.equal(e.retryAt, 17e4);
  e.cancel();
});
test("obsolete detection cannot grant permission or enter cache", async () => {
  let resolve;
  const e = engine({ now: () => 5e4, fetchImpl: () => new Promise((r) => resolve = r) });
  e.view = view;
  const result = e.presenceCheck(0, geographic(extent));
  await new Promise((r) => setImmediate(r));
  e.cancel();
  resolve({ ok: true, json: async () => ({ elements: [{ type: "count", tags: { total: "1" } }] }) });
  await result;
  assert.equal(e.presence.size, 0);
  assert.equal(e.allowed(0), false);
});
test("presence cooldown and local objects bypass dedicated query", async () => {
  let calls = 0;
  const e = engine({ now: () => 5e4, fetchImpl: async () => {
    calls++;
    throw Error("offline");
  } });
  e.view = { ...view, local: true };
  await e.refresh();
  assert.equal(e.lastPresence, -Infinity);
  assert.ok(calls > 0);
  e.cancel();
});
test('expired imagery is retained offline, renewed only with permission, four workers at most', async () => {
  let calls=0,active=0,peak=0;
  const now=200*86400000;
  const e=engine({now:()=>now,fetchImpl:async()=>{
    calls++;active++;peak=Math.max(peak,active);
    await new Promise(r=>setTimeout(r,5));active--;
    return {ok:true,headers:new Headers(),blob:async()=>new Blob(['tile'])};
  }});
  e.decode=async()=>({});
  e.view={...view,local:false,zoom:15,enabled:false};
  await e.refresh();assert.equal(calls,0);
  e.view={...view,local:true};
  for(const tile of tiles(extent,17))e.memory.set(`ign/current/17/${tile.x}/${tile.y}`,{at:now-91*86400000,image:{}});
  await e.refresh();assert.ok(calls>0);assert.ok(peak<=4);
  const before=calls;await e.refresh();assert.equal(calls,before);e.cancel();
});
test('cancelling a view prevents queued image requests and fallback',async()=>{
  let calls=0;const e=engine({fetchImpl:async(url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error(),{name:'AbortError'}))));}});
  e.view={...view,local:true};const pending=e.refresh();await new Promise(r=>setImmediate(r));assert.ok(calls<=4);e.cancel();await pending;assert.ok(calls<=4);
});
test('unavailable IndexedDB degrades to memory without breaking construction or downloads',async()=>{
  let warned=false;
  const e=new Satellite({changed(){},status:report=>{warned ||= report.storageUnavailable;},used(){},endpoint:()=>'',fetchImpl:async()=>({ok:true,headers:new Headers(),blob:async()=>new Blob(['tile'])})});
  e.decode=async()=>({});e.view={...view,local:true};await e.refresh();
  assert.equal(warned,true);assert.equal(e.report().persistent,false);assert.ok(e.memory.size>0);e.cancel();
});
test('zooming out keeps previously loaded detailed images visible without fetching',()=>{
 const e=engine();e.view={...view,zoom:15};let draws=0;
 const tile=tiles(extent,17)[0];e.memory.set(`ign/current/17/${tile.x}/${tile.y}`,{image:{}});
 e.draw({drawImage(){draws++;}},extent,800,600);assert.equal(draws,1);e.cancel();
});
test('IGN and EOX load without objects, presence query or zoom restriction',async()=>{
 for(const mode of ['ign','eox']){
  const urls=[];const e=engine({fetchImpl:async url=>{urls.push(url);return {ok:true,headers:new Headers(),blob:async()=>new Blob(['tile'])};}});
  e.decode=async()=>({});e.view={...view,zoom:12,mode,local:false};
  e.presenceCheck=async()=>{throw Error('Free imagery must not query Overpass');};
  await e.refresh();assert.ok(urls.length>0);assert.ok(urls.every(url=>!url.includes('interpreter')));e.cancel();
 }
});
test('credits exclude occluded, historical and zero-area imagery but retain visible fallback',()=>{
 const {visibleProviders}=require('../src/generateur-port/satellite');
 assert.deepEqual([...visibleProviders([{provider:'eox',rect:[0,0,100,100]},{provider:'ign',rect:[0,0,50,100]},{provider:'ign',rect:[50,0,100,100]}])],['ign']);
 assert.deepEqual([...visibleProviders([{provider:'eox',rect:[0,0,100,100]},{provider:'ign',rect:[0,0,50,100]}])],['ign','eox']);
 assert.deepEqual([...visibleProviders([{provider:'eox',rect:[0,0,0,100]}])],[]);
});
test('forced IGN excludes fallback imagery and keeps compact credits',()=>{
 const {mapAttribution}=require('../src/generateur-port/satellite');const e=engine();
 e.view={...view,mode:'ign'};assert.deepEqual(e.chain(),['ign']);
 assert.equal(mapAttribution('ign'),'© IGN · BD ORTHO');
 for(const provider of ['esri','eox'])assert.match(mapAttribution(provider),/<details class="satellite-credit"><summary>/);
 e.cancel();
});
