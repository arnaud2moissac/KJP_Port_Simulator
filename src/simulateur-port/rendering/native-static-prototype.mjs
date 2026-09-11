import { Scene, WebGLRenderer, NoToneMapping, SRGBColorSpace } from "three";
import { createThreeCamera } from "./three-camera.mjs";
import { createNativeStaticResources, nativeStaticResourceBuilds } from "./native-static-resources.mjs";

// Banc N1 à N3 explicite, hors écran. Aucun RAF, contrôleur, horloge ou RenderFrame.
export function createNativeStaticPrototype(definition, {
  resourceFactory = createNativeStaticResources,
  playerDefinition = null,
  playerFactory = null
} = {}) {
  let resources = resourceFactory(definition);
  let playerResources = null;
  try {
    if (playerDefinition) {
      if (typeof playerFactory !== "function") throw new TypeError("Native static: fabrique joueur absente");
      playerResources = playerFactory(playerDefinition);
    }
  } catch (error) {
    resources.dispose();
    throw error;
  }
  const canvas = document.createElement("canvas");
  canvas.id = "kjp-native-static-prototype";
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch (error) {
    playerResources?.dispose();
    resources.dispose();
    throw error;
  }
  renderer.setClearColor(0, 0);
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.add(resources.group);
  if (playerResources) scene.add(playerResources.group);
  const bridge = createThreeCamera();
  const identities = new WeakMap();
  let nextId = 1, frames = 0, lastCamera = null, disposed = false;
  const id = value => {
    if (!identities.has(value)) identities.set(value, nextId++);
    return identities.get(value);
  };
  function ensureActive() {
    if (disposed) throw new Error("Native static prototype disposed");
  }
  function render(camera, pixelRatio, playerPresentation = null) {
    ensureActive();
    lastCamera = camera;
    if (playerResources) playerResources.update(playerPresentation);
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    const w = Math.round(camera.width * pixelRatio), h = Math.round(camera.height * pixelRatio);
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w / pixelRatio, h / pixelRatio, false);
    renderer.render(scene, bridge.update(camera));
    resources.afterRender?.();
    playerResources?.afterRender?.();
    frames++;
  }
  function report({ images = false } = {}) {
    ensureActive();
    // Diagnostics uniquement : aucune relecture du suivi caméra ou du moteur.
    const attributes = geometry => Object.entries({ ...geometry.attributes, ...(geometry.index ? { index: geometry.index } : {}) })
      .map(([name, attribute]) => {
        const buffer = attribute.data || attribute;
        let hash = 2166136261;
        const bytes = new Uint8Array(buffer.array.buffer, buffer.array.byteOffset, buffer.array.byteLength);
        for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
        return { name, attribute: id(attribute), buffer: id(buffer), array: id(buffer.array), version: buffer.version, bytes: bytes.length, hash: hash >>> 0 };
      });
    const objects = [
      ...resources.group.children,
      ...(playerResources ? playerResources.group.children : [])
    ];
    return {
      frames, resourceBuilds: nativeStaticResourceBuilds(), camera: lastCamera ? structuredClone(lastCamera) : null,
      resources: objects.map(object => ({ role: object.name, owner: object.userData.owner,
        family: object.userData.family,
        geometry: object.geometry.uuid, attributes: attributes(object.geometry) })),
      ...(resources.report ? { catalog: resources.report(), memory: { ...renderer.info.memory },
        materials: [...new Set(objects.map(o => o.material))].map(m => ({
          id: m.uuid, role: m.userData.role, color: m.color.getHexString(), opacity: m.opacity,
          ...(Number.isFinite(m.linewidth) ? { linewidth: m.linewidth, baseLinewidth: m.userData.baseLinewidth } : {})
        })) } : {}),
      ...(playerResources ? { player: playerResources.report() } : {}),
      glError: renderer.getContext().getError(),
      ...(images && frames ? { image: canvas.toDataURL() } : {})
    };
  }
  function replaceResources(definition) {
    ensureActive();
    const next = resourceFactory(definition);
    scene.remove(resources.group); resources.dispose();
    resources = next; scene.add(resources.group);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(resources.group);
    if (playerResources) scene.remove(playerResources.group);
    playerResources?.dispose(); resources.dispose(); renderer.dispose(); renderer.forceContextLoss();
    canvas.width = 0; canvas.height = 0;
  }
  // Les ressources sont accessibles au hook de mutation du banc, jamais au moteur.
  return Object.freeze({ render, report, dispose, replaceResources,
    updatePalette: palette => resources.updatePalette?.(palette),
    get resources() { return resources; },
    get playerResources() { return playerResources; } });
}
