import { Box3, Mesh, MeshBasicMaterial, Plane, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import embeddedPlayerModel from "../../../kjp_sun_odyssey_36i.glb";

const ASSET_NAME = "kjp_sun_odyssey_36i.glb";
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
  return Object.freeze({
    geometry: source.geometry,
    sourceMaterial: source.material,
    metadata: Object.freeze({ ...source.userData,
      assetGenerator: gltf.asset?.generator || null,
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
  let material = null;
  let disposed = false;
  let warmed = false;
  let currentColor = configuration.color;
  let resourceError = null;
  let fullBounds = null;
  let hullBounds = null;

  const ready = (configuration.failLoad
    ? Promise.reject(new Error("Modèle joueur natif : échec de chargement injecté"))
    : preloadNativePlayerModel()).then(template => {
    if (disposed) return false;
    material = new MeshBasicMaterial({
      color: currentColor,
      vertexColors: true,
      toneMapped: false,
      side: template.sourceMaterial.side,
      transparent: template.sourceMaterial.transparent,
      opacity: template.sourceMaterial.opacity,
      clippingPlanes: [new Plane(new Vector3(0, 0, 1), -clipBelowZ)]
    });
    material.name = `${ASSET_NAME}:unlit-vertex-colors`;
    material.userData.role = role;
    mesh = new Mesh(template.geometry, material);
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

  function updateColor(value) {
    if (typeof value !== "string") throw new TypeError("Modèle joueur natif : couleur absente");
    currentColor = value;
    material?.color.setStyle(value);
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
      waterlineClipping: {
        enabled: Boolean(material?.clippingPlanes?.length),
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
    material?.dispose();
    parent = null;
  }

  return Object.freeze({ ready, attach, updateColor, report, afterRender, dispose });
}
