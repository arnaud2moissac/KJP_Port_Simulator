(function initPortPhysics(root, factory) {
  const vesselProfiles = (
    typeof module === "object" && module.exports
      ? require("./vessel-profiles.js")
      : root.PortVesselProfiles
  );
  if (!vesselProfiles) {
    throw new Error("Le catalogue de profils bateau doit être chargé avant le moteur physique.");
  }
  const api = factory(vesselProfiles);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortPhysics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPortPhysicsApi(VesselProfiles) {
  "use strict";

  const DEG = Math.PI / 180;
  const KNOT = 0.514444;
  const RHO_WATER = 1025;
  const RHO_AIR = 1.225;
  const MAX_STEP = 1 / 120;
  const EPSILON = 1e-9;
  // Portée opérationnelle de 1,5 m, augmentée de 0,3 m pour absorber le fait
  // que la prise KJP représente le centre de sa boucle sur le ponton.
  const PENDILLE_PICKUP_REACH_M = 1.8;
  const PENDILLE_PICKUP_SPEED_LIMIT_KN = 0.6;
  const PHYSICS_VERSION = "5.2.0";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothstep = (a, b, value) => {
    const t = clamp((value - a) / Math.max(EPSILON, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const wrapAngle = angle => {
    let value = angle;
    while (value >= Math.PI) value -= Math.PI * 2;
    while (value < -Math.PI) value += Math.PI * 2;
    return value;
  };
  const finite = value => Number.isFinite(value) ? value : 0;
  const hypot2 = (x, y) => Math.hypot(x, y);

  function mooringElasticLaw(elasticity, restLength, distance) {
    const length = Math.max(0.05, finite(restLength));
    const extension = Math.max(0, finite(distance) - length);
    const strain = extension / length;
    const workingStrain = Math.max(EPSILON, finite(elasticity?.workingStrain));
    const workingLoadN = Math.max(0, finite(elasticity?.workingLoadN));
    const hardeningGain = Math.max(0, finite(elasticity?.hardeningGain));
    const ratio = strain / workingStrain;
    const hardeningRatio = Math.max(0, ratio - 1);
    const tension = extension > 0
      ? workingLoadN * (ratio + hardeningGain * hardeningRatio ** 3)
      : 0;
    const tangentStiffness = (
      workingLoadN
      / (workingStrain * length)
      * (1 + 3 * hardeningGain * hardeningRatio ** 2)
    );
    const elasticEnergy = extension > 0
      ? workingLoadN * length * workingStrain * (
        0.5 * ratio * ratio
        + hardeningGain * hardeningRatio ** 4 / 4
      )
      : 0;
    return {
      extension,
      strain,
      tension,
      tangentStiffness,
      elasticEnergy,
      workingLoadN,
      workingStrain
    };
  }

  function samplePeriodicCurve(values, origin, angle) {
    const count = values.length;
    if (!count) return 0;
    const period = Math.PI * 2;
    let offset = (angle - origin) % period;
    if (offset < 0) offset += period;
    const coordinate = offset * count / period;
    const index = Math.floor(coordinate);
    const t = coordinate - index;
    const at = item => values[(item % count + count) % count];
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);
    return 0.5 * (
      2 * p1
      + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
    );
  }

  function interpolateCurve(points, coordinate, xKey, yKey) {
    if (!points.length) return 0;
    if (coordinate <= points[0][xKey]) return points[0][yKey];
    for (let index = 1; index < points.length; index += 1) {
      const right = points[index];
      if (coordinate <= right[xKey]) {
        const left = points[index - 1];
        const t = (
          (coordinate - left[xKey])
          / Math.max(EPSILON, right[xKey] - left[xKey])
        );
        return left[yKey] + (right[yKey] - left[yKey]) * t;
      }
    }
    return points[points.length - 1][yKey];
  }

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]));
    }
    return value;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
    return value;
  }

  const DEFAULT_PROFILE = VesselProfiles.DEFAULT_PROFILE;

  function nauticalVectorFromSource(speed, sourceRadians) {
    return {
      east: -Math.sin(sourceRadians) * speed,
      north: -Math.cos(sourceRadians) * speed
    };
  }

  function bodyToWorld(u, v, heading) {
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    return {
      east: u * sin + v * cos,
      north: u * cos - v * sin
    };
  }

  function worldToBody(east, north, heading) {
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    return {
      u: east * sin + north * cos,
      v: east * cos - north * sin
    };
  }

  function localPointToWorld(pose, x, y) {
    const offset = bodyToWorld(x, y, pose.heading);
    return {
      east: pose.east + offset.east,
      north: pose.north + offset.north
    };
  }

  function buildSections(profile) {
    if (Array.isArray(profile.geometry?.hullSections)) {
      return profile.geometry.hullSections.map(section => ({
        x: section.x,
        dx: section.dx,
        shape: section.shape ?? section.breadthFactor
      }));
    }
    const count = 11;
    const length = profile.dimensions.waterline;
    const dx = length / count;
    const shapes = [0.28, 0.51, 0.73, 0.88, 0.97, 1, 0.96, 0.86, 0.70, 0.48, 0.22];
    const stations = [];
    for (let index = 0; index < count; index += 1) {
      const x = -length / 2 + dx * (index + 0.5);
      stations.push({ x, dx, shape: shapes[index] });
    }
    return stations;
  }

  function computeMassMatrix(profileInput = DEFAULT_PROFILE, massOverride) {
    const profile = VesselProfiles.compileVesselProfile(profileInput);
    const mass = Math.max(100, Number(massOverride || profile.inertia.loadedMass));
    const sections = buildSections(profile);
    let addedSway = 0;
    let addedSwayYaw = 0;
    let addedYaw = 0;
    for (const section of sections) {
      const depth = profile.dimensions.canoeDraft * (0.46 + 0.54 * section.shape);
      const dm = (
        RHO_WATER
        * Math.PI
        * depth
        * depth
        * section.dx
        * profile.inertia.sectionAddedMassScale
      );
      addedSway += dm;
      addedSwayYaw += dm * section.x;
      addedYaw += dm * section.x * section.x;
    }
    const addedSurge = mass * profile.inertia.surgeAddedMassRatio;
    const rigidYaw = mass * profile.inertia.yawRadius * profile.inertia.yawRadius;
    const matrix = [
      [mass + addedSurge, 0, 0],
      [0, mass + addedSway, addedSwayYaw],
      [0, addedSwayYaw, rigidYaw + addedYaw]
    ];
    const minor = matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1];
    if (matrix[0][0] <= 0 || matrix[1][1] <= 0 || minor <= 0) {
      throw new Error("La matrice de masse du bateau n'est pas définie positive.");
    }
    return {
      matrix,
      rigid: { surge: mass, sway: mass, yaw: rigidYaw },
      added: {
        surge: addedSurge,
        sway: addedSway,
        swayYaw: addedSwayYaw,
        yaw: addedYaw
      },
      sections
    };
  }

  function solveMass(matrix, vector) {
    const surge = vector[0] / matrix[0][0];
    const a = matrix[1][1];
    const b = matrix[1][2];
    const d = matrix[2][2];
    const determinant = a * d - b * b;
    if (Math.abs(determinant) < EPSILON) throw new Error("Matrice de masse singulière.");
    return [
      surge,
      (d * vector[1] - b * vector[2]) / determinant,
      (-b * vector[1] + a * vector[2]) / determinant
    ];
  }

  function massMatrixIsPositiveDefinite(matrix) {
    const symmetric = (
      Math.abs(matrix[0][1] - matrix[1][0]) < 1e-12
      && Math.abs(matrix[0][2] - matrix[2][0]) < 1e-12
      && Math.abs(matrix[1][2] - matrix[2][1]) < 1e-12
    );
    const second = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
    const determinant = matrix[0][0] * (
      matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]
    );
    return symmetric && matrix[0][0] > 0 && second > 0 && determinant > 0;
  }

  function createAccumulator(relativeVelocity) {
    return {
      X: 0,
      Y: 0,
      N: 0,
      parts: [],
      add(source, X, Y, x = 0, y = 0, extraN = 0, category = "hydrodynamic") {
        if (![X, Y, x, y, extraN].every(Number.isFinite)) return;
        const moment = x * Y - y * X + extraN;
        const localU = relativeVelocity.u - relativeVelocity.r * y;
        const localV = relativeVelocity.v + relativeVelocity.r * x;
        const power = X * localU + Y * localV + extraN * relativeVelocity.r;
        this.X += X;
        this.Y += Y;
        this.N += moment;
        this.parts.push({
          source,
          X,
          Y,
          N: moment,
          applicationPoint: { x, y },
          power,
          category
        });
      }
    };
  }

  function foilModel(input) {
    const {
      u,
      v,
      delta = 0,
      area,
      aspectRatio,
      efficiency,
      cd0,
      normalCd90,
      stallStart = 24 * DEG,
      stallEnd = 52 * DEG,
      density = RHO_WATER
    } = input;
    const speed = Math.hypot(u, v);
    if (speed < 1e-5 || area <= 0) {
      return { X: 0, Y: 0, normal: 0, drag: 0, alpha: 0, speed };
    }
    const chordX = Math.cos(delta);
    const chordY = Math.sin(delta);
    const normalX = -chordY;
    const normalY = chordX;
    const normalVelocity = u * normalX + v * normalY;
    const sinAlpha = clamp(normalVelocity / speed, -1, 1);
    const alpha = Math.asin(sinAlpha);
    const slope = 2 * Math.PI * aspectRatio / Math.max(0.1, aspectRatio + 2);
    const attached = clamp(slope * sinAlpha, -1.14, 1.14);
    const separated = normalCd90 * sinAlpha * Math.abs(sinAlpha);
    const blend = smoothstep(
      Math.sin(stallStart),
      Math.sin(stallEnd),
      Math.abs(sinAlpha)
    );
    const normalCoefficient = attached * (1 - blend) + separated * blend;
    const induced = normalCoefficient * normalCoefficient / (
      Math.PI * Math.max(0.2, aspectRatio) * Math.max(0.2, efficiency)
    );
    const dragCoefficient = cd0 + induced + 0.055 * Math.pow(Math.abs(sinAlpha), 3);
    const dynamic = 0.5 * density * area * speed * speed;
    const normalForce = -dynamic * normalCoefficient;
    const drag = dynamic * dragCoefficient;
    const X = normalForce * normalX - drag * u / speed;
    const Y = normalForce * normalY - drag * v / speed;
    return {
      X,
      Y,
      normal: normalForce,
      drag,
      alpha,
      speed,
      coefficients: { normal: normalCoefficient, drag: dragCoefficient }
    };
  }

  function propellerModel(input, profileInput = DEFAULT_PROFILE) {
    const propeller = (
      Number.isFinite(profileInput?.diameter)
        ? profileInput
        : VesselProfiles.compileVesselProfile(profileInput).propulsion
    );
    const n = finite(input.shaftRps);
    const advance = finite(input.advanceSpeed);
    const diameter = propeller.diameter;
    const nAbs = Math.abs(n);
    const diskArea = Math.PI * diameter * diameter / 4;
    const advanceRatio = nAbs > 0.01
      ? clamp(advance / (nAbs * diameter), -12, 12)
      : 0;
    const tangentialSpeed = 0.7 * Math.PI * n * diameter;
    const referenceSpeedSquared = advance * advance + tangentialSpeed * tangentialSpeed;
    const hydrodynamicPitchAngle = referenceSpeedSquared > EPSILON
      ? Math.atan2(advance, tangentialSpeed)
      : 0;
    const table = propeller.fourQuadrant;
    const rawThrustCoefficient = referenceSpeedSquared > EPSILON
      ? samplePeriodicCurve(
        table.thrust,
        table.betaOriginRad,
        hydrodynamicPitchAngle
      )
      : 0;
    const rawTorqueCoefficient = referenceSpeedSquared > EPSILON
      ? samplePeriodicCurve(
        table.torque,
        table.betaOriginRad,
        hydrodynamicPitchAngle
      )
      : 0;
    const thrustCoefficient = clamp(
      rawThrustCoefficient,
      -propeller.safety.maximumThrustCoefficient,
      propeller.safety.maximumThrustCoefficient
    );
    const torqueCoefficient = clamp(
      rawTorqueCoefficient,
      -propeller.safety.maximumTorqueCoefficient,
      propeller.safety.maximumTorqueCoefficient
    );
    const dynamic = 0.5 * RHO_WATER * referenceSpeedSquared * diskArea;
    const thrust = dynamic * thrustCoefficient;
    const torque = dynamic * diameter * torqueCoefficient;
    let inducedVelocity = 0;
    if (Math.abs(thrust) > EPSILON) {
      inducedVelocity = Math.sign(thrust) * (
        Math.sqrt(
          Math.max(0, advance * advance + 2 * Math.abs(thrust) / (RHO_WATER * diskArea))
        )
        - Math.abs(advance)
      );
    }
    const quadrant = n >= 0
      ? (advance >= 0 ? "ahead" : "crash-ahead")
      : (advance > 0 ? "crash-back" : "backing");
    return {
      thrust,
      torque,
      inducedVelocity,
      advanceRatio,
      hydrodynamicPitchAngle,
      thrustCoefficient,
      torqueCoefficient,
      rawThrustCoefficient,
      rawTorqueCoefficient,
      safetyLimitActive: (
        Math.abs(rawThrustCoefficient - thrustCoefficient) > 1e-10
        || Math.abs(rawTorqueCoefficient - torqueCoefficient) > 1e-10
      ),
      quadrant,
      shaftRps: n,
      diskArea,
      shaftPower: torque * n * Math.PI * 2,
      usefulPower: thrust * advance
    };
  }

  function pointRectContact(east, north, rectangle) {
    const halfWidth = rectangle.width / 2;
    const halfHeight = rectangle.height / 2;
    const dx = east - rectangle.east;
    const dy = north - rectangle.north;
    const oriented = Number.isFinite(rectangle.heading);
    const local = oriented
      ? worldToBody(dx, dy, rectangle.heading)
      : { u: dx, v: dy };
    const closestX = clamp(local.u, -halfWidth, halfWidth);
    const closestY = clamp(local.v, -halfHeight, halfHeight);
    let normalU = local.u - closestX;
    let normalV = local.v - closestY;
    let distance = Math.hypot(normalU, normalV);
    let face;
    if (distance < 1e-8) {
      const gapEast = halfWidth - Math.abs(local.u);
      const gapNorth = halfHeight - Math.abs(local.v);
      if (gapEast < gapNorth) {
        normalU = local.u >= 0 ? 1 : -1;
        normalV = 0;
        face = normalU > 0 ? "x1" : "x0";
        distance = -gapEast;
      } else {
        normalU = 0;
        normalV = local.v >= 0 ? 1 : -1;
        face = normalV > 0 ? "y1" : "y0";
        distance = -gapNorth;
      }
    } else {
      normalU /= distance;
      normalV /= distance;
      face = Math.abs(normalU) >= Math.abs(normalV)
        ? (normalU > 0 ? "x1" : "x0")
        : (normalV > 0 ? "y1" : "y0");
    }
    const worldNormal = oriented
      ? bodyToWorld(normalU, normalV, rectangle.heading)
      : { east: normalU, north: normalV };
    return {
      distance,
      normalEast: worldNormal.east,
      normalNorth: worldNormal.north,
      face
    };
  }

  function isContactSurfaceEnabled(hit, obstacle) {
    return !hit.face || !(obstacle.hiddenFaces || []).includes(hit.face);
  }

  function pointPolylineContact(east, north, polyline) {
    const points = polyline.points || [];
    let closest = null;
    let minimum = Infinity;
    let segmentNormal = { east: 1, north: 0 };
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const point = closestPointOnSegment(
        { east, north },
        { east: start.east, north: start.north },
        { east: end.east, north: end.north }
      );
      const distance = Math.hypot(east - point.east, north - point.north);
      if (distance < minimum) {
        minimum = distance;
        closest = point;
        const dx = end.east - start.east;
        const dy = end.north - start.north;
        const length = Math.hypot(dx, dy) || 1;
        segmentNormal = { east: -dy / length, north: dx / length };
      }
    }
    if (!closest) return { distance: Infinity, normalEast: 1, normalNorth: 0 };
    let normalEast = east - closest.east;
    let normalNorth = north - closest.north;
    const centerDistance = Math.hypot(normalEast, normalNorth);
    if (centerDistance > 1e-8) {
      normalEast /= centerDistance;
      normalNorth /= centerDistance;
    } else {
      normalEast = segmentNormal.east;
      normalNorth = segmentNormal.north;
    }
    return {
      distance: centerDistance - Math.max(0, finite(polyline.width)) / 2,
      normalEast,
      normalNorth
    };
  }

  function pointInPolygon(east, north, points) {
    let inside = false;
    for (let first = 0, second = points.length - 1; first < points.length; second = first++) {
      const a = points[first];
      const b = points[second];
      const intersects = (
        (a.north > north) !== (b.north > north)
        && east < (
          (b.east - a.east) * (north - a.north)
          / ((b.north - a.north) || EPSILON)
          + a.east
        )
      );
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointPolygonContact(east, north, polygon) {
    const points = polygon.points || [];
    if (points.length < 3) return { distance: Infinity, normalEast: 1, normalNorth: 0 };
    let closest = null;
    let minimum = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const candidate = closestPointOnSegment({ east, north }, start, end);
      const distance = Math.hypot(east - candidate.east, north - candidate.north);
      if (distance < minimum) {
        minimum = distance;
        closest = candidate;
      }
    }
    const inside = pointInPolygon(east, north, points);
    let normalEast = inside ? closest.east - east : east - closest.east;
    let normalNorth = inside ? closest.north - north : north - closest.north;
    let distance = Math.hypot(normalEast, normalNorth);
    if (distance < 1e-8) {
      normalEast = 1;
      normalNorth = 0;
    } else {
      normalEast /= distance;
      normalNorth /= distance;
    }
    return { distance: inside ? -distance : distance, normalEast, normalNorth };
  }

  function closestPointOnSegment(point, start, end) {
    const dx = end.east - start.east;
    const dy = end.north - start.north;
    const denominator = dx * dx + dy * dy || 1;
    const t = clamp(
      ((point.east - start.east) * dx + (point.north - start.north) * dy) / denominator,
      0,
      1
    );
    return { east: start.east + dx * t, north: start.north + dy * t };
  }

  function pointBoatContact(east, north, boat) {
    const halfSegment = Math.max(0.2, (boat.length - boat.beam) / 2);
    const forward = bodyToWorld(1, 0, boat.heading);
    const start = {
      east: boat.east - forward.east * halfSegment,
      north: boat.north - forward.north * halfSegment
    };
    const end = {
      east: boat.east + forward.east * halfSegment,
      north: boat.north + forward.north * halfSegment
    };
    const closest = closestPointOnSegment({ east, north }, start, end);
    let normalEast = east - closest.east;
    let normalNorth = north - closest.north;
    const centerDistance = Math.hypot(normalEast, normalNorth);
    if (centerDistance > 1e-8) {
      normalEast /= centerDistance;
      normalNorth /= centerDistance;
    } else {
      normalEast = Math.cos(boat.heading);
      normalNorth = -Math.sin(boat.heading);
    }
    return {
      distance: centerDistance - boat.beam / 2,
      normalEast,
      normalNorth
    };
  }

  function pointCircleContact(east, north, circle) {
    const deltaEast = east - circle.east;
    const deltaNorth = north - circle.north;
    const centerDistance = Math.hypot(deltaEast, deltaNorth);
    return {
      distance: centerDistance - Math.max(0, finite(circle.radius)),
      normalEast: centerDistance > 1e-8 ? deltaEast / centerDistance : 1,
      normalNorth: centerDistance > 1e-8 ? deltaNorth / centerDistance : 0
    };
  }

  function obstacleBounds(kind, obstacle) {
    if (kind === "circle") {
      const radius = Math.max(0, finite(obstacle.radius));
      return {
        minEast: obstacle.east - radius,
        maxEast: obstacle.east + radius,
        minNorth: obstacle.north - radius,
        maxNorth: obstacle.north + radius
      };
    }
    if (kind === "rectangle") {
      const heading = Number.isFinite(obstacle.heading) ? obstacle.heading : Math.PI / 2;
      const forward = bodyToWorld(obstacle.width / 2, 0, heading);
      const transverse = bodyToWorld(0, obstacle.height / 2, heading);
      const extentEast = Math.abs(forward.east) + Math.abs(transverse.east);
      const extentNorth = Math.abs(forward.north) + Math.abs(transverse.north);
      return {
        minEast: obstacle.east - extentEast,
        maxEast: obstacle.east + extentEast,
        minNorth: obstacle.north - extentNorth,
        maxNorth: obstacle.north + extentNorth
      };
    }
    if (kind === "boat") {
      const forward = bodyToWorld(obstacle.length / 2, 0, obstacle.heading);
      const transverse = bodyToWorld(0, obstacle.beam / 2, obstacle.heading);
      const extentEast = Math.abs(forward.east) + Math.abs(transverse.east);
      const extentNorth = Math.abs(forward.north) + Math.abs(transverse.north);
      return {
        minEast: obstacle.east - extentEast,
        maxEast: obstacle.east + extentEast,
        minNorth: obstacle.north - extentNorth,
        maxNorth: obstacle.north + extentNorth
      };
    }
    const points = obstacle.points || [];
    const expansion = kind === "polyline" ? Math.max(0, obstacle.width || 0) / 2 : 0;
    return {
      minEast: Math.min(...points.map(point => point.east)) - expansion,
      maxEast: Math.max(...points.map(point => point.east)) + expansion,
      minNorth: Math.min(...points.map(point => point.north)) - expansion,
      maxNorth: Math.max(...points.map(point => point.north)) + expansion
    };
  }

  function buildObstacleIndex(obstacles, cellSize = 30) {
    const cells = new Map();
    const global = [];
    const records = [];
    const addRecords = (kind, items) => {
      for (const item of items) {
        if (item.collision === false) continue;
        const record = {
          key: `${kind}:${item.id}`,
          kind,
          item,
          bounds: obstacleBounds(kind, item)
        };
        records.push(record);
        const minX = Math.floor(record.bounds.minEast / cellSize);
        const maxX = Math.floor(record.bounds.maxEast / cellSize);
        const minY = Math.floor(record.bounds.minNorth / cellSize);
        const maxY = Math.floor(record.bounds.maxNorth / cellSize);
        const count = (maxX - minX + 1) * (maxY - minY + 1);
        if (!Number.isFinite(count) || count > 400) {
          global.push(record);
          continue;
        }
        for (let x = minX; x <= maxX; x += 1) {
          for (let y = minY; y <= maxY; y += 1) {
            const key = `${x}:${y}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(record);
          }
        }
      }
    };
    addRecords("rectangle", obstacles.rectangles);
    addRecords("polyline", obstacles.polylines);
    addRecords("polygon", obstacles.polygons);
    addRecords("boat", obstacles.boats);
    addRecords("circle", obstacles.circles || []);
    return { cellSize, cells, global, records };
  }

  function queryObstacleIndex(index, east, north) {
    const centerX = Math.floor(east / index.cellSize);
    const centerY = Math.floor(north / index.cellSize);
    const found = new Map(index.global.map(record => [record.key, record]));
    for (let x = centerX - 1; x <= centerX + 1; x += 1) {
      for (let y = centerY - 1; y <= centerY + 1; y += 1) {
        for (const record of index.cells.get(`${x}:${y}`) || []) found.set(record.key, record);
      }
    }
    return [...found.values()];
  }

  function classifyImpact(speed) {
    if (speed > 0.4) return "severe";
    if (speed > 0.2) return "warning";
    return "safe";
  }

  function normalizeEnvironment(environment = {}) {
    return {
      windSpeedKn: finite(environment.windSpeedKn),
      windFromDeg: finite(environment.windFromDeg),
      currentSpeedKn: finite(environment.currentSpeedKn),
      currentFromDeg: finite(environment.currentFromDeg),
      propWalk: clamp(
        environment.propWalk === undefined ? 0.6 : finite(environment.propWalk),
        0,
        1
      )
    };
  }

  function createSimulator(options = {}) {
    const profile = VesselProfiles.compileVesselProfile(
      options.profile === undefined ? DEFAULT_PROFILE : options.profile
    );
    const initialCalibration = VesselProfiles.applyCalibrationPatch(
      profile,
      options.calibrationPatch || {}
    );
    let calibration = {
      mass: initialCalibration.massKg,
      windage: initialCalibration.multipliers.windage,
      rudder: initialCalibration.multipliers.rudder,
      lateral: initialCalibration.multipliers.lateral
    };
    let massProperties = computeMassMatrix(profile, calibration.mass);
    let environment = normalizeEnvironment(options.environment);
    let obstacles = {
      rectangles: deepClone(options.obstacles?.rectangles || []),
      polylines: deepClone(options.obstacles?.polylines || []),
      polygons: deepClone(options.obstacles?.polygons || []),
      boats: deepClone(options.obstacles?.boats || []),
      circles: deepClone(options.obstacles?.circles || [])
    };
    let obstacleIndex = buildObstacleIndex(obstacles);
    let state;
    let lastForces = [];
    let lastContactSamples = [];
    let activeContactIds = new Set();
    let pendilleById = new Map();
    let activePendilleIds = new Set();
    let simulationTime = 0;
    const hullPickupOutline = (() => {
      const halfBeam = profile.dimensions.beam / 2;
      const halfLength = profile.dimensions.lengthOverall / 2;
      const sections = [...profile.geometry.hullSections].sort((left, right) => left.x - right.x);
      const starboard = sections.map(section => ({
        east: section.x,
        north: halfBeam * section.breadthFactor
      }));
      const port = [...sections].reverse().map(section => ({
        east: section.x,
        north: -halfBeam * section.breadthFactor
      }));
      return [
        { east: -halfLength, north: 0 },
        ...starboard,
        { east: halfLength, north: 0 },
        ...port
      ];
    })();

    function normalizedMooringElasticity(definition = {}) {
      return {
        ...profile.mooring.elasticity,
        ...(definition.elasticity || {})
      };
    }

    function defaultState() {
      const propulsionUnits = profile.propulsors.map(propulsor => {
        const idleOmega = propulsor.idleRpm * Math.PI * 2 / 60;
        return {
          id: propulsor.id,
          commandActual: 0,
          requestedGear: 0,
          engagedGear: 0,
          gearState: "neutral",
          shiftTimer: 0,
          clutchEngagement: 0,
          governorIntegralNm: propulsor.engineDynamics.frictionNm,
          engineOmega: idleOmega,
          engineRpm: propulsor.idleRpm,
          shaftOmega: 0,
          shaftRps: 0,
          engineTorque: propulsor.engineDynamics.frictionNm,
          clutchTorque: 0,
          shaftDriveTorque: 0,
          propellerTorque: 0,
          enginePower: 0,
          shaftPower: 0,
          thrust: 0,
          advanceRatio: 0,
          inducedVelocity: 0,
          hydrodynamicPitchAngle: 0,
          thrustCoefficient: 0,
          torqueCoefficient: 0,
          safetyLimitActive: false
        };
      });
      const slipstreams = [];
      for (const rudder of profile.rudders) {
        for (const propulsorId of rudder.slipstreamSources) {
          slipstreams.push({
            id: `${propulsorId}->${rudder.id}`,
            propulsorId,
            rudderId: rudder.id,
            axialVelocity: 0,
            tangentialVelocity: 0,
            targetAxialVelocity: 0,
            targetTangentialVelocity: 0,
            convectionTimeS: rudder.slipstream.convectionTimeBoundsS[1],
            downstream: false
          });
        }
      }
      const primaryPropulsion = propulsionUnits[0];
      return {
        pose: { east: 0, north: 0, heading: Math.PI / 2 },
        velocity: { u: 0, v: 0, r: 0 },
        propulsion: {
          ...primaryPropulsion,
          units: propulsionUnits,
          slipstreams
        },
        controls: { throttleTarget: 0, rudderTarget: 0, rudderActual: 0 },
        moorings: [],
        pendilles: [],
        contacts: {
          current: [],
          maxImpact: 0,
          impacts: 0,
          severe: 0
        }
      };
    }

    function reset(initialState = {}, nextEnvironment) {
      state = defaultState();
      const pose = initialState.pose || initialState;
      state.pose.east = finite(pose.east ?? pose.x);
      state.pose.north = finite(pose.north ?? pose.y);
      state.pose.heading = wrapAngle(
        pose.heading === undefined ? Math.PI / 2 : finite(pose.heading)
      );
      const velocity = initialState.velocity || {};
      state.velocity.u = finite(velocity.u);
      state.velocity.v = finite(velocity.v);
      state.velocity.r = finite(velocity.r);
      if (nextEnvironment) environment = normalizeEnvironment(nextEnvironment);
      lastForces = [];
      lastContactSamples = [];
      activeContactIds = new Set();
      pendilleById = new Map();
      activePendilleIds = new Set();
      simulationTime = 0;
      for (const mooring of initialState.moorings || []) {
        const result = attachMooring(mooring);
        if (!result.ok) {
          throw new Error(`Aussière initiale invalide (${mooring.id || "sans identifiant"}) : ${result.reason}`);
        }
      }
      for (const pendille of initialState.pendilles || []) {
        const result = registerPendille(pendille);
        if (!result.ok) {
          throw new Error(`Pendille initiale invalide (${pendille.id || "sans identifiant"}) : ${result.reason}`);
        }
      }
      return snapshot();
    }

    function setEnvironment(nextEnvironment = {}) {
      environment = normalizeEnvironment({ ...environment, ...nextEnvironment });
      return { ...environment };
    }

    function setObstacles(nextObstacles = {}) {
      obstacles = {
        rectangles: deepClone(nextObstacles.rectangles || []),
        polylines: deepClone(nextObstacles.polylines || []),
        polygons: deepClone(nextObstacles.polygons || []),
        boats: deepClone(nextObstacles.boats || []),
        circles: deepClone(nextObstacles.circles || [])
      };
      obstacleIndex = buildObstacleIndex(obstacles);
    }

    function setCalibration(nextCalibration = {}) {
      const referenceMass = profile.inertia.loadedMass;
      calibration = {
        mass: clamp(
          finite(nextCalibration.mass ?? calibration.mass),
          referenceMass * 0.6,
          referenceMass * 1.5
        ),
        windage: clamp(finite(nextCalibration.windage ?? calibration.windage), 0.3, 2),
        rudder: clamp(finite(nextCalibration.rudder ?? calibration.rudder), 0.3, 2),
        lateral: clamp(finite(nextCalibration.lateral ?? calibration.lateral), 0.3, 2)
      };
      massProperties = computeMassMatrix(profile, calibration.mass);
      return { ...calibration };
    }

    function boatCleatById(id) {
      return profile.mooring.cleats.find(cleat => cleat.id === id) || null;
    }

    function mooringGeometry(mooring, candidateState = state) {
      const boatPoint = localPointToWorld(
        candidateState.pose,
        mooring.boatPoint.x,
        mooring.boatPoint.y
      );
      const deltaEast = boatPoint.east - mooring.shorePoint.east;
      const deltaNorth = boatPoint.north - mooring.shorePoint.north;
      const horizontalDistance = Math.hypot(deltaEast, deltaNorth);
      const verticalDelta = mooring.boatPoint.z - mooring.shorePoint.z;
      const distance = Math.hypot(horizontalDistance, verticalDelta);
      const inverseDistance = horizontalDistance > EPSILON ? 1 / horizontalDistance : 0;
      const normalWorld = {
        east: deltaEast * inverseDistance,
        north: deltaNorth * inverseDistance
      };
      const horizontalScale = distance > EPSILON
        ? horizontalDistance / distance
        : 0;
      const horizontalNormalBody = worldToBody(
        normalWorld.east,
        normalWorld.north,
        candidateState.pose.heading
      );
      const normalBody = {
        u: horizontalNormalBody.u * horizontalScale,
        v: horizontalNormalBody.v * horizontalScale
      };
      const jacobian = [
        normalBody.u,
        normalBody.v,
        -normalBody.u * mooring.boatPoint.y + normalBody.v * mooring.boatPoint.x
      ];
      const pointVelocity = (
        jacobian[0] * candidateState.velocity.u
        + jacobian[1] * candidateState.velocity.v
        + jacobian[2] * candidateState.velocity.r
      );
      return {
        boatPoint,
        horizontalDistance,
        distance,
        verticalDelta,
        horizontalScale,
        normalWorld,
        normalBody,
        jacobian,
        pointVelocity
      };
    }

    function updateMooringDiagnostics() {
      for (const mooring of state.moorings) {
        const geometry = mooringGeometry(mooring);
        const elastic = mooringElasticLaw(
          mooring.elasticity || profile.mooring.elasticity,
          mooring.length,
          geometry.distance
        );
        mooring.distance = geometry.distance;
        mooring.horizontalDistance = geometry.horizontalDistance;
        mooring.slack = Math.max(0, mooring.length - geometry.distance);
        mooring.extension = elastic.extension;
        mooring.strain = elastic.strain;
        mooring.elasticEnergy = elastic.elasticEnergy;
        mooring.workingLoadN = elastic.workingLoadN;
        mooring.workingStrain = elastic.workingStrain;
        mooring.taut = (
          mooring.slack <= profile.mooring.tautTolerance
          || mooring.tension > EPSILON
        );
      }
    }

    function attachMooring(definition = {}) {
      if (!state) return { ok: false, reason: "simulateur non initialisé" };
      const id = typeof definition.id === "string" && definition.id
        ? definition.id
        : `mooring-${state.moorings.length + 1}`;
      if (state.moorings.some(mooring => mooring.id === id)) {
        return { ok: false, reason: "identifiant déjà utilisé" };
      }
      const boatCleat = boatCleatById(definition.boatCleatId);
      if (!boatCleat) return { ok: false, reason: "taquet du bateau inconnu" };
      const linesOnBoatCleat = state.moorings.filter(
        mooring => mooring.boatCleatId === boatCleat.id
      ).length;
      if (linesOnBoatCleat >= profile.mooring.maximumLinesPerBoatCleat) {
        return { ok: false, reason: "capacité du taquet du bateau atteinte" };
      }
      const shorePoint = definition.shorePoint || {};
      if (
        typeof definition.shoreCleatId !== "string"
        || !definition.shoreCleatId
        || ![shorePoint.east, shorePoint.north, shorePoint.z].every(Number.isFinite)
      ) {
        return { ok: false, reason: "taquet à terre invalide" };
      }
      const draft = {
        id,
        boatCleatId: boatCleat.id,
        boatPoint: {
          x: boatCleat.x,
          y: boatCleat.y,
          z: boatCleat.z
        },
        shoreCleatId: definition.shoreCleatId,
        shorePoint: {
          east: shorePoint.east,
          north: shorePoint.north,
          z: shorePoint.z
        },
        sourceType: definition.sourceType === "pendille" ? "pendille" : "mooring",
        facilityId: definition.facilityId || null,
        maximumLength: Number.isFinite(definition.maximumLength)
          ? Number(definition.maximumLength)
          : profile.mooring.maxLength,
        elasticity: normalizedMooringElasticity(definition)
      };
      const geometry = mooringGeometry(draft);
      const length = definition.length === undefined
        ? geometry.distance
        : Number(definition.length);
      if (!Number.isFinite(length) || length < 0.05) {
        return { ok: false, reason: "longueur invalide" };
      }
      if (draft.maximumLength <= 0.05 || draft.maximumLength > 200) {
        return { ok: false, reason: "longueur maximale invalide" };
      }
      if (length > draft.maximumLength + EPSILON) {
        return { ok: false, reason: `longueur supérieure à ${draft.maximumLength.toFixed(1)} m` };
      }
      const verticalDistance = Math.abs(geometry.verticalDelta);
      const maximumExtendedLength = length * (
        1 + Math.max(0, draft.elasticity.maximumStrain)
      );
      if (maximumExtendedLength + EPSILON < verticalDistance) {
        return { ok: false, reason: "longueur inférieure à la différence de hauteur" };
      }
      const horizontalLimit = Math.sqrt(Math.max(
        0,
        maximumExtendedLength * maximumExtendedLength - verticalDistance * verticalDistance
      ));
      if (geometry.horizontalDistance > horizontalLimit + profile.mooring.solverTolerance) {
        return { ok: false, reason: "aussière trop courte pour les taquets" };
      }
      const slack = Math.max(0, length - geometry.distance);
      const elastic = mooringElasticLaw(
        draft.elasticity,
        length,
        geometry.distance
      );
      const mooring = {
        ...draft,
        length,
        targetLength: length,
        lengthRate: 0,
        horizontalLimitRate: 0,
        horizontalLimit,
        verticalDistance,
        horizontalDistance: geometry.horizontalDistance,
        distance: geometry.distance,
        slack,
        extension: elastic.extension,
        strain: elastic.strain,
        elasticEnergy: elastic.elasticEnergy,
        workingLoadN: elastic.workingLoadN,
        workingStrain: elastic.workingStrain,
        taut: slack <= profile.mooring.tautTolerance,
        tension: 0,
        impulse: 0,
        guardActive: false
      };
      state.moorings.push(mooring);
      return { ok: true, mooring: deepClone(mooring) };
    }

    function setMooringLength(id, requestedLength) {
      if (!state) return { ok: false, reason: "simulateur non initialisé" };
      const mooring = state.moorings.find(candidate => candidate.id === id);
      if (!mooring) return { ok: false, reason: "aussière inconnue" };
      const numericLength = Number(requestedLength);
      if (!Number.isFinite(numericLength)) {
        return { ok: false, reason: "longueur invalide" };
      }
      const geometry = mooringGeometry(mooring);
      const minimumLength = Math.max(0.05, Math.abs(geometry.verticalDelta));
      const targetLength = clamp(
        numericLength,
        minimumLength,
        mooring.maximumLength || profile.mooring.maxLength
      );
      mooring.targetLength = targetLength;
      return {
        ok: true,
        clamped: Math.abs(targetLength - numericLength) > EPSILON,
        minimumLength,
        maximumLength: mooring.maximumLength || profile.mooring.maxLength,
        mooring: deepClone(mooring)
      };
    }

    function detachMooring(id) {
      const index = state.moorings.findIndex(mooring => mooring.id === id);
      if (index < 0) return { ok: false, reason: "aussière inconnue" };
      const [mooring] = state.moorings.splice(index, 1);
      lastForces = lastForces.filter(force => force.mooringId !== id);
      return { ok: true, mooring: deepClone(mooring) };
    }

    function clearMoorings() {
      const count = state.moorings.length;
      state.moorings.length = 0;
      lastForces = lastForces.filter(force => force.category !== "mooring");
      for (const pendille of state.pendilles) {
        if (pendille.state === "secured") {
          pendille.state = "available";
          pendille.boatCleatId = null;
          pendille.mooringId = null;
          pendille.progress = 0;
          activePendilleIds.delete(pendille.id);
        }
      }
      return count;
    }

    function validWorldPoint(point) {
      return point && [point.east, point.north, point.z].every(Number.isFinite);
    }

    function registerPendille(definition = {}) {
      if (!state) return { ok: false, reason: "simulateur non initialisé" };
      const id = typeof definition.id === "string" && definition.id
        ? definition.id
        : `pendille-${state.pendilles.length + 1}`;
      if (state.pendilles.some(item => item.id === id)) {
        return { ok: false, reason: "identifiant déjà utilisé" };
      }
      if (!validWorldPoint(definition.pickupPoint) || !validWorldPoint(definition.anchorPoint)) {
        return { ok: false, reason: "prise ou corps-mort invalide" };
      }
      const maximumLength = Number(definition.maximumLength);
      if (!Number.isFinite(maximumLength) || maximumLength <= 0.05 || maximumLength > 200) {
        return { ok: false, reason: "longueur maximale invalide" };
      }
      const pendille = {
        id,
        berthId: definition.berthId || null,
        parentId: definition.parentId || null,
        connectionEnd: definition.connectionEnd === "stern" ? "stern" : "bow",
        pickupPoint: deepClone(definition.pickupPoint),
        anchorPoint: deepClone(definition.anchorPoint),
        maximumLength,
        elasticity: normalizedMooringElasticity(definition),
        state: "available",
        boatCleatId: null,
        mooringId: null,
        progress: 0,
        transferDuration: 0,
        pickupHullDistance: null,
        pickupStartCleatId: null,
        stateTime: 0,
        danger: false,
        lastError: null,
        releasePoint: null
      };
      state.pendilles.push(pendille);
      pendilleById.set(id, pendille);
      if (definition.state === "secured" && definition.boatCleatId) {
        const secured = securePendille(pendille, definition.boatCleatId, definition.length);
        if (!secured.ok) {
          state.pendilles.pop();
          pendilleById.delete(id);
          activePendilleIds.delete(id);
          return secured;
        }
      }
      return { ok: true, pendille: deepClone(pendille) };
    }

    function pendillePickupGeometry(pickupPoint) {
      const offset = worldToBody(
        pickupPoint.east - state.pose.east,
        pickupPoint.north - state.pose.north,
        state.pose.heading
      );
      const localPickup = { east: offset.u, north: offset.v };
      let closest = localPickup;
      let distance = 0;
      if (!pointInPolygon(localPickup.east, localPickup.north, hullPickupOutline)) {
        distance = Infinity;
        for (let index = 0; index < hullPickupOutline.length; index += 1) {
          const candidate = closestPointOnSegment(
            localPickup,
            hullPickupOutline[index],
            hullPickupOutline[(index + 1) % hullPickupOutline.length]
          );
          const candidateDistance = Math.hypot(
            localPickup.east - candidate.east,
            localPickup.north - candidate.north
          );
          if (candidateDistance < distance) {
            distance = candidateDistance;
            closest = candidate;
          }
        }
      }
      const nearestCleat = profile.mooring.cleats.reduce((best, cleat) => {
        const deckDistance = Math.hypot(cleat.x - closest.east, cleat.y - closest.north);
        return !best || deckDistance < best.distance ? { cleat, distance: deckDistance } : best;
      }, null);
      return {
        distance,
        bodyPoint: { x: closest.east, y: closest.north },
        nearestCleat: nearestCleat?.cleat || null,
        deckDistanceToTarget(targetCleat) {
          return Math.hypot(targetCleat.x - closest.east, targetCleat.y - closest.north);
        }
      };
    }

    function securePendille(pendille, boatCleatId, explicitLength) {
      const cleat = boatCleatById(boatCleatId);
      if (!cleat) return { ok: false, reason: "taquet du bateau inconnu" };
      const shouldBeBow = pendille.connectionEnd !== "stern";
      if ((shouldBeBow && cleat.x <= 0) || (!shouldBeBow && cleat.x >= 0)) {
        return { ok: false, reason: shouldBeBow ? "taquet d’étrave requis" : "taquet arrière requis" };
      }
      const boatPoint = localPointToWorld(state.pose, cleat.x, cleat.y);
      const verticalDelta = cleat.z - pendille.anchorPoint.z;
      const distance = Math.hypot(
        boatPoint.east - pendille.anchorPoint.east,
        boatPoint.north - pendille.anchorPoint.north,
        verticalDelta
      );
      // Une pendille est reprise à la main avant d'être tournée au taquet. La
      // précharge retenue vaut la moitié de l'effort humain du profil : elle
      // supprime le mou sans créer un rappel brutal à l'instant de la frappe.
      const initialPreloadN = Math.min(
        profile.mooring.humanPullForce * 0.5,
        pendille.elasticity.workingLoadN * 0.02
      );
      const initialStrain = (
        initialPreloadN
        * pendille.elasticity.workingStrain
        / Math.max(EPSILON, pendille.elasticity.workingLoadN)
      );
      const tautLength = distance / (1 + initialStrain);
      const length = Number.isFinite(explicitLength)
        ? explicitLength
        : Math.min(pendille.maximumLength, tautLength);
      const mooringId = `pendille:${pendille.id}`;
      const attached = attachMooring({
        id: mooringId,
        boatCleatId,
        shoreCleatId: `anchor:${pendille.id}`,
        shorePoint: pendille.anchorPoint,
        length,
        maximumLength: pendille.maximumLength,
        elasticity: pendille.elasticity,
        sourceType: "pendille",
        facilityId: pendille.id
      });
      if (!attached.ok) return attached;
      pendille.state = "secured";
      activePendilleIds.add(pendille.id);
      pendille.boatCleatId = boatCleatId;
      pendille.mooringId = mooringId;
      pendille.progress = 1;
      pendille.stateTime = 0;
      pendille.lastError = null;
      return { ok: true, pendille: deepClone(pendille), mooring: attached.mooring };
    }

    function beginPendillePickup(id, boatCleatId) {
      const pendille = pendilleById.get(id);
      if (!pendille) return { ok: false, reason: "pendille inconnue" };
      if (pendille.state !== "available") return { ok: false, reason: "pendille indisponible" };
      const cleat = boatCleatById(boatCleatId);
      if (!cleat) return { ok: false, reason: "taquet du bateau inconnu" };
      const shouldBeBow = pendille.connectionEnd !== "stern";
      if ((shouldBeBow && cleat.x <= 0) || (!shouldBeBow && cleat.x >= 0)) {
        return { ok: false, reason: shouldBeBow ? "choisissez un taquet d’étrave" : "choisissez un taquet arrière" };
      }
      const ground = bodyToWorld(state.velocity.u, state.velocity.v, state.pose.heading);
      const groundSpeedKn = Math.hypot(ground.east, ground.north) / KNOT;
      if (groundSpeedKn + EPSILON >= PENDILLE_PICKUP_SPEED_LIMIT_KN) {
        return { ok: false, reason: "restez sous 0,6 nd pour prendre la pendille" };
      }
      const pickup = pendillePickupGeometry(pendille.pickupPoint);
      if (!pickup.nearestCleat) return { ok: false, reason: "aucun taquet embarqué disponible" };
      if (pickup.distance > PENDILLE_PICKUP_REACH_M + EPSILON) {
        return { ok: false, reason: "la prise doit être à moins de 1,8 m du bord de coque" };
      }
      pendille.state = "in-hand";
      activePendilleIds.add(id);
      pendille.boatCleatId = boatCleatId;
      pendille.progress = 0;
      pendille.stateTime = 0;
      pendille.pickupHullDistance = pickup.distance;
      pendille.transferDuration = Math.max(
        0.35,
        pickup.distance + pickup.deckDistanceToTarget(cleat)
      );
      pendille.pickupStartCleatId = pickup.nearestCleat.id;
      pendille.lastError = null;
      return { ok: true, pendille: deepClone(pendille) };
    }

    function cancelPendillePickup(id) {
      const pendille = pendilleById.get(id);
      if (!pendille) return { ok: false, reason: "pendille inconnue" };
      if (pendille.state !== "in-hand") return { ok: false, reason: "aucune prise en cours" };
      pendille.state = "available";
      activePendilleIds.delete(id);
      pendille.boatCleatId = null;
      pendille.progress = 0;
      pendille.stateTime = 0;
      pendille.pickupHullDistance = null;
      pendille.pickupStartCleatId = null;
      return { ok: true, pendille: deepClone(pendille) };
    }

    function releasePendille(id) {
      const pendille = pendilleById.get(id);
      if (!pendille) return { ok: false, reason: "pendille inconnue" };
      if (pendille.state === "in-hand") return cancelPendillePickup(id);
      if (pendille.state !== "secured") return { ok: false, reason: "pendille non frappée" };
      const ground = bodyToWorld(state.velocity.u, state.velocity.v, state.pose.heading);
      if (Math.hypot(ground.east, ground.north) > 3 * KNOT + EPSILON) {
        return { ok: false, reason: "vitesse supérieure à 3 nd" };
      }
      if (pendille.mooringId) detachMooring(pendille.mooringId);
      pendille.state = "available";
      activePendilleIds.delete(id);
      pendille.mooringId = null;
      pendille.boatCleatId = null;
      pendille.progress = 0;
      pendille.stateTime = 0;
      pendille.danger = false;
      pendille.releasePoint = null;
      pendille.pickupHullDistance = null;
      pendille.pickupStartCleatId = null;
      return { ok: true, pendille: deepClone(pendille) };
    }

    function clearPendilles() {
      const ids = new Set(state.pendilles.map(item => item.mooringId).filter(Boolean));
      state.moorings = state.moorings.filter(item => !ids.has(item.id));
      const count = state.pendilles.length;
      state.pendilles.length = 0;
      pendilleById.clear();
      activePendilleIds.clear();
      return count;
    }

    function pointSegmentDistance3D(point, start, end) {
      const dx = end.east - start.east;
      const dy = end.north - start.north;
      const dz = end.z - start.z;
      const denominator = dx * dx + dy * dy + dz * dz;
      const t = denominator > EPSILON
        ? clamp(((point.east - start.east) * dx + (point.north - start.north) * dy + (point.z - start.z) * dz) / denominator, 0, 1)
        : 0;
      return Math.hypot(
        point.east - (start.east + dx * t),
        point.north - (start.north + dy * t),
        point.z - (start.z + dz * t)
      );
    }

    function pendilleVisibleSegment(pendille) {
      if (pendille.state === "secured") {
        const cleat = boatCleatById(pendille.boatCleatId);
        if (!cleat) return null;
        return {
          start: pendille.anchorPoint,
          end: { ...localPointToWorld(state.pose, cleat.x, cleat.y), z: cleat.z }
        };
      }
      if (pendille.state === "in-hand") {
        const fromCleat = boatCleatById(pendille.pickupStartCleatId);
        const toCleat = boatCleatById(pendille.boatCleatId);
        if (!fromCleat || !toCleat) return null;
        const progress = clamp(pendille.progress, 0, 1);
        const local = {
          x: fromCleat.x + (toCleat.x - fromCleat.x) * progress,
          y: fromCleat.y + (toCleat.y - fromCleat.y) * progress,
          z: fromCleat.z + (toCleat.z - fromCleat.z) * progress
        };
        return {
          start: pendille.pickupPoint,
          end: { ...localPointToWorld(state.pose, local.x, local.y), z: local.z }
        };
      }
      return null;
    }

    function updatePendilleDanger(pendille) {
      const segment = pendilleVisibleSegment(pendille);
      pendille.danger = false;
      if (!segment || pendille.state !== "in-hand") return;
      for (const propulsor of profile.propulsors) {
        const point = {
          ...localPointToWorld(state.pose, propulsor.x, propulsor.y),
          z: propulsor.z || -0.7
        };
        if (pointSegmentDistance3D(point, segment.start, segment.end) <= propulsor.diameter * 0.6 + 0.25) {
          pendille.danger = true;
          return;
        }
      }
    }

    function advancePendilles(dt) {
      for (const id of [...activePendilleIds]) {
        const pendille = pendilleById.get(id);
        if (!pendille) {
          activePendilleIds.delete(id);
          continue;
        }
        pendille.stateTime += dt;
        if (pendille.state === "in-hand") {
          pendille.progress = clamp(pendille.stateTime / Math.max(0.01, pendille.transferDuration), 0, 1);
          if (pendille.progress >= 1 - EPSILON) {
            const secured = securePendille(pendille, pendille.boatCleatId);
            if (!secured.ok) {
              pendille.state = "available";
              pendille.progress = 0;
              pendille.lastError = secured.reason;
            }
          }
        }
        updatePendilleDanger(pendille);
      }
    }

    function waterKinematics(candidateState) {
      const currentWorld = nauticalVectorFromSource(
        environment.currentSpeedKn * KNOT,
        environment.currentFromDeg * DEG
      );
      const currentBody = worldToBody(
        currentWorld.east,
        currentWorld.north,
        candidateState.pose.heading
      );
      return {
        currentWorld,
        currentBody,
        relative: {
          u: candidateState.velocity.u - currentBody.u,
          v: candidateState.velocity.v - currentBody.v,
          r: candidateState.velocity.r
        }
      };
    }

    function addHullForces(accumulator, relative) {
      const u = relative.u;
      const speedRatio = Math.abs(u) / Math.max(0.1, profile.resistance.waveOnset);
      const wave = (
        profile.resistance.waveRise
        * smoothstep(1, 1.75, speedRatio)
        * u
        * Math.abs(u)
      );
      const surge = -(
        profile.resistance.surgeLinear * u
        + profile.resistance.surgeQuadratic * u * Math.abs(u)
        + wave
      );
      accumulator.add("Coque · traînée", surge, 0, 0, 0, 0, "passive");

      for (const section of massProperties.sections) {
        const localV = relative.v + relative.r * section.x;
        const area = (
          profile.dimensions.canoeDraft
          * profile.resistance.crossFlowAreaFactor
          * section.dx
          * section.shape
        );
        const force = (
          -0.5
          * RHO_WATER
          * profile.resistance.crossFlowCd
          * area
          * localV
          * (Math.abs(localV) + profile.resistance.crossFlowLinearSpeed)
          * calibration.lateral
        );
        accumulator.add(
          "Coque · résistance latérale",
          0,
          force,
          section.x,
          0,
          0,
          "passive"
        );
      }
    }

    function addAppendageForces(accumulator, relative) {
      const results = [];
      for (const appendage of profile.appendages) {
        const localU = relative.u - relative.r * appendage.y;
        const localV = relative.v + relative.r * appendage.x;
        const force = foilModel({
          u: localU,
          v: localV,
          delta: 0,
          area: appendage.area,
          aspectRatio: appendage.aspectRatio,
          efficiency: appendage.efficiency,
          cd0: appendage.cd0,
          normalCd90: appendage.normalCd90,
          stallStart: appendage.stallStart,
          stallEnd: appendage.stallEnd
        });
        const source = profile.appendages.length === 1 && appendage.type === "keel"
          ? "Quille"
          : `Appendice · ${appendage.id}`;
        accumulator.add(
          source,
          force.X * calibration.lateral,
          force.Y * calibration.lateral,
          appendage.x,
          appendage.y,
          0,
          "passive"
        );
        results.push({ id: appendage.id, ...force });
      }
      return results;
    }

    function addPropellerForces(accumulator, relative, candidateState) {
      const units = [];
      for (let index = 0; index < profile.propulsors.length; index += 1) {
        const propulsor = profile.propulsors[index];
        const actuator = candidateState.propulsion.units[index];
        const localU = relative.u - relative.r * propulsor.y;
        const model = propellerModel({
          shaftRps: actuator.shaftRps,
          advanceSpeed: localU
        }, propulsor);
        const axisLength = Math.hypot(
          propulsor.axis?.x ?? 1,
          propulsor.axis?.y ?? 0
        ) || 1;
        const axisX = (propulsor.axis?.x ?? 1) / axisLength;
        const axisY = (propulsor.axis?.y ?? 0) / axisLength;
        accumulator.add(
          profile.propulsors.length === 1 ? "Hélice" : `Hélice · ${propulsor.id}`,
          model.thrust * axisX,
          model.thrust * axisY,
          propulsor.x,
          propulsor.y,
          0,
          "propulsion"
        );
        if (actuator.shaftRps < -0.01 && model.thrust < 0) {
          const walkRatio = (
            propulsor.walkBase
            + propulsor.walkGain * environment.propWalk
          );
          const speedFade = 1 - 0.68 * smoothstep(0.2, 1.8, Math.abs(localU));
          const build = smoothstep(0.5, 4, Math.abs(actuator.shaftRps));
          const handedness = propulsor.rotation === "left" ? 1 : -1;
          const walk = Math.abs(model.thrust) * walkRatio * speedFade * build;
          accumulator.add(
            profile.propulsors.length === 1
              ? "Effet de pas"
              : `Effet de pas · ${propulsor.id}`,
            0,
            handedness * walk,
            propulsor.x,
            propulsor.y,
            0,
            "propulsion"
          );
        }
        units.push({ id: propulsor.id, ...model });
      }
      return { ...units[0], units };
    }

    function slipstreamCoverage(propulsor, rudder, stripZ) {
      const longitudinalDistance = Math.abs(rudder.x - propulsor.x);
      const contractionProgress = smoothstep(
        0,
        Math.max(EPSILON, 4 * propulsor.diameter),
        longitudinalDistance
      );
      const wakeRadius = 0.5 * propulsor.diameter * (
        1 - (1 - rudder.slipstream.contractionRatio) * contractionProgress
      );
      const stripHalfHeight = rudder.span / rudder.slipstream.stripCount / 2;
      const radialDistance = Math.hypot(
        rudder.y - propulsor.y,
        stripZ - propulsor.z
      );
      return {
        fraction: 1 - smoothstep(
          Math.max(0, wakeRadius - stripHalfHeight),
          wakeRadius + stripHalfHeight,
          radialDistance
        ),
        wakeRadius,
        radialDistance
      };
    }

    function addRudderForces(accumulator, relative, candidateState, propellers) {
      const units = [];
      const propellerById = new Map(propellers.units.map(unit => [unit.id, unit]));
      const profilePropellerById = new Map(profile.propulsors.map(unit => [unit.id, unit]));
      const wakeById = new Map(
        (candidateState.propulsion.slipstreams || []).map(link => [link.id, link])
      );
      for (const rudder of profile.rudders) {
        const localU = relative.u - relative.r * rudder.y;
        const localV = relative.v + relative.r * rudder.x;
        const delta = candidateState.controls.rudderActual;
        const stripCount = rudder.slipstream.stripCount;
        const stripArea = rudder.area / stripCount;
        const strips = [];
        let freeX = 0;
        let freeY = 0;
        let wakeX = 0;
        let wakeY = 0;
        let coverageSum = 0;
        let axialSum = 0;
        let tangentialSum = 0;
        for (let stripIndex = 0; stripIndex < stripCount; stripIndex += 1) {
          const stripZ = rudder.z + (
            stripIndex + 0.5 - stripCount / 2
          ) * rudder.span / stripCount;
          let axialVelocity = 0;
          let tangentialVelocity = 0;
          let stripCoverage = 0;
          const sources = [];
          for (const propulsorId of rudder.slipstreamSources) {
            const propulsor = profilePropellerById.get(propulsorId);
            const wake = wakeById.get(`${propulsorId}->${rudder.id}`);
            if (!propulsor || !wake) continue;
            const geometry = slipstreamCoverage(propulsor, rudder, stripZ);
            const coverage = geometry.fraction;
            const verticalRatio = clamp(
              (stripZ - propulsor.z) / Math.max(EPSILON, geometry.wakeRadius),
              -1,
              1
            );
            axialVelocity += wake.axialVelocity * coverage;
            tangentialVelocity += (
              wake.tangentialVelocity * verticalRatio * coverage
            );
            stripCoverage = Math.max(stripCoverage, coverage);
            sources.push({
              id: propulsorId,
              coverage,
              wakeRadius: geometry.wakeRadius,
              radialDistance: geometry.radialDistance,
              axialVelocity: wake.axialVelocity,
              tangentialVelocity: wake.tangentialVelocity,
              downstream: wake.downstream
            });
          }
          const free = foilModel({
            u: localU,
            v: localV,
            delta,
            area: stripArea,
            aspectRatio: rudder.aspectRatio,
            efficiency: rudder.efficiency,
            cd0: rudder.cd0,
            normalCd90: rudder.normalCd90,
            stallStart: rudder.stallStart,
            stallEnd: rudder.stallEnd
          });
          const localFlow = {
            u: localU + axialVelocity,
            v: localV + tangentialVelocity * rudder.slipstream.flowStraightening
          };
          const force = foilModel({
            ...localFlow,
            delta,
            area: stripArea,
            aspectRatio: rudder.aspectRatio,
            efficiency: rudder.efficiency,
            cd0: rudder.cd0,
            normalCd90: rudder.normalCd90,
            stallStart: rudder.stallStart,
            stallEnd: rudder.stallEnd
          });
          freeX += free.X;
          freeY += free.Y;
          wakeX += force.X;
          wakeY += force.Y;
          coverageSum += stripCoverage;
          axialSum += axialVelocity;
          tangentialSum += tangentialVelocity;
          strips.push({
            index: stripIndex,
            z: stripZ,
            area: stripArea,
            coverage: stripCoverage,
            freeFlow: { u: localU, v: localV },
            localFlow,
            axialVelocity,
            tangentialVelocity,
            force: { X: force.X, Y: force.Y },
            sources
          });
        }
        let extraX = wakeX - freeX;
        let extraY = wakeY - freeY;
        const availableMomentum = rudder.slipstreamSources.reduce((sum, id) => {
          const propeller = propellerById.get(id);
          const propulsor = profilePropellerById.get(id);
          const wake = wakeById.get(`${id}->${rudder.id}`);
          if (!propeller || !propulsor || !wake) return sum;
          const diskArea = Math.PI * propulsor.diameter * propulsor.diameter / 4;
          const convectedMomentum = RHO_WATER * diskArea * (
            wake.axialVelocity * wake.axialVelocity
            + wake.tangentialVelocity * wake.tangentialVelocity
          );
          return sum + Math.max(Math.abs(propeller.thrust), convectedMomentum);
        }, 0);
        const momentumLimit = (
          availableMomentum * rudder.slipstream.momentumSafetyFactor
        );
        const incrementMagnitude = Math.hypot(extraX, extraY);
        const momentumProtectionActive = (
          momentumLimit > EPSILON && incrementMagnitude > momentumLimit
        );
        if (momentumProtectionActive) {
          const scale = momentumLimit / incrementMagnitude;
          extraX *= scale;
          extraY *= scale;
        }
        const X = freeX + extraX;
        const Y = freeY + extraY;
        accumulator.add(
          profile.rudders.length === 1 ? "Safran" : `Safran · ${rudder.id}`,
          X * calibration.rudder,
          Y * calibration.rudder,
          rudder.x,
          rudder.y,
          0,
          "passive"
        );
        const overlap = coverageSum / stripCount;
        const wash = axialSum / stripCount;
        units.push({
          id: rudder.id,
          wash,
          overlap,
          localFreeFlow: { u: localU, v: localV },
          inducedFlow: {
            axial: wash,
            tangential: tangentialSum / stripCount
          },
          strips,
          force: { X, Y },
          freeForce: { X: freeX, Y: freeY },
          propellerIncrement: { X: extraX, Y: extraY },
          momentumProtectionActive,
          momentumLimits: {
            resultant: momentumLimit,
            axialLoss: momentumLimit,
            side: momentumLimit,
            recovery: momentumLimit
          }
        });
      }
      return { ...units[0], units };
    }

    function addWindForces(accumulator, candidateState) {
      const windWorld = nauticalVectorFromSource(
        environment.windSpeedKn * KNOT,
        environment.windFromDeg * DEG
      );
      const groundWorld = bodyToWorld(
        candidateState.velocity.u,
        candidateState.velocity.v,
        candidateState.pose.heading
      );
      const apparent = worldToBody(
        windWorld.east - groundWorld.east,
        windWorld.north - groundWorld.north,
        candidateState.pose.heading
      );
      const vertical = profile.aerodynamics.verticalProfile;
      const referenceHeight = profile.aerodynamics.referenceWindHeight;
      const panelResults = [];
      for (const panel of profile.aerodynamics.panels) {
        const heightRatio = Math.max(0.5, panel.center.z) / referenceHeight;
        const heightFactor = vertical?.type === "bounded-power-law"
          ? clamp(
            Math.pow(heightRatio, vertical.exponent),
            vertical.minimumVelocityFactor,
            vertical.maximumVelocityFactor
          )
          : 1;
        const local = {
          u: apparent.u * heightFactor,
          v: apparent.v * heightFactor
        };
        const localSpeed = Math.hypot(local.u, local.v);
        if (localSpeed < 1e-7) continue;
        const exposure = clamp(panel.exposure ?? 1, 0, 2);
        let X = 0;
        let Y = 0;
        if (panel.omnidirectional) {
          const factor = (
            0.5
            * RHO_AIR
            * panel.area
            * panel.cdNormal
            * exposure
            * calibration.windage
            * localSpeed
          );
          X = factor * local.u;
          Y = factor * local.v;
        } else {
          const normalLength = Math.hypot(
            panel.normalBody.x,
            panel.normalBody.y
          ) || 1;
          const normal = {
            x: panel.normalBody.x / normalLength,
            y: panel.normalBody.y / normalLength
          };
          const normalVelocity = local.u * normal.x + local.v * normal.y;
          const active = (
            panel.twoSided
            || normalVelocity < -localSpeed * 1e-8
          );
          if (!active) continue;
          const tangentVelocity = {
            x: local.u - normalVelocity * normal.x,
            y: local.v - normalVelocity * normal.y
          };
          const tangentSpeed = Math.hypot(
            tangentVelocity.x,
            tangentVelocity.y
          );
          const common = (
            0.5
            * RHO_AIR
            * panel.area
            * exposure
            * calibration.windage
          );
          const normalFactor = (
            common
            * panel.cdNormal
            * normalVelocity
            * localSpeed
          );
          const tangentFactor = (
            common
            * panel.cdTangential
            * tangentSpeed
            * (
              panel.twoSided
                ? 1
                : smoothstep(
                  0,
                  0.08,
                  -normalVelocity / Math.max(localSpeed, EPSILON)
                )
            )
          );
          X = normal.x * normalFactor + tangentVelocity.x * tangentFactor;
          Y = normal.y * normalFactor + tangentVelocity.y * tangentFactor;
        }
        accumulator.add(
          "Vent",
          X,
          Y,
          panel.center.x,
          panel.center.y,
          0,
          "environment"
        );
        panelResults.push({
          id: panel.id,
          X,
          Y,
          N: panel.center.x * Y - panel.center.y * X,
          heightFactor
        });
      }
      return {
        apparent,
        speed: Math.hypot(apparent.u, apparent.v),
        beta: Math.atan2(apparent.v, apparent.u),
        referenceHeight,
        panels: panelResults
      };
    }

    function humanPullForce() {
      return profile.mooring.humanPullForce;
    }

    function addMooringHaulForces(accumulator, candidateState) {
      const candidates = [];
      for (const mooring of state.moorings) {
        const targetLength = Number.isFinite(mooring.targetLength)
          ? mooring.targetLength
          : mooring.length;
        if (targetLength >= mooring.length - EPSILON) continue;
        const geometry = mooringGeometry(mooring, candidateState);
        if (
          geometry.distance
          < mooring.length - profile.mooring.tautTolerance
        ) {
          continue;
        }
        candidates.push({
          mooring,
          geometry,
          requestedForce: humanPullForce()
        });
      }
      const requestedTotal = candidates.reduce(
        (sum, candidate) => sum + candidate.requestedForce,
        0
      );
      const crewScale = requestedTotal > profile.mooring.humanPullForce
        ? profile.mooring.humanPullForce / requestedTotal
        : 1;
      for (const candidate of candidates) {
        const inwardSpeed = Math.max(0, -candidate.geometry.pointVelocity);
        const speedScale = 1 - smoothstep(
          profile.mooring.maximumHaulInducedSpeed * 0.72,
          profile.mooring.maximumHaulInducedSpeed,
          inwardSpeed
        );
        const force = candidate.requestedForce * crewScale * speedScale;
        if (force <= EPSILON) continue;
        accumulator.add(
          `Reprise humaine · ${candidate.mooring.id}`,
          -candidate.geometry.normalBody.u * force,
          -candidate.geometry.normalBody.v * force,
          candidate.mooring.boatPoint.x,
          candidate.mooring.boatPoint.y,
          0,
          "human"
        );
      }
    }

    function contactSamples() {
      const samples = profile.contacts.fenders.map((fender, index) => ({
        id: fender.id || `fender-${index}`,
        type: "fender",
        x: fender.x,
        y: fender.y,
        radius: profile.contacts.fenderRadius
      }));
      samples.push(...profile.contacts.hullEnvelope.map(point => ({
        id: point.id,
        type: "hull",
        x: point.position.x,
        y: point.position.y,
        radius: point.radius
      })));
      return samples;
    }

    function addContactForces(accumulator, candidateState, dt) {
      const samples = [];
      const correction = { east: 0, north: 0 };
      const seen = new Set();
      const effectiveMass = calibration.mass * 0.24;
      for (const sample of contactSamples()) {
        const point = localPointToWorld(candidateState.pose, sample.x, sample.y);
        const hits = [];
        for (const record of queryObstacleIndex(obstacleIndex, point.east, point.north)) {
          let hit;
          if (record.kind === "rectangle") {
            hit = pointRectContact(point.east, point.north, record.item);
            if (!isContactSurfaceEnabled(hit, record.item)) continue;
          } else if (record.kind === "polyline") {
            hit = pointPolylineContact(point.east, point.north, record.item);
          } else if (record.kind === "polygon") {
            hit = pointPolygonContact(point.east, point.north, record.item);
          } else if (record.kind === "circle") {
            hit = pointCircleContact(point.east, point.north, record.item);
          } else {
            hit = pointBoatContact(point.east, point.north, record.item);
          }
          hits.push({ obstacleId: record.item.id, hit });
        }
        for (const { obstacleId, hit } of hits) {
          const penetration = sample.radius - hit.distance;
          if (penetration <= 0) continue;
          const normalBody = worldToBody(
            hit.normalEast,
            hit.normalNorth,
            candidateState.pose.heading
          );
          const pointU = candidateState.velocity.u - candidateState.velocity.r * sample.y;
          const pointV = candidateState.velocity.v + candidateState.velocity.r * sample.x;
          const normalSpeed = pointU * normalBody.u + pointV * normalBody.v;
          const tangentBody = { u: -normalBody.v, v: normalBody.u };
          const tangentSpeed = pointU * tangentBody.u + pointV * tangentBody.v;
          const stiffness = sample.type === "fender"
            ? profile.contacts.fenderStiffness
            : profile.contacts.hullStiffness;
          const damping = (
            2
            * profile.contacts.dampingRatio
            * Math.sqrt(stiffness * effectiveMass)
          );
          const normalForce = clamp(
            stiffness * penetration - damping * Math.min(0, normalSpeed),
            0,
            profile.contacts.forceLimit
          );
          const tangentForce = -clamp(
            tangentSpeed * effectiveMass / Math.max(dt, MAX_STEP),
            -normalForce * profile.contacts.friction,
            normalForce * profile.contacts.friction
          );
          const X = normalBody.u * normalForce + tangentBody.u * tangentForce;
          const Y = normalBody.v * normalForce + tangentBody.v * tangentForce;
          accumulator.add(
            sample.type === "fender" ? "Pare-battage" : "Contact coque",
            X,
            Y,
            sample.x,
            sample.y,
            0,
            "contact"
          );
          const id = `${sample.id}:${obstacleId}`;
          seen.add(id);
          const impactSpeed = Math.max(0, -normalSpeed);
          samples.push({
            id,
            type: sample.type,
            east: point.east,
            north: point.north,
            normalEast: hit.normalEast,
            normalNorth: hit.normalNorth,
            penetration,
            impactSpeed,
            classification: classifyImpact(impactSpeed)
          });
          const correctionGain = 1 - Math.exp(-dt / 0.08);
          const correctionDistance = Math.max(0, penetration - 0.045) * correctionGain;
          correction.east += hit.normalEast * correctionDistance;
          correction.north += hit.normalNorth * correctionDistance;
        }
      }
      return { samples, correction, seen };
    }

    function coriolisTerms(relative) {
      const mass = calibration.mass;
      /*
       * The equations are integrated in water-relative velocity. The rigid
       * and added-mass Coriolis terms must therefore use the same velocity.
       * Mixing absolute surge/sway here with relative hydrodynamic forces
       * breaks Galilean invariance and can inject energy under a beam current.
       */
      const rigid = {
        X: -mass * relative.v * relative.r,
        Y: mass * relative.u * relative.r,
        N: 0
      };
      const added = massProperties.added;
      const coupled = added.sway * relative.v + added.swayYaw * relative.r;
      const addedTerm = {
        X: -coupled * relative.r,
        Y: added.surge * relative.u * relative.r,
        N: coupled * relative.u - added.surge * relative.u * relative.v
      };
      return {
        X: rigid.X + addedTerm.X,
        Y: rigid.Y + addedTerm.Y,
        N: rigid.N + addedTerm.N
      };
    }

    function evaluateForces(candidateState, dt) {
      const water = waterKinematics(candidateState);
      const accumulator = createAccumulator(water.relative);
      addHullForces(accumulator, water.relative);
      const appendages = addAppendageForces(accumulator, water.relative);
      const propeller = addPropellerForces(accumulator, water.relative, candidateState);
      const rudder = addRudderForces(accumulator, water.relative, candidateState, propeller);
      const wind = addWindForces(accumulator, candidateState);
      addMooringHaulForces(accumulator, candidateState);
      const contact = addContactForces(accumulator, candidateState, dt);
      const coriolis = coriolisTerms(water.relative);
      const rhs = [
        accumulator.X - coriolis.X,
        accumulator.Y - coriolis.Y,
        accumulator.N - coriolis.N
      ];
      const acceleration = solveMass(massProperties.matrix, rhs);
      acceleration[0] += candidateState.velocity.r * water.currentBody.v;
      acceleration[1] -= candidateState.velocity.r * water.currentBody.u;
      return {
        acceleration,
        accumulator,
        water,
        coriolis,
        appendages,
        propeller,
        rudder,
        wind,
        contact
      };
    }

    function advanceGearState(actuator, propulsor, requestedGear, dt) {
      const clutch = propulsor.clutch;
      actuator.requestedGear = requestedGear;
      const beginDisengagement = () => {
        actuator.gearState = "disengaging";
        actuator.shiftTimer = clutch.disengageTimeS;
      };

      if (actuator.gearState === "ahead" || actuator.gearState === "astern") {
        if (requestedGear !== actuator.engagedGear) beginDisengagement();
      } else if (actuator.gearState === "engaging-ahead" || actuator.gearState === "engaging-astern") {
        if (requestedGear !== actuator.engagedGear) {
          beginDisengagement();
        } else {
          actuator.clutchEngagement = clamp(
            actuator.clutchEngagement + dt / clutch.engageTimeS,
            0,
            1
          );
          actuator.shiftTimer = Math.max(0, actuator.shiftTimer - dt);
          if (actuator.clutchEngagement >= 1 - 1e-9) {
            actuator.clutchEngagement = 1;
            actuator.gearState = actuator.engagedGear > 0 ? "ahead" : "astern";
          }
        }
      } else if (actuator.gearState === "disengaging") {
        actuator.clutchEngagement = clamp(
          actuator.clutchEngagement - dt / clutch.disengageTimeS,
          0,
          1
        );
        actuator.shiftTimer = Math.max(0, actuator.shiftTimer - dt);
        if (actuator.clutchEngagement <= 1e-9) {
          actuator.clutchEngagement = 0;
          actuator.engagedGear = 0;
          actuator.gearState = "neutral";
          actuator.shiftTimer = clutch.neutralDwellS;
        }
      } else {
        actuator.gearState = "neutral";
        actuator.clutchEngagement = 0;
        actuator.engagedGear = 0;
        actuator.shiftTimer = Math.max(0, actuator.shiftTimer - dt);
        if (requestedGear !== 0 && actuator.shiftTimer <= 1e-9) {
          actuator.engagedGear = requestedGear;
          actuator.gearState = requestedGear > 0
            ? "engaging-ahead"
            : "engaging-astern";
          actuator.shiftTimer = clutch.engageTimeS;
        }
      }
    }

    function advanceActuators(input, dt) {
      const throttleTarget = clamp(finite(input.throttle), -1, 1);
      const rudderTarget = clamp(
        finite(input.rudder),
        -profile.rudder.maxAngle,
        profile.rudder.maxAngle
      );
      state.controls.throttleTarget = throttleTarget;
      state.controls.rudderTarget = rudderTarget;
      const rudderDelta = rudderTarget - state.controls.rudderActual;
      state.controls.rudderActual += clamp(
        rudderDelta,
        -profile.rudder.rate * dt,
        profile.rudder.rate * dt
      );
      const water = waterKinematics(state);
      for (let index = 0; index < profile.propulsors.length; index += 1) {
        const propulsor = profile.propulsors[index];
        const actuator = state.propulsion.units[index];
        const throttleTau = throttleTarget < 0 ? 0.48 : 0.38;
        actuator.commandActual += (
          throttleTarget - actuator.commandActual
        ) * (1 - Math.exp(-dt / throttleTau));
        if (
          Math.abs(throttleTarget) < 1e-5
          && Math.abs(actuator.commandActual) < 0.002
        ) {
          actuator.commandActual = 0;
        }
        const requestedGear = Math.abs(throttleTarget) > 0.012
          ? Math.sign(throttleTarget)
          : 0;
        advanceGearState(actuator, propulsor, requestedGear, dt);

        const transmissionActive = (
          actuator.gearState === "ahead"
          || actuator.gearState === "astern"
          || actuator.gearState === "engaging-ahead"
          || actuator.gearState === "engaging-astern"
        );
        const commandMagnitude = transmissionActive
          ? clamp(Math.abs(actuator.commandActual), 0, 1)
          : 0;
        const targetRpm = propulsor.idleRpm + (
          propulsor.maxRpm - propulsor.idleRpm
        ) * Math.pow(commandMagnitude, 0.72);
        const dynamics = propulsor.engineDynamics;
        const shaft = propulsor.shaft;
        const localU = water.relative.u - water.relative.r * propulsor.y;
        const targetOmega = targetRpm * Math.PI * 2 / 60;
        const currentRpm = Math.max(0, actuator.engineOmega * 60 / (Math.PI * 2));
        const maximumTorque = interpolateCurve(
          dynamics.torqueCurve,
          currentRpm,
          "rpm",
          "torqueNm"
        );
        const speedError = targetOmega - actuator.engineOmega;
        const governorIntegralBefore = actuator.governorIntegralNm;
        actuator.governorIntegralNm = clamp(
          actuator.governorIntegralNm
            + dynamics.governorKiNmPerRad * speedError * dt,
          0,
          maximumTorque
        );
        let engineTorque = clamp(
          actuator.governorIntegralNm
            + dynamics.governorKpNmPerRadS * speedError,
          0,
          maximumTorque
        );
        let engineFriction = dynamics.frictionNm * clamp(
          actuator.engineOmega / Math.max(EPSILON, targetOmega * 0.35),
          0,
          1.35
        );
        let propeller = propellerModel({
          shaftRps: actuator.shaftOmega / (Math.PI * 2),
          advanceSpeed: localU
        }, propulsor);
        let shaftFriction = (
          shaft.viscousFrictionNmPerRadS * actuator.shaftOmega
          + shaft.coulombFrictionNm * Math.tanh(actuator.shaftOmega / 0.5)
        );

        let engineOmega = actuator.engineOmega + (
          (engineTorque - engineFriction) / dynamics.inertiaKgM2
        ) * dt;
        let shaftOmega = actuator.shaftOmega + (
          (-propeller.torque - shaftFriction) / shaft.inertiaKgM2
        ) * dt;
        let clutchImpulse = 0;
        let shaftDriveTorque = 0;
        const fullyCoupled = (
          (actuator.gearState === "ahead" || actuator.gearState === "astern")
          && actuator.clutchEngagement >= 1 - 1e-9
        );
        if (fullyCoupled) {
          const ratio = actuator.engagedGear > 0
            ? propulsor.gearAhead
            : propulsor.gearAstern;
          const direction = actuator.engagedGear;
          const efficiency = propulsor.gearEfficiency;
          const reflectedInertia = (
            dynamics.inertiaKgM2
            + shaft.inertiaKgM2 / (ratio * ratio * efficiency)
          );
          const lockedShaftOmega = direction * actuator.engineOmega / ratio;
          const provisionalEngineTorque = clamp(
            governorIntegralBefore
              + dynamics.governorKpNmPerRadS * speedError,
            0,
            maximumTorque
          );
          const provisionalPropeller = propellerModel({
            shaftRps: lockedShaftOmega / (Math.PI * 2),
            advanceSpeed: localU
          }, propulsor);
          const provisionalShaftFriction = (
            shaft.viscousFrictionNmPerRadS * lockedShaftOmega
            + shaft.coulombFrictionNm * Math.tanh(lockedShaftOmega / 0.5)
          );
          const provisionalAcceleration = (
            provisionalEngineTorque
            - engineFriction
            - direction * (
              provisionalPropeller.torque + provisionalShaftFriction
            ) / (ratio * efficiency)
          ) / reflectedInertia;
          const midpointEngineOmega = (
            actuator.engineOmega + provisionalAcceleration * dt * 0.5
          );
          const midpointShaftOmega = direction * midpointEngineOmega / ratio;
          const midpointRpm = Math.max(
            0,
            midpointEngineOmega * 60 / (Math.PI * 2)
          );
          const midpointMaximumTorque = interpolateCurve(
            dynamics.torqueCurve,
            midpointRpm,
            "rpm",
            "torqueNm"
          );
          const midpointSpeedError = targetOmega - midpointEngineOmega;
          actuator.governorIntegralNm = clamp(
            governorIntegralBefore
              + dynamics.governorKiNmPerRad * midpointSpeedError * dt,
            0,
            midpointMaximumTorque
          );
          engineTorque = clamp(
            actuator.governorIntegralNm
              + dynamics.governorKpNmPerRadS * midpointSpeedError,
            0,
            midpointMaximumTorque
          );
          engineFriction = dynamics.frictionNm * clamp(
            midpointEngineOmega / Math.max(EPSILON, targetOmega * 0.35),
            0,
            1.35
          );
          propeller = propellerModel({
            shaftRps: midpointShaftOmega / (Math.PI * 2),
            advanceSpeed: localU
          }, propulsor);
          shaftFriction = (
            shaft.viscousFrictionNmPerRadS * midpointShaftOmega
            + shaft.coulombFrictionNm * Math.tanh(midpointShaftOmega / 0.5)
          );
          const acceleration = (
            engineTorque
            - engineFriction
            - direction * (propeller.torque + shaftFriction) / (ratio * efficiency)
          ) / reflectedInertia;
          engineOmega = actuator.engineOmega + acceleration * dt;
          shaftOmega = direction * engineOmega / ratio;
          const clutchTorque = (
            engineTorque - engineFriction - dynamics.inertiaKgM2 * acceleration
          );
          clutchImpulse = clutchTorque * dt;
          shaftDriveTorque = direction * ratio * efficiency * clutchTorque;
        } else if (actuator.engagedGear !== 0 && actuator.clutchEngagement > 0) {
          const ratio = actuator.engagedGear > 0
            ? propulsor.gearAhead
            : propulsor.gearAstern;
          const direction = actuator.engagedGear;
          const slip = engineOmega - direction * ratio * shaftOmega;
          const inverseEffectiveInertia = (
            1 / dynamics.inertiaKgM2
            + ratio * ratio * propulsor.gearEfficiency / shaft.inertiaKgM2
          );
          const idealImpulse = slip / Math.max(EPSILON, inverseEffectiveInertia);
          const maximumImpulse = (
            propulsor.clutch.capacityEngineNm
            * actuator.clutchEngagement
            * dt
          );
          clutchImpulse = clamp(idealImpulse, -maximumImpulse, maximumImpulse);
          engineOmega -= clutchImpulse / dynamics.inertiaKgM2;
          shaftOmega += (
            direction
            * ratio
            * propulsor.gearEfficiency
            * clutchImpulse
            / shaft.inertiaKgM2
          );
          shaftDriveTorque = (
            direction
            * ratio
            * propulsor.gearEfficiency
            * clutchImpulse
            / Math.max(EPSILON, dt)
          );
        }
        const minimumRunningOmega = propulsor.idleRpm * 0.52 * Math.PI * 2 / 60;
        const maximumRunningOmega = propulsor.maxRpm * Math.PI * 2 / 60;
        actuator.engineOmega = clamp(
          engineOmega,
          minimumRunningOmega,
          maximumRunningOmega
        );
        if (fullyCoupled) {
          const ratio = actuator.engagedGear > 0
            ? propulsor.gearAhead
            : propulsor.gearAstern;
          actuator.shaftOmega = actuator.engagedGear * actuator.engineOmega / ratio;
        } else {
          actuator.shaftOmega = Math.abs(shaftOmega) < 1e-5 ? 0 : shaftOmega;
        }
        actuator.engineRpm = actuator.engineOmega * 60 / (Math.PI * 2);
        actuator.shaftRps = actuator.shaftOmega / (Math.PI * 2);
        actuator.engineTorque = engineTorque;
        actuator.clutchTorque = clutchImpulse / Math.max(EPSILON, dt);
        actuator.shaftDriveTorque = shaftDriveTorque;
        actuator.propellerTorque = propeller.torque;
        actuator.enginePower = engineTorque * actuator.engineOmega;
        actuator.shaftPower = propeller.torque * actuator.shaftOmega;
      }
      Object.assign(state.propulsion, state.propulsion.units[0]);
    }

    function advanceSlipstreams(dt) {
      const water = waterKinematics(state);
      const propulsorById = new Map(
        profile.propulsors.map((propulsor, index) => [
          propulsor.id,
          { profile: propulsor, actuator: state.propulsion.units[index] }
        ])
      );
      const rudderById = new Map(profile.rudders.map(rudder => [rudder.id, rudder]));
      for (const wake of state.propulsion.slipstreams || []) {
        const source = propulsorById.get(wake.propulsorId);
        const rudder = rudderById.get(wake.rudderId);
        if (!source || !rudder) continue;
        const { profile: propulsor, actuator } = source;
        const localU = water.relative.u - water.relative.r * propulsor.y;
        const model = propellerModel({
          shaftRps: actuator.shaftRps,
          advanceSpeed: localU
        }, propulsor);
        const longitudinalOffset = rudder.x - propulsor.x;
        const acceleratedWaterDirection = -Math.sign(model.thrust);
        const downstream = (
          Math.abs(model.thrust) > EPSILON
          && longitudinalOffset * acceleratedWaterDirection > 0
        );
        const velocityFactor = downstream
          ? rudder.slipstream.downstreamVelocityFactor
          : rudder.slipstream.upstreamVelocityFactor;
        const targetAxialVelocity = model.inducedVelocity * velocityFactor;
        const rotationSign = propulsor.rotation === "left" ? 1 : -1;
        const targetTangentialVelocity = (
          rotationSign
          * Math.sign(actuator.shaftRps)
          * Math.abs(targetAxialVelocity)
          * rudder.slipstream.swirlFraction
          * environment.propWalk
        );
        const convectionSpeed = Math.max(
          0.15,
          Math.abs(localU) + Math.abs(targetAxialVelocity)
        );
        const [minimumTime, maximumTime] = rudder.slipstream.convectionTimeBoundsS;
        const convectionTimeS = clamp(
          Math.abs(longitudinalOffset) / convectionSpeed,
          minimumTime,
          maximumTime
        );
        const blend = 1 - Math.exp(-dt / convectionTimeS);
        wake.axialVelocity += (
          targetAxialVelocity - wake.axialVelocity
        ) * blend;
        wake.tangentialVelocity += (
          targetTangentialVelocity - wake.tangentialVelocity
        ) * blend;
        if (Math.abs(wake.axialVelocity) < 1e-8) wake.axialVelocity = 0;
        if (Math.abs(wake.tangentialVelocity) < 1e-8) wake.tangentialVelocity = 0;
        wake.targetAxialVelocity = targetAxialVelocity;
        wake.targetTangentialVelocity = targetTangentialVelocity;
        wake.convectionTimeS = convectionTimeS;
        wake.downstream = downstream;
      }
    }

    function midpointState(base, acceleration, dt) {
      const middle = deepClone(base);
      middle.velocity.u += acceleration[0] * dt * 0.5;
      middle.velocity.v += acceleration[1] * dt * 0.5;
      middle.velocity.r += acceleration[2] * dt * 0.5;
      const velocityWorld = bodyToWorld(
        middle.velocity.u,
        middle.velocity.v,
        base.pose.heading
      );
      middle.pose.east += velocityWorld.east * dt * 0.5;
      middle.pose.north += velocityWorld.north * dt * 0.5;
      middle.pose.heading = wrapAngle(base.pose.heading + middle.velocity.r * dt * 0.5);
      return middle;
    }

    function registerContacts(contactResult) {
      for (const sample of contactResult.samples) {
        if (activeContactIds.has(sample.id)) continue;
        state.contacts.maxImpact = Math.max(state.contacts.maxImpact, sample.impactSpeed);
        if (sample.impactSpeed > 0.08) state.contacts.impacts += 1;
        if (sample.impactSpeed > 0.4) state.contacts.severe += 1;
      }
      activeContactIds = contactResult.seen;
      state.contacts.current = contactResult.samples;
    }

    function solveMooringVelocities(dt) {
      if (!state.moorings.length) return [];
      for (const mooring of state.moorings) {
        mooring.impulse = 0;
        mooring.tension = 0;
        mooring.guardActive = false;
      }
      const constraints = [];
      for (const mooring of state.moorings) {
        const geometry = mooringGeometry(mooring);
        if (geometry.distance <= EPSILON) continue;
        const inverseMassJacobian = solveMass(
          massProperties.matrix,
          geometry.jacobian
        );
        const effectiveInverseMass = (
          geometry.jacobian[0] * inverseMassJacobian[0]
          + geometry.jacobian[1] * inverseMassJacobian[1]
          + geometry.jacobian[2] * inverseMassJacobian[2]
        );
        if (effectiveInverseMass <= EPSILON) continue;
        const restLength = Math.max(0.05, mooring.length);
        const extension = Math.max(0, geometry.distance - restLength);
        const strain = extension / restLength;
        const elasticity = mooring.elasticity || profile.mooring.elasticity;
        const ratio = strain / elasticity.workingStrain;
        const hardeningRatio = Math.max(0, ratio - 1);
        const elasticTension = extension > 0
          ? elasticity.workingLoadN * (
            ratio + elasticity.hardeningGain * hardeningRatio ** 3
          )
          : 0;
        const stiffness = Math.max(
          EPSILON,
          elasticity.workingLoadN
            / (elasticity.workingStrain * restLength)
            * (1 + 3 * elasticity.hardeningGain * hardeningRatio ** 2)
        );
        const effectiveMass = 1 / effectiveInverseMass;
        const damping = (
          2
          * elasticity.dampingRatio
          * Math.sqrt(stiffness * effectiveMass)
        );
        const softnessDenominator = Math.max(EPSILON, damping + dt * stiffness);
        constraints.push({
          mooring,
          geometry,
          jacobian: geometry.jacobian,
          inverseMassJacobian,
          effectiveInverseMass,
          gap: geometry.distance - restLength,
          softness: 1 / (dt * softnessDenominator),
          biasVelocity: elasticTension / softnessDenominator
        });
      }
      for (let iteration = 0; iteration < profile.mooring.solverIterations; iteration += 1) {
        for (const constraint of constraints) {
          const { mooring, jacobian } = constraint;
          const pointVelocity = (
            jacobian[0] * state.velocity.u
            + jacobian[1] * state.velocity.v
            + jacobian[2] * state.velocity.r
          );
          if (
            constraint.gap < -profile.mooring.tautTolerance
            && constraint.gap + pointVelocity * dt <= 0
            && mooring.impulse <= EPSILON
          ) continue;
          const previousImpulse = mooring.impulse;
          mooring.impulse = Math.max(
            0,
            previousImpulse + (
              pointVelocity
              + constraint.biasVelocity
              - constraint.softness * previousImpulse
            ) / (constraint.effectiveInverseMass + constraint.softness)
          );
          const deltaImpulse = mooring.impulse - previousImpulse;
          if (Math.abs(deltaImpulse) <= EPSILON) continue;
          state.velocity.u -= constraint.inverseMassJacobian[0] * deltaImpulse;
          state.velocity.v -= constraint.inverseMassJacobian[1] * deltaImpulse;
          state.velocity.r -= constraint.inverseMassJacobian[2] * deltaImpulse;
        }
      }
      const forces = [];
      for (const constraint of constraints) {
        const { mooring, geometry } = constraint;
        mooring.tension = mooring.impulse / Math.max(dt, EPSILON);
        if (mooring.tension <= EPSILON) continue;
        const X = -geometry.normalBody.u * mooring.tension;
        const Y = -geometry.normalBody.v * mooring.tension;
        const N = mooring.boatPoint.x * Y - mooring.boatPoint.y * X;
        const localU = state.velocity.u - state.velocity.r * mooring.boatPoint.y;
        const localV = state.velocity.v + state.velocity.r * mooring.boatPoint.x;
        forces.push({
          source: `${mooring.sourceType === "pendille" ? "Pendille" : "Aussière"} · ${mooring.id}`,
          X,
          Y,
          N,
          applicationPoint: {
            x: mooring.boatPoint.x,
            y: mooring.boatPoint.y
          },
          power: X * localU + Y * localV,
          category: "mooring",
          mooringId: mooring.id,
          sourceType: mooring.sourceType || "mooring",
          facilityId: mooring.facilityId || null,
          tension: mooring.tension,
          extension: Math.max(0, geometry.distance - mooring.length),
          strain: Math.max(0, geometry.distance - mooring.length)
            / Math.max(0.05, mooring.length)
        });
      }
      return forces;
    }

    function advanceMooringLengths(dt) {
      for (const mooring of state.moorings) {
        const targetLength = Number.isFinite(mooring.targetLength)
          ? mooring.targetLength
          : mooring.length;
        const difference = targetLength - mooring.length;
        let delta = 0;
        if (difference < -EPSILON) {
          const geometry = mooringGeometry(mooring);
          const availableSlack = Math.max(
            0,
            mooring.length - geometry.distance
          );
          const takeUp = Math.min(
            Math.abs(difference),
            availableSlack,
            profile.mooring.haulInRate * dt
          );
          delta = -takeUp;
        } else if (difference > EPSILON) {
          delta = Math.min(
            difference,
            profile.mooring.payOutRate * dt
          );
        }
        if (Math.abs(delta) <= EPSILON) {
          mooring.lengthRate = 0;
          mooring.horizontalLimitRate = 0;
          continue;
        }
        const previousHorizontalLimit = mooring.horizontalLimit;
        mooring.length += delta;
        const verticalDistance = Number.isFinite(mooring.verticalDistance)
          ? mooring.verticalDistance
          : Math.abs(mooring.boatPoint.z - mooring.shorePoint.z);
        mooring.horizontalLimit = Math.sqrt(Math.max(
          0,
          mooring.length * mooring.length - verticalDistance * verticalDistance
        ));
        mooring.lengthRate = delta / Math.max(dt, EPSILON);
        mooring.horizontalLimitRate = (
          mooring.horizontalLimit - previousHorizontalLimit
        ) / Math.max(dt, EPSILON);
      }
    }

    function solveMooringPositions() {
      if (!state.moorings.length) return;
      const tolerance = profile.mooring.solverTolerance;
      for (let iteration = 0; iteration < profile.mooring.solverIterations; iteration += 1) {
        let maximumViolation = 0;
        for (const mooring of state.moorings) {
          const geometry = mooringGeometry(mooring);
          const maximumStrain = (mooring.elasticity || profile.mooring.elasticity).maximumStrain;
          const maximumDistance = mooring.length * (1 + maximumStrain);
          const violation = geometry.distance - maximumDistance;
          maximumViolation = Math.max(maximumViolation, violation);
          if (violation <= tolerance || geometry.distance <= EPSILON) continue;
          mooring.guardActive = true;
          const inverseMassJacobian = solveMass(
            massProperties.matrix,
            geometry.jacobian
          );
          const effectiveInverseMass = (
            geometry.jacobian[0] * inverseMassJacobian[0]
            + geometry.jacobian[1] * inverseMassJacobian[1]
            + geometry.jacobian[2] * inverseMassJacobian[2]
          );
          if (effectiveInverseMass <= EPSILON) continue;
          const correctionMagnitude = (
            Math.min(violation - tolerance, 0.08)
            / effectiveInverseMass
          );
          const correction = solveMass(
            massProperties.matrix,
            geometry.jacobian.map(value => -value * correctionMagnitude)
          );
          const worldCorrection = bodyToWorld(
            correction[0],
            correction[1],
            state.pose.heading
          );
          state.pose.east += worldCorrection.east;
          state.pose.north += worldCorrection.north;
          state.pose.heading = wrapAngle(state.pose.heading + correction[2]);
        }
        if (maximumViolation <= tolerance) break;
      }
      updateMooringDiagnostics();
    }

    function advanceOne(input, dt) {
      advanceActuators(input, dt);
      advanceSlipstreams(dt);
      advancePendilles(dt);
      advanceMooringLengths(dt);
      const first = evaluateForces(state, dt);
      const middle = midpointState(state, first.acceleration, dt);
      const second = evaluateForces(middle, dt);
      state.velocity.u += second.acceleration[0] * dt;
      state.velocity.v += second.acceleration[1] * dt;
      state.velocity.r += second.acceleration[2] * dt;
      const mooringForces = solveMooringVelocities(dt);
      const constrained = mooringForces.length > 0;
      const worldVelocity = bodyToWorld(
        constrained ? state.velocity.u : middle.velocity.u,
        constrained ? state.velocity.v : middle.velocity.v,
        constrained ? state.pose.heading : middle.pose.heading
      );
      state.pose.east += worldVelocity.east * dt + second.contact.correction.east;
      state.pose.north += worldVelocity.north * dt + second.contact.correction.north;
      state.pose.heading = wrapAngle(
        state.pose.heading + (constrained ? state.velocity.r : middle.velocity.r) * dt
      );
      solveMooringPositions();
      for (let index = 0; index < second.propeller.units.length; index += 1) {
        const model = second.propeller.units[index];
        Object.assign(state.propulsion.units[index], {
          thrust: model.thrust,
          propellerTorque: model.torque,
          advanceRatio: model.advanceRatio,
          inducedVelocity: model.inducedVelocity,
          hydrodynamicPitchAngle: model.hydrodynamicPitchAngle,
          thrustCoefficient: model.thrustCoefficient,
          torqueCoefficient: model.torqueCoefficient,
          safetyLimitActive: model.safetyLimitActive,
          shaftPower: model.shaftPower,
          usefulPower: model.usefulPower
        });
      }
      Object.assign(state.propulsion, state.propulsion.units[0]);
      registerContacts(second.contact);
      lastContactSamples = second.contact.samples;
      lastForces = [...second.accumulator.parts, ...mooringForces];
      simulationTime += dt;
      if (![
        state.pose.east,
        state.pose.north,
        state.pose.heading,
        state.velocity.u,
        state.velocity.v,
        state.velocity.r
      ].every(Number.isFinite)) {
        throw new Error("État physique non fini.");
      }
    }

    function step(input = {}, dt = MAX_STEP) {
      const duration = clamp(finite(dt), 0, 1);
      const count = Math.max(1, Math.ceil(duration / MAX_STEP));
      const substep = duration / count;
      for (let index = 0; index < count; index += 1) advanceOne(input, substep);
      return snapshot();
    }

    function snapshot() {
      const water = waterKinematics(state);
      const groundWorld = bodyToWorld(
        state.velocity.u,
        state.velocity.v,
        state.pose.heading
      );
      const groundSpeed = Math.hypot(groundWorld.east, groundWorld.north);
      const waterSpeed = Math.hypot(water.relative.u, water.relative.v);
      const pivotWaterX = Math.abs(water.relative.r) > 1e-4
        ? -water.relative.v / water.relative.r
        : null;
      const pivotGroundX = Math.abs(state.velocity.r) > 1e-4
        ? -state.velocity.v / state.velocity.r
        : null;
      return deepClone({
        profile: {
          id: profile.id,
          version: profile.version,
          schemaVersion: profile.schemaVersion,
          physicsVersion: PHYSICS_VERSION
        },
        pose: state.pose,
        velocity: state.velocity,
        waterRelative: water.relative,
        propulsion: state.propulsion,
        controls: state.controls,
        environment,
        contacts: state.contacts,
        moorings: state.moorings,
        pendilles: state.pendilles.map(pendille => {
          const mooring = pendille.mooringId
            ? state.moorings.find(item => item.id === pendille.mooringId)
            : null;
          return {
            ...pendille,
            distance: mooring?.distance ?? Math.hypot(
              pendille.anchorPoint.east - pendille.pickupPoint.east,
              pendille.anchorPoint.north - pendille.pickupPoint.north,
              pendille.anchorPoint.z - pendille.pickupPoint.z
            ),
            length: mooring?.length ?? null,
            targetLength: mooring?.targetLength ?? null,
            tension: mooring?.tension ?? 0,
            extension: mooring?.extension ?? 0,
            strain: mooring?.strain ?? 0
          };
        }),
        diagnostics: {
          groundSpeed,
          waterSpeed,
          pivotWaterX,
          pivotGroundX,
          groundVelocity: groundWorld,
          mooringGuardActive: state.moorings.some(mooring => mooring.guardActive),
          mooringElasticEnergy: state.moorings.reduce(
            (sum, mooring) => sum + (mooring.elasticEnergy || 0),
            0
          ),
          pendillePropellerDanger: state.pendilles.some(pendille => pendille.danger)
        },
        massMatrix: massProperties.matrix,
        time: simulationTime
      });
    }

    function forceBreakdown() {
      return deepClone(lastForces);
    }

    function inspectForces() {
      const evaluation = evaluateForces(state, MAX_STEP);
      return {
        acceleration: [...evaluation.acceleration],
        forces: deepClone(evaluation.accumulator.parts),
        total: {
          X: evaluation.accumulator.X,
          Y: evaluation.accumulator.Y,
          N: evaluation.accumulator.N
        },
        waterRelative: deepClone(evaluation.water.relative),
        coriolis: {
          ...deepClone(evaluation.coriolis),
          power: (
            evaluation.water.relative.u * evaluation.coriolis.X
            + evaluation.water.relative.v * evaluation.coriolis.Y
            + evaluation.water.relative.r * evaluation.coriolis.N
          )
        },
        appendages: deepClone(evaluation.appendages),
        propeller: deepClone(evaluation.propeller),
        rudder: deepClone(evaluation.rudder),
        wind: deepClone(evaluation.wind)
      };
    }

    reset(options.initialState, options.environment);

    return Object.freeze({
      reset,
      step,
      snapshot,
      forceBreakdown,
      inspectForces,
      setEnvironment,
      setObstacles,
      setCalibration,
      attachMooring,
      setMooringLength,
      detachMooring,
      clearMoorings,
      registerPendille,
      beginPendillePickup,
      cancelPendillePickup,
      releasePendille,
      clearPendilles,
      getProfile: () => deepClone(profile),
      getMassProperties: () => deepClone(massProperties),
      getObstacleIndexReport: () => ({
        records: obstacleIndex.records.length,
        cells: obstacleIndex.cells.size,
        global: obstacleIndex.global.length,
        cellSize: obstacleIndex.cellSize
      }),
      classifyImpact
    });
  }

  return Object.freeze({
    VERSION: PHYSICS_VERSION,
    DEG,
    KNOT,
    RHO_WATER,
    RHO_AIR,
    MAX_STEP,
    DEFAULT_PROFILE,
    RAW_PROFILES: VesselProfiles.RAW_PROFILES,
    COMPILED_PROFILES: VesselProfiles.COMPILED_PROFILES,
    validateVesselProfile: VesselProfiles.validateVesselProfile,
    compileVesselProfile: VesselProfiles.compileVesselProfile,
    applyCalibrationPatch: VesselProfiles.applyCalibrationPatch,
    createSimulator,
    computeMassMatrix,
    massMatrixIsPositiveDefinite,
    samplePeriodicCurve,
    mooringElasticLaw,
    propellerModel,
    foilModel,
    bodyToWorld,
    worldToBody,
    localPointToWorld,
    nauticalVectorFromSource,
    classifyImpact,
    pointRectContact,
    isContactSurfaceEnabled,
    pointPolylineContact,
    pointPolygonContact,
    pointCircleContact,
    pointInPolygon,
    buildObstacleIndex,
    queryObstacleIndex,
    wrapAngle
  });
});
