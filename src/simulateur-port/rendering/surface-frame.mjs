import { createThreeCamera } from "./three-camera.mjs";
import renderFrames from "./render-frame.cjs";

// Snapshot de présentation métrique, limité au terrain : ni état physique,
// ni référence mutable au cache de topologie. L'eau reste le fond CSS partagé.
export function createSurfaceFrame(camera, polygons, waterBackground) {
  return Object.freeze({
    camera,
    waterBackground,
    polygons: Object.freeze(polygons.map(polygon => Object.freeze({
      ...polygon,
      points: Object.freeze(polygon.points.map(point => {
        if (point.length !== 3 || !point.every(Number.isFinite)) {
          throw new TypeError("SurfaceFrame: point monde invalide");
        }
        return Object.freeze([...point]);
      }))
    })))
  });
}

// Clipping métrique avant projection, comme addPolygon() Legacy. Le clipping
// GPU perspective standard produirait une autre triangulation/profondeur.
export function clipSurfacePolygon(points, camera) {
  if (points.length < 3) return [];
  const depth = point => point.reduce((sum, value, i) => sum + (value - camera.position[i]) * camera.forward[i], 0);
  const output = [];
  let previous = points[points.length - 1];
  let previousDepth = depth(previous);
  let previousInside = previousDepth >= camera.near;
  for (const current of points) {
    const currentDepth = depth(current);
    const currentInside = currentDepth >= camera.near;
    if (currentInside !== previousInside) {
      const denominator = currentDepth - previousDepth;
      const ratio = Math.abs(denominator) < 1e-12 ? 0 : Math.max(0, Math.min(1, (camera.near - previousDepth) / denominator));
      output.push(previous.map((value, i) => value + (current[i] - value) * ratio));
    }
    if (currentInside) output.push(current);
    previous = current;
    previousDepth = currentDepth;
    previousInside = currentInside;
  }
  return output;
}

export function projectSurfaceFrame(frame, bridge = createThreeCamera()) {
  bridge.update(frame.camera);
  const polygons = [];
  for (const polygon of frame.polygons) {
    const clipped = clipSurfacePolygon(polygon.points, frame.camera);
    if (clipped.length < 3) continue;
    const points = clipped.map(bridge.project);
    if (points.some(point => !point)) continue;
    polygons.push({
      ...polygon, points,
      depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length
    });
  }
  return renderFrames.createRenderFrame({ polygons, lines: [] });
}
