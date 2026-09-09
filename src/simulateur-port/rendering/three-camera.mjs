import { PerspectiveCamera, Vector3 } from "three";

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`Camera: ${name} invalide`);
  return value;
}

function vector(values, name) {
  if (!Array.isArray(values) || values.length !== 3 || !values.every(Number.isFinite)) {
    throw new TypeError(`Camera: ${name} invalide`);
  }
  return Object.freeze([...values]);
}

// Présentation seulement : monde métrique XY, Z vertical ; viewport en pixels
// CSS, indépendant du DPR. La base est celle déjà calculée par le propriétaire
// Legacy (suivi/interpolation/commandes), jamais un second contrôleur caméra.
export function createCameraSnapshot({ basis, width, height, focalScale, near, far }) {
  const snapshot = {
    position: vector(basis.position, "position"),
    right: vector(basis.right, "right"),
    up: vector(basis.up, "up"),
    forward: vector(basis.forward, "forward"),
    width: positive(width, "width"),
    height: positive(height, "height"),
    focal: Math.min(width, height) * positive(focalScale, "focalScale"),
    near: positive(near, "near"),
    far: positive(far, "far")
  };
  if (far <= near) throw new TypeError("Camera: far doit dépasser near");
  return Object.freeze(snapshot);
}

export function createThreeCamera() {
  const camera = new PerspectiveCamera();
  const cameraPoint = new Vector3();
  camera.up.set(0, 0, 1);
  camera.matrixAutoUpdate = false;
  let frame = null;

  function update(snapshot) {
    frame = snapshot;
    const { position: p, right: r, up: u, forward: f } = frame;
    camera.fov = 2 * Math.atan(frame.height / (2 * frame.focal)) * 180 / Math.PI;
    camera.aspect = frame.width / frame.height;
    camera.near = frame.near;
    camera.far = frame.far;
    camera.updateProjectionMatrix();
    // Colonnes right, up, -forward : Three regarde son axe local -Z.
    // La matrice est l'autorité ; ni lookAt ni contrôleur supplémentaire.
    camera.position.fromArray(p);
    camera.matrix.set(
      r[0], u[0], -f[0], p[0],
      r[1], u[1], -f[1], p[1],
      r[2], u[2], -f[2], p[2],
      0, 0, 0, 1
    );
    camera.updateMatrixWorld(true);
    return camera;
  }

  function project(point) {
    if (!frame) throw new Error("Camera: appeler update avant project");
    cameraPoint.fromArray(point).applyMatrix4(camera.matrixWorldInverse);
    const depth = -cameraPoint.z;
    if (depth < frame.near - 1e-7) return null;
    // Même tolérance et dénominateur que project() Legacy au plan proche.
    cameraPoint.z = -Math.max(frame.near, depth);
    cameraPoint.applyMatrix4(camera.projectionMatrix);
    // Pas de rejet hors écran/au-delà de far : contrat d'ancres Legacy.
    // Le clipping des primitives et la profondeur GPU logarithmique Legacy
    // ne sont PAS reproduits par la matrice perspective standard Three.
    return {
      x: (cameraPoint.x + 1) * frame.width / 2,
      y: (1 - cameraPoint.y) * frame.height / 2,
      depth,
      scale: frame.focal / Math.max(frame.near, depth)
    };
  }

  // Aucune ressource GPU, listener ou boucle à libérer ; matrices réutilisées.
  return Object.freeze({ camera, update, project });
}
