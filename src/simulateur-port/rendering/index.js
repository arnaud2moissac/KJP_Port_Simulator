import "./three-smoke.js";
import renderFrames from "./render-frame.cjs";
import { createCameraSnapshot, createThreeCamera } from "./three-camera.mjs";
import { createSurfaceFrame } from "./surface-frame.mjs";
import { createThreeSurfaceRenderer } from "./three-surfaces.mjs";
import { createSurfaceComparison } from "./surface-comparison.mjs";
import { createNativeStaticPrototype } from "./native-static-prototype.mjs";
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
preloadNativePlayerModel();

globalThis.KJPRenderFrames = Object.freeze(renderFrames);
globalThis.KJPThreeCamera = Object.freeze({ createCameraSnapshot, createThreeCamera });
globalThis.KJPThreeSurfaces = Object.freeze({ createSurfaceFrame, createThreeSurfaceRenderer, createSurfaceComparison });
globalThis.KJPThreeNative = Object.freeze({ createNativeStaticPrototype,
  createNativeInfrastructurePrototype: (definition, options = {}) => createNativeStaticPrototype(definition, {
    resourceFactory: createNativeInfrastructureResources,
    playerFactory: definition => createNativePlayerResources(definition, {
      modelFactory: createNativePlayerModelResources
    }),
    flowFactory: createNativeFlowResources,
    layerFactory: createNativeInfrastructureResources,
    ...options
  })
});
