"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const Physics = require("../src/simulateur-port/physics-core.js");
const Runner = require("../scripts/qualify-vessel-profiles.js");
const phaseOne = require("../docs/physics/four-vessel-results/summary.json");

const root = path.resolve(__dirname, "..");
const waterZ = .02;
const assets = [
  { id: "sun-odyssey-24-2-fixed-keel-experimental", model: "sun-odyssey-24-2", file: "kjp_sun_odyssey_24_2.glb", hullLength: 7.20, hullX: [-3.55, 3.65] },
  { id: "contessa-26-long-keel-experimental", model: "contessa-26", file: "kjp_contessa_26.glb", hullLength: 7.77, hullX: [-3.75, 4.02] },
  { id: "pogo-40-s4-twin-rudder-experimental", model: "pogo-40-s4", file: "kjp_pogo_40_s4.glb", hullLength: 12.19, hullX: [-6, 6.19] },
  { id: "oceanis-48-fixed-keel-experimental", model: "oceanis-48", file: "kjp_oceanis_48.glb", hullLength: 14.27, hullX: [-7.05, 7.22] }
];
const hullParts = new Set(["upper_sheer", "sheer_stripe", "hull_sides", "hull_underwater", "transom"]);
const roles = new Set(["hull", "silhouette", "organ", "roof", "hidden"]);
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const close = (actual, expected, tolerance, label) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} ≠ ${expected} (tolérance ${tolerance})`
);

function phaseOnePhysicalProfile(profile) {
  const comparable = structuredClone(profile);
  comparable.version = profile.id === "sun-odyssey-36i-pedagogical"
    ? "6.0.1"
    : "1.0.0";
  comparable.schemaVersion = 4;
  delete comparable.steering;
  delete comparable.provenance.values.steering;
  const historicalRate = {
    "sun-odyssey-24-2-fixed-keel-experimental": 52,
    "contessa-26-long-keel-experimental": 48,
    "pogo-40-s4-twin-rudder-experimental": 50
  }[profile.id];
  if (historicalRate !== undefined) {
    for (const rudder of comparable.rudders) rudder.rate = historicalRate * Physics.DEG;
  }
  return comparable;
}

function readContainer(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, file + ": signature GLB");
  assert.equal(bytes.readUInt32LE(4), 2, file + ": version GLB");
  assert.equal(bytes.readUInt32LE(8), bytes.length, file + ": longueur GLB");
  let offset = 12, json = null, binary = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0, "alignement des chunks");
    assert.ok(offset + 8 + length <= bytes.length, "chunk contenu dans le fichier");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) { assert.equal(json, null); json = JSON.parse(data.toString("utf8")); }
    else if (type === 0x004e4942) { assert.equal(binary, null); binary = data; }
    else assert.fail("chunk GLB inconnu");
    offset += 8 + length;
  }
  assert.equal(offset, bytes.length);
  assert.ok(json && binary);
  return { bytes, json, binary };
}

let loadedModels;
async function loadModels() {
  if (!loadedModels) loadedModels = (async () => {
    const three = await import("three");
    assert.equal(three.REVISION, "186");
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    return Promise.all(assets.map(async asset => {
      const container = readContainer(asset.file);
      const gltf = await new GLTFLoader().parseAsync(
        container.bytes.buffer.slice(container.bytes.byteOffset, container.bytes.byteOffset + container.bytes.byteLength), ""
      );
      const meshes = [];
      gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
      assert.equal(meshes.length, 1, asset.file + ": un seul maillage");
      const mesh = meshes[0], geometry = mesh.geometry;
      gltf.scene.updateMatrixWorld(true);
      // Le catalogue natif réutilise la géométrie source ; il ne récupère pas
      // une transformation cachée sur un nœud de la scène glTF.
      const identity = new three.Matrix4();
      mesh.matrixWorld.elements.forEach((value, index) => close(value, identity.elements[index], 1e-10, "nœud GLB sans transform caché"));
      // Le calage appartient à la présentation. Les coordonnées physiques sont
      // x avant, y tribord, z haut ; Three reçoit [x, -y, z + 0,02].
      const display = new three.Matrix4().makeRotationFromEuler(new three.Euler(Math.PI / 2, Math.PI / 2, 0));
      display.setPosition(0, 0, waterZ);
      display.multiply(mesh.matrixWorld);
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const color = geometry.getAttribute("color");
      assert.ok(position && normal && color && geometry.index, asset.file + ": attributs requis");
      const vertices = Array.from({ length: position.count }, (_, index) => (
        new three.Vector3().fromBufferAttribute(position, index).applyMatrix4(display)
      ));
      const spans = mesh.userData.sourceIndexSpans;
      assert.ok(Array.isArray(spans) && spans.length > 5, asset.file + ": plages explicites");
      let start = 0;
      const parts = spans.map(([name, triangles, role]) => {
        assert.equal(typeof name, "string");
        assert.ok(Number.isInteger(triangles) && triangles > 0);
        assert.ok(roles.has(role), name + ": rôle radiographique");
        const count = triangles * 3;
        const points = Array.from({ length: count }, (_, index) => vertices[geometry.index.getX(start + index)]);
        const part = { name, triangles, role, start, count, points, bounds: new three.Box3().setFromPoints(points) };
        start += count;
        return part;
      });
      assert.equal(start, geometry.index.count, "les plages couvrent exactement les indices");
      assert.equal(new Set(parts.map(part => part.name)).size, parts.length);
      const find = name => {
        const part = parts.find(item => item.name === name);
        assert.ok(part, asset.file + ": partie " + name);
        return part;
      };
      const pointsFor = predicate => parts.filter(predicate).flatMap(part => part.points);
      const boxFor = predicate => new three.Box3().setFromPoints(pointsFor(predicate));
      return { ...asset, ...container, gltf, mesh, geometry, vertices, parts, find, pointsFor, boxFor, position, normal, color, three };
    }));
  })();
  return loadedModels;
}

function projectedSurface(part) {
  let doubleArea = 0, momentX = 0, momentY = 0, momentZ = 0;
  for (let index = 0; index < part.points.length; index += 3) {
    const [a, b, c] = part.points.slice(index, index + 3);
    const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    doubleArea += area;
    momentX += area * (a.x + b.x + c.x) / 3;
    momentY += area * (a.y + b.y + c.y) / 3;
    momentZ += area * (a.z + b.z + c.z) / 3;
  }
  assert.ok(doubleArea > 0, part.name + ": projection non vide");
  // Les deux faces d'un appendice fermé couvrent deux fois son aire projetée.
  return { area: doubleArea / 2, x: momentX / doubleArea, y: momentY / doubleArea, z: momentZ / doubleArea - waterZ };
}

function waterlinePoints(points) {
  const result = [];
  for (let index = 0; index < points.length; index += 3) {
    const triangle = points.slice(index, index + 3);
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      if (Math.abs(a.z - waterZ) < 1e-7) result.push(a);
      if ((a.z - waterZ) * (b.z - waterZ) < 0) {
        const amount = (waterZ - a.z) / (b.z - a.z);
        result.push(a.clone().lerp(b, amount));
      }
    }
  }
  return result;
}

test("quatre GLB — moteur, six profils validés et ressources historiques immuables", () => {
  assert.equal(Physics.VERSION, phaseOne.physicsVersion);
  assert.equal(sha256(fs.readFileSync(path.join(root, "src/simulateur-port/physics-core.js"))),
    "06032b6c3075061bd37a154d02720b3332728ce4ee65fcb19204733fc7f94251");
  for (const id of phaseOne.profiles) {
    const accepted = [...new Set(phaseOne.rows.filter(row => row.profileId === id).map(row => row.profileSha256))];
    assert.equal(accepted.length, 1);
    assert.equal(Runner.fingerprint(phaseOnePhysicalProfile(Physics.COMPILED_PROFILES[id])), accepted[0], id);
  }
  const originalAssets = {
    "kjp_sun_odyssey_36i.glb": "b16e5d0c656e71a25ef12d4e6e278c7f9b358f35ddd75eeebb620fdffaba4dc9",
    "kjp_dufour_310_gl_2014_dimfix.glb": "e4db9395319edaa673f03ca94a7e552ccd65e9bacf24bba10704db540061e4d7",
    "kjp_dufour_310_gl_2014_dimfix_rudders.glb": "12b51b6eedc5f3a7503a4b07918e8a33ac46b37077b6e2fc302d232d1dcf229c"
  };
  for (const [file, hash] of Object.entries(originalAssets)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash, file);
});

test("quatre GLB — structure réelle, indices, normales, RGBA et absence de dépendance externe", async t => {
  for (const model of await loadModels()) {
    const { json, geometry, position, normal, color } = model;
    assert.equal(json.meshes.length, 1);
    assert.equal(json.meshes[0].primitives.length, 1);
    assert.equal(json.meshes[0].primitives[0].mode ?? 4, 4);
    assert.equal(json.materials.length, 1);
    assert.equal(json.buffers.length, 1);
    assert.equal(json.buffers[0].uri, undefined);
    for (const name of ["images", "textures", "samplers", "skins", "animations"]) assert.equal(json[name]?.length || 0, 0, model.file + ": " + name);
    assert.equal(model.gltf.animations.length, 0);
    assert.equal(Array.isArray(model.mesh.material), false);
    assert.equal(model.mesh.userData.profileId, model.id);
    assert.equal(model.mesh.userData.profileVersion, Physics.COMPILED_PROFILES[model.id].version);
    assert.equal(model.mesh.userData.profileSha256, Runner.fingerprint(Physics.COMPILED_PROFILES[model.id]));
    assert.equal(model.mesh.userData.rawProfileSha256, Runner.fingerprint(Physics.RAW_PROFILES[model.id]));
    assert.equal(model.mesh.userData.noPhysicsData, true);
    assert.equal(model.mesh.userData.ruddersStatic, true);
    const excluded = model.mesh.userData.excludedFunctionalEquipment.map(name => name.replaceAll("-", "_"));
    for (const equipment of ["cleats", "fenders", "mooring_lines", "propeller"]) assert.ok(excluded.includes(equipment));
    assert.equal(position.itemSize, 3); assert.equal(normal.itemSize, 3); assert.equal(color.itemSize, 4);
    assert.equal(normal.count, position.count); assert.equal(color.count, position.count);
    const triangles = geometry.index.count / 3;
    assert.ok(Number.isInteger(triangles) && triangles >= 1500 && triangles <= 3000, model.file + ": budget triangles");
    const referenced = new Set();
    const a = new model.three.Vector3(), b = a.clone(), c = a.clone(), face = a.clone(), authored = a.clone();
    for (let index = 0; index < position.count; index++) {
      const values = [position.getX(index), position.getY(index), position.getZ(index), normal.getX(index), normal.getY(index), normal.getZ(index)];
      assert.ok(values.every(Number.isFinite), model.file + ": attribut fini " + index);
      close(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index)), 1, 1e-4, "normale unitaire");
      for (const channel of [color.getX(index), color.getY(index), color.getZ(index), color.getW(index)]) assert.ok(Number.isFinite(channel) && channel >= 0 && channel <= 1);
    }
    for (let index = 0; index < geometry.index.count; index += 3) {
      const indices = [0, 1, 2].map(offset => geometry.index.getX(index + offset));
      for (const vertex of indices) { assert.ok(Number.isInteger(vertex) && vertex >= 0 && vertex < position.count); referenced.add(vertex); }
      assert.equal(new Set(indices).size, 3, "indices distincts");
      a.fromBufferAttribute(position, indices[0]); b.fromBufferAttribute(position, indices[1]); c.fromBufferAttribute(position, indices[2]);
      face.crossVectors(b.sub(a), c.sub(a));
      assert.ok(face.length() > 1e-10, model.file + ": triangle dégénéré " + index / 3);
      for (const vertex of indices) {
        authored.fromBufferAttribute(normal, vertex);
        assert.ok(face.dot(authored) > 0, model.file + ": normale opposée " + index / 3);
      }
    }
    assert.equal(referenced.size, position.count, "aucun sommet orphelin");
    assert.deepEqual(Object.fromEntries(model.parts.map(part => [part.name, part.triangles])), model.mesh.userData.triangleCountsBySourcePart);
    assert.ok(model.parts.some(part => part.role === "organ"));
    assert.ok(model.parts.some(part => part.role === "roof"));
    assert.ok(model.parts.some(part => part.role === "silhouette"));
    assert.equal(model.find("hull_underwater").role, "hidden");
    t.diagnostic(`${model.file}: ${triangles} triangles, ${position.count} sommets, un matériau, aucune texture`);
  }
});

test("quatre GLB — longueur de coque, LOA documentaire, largeur, flottaison et tirant d'eau après calage", async t => {
  for (const model of await loadModels()) {
    const profile = Physics.COMPILED_PROFILES[model.id];
    const hull = model.boxFor(part => hullParts.has(part.name));
    assert.equal(hull.isEmpty(), false);
    close(hull.max.x - hull.min.x, model.hullLength, .01, model.file + ": longueur de coque");
    close(hull.min.x, model.hullX[0], .01, model.file + ": origine arrière de coque");
    close(hull.max.x, model.hullX[1], .01, model.file + ": origine avant de coque");
    close(hull.max.y - hull.min.y, profile.dimensions.beam, .01, model.file + ": largeur");
    close(waterZ - hull.min.z, profile.dimensions.canoeDraft, .01, model.file + ": profondeur de carène nue");
    const overall = model.boxFor(part => hullParts.has(part.name) || part.name === "overall_fittings");
    close(overall.max.x - overall.min.x, profile.dimensions.lengthOverall, .01, model.file + ": LOA coque/équipements");
    const water = new model.three.Box3().setFromPoints(waterlinePoints(model.pointsFor(part => hullParts.has(part.name))));
    assert.equal(water.isEmpty(), false, "intersection géométrique avec la flottaison");
    close(water.max.x - water.min.x, profile.dimensions.waterline, .01, model.file + ": LWL");
    const full = model.boxFor(() => true);
    close(waterZ - full.min.z, profile.dimensions.draft, .01, model.file + ": tirant d'eau");
    for (const part of model.parts.filter(part => part.role === "organ")) assert.ok(part.bounds.max.z < waterZ, part.name + ": organe immergé");
    t.diagnostic(`${model.file}: coque ${(hull.max.x - hull.min.x).toFixed(3)} m, LOA ${(overall.max.x - overall.min.x).toFixed(3)} m, enveloppe complète ${(full.max.x - full.min.x).toFixed(3)} m, LWL ${(water.max.x - water.min.x).toFixed(3)} m`);
  }
});

test("quatre GLB — centres, surfaces et envergures des vrais appendices et safrans", async t => {
  for (const model of await loadModels()) {
    const profile = Physics.COMPILED_PROFILES[model.id];
    const keel = model.find("keel_fin"), measuredKeel = projectedSurface(keel);
    const area = profile.appendages.reduce((sum, item) => sum + item.area, 0);
    const centre = axis => profile.appendages.reduce((sum, item) => sum + item.area * item[axis], 0) / area;
    close(measuredKeel.area, area, area * .02, model.file + ": aire de quille équivalente");
    close(measuredKeel.x, centre("x"), .02, model.file + ": centre longitudinal de quille");
    close(measuredKeel.y, -centre("y"), .02, model.file + ": centre transversal de quille");
    close(measuredKeel.z, centre("z"), .02, model.file + ": centre vertical de quille");
    close(keel.bounds.max.z - keel.bounds.min.z, profile.appendages[0].span, .01, model.file + ": envergure de quille");
    const rudders = model.parts.filter(part => part.name === "rudder" || part.name.startsWith("rudder_"));
    assert.equal(rudders.length, profile.rudders.length, model.file + ": nombre réel de gouvernes");
    for (const rudder of profile.rudders) {
      const part = profile.rudders.length === 1 ? rudders[0] : model.find(rudder.y < 0 ? "rudder_port" : "rudder_starboard");
      const measured = projectedSurface(part);
      close(measured.area, rudder.area, rudder.area * .02, model.file + ": aire " + rudder.id);
      close(measured.x, rudder.x, .02, model.file + ": x " + rudder.id);
      close(measured.y, -rudder.y, .02, model.file + ": y " + rudder.id);
      close(measured.z, rudder.z, .02, model.file + ": z " + rudder.id);
      close(part.bounds.max.z - part.bounds.min.z, rudder.span, .01, model.file + ": envergure " + rudder.id);
      assert.equal(part.role, "organ");
      if (profile.rudders.length > 1) assert.ok(Math.abs(measured.y) > 1, "les deux gouvernes sont réellement excentrées");
    }
    if (profile.rudders.length === 2) {
      const port = model.find("rudder_port"), starboard = model.find("rudder_starboard");
      for (const axis of ["x", "z"]) {
        close(port.bounds.min[axis], starboard.bounds.min[axis], 1e-5, "gouvernes symétriques min " + axis);
        close(port.bounds.max[axis], starboard.bounds.max[axis], 1e-5, "gouvernes symétriques max " + axis);
      }
      close(port.bounds.min.y, -starboard.bounds.max.y, 1e-5, "gouvernes symétriques bâbord");
      close(port.bounds.max.y, -starboard.bounds.min.y, 1e-5, "gouvernes symétriques tribord");
      assert.equal(port.points.length, starboard.points.length);
      for (const point of port.points) assert.ok(starboard.points.some(other => (
        Math.hypot(other.x - point.x, other.y + point.y, other.z - point.z) <= 1e-5
      )), "symétrie du contour réel des deux gouvernes");
    }
    t.diagnostic(`${model.file}: quille ${measuredKeel.area.toFixed(4)} m² à x=${measuredKeel.x.toFixed(3)}, z=${measuredKeel.z.toFixed(3)} ; ${rudders.length} safran(s)`);
  }
});

test("architectures visuelles — barres franches, deux roues Oceanis et gouvernes distinctes", async () => {
  for (const model of await loadModels()) {
    const wheels = model.parts.filter(part => part.name.startsWith("wheel_"));
    if (model.id.startsWith("oceanis-48")) {
      assert.equal(wheels.length, 2, "deux postes de barre visibles");
      const port = model.find("wheel_port"), starboard = model.find("wheel_starboard");
      for (const part of wheels) {
        assert.ok(part.bounds.min.z > waterZ, "roue au-dessus de la flottaison");
        assert.ok(part.bounds.max.z - part.bounds.min.z > .4, "jante réellement modélisée");
      }
      close(port.bounds.min.y, -starboard.bounds.max.y, 1e-5, "roues symétriques");
      close(port.bounds.max.y, -starboard.bounds.min.y, 1e-5, "roues symétriques");
      assert.equal(model.parts.filter(part => part.name === "rudder" || part.name.startsWith("rudder_")).length, 1,
        "les deux roues commandent une seule gouverne physique");
    } else {
      assert.equal(wheels.length, 0);
      const tiller = model.find("tiller");
      assert.ok(tiller.bounds.min.z > waterZ, "barre franche au-dessus de la flottaison");
      assert.ok(tiller.bounds.max.x - tiller.bounds.min.x > .3, "barre franche réellement modélisée");
    }
  }
});

test("Contessa — contour continu de quille conservé, sans sept petits ailerons", async () => {
  const model = (await loadModels()).find(item => item.id.startsWith("contessa-26"));
  const points = model.find("keel_fin").points;
  const contour = [[-3.15, -.40], [-3.15, -1.00], [-2.25, -1.21], [-.65, -1.21], [.60, -.95], [1.65, -.65], [2.20, -.40]];
  for (const [x, z] of contour) {
    assert.ok(points.some(point => Math.hypot(point.x - x, point.z - waterZ - z) <= .01), `sommet du contour ${x}, ${z}`);
  }
  // Une coupe à chaque limite entre les sept bandes doit rester remplie de
  // -0,40 m au fond du contour, sans intervalle entre des ailerons distincts.
  for (let band = 1; band < 7; band++) {
    const x = -3.15 + band * (2.20 + 3.15) / 7;
    const intervals = [];
    for (let index = 0; index < points.length; index += 3) {
      const triangle = points.slice(index, index + 3), crossings = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = triangle[edge], b = triangle[(edge + 1) % 3];
        if (Math.abs(a.x - x) < 1e-7) crossings.push(a.z - waterZ);
        if ((a.x - x) * (b.x - x) < 0) crossings.push(a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x) - waterZ);
      }
      if (crossings.length >= 2) intervals.push([Math.min(...crossings), Math.max(...crossings)]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    assert.ok(intervals.length);
    let covered = intervals[0][1];
    for (const [low, high] of intervals.slice(1)) { assert.ok(low <= covered + 1e-6, "quille sans trou à x=" + x); covered = Math.max(covered, high); }
    close(covered, -.40, .01, "haut continu de quille");
  }
});

test("quatre GLB — catalogue natif, empreinte binaire et plages radiographiques réellement chargées", async () => {
  const esbuild = require("esbuild");
  const built = await esbuild.build({
    entryPoints: [path.join(root, "src/simulateur-port/rendering/native-player-model.mjs")],
    bundle: true, platform: "node", format: "cjs", write: false, loader: { ".glb": "binary" }, logLevel: "silent"
  });
  const catalogue = new Module(path.join(root, "tests/.vessel-model-catalogue.cjs"), module);
  catalogue.filename = catalogue.id;
  catalogue.paths = Module._nodeModulePaths(root);
  catalogue._compile(built.outputFiles[0].text, catalogue.filename);
  for (const model of await loadModels()) {
    const loaded = await catalogue.exports.preloadNativePlayerModel(model.model);
    const report = loaded.metadata.sourceGroups;
    if (["sun-odyssey-24-2", "pogo-40-s4", "contessa-26", "oceanis-48"].includes(model.model)) {
      // Les fichiers utilisateur remplacent ces quatre rendus. Les anciens
      // GLB procéduraux restent des sorties historiques du générateur.
      const contessa = model.model === "contessa-26";
      const oceanis = model.model === "oceanis-48";
      const so242 = model.model === "sun-odyssey-24-2";
      const supplied = readContainer(so242 ? "KJP_SunOdyssey242.glb" : oceanis ? "KJP_Oceanis48_lazybag.glb" : contessa ? "KJP_Contessa26_rouge_lazybag.glb" : "KJP_Class40_lazybag.glb");
      assert.equal(sha256(supplied.bytes), so242
        ? "b1681d04f1993598cddd4b26873659c2c7fcd39a1232fb3ab2322e234bde96d3"
        : oceanis
        ? "7a2f571a5b4e04cd075273b6a37121bedba2186876e05cfaf4b33c616aace1b8"
        : contessa
        ? "9f4623baf122cb6c4d5b14e48b4c5ea3e06bfa9507d6e2ee35cf97e54673d864"
        : "af14b22e4768cd814bd0685c0d5f26affe4390b6e04d88ebe6eccb4cdefcbba6");
      assert.equal(supplied.json.meshes.length, 1);
      assert.equal(supplied.json.meshes[0].primitives.length, 1);
      assert.equal(supplied.json.materials.length, 1);
      assert.equal(supplied.json.buffers[0].uri, undefined);
      assert.equal(supplied.json.images?.length || 0, 0);
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const original = await new GLTFLoader().parseAsync(supplied.bytes.buffer.slice(
        supplied.bytes.byteOffset, supplied.bytes.byteOffset + supplied.bytes.byteLength), "");
      const originalMesh = original.scene.getObjectByProperty("isMesh", true);
      for (const attribute of ["position", "normal", "color"]) {
        assert.deepEqual(loaded.geometry.getAttribute(attribute).array, originalMesh.geometry.getAttribute(attribute).array,
          "attributs du GLB actif conservés : " + attribute);
      }
      assert.deepEqual(loaded.geometry.index.array, originalMesh.geometry.index.array);
      assert.equal(loaded.geometry.getAttribute("color").normalized, true);
      assert.equal(loaded.geometry.getAttribute("color").itemSize, 4);
      if (so242) {
        assert.equal(report.assetFingerprint, 0xb0507705);
        assert.equal(report.totalTriangles, 3438);
        close(loaded.metadata.measuredHull.size[2], 7.20, 1e-5, "coque 24.2 hors safran et davier");
        close(loaded.metadata.measuredHull.size[0], 2.49, 1e-5, "largeur visuelle 24.2 fournie");
        assert.deepEqual(report.parts.filter(part => part.role === "organ").map(part => [part.name, part.start, part.count]),
          [["fixed_fin_keel", 4128, 132], ["keel_bulb", 4260, 240], ["rudder", 4500, 180]]);
        const rudder = report.parts.find(part => part.name === "rudder");
        close(rudder.bounds.min[0] + rudder.bounds.max[0], 0, 1e-7, "safran central unique");
        assert.equal(report.parts.find(part => part.name === "tiller_and_rudder_fittings").triangles, 108);
        assert.equal(report.parts.find(part => part.name === "propeller_and_shaft").role, "hidden");
        const cover = report.parts.find(part => part.name === "mainsail_cover");
        assert.deepEqual([cover.start, cover.count, cover.role], [5376, 240, "hidden"], "plage de la housse corrigée version 2");
        assert.equal(await catalogue.exports.preloadNativePlayerModel(model.model), loaded, "cache du fichier 24.2 partagé");
        continue;
      }
      if (oceanis) {
        assert.equal(report.assetFingerprint, 0x32f9fcee);
        assert.equal(report.totalTriangles, 4559);
        close(loaded.metadata.measuredHull.size[2], 14.27, 1e-5, "coque Oceanis hors davier et décor");
        close(loaded.metadata.measuredHull.size[0], 4.74, 1e-5, "largeur visuelle Oceanis fournie");
        assert.deepEqual(report.parts.filter(part => part.role === "organ").map(part => [part.name, part.start, part.count]),
          [["deep_fin_keel", 5271, 132], ["keel_bulb", 5403, 300], ["rudder", 5703, 180]]);
        const rudder = report.parts.find(part => part.name === "rudder");
        close(rudder.bounds.min[0] + rudder.bounds.max[0], 0, 1e-7, "safran central unique");
        const wheels = report.parts.find(part => part.name === "steering_wheels");
        const position = loaded.geometry.getAttribute("position"), index = loaded.geometry.index;
        const wheelTriangles = { port: 0, starboard: 0 };
        for (let i = wheels.start; i < wheels.start + wheels.count; i += 3) {
          const xs = [0, 1, 2].map(j => position.getX(index.getX(i + j)));
          assert.ok(xs.every(x => x < 0) || xs.every(x => x > 0), "roues séparées de part et d'autre du cockpit");
          wheelTriangles[xs[0] < 0 ? "port" : "starboard"]++;
        }
        assert.deepEqual(wheelTriangles, { port: 216, starboard: 216 });
        assert.equal(report.parts.find(part => part.name === "saildrive_and_propeller").role, "hidden");
        assert.equal(await catalogue.exports.preloadNativePlayerModel(model.model), loaded, "cache du fichier Oceanis partagé");
        continue;
      }
      if (contessa) {
        const painted = readContainer("KJP_Contessa26_rouge.glb");
        assert.equal(sha256(painted.bytes), "71f0d23085ea812699692b878ceee5cea6a0a89543c1cde3b336a76e32775877");
        const blueSource = readContainer("KJP_Contessa26.glb");
        assert.equal(sha256(blueSource.bytes), "597c70f1cc57290f26649c96c4f80fb1845dd0306296d382b8c2c2fbcbd430a5");
        assert.equal(blueSource.bytes.length, painted.bytes.length);
        const prim = blueSource.json.meshes[0].primitives[0];
        const rgba = blueSource.json.accessors[prim.attributes.COLOR_0];
        const view = blueSource.json.bufferViews[rgba.bufferView];
        const colorStart = 28 + blueSource.bytes.readUInt32LE(12) + (view.byteOffset || 0) + (rgba.byteOffset || 0);
        let changedChannels = 0;
        for (let offset = 0; offset < painted.bytes.length; offset++) {
          if (painted.bytes[offset] === blueSource.bytes[offset]) continue;
          const local = offset - colorStart;
          assert.ok(local >= 0 && local < rgba.count * 4 && local % 4 < 3,
            "seuls les octets RGB changent, jamais géométrie, alpha ou métadonnées");
          changedChannels++;
        }
        assert.equal(changedChannels, 901 * 3);
        const checked = spawnSync(process.execPath, ["scripts/recolor-contessa-glb.mjs", "--check"], { cwd: root, encoding: "utf8" });
        assert.equal(checked.status, 0, checked.stdout + checked.stderr);
        assert.equal(report.assetFingerprint, 0xf3b5c439);
        assert.equal(report.totalTriangles, 3265);
        close(loaded.metadata.measuredHull.size[2], 7.77, 1e-5, "coque Contessa hors safran et balcons");
        close(loaded.metadata.measuredHull.size[0], 2.29, 1e-5, "largeur visuelle Contessa fournie");
        assert.deepEqual(report.parts.filter(part => part.name === "rudder").map(part => [part.role, part.start, part.count]),
          [["organ", 4611, 612]]);
        const keelParts = report.parts.filter(part => part.name.startsWith("keel_integral_"));
        assert.ok(keelParts.length > 0, "quille intégrale visible en radiographie");
        assert.ok(keelParts.every(part => part.role === "organ" && part.bounds.max[1] <= 0));
        assert.equal(keelParts.reduce((sum, part) => sum + part.triangles, 0), 192);
        assert.equal(report.parts.find(part => part.name === "propeller").role, "hidden");
        assert.equal(report.parts.find(part => part.name === "tiller_and_fittings").role, "hidden");
        assert.equal(await catalogue.exports.preloadNativePlayerModel(model.model), loaded, "cache du fichier Contessa partagé");
        continue;
      }
      assert.equal(report.assetFingerprint, 0x1b27fe7b);
      assert.equal(report.totalTriangles, 2618);
      close(loaded.metadata.measuredHull.size[2], 12.19, 1e-5, "longueur coque Class40, hors bout-dehors");
      close(loaded.metadata.measuredHull.size[0], 4.5, 1e-5, "largeur visuelle fournie, sans changement physique");
      assert.deepEqual(report.parts.filter(part => part.role === "organ").map(part => [part.name, part.start, part.count]),
        [["keel", 1842, 396], ["rudder_starboard", 2238, 144], ["rudder_port", 2634, 144]]);
      assert.equal(report.parts.find(part => part.name === "propeller").role, "hidden");
      assert.equal(report.parts.find(part => part.name === "stock_tiller_port").role, "hidden");
      assert.equal(report.parts.find(part => part.name === "stock_tiller_starboard").role, "hidden");
      assert.equal(await catalogue.exports.preloadNativePlayerModel(model.model), loaded, "cache du fichier utilisateur partagé");
      continue;
    }
    let hash = 2166136261;
    for (const byte of model.bytes) hash = Math.imul(hash ^ byte, 16777619);
    assert.equal(report.assetFingerprint, hash >>> 0, model.file + ": FNV des octets chargés");
    assert.deepEqual(report.parts.map(part => [part.name, part.triangles, part.role, part.start, part.count]),
      model.parts.map(part => [part.name, part.triangles, part.role, part.start, part.count]));
    assert.equal(report.totalTriangles, model.geometry.index.count / 3);
    assert.equal(await catalogue.exports.preloadNativePlayerModel(model.model), loaded, "cache du modèle partagé");
  }
});

test("quatre GLB — génération reproductible et vérification sans écriture", () => {
  const outputs = [...assets.map(asset => asset.file), "docs/four-vessel-glb-geometry.json"];
  const snapshot = () => outputs.map(file => {
    const absolute = path.join(root, file), stat = fs.statSync(absolute);
    return { file, sha256: sha256(fs.readFileSync(absolute)), size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  });
  const before = snapshot();
  const result = spawnSync(process.execPath, ["scripts/build-vessel-models.mjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, (result.stdout || "") + (result.stderr || ""));
  assert.deepEqual(snapshot(), before, "--check ne réécrit ni GLB ni rapport");
});

test("lazybags fournis — retouche isolée, pente et contacts mesurés, reproduction sans écriture", t => {
  const cases = [
    { source: "KJP_Contessa26_rouge.glb", output: "KJP_Contessa26_rouge_lazybag.glb",
      sha: "71f0d23085ea812699692b878ceee5cea6a0a89543c1cde3b336a76e32775877",
      bag: [1981, 56], mast: [1925, 28], boom: [1953, 28] },
    { source: "KJP_Class40.glb", output: "KJP_Class40_lazybag.glb",
      sha: "091385c899dd2ed0c679d4b9e5b027f903e5b9dc9880e3f7a51cf6683c838e84",
      bag: [1162, 60], mast: [1098, 32], boom: [1130, 32] },
    { source: "KJP_Oceanis48.glb", output: "KJP_Oceanis48_lazybag.glb",
      sha: "2d3b423ebeedaf57f4d47f192ba8f141612d1ff3ab2dd311f34619876b983618",
      bag: [2677, 56], mast: [2621, 28], boom: [2649, 28] }
  ];
  function decoded(file) {
    const container = readContainer(file), primitive = container.json.meshes[0].primitives[0];
    const binaryOffset = container.binary.byteOffset - container.bytes.byteOffset;
    const attribute = (id, type, componentType, size) => {
      const accessor = container.json.accessors[id], view = container.json.bufferViews[accessor.bufferView];
      assert.equal(accessor.type, type); assert.equal(accessor.componentType, componentType);
      const width = componentType === 5123 ? 2 : 4;
      const offset = binaryOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
      const stride = view.byteStride || size * width;
      return { offset, stride, count: accessor.count,
        values: Array.from({ length: accessor.count }, (_, vertex) => Array.from({ length: size }, (_, axis) => {
          const at = offset + vertex * stride + axis * width;
          return componentType === 5123 ? container.bytes.readUInt16LE(at) : container.bytes.readFloatLE(at);
        })) };
    };
    const position = attribute(primitive.attributes.POSITION, "VEC3", 5126, 3);
    const normal = attribute(primitive.attributes.NORMAL, "VEC3", 5126, 3);
    const indices = attribute(primitive.indices, "SCALAR", 5123, 1).values.flat();
    return { ...container, position, normal, indices };
  }
  const difference = (a, b) => a.map((value, axis) => value - b[axis]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
  const triangle = (model, index) => model.indices.slice(index * 3, index * 3 + 3).map(vertex => model.position.values[vertex]);

  // Intersection d'une droite parallèle à Z avec les vrais triangles du mât.
  // Aucune reconstruction du profil octogonal ni loi de déformation du script.
  function mastInterval(model, [first, count], x, y) {
    const intersections = [];
    for (let index = first; index < first + count; index++) {
      const [a, b, c] = triangle(model, index);
      const determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(determinant) < 1e-13) continue;
      const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / determinant;
      const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / determinant;
      const w = 1 - u - v;
      if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) intersections.push(u * a[2] + v * b[2] + w * c[2]);
    }
    return intersections.length ? { aft: Math.min(...intersections), fore: Math.max(...intersections) } : null;
  }
  function boomSection(model, [first, count], z) {
    const intersections = [];
    for (let index = first; index < first + count; index++) {
      const points = triangle(model, index);
      for (let edge = 0; edge < 3; edge++) {
        const a = points[edge], b = points[(edge + 1) % 3], da = a[2] - z, db = b[2] - z;
        if (Math.abs(da) < 1e-7) intersections.push(a);
        if (da * db < 0) {
          const amount = -da / (db - da);
          intersections.push(a.map((value, axis) => value + amount * (b[axis] - value)));
        }
      }
    }
    return intersections.length ? {
      bottom: Math.min(...intersections.map(point => point[1])),
      top: Math.max(...intersections.map(point => point[1]))
    } : null;
  }

  for (const spec of cases) {
    const source = decoded(spec.source), target = decoded(spec.output);
    assert.equal(sha256(source.bytes), spec.sha, spec.source + ": source utilisateur intacte");
    assert.equal(target.bytes.length, source.bytes.length);
    assert.deepEqual(target.json, source.json, "métadonnées, matériaux et catalogue inchangés");
    assert.deepEqual(target.indices, source.indices, "aucun indice modifié");
    const firstIndex = spec.bag[0] * 3, endIndex = (spec.bag[0] + spec.bag[1]) * 3;
    const bag = new Set(source.indices.slice(firstIndex, endIndex));
    for (let index = 0; index < source.indices.length; index++) {
      if (index < firstIndex || index >= endIndex) assert.equal(bag.has(source.indices[index]), false, "aucun sommet partagé hors housse");
    }
    const permitted = new Set();
    for (const vertex of bag) for (const attribute of [source.position, source.normal]) {
      for (let byte = 0; byte < 12; byte++) permitted.add(attribute.offset + vertex * attribute.stride + byte);
    }
    let changedBytes = 0;
    for (let byte = 0; byte < source.bytes.length; byte++) {
      if (source.bytes[byte] === target.bytes[byte]) continue;
      changedBytes++;
      assert.ok(permitted.has(byte), spec.output + ": octet modifié hors positions/normales de la housse : " + byte);
    }
    assert.ok(changedBytes > 0, "retouche réellement appliquée");
    // Le contrôle octet par octet ci-dessus protège également COLOR_0, alpha,
    // indices et tous les attributs des autres pièces, sans réencodage toléré.

    for (const point of target.position.values) assert.ok(point.every(Number.isFinite));
    for (const normal of target.normal.values) {
      assert.ok(normal.every(Number.isFinite));
      close(Math.hypot(...normal), 1, 1e-5, "normale unitaire du dérivé");
    }
    for (let index = 0; index < target.indices.length; index += 3) {
      const ids = target.indices.slice(index, index + 3);
      assert.equal(new Set(ids).size, 3, "triangle sans indice répété");
      for (const vertex of ids) assert.ok(Number.isInteger(vertex) && vertex >= 0 && vertex < target.position.count);
      const [a, b, c] = triangle(target, index / 3);
      const face = cross(difference(b, a), difference(c, a));
      assert.ok(Math.hypot(...face) > 1e-10, spec.output + ": triangle non dégénéré " + index / 3);
      for (const vertex of ids) assert.ok(dot(face, target.normal.values[vertex]) > 0, "normale orientée avec la face");
    }

    // Les appartenances restent celles des cinq stations du source : le nez
    // peut changer de Z pour suivre le mât, sans créer de nouvelles stations.
    const stations = [...new Set([...bag].map(vertex => source.position.values[vertex][2]))].sort((a, b) => b - a);
    assert.equal(stations.length, 5);
    const sections = stations.map(z => {
      const vertices = [...bag].filter(vertex => source.position.values[vertex][2] === z);
      const points = [...new Map(vertices.map(vertex => {
        const point = target.position.values[vertex]; return [point.join(","), point];
      })).values()];
      return { points, top: Math.max(...points.map(point => point[1])), bottom: Math.min(...points.map(point => point[1])) };
    });
    for (let index = 0; index < sections.length - 1; index++) assert.ok(
      sections[index].top >= sections[index + 1].top + .02,
      spec.output + ": le sommet monte vers le mât, sans extrémité plongeante"
    );
    const contacts = [];
    for (const point of sections[0].points) {
      const surface = mastInterval(target, spec.mast, point[0], point[1]);
      if (!surface) {
        assert.ok(point[1] < sections[0].top - 1e-6, "le sommet avant rejoint le vrai mât");
        continue; // Les ailes latérales peuvent dépasser la largeur du mât.
      }
      const gap = surface.aft - point[2];
      assert.ok(gap >= -.005 && gap <= .0001, spec.output + ": raccord au mât sans vide ni recouvrement excessif : " + gap);
      contacts.push(gap);
    }
    assert.ok(contacts.length >= 2, "contact des deux côtés du sommet avant");
    for (const [index, section] of sections.entries()) {
      const floor = section.points.filter(point => Math.abs(point[1] - section.bottom) < 1e-6);
      const center = [0, 1, 2].map(axis => floor.reduce((sum, point) => sum + point[axis], 0) / floor.length);
      close(center[0], 0, 1e-6, "pied centré sur la bôme");
      const boom = boomSection(target, spec.boom, center[2]);
      const onBoom = boom && center[1] >= boom.bottom - 1e-4 && center[1] <= boom.top + 1e-4;
      if (index > 0) assert.ok(onBoom, "le pied des sections arrière reste en contact avec la bôme");
      else {
        // Le nez se termine dans le mât, légèrement au-delà du cap de bôme.
        const mast = mastInterval(target, spec.mast, center[0], center[1]);
        const onMast = mast && center[2] >= mast.aft - 1e-4 && center[2] <= mast.fore + 1e-4;
        assert.ok(onBoom || onMast, "le pied avant rejoint la bôme ou le mât sans flotter");
      }
    }
    t.diagnostic(`${spec.output}: ${changedBytes} octets P/N ; recouvrement du mât ${(-Math.max(...contacts) * 1000).toFixed(2)}–${(-Math.min(...contacts) * 1000).toFixed(2)} mm ; sections remontantes`);
  }

  const files = [...cases.flatMap(spec => [spec.source, spec.output]), "scripts/reshape-lazybags.mjs"];
  const snapshot = () => files.map(file => {
    const absolute = path.join(root, file), stat = fs.statSync(absolute);
    return { file, sha256: sha256(fs.readFileSync(absolute)), size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  });
  const before = snapshot();
  const checked = spawnSync(process.execPath, ["scripts/reshape-lazybags.mjs", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(checked.status, 0, (checked.stdout || "") + (checked.stderr || ""));
  assert.deepEqual(snapshot(), before, "--check conserve les octets et les dates des sources, dérivés et script");
});
