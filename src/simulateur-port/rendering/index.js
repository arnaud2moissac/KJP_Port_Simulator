import "./three-smoke.js";
import renderFrames from "./render-frame.cjs";
import { createCameraSnapshot, createThreeCamera } from "./three-camera.mjs";

globalThis.KJPRenderFrames = Object.freeze(renderFrames);
globalThis.KJPThreeCamera = Object.freeze({ createCameraSnapshot, createThreeCamera });
