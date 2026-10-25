import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Retouche de peinture demandée par l'utilisateur le 22 octobre 2026.
// Le fichier fourni reste intact. Seuls les octets RGB bleus de coque changent.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "KJP_Contessa26.glb"));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256(source), "597c70f1cc57290f26649c96c4f80fb1845dd0306296d382b8c2c2fbcbd430a5");
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength));
const binaryOffset = 28 + jsonLength;
const primitive = gltf.meshes[0].primitives[0];
const color = gltf.accessors[primitive.attributes.COLOR_0];
const colorView = gltf.bufferViews[color.bufferView];
assert.equal(color.componentType, 5121);
assert.equal(color.normalized, true);
assert.equal(color.type, "VEC4");
const colorOffset = binaryOffset + (colorView.byteOffset || 0) + (color.byteOffset || 0);
const colorStride = colorView.byteStride || 4;
const indices = gltf.accessors[primitive.indices], indexView = gltf.bufferViews[indices.bufferView];
assert.equal(indices.componentType, 5123);
const indexOffset = binaryOffset + (indexView.byteOffset || 0) + (indices.byteOffset || 0);
const hull = gltf.nodes.find(node => node.mesh === 0).extras.indexRangesBySourcePart
  .find(part => part.name === "hull_integral_long_keel");
assert.deepEqual([hull.firstIndex, hull.indexCount], [0, 2649]);
const linearBytes = hex => hex.match(/[0-9a-f]{2}/gi).map(pair => {
  const srgb = parseInt(pair, 16) / 255;
  return Math.round((srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4) * 255);
});
const before = linearBytes("203e52");
const after = linearBytes("dd3746"); // Médiane de la peinture rouge de la photo fournie.
const target = Buffer.from(source), changed = new Set();
for (let i = hull.firstIndex; i < hull.firstIndex + hull.indexCount; i++) {
  const vertex = source.readUInt16LE(indexOffset + i * 2);
  const offset = colorOffset + vertex * colorStride;
  if (before.every((value, channel) => source[offset + channel] === value)) {
    changed.add(vertex);
    after.forEach((value, channel) => { target[offset + channel] = value; });
  }
}
assert.ok(changed.size > 0);
for (let i = hull.firstIndex + hull.indexCount; i < indices.count; i++) {
  assert.equal(changed.has(source.readUInt16LE(indexOffset + i * 2)), false,
    "la retouche de coque ne doit pas déborder sur une autre pièce");
}
const output = path.join(root, "KJP_Contessa26_rouge.glb");
if (process.argv.includes("--check")) assert.deepEqual(fs.readFileSync(output), target, "GLB rouge à régénérer");
else fs.writeFileSync(output, target);
let fingerprint = 2166136261;
for (const byte of target) fingerprint = Math.imul(fingerprint ^ byte, 16777619);
console.log(JSON.stringify({ file: path.basename(output), color: "#dd3746", changedVertices: changed.size,
  sha256: sha256(target), fingerprint: "0x" + (fingerprint >>> 0).toString(16) }, null, 2));
