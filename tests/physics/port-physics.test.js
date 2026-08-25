"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const Physics = require("../../src/simulateur-port/physics-core.js");

const DT = 1 / 120;
const DEG = Physics.DEG;
const initial = {
  pose: { east: 0, north: 0, heading: Math.PI / 2 },
  velocity: { u: 0, v: 0, r: 0 }
};

function run({
  seconds,
  throttle = 0,
  rudderDeg = 0,
  environment,
  profile,
  velocity,
  obstacles,
  dt = DT
}) {
  const simulator = Physics.createSimulator({ profile, environment, obstacles });
  simulator.reset({
    pose: initial.pose,
    velocity: velocity || initial.velocity
  }, environment);
  const steps = Math.round(seconds / dt);
  for (let index = 0; index < steps; index += 1) {
    simulator.step({ throttle, rudder: rudderDeg * DEG }, dt);
  }
  return { simulator, snapshot: simulator.snapshot() };
}

function kineticEnergy(snapshot) {
  const matrix = snapshot.massMatrix;
  const vector = [
    snapshot.velocity.u,
    snapshot.velocity.v,
    snapshot.velocity.r
  ];
  let energy = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      energy += 0.5 * vector[row] * matrix[row][column] * vector[column];
    }
  }
  return energy;
}

function createCalmSimulator() {
  return Physics.createSimulator({
    environment: {
      windSpeedKn: 0,
      currentSpeedKn: 0,
      propWalk: 0
    }
  });
}

function coastDown({ initialSpeed, targetSpeed, dt = DT }) {
  const simulator = createCalmSimulator();
  simulator.reset({
    pose: initial.pose,
    velocity: { u: initialSpeed, v: 0, r: 0 }
  });
  let seconds = 0;
  let distance = 0;
  let previous = simulator.snapshot();
  while (seconds < 240 && Math.abs(previous.velocity.u) > targetSpeed) {
    simulator.step({ throttle: 0, rudder: 0 }, dt);
    const next = simulator.snapshot();
    distance += Math.hypot(
      next.pose.east - previous.pose.east,
      next.pose.north - previous.pose.north
    );
    previous = next;
    seconds += dt;
  }
  return { seconds, distance, snapshot: previous };
}

function crashStop({ direction, initialSpeed = 1, dt = DT }) {
  const simulator = createCalmSimulator();
  simulator.reset({
    pose: initial.pose,
    velocity: { u: 0, v: 0, r: 0 }
  });

  let accelerationSeconds = 0;
  while (
    accelerationSeconds < 90
    && Math.abs(simulator.snapshot().velocity.u) < initialSpeed
  ) {
    simulator.step({ throttle: direction, rudder: 0 }, dt);
    accelerationSeconds += dt;
  }
  const execute = simulator.snapshot();
  assert.equal(Math.sign(execute.velocity.u), direction);

  let stopSeconds = 0;
  let distance = 0;
  let opposingThrustSeconds = null;
  let peakOpposingThrust = 0;
  let previous = execute;
  while (
    stopSeconds < 60
    && Math.sign(previous.velocity.u) === direction
  ) {
    simulator.step({ throttle: -direction, rudder: 0 }, dt);
    const next = simulator.snapshot();
    distance += Math.hypot(
      next.pose.east - previous.pose.east,
      next.pose.north - previous.pose.north
    );
    const opposing = -direction * next.propulsion.thrust;
    if (opposing > 0 && opposingThrustSeconds === null) {
      opposingThrustSeconds = stopSeconds + dt;
    }
    peakOpposingThrust = Math.max(peakOpposingThrust, opposing);
    previous = next;
    stopSeconds += dt;
  }
  return {
    accelerationSeconds,
    execute,
    stopSeconds,
    distance,
    opposingThrustSeconds,
    peakOpposingThrust,
    snapshot: previous
  };
}

test("matrice de masse et repères nautiques cohérents", () => {
  const properties = Physics.computeMassMatrix();
  assert.equal(Physics.massMatrixIsPositiveDefinite(properties.matrix), true);
  assert.equal(properties.matrix[1][2], properties.matrix[2][1]);
  assert.ok(properties.added.surge > 0);
  assert.ok(properties.added.sway > 0);
  assert.ok(properties.added.yaw > 0);

  for (const heading of [-Math.PI, -1.2, 0, 0.7, Math.PI - 0.01]) {
    const world = Physics.bodyToWorld(1.3, -0.42, heading);
    const body = Physics.worldToBody(world.east, world.north, heading);
    assert.ok(Math.abs(body.u - 1.3) < 1e-12);
    assert.ok(Math.abs(body.v + 0.42) < 1e-12);
  }
});

test("immobilité exacte et dissipation des modules passifs", () => {
  const still = run({ seconds: 12 }).snapshot;
  assert.deepEqual(still.pose, initial.pose);
  assert.deepEqual(still.velocity, initial.velocity);

  for (const u of [-2, -0.6, 0.3, 1.8]) {
    for (const v of [-0.7, -0.15, 0.2, 0.8]) {
      for (const r of [-0.18, 0, 0.13]) {
        const simulator = Physics.createSimulator();
        simulator.reset({ pose: initial.pose, velocity: { u, v, r } });
        const inspection = simulator.inspectForces();
        const passivePower = inspection.forces
          .filter(force => force.category === "passive")
          .reduce((sum, force) => sum + force.power, 0);
        assert.ok(
          passivePower <= 1e-7,
          `puissance passive positive pour u=${u}, v=${v}, r=${r}: ${passivePower}`
        );
      }
    }
  }

  for (const delta of [-35, -15, 0, 15, 35].map(value => value * DEG)) {
    const foil = Physics.foilModel({
      u: 0.8,
      v: -0.24,
      delta,
      area: 0.82,
      aspectRatio: 1.38,
      efficiency: 0.72,
      cd0: 0.022,
      normalCd90: 1.12
    });
    assert.ok(foil.X * 0.8 + foil.Y * -0.24 <= 1e-8);
  }
});

test("cross-flow distribué: terme linéaire passif à basse vitesse", () => {
  const inspectHull = ({ v = 0, r = 0 } = {}) => {
    const simulator = Physics.createSimulator();
    simulator.reset({
      pose: initial.pose,
      velocity: { u: 0, v, r }
    });
    const forces = simulator.inspectForces().forces.filter(
      force => force.source === "Coque · résistance latérale"
    );
    return forces.reduce((sum, force) => ({
      Y: sum.Y + force.Y,
      N: sum.N + force.N,
      power: sum.power + force.power
    }), { Y: 0, N: 0, power: 0 });
  };

  assert.deepEqual(inspectHull(), { Y: 0, N: 0, power: 0 });

  const positive = inspectHull({ v: 0.15, r: 0.03 });
  const negative = inspectHull({ v: -0.15, r: -0.03 });
  assert.ok(Math.abs(positive.Y + negative.Y) < 1e-9);
  assert.ok(Math.abs(positive.N + negative.N) < 1e-9);
  assert.ok(positive.power <= 0);
  assert.ok(negative.power <= 0);

  const yawPositive = inspectHull({ r: 0.03 });
  const yawNegative = inspectHull({ r: -0.03 });
  assert.ok(yawPositive.N < 0);
  assert.ok(yawNegative.N > 0);

  const low = Math.abs(inspectHull({ v: 0.001 }).Y);
  const twiceLow = Math.abs(inspectHull({ v: 0.002 }).Y);
  assert.ok(twiceLow / low > 1.95 && twiceLow / low < 2.10);

  const profile = Physics.DEFAULT_PROFILE;
  const totalArea = profile.geometry.hullSections.reduce((sum, section) => (
    sum
    + profile.dimensions.canoeDraft
      * profile.resistance.crossFlowAreaFactor
      * section.dx
      * section.shape
  ), 0);
  const quadraticAtOneMs = (
    0.5 * Physics.RHO_WATER * profile.resistance.crossFlowCd * totalArea
  );
  const combinedAtOneMs = Math.abs(inspectHull({ v: 1 }).Y);
  assert.ok(combinedAtOneMs / quadraticAtOneMs <= 1.25);
});

test("hélice continue et orientée dans les quatre quadrants", () => {
  const ahead = Physics.propellerModel({ shaftRps: 18, advanceSpeed: 0 });
  const astern = Physics.propellerModel({ shaftRps: -18, advanceSpeed: 0 });
  const windmillingAhead = Physics.propellerModel({ shaftRps: 0, advanceSpeed: 1.5 });
  const windmillingAstern = Physics.propellerModel({ shaftRps: 0, advanceSpeed: -1.5 });
  assert.ok(ahead.thrust > 0);
  assert.ok(astern.thrust < 0);
  assert.ok(ahead.torque > 0);
  assert.ok(astern.torque < 0);
  assert.ok(windmillingAhead.thrust < 0);
  assert.ok(windmillingAstern.thrust > 0);
  assert.ok(windmillingAhead.torque < 0);
  assert.ok(windmillingAstern.torque > 0);
  assert.equal(ahead.quadrant, "ahead");
  assert.equal(astern.quadrant, "backing");
  assert.equal(
    Physics.propellerModel({ shaftRps: -18, advanceSpeed: 1 }).quadrant,
    "crash-back"
  );
  assert.equal(
    Physics.propellerModel({ shaftRps: 18, advanceSpeed: -1 }).quadrant,
    "crash-ahead"
  );

  const left = Physics.propellerModel({ shaftRps: -1e-5, advanceSpeed: 0 });
  const center = Physics.propellerModel({ shaftRps: 0, advanceSpeed: 0 });
  const right = Physics.propellerModel({ shaftRps: 1e-5, advanceSpeed: 0 });
  assert.ok(Math.abs(left.thrust - center.thrust) < 1e-5);
  assert.ok(Math.abs(right.thrust - center.thrust) < 1e-5);

  for (const shaftRps of [-24, -8, 0, 8, 24]) {
    for (const advanceSpeed of [-3, -0.5, 0, 0.5, 3]) {
      const result = Physics.propellerModel({ shaftRps, advanceSpeed });
      assert.ok(
        Object.entries(result)
          .filter(([, value]) => typeof value === "number")
          .every(([, value]) => Number.isFinite(value))
      );
      assert.equal(result.safetyLimitActive, false);
    }
  }

  const bollardAhead = Physics.propellerModel({ shaftRps: 18, advanceSpeed: 0 });
  const bollardAstern = Physics.propellerModel({ shaftRps: -18, advanceSpeed: 0 });
  const bollardRatio = Math.abs(bollardAstern.thrust / bollardAhead.thrust);
  assert.ok(bollardRatio >= 0.65 && bollardRatio <= 0.82);

  for (const advanceSpeed of [-1.5, -0.5, 0, 0.5, 1.5]) {
    let previous = null;
    let previousTorque = null;
    for (let shaftRps = -24; shaftRps <= 24; shaftRps += 0.1) {
      const model = Physics.propellerModel({ shaftRps, advanceSpeed });
      const thrust = model.thrust;
      if (previous !== null) {
        assert.ok(
          Math.abs(thrust - previous) < 45,
          `discontinuité quatre quadrants à Va=${advanceSpeed}, n=${shaftRps}`
        );
        assert.ok(
          Math.abs(model.torque - previousTorque) < 8,
          `discontinuité de couple à Va=${advanceSpeed}, n=${shaftRps}`
        );
      }
      previous = thrust;
      previousTorque = model.torque;
    }
  }

  const exactRest = Physics.propellerModel({ shaftRps: 0, advanceSpeed: 0 });
  assert.equal(exactRest.thrust, 0);
  assert.equal(exactRest.torque, 0);
  assert.equal(exactRest.shaftPower, 0);
  const freeWheelAhead = Physics.propellerModel({
    shaftRps: 0.5,
    advanceSpeed: 2
  });
  const freeWheelAstern = Physics.propellerModel({
    shaftRps: -0.5,
    advanceSpeed: -2
  });
  assert.ok(freeWheelAhead.shaftPower < 0);
  assert.ok(freeWheelAstern.shaftPower < 0);

  const table = Physics.DEFAULT_PROFILE.propulsion.fourQuadrant;
  const epsilon = 1e-7;
  for (const values of [table.thrust, table.torque]) {
    const leftAxis = Physics.samplePeriodicCurve(values, table.betaOriginRad, -Math.PI + epsilon);
    const rightAxis = Physics.samplePeriodicCurve(values, table.betaOriginRad, Math.PI - epsilon);
    assert.ok(Math.abs(leftAxis - rightAxis) < 1e-6);
  }
});

test("chaîne mécanique: embrayage causal, puissance bornée et moulinet au neutre", () => {
  const simulator = createCalmSimulator();
  const states = [];
  let maximumEnginePower = 0;
  for (let index = 0; index < Math.round(8 / DT); index += 1) {
    const snapshot = simulator.step({ throttle: 1, rudder: 0 }, DT);
    maximumEnginePower = Math.max(maximumEnginePower, snapshot.propulsion.enginePower);
  }
  const ahead = simulator.snapshot();
  assert.equal(ahead.propulsion.gearState, "ahead");
  assert.equal(ahead.propulsion.engagedGear, 1);
  assert.ok(ahead.propulsion.shaftRps > 0);
  assert.ok(ahead.propulsion.engineRpm < Physics.DEFAULT_PROFILE.propulsion.maxRpm);

  for (let index = 0; index < Math.round(3 / DT); index += 1) {
    const snapshot = simulator.step({ throttle: -1, rudder: 0 }, DT);
    const propulsion = snapshot.propulsion;
    maximumEnginePower = Math.max(maximumEnginePower, propulsion.enginePower);
    if (states.at(-1) !== propulsion.gearState) states.push(propulsion.gearState);
    if (propulsion.gearState === "neutral") {
      assert.equal(propulsion.engagedGear, 0);
      assert.equal(propulsion.clutchTorque, 0);
      assert.equal(propulsion.shaftDriveTorque, 0);
    }
    if (propulsion.gearState === "astern") {
      assert.ok(propulsion.shaftRps < 0, "le rapport arrière ne doit pas verrouiller un arbre encore avant");
    }
  }
  assert.deepEqual(states.slice(0, 4), [
    "disengaging",
    "neutral",
    "engaging-astern",
    "astern"
  ]);
  assert.ok(
    maximumEnginePower <= Physics.DEFAULT_PROFILE.propulsion.enginePowerKw * 1000 * 1.001
  );

  for (let index = 0; index < Math.round(0.18 / DT); index += 1) {
    simulator.step({ throttle: 0, rudder: 0 }, DT);
  }
  const free = simulator.snapshot().propulsion;
  assert.equal(free.gearState, "neutral");
  assert.equal(free.clutchTorque, 0);
  assert.notEqual(free.shaftRps, 0, "l'arbre doit conserver un moulinet hydrodynamique au neutre");
});

test("décélération naturelle: symétrie, force minimale et enveloppe de dérive", () => {
  const forceAt = speed => {
    const simulator = createCalmSimulator();
    simulator.reset({
      pose: initial.pose,
      velocity: { u: speed, v: 0, r: 0 }
    });
    return simulator.inspectForces().forces
      .filter(force => force.category === "passive" || force.source === "Hélice")
      .reduce((sum, force) => sum + force.X, 0);
  };

  const dragAhead = forceAt(1);
  const dragAstern = forceAt(-1);
  assert.ok(dragAhead < -225, `traînée avant trop faible: ${dragAhead} N`);
  assert.ok(Math.abs(dragAhead + dragAstern) < 1e-9);

  const ahead = coastDown({ initialSpeed: 1, targetSpeed: 0.1 });
  const astern = coastDown({ initialSpeed: -1, targetSpeed: 0.1 });
  assert.ok(ahead.seconds >= 80 && ahead.seconds <= 125);
  assert.ok(ahead.distance >= 30 && ahead.distance <= 42);
  assert.ok(
    Math.abs(ahead.seconds - astern.seconds) / ahead.seconds < 0.02,
    "la dissymétrie aérodynamique avant/arrière doit rester secondaire"
  );
  assert.ok(Math.abs(ahead.distance - astern.distance) / ahead.distance < 0.02);
  assert.ok(Math.abs(ahead.snapshot.velocity.u) <= 0.1);
  assert.ok(Math.abs(astern.snapshot.velocity.u) <= 0.1);
});

test("crash-stop: l'inversion casse les deux erres dans une enveloppe cohérente", () => {
  const fromAhead = crashStop({ direction: 1 });
  const fromAstern = crashStop({ direction: -1 });

  assert.ok(fromAhead.opposingThrustSeconds <= 1);
  assert.ok(fromAstern.opposingThrustSeconds <= 0.85);
  assert.ok(fromAhead.peakOpposingThrust >= 1050);
  assert.ok(fromAstern.peakOpposingThrust >= 1700);

  assert.ok(
    fromAhead.stopSeconds >= 6.4 && fromAhead.stopSeconds <= 9,
    `arrêt depuis l'avant hors enveloppe: ${fromAhead.stopSeconds}s`
  );
  assert.ok(
    fromAhead.distance >= 3.2 && fromAhead.distance <= 5.5,
    `distance depuis l'avant hors enveloppe: ${fromAhead.distance}m`
  );
  assert.ok(
    fromAstern.stopSeconds >= 3.5 && fromAstern.stopSeconds <= 5.5,
    `arrêt depuis l'arrière hors enveloppe: ${fromAstern.stopSeconds}s`
  );
  assert.ok(
    fromAstern.distance >= 2 && fromAstern.distance <= 3.8,
    `distance depuis l'arrière hors enveloppe: ${fromAstern.distance}m`
  );

  assert.ok(fromAhead.stopSeconds / fromAstern.stopSeconds < 1.9);
  assert.ok(fromAhead.distance / fromAstern.distance < 1.9);
  assert.ok(Math.abs(fromAhead.snapshot.velocity.u) < 0.01);
  assert.ok(Math.abs(fromAstern.snapshot.velocity.u) < 0.01);
});

test("crash-stop: monotonie avec l'erre et convergence du pas de temps", () => {
  const speeds = [0.5, 1, 1.5];
  for (const direction of [1, -1]) {
    const results = speeds.map(initialSpeed => (
      crashStop({ direction, initialSpeed })
    ));
    for (let index = 1; index < results.length; index += 1) {
      assert.ok(results[index].stopSeconds > results[index - 1].stopSeconds);
      assert.ok(results[index].distance > results[index - 1].distance);
    }

    const coarse = crashStop({ direction, dt: 1 / 60 });
    const nominal = crashStop({ direction, dt: 1 / 120 });
    const fine = crashStop({ direction, dt: 1 / 240 });
    assert.ok(Math.abs(coarse.stopSeconds - fine.stopSeconds) < 0.08);
    assert.ok(Math.abs(coarse.distance - fine.distance) < 0.08);
    assert.ok(Math.abs(nominal.stopSeconds - fine.stopSeconds) < 0.08);
    assert.ok(Math.abs(nominal.distance - fine.distance) < 0.08);
  }
});

test("gaz avant: accélération et vitesse croissent sans inversion causale", () => {
  const speeds = [];
  for (const throttle of [0.2, 0.4, 0.6, 0.8, 1]) {
    const result = run({
      seconds: 30,
      throttle,
      environment: { propWalk: 0 }
    }).snapshot;
    assert.ok(result.velocity.u > 0, `marche avant inversée à ${throttle}`);
    assert.ok(Math.abs(result.velocity.v) < 1e-10);
    assert.ok(Math.abs(result.velocity.r) < 1e-10);
    speeds.push(result.velocity.u);
  }
  for (let index = 1; index < speeds.length; index += 1) {
    assert.ok(speeds[index] > speeds[index - 1]);
  }

  const full = run({ seconds: 120, throttle: 1 }).snapshot;
  const speedKn = full.velocity.u / Physics.KNOT;
  assert.ok(speedKn >= 5.8 && speedKn <= 7, `vitesse maximale hors enveloppe: ${speedKn} nd`);
});

test("safran avant progressif, saturation et point de pivot avant", () => {
  const responses = new Map();
  for (const rudderDeg of [0, 5, 15, 25, 35]) {
    const result = run({ seconds: 5, throttle: 0.5, rudderDeg }).snapshot;
    assert.ok(result.velocity.u > 0, `le safran inverse la marche à ${rudderDeg}°`);
    responses.set(rudderDeg, result);
  }
  assert.ok(Math.abs(responses.get(5).velocity.r) > 0);
  assert.ok(Math.abs(responses.get(15).velocity.r) > Math.abs(responses.get(5).velocity.r));
  assert.ok(Math.abs(responses.get(25).velocity.r) > Math.abs(responses.get(15).velocity.r));
  assert.ok(Math.abs(responses.get(35).velocity.r) > Math.abs(responses.get(25).velocity.r));
  const gains = [
    Math.abs(responses.get(15).velocity.r) - Math.abs(responses.get(5).velocity.r),
    Math.abs(responses.get(25).velocity.r) - Math.abs(responses.get(15).velocity.r),
    Math.abs(responses.get(35).velocity.r) - Math.abs(responses.get(25).velocity.r)
  ];
  assert.ok(gains[2] < gains[0], "la réponse doit saturer aux grandes barres");
  assert.ok(responses.get(15).diagnostics.pivotWaterX > 0);
  assert.ok(responses.get(15).diagnostics.pivotWaterX < 5.47);

  const port = run({
    seconds: 10,
    throttle: 0.5,
    rudderDeg: 15,
    environment: { propWalk: 0 }
  }).snapshot;
  const starboard = run({
    seconds: 10,
    throttle: 0.5,
    rudderDeg: -15,
    environment: { propWalk: 0 }
  }).snapshot;
  assert.ok(Math.abs(port.velocity.u - starboard.velocity.u) < 1e-10);
  assert.ok(Math.abs(port.velocity.v + starboard.velocity.v) < 1e-10);
  assert.ok(Math.abs(port.velocity.r + starboard.velocity.r) < 1e-10);
});

test("safran par bandes: jet géométrique, marche arrière et désalignement", () => {
  const ahead = run({
    seconds: 5,
    throttle: 1,
    rudderDeg: 15,
    environment: { propWalk: 0 }
  });
  const aheadRudder = ahead.simulator.inspectForces().rudder;
  assert.equal(aheadRudder.strips.length, 5);
  assert.ok(aheadRudder.overlap > 0.15 && aheadRudder.overlap < 0.25);
  assert.ok(aheadRudder.wash > 0);
  assert.ok(Math.abs(aheadRudder.force.Y) > 100);
  assert.equal(aheadRudder.momentumProtectionActive, false);
  assert.ok(aheadRudder.strips.some(strip => strip.coverage > 0.9));
  assert.ok(aheadRudder.strips.some(strip => strip.coverage === 0));

  const astern = run({
    seconds: 5,
    throttle: -1,
    rudderDeg: 15,
    environment: { propWalk: 0 }
  });
  const asternRudder = astern.simulator.inspectForces().rudder;
  assert.ok(asternRudder.wash < 0);
  assert.ok(Math.abs(asternRudder.force.Y) > 20);
  assert.ok(
    Math.abs(asternRudder.force.Y) < Math.abs(aheadRudder.force.Y),
    "l'aspiration amont en marche arrière doit rester plus faible que le jet aval"
  );
  assert.equal(asternRudder.momentumProtectionActive, false);

  const raw = structuredClone(
    Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
  );
  raw.id = "rudder-slipstream-misalignment-regression";
  raw.rudders[0].position.y = 1.2;
  const misaligned = run({
    seconds: 5,
    throttle: 1,
    rudderDeg: 15,
    environment: { propWalk: 0 },
    profile: raw
  });
  const misalignedRudder = misaligned.simulator.inspectForces().rudder;
  assert.equal(misalignedRudder.overlap, 0);
  assert.equal(misalignedRudder.wash, 0);
  assert.deepEqual(misalignedRudder.propellerIncrement, { X: 0, Y: 0 });
});

test("safran: convection continue du jet pendant un crash-stop", () => {
  const simulator = createCalmSimulator();
  for (let index = 0; index < 6 / DT; index += 1) {
    simulator.step({ throttle: 1, rudder: 15 * DEG }, DT);
  }
  const initialWake = simulator.inspectForces().rudder.inducedFlow.axial;
  assert.ok(initialWake > 0.3);

  let previousWake = initialWake;
  let maximumJump = 0;
  let crossedZero = false;
  let retainedWakeAfterDisengagement = false;
  for (let index = 0; index < 2 / DT; index += 1) {
    simulator.step({ throttle: -1, rudder: 15 * DEG }, DT);
    const snapshot = simulator.snapshot();
    const rudder = simulator.inspectForces().rudder;
    assert.ok(Number.isFinite(rudder.force.X));
    assert.ok(Number.isFinite(rudder.force.Y));
    assert.equal(rudder.momentumProtectionActive, false);
    maximumJump = Math.max(
      maximumJump,
      Math.abs(rudder.inducedFlow.axial - previousWake)
    );
    previousWake = rudder.inducedFlow.axial;
    if (rudder.inducedFlow.axial < 0) crossedZero = true;
    if (
      snapshot.propulsion.gearState === "neutral"
      && rudder.inducedFlow.axial > 0.1
    ) {
      retainedWakeAfterDisengagement = true;
    }
  }
  assert.ok(retainedWakeAfterDisengagement, "le jet doit se convecter après le débrayage");
  assert.ok(crossedZero, "le jet doit suivre la poussée arrière sans discontinuité");
  assert.ok(maximumJump < 0.01, `saut de jet excessif: ${maximumJump} m/s`);
});

test("virage accéléré: pas de rotation sur place ni de propulseur d'étrave", () => {
  const profile = Physics.DEFAULT_PROFILE;
  assert.deepEqual(profile.configuration, {
    propellers: 1,
    rudders: 1,
    bowThruster: false,
    sternThruster: false
  });

  for (const throttle of [0.2, 0.5, 1]) {
    const straight = run({ seconds: 30, throttle }).snapshot;
    const turns = [15, 25, 35].map(rudderDeg => (
      run({ seconds: 30, throttle, rudderDeg }).snapshot
    ));
    const [turn15, turn25, turn35] = turns;
    const radius35 = turn35.diagnostics.groundSpeed / Math.abs(turn35.velocity.r);
    assert.ok(
      radius35 > profile.dimensions.lengthOverall * .5,
      `${throttle}: rayon de ${radius35.toFixed(2)} m, rotation quasi sur place`
    );
    assert.ok(
      turn35.velocity.u > straight.velocity.u * .4,
      `${throttle}: la barre annule artificiellement l'erre avant`
    );
    assert.ok(Math.abs(turn25.velocity.r) > Math.abs(turn15.velocity.r));
    assert.ok(Math.abs(turn35.velocity.r) > Math.abs(turn25.velocity.r));
    assert.ok(
      Math.abs(turn35.velocity.r) - Math.abs(turn25.velocity.r)
      < Math.abs(turn25.velocity.r) - Math.abs(turn15.velocity.r),
      `${throttle}: absence de saturation du safran`
    );
  }

  const simulator = Physics.createSimulator();
  for (let index = 0; index < 3600; index += 1) {
    simulator.step({ throttle: 1, rudder: 35 * DEG }, DT);
  }
  const inspection = simulator.inspectForces();
  const rudder = inspection.rudder;
  assert.ok(rudder.overlap > 0 && rudder.overlap < 1);
  assert.ok(
    -rudder.propellerIncrement.X <= rudder.momentumLimits.axialLoss + 1e-9
  );
  assert.ok(
    Math.abs(rudder.propellerIncrement.Y) <= rudder.momentumLimits.side + 1e-9
  );
  assert.ok(
    inspection.forces.every(force => !/thruster|propulseur/i.test(force.source))
  );
});

test("marche arrière: effet de pas et déplacement du pivot vers la poupe", () => {
  const walk = run({
    seconds: 5,
    throttle: -0.7,
    environment: { propWalk: 1 }
  }).snapshot;
  assert.ok(walk.velocity.u < 0);
  assert.ok(walk.velocity.v < 0, "la poupe doit être chassée vers bâbord");
  assert.ok(walk.velocity.r > 0, "l'étrave doit abattre vers tribord");

  const reverseTurn = run({
    seconds: 60,
    throttle: -0.5,
    rudderDeg: 15,
    environment: { propWalk: 0 }
  }).snapshot;
  assert.ok(reverseTurn.diagnostics.pivotWaterX < 0);
  assert.ok(reverseTurn.diagnostics.pivotWaterX > -5.47);
  assert.ok(Math.abs(reverseTurn.velocity.u) < run({ seconds: 60, throttle: 0.5 }).snapshot.velocity.u);
});

test("courant uniforme: invariance galiléenne et entraînement sans force permanente", () => {
  const current = {
    currentSpeedKn: 1,
    currentFromDeg: 270,
    windSpeedKn: 0,
    windFromDeg: 0,
    propWalk: 0
  };
  const currentSpeed = Physics.KNOT;
  const calmSimulator = Physics.createSimulator();
  calmSimulator.reset({
    pose: initial.pose,
    velocity: { u: 0.3, v: 0, r: 0 }
  });
  const shiftedSimulator = Physics.createSimulator({ environment: current });
  shiftedSimulator.reset({
    pose: initial.pose,
    velocity: { u: 0.3 + currentSpeed, v: 0, r: 0 }
  }, current);
  const calmInspection = calmSimulator.inspectForces();
  const shiftedInspection = shiftedSimulator.inspectForces();
  for (const component of ["u", "v", "r"]) {
    assert.ok(
      Math.abs(
        calmInspection.waterRelative[component]
        - shiftedInspection.waterRelative[component]
      ) < 1e-12
    );
  }
  const hydrodynamic = inspection => inspection.forces
    .filter(force => force.source !== "Vent")
    .reduce((sum, force) => ({
      X: sum.X + force.X,
      Y: sum.Y + force.Y,
      N: sum.N + force.N
    }), { X: 0, Y: 0, N: 0 });
  const calmHydrodynamic = hydrodynamic(calmInspection);
  const shiftedHydrodynamic = hydrodynamic(shiftedInspection);
  for (const component of ["X", "Y", "N"]) {
    assert.ok(
      Math.abs(calmHydrodynamic[component] - shiftedHydrodynamic[component]) < 1e-9
    );
  }

  const entrained = run({ seconds: 90, environment: current }).snapshot;
  assert.ok(entrained.velocity.u > 0);
  assert.ok(Math.abs(entrained.waterRelative.u) < currentSpeed);
});

test("vent: loi quadratique, symétrie bâbord-tribord et ordre de grandeur", () => {
  function inspectWind(speedKn, fromDeg) {
    const environment = {
      windSpeedKn: speedKn,
      windFromDeg: fromDeg,
      currentSpeedKn: 0,
      currentFromDeg: 0,
      propWalk: 0
    };
    const simulator = Physics.createSimulator({ environment, obstacles: [] });
    simulator.reset({
      pose: { east: 0, north: 0, heading: 0 },
      velocity: { u: 0, v: 0, r: 0 }
    }, environment);
    return simulator.inspectForces().forces
      .filter(force => force.source === "Vent")
      .reduce((total, force) => ({
        X: total.X + force.X,
        Y: total.Y + force.Y,
        N: total.N + force.N
      }), { X: 0, Y: 0, N: 0 });
  }

  const starboard6 = inspectWind(6, 90);
  const starboard12 = inspectWind(12, 90);
  const port12 = inspectWind(12, 270);
  assert.ok(Math.abs(starboard12.Y / starboard6.Y - 4) < 1e-10);
  assert.ok(Math.abs(starboard12.Y + port12.Y) < 1e-9);
  assert.ok(Math.abs(starboard12.N + port12.N) < 1e-9);
  assert.ok(Math.abs(starboard12.X - port12.X) < 1e-9);
  assert.ok(Math.abs(starboard12.X) < Math.abs(starboard12.Y) * 0.02);
  assert.ok(Math.hypot(starboard12.X, starboard12.Y) >= 330);
  assert.ok(Math.hypot(starboard12.X, starboard12.Y) <= 520);
});

test("vent et courant: superposition initiale sans mélange des référentiels", () => {
  function inspect(environment) {
    const simulator = Physics.createSimulator({ environment, obstacles: [] });
    simulator.reset({
      pose: { east: 0, north: 0, heading: 0 },
      velocity: { u: 0, v: 0, r: 0 }
    }, environment);
    return simulator.inspectForces();
  }

  const base = {
    windSpeedKn: 0,
    windFromDeg: 90,
    currentSpeedKn: 0,
    currentFromDeg: 45,
    propWalk: 0
  };
  const windOnly = inspect({ ...base, windSpeedKn: 12 });
  const currentOnly = inspect({ ...base, currentSpeedKn: 1 });
  const combined = inspect({
    ...base,
    windSpeedKn: 12,
    currentSpeedKn: 1
  });
  for (const component of ["X", "Y", "N"]) {
    assert.ok(
      Math.abs(
        combined.total[component]
        - windOnly.total[component]
        - currentOnly.total[component]
      ) < 1e-9
    );
  }
  assert.deepEqual(combined.waterRelative, currentOnly.waterRelative);
});

test("énergie au neutre, déterminisme et convergence du pas", () => {
  const simulator = Physics.createSimulator();
  simulator.reset({
    pose: initial.pose,
    velocity: { u: 1.1, v: 0.22, r: 0.035 }
  });
  let previousEnergy = kineticEnergy(simulator.snapshot());
  for (let interval = 0; interval < 30; interval += 1) {
    for (let index = 0; index < 60; index += 1) {
      simulator.step({ throttle: 0, rudder: 0 }, DT);
    }
    const energy = kineticEnergy(simulator.snapshot());
    assert.ok(energy <= previousEnergy + 1e-6);
    previousEnergy = energy;
  }

  const a = run({ seconds: 20, throttle: 0.55, rudderDeg: 17, dt: 1 / 120 }).snapshot;
  const b = run({ seconds: 20, throttle: 0.55, rudderDeg: 17, dt: 1 / 120 }).snapshot;
  assert.deepEqual(a, b);
  const coarse = run({ seconds: 20, throttle: 0.55, rudderDeg: 17, dt: 1 / 60 }).snapshot;
  const fine = run({ seconds: 20, throttle: 0.55, rudderDeg: 17, dt: 1 / 240 }).snapshot;
  assert.ok(Math.hypot(coarse.pose.east - fine.pose.east, coarse.pose.north - fine.pose.north) < 0.08);
  assert.ok(Math.abs(Physics.wrapAngle(coarse.pose.heading - fine.pose.heading)) < 0.8 * DEG);
});

test("aussières: profil de taquets, longueur maximale et capacité", () => {
  const cleats = Physics.DEFAULT_PROFILE.mooring.cleats;
  assert.equal(Physics.DEFAULT_PROFILE.schemaVersion, 3);
  assert.equal(Physics.DEFAULT_PROFILE.mooring.maxLength, 20);
  assert.equal(Physics.DEFAULT_PROFILE.mooring.maximumLinesPerBoatCleat, 2);
  assert.equal(cleats.length, 6);
  assert.equal(new Set(cleats.map(cleat => cleat.id)).size, 6);
  assert.equal(cleats.filter(cleat => cleat.side === "port").length, 3);
  assert.equal(cleats.filter(cleat => cleat.side === "starboard").length, 3);

  const simulator = createCalmSimulator();
  simulator.reset(initial);
  const first = simulator.attachMooring({
    id: "line-1",
    boatCleatId: "bow-port",
    shoreCleatId: "shared-shore",
    shorePoint: { east: -4, north: 1.45, z: 0.42 }
  });
  assert.equal(first.ok, true);
  assert.ok(first.mooring.length < 20);
  assert.equal(simulator.snapshot().moorings.length, 1);
  assert.equal(simulator.snapshot().moorings[0].taut, true);

  const slackLine = simulator.attachMooring({
    id: "slack-line",
    boatCleatId: "mid-port",
    shoreCleatId: "slack-shore",
    shorePoint: { east: -3, north: 1.68, z: 1.16 },
    length: 4
  });
  assert.equal(slackLine.ok, true);
  assert.ok(slackLine.mooring.slack > .9);
  assert.equal(slackLine.mooring.taut, false);
  assert.equal(simulator.detachMooring("slack-line").ok, true);

  assert.equal(simulator.attachMooring({
    id: "line-2",
    boatCleatId: "bow-port",
    shoreCleatId: "other-shore",
    shorePoint: { east: -3, north: 2, z: 0.42 }
  }).ok, true, "un taquet du bateau doit accepter une seconde ligne");

  assert.equal(simulator.attachMooring({
    id: "line-3",
    boatCleatId: "bow-port",
    shoreCleatId: "third-shore",
    shorePoint: { east: -2, north: 2.2, z: 0.42 }
  }).ok, false, "un taquet du bateau doit refuser une troisième ligne");

  assert.equal(simulator.attachMooring({
    id: "line-4",
    boatCleatId: "stern-port",
    shoreCleatId: "shared-shore",
    shorePoint: { east: -4, north: 1.45, z: 0.42 }
  }).ok, true, "un taquet à terre peut être partagé");

  assert.equal(simulator.attachMooring({
    id: "too-long",
    boatCleatId: "mid-port",
    shoreCleatId: "far-shore",
    shorePoint: { east: 30, north: 0, z: 0.42 }
  }).ok, false);
  assert.equal(simulator.detachMooring("line-1").ok, true);
  assert.equal(simulator.snapshot().moorings.length, 2);
  assert.equal(simulator.clearMoorings(), 2);
  assert.equal(simulator.snapshot().moorings.length, 0);
});

test("aussières: loi élastique calibrée, continue et durcissante", () => {
  const profiles = [
    [Physics.COMPILED_PROFILES["synthetic-cruiser-7m"], 6000],
    [Physics.DEFAULT_PROFILE, 12000],
    [Physics.COMPILED_PROFILES["synthetic-cruiser-16m"], 24000]
  ];
  for (const [profile, expectedLoad] of profiles) {
    const elasticity = profile.mooring.elasticity;
    assert.equal(elasticity.workingStrain, 0.15);
    assert.equal(elasticity.workingLoadN, expectedLoad);
    const restLength = 10;
    const slack = Physics.mooringElasticLaw(elasticity, restLength, 9.9);
    const partialLoad = Physics.mooringElasticLaw(elasticity, restLength, 10.75);
    const working = Physics.mooringElasticLaw(elasticity, restLength, 11.5);
    const hardened = Physics.mooringElasticLaw(elasticity, restLength, 11.8);
    assert.equal(slack.tension, 0);
    assert.equal(slack.elasticEnergy, 0);
    assert.ok(Math.abs(working.strain - 0.15) < 1e-12);
    assert.ok(Math.abs(working.tension - expectedLoad) <= expectedLoad * 0.02);
    assert.ok(partialLoad.tension > 0 && partialLoad.tension < working.tension);
    assert.ok(hardened.tension > expectedLoad * 1.2);
    assert.ok(hardened.tangentStiffness > working.tangentStiffness);
    assert.ok(hardened.elasticEnergy > working.elasticEnergy);
  }
});

test("aussières: contrainte viscoélastique, sans poussée ni apport d'énergie", () => {
  const baseline = createCalmSimulator();
  const slack = createCalmSimulator();
  const movingState = {
    pose: initial.pose,
    velocity: { u: 0.2, v: 0.04, r: 0.005 }
  };
  baseline.reset(movingState);
  slack.reset(movingState);
  const attached = slack.attachMooring({
    id: "slack",
    boatCleatId: "mid-port",
    shoreCleatId: "shore",
    shorePoint: { east: -5, north: 1.68, z: 1.16 },
    length: 7
  });
  assert.equal(attached.ok, true);
  for (let index = 0; index < 60; index += 1) {
    baseline.step({ throttle: 0, rudder: 0 }, DT);
    slack.step({ throttle: 0, rudder: 0 }, DT);
  }
  assert.deepEqual(slack.snapshot().pose, baseline.snapshot().pose);
  assert.deepEqual(slack.snapshot().velocity, baseline.snapshot().velocity);
  assert.equal(slack.snapshot().moorings[0].tension, 0);
  assert.equal(
    slack.forceBreakdown().some(force => force.category === "mooring"),
    false,
    "une ligne détendue ne doit jamais pousser"
  );

  const held = createCalmSimulator();
  held.reset(initial);
  for (const [id, boatCleatId, north] of [
    ["port", "mid-port", 1.68],
    ["starboard", "mid-starboard", -1.68]
  ]) {
    assert.equal(held.attachMooring({
      id,
      boatCleatId,
      shoreCleatId: `shore-${id}`,
      shorePoint: { east: -5, north, z: 1.16 }
    }).ok, true);
  }
  let maximumStrain = 0;
  let guardActivated = false;
  for (let index = 0; index < 2400; index += 1) {
    held.step({ throttle: 1, rudder: 0 }, DT);
    for (const line of held.snapshot().moorings) {
      maximumStrain = Math.max(maximumStrain, line.strain);
      guardActivated ||= line.guardActive;
      assert.ok(line.tension >= 0);
    }
  }
  const heldSnapshot = held.snapshot();
  assert.ok(maximumStrain > 0.001);
  assert.ok(maximumStrain < Physics.DEFAULT_PROFILE.mooring.elasticity.maximumStrain);
  assert.equal(guardActivated, false);
  assert.ok(Math.hypot(heldSnapshot.pose.east, heldSnapshot.pose.north) > 0.02);
  assert.ok(Math.hypot(heldSnapshot.pose.east, heldSnapshot.pose.north) < 0.12);
  assert.ok(Math.abs(heldSnapshot.pose.heading - initial.pose.heading) < 0.001);
  assert.ok(heldSnapshot.moorings.every(line => line.tension > 500));
  assert.ok(heldSnapshot.moorings.every(line => (
    line.extension > 0
    && line.elasticEnergy > 0
    && line.workingLoadN === 12000
    && line.workingStrain === 0.15
  )));
  const lineForces = held.forceBreakdown().filter(force => force.category === "mooring");
  assert.equal(lineForces.length, 2);
  assert.ok(lineForces.every(force => (
    force.tension > 500
    && force.applicationPoint
    && Number.isFinite(force.N)
    && force.power <= 1e-3
  )));

  const passive = createCalmSimulator();
  passive.reset({
    pose: initial.pose,
    velocity: { u: 1, v: 0.2, r: 0.03 }
  });
  assert.equal(passive.attachMooring({
    id: "energy",
    boatCleatId: "bow-port",
    shoreCleatId: "shore-energy",
    shorePoint: { east: -3, north: 1.45, z: 1.16 }
  }).ok, true);
  let previousEnergy = (
    kineticEnergy(passive.snapshot())
    + passive.snapshot().moorings.reduce((sum, line) => sum + line.elasticEnergy, 0)
  );
  for (let index = 0; index < 240; index += 1) {
    passive.step({ throttle: 0, rudder: 0 }, DT);
    const passiveSnapshot = passive.snapshot();
    const energy = (
      kineticEnergy(passiveSnapshot)
      + passiveSnapshot.moorings.reduce((sum, line) => sum + line.elasticEnergy, 0)
    );
    assert.ok(energy <= previousEnergy + 1e-6);
    previousEnergy = energy;
  }
});

test("aussières: réglage de longueur borné, progressif et distinct de l'élasticité", () => {
  assert.equal(
    Physics.DEFAULT_PROFILE.mooring.maximumHaulInducedSpeed,
    .2 * Physics.KNOT
  );
  assert.equal(Physics.DEFAULT_PROFILE.mooring.haulInRate, 1);
  assert.equal(Physics.DEFAULT_PROFILE.mooring.humanPullForce, 200);
  assert.equal("humanPullRiseTime" in Physics.DEFAULT_PROFILE.mooring, false);
  assert.equal("humanPullDecayTime" in Physics.DEFAULT_PROFILE.mooring, false);
  const runAdjustment = dt => {
    const simulator = createCalmSimulator();
    simulator.reset(initial);
    const cleat = Physics.DEFAULT_PROFILE.mooring.cleats.find(
      candidate => candidate.id === "mid-port"
    );
    const boatPoint = Physics.localPointToWorld(
      initial.pose,
      cleat.x,
      cleat.y
    );
    assert.equal(simulator.attachMooring({
      id: "adjustable",
      boatCleatId: cleat.id,
      shoreCleatId: "shore-adjustable",
      shorePoint: {
        east: boatPoint.east - 4,
        north: boatPoint.north,
        z: cleat.z
      }
    }).ok, true);

    const attached = simulator.snapshot().moorings[0];
    assert.ok(Math.abs(attached.length - 4) < 1e-12);
    assert.equal(attached.targetLength, attached.length);
    const payOut = simulator.setMooringLength("adjustable", 4.4);
    assert.equal(payOut.ok, true);
    assert.equal(payOut.mooring.targetLength, 4.4);
    assert.equal(payOut.mooring.length, 4);
    for (let index = 0; index < Math.round(1 / dt); index += 1) {
      simulator.step({ throttle: 0, rudder: 0 }, dt);
    }
    const slack = simulator.snapshot();
    assert.ok(Math.abs(slack.moorings[0].length - 4.4) < 1e-9);
    assert.ok(slack.moorings[0].slack > .39);
    assert.equal(slack.moorings[0].tension, 0);
    assert.deepEqual(slack.pose, initial.pose);
    assert.equal(
      simulator.forceBreakdown().some(force => force.category === "mooring"),
      false,
      "payer du mou ne doit jamais pousser le bateau"
    );

    const capped = simulator.setMooringLength("adjustable", 25);
    assert.equal(capped.ok, true);
    assert.equal(capped.clamped, true);
    assert.equal(capped.mooring.targetLength, 20);
    assert.equal(simulator.setMooringLength("unknown", 3).ok, false);
    assert.equal(simulator.setMooringLength("adjustable", Number.NaN).ok, false);

    const hauled = simulator.setMooringLength("adjustable", 3.8);
    assert.equal(hauled.ok, true);
    let maximumStrain = 0;
    let maximumHaulRate = 0;
    let maximumGroundSpeed = 0;
    let maximumHumanForce = 0;
    let firstActiveHumanForce = null;
    for (let index = 0; index < Math.round(12 / dt); index += 1) {
      const state = simulator.step({ throttle: 0, rudder: 0 }, dt);
      const line = state.moorings[0];
      maximumStrain = Math.max(maximumStrain, line.strain);
      maximumHaulRate = Math.max(maximumHaulRate, -line.lengthRate);
      maximumGroundSpeed = Math.max(
        maximumGroundSpeed,
        state.diagnostics.groundSpeed
      );
      const humanForce = simulator.forceBreakdown()
        .filter(force => force.category === "human")
        .reduce((sum, force) => sum + Math.hypot(force.X, force.Y), 0);
      if (firstActiveHumanForce === null && humanForce > 1e-9) {
        firstActiveHumanForce = humanForce;
      }
      maximumHumanForce = Math.max(maximumHumanForce, humanForce);
      assert.ok(line.tension >= 0);
    }
    const snapshot = simulator.snapshot();
    assert.ok(Math.abs(snapshot.moorings[0].length - 3.8) < 1e-8);
    assert.equal(snapshot.moorings[0].targetLength, 3.8);
    assert.ok(maximumHaulRate <= Physics.DEFAULT_PROFILE.mooring.haulInRate + 1e-9);
    assert.ok(maximumHaulRate >= Physics.DEFAULT_PROFILE.mooring.haulInRate - 1e-9);
    assert.ok(
      maximumHumanForce
      <= Physics.DEFAULT_PROFILE.mooring.humanPullForce + 1e-6
    );
    assert.ok(firstActiveHumanForce > 190, "l'effort doit être immédiat dès que la ligne est tendue");
    assert.ok(maximumHumanForce > 190, "l'effort doit être disponible sans montée en force");
    assert.ok(
      maximumGroundSpeed
      <= Physics.DEFAULT_PROFILE.mooring.maximumHaulInducedSpeed + 1e-6
    );
    assert.ok(maximumStrain < 0.01);
    assert.ok(Math.hypot(snapshot.pose.east, snapshot.pose.north) > .1);
    return snapshot;
  };

  const coarse = runAdjustment(1 / 60);
  const nominal = runAdjustment(1 / 120);
  const fine = runAdjustment(1 / 240);
  assert.deepEqual(coarse, nominal);
  assert.ok(Math.hypot(
    nominal.pose.east - fine.pose.east,
    nominal.pose.north - fine.pose.north
  ) < .015);
  assert.ok(Math.abs(Physics.wrapAngle(
    nominal.pose.heading - fine.pose.heading
  )) < .001);
});

test("aussières: la reprise reste sous 0,2 nd sur les six taquets", () => {
  const maximumSpeed = Physics.DEFAULT_PROFILE.mooring.maximumHaulInducedSpeed;
  const runCleats = selectedCleats => {
    const simulator = createCalmSimulator();
    simulator.reset(initial);
    for (const cleat of selectedCleats) {
      const point = Physics.localPointToWorld(initial.pose, cleat.x, cleat.y);
      assert.equal(simulator.attachMooring({
        id: `haul-${cleat.id}`,
        boatCleatId: cleat.id,
        shoreCleatId: `shore-${cleat.id}`,
        shorePoint: {
          east: point.east - 4,
          north: point.north,
          z: cleat.z
        }
      }).ok, true);
      assert.equal(
        simulator.setMooringLength(`haul-${cleat.id}`, 3.8).ok,
        true
      );
    }
    let observedMaximum = 0;
    let observedHumanForce = 0;
    for (let index = 0; index < Math.round(8 / DT); index += 1) {
      const snapshot = simulator.step({ throttle: 0, rudder: 0 }, DT);
      observedMaximum = Math.max(
        observedMaximum,
        snapshot.diagnostics.groundSpeed
      );
      const humanForce = simulator.forceBreakdown()
        .filter(force => force.category === "human")
        .reduce((sum, force) => sum + Math.hypot(force.X, force.Y), 0);
      observedHumanForce = Math.max(observedHumanForce, humanForce);
    }
    assert.ok(
      observedMaximum <= maximumSpeed + 1e-6,
      `${selectedCleats.map(cleat => cleat.id).join(", ")}: ${
        (observedMaximum / Physics.KNOT).toFixed(3)
      } nd`
    );
    assert.ok(
      observedHumanForce
      <= Physics.DEFAULT_PROFILE.mooring.humanPullForce + 1e-6
    );
  };

  for (const cleat of Physics.DEFAULT_PROFILE.mooring.cleats) {
    runCleats([cleat]);
  }
  runCleats(Physics.DEFAULT_PROFILE.mooring.cleats);
});

test("aussières: une reprise humaine ne vainc pas la propulsion", () => {
  const simulator = createCalmSimulator();
  simulator.reset(initial);
  const forward = Physics.bodyToWorld(1, 0, initial.pose.heading);
  for (const cleatId of ["mid-port", "mid-starboard"]) {
    const cleat = Physics.DEFAULT_PROFILE.mooring.cleats.find(
      candidate => candidate.id === cleatId
    );
    const point = Physics.localPointToWorld(initial.pose, cleat.x, cleat.y);
    assert.equal(simulator.attachMooring({
      id: `hold-${cleat.id}`,
      boatCleatId: cleat.id,
      shoreCleatId: `shore-${cleat.id}`,
      shorePoint: {
        east: point.east - forward.east * 4,
        north: point.north - forward.north * 4,
        z: cleat.z
      }
    }).ok, true);
  }
  for (let index = 0; index < Math.round(5 / DT); index += 1) {
    simulator.step({ throttle: 1, rudder: 0 }, DT);
  }
  for (const line of simulator.snapshot().moorings) {
    assert.equal(simulator.setMooringLength(line.id, 3.8).ok, true);
  }
  let maximumHumanForce = 0;
  let minimumHumanForceAfterOneSecond = Infinity;
  for (let index = 0; index < Math.round(5 / DT); index += 1) {
    simulator.step({ throttle: 1, rudder: 0 }, DT);
    const humanForce = simulator.forceBreakdown()
      .filter(force => force.category === "human")
      .reduce((sum, force) => sum + Math.hypot(force.X, force.Y), 0);
    maximumHumanForce = Math.max(maximumHumanForce, humanForce);
    if (index >= Math.round(1 / DT)) {
      minimumHumanForceAfterOneSecond = Math.min(
        minimumHumanForceAfterOneSecond,
        humanForce
      );
    }
  }
  const snapshot = simulator.snapshot();
  assert.ok(
    maximumHumanForce
    <= Physics.DEFAULT_PROFILE.mooring.humanPullForce + 1e-6
  );
  assert.ok(
    minimumHumanForceAfterOneSecond
    >= Physics.DEFAULT_PROFILE.mooring.humanPullForce - 1e-6,
    "l'effort humain ne doit pas décroître avec le temps"
  );
  assert.ok(
    snapshot.moorings.every(line => line.length > 3.98),
    "la reprise humaine a artificiellement vaincu le moteur"
  );
  assert.ok(snapshot.moorings.every(line => line.tension > 500));
});

test("aussières: bras de levier, symétrie, douze lignes et convergence", () => {
  const makeBowHold = symmetric => {
    const simulator = createCalmSimulator();
    simulator.reset(initial);
    assert.equal(simulator.attachMooring({
      id: "bow-port",
      boatCleatId: "bow-port",
      shoreCleatId: "shore-port",
      shorePoint: { east: -4, north: 1.45, z: 1.16 }
    }).ok, true);
    if (symmetric) {
      assert.equal(simulator.attachMooring({
        id: "bow-starboard",
        boatCleatId: "bow-starboard",
        shoreCleatId: "shore-starboard",
        shorePoint: { east: -4, north: -1.45, z: 1.16 }
      }).ok, true);
    }
    for (let index = 0; index < 600; index += 1) {
      simulator.step({ throttle: 1, rudder: 0 }, DT);
    }
    return simulator.snapshot();
  };
  const single = makeBowHold(false);
  const symmetric = makeBowHold(true);
  assert.ok(Math.abs(single.velocity.r) > 0.05, "le bras de levier doit créer du lacet");
  assert.ok(Math.abs(symmetric.velocity.r) < 1e-5, "la paire symétrique doit annuler le lacet");
  assert.ok(Math.hypot(symmetric.pose.east, symmetric.pose.north) < 0.15);
  assert.ok(symmetric.moorings.every(line => line.strain > 0 && line.strain < 0.02));

  const runTwelve = dt => {
    const simulator = createCalmSimulator();
    simulator.reset(initial);
    for (const cleat of Physics.DEFAULT_PROFILE.mooring.cleats) {
      const point = Physics.localPointToWorld(initial.pose, cleat.x, cleat.y);
      for (let lineIndex = 1; lineIndex <= 2; lineIndex += 1) {
        assert.equal(simulator.attachMooring({
          id: `${cleat.id}-${lineIndex}`,
          boatCleatId: cleat.id,
          shoreCleatId: `shore-${cleat.id}-${lineIndex}`,
          shorePoint: { east: point.east - 6, north: point.north, z: cleat.z }
        }).ok, true);
      }
    }
    for (let index = 0; index < Math.round(20 / dt); index += 1) {
      simulator.step({ throttle: 1, rudder: 20 * DEG }, dt);
    }
    return simulator.snapshot();
  };
  const coarse = runTwelve(1 / 60);
  const nominal = runTwelve(1 / 120);
  const fine = runTwelve(1 / 240);
  assert.equal(nominal.moorings.length, 12);
  assert.ok(nominal.moorings.every(line => (
    line.strain <= Physics.DEFAULT_PROFILE.mooring.elasticity.maximumStrain
      + Physics.DEFAULT_PROFILE.mooring.solverTolerance
    && line.guardActive === false
  )));
  assert.deepEqual(coarse, nominal);
  assert.ok(Math.hypot(
    nominal.pose.east - fine.pose.east,
    nominal.pose.north - fine.pose.north
  ) < 0.01);
  assert.ok(Math.abs(Physics.wrapAngle(
    nominal.pose.heading - fine.pose.heading
  )) < 0.001);
});

test("contacts: seuils, amortissement et absence de traversée", () => {
  assert.deepEqual(
    [0.1, 0.2, 0.21, 0.4, 0.41].map(Physics.classifyImpact),
    ["safe", "safe", "warning", "warning", "severe"]
  );
  const result = run({
    seconds: 12,
    velocity: { u: 0.8, v: 0, r: 0 },
    obstacles: {
      rectangles: [{
        id: "wall",
        east: 10,
        north: 0,
        width: 1,
        height: 20
      }],
      boats: []
    }
  }).snapshot;
  assert.ok(result.pose.east < 4.35, `traversée du ponton: centre à ${result.pose.east}`);
  assert.ok(result.contacts.maxImpact > 0.4);
  assert.ok(result.contacts.severe >= 1);
  assert.ok(result.contacts.current.every(contact => contact.penetration < 0.35));
});

test("balayage déterministe, sensibilité ±20 % et budget temps réel", () => {
  for (const scale of [0.8, 1, 1.2]) {
    const profile = structuredClone(
      Physics.RAW_PROFILES["sun-odyssey-36i-pedagogical"]
    );
    profile.version = `sensitivity-${scale}`;
    profile.hull.axialResistance.surgeLinear *= scale;
    profile.hull.axialResistance.surgeQuadratic *= scale;
    profile.hull.crossFlow.cd *= scale;
    profile.appendages[0].area *= scale;
    profile.rudders[0].area *= scale;
    const result = run({
      seconds: 5,
      throttle: 0.5,
      rudderDeg: 15,
      profile
    }).snapshot;
    assert.ok(result.velocity.u > 0);
    assert.ok(result.velocity.r < 0);
    assert.ok(Object.values(result.velocity).every(Number.isFinite));
  }

  const simulator = Physics.createSimulator();
  for (const cleat of Physics.DEFAULT_PROFILE.mooring.cleats) {
    const point = Physics.localPointToWorld(simulator.snapshot().pose, cleat.x, cleat.y);
    for (let lineIndex = 1; lineIndex <= 2; lineIndex += 1) {
      assert.equal(simulator.attachMooring({
        id: `performance-${cleat.id}-${lineIndex}`,
        boatCleatId: cleat.id,
        shoreCleatId: `performance-shore-${cleat.id}-${lineIndex}`,
        shorePoint: {
          east: point.east - 6,
          north: point.north,
          z: cleat.z
        }
      }).ok, true);
    }
  }
  const start = performance.now();
  const batchDurations = [];
  for (let batch = 0; batch < 500; batch += 1) {
    const batchStart = performance.now();
    for (let offset = 0; offset < 20; offset += 1) {
      const index = batch * 20 + offset;
      const phase = index % 1200;
      const throttle = phase < 400 ? 0.65 : phase < 800 ? -0.45 : 0;
      const rudder = ((index % 71) - 35) * DEG;
      simulator.step({ throttle, rudder }, DT);
    }
    batchDurations.push((performance.now() - batchStart) / 20);
    const snapshot = simulator.snapshot();
    assert.ok([
      snapshot.pose.east,
      snapshot.pose.north,
      snapshot.pose.heading,
      snapshot.velocity.u,
      snapshot.velocity.v,
      snapshot.velocity.r,
      snapshot.propulsion.thrust,
      snapshot.propulsion.advanceRatio
    ].every(Number.isFinite));
  }
  const elapsed = performance.now() - start;
  const average = elapsed / 10000;
  batchDurations.sort((left, right) => left - right);
  const p95 = batchDurations[Math.floor(batchDurations.length * .95)];
  const x2AverageWorkPerRealSecond = average * 240;
  const x2P95WorkPerRealSecond = p95 * 240;
  assert.ok(average < 1, `coût moyen hors budget: ${average.toFixed(3)} ms/pas`);
  assert.ok(p95 < 1, `95e percentile hors budget: ${p95.toFixed(3)} ms/pas`);
  assert.ok(
    x2AverageWorkPerRealSecond < 240,
    `×2 consommerait ${x2AverageWorkPerRealSecond.toFixed(1)} ms par seconde réelle`
  );
  assert.ok(
    x2P95WorkPerRealSecond < 240,
    `×2 dépasserait le budget p95: ${x2P95WorkPerRealSecond.toFixed(1)} ms/s`
  );
});
