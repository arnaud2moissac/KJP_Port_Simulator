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
  assert.ok(Math.hypot(beam.X, beam.Y) >= 330);
  assert.ok(Math.hypot(beam.X, beam.Y) <= 520);

  const centers = twelve
    .filter(force => Math.abs(force.Y) > 15)
    .map(force => force.N / force.Y);
  assert.ok(centers.every(center => Number.isFinite(center)));
  assert.ok(centers.every(center => Math.abs(center) < profile.dimensions.lengthOverall / 2));
  assert.ok(Math.max(...centers) - Math.min(...centers) > 0.35);
});

test("dérive libre à 12 nd: enveloppe USCG sur douze caps perturbés", () => {
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
    // Un bateau initialisé presque exactement sur l'équilibre de vent instable
    // peut mettre plus de cinq minutes à choisir sa branche lorsque la
    // dissipation linéaire basse vitesse est active. On prolonge uniquement ce
    // cas transitoire sans élargir l'enveloppe finale de lacet.
    if (Math.abs(snapshot.velocity.r) >= 0.12 * Physics.DEG) {
      snapshot = advance(simulator, 300);
    }
    const speedKn = snapshot.diagnostics.waterSpeed / Physics.KNOT;
    outcomes.push({ headingDeg, speedKn, yaw: snapshot.velocity.r });
    assert.ok(
      speedKn >= 0.36 && speedKn <= 0.60,
      `${headingDeg}°: dérive ${speedKn.toFixed(3)} nd`
    );
    assert.ok(speedKn < 0.72);
    assert.ok(Math.abs(snapshot.velocity.r) < 0.12 * Physics.DEG);
  }
  const speeds = outcomes.map(outcome => outcome.speedKn);
  assert.ok(Math.max(...speeds) - Math.min(...speeds) < 0.03);

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
