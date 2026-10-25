"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Physics = require("../../src/simulateur-port/physics-core.js");
const Runner = require("../../scripts/qualify-vessel-profiles.js");
const references = require("../fixtures/vessel-reference-signatures.json");
const newIds = Physics.COMMERCIAL_PROFILE_IDS.slice(2);
const calm = { ...Runner.NOMINAL, propWalk: 0 };

function finite(value) {
  if (typeof value === "number") assert.ok(Number.isFinite(value), "nombre non fini");
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === "object") Object.values(value).forEach(finite);
}

function create(profile, velocity = { u: 0, v: 0, r: 0 }, environment = calm) {
  const simulator = Physics.createSimulator({ profile, environment });
  simulator.reset({ pose: { east: 0, north: 0, heading: 0 }, velocity });
  return simulator;
}

function provenanceFor(raw, field) {
  const keys = Object.keys(raw.provenance.values).filter(key => field === key || field.startsWith(key + "."));
  return raw.provenance.values[keys.sort((a, b) => b.length - a.length)[0]];
}

function numericPaths(value, prefix = "") {
  if (typeof value === "number") return [prefix];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => numericPaths(child, prefix ? prefix + "." + key : key));
}

test("catalogue: six bateaux commerciaux, huit profils complets et provenance de chaque valeur", () => {
  assert.equal(Physics.COMMERCIAL_PROFILE_IDS.length, 6);
  assert.equal(Object.keys(Physics.RAW_PROFILES).length, 8);
  assert.equal(newIds.length, 4);
  assert.ok(newIds[0].startsWith("sun-odyssey-24-2-"), "SO26 bi-safran remplacé avec accord utilisateur");
  for (const id of Object.keys(Physics.RAW_PROFILES)) {
    const raw = Physics.RAW_PROFILES[id];
    assert.equal(Physics.validateVesselProfile(raw).ok, true, id);
    const compiled = Physics.compileVesselProfile(raw);
    assert.ok(Object.isFrozen(compiled));
    assert.ok(Physics.massMatrixIsPositiveDefinite(Physics.computeMassMatrix(compiled).matrix));
    finite(compiled);
    if (!newIds.includes(id)) continue;
    assert.equal(raw.schemaVersion, 5);
    assert.equal(raw.version, raw.steering.type === "tiller" ? "1.1.2" : "1.1.0");
    assert.deepEqual(compiled.configuration, { propellers: 1, rudders: raw.rudders.length, bowThruster: false, sternThruster: false });
    for (const group of ["steering", "geometry", "mass", "hull", "appendages", "propulsors", "rudders", "aerodynamics", "contacts", "deckHardware", "mooring"]) {
      for (const field of numericPaths(raw[group], group)) {
        const evidence = provenanceFor(raw, field);
        assert.ok(evidence?.source && evidence.unit && evidence.method, id + ": " + field);
        assert.match(evidence.evidenceClass, /^[A-F]$/);
        assert.ok(evidence.uncertainty >= 0);
      }
    }
    for (const group of ["steering", "geometry", "mass", "hull", "appendages", "propulsors", "rudders", "aerodynamics", "contacts", "deckHardware", "mooring"]) {
      const incomplete = structuredClone(raw); delete incomplete[group];
      assert.throws(() => Physics.compileVesselProfile(incomplete), /Profil bateau invalide/);
    }
  }
});

test("catalogue: la commande de barre porte le type et chaque vitesse de safran configurée", () => {
  const expected = {
    "sun-odyssey-36i-pedagogical": ["wheel", 52],
    "dufour-310-gl-2014-deep-keel-experimental": ["wheel", 50],
    "sun-odyssey-24-2-fixed-keel-experimental": ["tiller", 100],
    "contessa-26-long-keel-experimental": ["tiller", 100],
    "pogo-40-s4-twin-rudder-experimental": ["tiller", 100],
    "oceanis-48-fixed-keel-experimental": ["wheel", 46],
    "synthetic-cruiser-7m": ["wheel", 52],
    "synthetic-cruiser-16m": ["wheel", 52]
  };
  for (const [id, [type, rateDegS]] of Object.entries(expected)) {
    const raw = Physics.RAW_PROFILES[id];
    const compiled = Physics.COMPILED_PROFILES[id];
    assert.deepEqual(raw.steering, { type, maximumRudderRateDegS: rateDegS });
    assert.deepEqual(compiled.steering, raw.steering);
    for (const rudder of compiled.rudders) {
      assert.ok(Math.abs(rudder.rate / Physics.DEG - rateDegS) < 1e-12, id);
    }
  }
});

test("catalogue: vitesse de safran effective, symétrie et butées sur tous les profils", () => {
  for (const raw of Object.values(Physics.RAW_PROFILES)) {
    for (const factor of raw.steering.type === "tiller" ? [.8, 1, 1.2] : [1]) {
      const configured = structuredClone(raw);
      configured.steering.maximumRudderRateDegS *= factor;
      const p = Physics.compileVesselProfile(configured);
      const maximum = Math.min(...p.rudders.map(rudder => rudder.maxAngle));
      const rate = configured.steering.maximumRudderRateDegS * Physics.DEG;
      for (const sign of [-1, 1]) {
        const simulator = create(p);
        const input = { throttle: 0, rudder: sign * maximum };
        const initial = simulator.step(input, .1);
        assert.ok(Math.abs(initial.controls.rudderActual - sign * rate * .1) < 1e-12,
          raw.id + ": la vitesse réelle doit suivre le profil");
        assert.deepEqual(initial.pose, { east: 0, north: 0, heading: 0 });
        const atLimit = simulator.step(input, 1);
        assert.equal(atLimit.controls.rudderActual, sign * maximum);
        finite(atLimit);
      }
    }
  }
});

test("catalogue: gabarit, organes immergés et équipements symétriques sans géométrie GLB", () => {
  for (const id of newIds) {
    const p = Physics.COMPILED_PROFILES[id];
    assert.ok(p.dimensions.waterline <= p.dimensions.lengthOverall);
    assert.ok(p.dimensions.canoeDraft < p.dimensions.draft);
    assert.ok(p.mass.displacement >= p.mass.lightDisplacement);
    for (const component of [...p.appendages, ...p.rudders, ...p.propulsors]) {
      assert.ok(Math.abs(component.x) < p.dimensions.lengthOverall * .58, id + ": x " + component.id);
      assert.ok(Math.abs(component.y) < p.dimensions.beam / 2, id + ": y " + component.id);
      assert.ok(component.z < 0 && component.z >= -p.dimensions.draft, id + ": z " + component.id);
      if (component.area !== undefined) assert.ok(component.area > 0 && component.span > 0 && component.aspectRatio > 0);
    }
    const prop = p.propulsors[0];
    assert.ok(prop.z + prop.diameter / 2 < 0, id + ": disque d'hélice immergé");
    for (const group of [p.contacts.fenders, p.mooring.cleats]) {
      for (const item of group.filter(c => c.side === "port")) {
        const mirror = group.find(c => c.id === item.id.replace("port", "starboard"));
        assert.ok(mirror, item.id);
        assert.equal(item.x, mirror.x); assert.equal(item.y, -mirror.y); assert.equal(item.z, mirror.z);
        assert.ok(Math.abs(item.x) <= p.dimensions.lengthOverall / 2);
        assert.ok(Math.abs(item.y) <= p.dimensions.beam / 2 + p.contacts.fenderRadius);
      }
    }
    for (const panel of p.aerodynamics.panels) {
      assert.ok(panel.area > 0 && panel.center.z >= 0);
      assert.ok(Math.abs(panel.center.x) < p.dimensions.lengthOverall * .58);
    }
    assert.ok(p.contacts.hullEnvelope.every(c => Math.abs(c.position.y) + c.radius <= p.dimensions.beam / 2 + .12));
  }
});

test("catalogue: moteur et trajectoires historiques strictement inchangés, 24 trajectoires signées", () => {
  assert.equal(Physics.VERSION, references.physicsVersion);
  assert.equal(Runner.fingerprint(fs.readFileSync(path.resolve(__dirname, "../../src/simulateur-port/physics-core.js"), "utf8")), references.physicsSourceSha256);
  const definitions = Runner.scenarioDefinitions();
  const historicalProfileMetadata = {
    "sun-odyssey-36i-pedagogical": { version: "6.0.1", schemaVersion: 4 },
    "dufour-310-gl-2014-deep-keel-experimental": { version: "1.0.0", schemaVersion: 4 }
  };
  for (const reference of references.profiles) {
    assert.equal(Runner.fingerprint(Physics.RAW_PROFILES[reference.id]), reference.rawSha256);
    for (const expected of reference.cases) {
      // Les horizons et signatures viennent du moteur avant modification.
      // Seules les métadonnées de profil ont changé avec le schéma de commande
      // de barre ; elles sont remises à leur valeur historique pour comparer
      // exactement le même état physique.
      const result = Runner.runScenario(Physics.COMPILED_PROFILES[reference.id], definitions.find(d => d.id === expected.id), { seconds: expected.seconds, fixedDuration: true, record: false });
      const comparable = structuredClone(result.final);
      Object.assign(comparable.profile, historicalProfileMetadata[reference.id]);
      assert.equal(Runner.fingerprint(comparable), expected.finalSha256, reference.id + "/" + expected.id);
    }
  }
});

test("catalogue: immobilité, passivité, Coriolis et énergie décroissante sur les huit profils", () => {
  for (const p of Object.values(Physics.COMPILED_PROFILES)) {
    const still = create(p);
    const before = still.snapshot();
    for (let i = 0; i < 120; i++) still.step(Runner.NEUTRAL, Runner.DT);
    assert.deepEqual(still.snapshot().pose, before.pose, p.id);
    assert.deepEqual(still.snapshot().velocity, before.velocity, p.id);
    for (const u of [-1, 0, 1]) for (const v of [-.25, 0, .25]) for (const r of [-.03, 0, .03]) {
      const s = create(p, { u, v, r }); const f = s.inspectForces(); finite(f);
      assert.ok(Math.abs(f.coriolis.power) < 1e-7, p.id + ": Coriolis");
      assert.ok(f.forces.filter(x => x.category === "passive").every(x => x.power <= 1e-7), p.id + ": passivité");
    }
    const coasting = create(p, { u: .7, v: .15, r: .02 });
    let energy = Runner.energy(coasting.snapshot());
    for (let i = 0; i < 240; i++) {
      const next = coasting.step(Runner.NEUTRAL, Runner.DT); const value = Runner.energy(next);
      assert.ok(value <= energy + 1e-6, p.id + ": énergie"); energy = value;
    }
  }
});

test("catalogue: courant uniforme, symétrie et déterminisme des nouvelles configurations", () => {
  for (const id of newIds) {
    const p = Physics.COMPILED_PROFILES[id];
    const a = create(p, { u: .8, v: .12, r: .02 });
    const b = create(p, { u: .8, v: -.12, r: -.02 });
    const fa = a.inspectForces().total, fb = b.inspectForces().total;
    assert.ok(Math.abs(fa.X - fb.X) < 1e-8 && Math.abs(fa.Y + fb.Y) < 1e-8 && Math.abs(fa.N + fb.N) < 1e-8, id);
    const drift = create(p, { u: 0, v: 0, r: 0 }, { ...calm, currentSpeedKn: 1, currentFromDeg: 180 });
    const carried = create(p, { u: Physics.KNOT, v: 0, r: 0 }, { ...calm, currentSpeedKn: 1, currentFromDeg: 180 });
    assert.ok(Math.hypot(carried.inspectForces().waterRelative.u, carried.inspectForces().waterRelative.v) < 1e-12);
    assert.ok(Math.abs(carried.inspectForces().total.N) < 1e-8);
    assert.ok(Math.abs(drift.inspectForces().total.X) > 1);
    const d = Runner.scenarioDefinitions().find(x => x.id === "I.1");
    assert.deepEqual(Runner.runScenario(p, d, { seconds: 4, record: false }).final, Runner.runScenario(p, d, { seconds: 4, record: false }).final);
  }
});

test("catalogue: réponse causale avant/arrière et puissance moteur bornée", () => {
  for (const id of newIds) for (const gear of [-1, 1]) {
    const p = Physics.COMPILED_PROFILES[id]; const s = create(p);
    for (let i = 0; i < 600; i++) {
      const snapshot = s.step({ gear, throttle: .30, rudder: 0 }, Runner.DT);
      assert.ok(snapshot.propulsion.units[0].enginePower <= p.propulsion.enginePowerKw * 1000 * 1.001, id);
    }
    assert.equal(Math.sign(s.snapshot().velocity.u), gear, id);
  }
  const stop = Runner.scenarioDefinitions().find(d => d.id === "B.0.6");
  for (const id of newIds) {
    const result = Runner.runScenario(Physics.COMPILED_PROFILES[id], stop, { record: false });
    assert.ok(result.metrics.stoppedAtS !== null, id + ": seuil 0,1 nd");
    assert.ok(result.metrics.surgeSignChangedAtS >= result.metrics.stoppedAtS, id + ": premier changement de signe après l'arrêt");
    assert.ok(result.metrics.surgeSignChangedAtS <= result.metrics.durationS, id + ": signe enregistré avant fin de segment");
  }
});

test("catalogue: quille longue distribuée, surface conservée et amortissement naturel du lacet", () => {
  const p = Physics.RAW_PROFILES["contessa-26-long-keel-experimental"];
  assert.equal(p.appendages.length, 7);
  const area = p.appendages.reduce((n, a) => n + a.area, 0);
  const center = p.appendages.reduce((n, a) => n + a.position.x * a.area, 0) / area;
  const concentrated = structuredClone(p);
  concentrated.appendages = [{ ...structuredClone(p.appendages[0]), id: "diagnostic-concentrated", area, position: { x: center, y: 0, z: -.8 } }];
  const yawMoment = raw => create(raw, { u: 0, v: 0, r: .03 }).inspectForces().forces.filter(f => f.source === "Quille" || f.source.startsWith("Appendice")).reduce((n, f) => n + f.N, 0);
  assert.ok(yawMoment(p) < 0);
  assert.ok(Math.abs(yawMoment(p)) > Math.abs(yawMoment(concentrated)) * 2);
  assert.equal(new Set(p.appendages.map(a => a.aspectRatio)).size, 1, "AR global, pas sept ailerons");
  const sway = raw => create(raw, { u: 0, v: .2, r: 0 }).inspectForces().appendages.reduce((n, a) => n + a.Y, 0);
  assert.ok(Math.abs(sway(p) - sway(concentrated)) < 1e-8);
  const outline = [[-3.15, -.40], [-3.15, -1.00], [-2.25, -1.21], [-.65, -1.21], [.60, -.95], [1.65, -.65], [2.20, -.40]];
  const fourteen = structuredClone(p);
  fourteen.appendages = Runner.discretizeAppendageOutline(outline, 14, p.appendages[0]);
  const seven = Runner.discretizeAppendageOutline(outline, 7, p.appendages[0]);
  seven.forEach((a, i) => {
    assert.ok(Math.abs(a.area - p.appendages[i].area) < 1e-12);
    assert.ok(Math.abs(a.position.x - p.appendages[i].position.x) < 1e-12);
  });
  assert.ok(Math.abs(fourteen.appendages.reduce((n, a) => n + a.area, 0) - area) < 1e-12);
  assert.ok(Math.abs(yawMoment(fourteen) - yawMoment(p)) / Math.abs(yawMoment(fourteen)) < .05, "convergence spatiale 7/14 bandes");
});

test("catalogue: deux safrans Pogo distincts, symétriques et sans jet central artificiel", () => {
  const p = Physics.COMPILED_PROFILES["pogo-40-s4-twin-rudder-experimental"];
  assert.equal(p.rudders.length, 2);
  assert.equal(p.rudders[0].y, -p.rudders[1].y);
  assert.deepEqual(p.rudders.map(r => r.slipstreamSources), [[], []]);
  const still = create(p).inspectForces().rudder.units;
  assert.equal(still.length, 2); assert.ok(still.every(r => r.force.X === 0 && r.force.Y === 0));
  const s = create(p);
  for (let i = 0; i < 120; i++) s.step({ gear: 1, throttle: .15, rudder: 25 * Physics.DEG }, Runner.DT);
  for (const r of s.inspectForces().rudder.units) {
    assert.equal(r.overlap, 0); assert.equal(r.wash, 0);
    assert.ok(r.strips.every(strip => strip.sources.length === 0));
  }
});

test("catalogue: contacts et aussières restent finis et conservent les capacités des taquets", () => {
  for (const id of newIds) {
    const p = Physics.COMPILED_PROFILES[id];
    for (const name of ["K.contact.0.5.false", "K.mooring.wind", "K.mooring.slack"]) {
      const r = Runner.runScenario(p, Runner.scenarioDefinitions().find(x => x.id === name), { seconds: 8, record: false });
      finite(r.final); assert.ok(r.metrics.peakPenetrationM < .35, id);
      assert.equal(r.metrics.mooringGuardSteps, 0, id);
      assert.ok(r.final.moorings.every(m => m.tension >= 0 && m.strain <= p.mooring.elasticity.maximumStrain), id);
    }
    const s = create(p), cleat = p.mooring.cleats[0];
    const point = Physics.bodyToWorld(cleat.x, cleat.y + 2, 0);
    for (let i = 0; i < p.mooring.maximumLinesPerBoatCleat; i++) assert.equal(s.attachMooring({ id: "capacity-" + i, boatCleatId: cleat.id, shoreCleatId: "shore-" + i, shorePoint: { ...point, z: cleat.z }, length: 2 }).ok, true);
    assert.equal(s.attachMooring({ id: "overflow", boatCleatId: cleat.id, shoreCleatId: "extra", shorePoint: { ...point, z: cleat.z }, length: 2 }).ok, false);
  }
});

test("catalogue: convergence effective 120/240/480 Hz sur propulsion, gouverne et amarrage", () => {
  const defs = Runner.scenarioDefinitions();
  for (const id of newIds) for (const name of ["B2.loaded", "D.25", "F.0.1.25", "K.mooring.wind"]) {
    const report = Runner.convergence(Physics.COMPILED_PROFILES[id], defs.find(d => d.id === name), { seconds: 8, fixedDuration: true });
    assert.equal(report.pass, true, id + "/" + name + ": " + JSON.stringify(report.comparisons));
  }
  for (const id of newIds) {
    const a = create(Physics.COMPILED_PROFILES[id]), b = create(Physics.COMPILED_PROFILES[id]);
    for (let i = 0; i < 60; i++) {
      const input = { gear: 1, throttle: .3, rudder: .1 };
      a.step(input, 1 / 60); b.step(input, 1 / 120); b.step(input, 1 / 120);
    }
    assert.deepEqual(a.snapshot(), b.snapshot(), id + ": regroupement à 60 Hz");
  }
  const limited = Runner.convergence(Physics.COMPILED_PROFILES["oceanis-48-fixed-keel-experimental"], defs.find(d => d.id === "D.15"));
  assert.equal(limited.domainLimited, true);
  assert.ok(limited.durationS < limited.requestedDurationS);
  assert.ok(limited.comparisons.every(c => c.durationS < 1e-7), "horizon commun avant la sortie du domaine");
  assert.equal(limited.pass, true);
});

test("catalogue: sensibilité un paramètre à la fois, ±20 %, sans perte des invariants", () => {
  const changes = [
    raw => { raw.mass.yawRadius *= .8; }, raw => { raw.mass.yawRadius *= 1.2; },
    raw => { raw.mass.addedMassModel.sectionalScale *= .8; }, raw => { raw.mass.addedMassModel.sectionalScale *= 1.2; },
    raw => { raw.hull.axialResistance.surgeQuadratic *= .8; }, raw => { raw.hull.axialResistance.surgeQuadratic *= 1.2; },
    raw => { raw.hull.crossFlow.cd *= .8; }, raw => { raw.hull.crossFlow.cd *= 1.2; },
    raw => { raw.appendages.forEach(a => { a.area *= .8; }); }, raw => { raw.appendages.forEach(a => { a.area *= 1.2; }); },
    raw => { raw.rudders.forEach(r => { r.area *= .8; }); }, raw => { raw.rudders.forEach(r => { r.area *= 1.2; }); },
    raw => { raw.aerodynamics.panels.forEach(p => { p.area *= .8; }); }, raw => { raw.aerodynamics.panels.forEach(p => { p.area *= 1.2; }); }
  ];
  for (const id of newIds) for (const change of changes) {
    const raw = structuredClone(Physics.RAW_PROFILES[id]); change(raw);
    const p = Physics.compileVesselProfile(raw);
    assert.ok(Physics.massMatrixIsPositiveDefinite(Physics.computeMassMatrix(p).matrix));
    const s = create(p, { u: .5, v: .1, r: .02 });
    assert.ok(s.inspectForces().forces.filter(f => f.category === "passive").every(f => f.power <= 1e-7));
    for (let i = 0; i < 120; i++) s.step({ gear: 1, throttle: .25, rudder: 15 * Physics.DEG }, Runner.DT);
    finite(s.snapshot()); assert.ok(s.snapshot().velocity.u > 0);
  }
});
