import { createThreeSurfaceRenderer } from "./three-surfaces.mjs";

// Les écarts ne sont tolérables que sur une bordure Legacy à un pixel physique.
// Un changement de couleur uniforme, de couverture ou de profondeur intérieure
// échoue : pas de seuil global qui masquerait une surface manquante.
export function compareSurfacePixels(reference, candidate, width, height) {
  if (reference.length !== width * height * 4 || candidate.length !== reference.length) {
    throw new TypeError("Surface pixels: dimensions invalides");
  }
  let differentPixels = 0, interiorDifferentPixels = 0, coveredPixels = 0, maximumChannelError = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (reference[offset + 3]) coveredPixels += 1;
      let difference = 0;
      for (let c = 0; c < 4; c += 1) difference = Math.max(difference, Math.abs(reference[offset + c] - candidate[offset + c]));
      if (!difference) continue;
      differentPixels += 1;
      maximumChannelError = Math.max(maximumChannelError, difference);
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy += 1) {
        for (let dx = -1; dx <= 1 && !edge; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = (ny * width + nx) * 4;
          for (let c = 0; c < 4; c += 1) if (reference[neighbor + c] !== reference[offset + c]) edge = true;
        }
      }
      if (!edge) interiorDifferentPixels += 1;
    }
  }
  return { differentPixels, interiorDifferentPixels, coveredPixels, maximumChannelError };
}

// Banc isolé, instancié seulement par l'API ?test. Ne prend jamais possession
// du canevas visible, de la boucle, du fond CSS ou des états GL du Legacy actif.
export function createSurfaceComparison(createLegacy) {
  const legacyCanvas = document.createElement("canvas");
  const threeCanvas = document.createElement("canvas");
  const legacyContext = legacyCanvas.getContext("webgl2", {
    alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false
  });
  if (!legacyContext) throw new Error("Surface comparison: WebGL2 indisponible");
  let three;
  let legacy;
  try {
    legacy = createLegacy(legacyContext);
    three = createThreeSurfaceRenderer(threeCanvas);
  } catch (error) {
    legacyContext.getExtension("WEBGL_lose_context")?.loseContext();
    throw error;
  }
  let disposed = false;
  return Object.freeze({
    compare(frame, projectedLegacy, pixelRatio, images = false) {
      if (disposed) throw new Error("Surface comparison disposed");
      const width = Math.round(frame.camera.width * pixelRatio);
      const height = Math.round(frame.camera.height * pixelRatio);
      if (legacyCanvas.width !== width) legacyCanvas.width = width;
      if (legacyCanvas.height !== height) legacyCanvas.height = height;
      legacy.render(projectedLegacy.polygons, []);
      const reference = new Uint8Array(width * height * 4);
      legacyContext.readPixels(0, 0, width, height, legacyContext.RGBA, legacyContext.UNSIGNED_BYTE, reference);
      const stats = three.render(frame, pixelRatio);
      const candidate = new Uint8Array(reference.length);
      three.context.readPixels(0, 0, width, height, three.context.RGBA, three.context.UNSIGNED_BYTE, candidate);
      const report = {
        width, height, pixelRatio, waterBackground: frame.waterBackground,
        worldPolygons: frame.polygons.length,
        legacy: legacy.report(), three: stats,
        pixels: compareSurfacePixels(reference, candidate, width, height),
        glErrors: [legacyContext.getError(), three.context.getError()]
      };
      if (images) report.images = { legacy: legacyCanvas.toDataURL(), three: threeCanvas.toDataURL() };
      return report;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      three.dispose();
      // Le Legacy historique n'expose pas de disposal : la perte de SON
      // contexte détaché libère ses programmes/buffers, jamais ceux de l'écran.
      legacyContext.getExtension("WEBGL_lose_context")?.loseContext();
    }
  });
}
