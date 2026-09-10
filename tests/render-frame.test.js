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
