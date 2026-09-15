import { createNativeInfrastructureResources } from "./native-infrastructure-resources.mjs";

function finitePoint(value, label) {
  if (!value || ![value.x, value.y, value.heading].every(Number.isFinite)) {
    throw new TypeError(`Joueur natif : ${label} invalide`);
  }
}

function sameNumber(first, second) {
  return Math.abs(first - second) < 1e-9;
}

// Ressources locales du joueur. La simulation fournit seulement une pose de
// présentation compacte et des états visuels ; aucun objet Three n'en devient
// une source d'autorité.
export function createNativePlayerResources(definition, {
  resourceFactory = createNativeInfrastructureResources,
  modelFactory = null
} = {}) {
  const configuration = definition?.player;
  if (!configuration || typeof configuration !== "object") {
    throw new TypeError("Joueur natif : configuration absente");
  }
  const resources = resourceFactory({ owners: definition.owners, palette: definition.palette });
  const group = resources.group;
  let modelResources = null;
  try {
    if (configuration.model) {
      if (typeof modelFactory !== "function") {
        throw new TypeError("Joueur natif : fabrique de modèle absente");
      }
      modelResources = modelFactory({
        ...configuration.model,
        color: definition.palette[configuration.model.role]
      });
      modelResources.attach(group);
    }
  } catch (error) {
    resources.dispose();
    throw error;
  }
  const collisionWidths = Object.values(configuration.collisionWidths || {});
  const acceleratedWidths = configuration.acceleratedWidths || [];
  const fenderWidths = configuration.fenderWidths || [];
  const lineMaterials = new Map();
  for (const object of group.children) {
    if (!object.isLineSegments2) continue;
    const material = object.material;
    if (!lineMaterials.has(material)) {
      material.userData.baseLinewidth = material.linewidth;
      lineMaterials.set(material, {
        material,
        base: material.linewidth,
        role: material.userData.role,
        owners: new Set()
      });
    }
    lineMaterials.get(material).owners.add(object.userData.owner);
  }

  let current = null;
  let disposed = false;

  function update(presentation) {
    if (disposed) throw new Error("Joueur natif : ressources libérées");
    finitePoint(presentation?.pose, "pose");
    if (!presentation.palette || typeof presentation.palette !== "object") {
      throw new TypeError("Joueur natif : palette absente");
    }
    if (!Array.isArray(presentation.contactFenders)
      || presentation.contactFenders.some(id => !Number.isInteger(id) || id < 0)) {
      throw new TypeError("Joueur natif : état visuel invalide");
    }

    const contactFenders = new Set(presentation.contactFenders.map(String));
    resources.updatePalette(presentation.palette, { wireframe: Boolean(presentation.wireframe) });
    if (modelResources) {
      modelResources.updateStyle(
        presentation.palette[configuration.model.role],
        Boolean(presentation.wireframe)
      );
    }
    group.position.set(presentation.pose.x, presentation.pose.y, 0);
    group.rotation.set(0, 0, presentation.pose.heading);
    group.updateMatrix();

    for (const record of lineMaterials.values()) {
      let width = record.base;
      const collision = collisionWidths.find(item => item.role === record.role);
      if (collision) width = presentation.cameraView === "skipper" ? collision.skipper : collision.regular;
      const accelerated = acceleratedWidths.find(item => (
        item.role === record.role && sameNumber(item.regular, record.base)
        && record.owners.has(item.owner)
      ));
      if (accelerated) width = presentation.accelerated ? accelerated.accelerated : accelerated.regular;
      const fenderOwner = [...record.owners].find(owner => owner.startsWith("player-fender:"));
      if (fenderOwner && contactFenders.has(fenderOwner.slice("player-fender:".length))) {
        const contact = fenderWidths.find(item => sameNumber(item.regular, record.base));
        if (contact) width = contact.contact;
      }
      record.material.linewidth = width;
    }
    current = {
      pose: { ...presentation.pose },
      wireframe: Boolean(presentation.wireframe),
      accelerated: Boolean(presentation.accelerated),
      cameraView: presentation.cameraView,
      contactFenders: [...presentation.contactFenders]
    };
  }

  function report() {
    if (disposed) throw new Error("Joueur natif : ressources libérées");
    return {
      ...(current || {}),
      matrix: [...group.matrix.elements],
      localCoordinates: true,
      visibility: Object.fromEntries([...new Set(group.children.map(object => object.userData.family))]
        .map(family => [family, group.children.filter(object => object.userData.family === family)
          .every(object => object.visible)])),
      ...(modelResources ? { model: modelResources.report() } : {}),
      catalog: resources.report()
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    modelResources?.dispose();
    resources.dispose();
  }

  return Object.freeze({ group, ready: modelResources?.ready || Promise.resolve(true), update, report, dispose,
    afterRender: () => { resources.afterRender?.(); modelResources?.afterRender?.(); } });
}
