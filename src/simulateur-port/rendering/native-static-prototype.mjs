import { Scene, WebGLRenderer, NoToneMapping, SRGBColorSpace } from "three";
import { createThreeCamera } from "./three-camera.mjs";
import { createNativeStaticResources, nativeStaticResourceBuilds } from "./native-static-resources.mjs";

// Banc N1 explicite, hors écran. Aucun RAF, contrôleur, horloge ou RenderFrame.
export function createNativeStaticPrototype(definition, { resourceFactory = createNativeStaticResources } = {}) {
  let resources = resourceFactory(definition);
  const canvas = document.createElement("canvas");
  canvas.id = "kjp-native-static-prototype";
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch (error) {
    resources.dispose();
    throw error;
  }
  renderer.setClearColor(0, 0);
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.add(resources.group);
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
  function render(camera, pixelRatio) {
    ensureActive();
    lastCamera = camera;
    if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
    const w = Math.round(camera.width * pixelRatio), h = Math.round(camera.height * pixelRatio);
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w / pixelRatio, h / pixelRatio, false);
    renderer.render(scene, bridge.update(camera));
    resources.afterRender?.();
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
    return {
      frames, resourceBuilds: nativeStaticResourceBuilds(), camera: lastCamera ? structuredClone(lastCamera) : null,
      resources: resources.group.children.map(object => ({ role: object.name, geometry: object.geometry.uuid, attributes: attributes(object.geometry) })),
      ...(resources.report ? { catalog: resources.report(), memory: { ...renderer.info.memory },
        materials: [...new Set(resources.group.children.map(o => o.material))].map(m => ({
          id: m.uuid, role: m.userData.role, color: m.color.getHexString(), opacity: m.opacity
        })) } : {}),
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
    resources.dispose(); renderer.dispose(); renderer.forceContextLoss();
    canvas.width = 0; canvas.height = 0;
  }
  // Les ressources sont accessibles au hook de mutation du banc, jamais au moteur.
  return Object.freeze({ render, report, dispose, replaceResources,
    updatePalette: palette => resources.updatePalette?.(palette), get resources() { return resources; } });
}
