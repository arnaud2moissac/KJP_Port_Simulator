import { Group } from "three";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

function applyColor(material, value) {
  if (typeof value !== "string") throw new TypeError("Flux natif : couleur absente");
  const rgba = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  const opacity = rgba ? Number(rgba[4]) : 1;
  material.color.setStyle(rgba ? `rgb(${rgba[1]},${rgba[2]},${rgba[3]})` : value);
  material.opacity = opacity;
  const transparent = opacity < 1;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}

function checkedPoint(point) {
  if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
    throw new TypeError("Flux natif : point monde invalide");
  }
  return point;
}

// Buffer volontairement séparé des ressources statiques. La présentation peut
// déplacer les particules à chaque image sans reconstruire le port ni le bateau.
export function createNativeFlowResources({ fields }) {
  if (!Array.isArray(fields) || !fields.length) throw new TypeError("Flux natif : définition absente");
  const group = new Group();
  const records = new Map();
  let disposed = false;

  try {
    for (const field of fields) {
      if (!field || typeof field.id !== "string" || records.has(field.id)
        || !Number.isInteger(field.capacity) || field.capacity < 1
        || !Number.isFinite(field.width) || field.width <= 0) {
        throw new TypeError("Flux natif : champ invalide");
      }
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(new Float32Array(field.capacity * 6));
      geometry.instanceCount = 0;
      const material = new LineMaterial({
        color: field.color,
        linewidth: field.width,
        worldUnits: false,
        toneMapped: false,
        alphaToCoverage: false,
        depthWrite: false
      });
      applyColor(material, field.color);
      const object = new LineSegments2(geometry, material);
      object.name = `flow:${field.id}`;
      object.userData = { owner: `flow:${field.id}`, family: "flow", kind: "line" };
      object.renderOrder = -2;
      object.frustumCulled = false;
      group.add(object);
      records.set(field.id, {
        object,
        geometry,
        material,
        capacity: field.capacity,
        count: 0,
        updates: 0
      });
    }
  } catch (error) {
    for (const record of records.values()) {
      record.geometry.dispose();
      record.material.dispose();
    }
    group.clear();
    throw error;
  }

  function update(presentation) {
    if (disposed) throw new Error("Flux natif : ressources libérées");
    if (!Array.isArray(presentation?.fields)) throw new TypeError("Flux natif : présentation absente");
    const presented = new Set();
    for (const field of presentation.fields) {
      const record = records.get(field?.id);
      if (!record || presented.has(field.id) || !Array.isArray(field.segments)) {
        throw new TypeError("Flux natif : présentation de champ invalide");
      }
      if (field.segments.length > record.capacity) throw new RangeError("Flux natif : capacité dépassée");
      presented.add(field.id);
      applyColor(record.material, field.color);
      const start = record.geometry.attributes.instanceStart;
      const end = record.geometry.attributes.instanceEnd;
      for (let index = 0; index < field.segments.length; index++) {
        const segment = field.segments[index];
        if (!Array.isArray(segment) || segment.length !== 2) throw new TypeError("Flux natif : segment invalide");
        start.setXYZ(index, ...checkedPoint(segment[0]));
        end.setXYZ(index, ...checkedPoint(segment[1]));
      }
      record.geometry.instanceCount = field.segments.length;
      if (field.segments.length || record.count) {
        // instanceStart et instanceEnd partagent le même buffer entrelacé.
        start.data.needsUpdate = true;
        record.updates++;
      }
      record.count = field.segments.length;
    }
    for (const [id, record] of records) {
      if (presented.has(id)) continue;
      record.geometry.instanceCount = 0;
      record.count = 0;
    }
  }

  function report() {
    if (disposed) throw new Error("Flux natif : ressources libérées");
    return Object.fromEntries([...records].map(([id, record]) => [id, {
      capacity: record.capacity,
      segments: record.count,
      updates: record.updates,
      bufferBytes: record.geometry.attributes.instanceStart.data.array.byteLength,
      bufferVersion: record.geometry.attributes.instanceStart.data.version,
      geometry: record.geometry.uuid
    }]));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const record of records.values()) {
      record.geometry.dispose();
      record.material.dispose();
    }
    group.clear();
  }

  return Object.freeze({ group, update, report, dispose });
}
