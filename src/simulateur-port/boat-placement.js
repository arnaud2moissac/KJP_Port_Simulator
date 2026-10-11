"use strict";

(function universalModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KJPBoatPlacement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // These are editor clearances, not simulation coefficients. The live engine
  // is never stepped or reset to inspect a proposed starting pose.
  const EPSILON = 1e-8;
  const MARGIN = .002;

  const cross = (a, b, c) => (b.east - a.east) * (c.north - a.north) - (b.north - a.north) * (c.east - a.east);
  function convexHull(points) {
    const sorted = points.slice().sort((a, b) => a.east - b.east || a.north - b.north);
    const half = list => {
      const result = [];
      for (const p of list) {
        while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], p) <= 0) result.pop();
        result.push(p);
      }
      return result.slice(0, -1);
    };
    return [...half(sorted), ...half(sorted.slice().reverse())];
  }
  const signedArea = points => points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.east * q.north - q.east * p.north;
  }, 0) / 2;
  function intersectionArea(subject, clip) {
    let output = subject;
    const orientation = Math.sign(signedArea(clip)) || 1;
    for (let i = 0; i < clip.length && output.length; i++) {
      const a = clip[i], b = clip[(i + 1) % clip.length], input = output;
      output = [];
      let previous = input[input.length - 1], previousSide = orientation * cross(a, b, previous);
      for (const p of input) {
        const side = orientation * cross(a, b, p);
        if ((side >= 0) !== (previousSide >= 0)) {
          const t = previousSide / (previousSide - side);
          output.push({ east: previous.east + (p.east - previous.east) * t,
            north: previous.north + (p.north - previous.north) * t });
        }
        if (side >= 0) output.push(p);
        previous = p; previousSide = side;
      }
    }
    return Math.abs(signedArea(output));
  }
  function circlePoints(center, radius) {
    return Array.from({ length: 32 }, (_, i) => ({ east: center.east + Math.cos(i * Math.PI / 16) * radius,
      north: center.north + Math.sin(i * Math.PI / 16) * radius }));
  }

  function createController({ physics, profile, obstacles = {} }) {
    const index = physics.buildObstacleIndex({ rectangles: [], polylines: [], polygons: [],
      boats: [], circles: [], ...obstacles });
    // Each boundary segment is convex. Its supporting contact plane can be
    // used for a directional sweep without skipping a concave quay's next arm.
    const boundaries = [];
    for (const item of obstacles.polylines || []) {
      for (let i = 1; i < item.points.length; i++) {
        boundaries.push({ ...item, points: [item.points[i - 1], item.points[i]] });
      }
    }
    for (const item of obstacles.polygons || []) {
      for (let i = 0; i < item.points.length; i++) {
        boundaries.push({ ...item, width: 0, points: [item.points[i], item.points[(i + 1) % item.points.length]] });
      }
    }
    // Segment IDs stay internal to the index; feedback uses the source object.
    const sweepIndex = physics.buildObstacleIndex({
      rectangles: obstacles.rectangles || [], boats: obstacles.boats || [], circles: obstacles.circles || [],
      polygons: [], polylines: boundaries.map((item, i) => ({ ...item, sourceId: item.id, id: "placement-edge-" + i }))
    });
    const hull = profile.contacts.hullEnvelope.map(p => ({
      x: p.position.x, y: p.position.y, radius: p.radius
    })).sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
    const probes = profile.contacts.fenders.map(p => ({
      x: p.x, y: p.y, radius: profile.contacts.fenderRadius
    }));
    const footprintLocal = convexHull([...hull, ...probes].flatMap(p => circlePoints({ east: p.x, north: p.y }, p.radius)));
    const obstaclePolygons = new Map();
    function polygonsFor(record) {
      if (obstaclePolygons.has(record.key)) return obstaclePolygons.get(record.key);
      const item = record.item;
      let polygons;
      if (record.kind === "polygon") polygons = [item.points];
      else if (record.kind === "circle") polygons = [circlePoints(item, item.radius)];
      else if (record.kind === "rectangle") polygons = [[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => (
        Number.isFinite(item.heading) ? physics.localPointToWorld(item, x * item.width / 2, y * item.height / 2)
          : { east: item.east + x * item.width / 2, north: item.north + y * item.height / 2 }
      ))];
      else if (record.kind === "boat") {
        const half = Math.max(.2, (item.length - item.beam) / 2);
        polygons = [convexHull([-1, 1].flatMap(sign => circlePoints(physics.localPointToWorld(item, half * sign, 0), item.beam / 2)))];
      } else {
        polygons = item.points.map(p => circlePoints(p, item.width / 2));
        for (let i = 1; i < item.points.length; i++) {
          const a = item.points[i - 1], b = item.points[i], length = Math.hypot(b.east - a.east, b.north - a.north) || 1;
          const east = -(b.north - a.north) * item.width / (length * 2);
          const north = (b.east - a.east) * item.width / (length * 2);
          polygons.push([{ east: a.east + east, north: a.north + north }, { east: b.east + east, north: b.north + north },
            { east: b.east - east, north: b.north - north }, { east: a.east - east, north: a.north - north }]);
        }
      }
      obstaclePolygons.set(record.key, polygons);
      return polygons;
    }
    const recordsById = new Map(index.records.map(r => [r.item.id, r]));
    // Join the physical envelope samples for placement: a thin imported
    // obstacle must not pass through the gaps between discrete contact probes.
    hull.forEach((a, i) => {
      const b = hull[(i + 1) % hull.length];
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / .15));
      for (let j = 0; j < count; j++) {
        const t = j / count;
        probes.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
          radius: a.radius + (b.radius - a.radius) * t });
      }
    });
    const reach = Math.max(...probes.map(p => Math.hypot(p.x, p.y) + p.radius));
    const primitives = {
      rectangle: physics.pointRectContact, polyline: physics.pointPolylineContact,
      polygon: physics.pointPolygonContact, circle: physics.pointCircleContact,
      boat: physics.pointBoatContact
    };
    function inspect(pose) {
      if (![pose.east, pose.north, pose.heading].every(Number.isFinite)) {
        return { valid: false, clearance: -Infinity, blockers: [], penetration: Infinity };
      }
      // The 3x3-cell query guarantees all other obstacles are at least one
      // cell away. Cap advances below that bound, including empty water.
      let clearance = index.cellSize / 2;
      const blockers = new Map();
      let nearest = null;
      for (const sample of probes) {
        const point = physics.localPointToWorld(pose, sample.x, sample.y);
        for (const record of physics.queryObstacleIndex(index, point.east, point.north)) {
          const hit = primitives[record.kind](point.east, point.north, record.item);
          if (record.kind === "rectangle" && !physics.isContactSurfaceEnabled(hit, record.item)) {
            // Hidden joins aren't blockers, but cannot justify skipping a
            // later exposed face of the same rectangle.
            if (hit.distance < sample.radius + .05) clearance = Math.min(clearance, .025);
            continue;
          }
          const gap = hit.distance - sample.radius;
          const contact = { id: record.item.id, east: point.east, north: point.north,
            normalEast: hit.normalEast, normalNorth: hit.normalNorth, penetration: Math.max(0, -gap) };
          if (gap < clearance) { clearance = gap; nearest = contact; }
          if (gap < -EPSILON && (!blockers.has(contact.id)
            || blockers.get(contact.id).penetration < contact.penetration)) blockers.set(contact.id, contact);
        }
      }
      // Catch an obstacle wholly enclosed by the hull at an imported start.
      const outline = hull.map(p => physics.localPointToWorld(pose, p.x, p.y));
      for (const record of physics.queryObstacleIndex(index, pose.east, pose.north)) {
        const p = record.item.points?.[0] || record.item;
        if (!Number.isFinite(p.east) || !Number.isFinite(p.north)
          || (record.kind === "rectangle" && record.item.hiddenFaces?.length)) continue;
        if (physics.pointInPolygon(p.east, p.north, outline)) {
          const hit = physics.pointPolygonContact(p.east, p.north, { points: outline });
          const contact = { id: record.item.id, east: p.east, north: p.north,
            normalEast: -hit.normalEast, normalNorth: -hit.normalNorth, penetration: Math.max(EPSILON * 2, -hit.distance) };
          if (!blockers.has(contact.id) || blockers.get(contact.id).penetration < contact.penetration) blockers.set(contact.id, contact);
          clearance = Math.min(clearance, -contact.penetration);
          nearest = contact;
        }
      }
      const footprint = footprintLocal.map(p => physics.localPointToWorld(pose, p.east, p.north));
      for (const contact of blockers.values()) {
        // For an occupied start, intersection area is a monotone escape
        // measure. Nearest-face penetration flips at a thin quay's midline
        // and would incorrectly forbid withdrawing an already embedded bow.
        contact.overlap = polygonsFor(recordsById.get(contact.id)).reduce((sum, polygon) => sum + intersectionArea(polygon, footprint), 0);
      }
      return { valid: blockers.size === 0, clearance, nearest,
        blockers: [...blockers.values()], penetration: Math.max(0, ...[...blockers.values()].map(p => p.penetration)) };
    }
    function sweep(from, target) {
      if (![target.east, target.north, target.heading].every(Number.isFinite)) {
        return { pose: { ...from }, blocked: true, inspection: inspect(from), contact: null };
      }
      const angle = physics.wrapAngle(target.heading - from.heading);
      const travel = Math.hypot(target.east - from.east, target.north - from.north) + reach * Math.abs(angle);
      if (travel < EPSILON) return { pose: { ...from }, blocked: false, inspection: inspect(from), contact: null };
      const at = t => ({ east: from.east + (target.east - from.east) * t,
        north: from.north + (target.north - from.north) * t,
        heading: physics.wrapAngle(from.heading + angle * t) });
      let t = 0, pose = { ...from }, inspection = inspect(pose);
      const admissible = next => inspection.valid ? next.valid : next.blockers.every(p => {
        const previous = inspection.blockers.find(b => b.id === p.id);
        return previous && p.overlap <= previous.overlap + EPSILON;
      });
      for (let iteration = 0; iteration < 4096 && t < 1; iteration++) {
        const advance = inspection.valid
          ? Math.max(.0005, (inspection.clearance - MARGIN) * .8) : .025;
        const nextT = Math.min(1, t + advance / travel);
        const next = inspect(at(nextT));
        if (!admissible(next)) {
          let low = t, high = nextT;
          for (let i = 0; i < 18; i++) {
            const mid = (low + high) / 2;
            if (admissible(inspect(at(mid)))) low = mid; else high = mid;
          }
          pose = at(low);
          return { pose, blocked: true, inspection: inspect(pose), contact: next.nearest || next.blockers[0] };
        }
        t = nextT; pose = at(t); inspection = next;
      }
      return { pose, blocked: t < 1, inspection, contact: t < 1 ? inspection.nearest : null };
    }
    function translationContacts(pose, delta) {
      const length = Math.hypot(delta.east, delta.north);
      let fraction = Math.min(1, (sweepIndex.cellSize / 2) / Math.max(EPSILON, length));
      let contact = null;
      const normals = [];
      for (const sample of probes) {
        const point = physics.localPointToWorld(pose, sample.x, sample.y);
        for (const record of physics.queryObstacleIndex(sweepIndex, point.east, point.north)) {
          const hit = primitives[record.kind](point.east, point.north, record.item);
          if (record.kind === "rectangle" && !physics.isContactSurfaceEnabled(hit, record.item)) {
            if (hit.distance < sample.radius + .05) fraction = Math.min(fraction, .025 / length);
            continue;
          }
          const gap = hit.distance - sample.radius;
          const candidate = { id: record.item.sourceId || record.item.id,
            east: point.east, north: point.north, normalEast: hit.normalEast, normalNorth: hit.normalNorth };
          if (gap <= MARGIN + .001 && !normals.some(n => n.normalEast * hit.normalEast + n.normalNorth * hit.normalNorth > .999999)) {
            normals.push(candidate);
          }
          const closing = -(delta.east * hit.normalEast + delta.north * hit.normalNorth);
          if (closing <= EPSILON) continue;
          // Convex supporting planes bound inward motion, while a tangent
          // or outward drag can advance without thousands of tiny steps.
          const limit = Math.max(0, gap - MARGIN) / closing;
          if (limit < fraction) { fraction = limit; contact = candidate; }
        }
      }
      return { fraction, contact, normals };
    }
    function sweepTranslation(from, target) {
      let pose = { ...from }, inspection = inspect(pose);
      if (!inspection.valid) return { ...sweep(from, target), normals: [] };
      for (let iteration = 0; iteration < 256; iteration++) {
        const delta = { east: target.east - pose.east, north: target.north - pose.north };
        if (Math.hypot(delta.east, delta.north) < 1e-6) {
          return { pose, blocked: false, inspection, contact: null, normals: [] };
        }
        const limit = translationContacts(pose, delta);
        if (limit.fraction <= 1e-7) {
          return { pose, blocked: true, inspection, contact: limit.contact, normals: limit.normals };
        }
        const next = { ...pose, east: pose.east + delta.east * limit.fraction,
          north: pose.north + delta.north * limit.fraction };
        const checked = inspect(next);
        if (!checked.valid) {
          // The full envelope also checks contained objects and hidden joins.
          const stopped = sweep(pose, next);
          const active = translationContacts(stopped.pose, delta);
          return { ...stopped, blocked: true, normals: active.normals,
            contact: stopped.contact || active.contact };
        }
        pose = next; inspection = checked;
        if (limit.fraction === 1) return { pose, blocked: false, inspection, contact: null, normals: [] };
      }
      const active = translationContacts(pose, { east: target.east - pose.east, north: target.north - pose.north });
      return { pose, blocked: true, inspection, contact: active.contact || inspection.nearest, normals: active.normals };
    }
    function tangentMovement(delta, normals) {
      // Exact 2-D projection into the feasible contact cone. At a corner,
      // candidates from every contact are checked against every other face.
      const feasible = d => normals.every(n => d.east * n.normalEast + d.north * n.normalNorth >= -EPSILON);
      if (feasible(delta)) return delta;
      let best = { east: 0, north: 0 }, error = delta.east ** 2 + delta.north ** 2;
      for (const n of normals) {
        const inward = delta.east * n.normalEast + delta.north * n.normalNorth;
        const candidate = { east: delta.east - n.normalEast * inward,
          north: delta.north - n.normalNorth * inward };
        const candidateError = (candidate.east - delta.east) ** 2 + (candidate.north - delta.north) ** 2;
        if (feasible(candidate) && candidateError < error) { best = candidate; error = candidateError; }
      }
      return best;
    }
    function move(from, target) {
      if (![target.east, target.north, target.heading].every(Number.isFinite)
        || Math.abs(physics.wrapAngle(target.heading - from.heading)) > EPSILON
        || !inspect(from).valid) return { ...sweep(from, target), sliding: false };
      let pose = { ...from }, destination = { ...target }, blocked = false, sliding = false, contact = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const result = sweepTranslation(pose, destination);
        if (attempt > 0 && Math.hypot(result.pose.east - pose.east, result.pose.north - pose.north) > 1e-6) sliding = true;
        pose = result.pose;
        if (!result.blocked) {
          return { ...result, blocked, sliding,
            contact: blocked ? result.inspection.nearest || contact : null };
        }
        blocked = true; contact = result.contact || contact;
        const residual = { east: destination.east - pose.east, north: destination.north - pose.north };
        const normals = result.normals.length ? result.normals : contact ? [contact] : [];
        const tangent = tangentMovement(residual, normals);
        if (!normals.length || Math.hypot(tangent.east, tangent.north) < 1e-6
          || Math.hypot(tangent.east - residual.east, tangent.north - residual.north) < 1e-8) break;
        destination = { ...pose, east: pose.east + tangent.east, north: pose.north + tangent.north };
      }
      const inspection = inspect(pose);
      return { pose, blocked, sliding,
        inspection, contact: inspection.nearest || contact };
    }
    return Object.freeze({ inspect, move });
  }
  return Object.freeze({ createController });
});
