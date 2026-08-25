"use strict";

(function universalModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PontoonDecomposition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPontoonDecomposition() {
  const EPSILON = 1e-9;

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function distance(first, second) {
    return Math.hypot(first.east - second.east, first.north - second.north);
  }

  function dot(first, second) {
    return first.east * second.east + first.north * second.north;
  }

  function normalize(vector) {
    const length = Math.hypot(vector.east, vector.north);
    return length > EPSILON
      ? { east: vector.east / length, north: vector.north / length }
      : { east: 1, north: 0 };
  }

  function perpendicular(vector) {
    return { east: -vector.north, north: vector.east };
  }

  function project(point, origin, axis) {
    return (
      (point.east - origin.east) * axis.east
      + (point.north - origin.north) * axis.north
    );
  }

  function fromAxes(origin, axis, transverse, longitudinal, lateral) {
    return {
      east: origin.east + axis.east * longitudinal + transverse.east * lateral,
      north: origin.north + axis.north * longitudinal + transverse.north * lateral
    };
  }

  function polylineLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distance(points[index - 1], points[index]);
    }
    return total;
  }

  function signedArea(points) {
    let twiceArea = 0;
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      twiceArea += points[index].east * next.north - next.east * points[index].north;
    }
    return twiceArea / 2;
  }

  function closedPoints(points, tolerance = 1.2) {
    return points.length >= 4 && distance(points[0], points[points.length - 1]) <= tolerance;
  }

  function withoutClosingPoint(points, tolerance = 1.2) {
    const result = clone(points || []);
    if (result.length > 2 && distance(result[0], result[result.length - 1]) <= tolerance) {
      result.pop();
    }
    return result;
  }

  function quantile(values, ratio) {
    if (!values.length) return 0;
    const sorted = [...values].sort((first, second) => first - second);
    const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * ratio));
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const fraction = position - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
  }

  function principalAxis(points) {
    const origin = {
      east: points.reduce((sum, point) => sum + point.east, 0) / Math.max(1, points.length),
      north: points.reduce((sum, point) => sum + point.north, 0) / Math.max(1, points.length)
    };
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (const point of points) {
      const east = point.east - origin.east;
      const north = point.north - origin.north;
      xx += east * east;
      xy += east * north;
      yy += north * north;
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    let axis = { east: Math.cos(angle), north: Math.sin(angle) };
    if (axis.east < -EPSILON || (Math.abs(axis.east) <= EPSILON && axis.north < 0)) {
      axis = { east: -axis.east, north: -axis.north };
    }
    return { origin, axis, transverse: perpendicular(axis) };
  }

  function rectangleFromEndpoints(start, end, width, type, sourceIndices) {
    const length = distance(start, end);
    return {
      type,
      center: {
        east: (start.east + end.east) / 2,
        north: (start.north + end.north) / 2
      },
      length,
      width,
      heading: Math.atan2(end.north - start.north, end.east - start.east),
      height: 0.5,
      vertical: {
        datum: "waterline",
        mode: "floating",
        baseZ: 0,
        topZ: 0.5,
        deckZ: 0.5
      },
      endpoints: { start: clone(start), end: clone(end) },
      sourceIndices: [...new Set(sourceIndices)].sort((first, second) => first - second)
    };
  }

  function candidateEndpoints(candidate) {
    const points = candidate.points || [];
    return points.length ? [points[0], points[points.length - 1]] : [];
  }

  function distancePointToSegment(point, start, end) {
    const east = end.east - start.east;
    const north = end.north - start.north;
    const denominator = east * east + north * north || 1;
    const ratio = Math.max(0, Math.min(1, (
      (point.east - start.east) * east
      + (point.north - start.north) * north
    ) / denominator));
    return distance(point, {
      east: start.east + east * ratio,
      north: start.north + north * ratio
    });
  }

  function connectedComponent(candidates, targetIndex, tolerance = 1.5) {
    const eligible = candidates
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => (
        candidate?.tags?.man_made === "pier"
        && ["pontoon", "catway"].includes(candidate.candidateType)
        && Array.isArray(candidate.points)
        && candidate.points.length >= 2
      ));
    const byIndex = new Map(eligible.map(item => [item.index, item]));
    if (!byIndex.has(targetIndex)) return [];
    const cellSize = Math.max(0.5, tolerance * 2);
    const cells = new Map();
    const segments = [];
    const addToCell = (x, y, segmentIndex) => {
      const key = `${x}:${y}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(segmentIndex);
    };
    for (const item of eligible) {
      for (let index = 1; index < item.candidate.points.length; index += 1) {
        const start = item.candidate.points[index - 1];
        const end = item.candidate.points[index];
        const segmentIndex = segments.length;
        segments.push({ start, end, candidateIndex: item.index });
        const minimumX = Math.floor((Math.min(start.east, end.east) - tolerance) / cellSize);
        const maximumX = Math.floor((Math.max(start.east, end.east) + tolerance) / cellSize);
        const minimumY = Math.floor((Math.min(start.north, end.north) - tolerance) / cellSize);
        const maximumY = Math.floor((Math.max(start.north, end.north) + tolerance) / cellSize);
        for (let x = minimumX; x <= maximumX; x += 1) {
          for (let y = minimumY; y <= maximumY; y += 1) addToCell(x, y, segmentIndex);
        }
      }
    }
    const adjacency = new Map(eligible.map(item => [item.index, new Set()]));
    for (const item of eligible) {
      for (const endpoint of candidateEndpoints(item.candidate)) {
        const x = Math.floor(endpoint.east / cellSize);
        const y = Math.floor(endpoint.north / cellSize);
        for (const segmentIndex of cells.get(`${x}:${y}`) || []) {
          const segment = segments[segmentIndex];
          if (
            segment.candidateIndex === item.index
            || distancePointToSegment(endpoint, segment.start, segment.end) > tolerance
          ) continue;
          adjacency.get(item.index).add(segment.candidateIndex);
          adjacency.get(segment.candidateIndex).add(item.index);
        }
      }
    }
    const queue = [targetIndex];
    const visited = new Set(queue);
    while (queue.length) {
      const currentIndex = queue.shift();
      for (const neighbour of adjacency.get(currentIndex) || []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
    return [...visited]
      .sort((first, second) => first - second)
      .map(index => ({ index, candidate: candidates[index] }));
  }

  function simpleAreaRectangle(points) {
    const clean = withoutClosingPoint(points);
    if (clean.length < 4) return false;
    const axes = principalAxis(clean);
    const longitudinal = clean.map(point => project(point, axes.origin, axes.axis));
    const lateral = clean.map(point => project(point, axes.origin, axes.transverse));
    const length = Math.max(...longitudinal) - Math.min(...longitudinal);
    const width = Math.max(...lateral) - Math.min(...lateral);
    const boxArea = length * width;
    const area = Math.abs(signedArea(clean));
    return boxArea > EPSILON && area / boxArea >= 0.78;
  }

  function scanPolygon(points, origin, axis, transverse, longitudinal) {
    const intersections = [];
    for (let index = 0; index < points.length; index += 1) {
      const first = points[index];
      const second = points[(index + 1) % points.length];
      const firstU = project(first, origin, axis);
      const secondU = project(second, origin, axis);
      if (
        longitudinal < Math.min(firstU, secondU) - EPSILON
        || longitudinal > Math.max(firstU, secondU) + EPSILON
        || Math.abs(secondU - firstU) < EPSILON
      ) continue;
      const ratio = (longitudinal - firstU) / (secondU - firstU);
      if (ratio < -EPSILON || ratio > 1 + EPSILON) continue;
      const point = {
        east: first.east + (second.east - first.east) * ratio,
        north: first.north + (second.north - first.north) * ratio
      };
      intersections.push(project(point, origin, transverse));
    }
    intersections.sort((first, second) => first - second);
    if (intersections.length < 2) return null;
    return {
      minimum: intersections[0],
      maximum: intersections[intersections.length - 1],
      span: intersections[intersections.length - 1] - intersections[0],
      center: (intersections[0] + intersections[intersections.length - 1]) / 2
    };
  }

  function polygonProposal(candidate, targetIndex, options) {
    const points = withoutClosingPoint(candidate.points, options.snapTolerance);
    if (simpleAreaRectangle(points)) {
      return {
        available: false,
        reason: "Cette emprise est déjà assimilable à un rectangle.",
        diagnostics: { method: "area-profile", simple: true }
      };
    }
    const axes = principalAxis(points);
    const values = points.map(point => project(point, axes.origin, axes.axis));
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const span = maximum - minimum;
    if (span < 3) {
      return {
        available: false,
        reason: "L’emprise est trop petite pour être découpée de façon fiable.",
        diagnostics: { method: "area-profile", simple: false }
      };
    }
    const sampleCount = Math.max(40, Math.min(500, Math.ceil(span / 0.35)));
    const step = span / sampleCount;
    const samples = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const u = minimum + step * (index + 0.5);
      const section = scanPolygon(points, axes.origin, axes.axis, axes.transverse, u);
      if (section && section.span > 0.15) samples.push({ u, ...section });
    }
    const baseWidth = quantile(samples.map(sample => sample.span), 0.28);
    const baseSamples = samples.filter(sample => sample.span <= baseWidth * 1.45);
    const centerLateral = quantile(
      (baseSamples.length ? baseSamples : samples).map(sample => sample.center),
      0.5
    );
    const branchThreshold = Math.max(baseWidth * 1.75, baseWidth + 1.2);
    const runs = [];
    let current = [];
    for (const sample of samples) {
      const extension = Math.max(
        centerLateral - sample.minimum,
        sample.maximum - centerLateral
      );
      const isBranch = sample.span >= branchThreshold && extension >= baseWidth * 1.1;
      if (isBranch) current.push(sample);
      else if (current.length) {
        runs.push(current);
        current = [];
      }
    }
    if (current.length) runs.push(current);
    const filteredRuns = runs.filter(run => run.length * step >= Math.max(0.35, baseWidth * 0.22));
    if (!filteredRuns.length) {
      return {
        available: false,
        reason: "La forme est complexe, mais aucun doigt perpendiculaire fiable n’a été isolé.",
        diagnostics: { method: "area-profile", simple: false, baseWidth }
      };
    }
    const mainStart = fromAxes(
      axes.origin,
      axes.axis,
      axes.transverse,
      minimum,
      centerLateral
    );
    const mainEnd = fromAxes(
      axes.origin,
      axes.axis,
      axes.transverse,
      maximum,
      centerLateral
    );
    const pontoon = rectangleFromEndpoints(
      mainStart,
      mainEnd,
      Math.max(0.75, baseWidth),
      "pontoon",
      [targetIndex]
    );
    const catways = [];
    const continuity = [];
    for (const run of filteredRuns) {
      const rootU = run.reduce((sum, sample) => sum + sample.u, 0) / run.length;
      const minimumV = Math.min(...run.map(sample => sample.minimum));
      const maximumV = Math.max(...run.map(sample => sample.maximum));
      const root = fromAxes(
        axes.origin,
        axes.axis,
        axes.transverse,
        rootU,
        centerLateral
      );
      const branchWidth = Math.max(0.55, run.length * step);
      for (const endV of [minimumV, maximumV]) {
        if (Math.abs(endV - centerLateral) <= baseWidth * 0.72) continue;
        const end = fromAxes(axes.origin, axes.axis, axes.transverse, rootU, endV);
        const catway = rectangleFromEndpoints(root, end, branchWidth, "catway", [targetIndex]);
        if (catway.length < 1.2) continue;
        catways.push(catway);
        continuity.push({
          parentIndex: 0,
          childIndex: catways.length - 1,
          point: clone(root),
          gap: 0
        });
      }
    }
    return {
      available: catways.length > 0,
      reason: `${catways.length} branche(s) perpendiculaire(s) isolée(s) dans l’emprise.`,
      candidateIndices: [targetIndex],
      objects: { pontoons: [pontoon], catways },
      continuity,
      diagnostics: {
        method: "area-profile",
        simple: false,
        baseWidth,
        samples: samples.length,
        branchRuns: filteredRuns.length
      }
    };
  }

  function lineNetworkProposal(component, targetIndex, options) {
    const segments = [];
    for (const { candidate, index } of component) {
      for (let pointIndex = 1; pointIndex < candidate.points.length; pointIndex += 1) {
        const start = candidate.points[pointIndex - 1];
        const end = candidate.points[pointIndex];
        const length = distance(start, end);
        if (length < 0.35) continue;
        segments.push({
          start,
          end,
          length,
          direction: normalize({
            east: end.east - start.east,
            north: end.north - start.north
          }),
          candidateIndex: index,
          width: Number(candidate.tags?.width)
        });
      }
    }
    if (!segments.length) {
      return {
        available: false,
        reason: "Aucune arête exploitable.",
        diagnostics: { method: "line-graph", edges: 0 }
      };
    }
    const longest = [...segments].sort((first, second) => (
      second.length - first.length
      || first.candidateIndex - second.candidateIndex
    ))[0];
    let axis = longest.direction;
    if (axis.east < -EPSILON || (Math.abs(axis.east) <= EPSILON && axis.north < 0)) {
      axis = { east: -axis.east, north: -axis.north };
    }
    const transverse = perpendicular(axis);
    const origin = {
      east: (longest.start.east + longest.end.east) / 2,
      north: (longest.start.north + longest.end.north) / 2
    };
    const mainSegments = segments.filter(segment => (
      Math.abs(dot(segment.direction, axis)) >= 0.82
      && Math.min(
        Math.abs(project(segment.start, origin, transverse)),
        Math.abs(project(segment.end, origin, transverse))
      ) <= options.snapTolerance * 2
    ));
    const mainPoints = mainSegments.flatMap(segment => [segment.start, segment.end]);
    const minimum = Math.min(...mainPoints.map(point => project(point, origin, axis)));
    const maximum = Math.max(...mainPoints.map(point => project(point, origin, axis)));
    const lateralCenter = quantile(
      mainPoints.map(point => project(point, origin, transverse)),
      0.5
    );
    const mainWidthValues = mainSegments.map(segment => segment.width).filter(Number.isFinite);
    const mainWidth = Math.max(0.75, quantile(mainWidthValues, 0.5) || 2);
    const mainStart = fromAxes(origin, axis, transverse, minimum, lateralCenter);
    const mainEnd = fromAxes(origin, axis, transverse, maximum, lateralCenter);
    const pontoon = rectangleFromEndpoints(
      mainStart,
      mainEnd,
      mainWidth,
      "pontoon",
      mainSegments.map(segment => segment.candidateIndex)
    );
    const catways = [];
    const continuity = [];
    for (const segment of segments) {
      if (mainSegments.includes(segment)) continue;
      const alignment = Math.abs(dot(segment.direction, axis));
      if (alignment > 0.62) continue;
      const startV = project(segment.start, origin, transverse) - lateralCenter;
      const endV = project(segment.end, origin, transverse) - lateralCenter;
      const startU = project(segment.start, origin, axis);
      const endU = project(segment.end, origin, axis);
      const rootU = Math.max(minimum, Math.min(maximum, (
        Math.abs(startV) <= Math.abs(endV) ? startU : endU
      )));
      const root = fromAxes(origin, axis, transverse, rootU, lateralCenter);
      const endpoints = [];
      if (startV * endV < 0) {
        endpoints.push(segment.start, segment.end);
      } else {
        endpoints.push(Math.abs(startV) >= Math.abs(endV) ? segment.start : segment.end);
      }
      for (const endpoint of endpoints) {
        const catway = rectangleFromEndpoints(
          root,
          endpoint,
          Math.max(0.5, Number.isFinite(segment.width) ? segment.width : 0.6),
          "catway",
          [segment.candidateIndex]
        );
        if (catway.length < 1.2) continue;
        const duplicate = catways.some(item => (
          distance(item.endpoints.end, catway.endpoints.end) < options.snapTolerance
          && Math.abs(item.heading - catway.heading) < 0.12
        ));
        if (duplicate) continue;
        catways.push(catway);
        continuity.push({
          parentIndex: 0,
          childIndex: catways.length - 1,
          point: clone(root),
          gap: 0
        });
      }
    }
    return {
      available: catways.length > 0,
      reason: catways.length
        ? `${catways.length} branche(s) raccordée(s) à l’axe principal.`
        : "Le réseau est déjà assimilable à un axe rectangulaire simple.",
      candidateIndices: component.map(item => item.index),
      objects: { pontoons: [pontoon], catways },
      continuity,
      diagnostics: {
        method: "line-graph",
        vertices: new Set(segments.flatMap(segment => [
          `${segment.start.east.toFixed(3)}:${segment.start.north.toFixed(3)}`,
          `${segment.end.east.toFixed(3)}:${segment.end.north.toFixed(3)}`
        ])).size,
        edges: segments.length,
        mainEdges: mainSegments.length,
        branchEdges: catways.length
      }
    };
  }

  function proposePontoonDecomposition(candidates, targetIndex, settings = {}) {
    const options = {
      snapTolerance: Math.max(0.1, Number(settings.snapTolerance ?? 1.5))
    };
    const target = candidates?.[targetIndex];
    if (
      !target
      || target.candidateType !== "pontoon"
      || target.tags?.man_made !== "pier"
      || !Array.isArray(target.points)
      || target.points.length < 2
    ) {
      return {
        available: false,
        reason: "La découpe s’applique à un ponton OpenStreetMap sélectionné.",
        diagnostics: { method: "none" }
      };
    }
    const proposal = closedPoints(target.points, options.snapTolerance)
      ? polygonProposal(target, targetIndex, options)
      : lineNetworkProposal(
        connectedComponent(candidates, targetIndex, options.snapTolerance),
        targetIndex,
        options
      );
    if (!proposal.available) return proposal;
    const maximumGap = Math.max(
      0,
      ...(proposal.continuity || []).map(junction => junction.gap)
    );
    return {
      ...proposal,
      continuityValid: maximumGap <= 0.005,
      maximumGap,
      signature: JSON.stringify({
        candidates: proposal.candidateIndices,
        pontoons: proposal.objects.pontoons.map(item => [
          item.center.east,
          item.center.north,
          item.length,
          item.width,
          item.heading
        ]),
        catways: proposal.objects.catways.map(item => [
          item.center.east,
          item.center.north,
          item.length,
          item.width,
          item.heading
        ])
      })
    };
  }

  return Object.freeze({
    distance,
    polylineLength,
    signedArea,
    principalAxis,
    connectedComponent,
    simpleAreaRectangle,
    proposePontoonDecomposition
  });
});
