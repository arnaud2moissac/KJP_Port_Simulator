// Port indépendant de la triangulation Legacy (66b7fb6), conservée à l'identique
// pour l'iso-rendu, y compris nettoyage écran, seuils et choix des diagonales.
const signedArea = points => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2;
const cleanPolygon = rawPoints => {
  const epsilon = 1e-4;
  const points = [];
  for (const point of rawPoints) {
    if (![point.x, point.y, point.depth].every(Number.isFinite)) continue;
    const previous = points[points.length - 1];
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) <= epsilon) continue;
    points.push(point);
  }
  if (
    points.length > 2
    && Math.hypot(
      points[0].x - points[points.length - 1].x,
      points[0].y - points[points.length - 1].y
    ) <= epsilon
  ) points.pop();

  let removed = true;
  while (removed && points.length > 3) {
    removed = false;
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length];
      const current = points[index];
      const next = points[(index + 1) % points.length];
      const firstLength = Math.hypot(current.x - previous.x, current.y - previous.y);
      const secondLength = Math.hypot(next.x - current.x, next.y - current.y);
      const cross = Math.abs(
        (current.x - previous.x) * (next.y - current.y)
        - (current.y - previous.y) * (next.x - current.x)
      );
      if (cross > epsilon * Math.max(1, firstLength + secondLength)) continue;
      points.splice(index, 1);
      removed = true;
      break;
    }
  }
  return points;
};
const triangulate = rawPoints => {
  const points = cleanPolygon(rawPoints);
  if (points.length < 3) return { points, triangles: [], complete: false };
  if (points.length === 3) {
    const area = signedArea(points);
    return {
      points,
      triangles: Math.abs(area) > 1e-6 ? [[0, 1, 2]] : [],
      complete: Math.abs(area) > 1e-6
    };
  }
  const area = signedArea(points);
  if (Math.abs(area) <= 1e-6) return { points, triangles: [], complete: false };
  if (points.length === 4) {
    const orientation = Math.sign(area);
    const convex = points.every((point, index) => {
      const next = points[(index + 1) % points.length];
      const after = points[(index + 2) % points.length];
      return (
        (next.x - point.x) * (after.y - next.y)
        - (next.y - point.y) * (after.x - next.x)
      ) * orientation > 1e-7;
    });
    if (convex) {
      return {
        points,
        triangles: [[0, 1, 2], [0, 2, 3]],
        complete: true
      };
    }
  }
  const remaining = points.map((_, index) => index);
  const triangles = [];
  const orientation = Math.sign(area);
  const inside = (point, a, b, c) => {
    const cross = (first, second, target) => (
      (second.x - first.x) * (target.y - first.y)
      - (second.y - first.y) * (target.x - first.x)
    );
    const ab = cross(a, b, point) * orientation;
    const bc = cross(b, c, point) * orientation;
    const ca = cross(c, a, point) * orientation;
    return ab > 1e-6 && bc > 1e-6 && ca > 1e-6;
  };
  let guard = points.length * points.length;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let cursor = 0; cursor < remaining.length; cursor += 1) {
      const previous = remaining[(cursor - 1 + remaining.length) % remaining.length];
      const current = remaining[cursor];
      const next = remaining[(cursor + 1) % remaining.length];
      const a = points[previous];
      const b = points[current];
      const c = points[next];
      const convex = (
        ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x))
        * orientation
      ) > 1e-7;
      if (!convex) continue;
      if (remaining.some(index => (
        index !== previous && index !== current && index !== next
        && inside(points[index], a, b, c)
      ))) continue;
      triangles.push([previous, current, next]);
      remaining.splice(cursor, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) triangles.push([...remaining]);
  return {
    points,
    triangles: remaining.length === 3 ? triangles : [],
    complete: remaining.length === 3
  };
};


const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Même encodage que createDepthRenderer au commit 66b7fb6 : profondeur
// logarithmique par sommet, puis interpolation écran (gl_Position.w = 1).
export function compileSurfaceBatches(frame, camera, parseColor) {
  const opaque = [], translucent = [], strokes = [], translucentRecords = [];
  const depthNdc = (depth, offset) => clamp(
    Math.log(clamp(depth, camera.near, camera.far) / camera.near)
      / Math.log(camera.far / camera.near) * 2 - 1 + offset, -1, 1
  );
  const vertex = (target, x, y, depth, color, offset) => target.push(
    x / Math.max(1, camera.width) * 2 - 1,
    1 - y / Math.max(1, camera.height) * 2,
    depthNdc(depth, offset), ...color
  );
  let triangles = 0, triangulationFailures = 0;
  for (const polygon of frame.polygons) {
    const fill = parseColor(polygon.fill);
    const mesh = triangulate(polygon.points);
    if (!mesh.complete) triangulationFailures += 1;
    triangles += mesh.triangles.length;
    const target = fill[3] >= .995 ? opaque : [];
    const offset = -clamp(Number(polygon.layer) || 0, -.25, .25) * 1e-3;
    for (const indices of mesh.triangles) {
      for (const i of indices) {
        const point = mesh.points[i];
        vertex(target, point.x, point.y, point.depth, fill, offset);
      }
    }
    if (fill[3] < .995) translucentRecords.push({ depth: polygon.depth, vertices: target });
    if (!polygon.stroke || polygon.lineWidth <= 0) continue;
    const stroke = parseColor(polygon.stroke);
    for (let i = 0; i < polygon.points.length; i += 1) {
      const a = polygon.points[i], b = polygon.points[(i + 1) % polygon.points.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < .01) continue;
      const nx = -dy / length * polygon.lineWidth / 2;
      const ny = dx / length * polygon.lineWidth / 2;
      const corners = [
        [a.x + nx, a.y + ny, a.depth], [b.x + nx, b.y + ny, b.depth],
        [b.x - nx, b.y - ny, b.depth], [a.x - nx, a.y - ny, a.depth]
      ];
      for (const index of [0, 1, 2, 0, 2, 3]) {
        vertex(strokes, ...corners[index], stroke, -2e-6);
      }
    }
  }
  translucentRecords.sort((a, b) => b.depth - a.depth).forEach(record => {
    for (const value of record.vertices) translucent.push(value);
  });
  return { opaque, translucent, strokes, triangles, triangulationFailures };
}

export { triangulate };

