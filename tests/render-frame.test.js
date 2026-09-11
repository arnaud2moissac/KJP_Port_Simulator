"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRenderFrame, renderLegacyFrame } = require(
  "../src/simulateur-port/rendering/render-frame.cjs"
);

function cameraSource() {
  return {
    basis: { position: [10, 20, 3], right: [1, 0, 0], up: [0, 0, 1], forward: [0, 1, 0] },
    width: 1280, height: 800, focalScale: 1.05, near: .035, far: 6000
  };
}

test("Three natif N2 — catalogue concave, vertical, thèmes et propriétaires", async () => {
  const { createNativeInfrastructureResources } = await import("../src/simulateur-port/rendering/native-infrastructure-resources.mjs");
  const ring = [[0,0,0],[4,0,0],[4,1,0],[1,1,0],[1,4,0],[0,4,0]];
  const definition = { palette: { top: "#ffcc88", edge: "rgba(10,20,30,.42)" }, owners: [
    { id: "terre", family: "land", polygons: [{ points: ring, fill: "top", stroke: "edge", lineWidth: 1 }], lines: [] },
    { id: "face", family: "dock", polygons: [{ points: [[0,0,0],[0,4,0],[0,4,2],[0,0,2]], fill: "top", stroke: false }], lines: [] }
  ] };
  const original = structuredClone(definition);
  const resources = createNativeInfrastructureResources(definition);
  const meshes = resources.group.children.filter(o => !o.isLineSegments2);
  const areas = meshes.map(mesh => {
    const p = mesh.geometry.attributes.position, indices = mesh.geometry.index.array;
    let area = 0;
    for (let i=0; i<indices.length; i+=3) {
      const a = [p.getX(indices[i]),p.getY(indices[i]),p.getZ(indices[i])];
      const b = [p.getX(indices[i+1])-a[0],p.getY(indices[i+1])-a[1],p.getZ(indices[i+1])-a[2]];
      const c = [p.getX(indices[i+2])-a[0],p.getY(indices[i+2])-a[1],p.getZ(indices[i+2])-a[2]];
      area += Math.hypot(b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0])/2;
    }
    return area;
  });
  assert.deepEqual(areas, [7,8], "surfaces métriques concave et verticale conservées");
  assert.deepEqual(definition, original, "aucune mutation de la topologie source");
  const line = resources.group.children.find(o => o.isLineSegments2);
  assert.equal(line.material.opacity, .42);
  const geometry = meshes[0].geometry, array = geometry.attributes.position.array;
  resources.updatePalette({ top: "#abcdef", edge: "rgba(30,40,50,.62)" });
  assert.equal(meshes[0].geometry, geometry); assert.equal(geometry.attributes.position.array, array);
  assert.equal(geometry.attributes.position.version, 0);
  assert.equal(line.material.opacity, .62);
  assert.equal(meshes[0].material.color.getHexString(), "abcdef");
  const before = resources.report();
  assert.equal(before.owners.length, 2);
  assert.throws(() => createNativeInfrastructureResources({ ...definition, owners: [{ ...definition.owners[0], polygons: [{ points: [[NaN,0,0]], fill: "top" }] }] }), /Native/);
  assert.equal(resources.report().liveGeometries, before.liveGeometries, "création invalide sans fuite");
  assert.throws(() => createNativeInfrastructureResources({ ...definition, owners: [definition.owners[0],
    { ...definition.owners[1], polygons: [{ ...definition.owners[1].polygons[0], fill: "missing" }] }] }), /Native/);
  assert.equal(resources.report().liveGeometries, before.liveGeometries, "rollback après allocations partielles");
  assert.equal(resources.report().liveMaterials, before.liveMaterials);
  resources.dispose(); resources.dispose();
  assert.equal(resources.report().liveGeometries, 0);
  assert.equal(resources.report().liveMaterials, 0);
});

test("Three natif N3 — joueur local persistant et seules pales variables", async () => {
  const { createNativePlayerResources } = await import("../src/simulateur-port/rendering/native-player-resources.mjs");
  const palette = {
    hull: "#f8f7f0", outline: "#243746", halo: "rgba(255,255,255,.8)",
    anatomy: "#176b78", propeller: "#8d6500",
    "player.fender.0.fill": "#e9f0ed", "player.fender.0.outline": "#17333d"
  };
  const definition = {
    palette,
    owners: [
      { id: "hull", family: "player", polygons: [{
        points: [[-2,-1,0],[2,0,0],[-2,1,0]], fill: "hull", stroke: "outline", lineWidth: .9
      }], lines: [{ points: [[-2,-1,.1],[2,0,.1],[-2,1,.1],[-2,-1,.1]], color: "halo", width: 6.4, dash: [], layer: 5 }] },
      { id: "static", family: "player-anatomy", polygons: [{
        points: [[-1,0,-.2],[0,0,-1],[1,0,-.2]], fill: "anatomy", stroke: false
      }], lines: [] },
      { id: "blades", family: "player-propeller", polygons: [], lines: Array.from({ length: 3 }, (_, blade) => {
        const angle = blade * Math.PI * 2 / 3;
        return { points: [[-1,0,-.5],[-1,Math.cos(angle)*.3,-.5+Math.sin(angle)*.3]], color: "propeller", width: 2.2, dash: [], layer: 6 };
      }) },
      { id: "0", family: "player-fender", polygons: [{
        points: [[0,1,0],[.3,1,0],[.3,1,.7],[0,1,.7]], fill: "player.fender.0.fill",
        stroke: "player.fender.0.outline", lineWidth: 1.3
      }], lines: [{ points: [[0,.8,.7],[0,1,.7]], color: "player.fender.0.outline", width: 1.7, dash: [], layer: 7 }] }
    ],
    player: {
      propeller: { owner: "player-propeller:blades", center: [-1,0,-.5], radius: .3, blades: 3, initialAngle: 0 },
      anatomyFamilies: ["player-anatomy", "player-propeller"],
      collisionWidths: { halo: { role: "halo", regular: 6.4, skipper: 7.4 } },
      acceleratedWidths: [{ owner: "player:hull", role: "outline", regular: .9, accelerated: 1.4 }],
      fenderWidths: [{ regular: 1.7, contact: 2.8 }, { regular: 1.3, contact: 2.4 }]
    }
  };
  const resources = createNativePlayerResources(definition);
  const hull = resources.group.children.find(object => object.userData.owner === "player:hull" && object.isMesh);
  const propeller = resources.group.children.find(object => object.userData.owner === "player-propeller:blades");
  const hullPosition = hull.geometry.attributes.position;
  const propellerData = propeller.geometry.attributes.instanceStart.data;
  const update = overrides => resources.update({
    pose: { x: 12, y: -8, heading: .7 }, anatomy: false, accelerated: false,
    cameraView: "top", contactFenders: [], propellerAngle: 0, palette, ...overrides
  });
  update();
  const firstMatrix = [...resources.group.matrix.elements];
  update({ pose: { x: 14, y: -5, heading: -2.9 } });
  assert.notDeepEqual([...resources.group.matrix.elements], firstMatrix);
  assert.equal(resources.group.position.x, 14); assert.equal(resources.group.position.y, -5);
  assert.equal(resources.group.rotation.z, -2.9);
  assert.equal(hull.geometry.attributes.position, hullPosition);
  assert.equal(hullPosition.version, 0, "la pose ne touche pas aux attributs de coque");
  assert.equal(propellerData.version, 0, "l'hélice cachée ne produit aucun upload");

  update({ anatomy: true, accelerated: true, cameraView: "skipper", contactFenders: [0], propellerAngle: .4 });
  assert.equal(hull.geometry.attributes.position, hullPosition);
  assert.equal(hullPosition.version, 0);
  assert.equal(propeller.geometry.attributes.instanceStart.data, propellerData, "buffer dynamique conservé");
  assert.equal(propellerData.version, 1, "seul le buffer déclaré dynamique est invalidé");
  assert.equal(resources.group.children.find(object => object.userData.family === "player-anatomy").visible, true);
  const widths = Object.fromEntries(resources.group.children.filter(object => object.isLineSegments2)
    .map(object => [`${object.material.userData.role}:${object.material.userData.baseLinewidth}`, object.material.linewidth]));
  assert.equal(widths["halo:6.4"], 7.4);
  assert.equal(widths["outline:0.9"], 1.4);
  assert.equal(widths["player.fender.0.outline:1.7"], 2.8);
  assert.equal(widths["player.fender.0.outline:1.3"], 2.4);

  const recolored = { ...palette, hull: "#abcdef", "player.fender.0.fill": "#ff3344", "player.fender.0.outline": "#ff3344" };
  update({ anatomy: true, accelerated: true, cameraView: "skipper", contactFenders: [0], propellerAngle: .4, palette: recolored });
  assert.equal(hull.material.color.getHexString(), "abcdef");
  assert.equal(propellerData.version, 1, "une mise à jour de matériau ne touche pas la géométrie");
  assert.throws(() => update({ pose: { x: NaN, y: 0, heading: 0 } }), /joueur natif/i);
  resources.dispose(); resources.dispose();
});

test("Three natif N1 — ressources monde indépendantes, métriques et libérables", async () => {
  const { createNativeStaticResources } = await import("../src/simulateur-port/rendering/native-static-resources.mjs");
  const definition = {
    surface: { points: [[10,20,1], [14,20,1], [14,22,1], [10,22,1]], color: "#d49b53", outlineColor: "#172b40", outlineWidth: .7 },
    stroke: { points: [[10,21,2], [14,21,2]], color: "#e14671", width: 3 }
  };
  const resources = createNativeStaticResources(definition);
  const [surface, outline, stroke] = resources.group.children;
  assert.deepEqual([...surface.geometry.attributes.position.array], definition.surface.points.flat());
  assert.equal(surface.geometry.boundingBox.max.x - surface.geometry.boundingBox.min.x, 4);
  assert.equal(surface.geometry.boundingBox.max.y - surface.geometry.boundingBox.min.y, 2);
  assert.equal(stroke.material.worldUnits, false);
  assert.equal(outline.material.linewidth, .7);
  assert.equal(stroke.material.linewidth, 3);
  definition.surface.points[0][0] = 999;
  definition.stroke.points[0][0] = 999;
  assert.equal(surface.geometry.attributes.position.getX(0), 10);
  assert.equal(stroke.geometry.attributes.instanceStart.getX(0), 10);
  let disposed = 0;
  for (const object of resources.group.children) {
    object.geometry.addEventListener("dispose", () => disposed++);
    object.material.addEventListener("dispose", () => disposed++);
  }
  resources.dispose(); resources.dispose();
  assert.equal(disposed, 6, "chaque ressource est libérée une seule fois");
  assert.throws(() => createNativeStaticResources({ ...definition, surface: { ...definition.surface, points: [[NaN,0,0]] } }), /Native/);
});

test("CameraSnapshot copie les repères et refuse un frustum invalide", async () => {
  const { createCameraSnapshot } = await import("../src/simulateur-port/rendering/three-camera.mjs");
  const input = cameraSource();
  const snapshot = createCameraSnapshot(input);
  input.basis.position[0] = 99;
  assert.equal(snapshot.position[0], 10);
  assert.equal(snapshot.focal, 840);
  assert.throws(() => { snapshot.position[0] = 0; }, TypeError);
  assert.throws(() => { snapshot.width = 0; }, TypeError);
  for (const field of ["width", "height", "focalScale", "near", "far"]) {
    for (const value of [0, -1, NaN, Infinity]) {
      assert.throws(() => createCameraSnapshot({ ...cameraSource(), [field]: value }), TypeError);
    }
  }
  assert.throws(() => createCameraSnapshot({ ...cameraSource(), far: .01 }), TypeError);
  const invalid = cameraSource();
  invalid.basis.forward[2] = NaN;
  assert.throws(() => createCameraSnapshot(invalid), TypeError);
});

test("PerspectiveCamera reproduit les ancres, le seuil proche et les points hors frustum", async () => {
  const { createCameraSnapshot, createThreeCamera } = await import("../src/simulateur-port/rendering/three-camera.mjs");
  const bridge = createThreeCamera();
  assert.throws(() => bridge.project([0, 0, 0]), /update/);
  const frame = createCameraSnapshot(cameraSource());
  const camera = bridge.update(frame);
  assert.equal(camera.type, "PerspectiveCamera");
  assert.deepEqual(bridge.project([10, 30, 3]), { x: 640, y: 400, depth: 10, scale: 84 });
  for (const depth of [-1, 0, .035 - 2e-7, .035 - 5e-8, .035, .035 + 5e-8, 2, 6000, 12000]) {
    const point = [11, 20 + depth, 5];
    const actualDepth = point[1] - 20;
    const result = bridge.project(point);
    if (actualDepth < frame.near - 1e-7) {
      assert.equal(result, null);
    } else {
      const scale = frame.focal / Math.max(frame.near, actualDepth);
      assert.ok(Math.abs(result.x - (640 + scale)) < 1e-8);
      assert.ok(Math.abs(result.y - (400 - 2 * scale)) < 1e-8);
      assert.equal(result.depth, actualDepth);
      assert.equal(result.scale, scale);
    }
  }
  const resized = createCameraSnapshot({ ...cameraSource(), width: 390, height: 844, focalScale: .8 });
  assert.equal(bridge.update(resized), camera, "la caméra doit être réutilisée");
  assert.deepEqual(bridge.project([10, 30, 3]), { x: 195, y: 422, depth: 10, scale: 31.2 });
  assert.equal(camera.aspect, 390 / 844);
  assert.ok(Math.abs(camera.fov - 2 * Math.atan(844 / 624) * 180 / Math.PI) < 1e-12);
});

function source() {
  return {
    polygons: [{
      points: [{ x: 0, y: 1, depth: 2 }, { x: 3, y: 1, depth: 2 }, { x: 0, y: 4, depth: 2 }],
      fill: "#fff", stroke: null, lineWidth: 0, depth: 2, layer: 0
    }],
    lines: [{
      points: [{ x: -100, y: 2, depth: 1 }, { x: 100, y: 2, depth: 1 }],
      color: "rgba(255,255,255,.5)", width: 2, dash: [3, 2], layer: -1
    }]
  };
}

test("SurfaceFrame fige le monde et clippe avant projection Three", async () => {
  const { createCameraSnapshot } = await import("../src/simulateur-port/rendering/three-camera.mjs");
  const { createSurfaceFrame, clipSurfacePolygon, projectSurfaceFrame } = await import("../src/simulateur-port/rendering/surface-frame.mjs");
  const camera = createCameraSnapshot(cameraSource());
  const polygon = {
    points: [[9, 20.0175, 2], [11, 20.07, 2], [11, 20.07, 4], [9, 20.0175, 4]],
    fill: "#123456", stroke: null, lineWidth: 0, layer: 0
  };
  const frame = createSurfaceFrame(camera, [polygon], "#abcdef");
  polygon.points[0][0] = 100;
  assert.equal(frame.polygons[0].points[0][0], 9);
  assert.throws(() => { frame.polygons[0].points[0][0] = 99; }, TypeError);
  const clipped = clipSurfacePolygon(frame.polygons[0].points, camera);
  assert.equal(clipped.length, 4);
  assert.ok(clipped.every(point => point[1] >= 20.035 - 1e-12));
  assert.equal(projectSurfaceFrame(frame).polygons.length, 1);
  assert.deepEqual(clipSurfacePolygon([[0, 0, 0], [1, 0, 0], [1, 1, 0]], camera), []);
});

test("triangulation terrain concave et profondeur logarithmique restent explicites", async () => {
  const { triangulate, compileSurfaceBatches } = await import("../src/simulateur-port/rendering/surface-geometry.mjs");
  const points = [[20, 20], [180, 20], [180, 80], [80, 80], [80, 180], [20, 180]]
    .map(([x, y]) => ({ x, y, depth: 10 }));
  for (const ring of [points, [...points].reverse()]) {
    const mesh = triangulate(ring);
    assert.equal(mesh.complete, true);
    assert.equal(mesh.triangles.length, 4);
    const area = mesh.triangles.reduce((sum, indices) => {
      const [a, b, c] = indices.map(i => mesh.points[i]);
      return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
    }, 0);
    assert.equal(area, 15600);
  }
  const camera = { width: 200, height: 200, near: .035, far: 6000 };
  const poly = { points, fill: "opaque", stroke: null, lineWidth: 0, depth: 10, layer: 1 };
  const batch = compileSurfaceBatches({ polygons: [poly] }, camera, () => [1, 0, 0, 1]);
  assert.equal(batch.triangles, 4);
  assert.equal(batch.triangulationFailures, 0);
  const expected = Math.log(10 / .035) / Math.log(6000 / .035) * 2 - 1 - .00025;
  assert.equal(batch.opaque[2], expected);
  assert.equal(batch.opaque[3], 1, "aucune conversion de couleur CPU");
});

test("comparateur pixels refuse couleur et couverture erronées à l'intérieur", async () => {
  const { compareSurfacePixels } = await import("../src/simulateur-port/rendering/surface-comparison.mjs");
  const reference = new Uint8Array(8 * 8 * 4).fill(255);
  assert.equal(compareSurfacePixels(reference, reference, 8, 8).differentPixels, 0);
  const candidate = reference.slice();
  candidate[(4 * 8 + 4) * 4] = 254;
  assert.equal(compareSurfacePixels(reference, candidate, 8, 8).interiorDifferentPixels, 1);
  assert.equal(compareSurfacePixels(reference, new Uint8Array(reference.length), 8, 8).interiorDifferentPixels, 64);
  const thin = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y += 1) thin.fill(255, (y * 8 + 4) * 4, (y * 8 + 5) * 4);
  const missingLine = compareSurfacePixels(thin, new Uint8Array(thin.length), 8, 8);
  assert.equal(missingLine.interiorDifferentPixels, 0, "tous les pixels du trait fin sont des bordures");
  assert.equal(missingLine.equal, false, "sa disparition doit néanmoins faire échouer la comparaison");
  assert.throws(() => compareSurfacePixels(reference, candidate, 4, 4), /dimensions/);
});

test("lignes d'infrastructure : snapshot, clipping proche et bornage écran", async () => {
  const { createCameraSnapshot } = await import("../src/simulateur-port/rendering/three-camera.mjs");
  const { createSurfaceFrame, projectSurfaceFrame } = await import("../src/simulateur-port/rendering/surface-frame.mjs");
  const { compileSurfaceBatches } = await import("../src/simulateur-port/rendering/surface-geometry.mjs");
  const camera = createCameraSnapshot(cameraSource());
  const line = { points: [[9,20.0175,3],[11,20.07,3]], color: "#fff", width: .7, dash: [], layer: 0 };
  const frame = createSurfaceFrame(camera, [], "#000", [line]);
  line.points[0][0] = 123;
  assert.equal(frame.lines[0].points[0][0], 9);
  assert.throws(() => frame.lines[0].dash.push(1), TypeError);
  const dash = [1, 1];
  const dashedFrame = createSurfaceFrame(camera, [], "#000", [{ ...line, dash }]);
  dash[0] = 99;
  assert.deepEqual(dashedFrame.lines[0].dash, [1, 1]);
  assert.throws(() => { dashedFrame.lines[0].dash[0] = 3; }, TypeError);
  assert.throws(() => createSurfaceFrame(camera, [], "#000", [{ ...line, dash: [NaN] }]), /non fini/);
  const projected = projectSurfaceFrame(frame);
  assert.equal(projected.lines.length, 1);
  assert.ok(projected.lines[0].points.every(point => point.depth >= camera.near - 1e-10));
  const extreme = { polygons: [], lines: [{ ...line, points: [{ x:-1e12, y:400, depth:10 },{ x:1e12, y:400, depth:10 }] }] };
  const batch = compileSurfaceBatches(extreme, camera, () => [1,1,1,1]);
  assert.equal(batch.worldLines.length, 42);
  assert.equal(batch.acceptedLineSegments, 1);
  assert.ok(batch.worldLines.every(Number.isFinite));
  for (let i = 0; i < batch.worldLines.length; i += 7) assert.ok(Math.abs(batch.worldLines[i]) <= 1.11);
});

test("pointillés : phase polyline, motifs impairs, normalisation et garde bornée", async () => {
  const { compileSurfaceBatches } = await import("../src/simulateur-port/rendering/surface-geometry.mjs");
  const camera = { width: 1280, height: 800, near: .035, far: 6000 };
  const line = (xs, dash) => ({ points: xs.map(x => ({ x, y: 200, depth: 10 })), color: "#fff", width: 1, dash, layer: 0 });
  const compile = lines => compileSurfaceBatches({ polygons: [], lines }, camera, () => [1, 1, 1, 1]);
  const ranges = batch => Array.from({ length: batch.worldLines.length / 42 }, (_, i) => [
    Math.round((batch.worldLines[i * 42] + 1) * 640 * 1e6) / 1e6,
    Math.round((batch.worldLines[i * 42 + 7] + 1) * 640 * 1e6) / 1e6
  ]);
  assert.deepEqual(ranges(compile([line([0, 7, 20], [5, 5])])), [[0, 5], [10, 15]]);
  assert.deepEqual(ranges(compile([line([0, 7], [5, 5]), line([7, 20], [5, 5])])), [[0, 5], [7, 12], [17, 20]]);
  // Le Legacy recommence à dessiner à l'index 0 d'un motif impair : ne pas
  // doubler ce motif comme le ferait Canvas2D.setLineDash.
  assert.deepEqual(ranges(compile([line([0, 20], [3, 2, 1])])), [[0, 3], [5, 6], [6, 9], [11, 12], [12, 15], [17, 18], [18, 20]]);
  assert.deepEqual(ranges(compile([line([0, 2], [-1, 0, .1, .2])])), [[0, .5], [1, 1.5]]);
  assert.deepEqual(ranges(compile([line([0, 2], [0, -2])])), [[0, 2]]);
  const clipped = compile([line([-1e12, 1e12], [.001, .001])]);
  assert.ok(clipped.worldLines.every(Number.isFinite));
  assert.equal(clipped.dashLimitHits, 0);
  assert.ok(clipped.worldLines.length < 4096 * 42);
  const capped = compile([line(Array.from({ length: 12 }, (_, i) => i % 2 ? 1200 : 0), [.5, .5])]);
  assert.equal(capped.dashLimitHits, 1);
  assert.equal(capped.worldLines.length, 4096 * 42);
  const afterCap = compile([
    line(Array.from({ length: 12 }, (_, i) => i % 2 ? 1200 : 0), [.5, .5]),
    line([0, 3], [])
  ]);
  assert.equal(afterCap.worldLines.length, 4097 * 42, "la saturation ne supprime pas la ligne suivante");
  assert.equal(afterCap.dashLimitHits, 1);
  const rejected = compile([line([-1000, -900, 0, 10], [5, 3])]);
  const entering = compile([line([-900, 0, 10], [5, 3])]);
  assert.deepEqual(rejected.worldLines, entering.worldLines, "un segment rejeté ne consomme aucune phase");
  assert.equal(rejected.rejectedLineSegments, entering.rejectedLineSegments + 1);
  assert.equal(compile([line([0, 10], [2, 2])]).dashLimitHits, 0, "la garde repart de zéro par frame");
});

test("RenderFrame conserve valeurs et ordre sans conserver les objets producteurs", () => {
  const input = source();
  const frame = createRenderFrame(input);
  assert.deepEqual(frame.polygons, input.polygons);
  assert.deepEqual(frame.lines, input.lines);
  input.polygons[0].points[0].x = 42;
  input.lines[0].dash[0] = 99;
  input.polygons.length = 0;
  assert.equal(frame.polygons[0].points[0].x, 0);
  assert.deepEqual(frame.lines[0].dash, [3, 2]);
  assert.throws(() => { frame.polygons[0].points[0].x = 99; }, TypeError);
  assert.throws(() => frame.lines[0].dash.push(1), TypeError);
  assert.throws(() => { frame.polygons[0].fill = "#000"; }, TypeError);
  assert.throws(() => frame.polygons.pop(), TypeError);
  assert.throws(() => { frame.space = "world"; }, TypeError);
});

test("RenderFrame refuse les nombres non finis et les couleurs objet", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const input = source();
    input.polygons[0].points[0].depth = value;
    assert.throws(() => createRenderFrame(input), /non fini/);
    const dashed = source();
    dashed.lines[0].dash[0] = value;
    assert.throws(() => createRenderFrame(dashed), /non fini/);
  }
  const input = source();
  input.polygons[0].fill = { mutable: true };
  assert.throws(() => createRenderFrame(input), /fill invalide/);
});

test("la façade Legacy transmet la même frame à plusieurs consommateurs", () => {
  const frame = createRenderFrame(source());
  const calls = [];
  const renderer = { render: (...args) => calls.push(args) };
  renderLegacyFrame(renderer, frame);
  renderLegacyFrame(renderer, frame);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], frame.polygons);
  assert.equal(calls[1][1], frame.lines);
  assert.deepEqual(calls[0], calls[1]);
  const empty = createRenderFrame({ polygons: [], lines: [] });
  renderLegacyFrame(renderer, empty);
  assert.deepEqual(calls[2], [[], []]);
});
