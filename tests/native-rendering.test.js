"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("ressources natives — géométries métriques, palettes et libération", async () => {
  const { createNativeInfrastructureResources } = await import("../src/simulateur-port/rendering/native-infrastructure-resources.mjs");
  const ring = [[0,0,0],[4,0,0],[4,1,0],[1,1,0],[1,4,0],[0,4,0]];
  const definition = { palette: { top: "#ffcc88", edge: "rgba(10,20,30,.42)" }, owners: [
    { id: "land:a", family: "land", polygons: [{ points: ring, fill: "top", stroke: "edge", lineWidth: 1 }], lines: [] },
    { id: "dock:a", family: "dock", polygons: [{ points: [[0,0,0],[0,4,0],[0,4,2],[0,0,2]], fill: "top", stroke: false }], lines: [] }
  ] };
  const original = structuredClone(definition);
  const resources = createNativeInfrastructureResources(definition);
  const meshes = resources.group.children.filter(object => !object.isLineSegments2);
  assert.deepEqual(definition, original);
  assert.equal(resources.report().owners.length, 2);
  const geometry = meshes[0].geometry;
  const positions = geometry.attributes.position.array;
  resources.updatePalette({ top: "#abcdef", edge: "rgba(30,40,50,.62)" });
  assert.equal(meshes[0].geometry, geometry);
  assert.equal(geometry.attributes.position.array, positions);
  assert.equal(geometry.attributes.position.version, 0);
  assert.equal(meshes[0].material.color.getHexString(), "abcdef");
  resources.updatePalette({ top: "#8899aa", edge: "#8899aa" }, { wireframe: true });
  assert.ok(meshes.every(mesh => mesh.material.wireframe));
  assert.equal(meshes[0].geometry, geometry);
  assert.equal(geometry.attributes.position.array, positions);
  assert.equal(geometry.attributes.position.version, 0);
  assert.ok(resources.report().wireframeMaterials > 0);
  resources.updatePalette({ top: "#abcdef", edge: "rgba(30,40,50,.62)" }, { wireframe: false });
  assert.ok(meshes.every(mesh => !mesh.material.wireframe));
  const before = resources.report();
  assert.throws(() => createNativeInfrastructureResources({
    ...definition,
    owners: [{ ...definition.owners[0], polygons: [{ points: [[NaN,0,0]], fill: "top" }] }]
  }), /Native/);
  assert.equal(resources.report().liveGeometries, before.liveGeometries);
  resources.dispose();
  resources.dispose();
  assert.equal(resources.report().liveGeometries, 0);
  assert.equal(resources.report().liveMaterials, 0);
});

test("ressources natives — joueur local persistant et bascule wireframe sans géométrie", async () => {
  const { createNativePlayerResources } = await import("../src/simulateur-port/rendering/native-player-resources.mjs");
  const palette = { hull: "#ffffff", outline: "#111111" };
  const definition = {
    palette,
    owners: [
      { id: "hull", family: "player", polygons: [{ points: [[-2,-1,0],[2,0,0],[-2,1,0]], fill: "hull", stroke: "outline", lineWidth: 1 }], lines: [] }
    ],
    player: {
      collisionWidths: {},
      acceleratedWidths: [],
      fenderWidths: []
    }
  };
  const resources = createNativePlayerResources(definition);
  const hull = resources.group.children.find(object => object.userData.owner === "player:hull");
  const position = hull.geometry.attributes.position;
  const update = overrides => resources.update({
    pose: { x: 12, y: -8, heading: .7 }, accelerated: false, wireframe: false,
    cameraView: "top", contactFenders: [], palette, ...overrides
  });
  update();
  update({ pose: { x: 14, y: -5, heading: -2.9 } });
  assert.equal(hull.geometry.attributes.position, position);
  assert.equal(position.version, 0);
  assert.equal(resources.group.position.x, 14);
  assert.equal(resources.group.position.y, -5);
  assert.equal(resources.group.rotation.z, -2.9);
  update({ wireframe: true, palette: { hull: "#445566", outline: "#445566" } });
  assert.equal(hull.material.wireframe, true);
  assert.equal(hull.geometry.attributes.position, position);
  assert.equal(position.version, 0);
  assert.equal(resources.group.position.x, 12);
  assert.equal(resources.group.position.y, -8);
  assert.equal(resources.group.rotation.z, .7);
  assert.equal(resources.report().wireframe, true);
  resources.dispose();
  resources.dispose();
});

test("caméra Three — snapshot défensif et projection stable", async () => {
  const { createCameraSnapshot, createThreeCamera } = await import("../src/simulateur-port/rendering/three-camera.mjs");
  const source = {
    basis: { position: [10,20,3], right: [1,0,0], up: [0,0,1], forward: [0,1,0] },
    width: 1280, height: 800, focalScale: 1.05, near: .035, far: 6000
  };
  const snapshot = createCameraSnapshot(source);
  source.basis.position[0] = 99;
  assert.equal(snapshot.position[0], 10);
  assert.throws(() => { snapshot.position[0] = 0; }, TypeError);
  assert.throws(() => createCameraSnapshot({ ...source, width: 0 }), TypeError);
  const bridge = createThreeCamera();
  const camera = bridge.update(snapshot);
  assert.equal(camera.type, "PerspectiveCamera");
  assert.deepEqual(bridge.project([10,30,3]), { x: 640, y: 400, depth: 10, scale: 84 });
  const resized = createCameraSnapshot({ ...source, basis: {
    position: [10,20,3], right: [1,0,0], up: [0,0,1], forward: [0,1,0]
  }, width: 390, height: 844, focalScale: .8 });
  assert.equal(bridge.update(resized), camera);
  assert.deepEqual(bridge.project([10,30,3]), { x: 195, y: 422, depth: 10, scale: 31.2 });
});
