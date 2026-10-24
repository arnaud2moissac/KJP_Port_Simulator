import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Retouche visuelle demandée le 22 octobre 2026. Les originaux restent intacts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LAZYBAGS = [
  { source: "KJP_Contessa26_rouge.glb", output: "KJP_Contessa26_rouge_lazybag.glb",
    sha: "71f0d23085ea812699692b878ceee5cea6a0a89543c1cde3b336a76e32775877",
    start: 5943, count: 168, mastTriangles: 28, boomTriangles: 28,
    headHeight: .34, shoulderHeight: .24, headHalfWidth: .085 },
  { source: "KJP_Class40.glb", output: "KJP_Class40_lazybag.glb",
    sha: "091385c899dd2ed0c679d4b9e5b027f903e5b9dc9880e3f7a51cf6683c838e84",
    start: 3486, count: 180, mastTriangles: 32, boomTriangles: 32,
    headHeight: .54, shoulderHeight: .39, headHalfWidth: .145 },
  { source: "KJP_Oceanis48.glb", output: "KJP_Oceanis48_lazybag.glb",
    sha: "2d3b423ebeedaf57f4d47f192ba8f141612d1ff3ab2dd311f34619876b983618",
    start: 8031, count: 168, mastTriangles: 28, boomTriangles: 28,
    headHeight: .54, shoulderHeight: .40, headHalfWidth: .16 }
];
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function reshapeLazybag(spec) {
  const source = fs.readFileSync(path.join(root, spec.source));
  assert.equal(sha256(source), spec.sha, "version source connue");
  const jsonLength = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + jsonLength));
  const binaryOffset = 28 + jsonLength, primitive = gltf.meshes[0].primitives[0];
  const attribute = (id, componentType, type, stride) => {
    const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
    assert.equal(a.componentType, componentType); assert.equal(a.type, type);
    return { count: a.count, offset: binaryOffset + (view.byteOffset || 0) + (a.byteOffset || 0), stride: view.byteStride || stride };
  };
  const position = attribute(primitive.attributes.POSITION, 5126, "VEC3", 12);
  const normal = attribute(primitive.attributes.NORMAL, 5126, "VEC3", 12);
  const indices = attribute(primitive.indices, 5123, "SCALAR", 2);
  const at = i => source.readUInt16LE(indices.offset + i * indices.stride);
  const read = (bytes, a, v) => [0, 1, 2].map(c => bytes.readFloatLE(a.offset + a.stride * v + c * 4));
  const write = (bytes, a, v, point) => point.forEach((x, c) => bytes.writeFloatLE(x, a.offset + a.stride * v + c * 4));
  const verticesIn = (start, count) => [...new Set(Array.from({ length: count }, (_, i) => at(start + i)))];
  const bag = verticesIn(spec.start, spec.count), bagSet = new Set(bag);
  const part = gltf.nodes.find(n => n.mesh === 0).extras.indexRangesBySourcePart.find(p => p.name === "mast_and_boom");
  assert.equal(spec.start, part.firstIndex + (spec.mastTriangles + spec.boomTriangles) * 3);
  assert.equal(spec.start + spec.count, part.firstIndex + part.indexCount);
  for (let i = 0; i < indices.count; i++) {
    if (i < spec.start || i >= spec.start + spec.count) assert.equal(bagSet.has(at(i)), false, "sommets propres au lazybag");
  }
  const uniquePoints = vertices => [...new Map(vertices.map(v => {
    const point = read(source, position, v); return [point.join(","), point];
  })).values()];
  const mast = uniquePoints(verticesIn(part.firstIndex, spec.mastTriangles * 3));
  const mastEnds = [Math.min(...mast.map(p => p[1])), Math.max(...mast.map(p => p[1]))].map(y => {
    const ring = mast.filter(p => Math.abs(p[1] - y) < 1e-5);
    const minZ = Math.min(...ring.map(p => p[2])), maxZ = Math.max(...ring.map(p => p[2]));
    return { y, z: (minZ + maxZ) / 2, radiusX: Math.max(...ring.map(p => Math.abs(p[0]))), radiusZ: (maxZ - minZ) / 2 };
  });
  const lerp = (a, b, t) => a + (b - a) * t;
  // Face arrière réelle du mât octogonal : la housse se raccorde à sa surface.
  const mastSurface = (y, x) => {
    const t = (y - mastEnds[0].y) / (mastEnds[1].y - mastEnds[0].y);
    const center = lerp(mastEnds[0].z, mastEnds[1].z, t);
    const rx = lerp(mastEnds[0].radiusX, mastEnds[1].radiusX, t);
    const rz = lerp(mastEnds[0].radiusZ, mastEnds[1].radiusZ, t);
    const diagonal = Math.SQRT1_2, ratio = Math.min(1, Math.abs(x) / rx);
    const depth = ratio <= diagonal ? 1 - ratio * (1 - diagonal) / diagonal
      : diagonal * (1 - ratio) / (1 - diagonal);
    return center - rz * depth;
  };
  const boom = uniquePoints(verticesIn(part.firstIndex + spec.mastTriangles * 3, spec.boomTriangles * 3));
  const midZ = (Math.min(...boom.map(p => p[2])) + Math.max(...boom.map(p => p[2]))) / 2;
  const boomEnds = [boom.filter(p => p[2] < midZ), boom.filter(p => p[2] > midZ)].map(points =>
    [0, 1, 2].map(c => points.reduce((sum, p) => sum + p[c], 0) / points.length));
  const boomY = z => lerp(boomEnds[0][1], boomEnds[1][1], (z - boomEnds[0][2]) / (boomEnds[1][2] - boomEnds[0][2]));
  const sections = [...new Set(bag.map(v => read(source, position, v)[2]))].sort((a, b) => b - a);
  assert.equal(sections.length, 5);
  const target = Buffer.from(source), changed = new Set();
  for (const [section, height] of [[0, spec.headHeight], [1, spec.shoulderHeight]]) {
    const ring = bag.filter(v => read(source, position, v)[2] === sections[section]);
    const points = ring.map(v => read(source, position, v));
    const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
    const halfWidth = Math.max(...points.map(p => Math.abs(p[0])));
    for (const vertex of ring) {
      const point = read(source, position, vertex), level = (point[1] - minY) / (maxY - minY);
      if (section === 0) {
        point[0] *= spec.headHalfWidth / halfWidth;
        point[1] = minY + level * height;
        for (let iteration = 0; iteration < 4; iteration++) {
          point[2] = mastSurface(point[1], point[0]) + .003; // raccord avec 3 mm de recouvrement visuel
          point[1] = boomY(point[2]) + level * height;
        }
      } else point[1] = minY + level * height;
      write(target, position, vertex, point); changed.add(vertex);
    }
  }
  // Recalcul hors ligne des normales incidentes ; aucun travail ajouté au renderer.
  const triangles = [];
  const affectedNormals = new Set();
  for (let i = spec.start; i < spec.start + spec.count; i += 3) {
    const ids = [at(i), at(i + 1), at(i + 2)]; triangles.push(ids);
    if (ids.some(v => changed.has(v))) ids.forEach(v => affectedNormals.add(v));
  }
  const sums = new Map([...affectedNormals].map(v => [v, [0, 0, 0]]));
  for (const ids of triangles) {
    const [a, b, c] = ids.map(v => read(target, position, v));
    const u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(Math.hypot(...cross) > 1e-10, "triangle lazybag non dégénéré");
    ids.forEach(id => { if (sums.has(id)) cross.forEach((value, k) => { sums.get(id)[k] += value; }); });
  }
  for (const [vertex, sum] of sums) {
    const length = Math.hypot(...sum); assert.ok(length > 0);
    write(target, normal, vertex, sum.map(x => x / length));
  }
  const permitted = new Set();
  for (const v of bag) for (const a of [position, normal]) for (let c = 0; c < 12; c++) permitted.add(a.offset + a.stride * v + c);
  for (let i = 0; i < target.length; i++) if (source[i] !== target[i]) assert.ok(permitted.has(i), "retouche limitée aux positions/normales du lazybag");
  const sectionMetrics = sections.map(z => {
    const vertices = bag.filter(v => read(source, position, v)[2] === z), points = vertices.map(v => read(target, position, v));
    return { vertices, top: Math.max(...points.map(p => p[1])), bottom: Math.min(...points.map(p => p[1])) };
  });
  assert.ok(sectionMetrics[0].top > sectionMetrics[1].top && sectionMetrics[1].top > sectionMetrics[2].top, "la housse remonte jusqu'au mât");
  let fingerprint = 2166136261;
  for (const byte of target) fingerprint = Math.imul(fingerprint ^ byte, 16777619);
  return { bytes: target, bag, position, normal, sections: sectionMetrics,
    report: { file: spec.output, changedVertices: changed.size, sha256: sha256(target), fingerprint: "0x" + (fingerprint >>> 0).toString(16) } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const spec of LAZYBAGS) {
    const result = reshapeLazybag(spec), output = path.join(root, spec.output);
    if (process.argv.includes("--check")) assert.ok(fs.readFileSync(output).equals(result.bytes), spec.output + " à régénérer");
    else fs.writeFileSync(output, result.bytes);
    console.log(JSON.stringify(result.report));
  }
}
