import { projectSurfaceFrame } from "./surface-frame.mjs";

function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = ratio => sorted[Math.ceil(sorted.length * ratio) - 1];
  return { samples, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) };
}

// Instrumentation d'une seule soumission HORS des échantillons CPU. Les
// capacités bufferData numériques sont des allocations, pas des transferts.
function observeUploads(gl, render) {
  const originals = { bufferData: gl.bufferData, bufferSubData: gl.bufferSubData };
  const stats = { uploadedBytes: 0, allocatedBytes: 0, allocations: 0, uploads: 0 };
  const bytes = (data, offset = 0, length) => {
    if (typeof data === "number" || data == null) return 0;
    const elementBytes = data.BYTES_PER_ELEMENT || 1;
    return (length || (data.byteLength / elementBytes - offset)) * elementBytes;
  };
  gl.bufferData = function(target, data, usage, offset, length) {
    stats.allocations += 1;
    stats.allocatedBytes += typeof data === "number" ? data : bytes(data, offset, length);
    if (typeof data !== "number") { stats.uploads += 1; stats.uploadedBytes += bytes(data, offset, length); }
    return originals.bufferData.apply(this, arguments);
  };
  gl.bufferSubData = function(target, destination, data, offset, length) {
    stats.uploads += 1;
    stats.uploadedBytes += bytes(data, offset, length);
    return originals.bufferSubData.apply(this, arguments);
  };
  try { render(); return stats; }
  finally { Object.assign(gl, originals); }
}

function describeContext(gl) {
  const extension = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    version: gl.getParameter(gl.VERSION),
    vendor: gl.getParameter(extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
    renderer: gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    timerQueryAvailable: Boolean(gl.getExtension("EXT_disjoint_timer_query_webgl2")),
    gpuTimeMs: null, gpuMemoryBytes: null
  };
}

// Synchrone : aucune frame visible/physique ne s'intercale pendant une paire.
// finish() avant chaque mesure vide la file GPU ; son attente est exclue.
// Ces distributions CPU ne représentent ni une cadence réelle ni du temps GPU.
export function profileSurfaceRenderers({ frame, projected, pixelRatio, legacy, three, legacyContext, warmup = 30, samples = 120, orderOffset = 0 }) {
  if (!Number.isInteger(warmup) || warmup < 3 || warmup > 300
    || !Number.isInteger(samples) || samples < 1 || samples > 600) throw new RangeError("Profilage: échantillonnage invalide");
  const renderLegacy = () => legacy.render(projected.polygons, projected.lines);
  const renderThree = timings => three.renderProjected(projected, frame.camera, pixelRatio, timings);
  for (let i = 0; i < warmup; i += 1) { renderLegacy(); renderThree(); }
  legacyContext.finish(); three.context.finish();
  const before = renderThree();
  const values = { legacy: [], three: [], projection: [], compile: [], stage: [], submit: [] };
  const measure = (name, action) => {
    legacyContext.finish(); three.context.finish();
    const start = performance.now();
    action();
    values[name].push(performance.now() - start);
  };
  for (let i = 0; i < samples; i += 1) {
    const pair = (i + orderOffset) % 2 ? ["three", "legacy"] : ["legacy", "three"];
    for (const name of pair) {
      measure(name,
        name === "legacy" ? renderLegacy : () => renderThree());
    }
    // Profil des propriétaires séparé : aucune horloge supplémentaire dans les
    // deux mesures comparables ci-dessus. Ne pas sommer des percentiles.
    legacyContext.finish(); three.context.finish();
    const projectionStart = performance.now();
    projectSurfaceFrame(frame);
    values.projection.push(performance.now() - projectionStart);
    const timings = {};
    renderThree(timings);
    values.compile.push(timings.compileMs);
    values.stage.push(timings.stageMs);
    values.submit.push(timings.submitMs);
  }
  legacyContext.finish(); three.context.finish();
  const uploads = {
    legacy: observeUploads(legacyContext, renderLegacy),
    three: observeUploads(three.context, () => renderThree())
  };
  const after = renderThree();
  return {
    protocol: "projected-input-cpu-v1", warmup, sampleCount: samples, orderOffset,
    scope: "Identical projected input; compile, staging and GL submission. World capture, projection, overlays, physics, readback and GPU completion excluded.",
    cpuMs: Object.fromEntries(Object.entries(values).map(([key, data]) => [key, distribution(data)])),
    context: { legacy: describeContext(legacyContext), three: describeContext(three.context) },
    uploads,
    legacy: { ...legacy.report(), bufferFloats: null, retainedBufferBytes: null },
    three: { ...after, measuredReallocations: after.reallocations - before.reallocations, retainedBufferBytes: after.bufferFloats * 4 },
    glErrors: [legacyContext.getError(), three.context.getError()]
  };
}
