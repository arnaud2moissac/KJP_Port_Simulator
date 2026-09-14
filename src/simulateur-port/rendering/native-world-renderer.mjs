import { Scene, WebGLRenderer, NoToneMapping, SRGBColorSpace } from "three";
import { createThreeCamera } from "./three-camera.mjs";

// Renderer Three natif persistant. Il réutilise la boucle et la caméra KJP ;
// aucun RAF, contrôleur ou état de simulation n'est créé ici.
export function createNativeWorldRenderer(definition, {
  resourceFactory,
  playerDefinition = null,
  playerFactory = null,
  flowDefinition = null,
  flowFactory = null,
  layerFactory = resourceFactory
} = {}) {
  if (typeof resourceFactory !== "function") {
    throw new TypeError("Renderer Three natif : fabrique de ressources absente");
  }
  let resources = resourceFactory(definition);
  let playerResources = null;
  let flowResources = null;
  const layers = new Map();
  try {
    if (playerDefinition) {
      if (typeof playerFactory !== "function") throw new TypeError("Native static: fabrique joueur absente");
      playerResources = playerFactory(playerDefinition);
    }
    if (flowDefinition) {
      if (typeof flowFactory !== "function") throw new TypeError("Native static: fabrique de flux absente");
      flowResources = flowFactory(flowDefinition);
    }
  } catch (error) {
    flowResources?.dispose();
    resources.dispose();
    throw error;
  }
  const canvas = document.createElement("canvas");
  canvas.id = "kjp-native-world";
  canvas.setAttribute("aria-hidden", "true");
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch (error) {
    flowResources?.dispose();
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
  if (flowResources) scene.add(flowResources.group);
  const bridge = createThreeCamera();
  const identities = new WeakMap();
  let nextId = 1, frames = 0, lastCamera = null, disposed = false, compilePending = true;
  let asynchronousResourceError = null;
  playerResources?.ready?.catch(error => { asynchronousResourceError = error; });
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    asynchronousResourceError = new Error("Renderer Three natif : contexte WebGL perdu");
  });
  const id = value => {
    if (!identities.has(value)) identities.set(value, nextId++);
    return identities.get(value);
  };
  function ensureActive() {
    if (disposed) throw new Error("Renderer Three natif libéré");
  }
  function render(camera, pixelRatio, playerPresentation = null, flowPresentation = null) {
    ensureActive();
    if (asynchronousResourceError) throw asynchronousResourceError;
    lastCamera = camera;
    if (playerResources) playerResources.update(playerPresentation);
    if (flowResources) flowResources.update(flowPresentation);
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    const w = Math.round(camera.width * pixelRatio), h = Math.round(camera.height * pixelRatio);
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w / pixelRatio, h / pixelRatio, false);
    const threeCamera = bridge.update(camera);
    if (compilePending) {
      // Three diffère l'upload des objets invisibles. Amorcer tout le catalogue
      // lors de son initialisation/invalidation évite un transfert tardif quand
      // un taquet ou une famille jusque-là masquée entre dans le champ.
      const visibility = [];
      scene.traverse(object => {
        if (!object.geometry || !object.material) return;
        visibility.push([object, object.visible]);
        object.visible = true;
      });
      // compile() prépare les programmes mais conserve l'upload paresseux des
      // attributs. Un rendu d'amorçage, immédiatement remplacé dans le même
      // callback par le rendu visible ci-dessous, soumet réellement les buffers.
      try { renderer.render(scene, threeCamera); }
      finally { for (const [object, visible] of visibility) object.visible = visible; }
      compilePending = false;
    }
    renderer.render(scene, threeCamera);
    resources.afterRender?.();
    playerResources?.afterRender?.();
    for (const layer of layers.values()) layer.afterRender?.();
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
      ...(playerResources ? playerResources.group.children : []),
      ...(flowResources ? flowResources.group.children : []),
      ...[...layers.values()].flatMap(layer => layer.group.children)
    ];
    return {
      frames, camera: lastCamera ? structuredClone(lastCamera) : null,
      resources: objects.map(object => ({ role: object.name, owner: object.userData.owner,
        family: object.userData.family,
        geometry: object.geometry.uuid, attributes: attributes(object.geometry) })),
      ...(resources.report ? { catalog: resources.report(), memory: { ...renderer.info.memory },
        draw: { ...renderer.info.render },
        materials: [...new Set(objects.map(o => o.material))].map(m => ({
          id: m.uuid, role: m.userData.role, color: m.color.getHexString(), opacity: m.opacity,
          ...(Number.isFinite(m.linewidth) ? { linewidth: m.linewidth, baseLinewidth: m.userData.baseLinewidth } : {})
        })) } : {}),
      ...(playerResources ? { player: playerResources.report() } : {}),
      ...(flowResources ? { flow: flowResources.report() } : {}),
      layers: Object.fromEntries([...layers].map(([name, layer]) => [name, layer.report?.() || null])),
      attached: canvas.isConnected,
      glError: renderer.getContext().getError(),
      ...(images && frames ? { image: canvas.toDataURL() } : {})
    };
  }
  function replaceResources(definition) {
    ensureActive();
    const next = resourceFactory(definition);
    scene.remove(resources.group); resources.dispose();
    resources = next; scene.add(resources.group); compilePending = true;
  }
  function replaceLayer(name, definition) {
    ensureActive();
    if (typeof name !== "string" || !name) throw new TypeError("Native static: nom de couche invalide");
    const next = layerFactory(definition);
    const previous = layers.get(name);
    if (previous) { scene.remove(previous.group); previous.dispose(); }
    layers.set(name, next);
    scene.add(next.group); compilePending = true;
  }
  function removeLayer(name) {
    ensureActive();
    const previous = layers.get(name);
    if (!previous) return;
    scene.remove(previous.group);
    previous.dispose();
    layers.delete(name);
  }
  function attach(parent, before = null) {
    ensureActive();
    if (!(parent instanceof Element)) throw new TypeError("Native static: conteneur absent");
    parent.insertBefore(canvas, before);
  }
  function detach() {
    ensureActive();
    canvas.remove();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(resources.group);
    if (playerResources) scene.remove(playerResources.group);
    if (flowResources) scene.remove(flowResources.group);
    for (const layer of layers.values()) { scene.remove(layer.group); layer.dispose(); }
    layers.clear();
    canvas.remove();
    flowResources?.dispose(); playerResources?.dispose(); resources.dispose(); renderer.dispose(); renderer.forceContextLoss();
    canvas.width = 0; canvas.height = 0;
  }
  // Les ressources sont accessibles au hook de mutation du banc, jamais au moteur.
  return Object.freeze({ render, report, dispose, replaceResources, replaceLayer, removeLayer, attach, detach,
    updatePalette: palette => resources.updatePalette?.(palette),
    updateFamily: (family, presentation) => resources.updateFamily?.(family, presentation),
    get resources() { return resources; },
    get playerResources() { return playerResources; },
    get canvas() { return canvas; } });
}
