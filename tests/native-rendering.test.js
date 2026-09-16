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

test("ressources natives — joueur local persistant et vue Comprendre sans géométrie reconstruite", async () => {
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
      fenderWidths: [],
      understanding: {
        propellerPosition: [-3.45, 0, -.55],
        propellerRadius: .34,
        propellerColor: "#cc9900",
        forceOutlineColor: "#112233",
        pivotWaterColor: "#dd8800",
        pivotGroundColor: "#0088aa"
      }
    }
  };
  const resources = createNativePlayerResources(definition);
  const hull = resources.group.children.find(object => object.userData.owner === "player:hull");
  const position = hull.geometry.attributes.position;
  const update = overrides => resources.update({
    pose: { x: 12, y: -8, heading: .7 }, accelerated: false,
    cameraView: "top", contactFenders: [], palette,
    understand: {
      enabled: false,
      forces: [],
      pivots: {},
      palette: { propeller: "#cc9900", forceOutline: "#112233", pivotWater: "#dd8800", pivotGround: "#0088aa" }
    },
    ...overrides
  });
  update();
  update({ pose: { x: 14, y: -5, heading: -2.9 } });
  assert.equal(hull.geometry.attributes.position, position);
  assert.equal(position.version, 0);
  assert.equal(resources.group.position.x, 14);
  assert.equal(resources.group.position.y, -5);
  assert.equal(resources.group.rotation.z, -2.9);
  const understandingGeometry = resources.report().understanding.geometries;
  update({
    palette: { hull: "#445566", outline: "#445566" },
    understand: {
      enabled: true,
      forces: [{ id: "wind:fore", origin: [1, .2, .75], vector: [2, 0, 0], color: "#00ffff" }],
      pivots: { water: { visible: true, position: [.4, 0, .78] } },
      palette: { propeller: "#cc9900", forceOutline: "#112233", pivotWater: "#dd8800", pivotGround: "#0088aa" }
    }
  });
  assert.equal(hull.material.wireframe, false);
  assert.equal(hull.geometry.attributes.position, position);
  assert.equal(position.version, 0);
  assert.equal(resources.group.position.x, 12);
  assert.equal(resources.group.position.y, -8);
  assert.equal(resources.group.rotation.z, .7);
  assert.equal(resources.report().radiograph, true);
  assert.equal(resources.report().understanding.forceCount, 1);
  assert.equal(resources.report().understanding.capacity, 64);
  assert.equal(resources.report().understanding.pivots.water, true);
  assert.deepEqual(resources.report().understanding.geometries, understandingGeometry);
  update();
  assert.equal(resources.report().radiograph, false);
  assert.equal(resources.report().understanding.forceCount, 0);
  resources.dispose();
  resources.dispose();
});

test("vue Comprendre native — flèches épaisses persistantes et capacité explicite", async () => {
  const { Matrix4, Quaternion, Vector3 } = await import("three");
  const { createNativeUnderstandingResources } = await import(
    "../src/simulateur-port/rendering/native-understanding-resources.mjs"
  );
  const resources = createNativeUnderstandingResources({
    propellerPosition: [-3.45, 0, -.55], propellerRadius: .34,
    propellerColor: "#cc9900", forceOutlineColor: "#112233",
    pivotWaterColor: "#dd8800", pivotGroundColor: "#0088aa"
  });
  const palette = { propeller: "#cc9900", forceOutline: "#112233", pivotWater: "#dd8800", pivotGround: "#0088aa" };
  const activePresentation = {
    enabled: true,
    forces: [
      { id: "fore", origin: [2, 0, .75], vector: [1.25, .5, 0], color: "#00ffff" },
      { id: "aft", origin: [-2, 0, .75], vector: [-.4, 1, 0], color: "#ff8800" }
    ],
    pivots: {
      water: { visible: true, position: [1, 0, .78] },
      ground: { visible: true, position: [-1, 0, .72] }
    },
    palette
  };
  resources.update(activePresentation);
  const first = resources.report();
  assert.equal(first.forceCount, 2);
  assert.equal(first.capacity, 64);
  assert.deepEqual(first.forceIds, ["fore", "aft"]);
  assert.equal(first.depth.forcesTest, false);
  assert.equal(first.depth.forcesWrite, false);
  assert.deepEqual(first.outline, { color: "#112233", depthTest: false });
  assert.equal(first.propeller.visible, true);
  assert.deepEqual(first.propeller.position, [-3.45, 0, -.55]);
  const outlinedShafts = resources.group.getObjectByName("player-understanding:force-shaft-outlines");
  assert.equal(outlinedShafts.count, 2);
  assert.equal(outlinedShafts.geometry.uuid, resources.group.getObjectByName("player-understanding:force-shafts").geometry.uuid);
  const matrix = new Matrix4();
  const position = new Vector3();
  const orientation = new Quaternion();
  const scale = new Vector3();
  const direction = new Vector3(0, 1, 0);
  const shafts = resources.group.getObjectByName("player-understanding:force-shafts");
  const heads = resources.group.getObjectByName("player-understanding:force-heads");
  const markers = resources.group.getObjectByName("player-understanding:force-markers");
  shafts.getMatrixAt(0, matrix);
  matrix.decompose(position, orientation, scale);
  direction.applyQuaternion(orientation).normalize();
  const reconstructedOrigin = position.clone().addScaledVector(direction, -scale.y / 2);
  heads.getMatrixAt(0, matrix);
  const headPosition = new Vector3();
  const headScale = new Vector3();
  matrix.decompose(headPosition, new Quaternion(), headScale);
  const reconstructedEnd = headPosition.clone().addScaledVector(direction, headScale.y / 2);
  markers.getMatrixAt(0, matrix);
  const markerPosition = new Vector3().setFromMatrixPosition(matrix);
  assert.ok(reconstructedOrigin.distanceTo(new Vector3(2, 0, .75)) < 1e-6);
  assert.ok(markerPosition.distanceTo(new Vector3(2, 0, .75)) < 1e-6);
  assert.ok(reconstructedEnd.distanceTo(new Vector3(3.25, .5, .75)) < 1e-6,
    "la tige et la pointe conservent exactement l'extrémité du vecteur fourni");
  resources.update(activePresentation);
  assert.deepEqual(resources.report().instanceVersions, first.instanceVersions,
    "une présentation inchangée ne retransfère pas les matrices des forces");
  resources.update({ enabled: false, forces: [], pivots: {}, palette });
  const hidden = resources.report();
  assert.equal(hidden.enabled, false);
  assert.equal(hidden.forceCount, 0);
  assert.deepEqual(hidden.geometries, first.geometries);
  assert.throws(() => resources.update({
    enabled: true,
    forces: Array.from({ length: 65 }, (_, index) => ({
      id: String(index), origin: [0, 0, .75], vector: [1, 0, 0], color: "#ffffff"
    })),
    pivots: {}, palette
  }), /capacité 64/);
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
