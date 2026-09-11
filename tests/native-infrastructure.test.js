"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), url = pathToFileURL(path.join(root, "simulateur-port.html"));
const KJPCodec = require(path.join(root, "src", "ports", "kjp-codec.js"));
url.searchParams.set("test", "1");
url.searchParams.set("renderer", "legacy");
const portText = fs.readFileSync(path.join(root, "examples/la-trinite-sur-mer.kjp"), "utf8");
const seamarkPort = KJPCodec.createEmpty({ id: "native-seamarks", name: "Balisage natif" });
const seamarkKinds = [
  ["buoy_lateral", "port"], ["buoy_lateral", "starboard"],
  ...["north", "east", "south", "west"].map(category => ["buoy_cardinal", category]),
  ["buoy_isolated_danger", ""], ["buoy_safe_water", ""],
  ["buoy_special_purpose", ""], ["buoy_installation", ""]
];
seamarkPort.structures.buoys = seamarkKinds.map(([seamarkType, category], index) => ({
  id: `native-buoy-${index}`, seamarkType, category,
  position: { east: (index % 5 - 2) * 5, north: 12 + Math.floor(index / 5) * 8 },
  radius: .8, height: 2.2, collision: false,
  ...KJPCodec.recommendedBuoyAppearance(seamarkType, category)
}));
seamarkPort.navigation.entries.push({ id: "entry-native", position: { east: 0, north: 0 }, heading: Math.PI / 2 });
const seamarkText = KJPCodec.serialize(seamarkPort);
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

async function pageFor(browser, dpr = 1) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const errors = [], warnings = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") {
      // Avertissements présents aussi sans prototype : autoplay audio et
      // synchronisation GPU imposée par les captures. Les conserver au bilan.
      if (/^The AudioContext was not allowed to start\./.test(m.text()) ||
        /^\[\.WebGL-.*GPU stall due to ReadPixels/.test(m.text())) warnings.push(m.text());
      else errors.push(m.text());
    }
  });
  page.on("request", r => { if (/^https?:/.test(r.url())) errors.push(r.url()); });
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    let pending = [], time = 1000;
    window.requestAnimationFrame = callback => { pending.push(callback); return pending.length; };
    const live = new Set();
    const uploads = { calls: 0, bytes: 0, created: 0, deleted: 0 };
    const proto = WebGL2RenderingContext.prototype;
    for (const name of ["bufferData", "bufferSubData", "createBuffer", "deleteBuffer"]) {
      const original = proto[name];
      proto[name] = function (...args) {
        const result = original.apply(this, args);
        if (this.canvas.id === "kjp-native-static-prototype") {
          if (name === "createBuffer") { live.add(result); uploads.created++; }
          else if (name === "deleteBuffer") { if (live.delete(args[0])) uploads.deleted++; }
          else {
            const data = args[name === "bufferData" ? 1 : 2], offset = args[3] || 0, length = args[4];
            uploads.calls++;
            uploads.bytes += typeof data === "number" ? data : length ? length * data.BYTES_PER_ELEMENT : data.byteLength - offset * (data.BYTES_PER_ELEMENT || 1);
          }
        }
        return result;
      };
    }
    window.__n2Step = () => new Promise((resolve, reject) => raf(() => {
      try {
        const callbacks = pending; pending = []; time += 1000/60;
        callbacks.forEach(callback => callback(time));
        const api = window.__PORTANCE_TEST__;
        resolve({ snapshot: api.snapshot(), report: api.nativeStaticPrototypeReport(),
          uploads: { ...uploads, live: live.size }, queued: pending.length,
          world: document.querySelector("#worldScene").toDataURL(), overlay: document.querySelector("#scene").toDataURL() });
      } catch (error) { reject(error); }
    }));
  });
  await page.goto(url.href);
  return { page, errors, warnings };
}
const step = page => page.evaluate(() => window.__n2Step());
function persistence(first, next) {
  assert.equal(next.report.glError, 0);
  assert.deepEqual(next.report.resources, first.report.resources);
  assert.equal(next.report.catalog.builds, first.report.catalog.builds);
  assert.deepEqual(next.uploads, first.uploads, "aucun transfert/allocation/libération lors des mouvements ou du thème");
  assert.equal(next.queued, 1);
}

test("Three natif N2.3 — catalogue, transferts réels, thèmes et cycles de port", async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  let reference;
  for (const enabled of [false, true]) {
    const { page, errors, warnings } = await pageFor(browser);
    assert.equal((await step(page)).report.active, false);
    await page.evaluate(enabled => {
      const api = window.__PORTANCE_TEST__;
      api.reset({ x: 25, y: -38, heading: -Math.PI/2, u: 1 }); api.selectCameraView("skipper");
      if (enabled) api.enableNativeInfrastructurePrototype();
    }, enabled);
    const first = await step(page);
    if (enabled) {
      assert.ok(first.uploads.bytes > 0); assert.equal(first.report.memory.geometries, first.report.catalog.geometryCount);
      assert.equal(first.report.catalog.liveGeometries, first.report.catalog.geometryCount);
      const expected = await page.evaluate(() => window.__PORTANCE_TEST__.nativeInfrastructureSourceReport());
      assert.deepEqual(first.report.catalog.owners.map(o => [o.family,o.id,o.polygons,o.segments]),
        expected.map(o => [o.family,o.id,o.polygons,o.segments]));
      assert.deepEqual([...new Set(expected.map(o => o.family))].sort(), ["boat", "catway", "dock", "lights", "terrain"]);
    }
    await page.evaluate(() => document.querySelector("#pauseButton").click());
    const frames = [];
    for (let i=0; i<20; i++) {
      const frame = await step(page);
      frames.push({ snapshot: frame.snapshot, presentation: frame.report.presentation, world: hash(frame.world), overlay: hash(frame.overlay) });
      if (enabled) persistence(first, frame);
    }
    if (!enabled) reference = frames;
    else {
      assert.deepEqual(frames, reference, "simulation, commandes, interpolation, caméra, picking et rendu actif exacts");
      assert.notDeepEqual(frames[0].presentation.basis, frames.at(-1).presentation.basis);
      await page.evaluate(() => document.querySelector("#pauseButton").click());
      for (const view of ["top", "anatomy", "skipper"]) {
        await page.evaluate(view => window.__PORTANCE_TEST__.selectCameraView(view), view);
        const beforeGesture = await step(page); persistence(first, beforeGesture);
        const box = await page.locator("#scene").boundingBox();
        await page.mouse.move(box.x+box.width*.75,box.y+box.height*.4);
        await page.mouse.down({ button: "right" }); await page.mouse.move(box.x+box.width*.75+100,box.y+box.height*.4+50); await page.mouse.up({ button: "right" });
        const moved = await step(page); persistence(first, moved);
        const panField=view==="skipper"?"skipperPan":"pan";
        assert.notDeepEqual(moved.report.presentation.cameraSettings[panField],beforeGesture.report.presentation.cameraSettings[panField]);
        await page.mouse.move(box.x+box.width*.8,box.y+box.height*.3);
        await page.mouse.down();await page.mouse.move(box.x+box.width*.8+25,box.y+box.height*.3+15);await page.mouse.up();
        const rotated=await step(page);persistence(first,rotated);
        const yawField=view==="skipper"?"skipperYawOffset":"yaw";
        assert.notEqual(rotated.report.presentation.cameraSettings[yawField],moved.report.presentation.cameraSettings[yawField]);
        await page.mouse.wheel(0,-90);
        const zoomField=view==="skipper"?"skipperFocalScale":"distance";
        await page.waitForFunction(({field,previous})=>window.__PORTANCE_TEST__.nativeStaticPrototypeReport().presentation.cameraSettings[field]!==previous,
          {field:zoomField,previous:rotated.report.presentation.cameraSettings[zoomField]},{polling:10});
        persistence(first,await step(page));
        await page.evaluate(() => window.__PORTANCE_TEST__.selectVisualTheme("chart"));
        const chart = await step(page); persistence(first, chart);
        assert.notDeepEqual(chart.report.materials, first.report.materials);
        await page.evaluate(() => window.__PORTANCE_TEST__.selectVisualTheme("dark"));
        const dark = await step(page); persistence(first, dark);
        assert.deepEqual(dark.report.materials, first.report.materials);
      }
      await page.setViewportSize({ width: 800, height: 600 }); persistence(first, await step(page));
      let previous = await step(page);
      const memoryByPort = {};
      const ports = ["imported", "built-in", "seamarks", "imported", "built-in", "seamarks"];
      for (const port of ports) {
        await page.evaluate(({ port, portText, seamarkText }) => {
          const api = window.__PORTANCE_TEST__;
          if (port === "imported") api.importPort(portText);
          else if (port === "seamarks") api.importPort(seamarkText);
          else api.restoreBuiltInPort();
        }, { port, portText, seamarkText });
        const next = await step(page), a = previous.report.catalog, b = next.report.catalog;
        assert.equal(next.report.glError, 0);
        assert.equal(b.builds, a.builds+1);
        assert.equal(b.disposedGeometries-a.disposedGeometries, a.geometryCount);
        assert.equal(b.disposedMaterials-a.disposedMaterials, a.materialCount);
        assert.equal(b.liveGeometries, b.geometryCount); assert.equal(b.liveMaterials, b.materialCount);
        assert.equal(next.report.memory.geometries, b.geometryCount);
        assert.ok(next.report.resources.every(r => !previous.report.resources.some(old => old.geometry===r.geometry)));
        const families = [...new Set(b.owners.map(o => o.family))].sort();
        const expectedFamilies = port === "imported"
          ? ["boat","buoy","catway","dock","land","obstacle"]
          : port === "seamarks" ? ["buoy"] : ["boat","catway","dock","lights","terrain"];
        assert.deepEqual(families, expectedFamilies);
        const source = await page.evaluate(() => window.__PORTANCE_TEST__.nativeInfrastructureSourceReport());
        assert.deepEqual(b.owners.map(o => [o.family,o.id,o.polygons,o.segments]),source.map(o => [o.family,o.id,o.polygons,o.segments]),
          "chaque propriétaire, surface et trait source est représenté, indépendamment de sa triangulation");
        const memory = { geometries: b.geometryCount, materials: b.materialCount, buffers: next.uploads.live };
        if (memoryByPort[port]) assert.deepEqual(memory, memoryByPort[port]);
        memoryByPort[port] = memory;
        persistence(next, await step(page)); previous = next;
      }
      const beforeInvalid = await step(page);
      await page.evaluate(() => { try { window.__PORTANCE_TEST__.importPort("{invalid"); } catch {} });
      persistence(beforeInvalid, await step(page));
      await page.evaluate(() => {
        window.__PORTANCE_TEST__.restoreBuiltInPort();
        window.__PORTANCE_TEST__.enableNativeInfrastructurePrototype({ staticBoats: false });
      });
      const withoutBoats = await step(page);
      assert.equal(withoutBoats.report.catalog.owners.some(owner => owner.family === "boat"), false);
      assert.equal(withoutBoats.report.catalog.owners.some(owner => owner.family === "lights"), true);
      persistence(withoutBoats, await step(page));
      await page.evaluate(() => window.__PORTANCE_TEST__.enableNativeInfrastructurePrototype());
      const complete = await step(page);
      assert.equal(complete.report.catalog.owners.some(owner => owner.family === "boat"), true);
      assert.equal(complete.report.catalog.owners.some(owner => owner.family === "lights"), true);
      persistence(complete, await step(page));
      await page.evaluate(() => {
        window.__PORTANCE_TEST__.enableNativeInfrastructurePrototype({ seamarks: false });
      });
      const withoutSeamarks = await step(page);
      assert.equal(withoutSeamarks.report.catalog.owners.some(owner => ["buoy","lights"].includes(owner.family)), false);
      assert.equal(withoutSeamarks.report.catalog.owners.some(owner => owner.family === "boat"), true);
      persistence(withoutSeamarks, await step(page));
      await page.evaluate(() => window.__PORTANCE_TEST__.enableNativeInfrastructurePrototype());
      const withSeamarks = await step(page);
      assert.equal(withSeamarks.report.catalog.owners.some(owner => owner.family === "lights"), true);
      persistence(withSeamarks, await step(page));
      await page.evaluate(() => { window.__PORTANCE_TEST__.disposeNativeStaticPrototype(); window.__PORTANCE_TEST__.disposeNativeStaticPrototype(); });
      const end = await step(page); assert.equal(end.report.active, false); assert.equal(end.uploads.live, 0);
      t.diagnostic(`Mémoire stable après deux cycles des trois ports : ${JSON.stringify(memoryByPort)}`);
    }
    assert.deepEqual(errors, []); t.diagnostic(`${enabled ? "natif" : "référence"}: ${warnings.length} avertissements autoplay/readPixels connus`); await page.close();
  }
  let importReference;
  for (const inject of [false,true]) {
    const { page, errors } = await pageFor(browser); await step(page);
    await page.evaluate(({ inject, portText }) => {
      const api=window.__PORTANCE_TEST__;
      if (inject) { api.enableNativeInfrastructurePrototype(); api.failNextNativeInfrastructureBuild(); }
      api.importPort(portText);
    }, { inject, portText });
    const frame=await step(page);
    const state={snapshot:frame.snapshot,presentation:frame.report.presentation,world:hash(frame.world),overlay:hash(frame.overlay)};
    if (!inject) importReference=state;
    else {
      assert.deepEqual(state,importReference,"une panne native n'interrompt ni l'import, ni le moteur, ni Legacy");
      assert.equal(frame.report.active,false);assert.match(frame.report.nativeInfrastructureError,/injecté/);
      assert.equal(frame.uploads.live,0);
      await page.evaluate(()=>window.__PORTANCE_TEST__.enableNativeInfrastructurePrototype());
      const retry=await step(page);assert.equal(retry.report.glError,0);assert.equal(retry.report.nativeInfrastructureError,undefined);
      await page.evaluate(()=>window.__PORTANCE_TEST__.disposeNativeStaticPrototype());
    }
    assert.deepEqual(errors,[]);await page.close();
  }
});

test("Three natif N2.3 — fidélité du monde statique aux cadrages et thèmes", async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kjp-native-n2-"));
  let cases = 0;
  for (const dpr of [1,2]) {
    const { page, errors } = await pageFor(browser, dpr);
    await page.evaluate(() => {
      window.__PORTANCE_TEST__.enableNativeInfrastructurePrototype();
      window.__PORTANCE_TEST__.enableSurfaceComparison({ staticSeamarks: true });
    });
    for (const port of ["built-in", "imported", "seamarks"]) {
      await page.evaluate(({ port, portText, seamarkText }) => {
        const api = window.__PORTANCE_TEST__;
        if (port === "built-in") api.restoreBuiltInPort();
        else api.importPort(port === "imported" ? portText : seamarkText);
        api.reset(port === "built-in" ? { x: 25, y: -38, heading: -Math.PI/2 }
          : port === "imported" ? { x: 200, y: 305, heading: .5084 }
            : { x: 0, y: 0, heading: Math.PI/2 });
      }, { port, portText, seamarkText });
      for (const theme of ["dark", "chart"]) for (const view of ["top", "anatomy", "skipper"]) {
        await page.evaluate(({ theme, view }) => { const api=window.__PORTANCE_TEST__; api.selectVisualTheme(theme); api.selectCameraView(view); }, { theme, view });
        await step(page);
        const result = await page.evaluate(async () => {
          const api = window.__PORTANCE_TEST__, before = JSON.stringify(api.snapshot());
          const native = api.nativeStaticPrototypeReport({ images: true });
          const legacy = api.surfaceComparisonReport({ images: true });
          async function coverage(url) {
            const image = new Image(); image.src=url; await image.decode();
            const c=document.createElement("canvas"); c.width=64;c.height=48;
            const ctx=c.getContext("2d"); ctx.drawImage(image,0,0,64,48);
            const data=ctx.getImageData(0,0,64,48).data;
            return Array.from({length:64*48},(_,i)=>data[i*4+3]>64);
          }
          return { native: native.image, legacy: legacy.images.legacy, glError:native.glError,
            sameState: before===JSON.stringify(api.snapshot()), a:await coverage(native.image), b:await coverage(legacy.images.legacy) };
        });
        assert.equal(result.glError,0); assert.equal(result.sameState,true);
        const expected = result.b.filter(Boolean).length, actual = result.a.filter(Boolean).length;
        const common = result.b.filter((occupied,i)=>occupied&&result.a[i]).length;
        assert.ok(expected>10 && actual>10, `${port}/${theme}/${view}: scène non vide`);
        // Occupation grossière de la silhouette, pas une identité des pixels.
        assert.ok(common/expected >= .95, `${port}/${theme}/${view}: couverture ${common}/${expected}`);
        assert.ok(actual <= expected*1.35+30, `${port}/${theme}/${view}: débordement ${actual}/${expected}`);
        if (dpr===1) for (const key of ["native","legacy"]) fs.writeFileSync(path.join(directory,`${port}-${theme}-${view}-${key}.png`),Buffer.from(result[key].split(",")[1],"base64"));
        cases++;
      }
    }
    await page.evaluate(() => { window.__PORTANCE_TEST__.disposeNativeStaticPrototype(); window.__PORTANCE_TEST__.disposeSurfaceComparison(); });
    assert.deepEqual(errors,[]); await page.close();
  }
  t.diagnostic(`${cases} cadrages natifs ; captures ${directory}`);
});

test("Three natif N2.3 — couleurs, contours et omissions par famille", async t => {
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"kjp-native-n2-details-"));
  t.diagnostic(`Détails : ${directory}`);
  const { page, errors } = await pageFor(browser);
  await page.evaluate(() => {
    window.__PORTANCE_TEST__.enableNativeInfrastructurePrototype();
    window.__PORTANCE_TEST__.enableSurfaceComparison({ staticSeamarks: true });
  });
  const check = result => {
    assert.equal(result.glError, 0);
    assert.ok(result.expected > 4 && result.actual > 4, "famille et style présents");
    assert.ok(result.recall >= .9, `silhouette famille/style : ${result.recall}`);
    assert.ok(result.colorError < 25, `couleurs/contraste famille/style : ${result.colorError}`);
  };
  let cases = 0;
  for (const port of ["built-in", "imported", "seamarks"]) {
    await page.evaluate(({ port, portText, seamarkText }) => {
      const api=window.__PORTANCE_TEST__;
      if (port === "built-in") api.restoreBuiltInPort();
      else api.importPort(port === "imported" ? portText : seamarkText);
    }, { port, portText, seamarkText });
    const families = port === "built-in"
      ? ["terrain","dock","catway","boat","lights"]
      : port === "imported" ? ["land","obstacle","boat","buoy"] : ["buoy"];
    for (const family of families) for (const theme of ["dark","chart"]) {
      await page.evaluate(({ family, theme }) => {
        const api=window.__PORTANCE_TEST__, data=api.nativeInfrastructureSourceReport({ geometry:true });
        const owner=data.owners.find(o=>o.family===family);
        const p=owner.polygons[0]?.points[0] || owner.lines[0].points[0];
        api.reset({x:p[0],y:p[1],heading:0}); api.selectCameraView("top"); api.selectVisualTheme(theme);
        api.isolateNativeInfrastructure();
      }, { family, theme });
      const warmed = await step(page);
      for (const kind of family === "lights" ? ["line"] : ["fill","line"]) {
        await page.evaluate(({ family, kind }) => window.__PORTANCE_TEST__.isolateNativeInfrastructure({family,kind}), {family,kind});
        persistence(warmed, await step(page));
        // Les points monde servent d'oracle métrique pour une silhouette
        // tolérante ; aucun tableau projeté natif n'est exigé ou comparé.
        const expected = await page.evaluate(({ family, kind }) => {
          const api=window.__PORTANCE_TEST__, data=api.nativeInfrastructureSourceReport({geometry:true});
          const owners=data.owners.filter(o=>o.family===family), polygons=[], lines=[];
          for (const owner of owners) {
            for (const p of owner.polygons) {
              if (kind==="fill") polygons.push({...p,fill:data.palette[p.fill],stroke:null});
              else if (p.stroke!==false && p.stroke!=null) lines.push({points:[...p.points,p.points[0]],color:data.palette[p.stroke],width:p.lineWidth,layer:p.layer,dash:[]});
            }
            if (kind==="line") lines.push(...owner.lines.map(l=>({...l,color:data.palette[l.color]})));
          }
          return api.surfaceComparisonReport({polygons,lines,images:true}).images.legacy;
        }, {family,kind});
        const measure = () => page.evaluate(async ({ expected, kind }) => {
          const report=window.__PORTANCE_TEST__.nativeStaticPrototypeReport({images:true});
          async function decode(url) {
            const image=new Image();image.src=url;await image.decode();
            const c=document.createElement("canvas");c.width=256;c.height=192;
            const ctx=c.getContext("2d");ctx.drawImage(image,0,0,256,192);
            return ctx.getImageData(0,0,256,192).data;
          }
          const a=await decode(report.image), b=await decode(expected), threshold=kind==="line"?2:64;
          let actual=0, count=0, matched=0, wa=0,wb=0;const ca=[0,0,0],cb=[0,0,0];
          for(let i=0;i<256*192;i++) {
            if(a[4*i+3]>threshold) actual++;
            if(b[4*i+3]>threshold) {
              count++;
              const x=i%256,y=Math.floor(i/256);
              let found=false;
              for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) if(x+dx>=0&&x+dx<256&&y+dy>=0&&y+dy<192&&a[4*((y+dy)*256+x+dx)+3]>threshold)found=true;
              if(found)matched++;
            }
            wa+=a[4*i+3];wb+=b[4*i+3];
            for(let c=0;c<3;c++){ca[c]+=a[4*i+c]*a[4*i+3];cb[c]+=b[4*i+c]*b[4*i+3];}
          }
          return {actual,expected:count,recall:matched/count,colorError:Math.max(...ca.map((v,i)=>Math.abs(v/wa-cb[i]/wb))),glError:report.glError};
        }, {expected,kind});
        const result=await measure();
        const native=await page.evaluate(()=>window.__PORTANCE_TEST__.nativeStaticPrototypeReport({images:true}).image);
        for(const [name,value] of Object.entries({native,legacy:expected}))fs.writeFileSync(path.join(directory,`${family}-${theme}-${kind}-${name}.png`),Buffer.from(value.split(",")[1],"base64"));
        t.diagnostic(`${family}/${theme}/${kind}: ${JSON.stringify(result)}`);
        check(result); cases++;
        await page.evaluate(() => window.__PORTANCE_TEST__.isolateNativeInfrastructure({family:"omission-forcée"}));
        await step(page);
        const omitted=await measure();assert.throws(()=>check(omitted),assert.AssertionError,"omission réelle famille/style détectée");
      }
    }
  }
  await page.evaluate(()=>window.__PORTANCE_TEST__.disposeNativeStaticPrototype());
  assert.deepEqual(errors,[]);t.diagnostic(`${cases} contrôles de famille/style et omissions forcées`);
});
