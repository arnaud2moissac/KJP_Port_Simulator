import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  REVISION,
  Scene,
  WebGLRenderer
} from "three";

function smokeTest() {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(1);
  renderer.setSize(2, 2, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 0.1, 10);
  camera.position.z = 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0, 0.5, 0
  ], 3));
  const material = new MeshBasicMaterial({ color: 0xffffff });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  renderer.render(scene, camera);

  const context = renderer.getContext();
  const report = {
    revision: REVISION,
    renderer: "WebGLRenderer",
    webgl2: typeof WebGL2RenderingContext !== "undefined"
      && context instanceof WebGL2RenderingContext,
    width: renderer.domElement.width,
    height: renderer.domElement.height,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles
  };

  scene.remove(mesh);
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  return report;
}

globalThis.KJPThreeRendering = Object.freeze({
  revision: REVISION,
  renderer: "WebGLRenderer",
  role: "migration-smoke",
  activeByDefault: false,
  smokeTest
});
