import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Plane, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import embeddedPlayerModel from "../../../kjp_sun_odyssey_36i.glb";

const ASSET_NAME = "kjp_sun_odyssey_36i.glb";
const GROUP_ROLE_INDEX = Object.freeze({ hull: 0, silhouette: 1, organ: 2, roof: 3, hidden: 4 });
// Le catalogue GLB donne les totaux par nom, mais PAS leurs offsets : l'ordre
// des indices est celui de l'exporteur, différent de l'ordre alphabétique JSON.
// Ces plages ont été relevées sur le GLB livré et sont liées à son empreinte.
const ASSET_FNV32 = 0x1fb19642;
const INDEX_SPANS = Object.freeze([
  ["upper_sheer", 58, "silhouette"],
  ["sheer_stripe", 58, "silhouette"],
  ["hull_sides", 118, "hull"],
  ["hull_underwater", 148, "hidden"],
  ["transom", 6, "hull"],
  ["waterline_stripe", 60, "silhouette"],
  ["hull_portlights", 24, "hidden"],
  ["deck", 40, "hull"],
  ["deck_edge", 58, "silhouette"],
  ["cockpit_and_stern_furniture", 414, "hidden"],
  ["coachroof", 56, "roof"],
  ["coachroof_windows", 10, "roof"],
  ["deck_fittings", 78, "hidden"],
  ["wheel_and_cockpit_furniture", 248, "hidden"],
  ["mast_and_rigging", 204, "hidden"],
  ["stanchions_and_railings", 264, "hidden"],
  ["keel_fin", 12, "organ"],
  ["keel_bulb", 76, "organ"],
  ["rudder", 16, "organ"]
]);
let loadPromise = null;
let loadedTemplate = null;
let loadError = null;
let loadCount = 0;

function finiteVector(value, size, label) {
  if (!Array.isArray(value) || value.length !== size || !value.every(Number.isFinite)) {
    throw new TypeError(`Modèle joueur natif : ${label} invalide`);
  }
  return [...value];
}

function boxReport(box) {
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: [
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z
    ]
  };
}

function assetFingerprint(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}

function indexedRangeBounds(geometry, start, count) {
  const position = geometry.getAttribute("position");
  const lower = [Infinity, Infinity, Infinity];
  const upper = [-Infinity, -Infinity, -Infinity];
  for (let offset = start; offset < start + count; offset++) {
    const vertex = geometry.index.getX(offset);
    const values = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
    for (let axis = 0; axis < 3; axis++) {
      lower[axis] = Math.min(lower[axis], values[axis]);
      upper[axis] = Math.max(upper[axis], values[axis]);
    }
  }
  return Object.freeze({ min: Object.freeze(lower), max: Object.freeze(upper) });
}

function prepareSourceGroups(geometry, sourceParts) {
  if (!sourceParts || typeof sourceParts !== "object" || Array.isArray(sourceParts)) {
    throw new Error("Modèle joueur natif : catalogue des parties GLB absent");
  }
  const entries = Object.entries(sourceParts);
  if (!entries.length || entries.some(([, triangles]) => !Number.isInteger(triangles) || triangles <= 0)) {
    throw new Error("Modèle joueur natif : catalogue des parties GLB invalide");
  }
  const expectedIndices = entries.reduce((sum, [, triangles]) => sum + triangles * 3, 0);
  if (expectedIndices !== geometry.index.count) {
    throw new Error(`Modèle joueur natif : ${expectedIndices / 3} triangles catalogués pour ${geometry.index.count / 3}`);
  }
  if (assetFingerprint(embeddedPlayerModel) !== ASSET_FNV32) {
    throw new Error("Modèle joueur natif : ordre des indices GLB inconnu pour la radiographie");
  }
  for (const name of ["hull_underwater", "keel_fin", "keel_bulb", "rudder"]) {
    const indexed = INDEX_SPANS.find(span => span[0] === name);
    if (sourceParts[name] !== indexed?.[1]) {
      throw new Error(`Modèle joueur natif : plage ${name} incompatible avec le catalogue GLB`);
    }
  }
  const trianglesByRole = { hull: 0, silhouette: 0, organ: 0, roof: 0, hidden: 0 };
  const parts = [];
  const renderGroups = [];
  geometry.clearGroups();
  let start = 0;
  for (const [name, triangles, role] of INDEX_SPANS) {
    const count = triangles * 3;
    const previous = renderGroups.at(-1);
    if (previous?.role === role && previous.start + previous.count === start) previous.count += count;
    else renderGroups.push({ role, start, count });
    trianglesByRole[role] += triangles;
    parts.push(Object.freeze({ name, triangles, role, start, count,
      bounds: indexedRangeBounds(geometry, start, count) }));
    start += count;
  }
  if (start !== geometry.index.count) {
    throw new Error(`Modèle joueur natif : ${start / 3} triangles indexés sur ${geometry.index.count / 3}`);
  }
  for (const group of renderGroups) {
    geometry.addGroup(group.start, group.count, GROUP_ROLE_INDEX[group.role]);
  }
  return Object.freeze({
    parts: Object.freeze(parts),
    trianglesByRole: Object.freeze(trianglesByRole),
    renderGroupCount: renderGroups.length,
    assetFingerprint: ASSET_FNV32,
    totalTriangles: expectedIndices / 3
  });
}

function prepareTemplate(gltf) {
  const meshes = [];
  gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
  if (meshes.length !== 1) {
    throw new Error(`Modèle joueur natif : ${meshes.length} maillages au lieu de 1`);
  }
  const source = meshes[0];
  const position = source.geometry.getAttribute("position");
  const normal = source.geometry.getAttribute("normal");
  const color = source.geometry.getAttribute("color");
  if (!position || !normal || !color || color.itemSize !== 4 || !source.geometry.index) {
    throw new Error("Modèle joueur natif : attributs GLB incomplets");
  }
  const hullReference = source.userData?.hullReference;
  if (!hullReference || !Array.isArray(hullReference.boundsMin)
    || !Array.isArray(hullReference.boundsMax)) {
    throw new Error("Modèle joueur natif : référence de coque absente");
  }
  source.geometry.computeBoundingBox();
  source.geometry.computeBoundingSphere();
  const sourceGroups = prepareSourceGroups(source.geometry, source.userData?.triangleCountsBySourcePart);
  return Object.freeze({
    geometry: source.geometry,
    sourceMaterial: source.material,
    metadata: Object.freeze({ ...source.userData,
      assetGenerator: gltf.asset?.generator || null,
      sourceGroups,
      hullReference: Object.freeze({ ...hullReference,
        boundsMin: Object.freeze([...hullReference.boundsMin]),
        boundsMax: Object.freeze([...hullReference.boundsMax])
      })
    })
  });
}

export function preloadNativePlayerModel() {
  if (loadPromise) return loadPromise;
  loadCount++;
  const bytes = embeddedPlayerModel;
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  loadPromise = new GLTFLoader().parseAsync(arrayBuffer, "")
    .then(prepareTemplate)
    .then(template => {
      loadedTemplate = template;
      return template;
    })
    .catch(error => {
      loadError = error;
      throw error;
    });
  return loadPromise;
}

export function createNativePlayerModelResources(configuration) {
  const position = finiteVector(configuration?.position, 3, "position");
  const rotation = finiteVector(configuration?.rotation, 3, "rotation");
  const scale = configuration?.scale;
  const referenceLength = configuration?.reference?.length;
  const referenceBeam = configuration?.reference?.beam;
  const clipBelowZ = configuration?.clipBelowZ;
  const role = configuration?.role;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(referenceLength)
    || referenceLength <= 0 || !Number.isFinite(referenceBeam) || referenceBeam <= 0
    || !Number.isFinite(clipBelowZ)
    || typeof role !== "string" || !role || typeof configuration?.color !== "string") {
    throw new TypeError("Modèle joueur natif : calage invalide");
  }

  let parent = null;
  let mesh = null;
  let navigationMaterial = null;
  let understandMaterials = null;
  let disposed = false;
  let warmed = false;
  let currentColor = configuration.color;
  let currentUnderstand = {
    enabled: false,
    palette: {
      hull: "#91aeb6",
      silhouette: "#c4e3e7",
      organ: "#70939d",
      roof: "#a8c1c7",
      ...(configuration.understandPalette || {})
    }
  };
  let resourceError = null;
  let fullBounds = null;
  let hullBounds = null;

  const ready = (configuration.failLoad
    ? Promise.reject(new Error("Modèle joueur natif : échec de chargement injecté"))
    : preloadNativePlayerModel()).then(template => {
    if (disposed) return false;
    const clippingPlane = new Plane(new Vector3(0, 0, 1), -clipBelowZ);
    navigationMaterial = new MeshBasicMaterial({
      color: currentColor,
      vertexColors: true,
      toneMapped: false,
      side: template.sourceMaterial.side,
      transparent: template.sourceMaterial.transparent,
      opacity: template.sourceMaterial.opacity,
      clippingPlanes: [clippingPlane]
    });
    navigationMaterial.name = `${ASSET_NAME}:unlit-vertex-colors`;
    navigationMaterial.userData.role = role;
    const understandMaterial = (name, options) => {
      const result = new MeshBasicMaterial({
        color: currentUnderstand.palette[name] || "#91aeb6",
        vertexColors: false,
        toneMapped: false,
        side: DoubleSide,
        ...options
      });
      result.name = `${ASSET_NAME}:understand-${name}`;
      result.userData.role = `understand.${name}`;
      return result;
    };
    understandMaterials = [
      understandMaterial("hull", { transparent: true, opacity: .20, depthWrite: false, clippingPlanes: [clippingPlane] }),
      understandMaterial("silhouette", { transparent: true, opacity: .35, depthWrite: false, clippingPlanes: [clippingPlane] }),
      understandMaterial("organ", { transparent: true, opacity: 1, depthWrite: false }),
      understandMaterial("roof", { transparent: true, opacity: .68, depthWrite: false, clippingPlanes: [clippingPlane] }),
      understandMaterial("hidden", { visible: false, transparent: true, opacity: 0, depthWrite: false })
    ];
    mesh = new Mesh(template.geometry, navigationMaterial);
    mesh.name = "KJP_PlayerSailboat_GLTF";
    mesh.userData = {
      ...template.metadata,
      owner: "player-model:sun-odyssey-36i",
      family: "player-model",
      kind: "mesh"
    };
    mesh.position.set(...position);
    mesh.rotation.set(...rotation, "XYZ");
    mesh.scale.setScalar(scale);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    fullBounds = template.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
    hullBounds = new Box3()
      .setFromArray([
        ...template.metadata.hullReference.boundsMin,
        ...template.metadata.hullReference.boundsMax
      ])
      .applyMatrix4(mesh.matrix);
    parent?.add(mesh);
    return true;
  }).catch(error => {
    resourceError = error;
    throw error;
  });

  function attach(nextParent) {
    if (!nextParent?.isGroup) throw new TypeError("Modèle joueur natif : groupe parent absent");
    parent = nextParent;
    if (mesh) parent.add(mesh);
  }

  function updateStyle(value, understand = null) {
    if (typeof value !== "string") throw new TypeError("Modèle joueur natif : couleur absente");
    currentColor = value;
    if (understand && typeof understand === "object") {
      currentUnderstand = {
        enabled: Boolean(understand.enabled),
        palette: { ...currentUnderstand.palette, ...(understand.palette || {}) }
      };
    } else {
      currentUnderstand = { ...currentUnderstand, enabled: false };
    }
    if (!navigationMaterial) return;
    navigationMaterial.color.setStyle(value);
    if (understandMaterials) {
      for (const [name, index] of Object.entries(GROUP_ROLE_INDEX)) {
        if (name === "hidden") continue;
        understandMaterials[index].color.setStyle(currentUnderstand.palette[name]);
      }
    }
    mesh.material = currentUnderstand.enabled ? understandMaterials : navigationMaterial;
    mesh.renderOrder = currentUnderstand.enabled ? 20 : 0;
  }

  function report() {
    const metadata = loadedTemplate?.metadata;
    const hull = hullBounds ? boxReport(hullBounds) : null;
    return {
      ready: Boolean(mesh),
      error: resourceError || loadError
        ? String((resourceError || loadError).message || resourceError || loadError) : null,
      loadCount,
      asset: {
        name: ASSET_NAME,
        bytes: embeddedPlayerModel.byteLength,
        generator: metadata?.assetGenerator || metadata?.generator || null,
        extensionsUsed: [],
        animations: 0,
        noPhysicsData: metadata?.noPhysicsData ?? null,
        excludedFunctionalEquipment: [...(metadata?.excludedFunctionalEquipment || [])]
      },
      transform: { position: [...position], rotation: [...rotation], scale: [scale, scale, scale] },
      appearance: {
        color: currentColor,
        radiograph: currentUnderstand.enabled,
        wireframe: false,
        vertexColors: currentUnderstand.enabled ? false : navigationMaterial?.vertexColors ?? true,
        materials: currentUnderstand.enabled
          ? understandMaterials.map(material => ({
            role: material.userData.role,
            visible: material.visible,
            opacity: material.opacity,
            depthWrite: material.depthWrite,
            clipping: Boolean(material.clippingPlanes?.length)
          }))
          : []
      },
      geometry: mesh ? {
        uuid: mesh.geometry.uuid,
        vertices: mesh.geometry.attributes.position.count,
        triangles: mesh.geometry.index.count / 3,
        normals: Boolean(mesh.geometry.attributes.normal),
        vertexColors: Boolean(mesh.geometry.attributes.color)
      } : null,
      bounds: mesh ? { full: boxReport(fullBounds), hull } : null,
      calibration: metadata ? {
        modelUnits: metadata.units,
        modelUpAxis: metadata.upAxis,
        modelBowAxis: metadata.bowAxis,
        modelWaterline: metadata.waterlineY,
        renderedWaterline: position[2],
        hullLength: metadata.hullReference.length * scale,
        hullBeam: metadata.hullReference.beam * scale,
        simulatorLength: referenceLength,
        simulatorBeam: referenceBeam,
        longitudinalClearance: referenceLength - metadata.hullReference.length * scale,
        transverseClearance: referenceBeam - metadata.hullReference.beam * scale
      } : null,
      sourceGroups: metadata?.sourceGroups ? {
        totalTriangles: metadata.sourceGroups.totalTriangles,
        renderGroupCount: metadata.sourceGroups.renderGroupCount,
        assetFingerprint: metadata.sourceGroups.assetFingerprint,
        trianglesByRole: { ...metadata.sourceGroups.trianglesByRole },
        parts: metadata.sourceGroups.parts.map(part => ({ ...part,
          bounds: { min: [...part.bounds.min], max: [...part.bounds.max] } }))
      } : null,
      waterlineClipping: {
        enabled: currentUnderstand.enabled
          ? Boolean(understandMaterials?.[GROUP_ROLE_INDEX.hull]?.clippingPlanes?.length)
          : Boolean(navigationMaterial?.clippingPlanes?.length),
        organsClipped: currentUnderstand.enabled
          ? Boolean(understandMaterials?.[GROUP_ROLE_INDEX.organ]?.clippingPlanes?.length)
          : true,
        worldZ: clipBelowZ,
        sourceY: metadata?.waterlineY ?? null,
        hiddenSide: "below"
      }
    };
  }

  function afterRender() {
    if (warmed || !mesh) return;
    warmed = true;
    mesh.frustumCulled = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    mesh?.removeFromParent();
    // La géométrie appartient au modèle chargé une fois pour toute la page.
    // Chaque instance possède seulement sa matière et sa transformation.
    navigationMaterial?.dispose();
    for (const material of understandMaterials || []) material.dispose();
    parent = null;
  }

  return Object.freeze({ ready, attach, updateStyle, report, afterRender, dispose });
}
