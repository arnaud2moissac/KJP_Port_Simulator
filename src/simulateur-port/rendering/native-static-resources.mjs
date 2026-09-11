import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, DoubleSide } from "three";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

let resourceBuilds = 0;
export const nativeStaticResourceBuilds = () => resourceBuilds;

function points(value, count) {
  if (!Array.isArray(value) || value.length !== count || value.some(p =>
    !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))) {
    throw new TypeError("Native static: points monde invalides");
  }
  return value.map(p => [...p]);
}

function width(value) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError("Native static: largeur invalide");
  return value;
}

// N1 seulement : un quadrilatère plan convexe (face de quai) et un segment.
// Ni état du simulateur, ni caméra, ni projection dans ce constructeur.
export function createNativeStaticResources(definition) {
  const quad = points(definition?.surface?.points, 4);
  const segment = points(definition?.stroke?.points, 2);
  const outlineWidth = width(definition.surface.outlineWidth);
  const strokeWidth = width(definition.stroke.width);
  resourceBuilds++;
  const group = new Group();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(quad.flat(), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const surface = new Mesh(geometry, new MeshBasicMaterial({
    color: definition.surface.color, side: DoubleSide, toneMapped: false,
    // Écarter le remplissage du contour coplanaire sans déplacer les points KJP.
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  }));
  surface.name = "surface";
  group.add(surface);

  function line(name, pairs, color, linewidth) {
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(pairs.flat(2));
    const object = new LineSegments2(lineGeometry, new LineMaterial({
      color, linewidth, worldUnits: false, toneMapped: false, alphaToCoverage: true
    }));
    object.name = name;
    group.add(object);
  }
  line("outline", quad.map((p, i) => [p, quad[(i + 1) % quad.length]]), definition.surface.outlineColor, outlineWidth);
  line("stroke", [segment], definition.stroke.color, strokeWidth);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const object of group.children) {
      object.geometry.dispose(); object.material.dispose();
    }
    group.clear();
  }
  return Object.freeze({ group, dispose });
}
