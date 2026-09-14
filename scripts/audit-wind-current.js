"use strict";

/*
 * Audit reproductible des efforts de vent et de courant.
 *
 * Ce script ne modifie ni les coefficients ni l'état du simulateur livré.
 * Il produit les grandeurs utilisées dans rapport-audit-vent-courant-port.md.
 */

const Physics = require("../src/simulateur-port/physics-core.js");

const DT = 1 / 120;
const HEADING = 0;
const ZERO_CONTROLS = Object.freeze({ throttle: 0, rudder: 0 });

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

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

function create(environmentInput, initial = {}) {
  const simulator = Physics.createSimulator({
    environment: environmentInput,
    obstacles: []
  });
  simulator.reset({
    pose: { east: 0, north: 0, heading: initial.heading ?? HEADING },
    velocity: {
      u: initial.u ?? 0,
      v: initial.v ?? 0,
      r: initial.r ?? 0
    }
  }, environmentInput);
  return simulator;
}

function sumForces(forces, predicate) {
  return forces.filter(predicate).reduce((total, force) => ({
    X: total.X + force.X,
    Y: total.Y + force.Y,
    N: total.N + force.N
  }), { X: 0, Y: 0, N: 0 });
}

function windPolar() {
  return [0, 30, 45, 60, 90, 120, 135, 150, 180].map(angle => {
    const simulator = create(environment({
      windSpeedKn: 12,
      windFromDeg: angle
    }));
    const inspection = simulator.inspectForces();
    const force = sumForces(
      inspection.forces,
      item => item.source === "Vent"
    );
    return {
      angleDeg: angle,
      XN: round(force.X, 1),
      YN: round(force.Y, 1),
      yawNm: round(force.N, 1),
      resultantN: round(Math.hypot(force.X, force.Y), 1),
      centerOfPressureX: Math.abs(force.Y) > 1e-9
        ? round(force.N / force.Y, 3)
        : null
    };
  });
}

function currentPolar() {
  return [0, 30, 45, 60, 90, 120, 135, 150, 180].map(angle => {
    const simulator = create(environment({
      currentSpeedKn: 1,
      currentFromDeg: angle
    }));
    const inspection = simulator.inspectForces();
    return {
      angleDeg: angle,
      XN: round(inspection.total.X, 1),
      YN: round(inspection.total.Y, 1),
      yawNm: round(inspection.total.N, 1),
      resultantN: round(Math.hypot(
        inspection.total.X,
        inspection.total.Y
      ), 1)
    };
  });
}

function compactSnapshot(snapshot) {
  return {
    timeS: round(snapshot.time, 1),
    eastM: round(snapshot.pose.east, 2),
    northM: round(snapshot.pose.north, 2),
    headingDeg: round(snapshot.pose.heading / Physics.DEG, 3),
    surgeKn: round(snapshot.velocity.u / Physics.KNOT, 3),
    swayKn: round(snapshot.velocity.v / Physics.KNOT, 3),
    yawDegS: round(snapshot.velocity.r / Physics.DEG, 4),
    sogKn: round(snapshot.diagnostics.groundSpeed / Physics.KNOT, 3),
    stwKn: round(snapshot.diagnostics.waterSpeed / Physics.KNOT, 3)
  };
}

function timeHistory(environmentInput, checkpoints, options = {}) {
  const simulator = create(environmentInput, options.initial);
  const controls = options.controls || ZERO_CONTROLS;
  const result = [];
  let completedSteps = 0;
  for (const checkpoint of checkpoints) {
    const targetSteps = Math.round(checkpoint / DT);
    while (completedSteps < targetSteps) {
      simulator.step(controls, DT);
      completedSteps += 1;
    }
    result.push(compactSnapshot(simulator.snapshot()));
  }
  return result;
}

function crosswindResponseMatrix() {
  const checkpoints = [1, 3, 5, 10, 30, 60, 300];
  const rows = [];
  for (const windSpeedKn of [6, 12, 20, 30]) {
    for (const windFromDeg of [60, 90, 120, 240, 270, 300]) {
      rows.push({
        windSpeedKn,
        windFromDeg,
        history: timeHistory(environment({ windSpeedKn, windFromDeg }), checkpoints)
      });
    }
  }
  return rows;
}

function poweredCouplingMatrix() {
  return [
    { id: "ahead-starboard", throttle: 0.4, windFromDeg: 90, currentFromDeg: 45 },
    { id: "neutral-starboard", throttle: 0, windFromDeg: 90, currentFromDeg: 45 },
    { id: "astern-starboard", throttle: -0.4, windFromDeg: 90, currentFromDeg: 45 },
    { id: "ahead-port", throttle: 0.4, windFromDeg: 270, currentFromDeg: 315 },
    { id: "neutral-port", throttle: 0, windFromDeg: 270, currentFromDeg: 315 },
    { id: "astern-port", throttle: -0.4, windFromDeg: 270, currentFromDeg: 315 }
  ].map(definition => ({
    ...definition,
    history: timeHistory(environment({
      windSpeedKn: 12,
      windFromDeg: definition.windFromDeg,
      currentSpeedKn: 1,
      currentFromDeg: definition.currentFromDeg
    }), [10, 30, 60], {
      controls: { throttle: definition.throttle, rudder: 0 }
    })
  }));
}

function transverseBalance() {
  const windInspection = create(environment({
    windSpeedKn: 12,
    windFromDeg: 90
  })).inspectForces();
  const air = sumForces(
    windInspection.forces,
    force => force.source === "Vent"
  );
  const swayInspection = create(environment(), { v: -0.2 }).inspectForces();
  const water = sumForces(
    swayInspection.forces,
    force => force.category === "passive"
  );
  return {
    aerodynamic: {
      ...Object.fromEntries(Object.entries(air).map(([key, value]) => [key, round(value, 3)])),
      centerX: round(air.N / air.Y, 4)
    },
    hydrodynamicAtSway02: {
      ...Object.fromEntries(Object.entries(water).map(([key, value]) => [key, round(value, 3)])),
      centerX: round(water.N / water.Y, 4)
    }
  };
}

function scenarioMatrix() {
  const definitions = [
    {
      id: "wind-beam-12",
      description: "Vent 12 nd de tribord, sans courant",
      environment: environment({ windSpeedKn: 12, windFromDeg: 90 })
    },
    {
      id: "current-beam-1",
      description: "Courant 1 nd de tribord, sans vent",
      environment: environment({ currentSpeedKn: 1, currentFromDeg: 90 })
    },
    {
      id: "wind-beam-current-same",
      description: "Vent 12 nd et courant 1 nd de tribord",
      environment: environment({
        windSpeedKn: 12,
        windFromDeg: 90,
        currentSpeedKn: 1,
        currentFromDeg: 90
      })
    },
    {
      id: "wind-beam-current-opposed",
      description: "Vent 12 nd de tribord, courant 1 nd de bâbord",
      environment: environment({
        windSpeedKn: 12,
        windFromDeg: 90,
        currentSpeedKn: 1,
        currentFromDeg: 270
      })
    },
    {
      id: "wind-beam-current-head",
      description: "Vent 12 nd de tribord, courant 1 nd de face",
      environment: environment({
        windSpeedKn: 12,
        windFromDeg: 90,
        currentSpeedKn: 1,
        currentFromDeg: 0
      })
    },
    {
      id: "wind-beam-current-tail",
      description: "Vent 12 nd de tribord, courant 1 nd arrière",
      environment: environment({
        windSpeedKn: 12,
        windFromDeg: 90,
        currentSpeedKn: 1,
        currentFromDeg: 180
      })
    },
    {
      id: "wind-head-current-beam",
      description: "Vent 12 nd de face, courant 1 nd de tribord",
      environment: environment({
        windSpeedKn: 12,
        windFromDeg: 0,
        currentSpeedKn: 1,
        currentFromDeg: 90
      })
    }
  ];
  return definitions.map(definition => ({
    ...definition,
    environment: undefined,
    history: timeHistory(definition.environment, [10, 30, 60, 120, 300])
  }));
}

function invarianceChecks() {
  const current = Physics.nauticalVectorFromSource(Physics.KNOT, 90 * Physics.DEG);
  const environmentWithCurrent = environment({
    currentSpeedKn: 1,
    currentFromDeg: 90
  });
  const calm = create(environment());
  calm.reset({
    pose: { east: 0, north: 0, heading: HEADING },
    velocity: { u: 0.31, v: -0.17, r: 0.012 }
  });
  const shifted = create(environmentWithCurrent);
  const currentBody = Physics.worldToBody(current.east, current.north, HEADING);
  shifted.reset({
    pose: { east: 0, north: 0, heading: HEADING },
    velocity: {
      u: 0.31 + currentBody.u,
      v: -0.17 + currentBody.v,
      r: 0.012
    }
  }, environmentWithCurrent);
  const calmForces = calm.inspectForces();
  const shiftedForces = shifted.inspectForces();
  const calmHydrodynamic = sumForces(
    calmForces.forces,
    force => force.source !== "Vent"
  );
  const shiftedHydrodynamic = sumForces(
    shiftedForces.forces,
    force => force.source !== "Vent"
  );
  return {
    relativeVelocityError: round(Math.max(
      Math.abs(calmForces.waterRelative.u - shiftedForces.waterRelative.u),
      Math.abs(calmForces.waterRelative.v - shiftedForces.waterRelative.v),
      Math.abs(calmForces.waterRelative.r - shiftedForces.waterRelative.r)
    ), 12),
    hydrodynamicForceErrorN: round(Math.max(
      Math.abs(calmHydrodynamic.X - shiftedHydrodynamic.X),
      Math.abs(calmHydrodynamic.Y - shiftedHydrodynamic.Y),
      Math.abs(calmHydrodynamic.N - shiftedHydrodynamic.N)
    ), 9)
  };
}

const windPolarData = windPolar();
const currentPolarData = currentPolar();
const historiesData = scenarioMatrix();
const invarianceData = invarianceChecks();
const crosswindData = crosswindResponseMatrix();
const poweredCouplingData = poweredCouplingMatrix();
const transverseBalanceData = transverseBalance();
const windOnlyHistory = historiesData.find(item => item.id === "wind-beam-12").history;
const currentOnlyHistory = historiesData.find(item => item.id === "current-beam-1").history;
const windOnlyFinal = windOnlyHistory[windOnlyHistory.length - 1];
const currentOnlyFinal = currentOnlyHistory[currentOnlyHistory.length - 1];
const headWind = windPolarData.find(item => item.angleDeg === 0);
const tailWind = windPolarData.find(item => item.angleDeg === 180);
const beamWind = windPolarData.find(item => item.angleDeg === 90);
const sideCenters = windPolarData
  .map(item => item.centerOfPressureX)
  .filter(Number.isFinite);

const report = {
  physicsVersion: Physics.VERSION,
  dt: DT,
  profile: {
    id: Physics.DEFAULT_PROFILE.id,
    version: Physics.DEFAULT_PROFILE.version,
    schemaVersion: Physics.DEFAULT_PROFILE.schemaVersion,
    massKg: Physics.DEFAULT_PROFILE.inertia.loadedMass,
    lengthM: Physics.DEFAULT_PROFILE.dimensions.lengthOverall,
    beamM: Physics.DEFAULT_PROFILE.dimensions.beam,
    aerodynamics: Physics.DEFAULT_PROFILE.aerodynamics
  },
  windPolar12Kn: windPolarData,
  currentPolar1Kn: currentPolarData,
  histories: historiesData,
  crosswindResponses: crosswindData,
  poweredCouplings: poweredCouplingData,
  transverseBalance: transverseBalanceData,
  invariance: invarianceData,
  assessments: {
    beamWindForceN: beamWind.resultantN,
    headTailForceDifferenceN: round(
      Math.abs(headWind.resultantN - tailWind.resultantN),
      6
    ),
    sideCenterOfPressureRangeM: round(
      Math.max(...sideCenters) - Math.min(...sideCenters),
      6
    ),
    windOnlyLeewayRatioAt300S: round(windOnlyFinal.stwKn / 12, 4),
    uscGMediumSailboatReferenceRatio: 0.04,
    windOnlyReferenceSpeedAt12Kn: 0.48,
    currentOnlyResidualWaterSpeedAt300S: currentOnlyFinal.stwKn,
    currentOnlyGroundSpeedAt300S: currentOnlyFinal.sogKn
  }
};

const coupledWaterSpeeds = historiesData
  .filter(item => item.id.startsWith("wind-"))
  .map(item => item.history[item.history.length - 1].stwKn);
const finiteHistory = history => history.every(sample => Object.values(sample).every(Number.isFinite));
const beamResponses = crosswindData.filter(item => [90, 270].includes(item.windFromDeg));
const crosswindMirrorError = Math.max(...[6, 12, 20, 30].map(speed => {
  const starboard = beamResponses.find(item => (
    item.windSpeedKn === speed && item.windFromDeg === 90
  )).history.at(-1);
  const port = beamResponses.find(item => (
    item.windSpeedKn === speed && item.windFromDeg === 270
  )).history.at(-1);
  return Math.abs(starboard.headingDeg + port.headingDeg);
}));
const poweredCommandCausality = ["starboard", "port"].every(side => {
  const surge = command => poweredCouplingData.find(
    item => item.id === `${command}-${side}`
  ).history.at(-1).surgeKn;
  return surge("ahead") > surge("neutral") && surge("neutral") > surge("astern");
});
report.assessments.aerodynamicCenterX = transverseBalanceData.aerodynamic.centerX;
report.assessments.hydrodynamicCenterXAtSway02 = (
  transverseBalanceData.hydrodynamicAtSway02.centerX
);
report.assessments.crosswindMirrorErrorDeg = round(crosswindMirrorError, 6);
report.assessments.beamWindHeadingsAt300S = beamResponses.map(item => ({
  windSpeedKn: item.windSpeedKn,
  windFromDeg: item.windFromDeg,
  headingDeg: item.history.at(-1).headingDeg
}));
report.acceptance = {
  beamWindForce: (
    report.assessments.beamWindForceN >= 300
    && report.assessments.beamWindForceN <= 420
  ),
  headTailAsymmetry: report.assessments.headTailForceDifferenceN > 20,
  directionalCenterOfPressure: report.assessments.sideCenterOfPressureRangeM > 0.35,
  freeLeeway: (
    windOnlyFinal.stwKn >= 0.36
    && windOnlyFinal.stwKn <= 0.60
  ),
  coupledLeeway: coupledWaterSpeeds.every(speed => speed >= 0.35 && speed <= 0.62),
  currentFrameInvariance: (
    invarianceData.relativeVelocityError <= 1e-9
    && invarianceData.hydrodynamicForceErrorN <= 1e-9
  ),
  transverseCentersOrdered: (
    transverseBalanceData.aerodynamic.centerX
    > transverseBalanceData.hydrodynamicAtSway02.centerX + 0.1
  ),
  beamWindBowFallOff: beamResponses.every(item => {
    const headingDeg = item.history.at(-1).headingDeg;
    return item.windFromDeg === 90 ? headingDeg < -1 : headingDeg > 1;
  }),
  beamWindInitialBowFallOff: beamResponses.every(item => {
    const first = item.history[0];
    return item.windFromDeg === 90
      ? first.headingDeg < 0 && first.yawDegS < 0
      : first.headingDeg > 0 && first.yawDegS > 0;
  }),
  crosswindSymmetry: crosswindMirrorError <= 0.02,
  crosswindFinite: crosswindData.every(item => finiteHistory(item.history)),
  poweredCouplingsFinite: poweredCouplingData.every(item => finiteHistory(item.history)),
  poweredCommandCausality
};
report.acceptance.ok = Object.values(report.acceptance).every(Boolean);

if (process.argv.includes("--check")) {
  process.stdout.write(`${JSON.stringify({
    physicsVersion: report.physicsVersion,
    profileId: report.profile.id,
    profileVersion: report.profile.version,
    assessments: report.assessments,
    acceptance: report.acceptance
  }, null, 2)}\n`);
  if (!report.acceptance.ok) process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
