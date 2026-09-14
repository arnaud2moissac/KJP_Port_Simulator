"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Physics = require("../../src/simulateur-port/physics-core.js");

const DT = 1 / 120;
const ZERO_CONTROLS = Object.freeze({ throttle: 0, rudder: 0 });
const RAW_PROFILES = Object.values(Physics.RAW_PROFILES);

function environment(overrides = {}) {
  return {
    windSpeedKn: 0,
    windFromDeg: 0,
    currentSpeedKn: 0,
    currentFromDeg: 0,
    propWalk: 0,
    ...overrides
  };
}

function create(profile, environmentInput = environment(), initial = {}) {
  const simulator = Physics.createSimulator({
    profile,
    environment: environmentInput,
    obstacles: []
  });
  simulator.reset({
    pose: {
      east: initial.pose?.east || 0,
      north: initial.pose?.north || 0,
      heading: initial.pose?.heading || 0
    },
    velocity: {
      u: initial.velocity?.u || 0,
      v: initial.velocity?.v || 0,
      r: initial.velocity?.r || 0
    }
  }, environmentInput);
  return simulator;
}

function advance(simulator, seconds, controls = ZERO_CONTROLS, dt = DT) {
  const count = Math.round(seconds / dt);
  for (let index = 0; index < count; index += 1) {
    simulator.step(controls, dt);
  }
  return simulator.snapshot();
}

function sumForces(inspection, predicate = () => true) {
  return inspection.forces.filter(predicate).reduce((total, force) => ({
    X: total.X + force.X,
    Y: total.Y + force.Y,
    N: total.N + force.N
  }), { X: 0, Y: 0, N: 0 });
}

function profileWithoutAerodynamics(rawProfile = Object.values(
  Physics.RAW_PROFILES
)[0]) {
  const raw = JSON.parse(JSON.stringify(rawProfile));
  raw.id = `${raw.id}-no-aerodynamics`;
  raw.aerodynamics.panels = [];
  return Physics.compileVesselProfile(raw);
}

function windForce(profile, speedKn, fromDeg, heading = 0) {
  const wind = environment({ windSpeedKn: speedKn, windFromDeg: fromDeg });
  const simulator = create(profile, wind, { pose: { heading } });
  const inspection = simulator.inspectForces();
  return {
    ...sumForces(inspection, force => force.source === "Vent"),
    diagnostics: inspection.wind
  };
}

test("profils complets: validation stricte, métadonnées et absence d'héritage implicite", () => {
  assert.throws(
    () => Physics.createSimulator({ profile: { geometry: { loa: 12 } } }),
    /Profil bateau invalide/
  );
  assert.throws(
    () => Physics.applyCalibrationPatch(Physics.DEFAULT_PROFILE, { windage: 2.1 }),
    /hors limites/
  );
  assert.throws(
    () => Physics.applyCalibrationPatch(Physics.DEFAULT_PROFILE, { propeller: 1 }),
    /interdit/
  );

  for (const raw of RAW_PROFILES) {
    const validation = Physics.validateVesselProfile(raw);
    assert.equal(validation.ok, true, `${raw.id}: ${validation.errors.join("; ")}`);
    const profile = Physics.compileVesselProfile(raw);
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(profile.schemaVersion, Physics.DEFAULT_PROFILE.schemaVersion);
    assert.ok(profile.version);
    assert.equal(raw.hull.crossFlow.linearDampingFroude, 0.020);
    assert.ok(
      raw.provenance.values["hull.crossFlow.linearDampingFroude"],
      `${raw.id}: provenance du terme linéaire absente`
    );
    assert.ok(Math.abs(
      profile.resistance.crossFlowLinearSpeed
      - 0.020 * Math.sqrt(9.80665 * raw.geometry.lwl)
    ) < 1e-12);
    assert.ok(profile.appendages.length >= 1);
    assert.ok(profile.propulsors.length >= 1);
    assert.ok(profile.rudders.length >= 1);
    assert.equal(
      Physics.massMatrixIsPositiveDefinite(
        Physics.computeMassMatrix(profile).matrix
      ),
      true
    );
    const snapshot = create(profile).snapshot();
    assert.deepEqual(snapshot.profile, {
      id: profile.id,
      version: profile.version,
      schemaVersion: Physics.DEFAULT_PROFILE.schemaVersion,
      physicsVersion: Physics.VERSION
    });
  }

  const [small, reference, large] = [
    Physics.COMPILED_PROFILES["synthetic-cruiser-7m"],
    Physics.DEFAULT_PROFILE,
    Physics.COMPILED_PROFILES["synthetic-cruiser-16m"]
  ];
  assert.ok(small.dimensions.lengthOverall < reference.dimensions.lengthOverall);
  assert.ok(reference.dimensions.lengthOverall < large.dimensions.lengthOverall);
  assert.notEqual(small.propulsion.diameter, reference.propulsion.diameter);
  assert.notEqual(large.propulsion.diameter, reference.propulsion.diameter);
  assert.notDeepEqual(
    small.propulsion.fourQuadrant.thrust,
    reference.propulsion.fourQuadrant.thrust
  );
  assert.notDeepEqual(
    large.propulsion.fourQuadrant.torque,
    reference.propulsion.fourQuadrant.torque
  );
  assert.notEqual(
    small.resistance.surgeQuadratic,
    reference.resistance.surgeQuadratic
  );
  assert.notEqual(
    large.contacts.fenderStiffness,
    reference.contacts.fenderStiffness
  );
  const referencePanel = reference.aerodynamics.panels.find(
    panel => panel.id === "freeboard-0-starboard"
  );
  for (const profile of [small, large]) {
    const panel = profile.aerodynamics.panels.find(
      item => item.id === referencePanel.id
    );
    assert.ok(Math.abs(
      panel.center.x / profile.dimensions.lengthOverall
      - referencePanel.center.x / reference.dimensions.lengthOverall
    ) < 1e-12);
    assert.ok(Math.abs(
      panel.center.y / profile.dimensions.beam
      - referencePanel.center.y / reference.dimensions.beam
    ) < 1e-12);
  }

  const historical = structuredClone(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  );
  historical.id = "profile-without-linear-cross-flow";
  delete historical.hull.crossFlow.linearDampingFroude;
  const compiledHistorical = Physics.compileVesselProfile(historical);
  assert.equal(compiledHistorical.resistance.crossFlowLinearSpeed, 0);

  const legacy = structuredClone(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  );
  legacy.id = "legacy-profile-adapter-regression";
  legacy.schemaVersion = 1;
  const adapted = Physics.compileVesselProfile(legacy);
  assert.equal(adapted.schemaVersion, 3);
  assert.ok(adapted.warnings.some(message => /adapté vers la version 3/.test(message)));
  assert.ok(adapted.mooring.elasticity.workingLoadN > 0);

  const previous = structuredClone(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  );
  previous.id = "schema-2-profile-adapter-regression";
  previous.schemaVersion = 2;
  delete previous.mooring.elasticity;
  const upgradedPrevious = Physics.compileVesselProfile(previous);
  assert.equal(upgradedPrevious.schemaVersion, 3);
  assert.ok(upgradedPrevious.warnings.some(message => /schemaVersion 2/.test(message)));
  assert.ok(upgradedPrevious.mooring.elasticity.workingLoadN > 0);
});

test("invariants universels sur petit, référence et grand croiseur", () => {
  for (const raw of RAW_PROFILES) {
    const profile = Physics.compileVesselProfile(raw);
    const rest = create(profile).inspectForces();
    assert.ok(Math.hypot(rest.total.X, rest.total.Y, rest.total.N) < 1e-10);

    for (const u of [-0.7, 0, 0.7]) {
      for (const v of [-0.35, 0, 0.35]) {
        for (const r of [-0.04, 0, 0.04]) {
          const simulator = create(profile, environment(), {
            velocity: { u, v, r }
          });
          const inspection = simulator.inspectForces();
          assert.ok(Object.values(inspection.total).every(Number.isFinite));
          for (const force of inspection.forces.filter(
            item => item.category === "passive"
          )) {
            assert.ok(
              force.power <= 1e-7,
              `${profile.id}/${force.source}: puissance ${force.power}`
            );
          }
        }
      }
    }

    const ahead = advance(create(profile), 8, { throttle: 0.6, rudder: 0 });
    const astern = advance(create(profile), 8, { throttle: -0.6, rudder: 0 });
    assert.ok(ahead.velocity.u > 0, `${profile.id}: causalité avant`);
    assert.ok(astern.velocity.u < 0, `${profile.id}: causalité arrière`);
    assert.ok(
      ahead.propulsion.units.length === profile.propulsors.length
    );

    const current = environment({ currentSpeedKn: 1, currentFromDeg: 45 });
    const currentWorld = Physics.nauticalVectorFromSource(
      Physics.KNOT,
      45 * Physics.DEG
    );
    const currentBody = Physics.worldToBody(
      currentWorld.east,
      currentWorld.north,
      0
    );
    const baseVelocity = { u: 0.31, v: -0.14, r: 0.012 };
    const calm = create(profile, environment(), { velocity: baseVelocity })
      .inspectForces();
    const shifted = create(profile, current, {
      velocity: {
        u: baseVelocity.u + currentBody.u,
        v: baseVelocity.v + currentBody.v,
        r: baseVelocity.r
      }
    }).inspectForces();
    for (const component of ["u", "v", "r"]) {
      assert.ok(
        Math.abs(
          calm.waterRelative[component] - shifted.waterRelative[component]
        ) < 1e-12
      );
    }
    const calmHydro = sumForces(
      calm,
      force => force.source !== "Vent"
    );
    const shiftedHydro = sumForces(
      shifted,
      force => force.source !== "Vent"
    );
    for (const component of ["X", "Y", "N"]) {
      assert.ok(
        Math.abs(calmHydro[component] - shiftedHydro[component]) < 1e-9
      );
    }
  }
});

test("les listes de propulseurs et gouvernes sont réellement itérées", () => {
  const raw = structuredClone(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  );
  raw.id = "synthetic-twin-component-regression";
  raw.version = "1.0.0";
  raw.propulsors[0].position.y = -0.35;
  raw.propulsors.push(structuredClone(raw.propulsors[0]));
  raw.propulsors[1].id = "shaft-propeller-starboard";
  raw.propulsors[1].position.y = 0.35;
  raw.rudders[0].position.y = -0.42;
  raw.rudders.push(structuredClone(raw.rudders[0]));
  raw.rudders[1].id = "spade-rudder-starboard";
  raw.rudders[1].position.y = 0.42;
  raw.rudders[1].slipstreamSources = ["shaft-propeller-starboard"];
  const profile = Physics.compileVesselProfile(raw);
  const simulator = create(profile);
  advance(simulator, 4, { throttle: 0.5, rudder: 12 * Physics.DEG });
  const snapshot = simulator.snapshot();
  const inspection = simulator.inspectForces();
  assert.equal(profile.configuration.propellers, 2);
  assert.equal(profile.configuration.rudders, 2);
  assert.equal(snapshot.propulsion.units.length, 2);
  assert.equal(
    inspection.forces.filter(force => force.source.startsWith("Hélice ·")).length,
    2
  );
  assert.equal(
    inspection.forces.filter(force => force.source.startsWith("Safran ·")).length,
    2
  );
  assert.equal(inspection.rudder.units.length, 2);
});

test("polarité de vent: continuité, directionnalité et référence à 10 m", () => {
  const profile = Physics.DEFAULT_PROFILE;
  const polars = new Map();
  for (const speedKn of [6, 12, 20]) {
    const samples = [];
    for (let angle = 0; angle < 360; angle += 5) {
      const force = windForce(profile, speedKn, angle);
      assert.ok([force.X, force.Y, force.N].every(Number.isFinite));
      assert.equal(force.diagnostics.referenceHeight, 10);
      assert.equal(force.diagnostics.panels.length > 0, true);
      samples.push(force);
    }
    polars.set(speedKn, samples);
    for (let index = 0; index < samples.length; index += 1) {
      const next = samples[(index + 1) % samples.length];
      const jump = Math.hypot(
        next.X - samples[index].X,
        next.Y - samples[index].Y
      );
      assert.ok(
        jump < speedKn * speedKn * 0.55,
        `${speedKn} nd: discontinuité à ${index * 5}°`
      );
    }
  }

  const six = polars.get(6);
  const twelve = polars.get(12);
  for (let index = 0; index < twelve.length; index += 1) {
    for (const component of ["X", "Y", "N"]) {
      const denominator = Math.max(1, Math.abs(six[index][component]));
      if (Math.abs(six[index][component]) < 1e-6) continue;
      assert.ok(
        Math.abs(twelve[index][component] / six[index][component] - 4)
        < 1e-10 * denominator
      );
    }
    const mirror = twelve[(twelve.length - index) % twelve.length];
    assert.ok(Math.abs(twelve[index].X - mirror.X) < 1e-8);
    assert.ok(Math.abs(twelve[index].Y + mirror.Y) < 1e-8);
    assert.ok(Math.abs(twelve[index].N + mirror.N) < 1e-8);
  }

  const head = windForce(profile, 12, 0);
  const tail = windForce(profile, 12, 180);
  const beam = windForce(profile, 12, 90);
  assert.ok(Math.abs(Math.hypot(head.X, head.Y) - Math.hypot(tail.X, tail.Y)) > 20);
  assert.ok(Math.hypot(beam.X, beam.Y) >= 300);
  assert.ok(Math.hypot(beam.X, beam.Y) <= 420);

  const centers = twelve
    .filter(force => Math.abs(force.Y) > 15)
    .map(force => force.N / force.Y);
  assert.ok(centers.every(center => Number.isFinite(center)));
  assert.ok(centers.every(center => Math.abs(center) < profile.dimensions.lengthOverall / 2));
  assert.ok(Math.max(...centers) - Math.min(...centers) > 0.35);
});

test("vent local par panneau: translation, lacet et gradient vertical restent séparés", () => {
  const raw = structuredClone(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  );
  raw.id = "synthetic-local-panel-airflow";
  raw.version = "1.0.0";
  raw.aerodynamics.panels = [
    {
      id: "low-aft",
      area: 1,
      normalBody: { x: 0, y: 1 },
      center: { x: -2, y: 0, z: 1 },
      cdNormal: 1,
      cdTangential: 1,
      exposure: 1,
      omnidirectional: true
    },
    {
      id: "high-fore",
      area: 1,
      normalBody: { x: 0, y: 1 },
      center: { x: 2, y: 0, z: 10 },
      cdNormal: 1,
      cdTangential: 1,
      exposure: 1,
      omnidirectional: true
    }
  ];
  const profile = Physics.compileVesselProfile(raw);

  const translation = create(profile, environment(), {
    velocity: { u: 1, v: 0, r: 0 }
  }).inspectForces();
  assert.equal(translation.wind.apparent.u, -1);
  assert.equal(translation.wind.apparent.v, 0);
  for (const panel of translation.wind.panels) {
    assert.ok(Math.abs(panel.trueWind.u) < 1e-12);
    assert.ok(Math.abs(panel.trueWind.v) < 1e-12);
    assert.equal(panel.bodyVelocity.u, 1);
    assert.equal(panel.apparent.u, -1);
    assert.equal(panel.speed, 1);
    assert.ok(panel.aerodynamicDissipation > 0);
  }
  assert.equal(
    translation.wind.panels[0].speed,
    translation.wind.panels[1].speed,
    "le gradient de vent ne doit pas réduire la vitesse propre du bateau"
  );

  const rotation = create(profile, environment(), {
    velocity: { u: 0, v: 0, r: 0.1 }
  }).inspectForces();
  const aft = rotation.wind.panels.find(panel => panel.id === "low-aft");
  const fore = rotation.wind.panels.find(panel => panel.id === "high-fore");
  assert.ok(aft.apparent.v > 0);
  assert.ok(fore.apparent.v < 0);
  assert.ok(Math.abs(aft.apparent.v + fore.apparent.v) < 1e-12);
  assert.ok(rotation.total.N < 0, "la traînée de l'air doit amortir un lacet positif");
  assert.ok(rotation.wind.panels.every(
    panel => panel.aerodynamicDissipation > 0
  ));

  const shearedWind = create(profile, environment({
    windSpeedKn: 12,
    windFromDeg: 0
  }), { velocity: { u: 1, v: 0, r: 0 } }).inspectForces();
  const low = shearedWind.wind.panels.find(panel => panel.id === "low-aft");
  const high = shearedWind.wind.panels.find(panel => panel.id === "high-fore");
  assert.ok(low.heightFactor < high.heightFactor);
  assert.equal(low.bodyVelocity.u, high.bodyVelocity.u);
  assert.ok(Math.abs(
    low.trueWind.u / high.trueWind.u - low.heightFactor / high.heightFactor
  ) < 1e-12);
});

test("panneau aérodynamique: la pression normale suit la vitesse normale au carré", () => {
  const raw = structuredClone(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  );
  raw.id = "synthetic-normal-panel-incidence";
  raw.version = "1.0.0";
  raw.aerodynamics.verticalProfile = null;
  raw.aerodynamics.panels = [{
    id: "normal-panel",
    area: 1,
    normalBody: { x: 0, y: 1 },
    center: { x: 0, y: 0, z: 1 },
    cdNormal: 1,
    cdTangential: 0,
    exposure: 1,
    twoSided: true
  }];
  const profile = Physics.compileVesselProfile(raw);
  const beam = windForce(profile, 12, 90);
  const oblique = windForce(profile, 12, 45);
  assert.ok(Math.abs(Math.abs(oblique.Y / beam.Y) - 0.5) < 1e-12);
});

test("équilibre transversal: le centre aérodynamique reste devant la résistance immergée", () => {
  const profile = Physics.DEFAULT_PROFILE;
  const wind = create(profile, environment({
    windSpeedKn: 12,
    windFromDeg: 90
  })).inspectForces();
  const air = sumForces(wind, force => force.source === "Vent");
  const sway = create(profile, environment(), {
    velocity: { u: 0, v: -0.2, r: 0 }
  }).inspectForces();
  const water = sumForces(sway, force => force.category === "passive");
  const airCenterX = air.N / air.Y;
  const waterCenterX = water.N / water.Y;
  assert.ok(Number.isFinite(airCenterX));
  assert.ok(Number.isFinite(waterCenterX));
  assert.ok(
    airCenterX > waterCenterX + 0.1,
    `centres longitudinalement inversés: air ${airCenterX}, eau ${waterCenterX}`
  );
});

test("franc-bord aérodynamique: aire et centroïde suivent le rail de fargue", () => {
  const profile = Physics.DEFAULT_PROFILE;
  const gunwale = profile.geometry.gunwale;
  const panels = profile.aerodynamics.panels.filter(
    panel => panel.id.startsWith("freeboard-")
  );
  const starboard = panels.filter(panel => panel.id.endsWith("-starboard"));
  const port = panels.filter(panel => panel.id.endsWith("-port"));
  let expectedArea = 0;
  let expectedMomentX = 0;
  for (let index = 0; index < gunwale.length - 1; index += 1) {
    const left = gunwale[index];
    const right = gunwale[index + 1];
    const dx = right.x - left.x;
    expectedArea += dx * (left.z + right.z) / 2;
    expectedMomentX += dx * (
      left.z * (2 * left.x + right.x)
      + right.z * (left.x + 2 * right.x)
    ) / 6;
    const starboardPanel = starboard.find(
      panel => panel.id === `freeboard-${index}-starboard`
    );
    const portPanel = port.find(
      panel => panel.id === `freeboard-${index}-port`
    );
    assert.ok(starboardPanel);
    assert.ok(portPanel);
    assert.equal(starboardPanel.area, portPanel.area);
    assert.equal(starboardPanel.normalBody.x, portPanel.normalBody.x);
    assert.equal(starboardPanel.normalBody.y, -portPanel.normalBody.y);
    assert.equal(starboardPanel.center.x, portPanel.center.x);
    assert.equal(starboardPanel.center.y, -portPanel.center.y);
    assert.equal(starboardPanel.center.z, portPanel.center.z);
  }
  const projectedArea = starboard.reduce(
    (sum, panel) => sum + panel.area * Math.abs(panel.normalBody.y),
    0
  );
  const projectedMomentX = starboard.reduce(
    (sum, panel) => (
      sum + panel.area * Math.abs(panel.normalBody.y) * panel.center.x
    ),
    0
  );
  assert.ok(Math.abs(projectedArea - expectedArea) < 1e-12);
  assert.ok(Math.abs(projectedMomentX - expectedMomentX) < 1e-12);
  assert.ok(expectedMomentX / expectedArea > 0);
});

test("vent de travers: l'accélération initiale abat sans lof transitoire", () => {
  const profile = Physics.DEFAULT_PROFILE;
  for (const windSpeedKn of [6, 12, 20, 30]) {
    for (const windFromDeg of [90, 270]) {
      const simulator = create(
        profile,
        environment({ windSpeedKn, windFromDeg })
      );
      const initial = simulator.inspectForces();
      const air = sumForces(initial, force => force.source === "Vent");
      const expectedSign = windFromDeg === 90 ? -1 : 1;
      assert.ok(
        expectedSign * air.N > 0,
        `${windSpeedKn} nd/${windFromDeg}°: moment initial au lof`
      );
      for (const duration of [1, 2, 2]) {
        const snapshot = advance(simulator, duration);
        assert.ok(
          expectedSign * snapshot.pose.heading > 0,
          `${windSpeedKn} nd/${windFromDeg}°: lof transitoire à ${snapshot.time}s`
        );
        assert.ok(
          expectedSign * snapshot.velocity.r > 0,
          `${windSpeedKn} nd/${windFromDeg}°: lacet inversé à ${snapshot.time}s`
        );
      }
    }
  }
});

test("vent de travers à l'arrêt: abattée, symétrie et robustesse", () => {
  const profile = Physics.DEFAULT_PROFILE;
  for (const windSpeedKn of [6, 12, 20]) {
    const finalBySide = [];
    for (const windFromDeg of [90, 270]) {
      const wind = environment({ windSpeedKn, windFromDeg });
      const snapshot = advance(create(profile, wind), 300);
      finalBySide.push(snapshot);
      const expectedSign = windFromDeg === 90 ? -1 : 1;
      assert.ok(
        expectedSign * snapshot.pose.heading > 1 * Physics.DEG,
        `${windSpeedKn} nd/${windFromDeg}°: l'étrave n'abat pas`
      );
      assert.ok(Math.abs(snapshot.velocity.r) < 0.12 * Physics.DEG);
    }
    assert.ok(Math.abs(
      finalBySide[0].pose.heading + finalBySide[1].pose.heading
    ) < 1e-8);
  }

  for (const windFromDeg of [60, 120, 240, 300]) {
    const wind = environment({ windSpeedKn: 12, windFromDeg });
    const snapshot = advance(create(profile, wind), 120);
    assert.ok([
      snapshot.pose.east,
      snapshot.pose.north,
      snapshot.pose.heading,
      snapshot.velocity.u,
      snapshot.velocity.v,
      snapshot.velocity.r
    ].every(Number.isFinite));
    assert.ok(snapshot.diagnostics.waterSpeed / Physics.KNOT < 0.62);
  }
});

test("dérive libre à 12 nd: branches transverse et vent arrière", () => {
  const profile = Physics.DEFAULT_PROFILE;
  const wind = environment({ windSpeedKn: 12, windFromDeg: 90 });
  const outcomes = [];
  for (let headingDeg = 0; headingDeg < 360; headingDeg += 30) {
    const sign = headingDeg % 60 === 0 ? -1 : 1;
    const simulator = create(profile, wind, {
      pose: { heading: headingDeg * Physics.DEG },
      velocity: {
        u: sign * 0.002,
        v: -sign * 0.002,
        r: sign * 0.001
      }
    });
    let snapshot = advance(simulator, 300);
    // Une trajectoire proche de la séparatrice entre équilibres peut converger
    // en plus de cinq minutes avec la dissipation linéaire basse vitesse. On
    // prolonge uniquement un lacet encore non établi, sans élargir sa borne.
    if (Math.abs(snapshot.velocity.r) >= 0.12 * Physics.DEG) {
      snapshot = advance(simulator, 300);
    }
    const speedKn = snapshot.diagnostics.waterSpeed / Physics.KNOT;
    const apparentBeta = simulator.inspectForces().wind.beta;
    const longitudinal = Math.abs(Math.sin(apparentBeta)) < 0.15;
    outcomes.push({
      headingDeg,
      speedKn,
      yaw: snapshot.velocity.r,
      longitudinal
    });
    if (longitudinal) {
      // La branche stable vent arrière sollicite la faible résistance axiale.
      // Elle reste bornée séparément au lieu d'être assimilée à la dérive
      // transverse USCG de 4 %.
      assert.ok(
        speedKn >= 0.75 && speedKn <= 1.10,
        `${headingDeg}°: branche longitudinale ${speedKn.toFixed(3)} nd`
      );
    } else {
      assert.ok(
        speedKn >= 0.36 && speedKn <= 0.60,
        `${headingDeg}°: dérive transverse ${speedKn.toFixed(3)} nd`
      );
    }
    assert.ok(Math.abs(snapshot.velocity.r) < 0.12 * Physics.DEG);
  }
  const speeds = outcomes
    .filter(outcome => !outcome.longitudinal)
    .map(outcome => outcome.speedKn);
  assert.ok(Math.max(...speeds) - Math.min(...speeds) < 0.03);
  assert.equal(outcomes.filter(outcome => outcome.longitudinal).length, 1);

  const perturbations = [-0.001, 0.001].map(r => {
    const simulator = create(profile, wind, {
      pose: { heading: 270 * Physics.DEG },
      velocity: { r }
    });
    return advance(simulator, 300).diagnostics.waterSpeed / Physics.KNOT;
  });
  assert.ok(Math.abs(perturbations[0] - perturbations[1]) < 0.02);
});

test("matrice conjointe: courant relatif, vent apparent et superposition initiale", () => {
  const profile = Physics.DEFAULT_PROFILE;
  const directionPairs = [
    [90, 90],
    [90, 270],
    [90, 0],
    [90, 45]
  ];
  for (const windSpeedKn of [6, 12, 20]) {
    for (const currentSpeedKn of [0.5, 1, 2]) {
      for (const [windFromDeg, currentFromDeg] of directionPairs) {
        for (const headingDeg of [0, 45, 90, 135]) {
          const base = {
            windFromDeg,
            currentFromDeg,
            propWalk: 0
          };
          const windOnly = create(profile, environment({
            ...base,
            windSpeedKn
          }), { pose: { heading: headingDeg * Physics.DEG } }).inspectForces();
          const currentOnly = create(profile, environment({
            ...base,
            currentSpeedKn
          }), { pose: { heading: headingDeg * Physics.DEG } }).inspectForces();
          const combined = create(profile, environment({
            ...base,
            windSpeedKn,
            currentSpeedKn
          }), { pose: { heading: headingDeg * Physics.DEG } }).inspectForces();
          for (const component of ["X", "Y", "N"]) {
            assert.ok(
              Math.abs(
                combined.total[component]
                - windOnly.total[component]
                - currentOnly.total[component]
              ) < 1e-8
            );
          }
          assert.deepEqual(combined.waterRelative, currentOnly.waterRelative);
        }
      }
    }
  }

  for (const [windFromDeg, currentFromDeg] of directionPairs) {
    const coupled = environment({
      windSpeedKn: 12,
      windFromDeg,
      currentSpeedKn: 1,
      currentFromDeg
    });
    const snapshot = advance(create(profile, coupled), 300);
    const waterSpeedKn = snapshot.diagnostics.waterSpeed / Physics.KNOT;
    assert.ok(
      waterSpeedKn >= 0.35 && waterSpeedKn <= 0.62,
      `${windFromDeg}/${currentFromDeg}: ${waterSpeedKn.toFixed(3)} nd`
    );
  }
});

test("courant uniforme: Coriolis sans puissance et invariance galiléenne dynamique", () => {
  const heading = 23 * Physics.DEG;
  const relativeVelocity = {
    u: 0.37,
    v: -0.21,
    r: 3 * Physics.DEG
  };
  const calm = environment();
  const current = environment({
    currentSpeedKn: 2.5,
    currentFromDeg: 90
  });
  const currentWorld = Physics.nauticalVectorFromSource(
    current.currentSpeedKn * Physics.KNOT,
    current.currentFromDeg * Physics.DEG
  );
  const currentBody = Physics.worldToBody(
    currentWorld.east,
    currentWorld.north,
    heading
  );
  for (const rawProfile of RAW_PROFILES) {
    const profile = profileWithoutAerodynamics(rawProfile);
    const calmSimulator = create(profile, calm, {
      pose: { heading },
      velocity: relativeVelocity
    });
    const currentSimulator = create(profile, current, {
      pose: { heading },
      velocity: {
        u: relativeVelocity.u + currentBody.u,
        v: relativeVelocity.v + currentBody.v,
        r: relativeVelocity.r
      }
    });

    for (const simulator of [calmSimulator, currentSimulator]) {
      const inspection = simulator.inspectForces();
      assert.ok(
        Math.abs(inspection.coriolis.power) < 1e-10,
        `${profile.id}: puissance de Coriolis ${inspection.coriolis.power} W`
      );
    }

    const seconds = 10;
    const calmFinal = advance(calmSimulator, seconds);
    const currentFinal = advance(currentSimulator, seconds);
    for (const component of ["u", "v", "r"]) {
      assert.ok(
        Math.abs(
          currentFinal.waterRelative[component]
          - calmFinal.waterRelative[component]
        ) < 5e-7,
        `${profile.id}: invariance de ${component}`
      );
    }
    assert.ok(
      Math.abs(currentFinal.pose.heading - calmFinal.pose.heading) < 5e-7,
      `${profile.id}: invariance du cap`
    );
    assert.ok(
      Math.abs(
        currentFinal.pose.east
        - calmFinal.pose.east
        - currentWorld.east * seconds
      ) < 2e-6,
      `${profile.id}: invariance est`
    );
    assert.ok(
      Math.abs(
        currentFinal.pose.north
        - calmFinal.pose.north
        - currentWorld.north * seconds
      ) < 2e-6,
      `${profile.id}: invariance nord`
    );
  }
});

test("courant latéral de 2,5 nd: aucun dépassement artificiel de la vitesse fond", () => {
  const beamCurrent = environment({
    currentSpeedKn: 2.5,
    currentFromDeg: 90
  });
  const results = [1 / 60, 1 / 120, 1 / 240].map(dt => {
    const simulator = create(Physics.DEFAULT_PROFILE, beamCurrent);
    let maximumGroundSpeedKn = 0;
    const seconds = 180;
    const count = Math.round(seconds / dt);
    for (let index = 0; index < count; index += 1) {
      const snapshot = simulator.step(ZERO_CONTROLS, dt);
      maximumGroundSpeedKn = Math.max(
        maximumGroundSpeedKn,
        snapshot.diagnostics.groundSpeed / Physics.KNOT
      );
    }
    return {
      maximumGroundSpeedKn,
      final: simulator.snapshot()
    };
  });

  for (const result of results) {
    const finalGroundSpeedKn = (
      result.final.diagnostics.groundSpeed / Physics.KNOT
    );
    const finalWaterSpeedKn = (
      result.final.diagnostics.waterSpeed / Physics.KNOT
    );
    assert.ok(
      result.maximumGroundSpeedKn <= beamCurrent.currentSpeedKn + 0.01,
      `maximum ${result.maximumGroundSpeedKn.toFixed(3)} nd`
    );
    assert.ok(
      finalGroundSpeedKn >= 2.3 && finalGroundSpeedKn <= 2.5,
      `finale ${finalGroundSpeedKn.toFixed(3)} nd`
    );
    assert.ok(
      finalWaterSpeedKn < 0.15,
      `résiduelle surface ${finalWaterSpeedKn.toFixed(3)} nd`
    );
  }

  assert.ok(
    Math.max(...results.map(result => result.maximumGroundSpeedKn))
    - Math.min(...results.map(result => result.maximumGroundSpeedKn))
    < 1e-6
  );
});

test("convergence 60/120/240 Hz sous vent et courant", () => {
  const coupled = environment({
    windSpeedKn: 12,
    windFromDeg: 90,
    currentSpeedKn: 1,
    currentFromDeg: 45
  });
  const results = [1 / 60, 1 / 120, 1 / 240].map(dt => (
    advance(create(Physics.DEFAULT_PROFILE, coupled), 120, ZERO_CONTROLS, dt)
  ));
  const reference = results[2];
  for (const result of results.slice(0, 2)) {
    assert.ok(Math.hypot(
      result.pose.east - reference.pose.east,
      result.pose.north - reference.pose.north
    ) < 0.08);
    assert.ok(Math.abs(result.pose.heading - reference.pose.heading) < 0.01);
    assert.ok(Math.abs(
      result.diagnostics.waterSpeed - reference.diagnostics.waterSpeed
    ) < 0.006);
  }
});

test("sensibilité ±20 %: les invariants survivent aux paramètres estimés", () => {
  const variations = [
    {
      id: "wind-area",
      apply: (raw, scale) => raw.aerodynamics.panels.forEach(
        panel => panel.area *= scale
      )
    },
    {
      id: "wind-coefficients",
      apply: (raw, scale) => raw.aerodynamics.panels.forEach(panel => {
        panel.cdNormal *= scale;
        panel.cdTangential *= scale;
      })
    },
    {
      id: "wind-centers",
      apply: (raw, scale) => raw.aerodynamics.panels.forEach(
        panel => panel.center.x *= scale
      )
    },
    {
      id: "cross-flow",
      apply: (raw, scale) => raw.hull.crossFlow.cd *= scale
    },
    {
      id: "cross-flow-linear",
      apply: (raw, scale) => raw.hull.crossFlow.linearDampingFroude *= scale
    },
    {
      id: "keel-area",
      apply: (raw, scale) => raw.appendages.forEach(
        appendage => appendage.area *= scale
      )
    },
    {
      id: "keel-stall",
      apply: (raw, scale) => raw.appendages.forEach(appendage => {
        appendage.coefficients.stallStartDeg *= scale;
        appendage.coefficients.stallEndDeg *= scale;
      })
    }
  ];
  const wind = environment({ windSpeedKn: 12, windFromDeg: 90 });
  for (const variation of variations) {
    for (const scale of [0.8, 1.2]) {
      const raw = structuredClone(
        Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
      );
      raw.id = `sensitivity-${variation.id}-${scale}`;
      raw.version = "1.0.0";
      variation.apply(raw, scale);
      const profile = Physics.compileVesselProfile(raw);
      assert.equal(
        Physics.massMatrixIsPositiveDefinite(
          Physics.computeMassMatrix(profile).matrix
        ),
        true
      );
      const starboard = windForce(profile, 12, 90);
      const port = windForce(profile, 12, 270);
      assert.ok(starboard.Y < 0);
      assert.ok(port.Y > 0);
      assert.ok(Math.abs(starboard.Y + port.Y) < 1e-8);
      assert.ok(Math.abs(starboard.N + port.N) < 1e-8);
      const snapshot = advance(create(profile, wind), 60);
      assert.ok([
        snapshot.pose.east,
        snapshot.pose.north,
        snapshot.pose.heading,
        snapshot.velocity.u,
        snapshot.velocity.v,
        snapshot.velocity.r
      ].every(Number.isFinite));
    }
  }
});
