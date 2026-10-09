import {
  Color, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, ShaderMaterial, Vector2
} from "three";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

function applyColor(material, value) {
  if (typeof value !== "string") throw new TypeError("Flux natif : couleur absente");
  const rgba = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(value);
  const opacity = rgba ? Number(rgba[4]) : 1;
  const color = material.color || material.uniforms.tint.value;
  color.setStyle(rgba ? `rgb(${rgba[1]},${rgba[2]},${rgba[3]})` : value);
  material.opacity = opacity;
  const transparent = material.isShaderMaterial || opacity < 1;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}

function checkedPoint(point) {
  if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
    throw new TypeError("Flux natif : point monde invalide");
  }
  return point;
}

// Les flux uniformes permettent une advection analytique : seuls les uniforms changent.
// Les rubans restent au plan d'eau, derrière les coques et les pontons.
function createParticleRecord(field) {
  const current = field.kind === "arrows";
  const limit = current ? 128 : 256;
  if (field.capacity > limit) throw new RangeError(`Flux natif : capacité maximale ${limit}`);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(field.capacity * 3);
  let seed = 847;
  for (let index = 0; index < seeds.length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    seeds[index] = seed / 4294967296;
  }
  // Décaler la grille du courant évite de superposer les têtes des deux champs.
  if (current) for (let index = 0; index < seeds.length; index += 3) {
    seeds[index] = (seeds[index] + .317) % 1;
    seeds[index + 1] = (seeds[index + 1] + .419) % 1;
  }
  geometry.setAttribute("seed", new InstancedBufferAttribute(seeds, 3));
  geometry.instanceCount = 0;
  const material = new ShaderMaterial({
    transparent: true, depthTest: true, depthWrite: false, side: DoubleSide,
    toneMapped: false,
    uniforms: {
      velocity: { value: new Vector2() }, time: { value: 0 },
      domainMin: { value: new Vector2() }, domainSize: { value: new Vector2(1, 1) },
      resolution: { value: new Vector2(1, 1) }, nearClip: { value: .035 },
      width: { value: field.width }, tint: { value: new Color() }, opacity: { value: 0 }
    },
    vertexShader: /* glsl */`
      attribute vec3 seed;
      uniform vec2 velocity, domainMin, domainSize, resolution;
      uniform float time, width, nearClip;
      varying vec2 ribbon;
      varying vec2 particleSize;
      varying float visibility;
      void main() {
        vec2 offset = mod(seed.xy * domainSize + velocity * time - domainMin, domainSize);
        vec2 head = domainMin + offset;
        ${current ? "vec2 trail = velocity * 8.5;" : /* glsl */`
        // Progression linéaire : 0,5 nd reprend la longueur de l'ancien 5 nd,
        // et 12 nd garde sa longueur. Sous 0,5 nd, la queue tend vers zéro.
        float speedKn = length(velocity) / .514444;
        float referenceKn = mix(5., 12., max(0., (speedKn - .5) / 11.5));
        float trailScale = referenceKn / max(speedKn, .5);
        vec2 trail = velocity * (.2 * trailScale);
        `}
        // Une queue ne rejoint jamais l'autre bord du domaine périodique.
        vec2 edge = min(offset, domainSize - offset);
        float boundary = smoothstep(0., max(.15, length(trail)), min(edge.x, edge.y));
        float age = fract(seed.z + time / 8.);
        visibility = boundary * smoothstep(0., .12, age) * (1. - smoothstep(.8, 1., age));
        vec4 headView = modelViewMatrix * vec4(head, ${current ? ".01" : ".03"}, 1.);
        vec4 tailView = modelViewMatrix * vec4(head - trail, ${current ? ".01" : ".03"}, 1.);
        if (headView.z >= -nearClip) {
          visibility = 0.;
          gl_Position = vec4(2., 2., 2., 1.);
          ribbon = position.xy;
          return;
        }
        if (tailView.z > -nearClip) {
          float ratio = (-nearClip - headView.z) / (tailView.z - headView.z);
          tailView = mix(headView, tailView, clamp(ratio, 0., 1.));
        }
        vec4 headClip = projectionMatrix * headView;
        vec4 tailClip = projectionMatrix * tailView;
        vec2 delta = (headClip.xy / headClip.w - tailClip.xy / tailClip.w) * resolution * .5;
        float pixels = length(delta);
        // Longueur apparente bornée, quelle que soit la distance de la caméra.
        float screenRatio = min(1., ${current ? "70." : "35."} / max(pixels, .001));
        float worldRatio = screenRatio * headClip.w / mix(tailClip.w, headClip.w, screenRatio);
        tailClip = mix(headClip, tailClip, worldRatio);
        vec2 normal = vec2(-delta.y, delta.x) / max(pixels, .001);
        vec4 clip = mix(tailClip, headClip, position.x);
        clip.xy += normal * position.y * width / resolution * clip.w;
        gl_Position = clip;
        ribbon = position.xy;
        particleSize = vec2(min(pixels, ${current ? "70." : "35."}), width * .5);
      }
    `,
    fragmentShader: current ? /* glsl */`
      uniform vec3 tint;
      uniform float opacity;
      varying vec2 ribbon, particleSize;
      varying float visibility;
      float segmentDistance(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a;
        return length(p - a - ab * clamp(dot(p - a, ab) / max(dot(ab, ab), .001), 0., 1.));
      }
      void main() {
        float x = ribbon.x;
        float taper = min(pow(clamp(x / .43, 0., 1.), .72), 1. - smoothstep(.73, .90, x));
        float halfWidth = .77 * taper;
        float aa = max(fwidth(ribbon.y), .025);
        float fill = (1. - smoothstep(halfWidth - aa, halfWidth + aa, abs(ribbon.y))) * step(x, .90);
        vec2 p = ribbon * particleSize;
        float spine = (1. - smoothstep(.30, .70, abs(p.y)))
          * smoothstep(.04, .20, x) * (1. - smoothstep(.83, .90, x));
        // Corps de la variante 2, pointe ouverte de la variante 3 (1,75 px).
        float tip = particleSize.x * .995;
        float base = max(0., tip - 5.28);
        float side = min(particleSize.y * .87, 2.784);
        float d = min(segmentDistance(p, vec2(base, side), vec2(tip, 0.)),
                      segmentDistance(p, vec2(base, -side), vec2(tip, 0.)));
        float head = 1. - smoothstep(.875, 1.525, d);
        float alpha = max(fill * .38, max(spine * .40, head));
        gl_FragColor = vec4(tint, opacity * alpha * visibility);
        #include <colorspace_fragment>
      }
    ` : /* glsl */`
      uniform vec3 tint;
      uniform float opacity;
      varying vec2 ribbon;
      varying float visibility;
      void main() {
        float trail = pow(ribbon.x, 1.3);
        float edge = 1. - smoothstep(.22, 1., abs(ribbon.y));
        gl_FragColor = vec4(tint, opacity * trail * edge * visibility);
        #include <colorspace_fragment>
      }
    `
  });
  applyColor(material, field.color);
  const object = new Mesh(geometry, material);
  return { object, geometry, material, capacity: field.capacity, count: 0, updates: 0, kind: field.kind };
}

function updateParticles(record, field, viewport) {
  const { vector, time, domain, count } = field;
  if (!Array.isArray(vector) || vector.length !== 2 || !vector.every(Number.isFinite)
    || !Number.isFinite(time) || time < 0 || !domain
    || ![domain.minX, domain.minY, domain.width, domain.height].every(Number.isFinite)
    || domain.width <= 0 || domain.height <= 0
    || !Number.isInteger(count) || count < 0 || count > record.capacity
    || !viewport || ![viewport.width, viewport.height, viewport.near].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0 || viewport.near <= 0) {
    throw new TypeError("Flux natif : présentation invalide");
  }
  const u = record.material.uniforms;
  u.velocity.value.fromArray(vector);
  u.time.value = time;
  u.domainMin.value.set(domain.minX, domain.minY);
  u.domainSize.value.set(domain.width, domain.height);
  u.resolution.value.set(viewport.width, viewport.height);
  u.nearClip.value = viewport.near;
  u.opacity.value = record.material.opacity;
  record.count = Math.hypot(...vector) < .02 ? 0 : count;
  record.geometry.instanceCount = record.count;
}

// Buffer volontairement séparé des ressources statiques. La présentation peut
// déplacer les particules à chaque image sans reconstruire le port ni le bateau.
export function createNativeFlowResources({ fields }) {
  if (!Array.isArray(fields) || !fields.length) throw new TypeError("Flux natif : définition absente");
  const group = new Group();
  const records = new Map();
  let disposed = false;

  try {
    for (const field of fields) {
      if (!field || typeof field.id !== "string" || records.has(field.id)
        || !Number.isInteger(field.capacity) || field.capacity < 1
        || !Number.isFinite(field.width) || field.width <= 0) {
        throw new TypeError("Flux natif : champ invalide");
      }
      if ((field.id === "wind" && field.kind === "filaments")
        || (field.id === "current" && field.kind === "arrows")) {
        const record = createParticleRecord(field);
        record.object.name = `flow:${field.id}`;
        record.object.userData = { owner: `flow:${field.id}`, family: "flow", kind: field.kind };
        record.object.renderOrder = field.id === "current" ? -3 : -2;
        record.object.frustumCulled = false;
        group.add(record.object);
        records.set(field.id, record);
        continue;
      }
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(new Float32Array(field.capacity * 6));
      geometry.instanceCount = 0;
      const material = new LineMaterial({
        // L'alpha CSS est appliqué séparément ci-dessous. Le transmettre au
        // constructeur Color de Three produit un avertissement et l'ignore.
        color: 0xffffff,
        linewidth: field.width,
        worldUnits: false,
        toneMapped: false,
        alphaToCoverage: false,
        depthWrite: false
      });
      applyColor(material, field.color);
      const object = new LineSegments2(geometry, material);
      object.name = `flow:${field.id}`;
      object.userData = { owner: `flow:${field.id}`, family: "flow", kind: "line" };
      object.renderOrder = -2;
      object.frustumCulled = false;
      group.add(object);
      records.set(field.id, {
        object,
        geometry,
        material,
        capacity: field.capacity,
        count: 0,
        updates: 0
      });
    }
  } catch (error) {
    for (const record of records.values()) {
      record.geometry.dispose();
      record.material.dispose();
    }
    group.clear();
    throw error;
  }

  function update(presentation, viewport) {
    if (disposed) throw new Error("Flux natif : ressources libérées");
    if (!Array.isArray(presentation?.fields)) throw new TypeError("Flux natif : présentation absente");
    const presented = new Set();
    for (const field of presentation.fields) {
      const record = records.get(field?.id);
      if (!record || presented.has(field.id)) {
        throw new TypeError("Flux natif : présentation de champ invalide");
      }
      presented.add(field.id);
      applyColor(record.material, field.color);
      if (record.kind) {
        updateParticles(record, field, viewport);
        continue;
      }
      if (!Array.isArray(field.segments)) throw new TypeError("Flux natif : segments absents");
      if (field.segments.length > record.capacity) throw new RangeError("Flux natif : capacité dépassée");
      const start = record.geometry.attributes.instanceStart;
      const end = record.geometry.attributes.instanceEnd;
      for (let index = 0; index < field.segments.length; index++) {
        const segment = field.segments[index];
        if (!Array.isArray(segment) || segment.length !== 2) throw new TypeError("Flux natif : segment invalide");
        start.setXYZ(index, ...checkedPoint(segment[0]));
        end.setXYZ(index, ...checkedPoint(segment[1]));
      }
      record.geometry.instanceCount = field.segments.length;
      if (field.segments.length || record.count) {
        // instanceStart et instanceEnd partagent le même buffer entrelacé.
        start.data.needsUpdate = true;
        record.updates++;
      }
      record.count = field.segments.length;
    }
    for (const [id, record] of records) {
      if (presented.has(id)) continue;
      record.geometry.instanceCount = 0;
      record.count = 0;
    }
  }

  function report() {
    if (disposed) throw new Error("Flux natif : ressources libérées");
    return Object.fromEntries([...records].map(([id, record]) => {
      const buffer = record.kind
        ? record.geometry.attributes.seed : record.geometry.attributes.instanceStart.data;
      return [id, {
        capacity: record.capacity,
        segments: record.count,
        updates: record.updates,
        bufferBytes: buffer.array.byteLength,
        bufferVersion: buffer.version,
        geometry: record.geometry.uuid,
        ...(record.kind ? {
          kind: record.kind, particles: record.count, drawCalls: record.count ? 1 : 0,
          vector: record.material.uniforms.velocity.value.toArray(),
          time: record.material.uniforms.time.value
        } : {})
      }];
    }));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const record of records.values()) {
      record.geometry.dispose();
      record.material.dispose();
    }
    group.clear();
  }

  return Object.freeze({ group, update, report, dispose });
}
