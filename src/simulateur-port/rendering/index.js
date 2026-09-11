import "./three-smoke.js";
import renderFrames from "./render-frame.cjs";
import { createCameraSnapshot, createThreeCamera } from "./three-camera.mjs";
import { createSurfaceFrame } from "./surface-frame.mjs";
import { createThreeSurfaceRenderer } from "./three-surfaces.mjs";
import { createSurfaceComparison } from "./surface-comparison.mjs";
import { createNativeStaticPrototype } from "./native-static-prototype.mjs";
import { createNativeInfrastructureResources } from "./native-infrastructure-resources.mjs";
import { createNativePlayerResources } from "./native-player-resources.mjs";

globalThis.KJPRenderFrames = Object.freeze(renderFrames);
globalThis.KJPThreeCamera = Object.freeze({ createCameraSnapshot, createThreeCamera });
globalThis.KJPThreeSurfaces = Object.freeze({ createSurfaceFrame, createThreeSurfaceRenderer, createSurfaceComparison });
globalThis.KJPThreeNative = Object.freeze({ createNativeStaticPrototype,
  createNativeInfrastructurePrototype: (definition, options = {}) => createNativeStaticPrototype(definition, {
    resourceFactory: createNativeInfrastructureResources,
    playerFactory: createNativePlayerResources,
    ...options
  })
});
