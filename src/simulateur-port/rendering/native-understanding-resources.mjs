import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3
} from "three";

const FORCE_CAPACITY = 64;
const Y_AXIS = new Vector3(0, 1, 0);

function finiteVector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`Vue Comprendre native : ${label} invalide`);
  }
  return value;
}

function colorValue(value, label) {
  if (typeof value !== "string" || !value) {
    throw new TypeError(`Vue Comprendre native : ${label} absent`);
  }
  return value;
}

function geometryReport(geometry) {
  return {
    uuid: geometry.uuid,
    attributes: Object.fromEntries(Object.entries(geometry.attributes)
      .map(([name, attribute]) => [name, attribute.version]))
  };
}

function createTarget(name, color, dashed = false) {
  const group = new Group();
  group.name = name;
  group.userData = { owner: name, family: "player-understanding-pivot", kind: "group" };
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: dashed ? .72 : .92,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  material.name = `${name}:material`;
  material.userData.role = dashed ? "understand.pivotGround" : "understand.pivotWater";
  const ringGeometry = new RingGeometry(dashed ? .14 : .16, dashed ? .20 : .23, 32);
  const ring = new Mesh(ringGeometry, material);
  ring.name = `${name}:ring`;
  ring.userData = { owner: name, family: "player-understanding-pivot", kind: "mesh" };
  const sideRing = new Mesh(ringGeometry, material);
  sideRing.name = `${name}:side-ring`;
  sideRing.rotation.y = Math.PI / 2;
  sideRing.userData = { owner: name, family: "player-understanding-pivot", kind: "mesh" };
  const centerGeometry = new SphereGeometry(.04, 10, 6);
  const center = new Mesh(centerGeometry, material);
  center.name = `${name}:center`;
  center.userData = { owner: name, family: "player-understanding-pivot", kind: "mesh" };
  const barGeometry = new BoxGeometry(.52, .045, .025);
  const horizontal = new Mesh(barGeometry, material);
  horizontal.name = `${name}:cross-horizontal`;
  horizontal.userData = { owner: name, family: "player-understanding-pivot", kind: "mesh" };
  const vertical = new Mesh(barGeometry, material);
  vertical.name = `${name}:cross-vertical`;
  vertical.rotation.z = Math.PI / 2;
  vertical.userData = { owner: name, family: "player-understanding-pivot", kind: "mesh" };
  for (const object of [ring, sideRing, center, horizontal, vertical]) {
    object.renderOrder = 50;
    object.frustumCulled = false;
    group.add(object);
  }
  return { group, material, geometries: [ringGeometry, centerGeometry, barGeometry] };
}

function createPropeller(position, radius, color) {
  const group = new Group();
  group.name = "KJP_Player_Understanding_Propeller";
  group.position.set(...position);
  group.userData = { owner: "player-understanding:propeller", family: "player-propeller", kind: "group" };
  const material = new MeshBasicMaterial({
    color, transparent: true, opacity: 1, side: DoubleSide,
    depthTest: true, depthWrite: false, toneMapped: false
  });
  material.name = "player-understanding:propeller-material";
  material.userData.role = "understand.propeller";
  const hubGeometry = new CylinderGeometry(radius * .17, radius * .17, radius * .48, 16);
  const shaftGeometry = new CylinderGeometry(radius * .075, radius * .075, 1.1, 10);
  // Une pale large et légèrement balayée, dans le vrai plan du disque YZ.
  // Trois rotations autour de l'axe longitudinal forment l'hélice.
  const outline = [
    [.16, -.14], [.43, -.34], [.82, -.25], [1, .02],
    [.87, .26], [.53, .34], [.20, .20]
  ];
  const bladePositions = [];
  for (let index = 1; index < outline.length - 1; index++) {
    for (const vertex of [outline[0], outline[index], outline[index + 1]]) {
      bladePositions.push(0, vertex[0] * radius, vertex[1] * radius);
    }
  }
  const bladeGeometry = new BufferGeometry();
  bladeGeometry.setAttribute("position", new Float32BufferAttribute(bladePositions, 3));
  bladeGeometry.computeVertexNormals();
  const shaft = new Mesh(shaftGeometry, material);
  shaft.name = "player-understanding:propeller-shaft";
  shaft.position.x = .55;
  shaft.rotation.z = Math.PI / 2;
  shaft.userData = { owner: "player-understanding:propeller", family: "player-propeller", kind: "mesh" };
  group.add(shaft);
  const hub = new Mesh(hubGeometry, material);
  hub.name = "player-understanding:propeller-hub";
  hub.rotation.z = Math.PI / 2;
  hub.userData = { owner: "player-understanding:propeller", family: "player-propeller", kind: "mesh" };
  group.add(hub);
  for (let index = 0; index < 3; index++) {
    const blade = new Mesh(bladeGeometry, material);
    const angle = index * Math.PI * 2 / 3;
    blade.name = `player-understanding:propeller-blade:${index}`;
    blade.rotation.x = angle;
    blade.userData = { owner: "player-understanding:propeller", family: "player-propeller", kind: "mesh" };
    group.add(blade);
  }
  for (const object of group.children) {
    object.renderOrder = 24;
    object.frustumCulled = false;
  }
  return { group, material, geometries: [hubGeometry, bladeGeometry, shaftGeometry] };
}

export function createNativeUnderstandingResources(configuration) {
  const propellerPosition = finiteVector(configuration?.propellerPosition, "position d'hélice");
  const propellerRadius = configuration?.propellerRadius;
  if (!Number.isFinite(propellerRadius) || propellerRadius <= 0) {
    throw new TypeError("Vue Comprendre native : rayon d'hélice invalide");
  }

  const group = new Group();
  group.name = "KJP_Player_Understanding";
  group.userData = { owner: "player-understanding", family: "player-understanding", kind: "group" };

  const shaftGeometry = new CylinderGeometry(1, 1, 1, 12);
  const headGeometry = new ConeGeometry(1, 1, 16);
  const markerGeometry = new SphereGeometry(1, 12, 8);
  const forceMaterial = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  forceMaterial.name = "player-understanding:force-material";
  forceMaterial.userData.role = "understand.force";
  const outlineMaterial = new MeshBasicMaterial({
    color: configuration.forceOutlineColor || "#102e38",
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
  outlineMaterial.name = "player-understanding:force-outline-material";
  outlineMaterial.userData.role = "understand.forceOutline";

  const shafts = new InstancedMesh(shaftGeometry, forceMaterial, FORCE_CAPACITY);
  const heads = new InstancedMesh(headGeometry, forceMaterial, FORCE_CAPACITY);
  const markers = new InstancedMesh(markerGeometry, forceMaterial, FORCE_CAPACITY);
  const shaftOutlines = new InstancedMesh(shaftGeometry, outlineMaterial, FORCE_CAPACITY);
  const headOutlines = new InstancedMesh(headGeometry, outlineMaterial, FORCE_CAPACITY);
  const markerOutlines = new InstancedMesh(markerGeometry, outlineMaterial, FORCE_CAPACITY);
  for (const [name, object] of [["shaft-outlines", shaftOutlines], ["head-outlines", headOutlines], ["marker-outlines", markerOutlines]]) {
    object.name = `player-understanding:force-${name}`;
    object.userData = { owner: "player-understanding:forces", family: "player-understanding-force-outline", kind: "instanced-mesh" };
    object.instanceMatrix.setUsage(DynamicDrawUsage);
    object.frustumCulled = false;
    object.renderOrder = 39;
    object.count = 0;
    group.add(object);
  }
  for (const [name, object] of [["shafts", shafts], ["heads", heads], ["markers", markers]]) {
    object.name = `player-understanding:force-${name}`;
    object.userData = { owner: "player-understanding:forces", family: "player-understanding-force", kind: "instanced-mesh" };
    object.instanceMatrix.setUsage(DynamicDrawUsage);
    object.frustumCulled = false;
    object.renderOrder = 40;
    for (let index = 0; index < FORCE_CAPACITY; index++) object.setColorAt(index, new Color(0xffffff));
    object.count = 0;
    group.add(object);
  }

  const propeller = createPropeller(propellerPosition, propellerRadius, configuration.propellerColor || "#a9bec4");
  const waterPivot = createTarget("player-understanding:pivot-water", configuration.pivotWaterColor || "#f0b763");
  const groundPivot = createTarget("player-understanding:pivot-ground", configuration.pivotGroundColor || "#62dbe3", true);
  group.add(propeller.group, waterPivot.group, groundPivot.group);
  group.visible = false;

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const positionVector = new Vector3();
  const scaleVector = new Vector3();
  const direction = new Vector3();
  const forceColor = new Color();
  const identityQuaternion = new Quaternion();
  let previousForces = [];
  let current = { enabled: false, forceCount: 0, forceIds: [], pivots: { water: false, ground: false } };
  let disposed = false;

  function writeInstance(object, index, position, orientation, scale, color = null) {
    matrix.compose(position, orientation, scale);
    object.setMatrixAt(index, matrix);
    if (color) object.setColorAt(index, color);
  }

  function forcesChanged(forces) {
    if (forces.length !== previousForces.length) return true;
    return forces.some((force, index) => {
      const previous = previousForces[index];
      return String(force.id) !== previous.id || force.color !== previous.color
        || force.origin.some((value, axis) => value !== previous.origin[axis])
        || force.vector.some((value, axis) => value !== previous.vector[axis]);
    });
  }

  function rememberForces(forces) {
    previousForces = forces.map(force => ({
      id: String(force.id), color: force.color,
      origin: [...force.origin], vector: [...force.vector]
    }));
  }

  function update(presentation) {
    if (disposed) throw new Error("Vue Comprendre native : ressources libérées");
    const enabled = Boolean(presentation?.enabled);
    const forces = Array.isArray(presentation?.forces) ? presentation.forces : [];
    if (forces.length > FORCE_CAPACITY) {
      throw new RangeError(`Vue Comprendre native : ${forces.length} forces dépassent la capacité ${FORCE_CAPACITY}`);
    }
    group.visible = enabled;
    propeller.material.color.setStyle(colorValue(presentation?.palette?.propeller, "couleur d'hélice"));
    outlineMaterial.color.setStyle(colorValue(presentation?.palette?.forceOutline, "contour des forces"));
    waterPivot.material.color.setStyle(colorValue(presentation?.palette?.pivotWater, "couleur du pivot eau"));
    groundPivot.material.color.setStyle(colorValue(presentation?.palette?.pivotGround, "couleur du pivot fond"));

    if (!enabled) {
      for (const object of [shafts, heads, markers, shaftOutlines, headOutlines, markerOutlines]) object.count = 0;
      previousForces = [];
      waterPivot.group.visible = false;
      groundPivot.group.visible = false;
      current = { enabled: false, forceCount: 0, forceIds: [], pivots: { water: false, ground: false } };
      return;
    }

    let count = 0;
    const forceIds = [];
    const rewriteForces = forcesChanged(forces);
    for (const force of forces) {
      const origin = finiteVector(force.origin, "origine de force");
      const vector = finiteVector(force.vector, "vecteur de force");
      const length = Math.hypot(...vector);
      if (!(length > 0)) continue;
      forceColor.setStyle(colorValue(force.color, "couleur de force"));
      direction.set(...vector).normalize();
      quaternion.setFromUnitVectors(Y_AXIS, direction);
      const headLength = Math.min(.55, length * .32);
      const shaftLength = Math.max(0, length - headLength);
      const shaftRadius = Math.min(.07, length * .07);
      const headRadius = Math.min(.18, length * .16);
      const markerRadius = Math.min(.12, length * .12);

        if (rewriteForces) {
          positionVector.set(...origin).addScaledVector(direction, shaftLength / 2);
          scaleVector.set(shaftRadius, Math.max(shaftLength, 1e-7), shaftRadius);
          writeInstance(shafts, count, positionVector, quaternion, scaleVector, forceColor);
          scaleVector.x *= 1.55;
          scaleVector.z *= 1.55;
          writeInstance(shaftOutlines, count, positionVector, quaternion, scaleVector);
          positionVector.set(...origin).addScaledVector(direction, shaftLength + headLength / 2);
          scaleVector.set(headRadius, headLength, headRadius);
          writeInstance(heads, count, positionVector, quaternion, scaleVector, forceColor);
          scaleVector.x *= 1.38;
          scaleVector.z *= 1.38;
          writeInstance(headOutlines, count, positionVector, quaternion, scaleVector);
          positionVector.set(...origin);
          scaleVector.setScalar(markerRadius);
          writeInstance(markers, count, positionVector, identityQuaternion, scaleVector, forceColor);
          scaleVector.multiplyScalar(1.45);
          writeInstance(markerOutlines, count, positionVector, identityQuaternion, scaleVector);
      }
      forceIds.push(String(force.id));
      count++;
    }
    for (const object of [shafts, heads, markers, shaftOutlines, headOutlines, markerOutlines]) {
      object.count = count;
      if (rewriteForces) {
        object.instanceMatrix.needsUpdate = true;
        if (object.instanceColor) object.instanceColor.needsUpdate = true;
      }
    }
    if (rewriteForces) rememberForces(forces);

    const pivots = presentation?.pivots || {};
    const applyPivot = (target, value) => {
      target.group.visible = Boolean(value?.visible);
      if (target.group.visible) target.group.position.set(...finiteVector(value.position, "position de pivot"));
    };
    applyPivot(waterPivot, pivots.water);
    applyPivot(groundPivot, pivots.ground);
    current = {
      enabled: true,
      forceCount: count,
      forceIds,
      pivots: { water: waterPivot.group.visible, ground: groundPivot.group.visible }
    };
  }

  function report() {
    if (disposed) throw new Error("Vue Comprendre native : ressources libérées");
    return {
      ...current,
      capacity: FORCE_CAPACITY,
      pivotPositions: {
        water: waterPivot.group.visible ? waterPivot.group.position.toArray() : null,
        ground: groundPivot.group.visible ? groundPivot.group.position.toArray() : null
      },
      propeller: {
        visible: group.visible,
        position: propeller.group.position.toArray(),
        radius: propellerRadius
      },
      renderOrder: { model: 20, propeller: 24, forces: 40, pivots: 50 },
      depth: { forcesTest: forceMaterial.depthTest, forcesWrite: forceMaterial.depthWrite },
      outline: { color: `#${outlineMaterial.color.getHexString()}`, depthTest: outlineMaterial.depthTest },
      geometries: {
        shaft: geometryReport(shaftGeometry),
        head: geometryReport(headGeometry),
        marker: geometryReport(markerGeometry),
        propellerHub: geometryReport(propeller.geometries[0]),
        propellerBlade: geometryReport(propeller.geometries[1]),
        propellerShaft: geometryReport(propeller.geometries[2])
      },
      instanceVersions: {
        shafts: shafts.instanceMatrix.version,
        heads: heads.instanceMatrix.version,
        markers: markers.instanceMatrix.version,
        shaftOutlines: shaftOutlines.instanceMatrix.version,
        headOutlines: headOutlines.instanceMatrix.version,
        markerOutlines: markerOutlines.instanceMatrix.version
      }
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const geometry of [shaftGeometry, headGeometry, markerGeometry,
      ...propeller.geometries, ...waterPivot.geometries, ...groundPivot.geometries]) geometry.dispose();
    for (const material of [forceMaterial, outlineMaterial, propeller.material, waterPivot.material, groundPivot.material]) material.dispose();
  }

  return Object.freeze({ group, update, report, dispose });
}
