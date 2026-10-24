import { Box3, DoubleSide, Mesh, MeshBasicMaterial, Plane, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import embeddedPlayerModel from "../../../kjp_sun_odyssey_36i.glb";
import embeddedDufourModel from "../../../kjp_dufour_310_gl_2014_dimfix_rudders.glb";
import embeddedSun242 from "../../../KJP_SunOdyssey242.glb";
import embeddedContessa26 from "../../../KJP_Contessa26_rouge_lazybag.glb";
import embeddedPogo40 from "../../../KJP_Class40_lazybag.glb";
import embeddedOceanis48 from "../../../KJP_Oceanis48_lazybag.glb";

const GROUP_ROLE_INDEX = Object.freeze({ hull: 0, silhouette: 1, organ: 2, roof: 3, hidden: 4 });
// Le catalogue GLB donne les totaux par nom, mais PAS leurs offsets : l'ordre
// des indices est celui de l'exporteur, différent de l'ordre alphabétique JSON.
// Ces plages ont été relevées sur le GLB livré et sont liées à son empreinte.
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
// Le dérivé autorisé conserve les indices du dimfix fourni. Seuls les sommets
// et normales des deux safrans ont été réduits hors ligne ; aucune édition par
// image. Les roues et safrans restent statiques comme dans le GLB.
const DUFOUR_INDEX_SPANS = Object.freeze([
  ["hull_upper", 54, "silhouette"],
  ["hull_sheer_stripe", 54, "silhouette"],
  ["hull_sides", 110, "hull"],
  ["hull_underwater", 138, "hidden"],
  ["hull_transom", 6, "hull"],
  ["waterline_stripe", 56, "silhouette"],
  ["hull_portlights", 16, "hidden"],
  ["deck", 38, "hull"],
  ["deck_edge", 54, "silhouette"],
  ["cockpit_and_transom_furniture", 274, "hidden"],
  ["coachroof", 68, "roof"],
  ["coachroof_windows_and_companionway", 10, "roof"],
  ["deck_fittings", 80, "hidden"],
  ["wheel_port", 184, "hidden"],
  ["wheel_starboard", 184, "hidden"],
  ["cockpit_table", 56, "hidden"],
  ["mast_and_rigging", 204, "hidden"],
  ["stanchions_and_railings", 264, "hidden"],
  ["keel_fin", 12, "organ"],
  ["keel_bulb", 76, "organ"],
  ["rudder_port", 16, "organ"],
  ["rudder_starboard", 16, "organ"]
]);
const ASSETS = Object.freeze({
  "sun-odyssey-36i": Object.freeze({
    name: "kjp_sun_odyssey_36i.glb", bytes: embeddedPlayerModel,
    fingerprint: 0x1fb19642, spans: INDEX_SPANS,
    hullParts: ["upper_sheer", "hull_sides", "hull_underwater", "transom"],
    catalogueChecks: ["hull_underwater", "keel_fin", "keel_bulb", "rudder"]
  }),
  "dufour-310-gl-2014-dimfix-rudders": Object.freeze({
    name: "kjp_dufour_310_gl_2014_dimfix_rudders.glb", bytes: embeddedDufourModel,
    fingerprint: 0xe81ac2df, spans: DUFOUR_INDEX_SPANS,
    hullParts: ["hull_upper", "hull_sides", "hull_underwater", "hull_transom"],
    catalogueChecks: ["hull_underwater", "keel_fin", "keel_bulb"],
    preserveVertexColor: true
  }),
  // BEGIN four vessel assets
  "sun-odyssey-24-2": Object.freeze({
    name: "KJP_SunOdyssey242.glb", bytes: embeddedSun242,
    fingerprint: 0xb0507705,
    spans: Object.freeze([
      ["hull",672,"hull"],
      ["sheer_trim",96,"silhouette"],
      ["deck",116,"hull"],
      ["stern_scoop",38,"hull"],
      ["cockpit_seats_and_coamings",140,"hidden"],
      ["coachroof",94,"roof"],
      ["roof_glazing",220,"roof"],
      ["fixed_fin_keel",44,"organ"],
      ["keel_bulb",80,"organ"],
      ["rudder",60,"organ"],
      ["tiller_and_rudder_fittings",108,"hidden"],
      ["propeller_and_shaft",52,"hidden"],
      ["mast_and_boom",72,"hidden"],
      ["mainsail_cover",80,"hidden"],
      ["standing_rigging",164,"hidden"],
      ["furled_headsail",84,"hidden"],
      ["guardrails_and_toerails",768,"hidden"],
      ["deck_hardware",550,"hidden"]
    ]),
    hullParts: ["hull"],
    catalogueChecks: ["hull","fixed_fin_keel","keel_bulb","rudder","mainsail_cover"],
    preserveVertexColor: true
  }),
  "contessa-26": Object.freeze({
    name: "KJP_Contessa26_rouge_lazybag.glb", bytes: embeddedContessa26,
    fingerprint: 0xf3b5c439,
    hullReference: Object.freeze({
      boundsMin: [-1.1449999809265137, -1.2200000286102295, -3.884999990463257],
      boundsMax: [1.1449999809265137, 1.0579999685287476, 3.884999990463257]
    }),
    // Les 883 premiers triangles forment une carène et une quille continues.
    // Plages relevées sur les facettes du fichier fourni : aucun indice,
    // sommet ou paramètre physique ne change pour la radiographie.
    spans: Object.freeze([
      ["hull_integral_0",120,"hull"],
      ["keel_integral_1",36,"organ"],
      ["hull_integral_2",42,"hull"],
      ["keel_integral_3",12,"organ"],
      ["hull_integral_4",40,"hull"],
      ["keel_integral_5",12,"organ"],
      ["hull_integral_6",36,"hull"],
      ["keel_integral_7",12,"organ"],
      ["hull_integral_8",36,"hull"],
      ["keel_integral_9",12,"organ"],
      ["hull_integral_10",36,"hull"],
      ["keel_integral_11",12,"organ"],
      ["hull_integral_12",36,"hull"],
      ["keel_integral_13",12,"organ"],
      ["hull_integral_14",36,"hull"],
      ["keel_integral_15",12,"organ"],
      ["hull_integral_16",36,"hull"],
      ["keel_integral_17",12,"organ"],
      ["hull_integral_18",36,"hull"],
      ["keel_integral_19",12,"organ"],
      ["hull_integral_20",40,"hull"],
      ["keel_integral_21",12,"organ"],
      ["hull_integral_22",42,"hull"],
      ["keel_integral_23",36,"organ"],
      ["hull_integral_24",155,"hull"],
      ["sheer_trim",68,"silhouette"],
      ["deck",76,"hull"],
      ["cockpit_and_woodwork",200,"hidden"],
      ["coachroof",166,"roof"],
      ["portlights",116,"roof"],
      ["forehatch",28,"hidden"],
      ["rudder",204,"organ"],
      ["tiller_and_fittings",128,"hidden"],
      ["propeller",56,"hidden"],
      ["mast_and_boom",112,"hidden"],
      ["standing_rigging",168,"hidden"],
      ["guardrails_and_toerails",796,"hidden"],
      ["deck_hardware",264,"hidden"]
    ]),
    hullParts: ["hull_integral_0","keel_integral_1","hull_integral_2","keel_integral_3","hull_integral_4","keel_integral_5","hull_integral_6","keel_integral_7","hull_integral_8","keel_integral_9","hull_integral_10","keel_integral_11","hull_integral_12","keel_integral_13","hull_integral_14","keel_integral_15","hull_integral_16","keel_integral_17","hull_integral_18","keel_integral_19","hull_integral_20","keel_integral_21","hull_integral_22","keel_integral_23","hull_integral_24"],
    catalogueChecks: ["sheer_trim","deck","coachroof","rudder"],
    preserveVertexColor: true
  }),
  "pogo-40-s4": Object.freeze({
    name: "KJP_Class40_lazybag.glb", bytes: embeddedPogo40,
    fingerprint: 0x1b27fe7b,
    // Coque utilisateur conservée dans le dérivé : bornes sur ses 295
    // triangles de coque, hors bout-dehors et appendices. Ses marqueurs ne
    // remplacent jamais les ancrages ou les paramètres physiques KJP.
    hullReference: Object.freeze({
      boundsMin: [-2.25, -.699999988079071, -6.09499979019165],
      boundsMax: [2.25, 1.534999966621399, 6.09499979019165]
    }),
    spans: Object.freeze([
      ["hull",295,"hull"],
      ["cockpit",124,"hidden"],
      ["coachroof",195,"roof"],
      ["keel",132,"organ"],
      // Les noms suivent le repère KJP : source X < 0 → scène Y < 0,
      // donc tribord physique ; les marqueurs nommés du fichier sont ignorés.
      ["rudder_starboard",48,"organ"],
      ["stock_tiller_starboard",84,"hidden"],
      ["rudder_port",48,"organ"],
      ["stock_tiller_port",84,"hidden"],
      ["tiller_linkage",24,"hidden"],
      ["propeller",64,"hidden"],
      ["mast_and_boom",124,"hidden"],
      ["rigging",252,"hidden"],
      ["bowsprit",48,"silhouette"],
      ["guardrails",712,"hidden"],
      ["deck_hardware",384,"hidden"]
    ]),
    hullParts: ["hull"],
    catalogueChecks: ["hull","keel","coachroof"],
    preserveVertexColor: true
  }),
  "oceanis-48": Object.freeze({
    name: "KJP_Oceanis48_lazybag.glb", bytes: embeddedOceanis48,
    fingerprint: 0x32f9fcee,
    spans: Object.freeze([
      ["hull",731,"hull"],
      ["hull_windows_and_trim",240,"hidden"],
      ["deck",128,"hull"],
      ["cockpit_seats_and_table",240,"hidden"],
      ["transom_platform_closed",20,"hull"],
      ["coachroof",94,"roof"],
      ["roof_glazing",142,"roof"],
      ["deck_hatches",162,"hidden"],
      ["deep_fin_keel",44,"organ"],
      ["keel_bulb",100,"organ"],
      ["rudder",60,"organ"],
      // L'hélice fonctionnelle KJP reste distincte en mode Comprendre.
      ["saildrive_and_propeller",64,"hidden"],
      ["helm_consoles",112,"hidden"],
      ["steering_wheels",432,"hidden"],
      ["mainsheet_arch",52,"hidden"],
      ["mast_and_boom",112,"hidden"],
      ["standing_rigging",224,"hidden"],
      ["furled_headsail",84,"hidden"],
      ["guardrails_and_toerails",928,"hidden"],
      ["deck_hardware",590,"hidden"]
    ]),
    hullParts: ["hull"],
    catalogueChecks: ["hull","deep_fin_keel","keel_bulb","rudder","steering_wheels"],
    preserveVertexColor: true
  })
  // END four vessel assets
});
const assetStates = new Map();

function assetState(id = "sun-odyssey-36i") {
  if (!ASSETS[id]) throw new TypeError(`Modèle joueur natif : ressource inconnue ${id}`);
  if (!assetStates.has(id)) assetStates.set(id, {
    asset: ASSETS[id], loadPromise: null, loadedTemplate: null, loadError: null, loadCount: 0
  });
  return assetStates.get(id);
}

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

function prepareSourceGroups(geometry, sourceParts, asset) {
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
  if (assetFingerprint(asset.bytes) !== asset.fingerprint) {
    throw new Error("Modèle joueur natif : ordre des indices GLB inconnu pour la radiographie");
  }
  for (const name of asset.catalogueChecks) {
    const indexed = asset.spans.find(span => span[0] === name);
    if (sourceParts[name] !== indexed?.[1]) {
      throw new Error(`Modèle joueur natif : plage ${name} incompatible avec le catalogue GLB`);
    }
  }
  const trianglesByRole = { hull: 0, silhouette: 0, organ: 0, roof: 0, hidden: 0 };
  const parts = [];
  const renderGroups = [];
  geometry.clearGroups();
  let start = 0;
  for (const [name, triangles, role] of asset.spans) {
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
    assetFingerprint: asset.fingerprint,
    totalTriangles: expectedIndices / 3
  });
}

function prepareTemplate(gltf, asset) {
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
  const hullReference = asset.hullReference || source.userData?.hullReference;
  if (!hullReference || !Array.isArray(hullReference.boundsMin)
    || !Array.isArray(hullReference.boundsMax)) {
    throw new Error("Modèle joueur natif : référence de coque absente");
  }
  source.geometry.computeBoundingBox();
  source.geometry.computeBoundingSphere();
  const sourceGroups = prepareSourceGroups(source.geometry, source.userData?.triangleCountsBySourcePart, asset);
  const measuredHull = new Box3();
  for (const part of sourceGroups.parts.filter(part => asset.hullParts.includes(part.name))) {
    measuredHull.union(new Box3(new Vector3(...part.bounds.min), new Vector3(...part.bounds.max)));
  }
  return Object.freeze({
    geometry: source.geometry,
    sourceMaterial: source.material,
    metadata: Object.freeze({ ...source.userData,
      assetGenerator: gltf.asset?.generator || null,
      sourceGroups,
      measuredHull: Object.freeze(boxReport(measuredHull)),
      hullReference: Object.freeze({ ...hullReference,
        boundsMin: Object.freeze([...hullReference.boundsMin]),
        boundsMax: Object.freeze([...hullReference.boundsMax])
      })
    })
  });
}

export function preloadNativePlayerModel(id = "sun-odyssey-36i") {
  const state = assetState(id);
  if (state.loadPromise) return state.loadPromise;
  state.loadCount++;
  const bytes = state.asset.bytes;
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  state.loadPromise = new GLTFLoader().parseAsync(arrayBuffer, "")
    .then(gltf => prepareTemplate(gltf, state.asset))
    .then(template => {
      state.loadedTemplate = template;
      return template;
    })
    .catch(error => {
      state.loadError = error;
      throw error;
    });
  return state.loadPromise;
}

export function createNativePlayerModelResources(configuration) {
  const assetId = configuration?.asset || "sun-odyssey-36i";
  const state = assetState(assetId);
  const asset = state.asset;
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
    : preloadNativePlayerModel(assetId)).then(template => {
    if (disposed) return false;
    const clippingPlane = new Plane(new Vector3(0, 0, 1), -clipBelowZ);
    navigationMaterial = new MeshBasicMaterial({
      color: asset.preserveVertexColor ? "#ffffff" : currentColor,
      vertexColors: true,
      toneMapped: false,
      side: template.sourceMaterial.side,
      transparent: template.sourceMaterial.transparent,
      opacity: template.sourceMaterial.opacity,
      clippingPlanes: [clippingPlane]
    });
    navigationMaterial.name = `${asset.name}:unlit-vertex-colors`;
    navigationMaterial.userData.role = role;
    const understandMaterial = (name, options) => {
      const result = new MeshBasicMaterial({
        color: currentUnderstand.palette[name] || "#91aeb6",
        vertexColors: false,
        toneMapped: false,
        side: DoubleSide,
        ...options
      });
      result.name = `${asset.name}:understand-${name}`;
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
      owner: `player-model:${assetId}`,
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
        ...template.metadata.measuredHull.min,
        ...template.metadata.measuredHull.max
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
    navigationMaterial.color.setStyle(asset.preserveVertexColor ? "#ffffff" : value);
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
    const metadata = state.loadedTemplate?.metadata;
    const hull = hullBounds ? boxReport(hullBounds) : null;
    return {
      ready: Boolean(mesh),
      error: resourceError || state.loadError
        ? String((resourceError || state.loadError).message || resourceError || state.loadError) : null,
      loadCount: state.loadCount,
      asset: {
        id: assetId,
        name: asset.name,
        bytes: asset.bytes.byteLength,
        generator: metadata?.assetGenerator || metadata?.generator || null,
        extensionsUsed: [],
        animations: 0,
        noPhysicsData: metadata?.noPhysicsData ?? null,
        excludedFunctionalEquipment: [...(metadata?.excludedFunctionalEquipment || [])]
      },
      transform: { position: [...position], rotation: [...rotation], scale: [scale, scale, scale] },
      appearance: {
        color: asset.preserveVertexColor ? "#ffffff" : currentColor,
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
        hullLength: metadata.measuredHull.size[2] * scale,
        hullBeam: metadata.measuredHull.size[0] * scale,
        simulatorLength: referenceLength,
        simulatorBeam: referenceBeam,
        longitudinalClearance: referenceLength - metadata.measuredHull.size[2] * scale,
        transverseClearance: referenceBeam - metadata.measuredHull.size[0] * scale
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
