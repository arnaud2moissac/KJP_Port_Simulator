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
