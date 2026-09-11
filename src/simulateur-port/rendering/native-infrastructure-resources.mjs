import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, DoubleSide, ShapeUtils, Vector2 } from "three";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

// Diagnostics de cycle de vie ; aucune donnée de simulation.
const totals = { builds: 0, liveGeometries: 0, liveMaterials: 0, disposedGeometries: 0, disposedMaterials: 0 };

function checkedPoints(points, minimum) {
  if (!Array.isArray(points) || points.length < minimum || points.some(p =>
    !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))) {
    throw new TypeError("Native infrastructure: points monde invalides");
  }
  return points.map(p => [...p]);
}

// Le plan dominant est déterminé dans le monde, une fois : terres concaves,
// faces verticales et rampes inclinées n'utilisent pas la projection caméra.
function triangles(points) {
  const normal = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
    normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
    normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const dropped = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const axes = [0, 1, 2].filter(axis => axis !== dropped);
  return ShapeUtils.triangulateShape(points.map(p => new Vector2(p[axes[0]], p[axes[1]])), []).flat();
}

function applyColor(material, value) {
  if (typeof value !== "string") throw new TypeError("Native infrastructure: rôle couleur absent");
  const rgba = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  const opacity = rgba ? Number(rgba[4]) : 1;
  material.color.setStyle(rgba ? `rgb(${rgba[1]},${rgba[2]},${rgba[3]})` : value);
  material.opacity = opacity;
  const transparent = opacity < 1;
  if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
}

// Entrée : propriétaires et primitives MONDE à rôles de palette, sans état,
// RenderFrame, caméra, filtrage de visibilité ou compteurs Legacy.
export function createNativeInfrastructureResources({ owners, palette }) {
  const group = new Group(), geometries = [], materials = new Map(), inventory = [];
  let disposed = false, warmed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) { geometry.dispose(); totals.liveGeometries--; totals.disposedGeometries++; }
    for (const material of materials.values()) { material.dispose(); totals.liveMaterials--; totals.disposedMaterials++; }
    group.clear();
  };
  function materialFor(kind, role, width) {
    const key = JSON.stringify([kind, role, width]);
    if (!materials.has(key)) {
      const material = kind === "fill" ? new MeshBasicMaterial({ side: DoubleSide, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }) :
        // Les contours KJP ont déjà une opacité : alpha-to-coverage cumulé au
        // blending les amincit/efface. Le MSAA du renderer suffit ici.
        new LineMaterial({ linewidth: width, worldUnits: false, toneMapped: false, alphaToCoverage: false, depthWrite: false });
      materials.set(key, material); totals.liveMaterials++;
      material.userData.role = role;
      applyColor(material, palette[role]);
    }
    return materials.get(key);
  }
  try {
    for (const owner of owners) {
      const key = `${owner.family}:${owner.id}`, batches = new Map();
      if (inventory.some(o => o.key === key)) throw new TypeError("Native infrastructure: propriétaire dupliqué");
      const record = { key, id: owner.id, family: owner.family, polygons: 0, segments: 0 };
      inventory.push(record);
      function batch(kind, role, width = 0, layer = 0) {
        const key = JSON.stringify([kind, role, width, layer]);
        if (!batches.has(key)) batches.set(key, { kind, role, width, layer, positions: [], indices: [] });
        return batches.get(key);
      }
      function line(points, role, width, layer = 0) {
        if (!Number.isFinite(width) || width <= 0) throw new TypeError("Native infrastructure: largeur invalide");
        const b = batch("line", role, width, layer);
        for (let i = 1; i < points.length; i++) {
          const a = points[i-1], end = points[i];
          // Des arêtes de plusieurs centaines de mètres traversant le plan de
          // l'œil dégradent la précision du ruban écran LineMaterial. Découpage
          // collinéaire MONDE à l'initialisation, indépendant de toute caméra.
          const parts = Math.max(1, Math.ceil(Math.hypot(...end.map((v, axis) => v-a[axis])) / 16));
          const point = ratio => a.map((v, axis) => v+(end[axis]-v)*ratio);
          for (let part = 0; part < parts; part++) b.positions.push(...point(part/parts), ...point((part+1)/parts));
          record.segments++;
        }
      }
      for (const polygon of owner.polygons) {
        const points = checkedPoints(polygon.points, 3), indices = triangles(points);
        if (indices.length) {
          const b = batch("fill", polygon.fill, 0, polygon.layer || 0), offset = b.positions.length / 3;
          b.positions.push(...points.flat()); b.indices.push(...indices.map(i => i + offset)); record.polygons++;
        }
        if (polygon.stroke !== false && polygon.stroke != null) line([...points, points[0]], polygon.stroke, polygon.lineWidth ?? .7, polygon.layer);
      }
      for (const source of owner.lines) {
        if (source.dash?.length) throw new TypeError("Native infrastructure: pointillés hors lot N2.1");
        line(checkedPoints(source.points, 2), source.color, source.width, source.layer);
      }
      for (const b of batches.values()) {
        const geometry = b.kind === "fill" ? new BufferGeometry() : new LineSegmentsGeometry();
        geometries.push(geometry); totals.liveGeometries++;
        if (b.kind === "fill") {
          geometry.setAttribute("position", new Float32BufferAttribute(b.positions, 3)); geometry.setIndex(b.indices);
        } else geometry.setPositions(b.positions);
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const material = materialFor(b.kind, b.role, b.width);
        const object = b.kind === "fill" ? new Mesh(geometry, material) : new LineSegments2(geometry, material);
        object.name = `${key}:${b.kind}:${b.role}:${b.layer}`;
        object.userData = { owner: key, family: owner.family, kind: b.kind };
        object.renderOrder = b.layer;
        // Premier rendu : soumettre tous les buffers, même hors champ. Ensuite
        // les faces utilisent leurs bounds réels. Les traits écran conservent
        // un culling conservateur GPU (leur largeur déborde la sphère monde).
        object.frustumCulled = false;
        group.add(object);
      }
    }
    totals.builds++;
  } catch (error) { dispose(); throw error; }

  return Object.freeze({
    group, dispose,
    afterRender() {
      if (warmed) return;
      warmed = true;
      for (const object of group.children) object.frustumCulled = !object.isLineSegments2;
    },
    updatePalette(next) {
      for (const material of materials.values()) applyColor(material, next[material.userData.role]);
    },
    report: () => ({ ...totals, owners: inventory.map(o => ({ ...o })), geometryCount: geometries.length,
      materialCount: materials.size, warmed })
  });
}
