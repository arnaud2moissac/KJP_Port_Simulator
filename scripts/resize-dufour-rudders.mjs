import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Édition visuelle autorisée le 15 octobre 2026. Le fichier fourni reste intact.
// Seuls les sommets/normales des 32 triangles des safrans sont modifiés.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "kjp_dufour_310_gl_2014_dimfix.glb");
const targetPath = path.join(root, "kjp_dufour_310_gl_2014_dimfix_rudders.glb");
const source = fs.readFileSync(sourcePath);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256(source), "e4db9395319edaa673f03ca94a7e552ccd65e9bacf24bba10704db540061e4d7");
assert.equal(source.readUInt32LE(0), 0x46546c67);
assert.equal(source.readUInt32LE(4), 2);
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
const binaryOffset = 28 + jsonLength;
const primitive = gltf.meshes[0].primitives[0];
const target = Buffer.from(source);
function attribute(id, size, componentType) {
  const accessor = gltf.accessors[id], view = gltf.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, componentType);
  const width = componentType === 5123 ? 2 : 4;
  return {
    count: accessor.count,
    stride: view.byteStride || size * width,
    offset: binaryOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0)
  };
}
const position = attribute(primitive.attributes.POSITION, 3, 5126);
const normal = attribute(primitive.attributes.NORMAL, 3, 5126);
const indices = attribute(primitive.indices, 1, 5123);
assert.equal(indices.count, 1970 * 3);
const vertexAt = index => source.readUInt16LE(indices.offset + index * indices.stride);
const read = (buffer, accessor, vertex) => Array.from({ length: 3 }, (_, axis) => (
  buffer.readFloatLE(accessor.offset + vertex * accessor.stride + axis * 4)
));
const write = (accessor, vertex, value) => value.forEach((component, axis) => (
  target.writeFloatLE(component, accessor.offset + vertex * accessor.stride + axis * 4)
));
function projectedArea(points) {
  const unique = [...new Map(points.map(point => [
    `${point[2]},${point[1]}`, [point[2], point[1]]
  ])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = points => {
    const result = [];
    for (const point of points) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop();
      result.push(point);
    }
    result.pop();
    return result;
  };
  const contour = [...half(unique), ...half([...unique].reverse())];
  return Math.abs(contour.reduce((sum, point, index) => {
    const next = contour[(index + 1) % contour.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}
const report = [];
for (const [name, triangleStart] of [["port", 1938], ["starboard", 1954]]) {
  const vertices = new Set(Array.from({ length: 16 * 3 }, (_, offset) => vertexAt(triangleStart * 3 + offset)));
  for (let index = 0; index < indices.count; index++) {
    if (index < triangleStart * 3 || index >= (triangleStart + 16) * 3) {
      assert.equal(vertices.has(vertexAt(index)), false, "sommet partagé avec une autre partie");
    }
  }
  const before = [...vertices].map(vertex => read(source, position, vertex));
  const top = Math.max(...before.map(point => point[1]));
  const spanBefore = top - Math.min(...before.map(point => point[1]));
  const rootPoints = before.filter(point => Math.abs(point[1] - top) < 1e-6);
  const rootX = (Math.min(...rootPoints.map(point => point[0])) + Math.max(...rootPoints.map(point => point[0]))) / 2;
  const leadingZ = Math.max(...rootPoints.map(point => point[2]));
  const rootChord = leadingZ - Math.min(...rootPoints.map(point => point[2]));
  const stockZ = leadingZ - .24 * rootChord;
  const areaBefore = projectedArea(before);
  const spanScale = .82 / spanBefore;
  const chordScale = .31 / (areaBefore * spanScale);
  const scale = [spanScale, spanScale, chordScale];
  const origin = [rootX, top, stockZ];
  for (const vertex of vertices) {
    const point = read(source, position, vertex);
    write(position, vertex, point.map((value, axis) => origin[axis] + (value - origin[axis]) * scale[axis]));
    const transformedNormal = read(source, normal, vertex).map((value, axis) => value / scale[axis]);
    const length = Math.hypot(...transformedNormal);
    write(normal, vertex, transformedNormal.map(value => value / length));
  }
  const after = [...vertices].map(vertex => read(target, position, vertex));
  report.push({ name, vertices: vertices.size, origin, scale,
    before: { span: spanBefore, projectedArea: areaBefore },
    after: { span: Math.max(...after.map(p => p[1])) - Math.min(...after.map(p => p[1])), projectedArea: projectedArea(after) }
  });
}
if (process.argv.includes("--check")) {
  assert.deepEqual(fs.readFileSync(targetPath), target, "dérivé GLB à régénérer");
} else {
  fs.writeFileSync(targetPath, target);
}
let fingerprint = 2166136261;
for (const byte of target) fingerprint = Math.imul(fingerprint ^ byte, 16777619);
console.log(JSON.stringify({ source: path.basename(sourcePath), target: path.basename(targetPath),
  sourceSha256: sha256(source), targetSha256: sha256(target),
  fingerprint: `0x${(fingerprint >>> 0).toString(16)}`, rudders: report
}, null, 2));
