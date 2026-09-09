import {
  BufferGeometry, Camera, CustomBlending, DoubleSide, DynamicDrawUsage, GLSL3,
  InterleavedBuffer, InterleavedBufferAttribute, LessEqualDepth, Mesh,
  NoToneMapping, OneFactor, OneMinusSrcAlphaFactor, RawShaderMaterial, Scene,
  WebGLRenderer
} from "three";
import { createThreeCamera } from "./three-camera.mjs";
import { projectSurfaceFrame } from "./surface-frame.mjs";
import { compileSurfaceBatches } from "./surface-geometry.mjs";

export function createThreeSurfaceRenderer(canvas) {
  const renderer = new WebGLRenderer({
    canvas, alpha: true, antialias: true, premultipliedAlpha: true,
    preserveDrawingBuffer: false
  });
  renderer.setClearColor(0, 0);
  renderer.toneMapping = NoToneMapping;
  renderer.sortObjects = false;
  const scene = new Scene();
  const screenCamera = new Camera();
  const bridge = createThreeCamera();
  const colorCache = new Map();
  const parser = document.createElement("canvas").getContext("2d");
  let disposed = false;
  let reallocations = 0;
  const parseColor = color => {
    if (colorCache.has(color)) return colorCache.get(color);
    parser.fillStyle = "#000000";
    parser.fillStyle = color || "#000000";
    const normalized = parser.fillStyle;
    let result;
    if (normalized.startsWith("#")) {
      const hex = normalized.slice(1);
      const expanded = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
      result = [0, 2, 4].map(i => parseInt(expanded.slice(i, i + 2), 16) / 255);
      result.push(expanded.length >= 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1);
    } else {
      const values = normalized.match(/[\d.]+/g)?.map(Number) || [];
      result = [values[0] / 255, values[1] / 255, values[2] / 255, values[3] ?? 1];
    }
    colorCache.set(color, result);
    return result;
  };
  const batches = ["opaque", "translucent", "strokes"].map((name, order) => {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      // Couleurs CSS déjà display-referred : aucune conversion sRGB/linéaire
      // ni tone mapping. Sortie prémultipliée comme le shader Legacy.
      vertexShader: `precision highp float;
        in vec3 position;
        in vec4 color;
        out vec4 v_color;
        void main() { gl_Position = vec4(position, 1.0); v_color = color; }`,
      fragmentShader: `precision mediump float;
        in vec4 v_color;
        out vec4 outColor;
        void main() { outColor = vec4(v_color.rgb * v_color.a, v_color.a); }`,
      transparent: true, forceSinglePass: true, side: DoubleSide,
      depthTest: true, depthFunc: LessEqualDepth, depthWrite: name !== "translucent",
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
      toneMapped: false
    });
    const mesh = new Mesh(new BufferGeometry(), material);
    mesh.frustumCulled = false; // Sommets déjà en NDC, clipping CPU + GPU écran.
    mesh.renderOrder = order;
    scene.add(mesh);
    return { name, mesh, buffer: null };
  });

  function render(frame, pixelRatio = 1) {
    if (disposed) throw new Error("Surface renderer disposed");
    const { width, height } = frame.camera;
    // Dimensions physiques exactes du Legacy (Math.round, pas Math.floor).
    const bufferWidth = Math.round(width * pixelRatio), bufferHeight = Math.round(height * pixelRatio);
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) renderer.setSize(bufferWidth, bufferHeight, false);
    const projected = projectSurfaceFrame(frame, bridge);
    const compiled = compileSurfaceBatches(projected, frame.camera, parseColor);
    for (const batch of batches) {
      const data = compiled[batch.name];
      if (!batch.buffer || batch.buffer.array.length < data.length) {
        // Une croissance de capacité remplace et libère l'ancien buffer GPU.
        batch.mesh.geometry.dispose();
        batch.mesh.geometry = new BufferGeometry();
        const capacity = Math.max(21, 2 ** Math.ceil(Math.log2(Math.max(1, data.length))));
        batch.buffer = new InterleavedBuffer(new Float32Array(Math.ceil(capacity / 7) * 7), 7);
        batch.buffer.setUsage(DynamicDrawUsage);
        batch.mesh.geometry.setAttribute("position", new InterleavedBufferAttribute(batch.buffer, 3, 0));
        batch.mesh.geometry.setAttribute("color", new InterleavedBufferAttribute(batch.buffer, 4, 3));
        reallocations += 1;
      }
      batch.buffer.array.set(data);
      batch.buffer.clearUpdateRanges();
      if (data.length) {
        batch.buffer.addUpdateRange(0, data.length);
        batch.buffer.needsUpdate = true;
      }
      batch.mesh.geometry.setDrawRange(0, data.length / 7);
      batch.mesh.visible = data.length > 0;
    }
    renderer.render(scene, screenCamera);
    return {
      polygons: projected.polygons.length, triangles: compiled.triangles,
      triangulationFailures: compiled.triangulationFailures,
      drawCalls: renderer.info.render.calls,
      gpuTriangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      reallocations, bufferFloats: batches.reduce((sum, batch) => sum + batch.buffer.array.length, 0)
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const { mesh } of batches) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    colorCache.clear();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return Object.freeze({ render, dispose, context: renderer.getContext() });
}
