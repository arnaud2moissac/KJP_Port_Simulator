import renderFrames from "./render-frame.cjs";

// Snapshot de présentation métrique, terrain et infrastructures : ni état physique,
// ni référence mutable au cache de topologie. L'eau reste le fond CSS partagé.
export function createSurfaceFrame(camera, polygons, waterBackground, lines = []) {
  const pointsSnapshot = points => Object.freeze(points.map(point => {
    if (point.length !== 3 || !point.every(Number.isFinite)) {
      throw new TypeError("SurfaceFrame: point monde invalide");
    }
    return Object.freeze([...point]);
  }));
  return Object.freeze({
    camera,
    waterBackground,
    polygons: Object.freeze(polygons.map(polygon => Object.freeze({
      ...polygon,
      points: pointsSnapshot(polygon.points)
    }))),
    lines: Object.freeze(lines.map(line => {
      if (!line.dash.every(Number.isFinite)) throw new TypeError("SurfaceFrame: motif pointillé non fini");
      return Object.freeze({ ...line, points: pointsSnapshot(line.points), dash: Object.freeze([...line.dash]) });
    }))
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

// Compatibilité numérique : le nettoyage/ear clipping historique est sensible
// aux derniers bits des coordonnées projetées, surtout quand un contour concave
// traverse le plan proche. Une projection matricielle pourtant équivalente à
// <0,5px peut changer ses diagonales ou réussir là où le Legacy échoue.
// Conserver ici l'ordre des opérations Legacy, sans appeler son renderer ni
// lire son état. La caméra matricielle Three reste testée séparément par ancres.
export function projectSurfacePoint(point, camera) {
  const relative = point.map((value, i) => value - camera.position[i]);
  const dot = vector => relative[0] * vector[0] + relative[1] * vector[1] + relative[2] * vector[2];
  const depth = dot(camera.forward);
  if (depth < camera.near - 1e-7) return null;
  const scale = camera.focal / Math.max(camera.near, depth);
  return { x: camera.width / 2 + dot(camera.right) * scale, y: camera.height / 2 - dot(camera.up) * scale, depth, scale };
}

export function projectSurfaceFrame(frame) {
  const project = point => projectSurfacePoint(point, frame.camera);
  const polygons = [];
  for (const polygon of frame.polygons) {
    const clipped = clipSurfacePolygon(polygon.points, frame.camera);
    if (clipped.length < 3) continue;
    const points = clipped.map(project);
    if (points.some(point => !point)) continue;
    polygons.push({
      ...polygon, points,
      depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length
    });
  }
  const lines = [];
  const depth = point => point.reduce((sum, value, i) => sum + (value - frame.camera.position[i]) * frame.camera.forward[i], 0);
  for (const line of frame.lines) {
    if (line.points.length < 2) continue;
    if (line.points.every(point => depth(point) >= frame.camera.near)) {
      const points = line.points.map(project);
      if (points.every(Boolean)) lines.push({ ...line, points });
      continue;
    }
    for (let i = 1; i < line.points.length; i += 1) {
      let first = line.points[i - 1], second = line.points[i];
      const firstDepth = depth(first), secondDepth = depth(second);
      if (firstDepth < frame.camera.near && secondDepth < frame.camera.near) continue;
      if (firstDepth < frame.camera.near || secondDepth < frame.camera.near) {
        const denominator = secondDepth - firstDepth;
        const ratio = Math.abs(denominator) < 1e-12 ? 0 : Math.max(0, Math.min(1, (frame.camera.near - firstDepth) / denominator));
        const intersection = first.map((value, j) => value + (second[j] - value) * ratio);
        if (firstDepth < frame.camera.near) first = intersection; else second = intersection;
      }
      const points = [project(first), project(second)];
      if (points.every(Boolean)) lines.push({ ...line, points });
    }
  }
  return renderFrames.createRenderFrame({ polygons, lines });
}
