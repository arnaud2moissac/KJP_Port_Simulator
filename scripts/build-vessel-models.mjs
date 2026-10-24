#!/usr/bin/env node
// Local, deterministic presentation assets. Nothing here is consumed by physics.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ShapeUtils, Vector2, REVISION } from "three";

const require = createRequire(import.meta.url);
const Profiles = require("../src/simulateur-port/vessel-profiles.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = "docs/four-vessel-glb-geometry.json";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const linear = (a, b, t) => a + (b - a) * t;
const minus = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = v => Math.hypot(...v);
const unit = v => v.map(x => x / norm(v));
const sourcePoint = ([x, y, z]) => [-y, z, x];
const physicalPoint = ([x, y, z]) => [z, -x, y];
const rgb = hex => [16, 8, 0].map(shift => ((hex >> shift) & 255) / 255);

function phaseOnePhysicalProfile(profile) {
  const comparable = structuredClone(profile);
  comparable.version = "1.0.0";
  comparable.schemaVersion = 4;
  delete comparable.steering;
  delete comparable.provenance.values.steering;
  // La géométrie reste liée à la phase 1 ; seuls les taux de barre franche
  // ont été réglés à 100°/s après cette qualification.
  const historicalRate = {
    "sun-odyssey-24-2-fixed-keel-experimental": 52,
    "contessa-26-long-keel-experimental": 48,
    "pogo-40-s4-twin-rudder-experimental": 50
  }[profile.id];
  if (historicalRate !== undefined) {
    for (const rudder of comparable.rudders) rudder.rate = historicalRate * (Math.PI / 180);
  }
  return comparable;
}

// Each design owns its silhouette, cabin, cockpit and rig proportions. They
// share only construction tools, never another vessel's mesh or scaled asset.
const DESIGNS = Object.freeze([
  {
    id: "sun-odyssey-24-2-fixed-keel-experimental", file: "kjp_sun_odyssey_24_2.glb",
    acceptedProfileSha256: "7cbf2b66bc46488748f6ec4aaab1d48de33ef6de439e2a5b0d127f46c58a8e7d",
    name: "Jeanneau Sun Odyssey 24.2", hullLength: 7.20, style: "compact-cruiser",
    cabin: [[-1.48, .75, .76], [-1.12, .83, .88], [.35, .77, .90], [1.18, .50, .89], [1.48, .32, .86]],
    cabinRise: .53, cockpit: [-3.15, -1.5, .58, .57], mast: [.35, 10.10, .058], boom: [-2.25, 2.26],
    deck: 0xf2eee3, hull: 0xf1f3ef, stripe: 0x244d76, underwater: 0x344d63, trim: 0x8e7352,
    waterBeam: .90, chine: .48, windows: 3, railingStations: [-2.95, -1.95, -.55, .95, 2.30],
    notes: ["Hull7.20m; physical rail7.10m; pulpit gives LOA7.30m.", "Single tiller, sails furled, no deployed sprayhood."]
  },
  {
    id: "contessa-26-long-keel-experimental", file: "kjp_contessa_26.glb",
    acceptedProfileSha256: "1e4a2f87a1291858c3264fd0e784fc7cc427a6ca7d688bb08d598ea53a58a3f7",
    name: "Contessa 26", hullLength: 7.77, style: "classic-long-keel",
    cabin: [[-1.42, .56, .65], [-1.10, .65, .68], [.30, .61, .70], [1.13, .41, .75], [1.32, .28, .77]],
    cabinRise: .45, cockpit: [-2.95, -1.40, .40, .48], mast: [.25, 10.70, .052], boom: [-2.10, 2.10],
    deck: 0xebe2c8, hull: 0xece8d8, stripe: 0x233b55, underwater: 0x7f4337, trim: 0x95633e,
    waterBeam: .83, chine: .72, windows: 3, railingStations: [-2.85, -1.85, -.4, 1.10, 2.55],
    notes: ["Raked narrow classic stern; continuous long keel from the Phase1 polygon, not separated bands.", "The distinct keel-hung rudder keeps the validated vertical equivalent axis."]
  },
  {
    id: "pogo-40-s4-twin-rudder-experimental", file: "kjp_pogo_40_s4.glb",
    acceptedProfileSha256: "0f0037fdda0254e1f2efe40182af88421a6da552df2702a1ec51f3f8fdeb6be2",
    name: "Pogo 40 S4", hullLength: 12.19, style: "wide-racing-monohull",
    cabin: [[-2.45, 1.55, .93], [-1.95, 1.60, .97], [.3, 1.39, 1.10], [1.62, .88, 1.19], [1.90, .62, 1.22]],
    cabinRise: .55, cockpit: [-5.90, -2.45, 1.37, .68], mast: [-.05, 19.00, .085], boom: [-4.30, 2.8],
    deck: 0xd6dce0, hull: 0xf4f2e9, stripe: 0xd44436, underwater: 0x3a4249, trim: 0x313d46,
    waterBeam: .96, chine: .24, windows: 2, railingStations: [-4.90, -3.5, -1.60, .50, 2.60, 4.40],
    notes: ["Broad forefoot and hard chines, open racing cockpit; bowsprit retracted within hull LOA.", "Twin fixed rudders extend abaft the12.19m hull; full appendage envelope is measured separately."]
  },
  {
    id: "oceanis-48-fixed-keel-experimental", file: "kjp_oceanis_48.glb",
    acceptedProfileSha256: "08b5e102f83cd5ea784bc9c2d29dbbc15e3d387638aa18ff4b1a230ed8458015",
    name: "Beneteau Oceanis 48", hullLength: 14.27, style: "large-volume-cruiser",
    cabin: [[-3.12, 1.39, 1.15], [-2.67, 1.49, 1.16], [.15, 1.40, 1.20], [2.40, 1.04, 1.26], [2.85, .67, 1.30]],
    cabinRise: .76, cockpit: [-6.62, -3.13, 1.32, .83], mast: [.75, 21.69, .090], boom: [-4.60, 3.3],
    deck: 0xe8e5dc, hull: 0xe8eef0, stripe: 0x33495b, underwater: 0x3f5361, trim: 0xa58760,
    waterBeam: .94, chine: .40, windows: 4, railingStations: [-6.10, -4.40, -2.40, -.20, 2.10, 4.10, 5.80],
    notes: ["Hull14.27m; stern bathing platform gives documented overall14.60m.", "Twin wheels are static presentation; a single physical and visual rudder remains."]
  }
]);

class Builder {
  constructor(design) { this.design = design; this.positions = []; this.normals = []; this.colors = []; this.indices = []; this.spans = []; this.part = null; this.vertexMap = new Map(); }
  begin(name, role) { this.part = { name, role, start: this.indices.length }; this.spans.push(this.part); }
  tri(a, b, c, color, outward = null) {
    let points = [a, b, c].map(sourcePoint);
    let n = cross(minus(points[1], points[0]), minus(points[2], points[0]));
    if (norm(n) < 1e-10) return;
    if (outward && dot(n, sourcePoint(outward)) < 0) { [points[1], points[2]] = [points[2], points[1]]; n = n.map(v => -v); }
    n = unit(n);
    const physicalNormal = physicalPoint(n);
    const light = .76 + .24 * Math.max(0, dot(physicalNormal, unit([.6, -.8, 1.5])));
    const rgba = [...rgb(color).map(v => Math.min(1, v * light)), 1];
    for (const p of points) {
      // Hard-edge sharing within equal faces keeps true indexing and normals.
      const key = [...p, ...n, ...rgba].map(v => v.toFixed(8)).join(",");
      let index = this.vertexMap.get(key);
      if (index === undefined) { index = this.positions.length / 3; this.vertexMap.set(key, index); this.positions.push(...p); this.normals.push(...n); this.colors.push(...rgba); }
      this.indices.push(index);
    }
  }
  quad(a, b, c, d, color, outward) { this.tri(a, b, c, color, outward); this.tri(a, c, d, color, outward); }
  polygon(points, color, outward) {
    // Planar polygon is projected on the strongest normal axis for Earcut.
    const omitted = outward.map(Math.abs).indexOf(Math.max(...outward.map(Math.abs)));
    const axes = [0, 1, 2].filter(i => i !== omitted);
    const projected = points.map(p => new Vector2(p[axes[0]], p[axes[1]]));
    for (const face of ShapeUtils.triangulateShape(projected, [])) this.tri(...face.map(i => points[i]), color, outward);
  }
  box(center, size, color) {
    const corners = [];
    for (let x = -1; x <= 1; x += 2) for (let y = -1; y <= 1; y += 2) for (let z = -1; z <= 1; z += 2) corners.push([center[0] + x * size[0] / 2, center[1] + y * size[1] / 2, center[2] + z * size[2] / 2]);
    for (const [face, out] of [[[0, 1, 3, 2], [-1, 0, 0]], [[4, 6, 7, 5], [1, 0, 0]], [[0, 4, 5, 1], [0, -1, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[0, 2, 6, 4], [0, 0, -1]], [[1, 5, 7, 3], [0, 0, 1]]]) this.quad(...face.map(i => corners[i]), color, out);
  }
  tube(a, b, radius, color, sides = 5, cap = true) {
    const axis = unit(minus(b, a));
    const u = unit(cross(axis, Math.abs(axis[2]) < .9 ? [0, 0, 1] : [1, 0, 0]));
    const v = cross(axis, u);
    const ring = (p, angle) => p.map((value, i) => value + radius * (u[i] * Math.cos(angle) + v[i] * Math.sin(angle)));
    const first = [], second = [];
    for (let i = 0; i < sides; i++) { first.push(ring(a, i * Math.PI * 2 / sides)); second.push(ring(b, i * Math.PI * 2 / sides)); }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const out = minus(first[i], a);
      this.quad(first[i], first[j], second[j], second[i], color, out);
    }
    if (cap) { this.polygon(first, color, axis.map(x => -x)); this.polygon(second, color, axis); }
  }
  finish() {
    for (let i = 0; i < this.spans.length; i++) this.spans[i].count = (this.spans[i + 1]?.start ?? this.indices.length) - this.spans[i].start;
    if (this.spans.some(s => !s.count)) throw new Error("Empty geometry part");
    return this;
  }
}

function railAt(profile, x) {
  const rail = profile.geometry.gunwale;
  if (x <= rail[0].x) return rail[0];
  if (x >= rail.at(-1).x) return rail.at(-1);
  const i = rail.findIndex(p => p.x >= x);
  const t = (x - rail[i - 1].x) / (rail[i].x - rail[i - 1].x);
  return { x, halfBeam: linear(rail[i - 1].halfBeam, rail[i].halfBeam, t), z: linear(rail[i - 1].z, rail[i].z, t) };
}

function hullGeometry(b, d, p) {
  const rail = p.geometry.gunwale;
  const railMin = rail[0].x, railMax = rail.at(-1).x;
  const mid = (railMin + railMax) / 2;
  const hullMin = mid - d.hullLength / 2, hullMax = mid + d.hullLength / 2;
  const fractions = rail.flatMap((r, i) => i === rail.length - 1 ? [(r.x - railMin) / (railMax - railMin)] : [(r.x - railMin) / (railMax - railMin), ((r.x + rail[i + 1].x) / 2 - railMin) / (railMax - railMin)]);
  const sections = fractions.map(s => {
    const r = railAt(p, linear(railMin, railMax, s));
    const x = linear(hullMin, hullMax, s), wx = (s - .5) * p.geometry.lwl;
    const breadth = r.halfBeam;
    const depthFactor = .20 + .80 * Math.pow(Math.sin(Math.PI * s), d.style === "classic-long-keel" ? .55 : .35);
    const depth = p.geometry.canoeDraft * depthFactor;
    // A dedicated exact-z=0 ring makes exported waterline independently measurable.
    const water = [wx, breadth * d.waterBeam, 0];
    const bottom = [(s - .5) * p.geometry.lwl * .92, 0, -depth];
    const bottomSides = [
      [(s - .5) * p.geometry.lwl * .98, breadth * .72, -depth * d.chine],
      [(s - .5) * p.geometry.lwl * .95, breadth * .39, -depth * .82]
    ];
    return { x, breadth, z: r.z, water, bottomSides, bottom, s };
  });
  const mirrored = (point, side) => [point[0], point[1] * side, point[2]];
  for (const [name, role, low, high, color] of [
    ["upper_sheer", "silhouette", .055, 0, d.hull],
    ["sheer_stripe", "silhouette", .105, .055, d.stripe],
    ["hull_sides", "hull", null, .105, d.hull]
  ]) {
    b.begin(name, role);
    for (const side of [-1, 1]) for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i], c = sections[i + 1];
      const topA = [a.x, a.breadth * side, a.z - high], topC = [c.x, c.breadth * side, c.z - high];
      const lowA = low === null ? mirrored(a.water, side) : [a.x, a.breadth * side, a.z - low];
      const lowC = low === null ? mirrored(c.water, side) : [c.x, c.breadth * side, c.z - low];
      b.quad(topA, lowA, lowC, topC, color, [0, side, .1]);
    }
  }
  b.begin("hull_underwater", "hidden");
  for (const side of [-1, 1]) for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], c = sections[i + 1];
    const left = [a.water, ...a.bottomSides, a.bottom].map(q => mirrored(q, side));
    const right = [c.water, ...c.bottomSides, c.bottom].map(q => mirrored(q, side));
    for (let j = 0; j < left.length - 1; j++) b.quad(left[j], left[j + 1], right[j + 1], right[j], d.underwater, [0, side * (1 - j / 3), -.2 - j / 3]);
  }
  b.begin("transom", "hull");
  const stern = sections[0];
  b.polygon([[stern.x, -stern.breadth, stern.z], [stern.x, stern.breadth, stern.z], stern.water, ...stern.bottomSides, stern.bottom, ...stern.bottomSides.toReversed().map(q => mirrored(q, -1)), mirrored(stern.water, -1)], d.hull, [-1, 0, 0]);

  b.begin("deck", "hull");
  const [ca, cf, cw] = d.cockpit;
  // The aft deck is built around a real open recess rather than painted over.
  const cockpitS = [ca, cf].map(x => (x - hullMin) / (hullMax - hullMin));
  const boundaries = [...new Set([...fractions, ...cockpitS])].sort((a, c) => a - c);
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sa = boundaries[i], sc = boundaries[i + 1];
    const xa = linear(hullMin, hullMax, sa), xc = linear(hullMin, hullMax, sc);
    const ra = railAt(p, linear(railMin, railMax, sa)), rc = railAt(p, linear(railMin, railMax, sc));
    const hole = xa >= ca - 1e-8 && xc <= cf + 1e-8;
    if (hole) {
      for (const side of [-1, 1]) b.quad([xa, side * cw, ra.z], [xc, side * cw, rc.z], [xc, side * rc.halfBeam, rc.z], [xa, side * ra.halfBeam, ra.z], d.deck, [0, 0, 1]);
    } else b.quad([xa, -ra.halfBeam, ra.z], [xc, -rc.halfBeam, rc.z], [xc, rc.halfBeam, rc.z], [xa, ra.halfBeam, ra.z], d.deck, [0, 0, 1]);
  }
  b.begin("deck_edge", "silhouette");
  for (const side of [-1, 1]) for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], c = sections[i + 1];
    b.quad([a.x, side * a.breadth, a.z + .014], [c.x, side * c.breadth, c.z + .014], [c.x, side * Math.max(0, c.breadth - .035), c.z + .014], [a.x, side * Math.max(0, a.breadth - .035), a.z + .014], d.trim, [0, 0, 1]);
  }
  return { hullMin, hullMax };
}

function cockpitAndCabin(b, d, p) {
  const [aft, fore, width, floorZ] = d.cockpit;
  const railZ = x => railAt(p, x).z;
  b.begin("cockpit_and_stern_furniture", "hidden");
  b.box([(aft + fore) / 2, 0, floorZ - .035], [fore - aft, width * 2, .07], d.trim);
  for (const side of [-1, 1]) {
    b.quad([aft, side * width, floorZ], [fore, side * width, floorZ], [fore, side * width, railZ(fore)], [aft, side * width, railZ(aft)], d.hull, [0, -side, 0]);
    b.box([(aft + fore) / 2, side * (width - .15), floorZ + .17], [fore - aft - .16, .28, .12], d.deck);
    // Separate seat slats make the cockpit depth readable in the unlit material.
    for (let i = 0; i < 3; i++) b.box([(aft + fore) / 2, side * (width - .25 + i * .072), floorZ + .235], [fore - aft - .19, .052, .017], d.trim);
  }
  b.quad([fore, -width, floorZ], [fore, width, floorZ], [fore, width, railZ(fore)], [fore, -width, railZ(fore)], 0x50545a, [-1, 0, 0]);
  if (d.style !== "wide-racing-monohull") b.box([aft, 0, (floorZ + railZ(aft)) / 2], [.09, width * 2, railZ(aft) - floorZ], d.deck);

  b.begin("coachroof", "roof");
  const cabin = d.cabin;
  for (let i = 0; i < cabin.length - 1; i++) {
    const [ax, aw, az] = cabin[i], [cx, cw, cz] = cabin[i + 1];
    const roofA = az + d.cabinRise, roofC = cz + d.cabinRise;
    for (const side of [-1, 1]) {
      b.quad([ax, side * aw, az], [cx, side * cw, cz], [cx, side * cw * .83, roofC - .09], [ax, side * aw * .83, roofA - .09], d.hull, [0, side, .25]);
      b.quad([ax, side * aw * .83, roofA - .09], [cx, side * cw * .83, roofC - .09], [cx, side * cw * .57, roofC], [ax, side * aw * .57, roofA], d.deck, [0, side, 1]);
    }
    b.quad([ax, -aw * .57, roofA], [cx, -cw * .57, roofC], [cx, cw * .57, roofC], [ax, aw * .57, roofA], d.style === "wide-racing-monohull" ? d.stripe : d.deck, [0, 0, 1]);
  }
  for (const [station, direction] of [[cabin[0], -1], [cabin.at(-1), 1]]) {
    const [x, w, z] = station;
    b.polygon([[x, -w, z], [x, w, z], [x, w * .83, z + d.cabinRise - .09], [x, w * .57, z + d.cabinRise], [x, -w * .57, z + d.cabinRise], [x, -w * .83, z + d.cabinRise - .09]], d.hull, [direction, 0, 0]);
  }

  b.begin("coachroof_windows", "roof");
  for (const side of [-1, 1]) for (let i = 1; i < cabin.length - 1; i++) {
    const a = cabin[i - 1], c = cabin[i];
    const x1 = linear(a[0], c[0], .18), x2 = linear(a[0], c[0], .90);
    const w1 = linear(a[1], c[1], .18), w2 = linear(a[1], c[1], .90);
    const z1 = linear(a[2], c[2], .18), z2 = linear(a[2], c[2], .90);
    b.quad([x1, side * w1 * .965, z1 + d.cabinRise * .20], [x2, side * w2 * .965, z2 + d.cabinRise * .20], [x2, side * w2 * .862, z2 + d.cabinRise * .70], [x1, side * w1 * .862, z1 + d.cabinRise * .70], 0x233f4d, [0, side, .25]);
  }
  const aftCabin = cabin[0];
  b.quad([aftCabin[0] - .008, -.28, aftCabin[2] + .04], [aftCabin[0] - .008, .28, aftCabin[2] + .04], [aftCabin[0] - .008, .28, aftCabin[2] + d.cabinRise - .10], [aftCabin[0] - .008, -.28, aftCabin[2] + d.cabinRise - .10], 0x263d44, [-1, 0, 0]);

  b.begin("hull_portlights", "hidden");
  const lightCount = d.style === "large-volume-cruiser" ? 4 : d.style === "wide-racing-monohull" ? 0 : 2;
  // Pogo has cockpit-side glazing above, not cruiser hull portlights.
  if (!lightCount) {
    for (const side of [-1, 1]) b.box([-3.15, side * 1.73, 1.02], [.50, .035, .055], d.stripe);
  } else for (const side of [-1, 1]) for (let i = 0; i < lightCount; i++) {
    const x = -p.geometry.loa * .20 + i * p.geometry.loa * .12;
    const r = railAt(p, x), w = d.style === "large-volume-cruiser" ? .66 : .24;
    const high = r.z - .17, low = r.z - .30;
    b.quad([x - w / 2, side * r.halfBeam * .998, low], [x + w / 2, side * r.halfBeam * .998, low], [x + w / 2, side * r.halfBeam * .998, high], [x - w / 2, side * r.halfBeam * .998, high], 0x263d49, [0, side, 0]);
  }
  b.begin("deck_fittings", "hidden");
  // Hatches, grab handles and winches are decorative; no functional KJP gear.
  for (const x of [d.cabin[1][0] + .18, d.cabin.at(-2)[0]]) {
    const station = d.cabin.reduce((best, s) => Math.abs(s[0] - x) < Math.abs(best[0] - x) ? s : best, d.cabin[0]);
    b.box([x, 0, station[2] + d.cabinRise + .018], [.38, .40, .035], 0x394c55);
    for (const side of [-1, 1]) {
      b.box([x + side * .205, 0, station[2] + d.cabinRise + .026], [.025, .45, .025], 0x8c999e);
      b.box([x, side * .215, station[2] + d.cabinRise + .026], [.43, .025, .025], 0x8c999e);
    }
  }
  for (const side of [-1, 1]) {
    const x = fore - .10, r = railAt(p, x);
    b.tube([x, side * (width + .22), r.z], [x, side * (width + .22), r.z + .13], .08, 0x56616a, 8);
    b.tube([d.cabin[1][0], side * d.cabin[1][1] * .61, d.cabin[1][2] + d.cabinRise + .08], [d.cabin[2][0], side * d.cabin[2][1] * .61, d.cabin[2][2] + d.cabinRise + .08], .018, 0xaca698, 4);
  }
}

function helm(b, d) {
  const [aft, fore, width, floorZ] = d.cockpit;
  if (d.style === "large-volume-cruiser") {
    for (const [side, name] of [[-1, "wheel_port"], [1, "wheel_starboard"]]) {
      b.begin(name, "hidden");
      const center = [aft + .70, side * .96, floorZ + .74], radius = .40;
      b.box([center[0] + .14, center[1], floorZ + .35], [.27, .27, .70], d.hull);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6, next = (i + 1) * Math.PI / 6;
        const onWheel = t => [center[0], center[1] + radius * Math.cos(t), center[2] + radius * Math.sin(t)];
        b.tube(onWheel(angle), onWheel(next), .020, 0x4e565b, 4, false);
        if (i % 3 === 0) b.tube(center, onWheel(angle), .012, 0x77818a, 4, false);
      }
    }
    b.begin("cockpit_table", "hidden");
    b.box([(aft + fore) / 2 + .22, 0, floorZ + .57], [1.05, .53, .075], d.trim);
    b.box([(aft + fore) / 2 + .22, 0, floorZ + .27], [.16, .18, .54], d.hull);
  } else {
    b.begin("tiller", "hidden");
    const tillerX = aft + .35;
    b.tube([tillerX, 0, floorZ + .10], [tillerX, 0, floorZ + .43], .032, 0x787f83, 6);
    b.tube([tillerX, 0, floorZ + .43], [Math.min(fore - .18, tillerX + (fore - aft) * .57), 0, floorZ + .52], .029, d.trim, 6);
    if (d.style === "wide-racing-monohull") b.tube([tillerX + .70, 0, floorZ + .49], [tillerX + .88, -1.16, floorZ + .53], .016, 0x2d343b, 4);
  }
}

function rigAndRail(b, d, p) {
  b.begin("mast_and_rigging", "hidden");
  const [mx, top, radius] = d.mast;
  const base = railAt(p, mx).z + .12, boomZ = d.boom[1];
  b.tube([mx, 0, base], [mx, 0, top], radius, 0x9ca9ad, 8);
  b.tube([mx, 0, boomZ], [d.boom[0], 0, boomZ], radius * .75, 0x9ca9ad, 6);
  // Furled mainsail and headsail are static, pale narrow tubes.
  b.tube([d.boom[0] + .13, 0, boomZ + .08], [mx, 0, boomZ + .08], radius * 1.03, d.deck, 6);
  const rail = p.geometry.gunwale;
  const bow = rail.at(-1), stern = rail[0];
  b.tube([mx, 0, top * .97], [bow.x - .06, 0, bow.z + .22], .013, 0x747e82, 4);
  b.tube([mx, 0, top * .97], [stern.x + .18, 0, stern.z + .15], .010, 0x737e83, 4);
  for (const side of [-1, 1]) {
    const shroudX = mx - .18, r = railAt(p, shroudX);
    b.tube([mx, 0, top * .92], [shroudX, side * r.halfBeam * .88, r.z], .009, 0x748185, 4);
    b.tube([mx, 0, top * .56], [shroudX, side * r.halfBeam * .88, r.z], .009, 0x748185, 4);
    b.tube([mx, side * .03, top * .55], [mx, side * p.geometry.beam * .24, top * .55 - .04], radius * .35, 0x9ca9ad, 4);
  }

  b.begin("stanchions_and_railings", "hidden");
  const railHeight = d.style === "large-volume-cruiser" ? .59 : .49;
  for (const side of [-1, 1]) {
    let previous = null;
    for (const x of d.railingStations) {
      const r = railAt(p, x), y = side * Math.max(.05, r.halfBeam - .055);
      const at = [x, y, r.z + railHeight];
      b.tube([x, y, r.z], at, .013, 0xa4adb0, 4);
      if (previous) {
        b.tube(previous, at, .008, 0xa4adb0, 4, false);
        b.tube([previous[0], previous[1], previous[2] - railHeight * .47], [at[0], at[1], at[2] - railHeight * .47], .006, 0xa4adb0, 4, false);
      }
      previous = at;
    }
  }
}

function overallEquipment(b, d, p, hull) {
  b.begin("overall_fittings", "hidden");
  if (d.style === "large-volume-cruiser") {
    const platformMin = hull.hullMax - p.geometry.loa;
    b.box([(platformMin + hull.hullMin) / 2, 0, .62], [hull.hullMin - platformMin, 2.52, .09], d.trim);
    for (const side of [-1, 1]) b.tube([hull.hullMin + .12, side * 1.34, 1.15], [hull.hullMin + .14, side * 1.34, 1.70], .018, 0xa4adb0, 4);
  } else {
    const tip = d.style === "compact-cruiser" ? hull.hullMin + p.geometry.loa : hull.hullMax;
    const z = p.geometry.gunwale.at(-1).z;
    for (const side of [-1, 1]) {
      const start = p.geometry.gunwale.at(-2);
      // Radius is included in the specified total LOA, avoiding hidden overshoot.
      b.tube([start.x - .12, side * Math.max(.12, start.halfBeam), start.z + .47], [tip - .015, 0, z + .47], .015, 0xa4adb0, 4);
      b.tube([start.x - .12, side * Math.max(.12, start.halfBeam), start.z], [start.x - .12, side * Math.max(.12, start.halfBeam), start.z + .47], .015, 0xa4adb0, 4);
    }
    if (d.style === "compact-cruiser") b.box([tip - .012, 0, z + .47], [.024, .045, .025], 0xa4adb0);
  }
}

function polygonMoments(outline) {
  let twiceArea = 0, sx = 0, sz = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x, z] = outline[i], [u, v] = outline[(i + 1) % outline.length];
    const w = x * v - u * z;
    twiceArea += w; sx += (x + u) * w; sz += (z + v) * w;
  }
  return { area: Math.abs(twiceArea / 2), x: sx / (3 * twiceArea), z: sz / (3 * twiceArea) };
}

function extrudeFoil(b, outline, y, thickness, color) {
  const front = outline.map(([x, z]) => [x, y - thickness / 2, z]);
  const back = outline.map(([x, z]) => [x, y + thickness / 2, z]);
  b.polygon(front, color, [0, -1, 0]); b.polygon(back, color, [0, 1, 0]);
  const moments = polygonMoments(outline);
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    const out = [(outline[i][0] + outline[j][0]) / 2 - moments.x, 0, (outline[i][1] + outline[j][1]) / 2 - moments.z];
    b.quad(front[i], back[i], back[j], front[j], color, out);
  }
}

function equivalentFoil(component, taper = .78) {
  const chord = component.area / component.span;
  const root = chord * 2 / (1 + taper), tip = root * taper;
  const outline = [[-root / 2, component.span / 2], [root / 2, component.span / 2], [tip / 2, -component.span / 2], [-tip / 2, -component.span / 2]];
  const centre = polygonMoments(outline);
  return outline.map(([x, z]) => [x - centre.x + component.position.x, z - centre.z + component.position.z]);
}

function appendageGeometry(b, d, p) {
  b.begin("keel_fin", "organ");
  if (d.style === "classic-long-keel") {
    // Same continuous estimated contour that was integrated in Phase1.
    const outline = [[-3.15, -.40], [-3.15, -1.00], [-2.25, -1.21], [-.65, -1.21], [.60, -.95], [1.65, -.65], [2.20, -.40]];
    extrudeFoil(b, outline, 0, .13, 0x656b70);
  } else {
    const keel = p.appendages[0];
    // Rectangular equivalent preserves span, projected area and force centre.
    // A narrow separate ballast shoe supplies the documented total draft.
    extrudeFoil(b, equivalentFoil(keel, 1), 0, d.style === "wide-racing-monohull" ? .13 : .19, 0x626d73);
    b.begin("keel_ballast_shoe", "organ");
    const finBottom = keel.position.z - keel.span / 2;
    const depth = p.geometry.draft + finBottom;
    if (depth <= 0) throw new Error("Draft shoe must be positive");
    b.box([keel.position.x, 0, -p.geometry.draft + depth / 2], [keel.area / keel.span * .86, d.style === "wide-racing-monohull" ? .38 : .32, depth], 0x69747a);
  }
  for (const rudder of p.rudders) {
    b.begin(p.rudders.length === 1 ? "rudder" : rudder.id.replaceAll("-", "_"), "organ");
    extrudeFoil(b, equivalentFoil(rudder, .86), rudder.position.y, .035, 0x45545d);
  }
}

function bounds(points) {
  return { min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))), max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) };
}

function writeGlb(builder, metadata) {
  const b = builder.finish();
  const chunks = [], views = [], accessors = [];
  let length = 0;
  const append = (values, ArrayType, componentType, type, itemSize, target) => {
    const buffer = Buffer.from(new ArrayType(values).buffer);
    const padding = (4 - length % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
    const view = views.length;
    views.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, target });
    chunks.push(buffer); length += buffer.length;
    const record = { bufferView: view, componentType, count: values.length / itemSize, type };
    if (type === "VEC3" && accessors.length === 0) {
      const box = bounds(Array.from({ length: values.length / 3 }, (_, i) => values.slice(i * 3, i * 3 + 3)));
      record.min = box.min; record.max = box.max;
    }
    accessors.push(record); return accessors.length - 1;
  };
  const position = append(b.positions, Float32Array, 5126, "VEC3", 3, 34962);
  const normal = append(b.normals, Float32Array, 5126, "VEC3", 3, 34962);
  const color = append(b.colors, Float32Array, 5126, "VEC4", 4, 34962);
  const index = append(b.indices, Uint16Array, 5123, "SCALAR", 1, 34963);
  const sourceIndexSpans = b.spans.map(s => [s.name, s.count / 3, s.role]);
  const hullNames = ["upper_sheer", "sheer_stripe", "hull_sides", "hull_underwater", "transom"];
  const hullVertices = b.spans.filter(s => hullNames.includes(s.name)).flatMap(s => b.indices.slice(s.start, s.start + s.count).map(i => b.positions.slice(i * 3, i * 3 + 3)));
  const hullReference = bounds(hullVertices);
  const extras = { ...metadata, hullReference: { boundsMin: hullReference.min, boundsMax: hullReference.max }, triangleCountsBySourcePart: Object.fromEntries(sourceIndexSpans.map(([name, triangles]) => [name, triangles])), sourceIndexSpans };
  const doc = {
    asset: { version: "2.0", generator: "KJP local reproducible vessel builder1.0.0 / Three r" + REVISION },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: metadata.name, mesh: 0, extras }],
    meshes: [{ name: metadata.name, extras, primitives: [{ attributes: { POSITION: position, NORMAL: normal, COLOR_0: color }, indices: index, material: 0, mode: 4 }] }],
    materials: [{ name: "KJP vertex colour source", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: false }],
    buffers: [{ byteLength: length }], bufferViews: views, accessors
  };
  const rawJson = Buffer.from(JSON.stringify(doc)), jsonPad = (4 - rawJson.length % 4) % 4;
  const json = Buffer.concat([rawJson, Buffer.alloc(jsonPad, 0x20)]);
  const rawBin = Buffer.concat(chunks), binPad = (4 - rawBin.length % 4) % 4;
  const bin = Buffer.concat([rawBin, Buffer.alloc(binPad)]);
  const glb = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(json.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
  const offset = 20 + json.length; glb.writeUInt32LE(bin.length, offset); glb.writeUInt32LE(0x004e4942, offset + 4); bin.copy(glb, offset + 8);
  return glb;
}

// This intake measurement reads the exported float32/index buffers again. It
// deliberately does not trust authoring dimensions or metadata bounds.
export function measureGlb(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const primitive = doc.meshes[0].primitives[0];
  const read = ai => {
    const a = doc.accessors[ai], v = doc.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type], stride = v.byteStride || size * (a.componentType === 5126 ? 4 : 2);
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: size }, (_, j) => a.componentType === 5126 ? binary.readFloatLE((v.byteOffset || 0) + (a.byteOffset || 0) + i * stride + j * 4) : binary.readUInt16LE((v.byteOffset || 0) + (a.byteOffset || 0) + i * stride + j * 2)));
  };
  const source = read(primitive.attributes.POSITION), positions = source.map(physicalPoint), normals = read(primitive.attributes.NORMAL), colors = read(primitive.attributes.COLOR_0), indices = read(primitive.indices).flat();
  const parts = [];
  let start = 0, degenerate = 0, invalidNormals = 0;
  for (let i = 0; i < normals.length; i++) if (Math.abs(norm(normals[i]) - 1) > 1e-5) invalidNormals++;
  for (const [name, triangles, role] of doc.meshes[0].extras.sourceIndexSpans) {
    const count = triangles * 3, vertices = indices.slice(start, start + count).map(i => positions[i]);
    let projected = 0, cx = 0, cz = 0, area3d = 0;
    for (let i = 0; i < vertices.length; i += 3) {
      const [a, b, c] = vertices.slice(i, i + 3), twice3d = norm(cross(minus(b, a), minus(c, a)));
      if (twice3d < 1e-10) degenerate++;
      area3d += twice3d / 2;
      const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 4;
      projected += area; cx += area * (a[0] + b[0] + c[0]) / 3; cz += area * (a[2] + b[2] + c[2]) / 3;
    }
    const box = bounds(vertices);
    parts.push({ name, role, start, count, triangles, boundsPhysical: box, surfaceAreaM2: area3d, projectedSideAreaM2: projected, projectedSideCentroidPhysical: projected ? [cx / projected, (box.min[1] + box.max[1]) / 2, cz / projected] : null });
    start += count;
  }
  const hullNames = ["upper_sheer", "sheer_stripe", "hull_sides", "hull_underwater", "transom"];
  const hullParts = parts.filter(p => hullNames.includes(p.name));
  const unionBounds = selected => bounds(selected.flatMap(p => [p.boundsPhysical.min, p.boundsPhysical.max]));
  const hull = unionBounds(hullParts), overall = unionBounds(parts), loa = unionBounds([...hullParts, ...parts.filter(p => p.name === "overall_fittings")]);
  const water = hullParts.flatMap(p => indices.slice(p.start, p.start + p.count).map(i => positions[i])).filter(p => Math.abs(p[2]) < 1e-7);
  const waterBounds = bounds(water);
  let fnv = 2166136261; for (const byte of bytes) fnv = Math.imul(fnv ^ byte, 16777619);
  return {
    sha256: hash(bytes), fingerprint: fnv >>> 0, fingerprintHex: "0x" + (fnv >>> 0).toString(16).padStart(8, "0"), bytes: bytes.length,
    meshCount: doc.meshes.length, primitiveCount: doc.meshes.reduce((s, m) => s + m.primitives.length, 0), materialCount: doc.materials.length,
    triangles: indices.length / 3, vertices: positions.length, indexed: true, rgba: colors.every(c => c.length === 4 && c.every(v => v >= 0 && v <= 1)),
    externalResources: [...(doc.images || []), ...doc.buffers].filter(v => v.uri).map(v => v.uri),
    degenerateTriangles: degenerate, invalidNormals, boundsPhysical: overall, hullBoundsPhysical: hull, loaBoundsPhysical: loa, waterlineBoundsPhysical: waterBounds,
    measurements: { hullLengthM: hull.max[0] - hull.min[0], overallHullEquipmentLengthM: loa.max[0] - loa.min[0], fullAppendageEnvelopeLengthM: overall.max[0] - overall.min[0], beamM: hull.max[1] - hull.min[1], waterlineLengthM: waterBounds.max[0] - waterBounds.min[0], draftM: -overall.min[2], waterlineZ: 0 },
    spans: parts.map(p => [p.name, p.triangles, p.role]), hullParts: hullNames, parts
  };
}

function checkContract(measured, d, p) {
  const problems = [];
  const close = (name, actual, target, tolerance) => { if (!Number.isFinite(actual) || Math.abs(actual - target) > tolerance) problems.push(`${name}: ${actual} != ${target} ±${tolerance}`); };
  if (measured.triangles < 1500 || measured.triangles > 3000) problems.push("Triangle budget: " + measured.triangles);
  if (measured.degenerateTriangles || measured.invalidNormals || !measured.rgba || measured.externalResources.length) problems.push("Geometry attribute contract");
  close("hull length", measured.measurements.hullLengthM, d.hullLength, .01);
  close("LOA hull/equipment", measured.measurements.overallHullEquipmentLengthM, p.geometry.loa, .01);
  close("beam", measured.measurements.beamM, p.geometry.beam, .01);
  close("LWL", measured.measurements.waterlineLengthM, p.geometry.lwl, .01);
  close("draft", measured.measurements.draftM, p.geometry.draft, .01);
  const checkFoil = (part, expected) => {
    close(part.name + " area", part.projectedSideAreaM2, expected.area, expected.area * .02);
    for (const [i, axis] of [[0, "x"], [1, "y"], [2, "z"]]) close(part.name + " centre " + axis, part.projectedSideCentroidPhysical[i], expected.position[axis], .02);
    close(part.name + " span", part.boundsPhysical.max[2] - part.boundsPhysical.min[2], expected.span, .01);
  };
  const keel = measured.parts.find(part => part.name === "keel_fin");
  if (p.appendages.length === 1) checkFoil(keel, p.appendages[0]);
  else {
    const area = p.appendages.reduce((s, a) => s + a.area, 0);
    const position = Object.fromEntries(["x", "y", "z"].map(axis => [axis, p.appendages.reduce((s, a) => s + a.position[axis] * a.area, 0) / area]));
    checkFoil(keel, { area, position, span: p.appendages[0].span });
  }
  for (const rudder of p.rudders) checkFoil(measured.parts.find(part => part.name === (p.rudders.length === 1 ? "rudder" : rudder.id.replaceAll("-", "_"))), rudder);
  if (problems.length) throw new Error(d.name + "\n" + problems.join("\n"));
}

export function buildModels() {
  if (REVISION !== "186") throw new Error("This generator is qualified for installed Three r186");
  return DESIGNS.map(d => {
    const p = Profiles.RAW_PROFILES[d.id];
    if (!p || !Object.isFrozen(p) || !Profiles.COMPILED_PROFILES[d.id]) throw new Error("Expected frozen validated physical profile");
    if (hash(JSON.stringify(phaseOnePhysicalProfile(Profiles.COMPILED_PROFILES[d.id]))) !== d.acceptedProfileSha256) throw new Error("Accepted Phase1 physical profile changed: " + d.id);
    const b = new Builder(d), hull = hullGeometry(b, d, p);
    cockpitAndCabin(b, d, p); helm(b, d); rigAndRail(b, d, p); overallEquipment(b, d, p, hull); appendageGeometry(b, d, p);
    const profileSha256 = hash(JSON.stringify(Profiles.COMPILED_PROFILES[d.id]));
    const rawProfileSha256 = hash(JSON.stringify(p));
    const bytes = writeGlb(b, { name: d.name, profileId: d.id, profileVersion: p.version, profileSha256, rawProfileSha256, units: "m", upAxis: "+Y", bowAxis: "+Z", waterlineY: 0, noPhysicsData: true, origin: "Frozen Phase1 estimated CG; no recentering", physicalToSource: ["-y", "z", "x"], excludedFunctionalEquipment: ["cleats", "fenders", "mooring-lines", "propeller", "force-application-markers"], ruddersStatic: true, notes: d.notes });
    const measured = measureGlb(bytes);
    checkContract(measured, d, p);
    return { file: d.file, bytes, catalogue: { id: d.id, file: d.file, name: d.name, style: d.style, profileVersion: p.version, profileSha256, rawProfileSha256, transform: { rotation: [Math.PI / 2, Math.PI / 2, 0], position: [0, 0, .02], scale: 1 }, documentaryHullLengthM: d.hullLength, profile: { loaM: p.geometry.loa, lwlM: p.geometry.lwl, beamM: p.geometry.beam, draftM: p.geometry.draft, physicalRailLengthM: p.geometry.gunwale.at(-1).x - p.geometry.gunwale[0].x }, notes: d.notes, ...measured } };
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log("node scripts/build-vessel-models.mjs [--check]\nBuild four local GLBs and measured geometry catalogue. --check compares bytes without writing."); return; }
  if (args.some(a => a !== "--check")) throw new Error("Unknown option");
  const models = buildModels();
  const manifest = { formatVersion: 1, generator: "scripts/build-vessel-models.mjs", threeRevision: REVISION, sourceAxes: { up: "+Y", bow: "+Z", units: "m", waterlineY: 0 }, sceneTransform: { rotation: [Math.PI / 2, Math.PI / 2, 0], position: [0, 0, .02], scale: 1 }, measurementMethod: "Re-read exported float32 positions and indices, reverse glTF axes into physical coordinates; projected foil area is half the sum of absolute XZ triangle projections of each closed part. Hull/equipment LOA excludes aft appendage extension; full mesh envelope is also reported. Draft is below waterline, before scene z+0.02 transform.", vessels: models.map(m => m.catalogue) };
  const outputs = [...models.map(m => [m.file, m.bytes]), [MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2) + "\n")]];
  for (const [relative, data] of outputs) {
    const target = path.join(ROOT, relative);
    if (args.includes("--check")) {
      if (!fs.existsSync(target) || !fs.readFileSync(target).equals(data)) throw new Error("Generated resource differs: " + relative);
    } else fs.writeFileSync(target, data);
  }
  for (const model of models) console.log(`${args.includes("--check") ? "Checked" : "Built"} ${model.file}: ${model.catalogue.triangles} triangles, ${model.bytes.length} bytes, ${model.catalogue.fingerprintHex}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
