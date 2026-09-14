import { REVISION } from "three";
import { createCameraSnapshot, createThreeCamera } from "./three-camera.mjs";
import { createNativeWorldRenderer } from "./native-world-renderer.mjs";
import { createNativeInfrastructureResources } from "./native-infrastructure-resources.mjs";
import { createNativePlayerResources } from "./native-player-resources.mjs";
import { createNativePlayerModelResources, preloadNativePlayerModel } from "./native-player-model.mjs";
import { createNativeFlowResources } from "./native-flow-resources.mjs";

// Le livrable est autonome. GLTFLoader n'utilise que parseAsync() sur les
// octets embarqués ; neutraliser son chemin FileLoader empêche aussi toute
// requête accidentelle si cet invariant régressait.
globalThis.__KJP_OFFLINE_REQUEST_BLOCKED__ = () => {
  throw new Error("KJP : requête réseau interdite dans le renderer embarqué");
};
void preloadNativePlayerModel().catch(() => {
  // Le renderer visible relaie l'échec vers son secours Canvas 2D.
});

globalThis.KJPThreeCamera = Object.freeze({ createCameraSnapshot, createThreeCamera });
globalThis.KJPThreeRendering = Object.freeze({
  revision: REVISION,
  renderer: "WebGLRenderer",
  role: "native-production",
  activeByDefault: true
});
globalThis.KJPThreeNative = Object.freeze({
  createNativeWorldRenderer: (definition, options = {}) => createNativeWorldRenderer(definition, {
    resourceFactory: createNativeInfrastructureResources,
    playerFactory: definition => createNativePlayerResources(definition, {
      modelFactory: createNativePlayerModelResources
    }),
    flowFactory: createNativeFlowResources,
    layerFactory: createNativeInfrastructureResources,
    ...options
  })
});
