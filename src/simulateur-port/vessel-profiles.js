(function initVesselProfiles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortVesselProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVesselProfilesApi() {
  "use strict";

  const DEG = Math.PI / 180;
  const KNOT = 0.514444;
  const GRAVITY = 9.80665;
  const SCHEMA_VERSION = 5;
  const LEGACY_SCHEMA_VERSION = 1;
  const PREVIOUS_SCHEMA_VERSIONS = Object.freeze([2, 3, 4]);
  const ADAPTABLE_SCHEMA_VERSIONS = Object.freeze([
    LEGACY_SCHEMA_VERSION,
    ...PREVIOUS_SCHEMA_VERSIONS
  ]);
  const MODEL_CLASS = "displacement-sailing-monohull";
  const FOUR_QUADRANT_SAMPLES = 32;

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, deepClone(item)])
      );
    }
    return value;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
    return value;
  }

  function scaledHullSections(
    lwl,
    canoeDraft,
    shapes = [0.28, 0.51, 0.73, 0.88, 0.97, 1, 0.96, 0.86, 0.70, 0.48, 0.22]
  ) {
    const dx = lwl / shapes.length;
    return shapes.map((shape, index) => ({
      x: -lwl / 2 + dx * (index + 0.5),
      dx,
      breadthFactor: shape,
      immersedDepth: canoeDraft * (0.46 + 0.54 * shape),
      shape
    }));
  }

  function createFourQuadrantTable(spec) {
    const diameter = spec.diameter;
    const pitchRatio = spec.pitch / diameter;
    const geometryScale = (
      Math.pow(Math.max(0.2, spec.expandedAreaRatio) / 0.55, 0.32)
      * Math.pow(Math.max(0.35, pitchRatio) / 0.687, 0.28)
      * Math.pow(Math.max(2, spec.blades) / 3, 0.12)
    );
    const thrust = [];
    const torque = [];
    const aheadKt = (spec.ktAhead ?? 0.19) * geometryScale;
    const asternKt = (spec.ktAstern ?? 0.14) * geometryScale;
    const aheadAdvance = spec.ktAdvanceAhead ?? 0.105;
    const asternAdvance = spec.ktAdvanceAstern ?? 0.055;
    const windmill = spec.ktWindmill ?? 0.035;
    const torqueAhead = (spec.cqAhead ?? 0.0182) * geometryScale;
    const torqueAstern = (spec.cqAstern ?? 0.0195) * geometryScale;
    const torqueWindmill = (spec.cqWindmill ?? 0.0115) * geometryScale;
    const torqueCross = spec.cqCross ?? 0.0035;

    for (let index = 0; index < FOUR_QUADRANT_SAMPLES; index += 1) {
      const beta = -Math.PI + index * Math.PI * 2 / FOUR_QUADRANT_SAMPLES;
      const cosine = Math.cos(beta);
      const sine = Math.sin(beta);
      const kt0 = cosine >= 0 ? aheadKt : asternKt;
      const ktAdvance = cosine >= 0 ? aheadAdvance : asternAdvance;

      // Mise sous forme sans dimension de la loi quatre quadrants historique.
      // Les valeurs sont figées dans chaque profil puis interpolées dans le
      // cœur ; la table de couple est indépendante et rend possible le bilan
      // mécanique moteur-arbre-hélice.
      const ct = (
        0.5266 * kt0 * cosine * Math.abs(cosine)
        - 1.158 * ktAdvance * cosine * sine
        - 2.546 * windmill * sine * Math.abs(sine)
      );
      const cqRotation = cosine >= 0 ? torqueAhead : torqueAstern;
      const cq = (
        cqRotation * cosine * Math.abs(cosine)
        - torqueWindmill * sine * Math.abs(sine)
        - torqueCross * cosine * sine
      );
      thrust.push(ct);
      torque.push(cq);
    }
    return {
      representation: "periodic-beta-table",
      sampleCount: FOUR_QUADRANT_SAMPLES,
      betaOriginRad: -Math.PI,
      thrust,
      torque,
      source: spec.source || "calibrated low-order four-quadrant prior",
      uncertainty: spec.uncertainty ?? 0.25
    };
  }

  function propulsionMechanics(spec) {
    const powerKw = spec.powerKw;
    const maxRpm = spec.maxRpm ?? 3200;
    const ratedTorque = powerKw * 1000 / (maxRpm * Math.PI * 2 / 60);
    return {
      engine: {
        inertiaKgM2: spec.engineInertiaKgM2 ?? Math.max(0.07, powerKw * 0.0062),
        frictionNm: spec.engineFrictionNm ?? Math.max(1.8, ratedTorque * 0.055),
        governorKpNmPerRadS: spec.governorKpNmPerRadS ?? Math.max(0.84, ratedTorque / 40),
        governorKiNmPerRad: spec.governorKiNmPerRad ?? Math.max(0.64, ratedTorque / 65),
        torqueCurve: [
          { rpm: 850, torqueNm: ratedTorque * 0.72 },
          { rpm: 1500, torqueNm: ratedTorque * 0.96 },
          { rpm: 2200, torqueNm: ratedTorque * 1.10 },
          { rpm: 2800, torqueNm: ratedTorque * 1.06 },
          { rpm: maxRpm, torqueNm: ratedTorque }
        ]
      },
      shaft: {
        inertiaKgM2: spec.shaftInertiaKgM2 ?? Math.max(0.012, Math.pow(spec.diameter, 5) * 1.35),
        viscousFrictionNmPerRadS: spec.shaftViscousFrictionNmPerRadS ?? 0.018,
        coulombFrictionNm: spec.shaftCoulombFrictionNm ?? 0.18
      },
      clutch: {
        capacityEngineNm: spec.clutchCapacityEngineNm ?? ratedTorque * 1.65,
        stiffnessNmPerRadS: spec.clutchStiffnessNmPerRadS ?? 0.82,
        disengageTimeS: spec.disengageTimeS ?? 0.12,
        neutralDwellS: spec.neutralDwellS ?? 0.18,
        engageTimeS: spec.engageTimeS ?? 0.36
      }
    };
  }

  function aerodynamicPanels(
    gunwale = REFERENCE_GUNWALE,
    scaleLength = 1,
    scaleBeam = scaleLength,
    scaleArea = scaleLength * scaleLength,
    superstructure = null
  ) {
    const point = (x, y, z) => ({
      // Chaque centre reste celui du composant décrit. Le bilan de lacet doit
      // émerger de ces bras de levier et des résistances immergées, sans
      // translation globale destinée à imposer une trajectoire particulière.
      x: x * scaleLength,
      y: y * scaleBeam,
      z: z * scaleLength
    });
    const side = (id, area, normalX, normalY, x, y, z, exposure = 1) => ({
      id,
      area: area * scaleArea,
      normalBody: { x: normalX, y: normalY },
      center: point(x, y, z),
      cdNormal: 1.08,
      cdTangential: 0.055,
      exposure,
      twoSided: false
    });
    const freeboard = [];
    for (let index = 0; index < gunwale.length - 1; index += 1) {
      const left = gunwale[index];
      const right = gunwale[index + 1];
      const dx = right.x - left.x;
      const projectedArea = dx * (left.z + right.z) / 2;
      const breadthSlope = (right.halfBeam - left.halfBeam) / dx;
      const normalScale = Math.hypot(breadthSlope, 1);
      const surfaceArea = projectedArea * normalScale;
      const centerX = dx * (
        left.z * (2 * left.x + right.x)
        + right.z * (left.x + 2 * right.x)
      ) / (6 * projectedArea);
      const centerHalfBeam = dx * (
        2 * left.halfBeam * left.z
        + left.halfBeam * right.z
        + right.halfBeam * left.z
        + 2 * right.halfBeam * right.z
      ) / (6 * projectedArea);
      const centerZ = dx * (
        left.z * left.z
        + left.z * right.z
        + right.z * right.z
      ) / (6 * projectedArea);
      for (const [sideName, sideSign] of [["starboard", 1], ["port", -1]]) {
        freeboard.push({
          id: `freeboard-${index}-${sideName}`,
          // Surface réglée engendrée par le rail et la flottaison. Sa pente
          // porte aussi l'effort longitudinal de la coque convergente.
          area: surfaceArea,
          normalBody: {
            x: -breadthSlope / normalScale,
            y: sideSign / normalScale
          },
          center: {
            x: centerX,
            y: sideSign * centerHalfBeam,
            z: centerZ
          },
          cdNormal: 1.08,
          cdTangential: 0.055,
          exposure: 1,
          twoSided: false
        });
      }
    }
    const stern = gunwale[0];
    const transom = {
      id: "transom-closure",
      area: 2 * stern.halfBeam * stern.z,
      normalBody: { x: -1, y: 0 },
      center: { x: stern.x, y: 0, z: stern.z / 2 },
      cdNormal: 1.02,
      cdTangential: 0.04,
      exposure: 0.96,
      twoSided: false
    };
    const fittings = superstructure || {
      sides: [
        ["coachroof-aft-starboard", 2.5, -0.08, 0.997, -1.00, 0.82, 1.82],
        ["coachroof-aft-port", 2.5, -0.08, -0.997, -1.00, -0.82, 1.82],
        ["coachroof-fore-starboard", 1.5, 0.12, 0.993, 1.20, 0.70, 1.88],
        ["coachroof-fore-port", 1.5, 0.12, -0.993, 1.20, -0.70, 1.88],
        ["boom-starboard", 1.0, 0, 1, -0.20, 0.18, 3.05, 0.92],
        ["boom-port", 1.0, 0, -1, -0.20, -0.18, 3.05, 0.92]
      ],
      rig: { area: 2.15, x: 0.35, z: 5.10 }
    };
    return [
      ...freeboard,
      ...fittings.sides.map(args => side(...args)),
      {
        id: "mast-rigging",
        area: fittings.rig.area * scaleArea,
        normalBody: { x: 0, y: 1 },
        center: point(fittings.rig.x, 0, fittings.rig.z),
        cdNormal: 1.08,
        cdTangential: 1.08,
        exposure: 0.95,
        omnidirectional: true
      },
      transom
    ];
  }

  // Mesure du rail de fargue du GLB validé, après son calage métrique dans le
  // repère bateau KJP. La physique consomme cette copie versionnée ; elle ne lit
  // jamais le maillage Three à l'exécution.
  const REFERENCE_GUNWALE = [
    { x: -4.800, halfBeam: 1.220, z: 1.137 },
    { x: -4.500, halfBeam: 1.470, z: 1.125 },
    { x: -4.000, halfBeam: 1.630, z: 1.106 },
    { x: -3.300, halfBeam: 1.735, z: 1.084 },
    { x: -2.400, halfBeam: 1.785, z: 1.063 },
    { x: -1.400, halfBeam: 1.795, z: 1.047 },
    { x: -0.400, halfBeam: 1.767, z: 1.041 },
    { x: 0.650, halfBeam: 1.675, z: 1.044 },
    { x: 1.650, halfBeam: 1.480, z: 1.056 },
    { x: 2.527, halfBeam: 1.179, z: 1.062 },
    { x: 3.320, halfBeam: 0.916, z: 1.084 },
    { x: 4.063, halfBeam: 0.620, z: 1.111 },
    { x: 4.658, halfBeam: 0.348, z: 1.135 },
    { x: 5.054, halfBeam: 0.135, z: 1.154 },
    { x: 5.297, halfBeam: 0, z: 1.166 }
  ];

  function gunwaleAt(x, gunwale = REFERENCE_GUNWALE) {
    const index = gunwale.findIndex(point => point.x >= x);
    const rightIndex = Math.min(
      gunwale.length - 1,
      Math.max(1, index < 0 ? gunwale.length - 1 : index)
    );
    const left = gunwale[rightIndex - 1];
    const right = gunwale[rightIndex];
    const span = right.x - left.x;
    const ratio = Math.max(0, Math.min(1, (x - left.x) / span));
    const slope = (right.halfBeam - left.halfBeam) / span;
    return {
      x,
      halfBeam: left.halfBeam + (right.halfBeam - left.halfBeam) * ratio,
      z: left.z + (right.z - left.z) * ratio,
      slope
    };
  }

  function offsetFromGunwale(x, side, distance, gunwale = REFERENCE_GUNWALE) {
    const rail = gunwaleAt(x, gunwale);
    const sideSign = side === "starboard" ? 1 : -1;
    const normalLength = Math.hypot(1, rail.slope);
    const normalX = -rail.slope / normalLength;
    const normalY = sideSign / normalLength;
    return {
      position: {
        x: rail.x + normalX * distance,
        y: sideSign * rail.halfBeam + normalY * distance,
        z: rail.z
      },
      attachment: { x: rail.x, y: sideSign * rail.halfBeam, z: rail.z },
      normal: { x: normalX, y: normalY }
    };
  }

  function deckEquipment(
    kind,
    station,
    x,
    side,
    gunwale = REFERENCE_GUNWALE,
    fenderOffset = 0.165,
    fenderZ = 0.5
  ) {
    const rail = offsetFromGunwale(
      x,
      side,
      kind === "fender" ? fenderOffset : -0.07,
      gunwale
    );
    if (kind === "fender") {
      return {
        id: `fender-${station}-${side}`,
        position: { ...rail.position, z: fenderZ },
        attachment: rail.attachment,
        side,
        preload: 0.01
      };
    }
    return {
      id: `${station}-${side}`,
      position: { ...rail.position, z: rail.position.z + 0.04 },
      attachment: rail.attachment,
      side,
      station
    };
  }

  const REFERENCE_CLEATS = ["port", "starboard"].flatMap(side => [
    deckEquipment("cleat", "bow", 4.25, side),
    deckEquipment("cleat", "mid", 0, side),
    deckEquipment("cleat", "stern", -4.2, side)
  ]);

  const REFERENCE_FENDERS = ["port", "starboard"].flatMap(side => [
    deckEquipment("fender", "bow", 3.55, side),
    deckEquipment("fender", "mid", 0, side),
    deckEquipment("fender", "stern", -3.55, side)
  ]);

  // Plan public du Dufour 310 recalé sur LOA 9,67 m et largeur 3,31 m.
  // Il s'agit d'une géométrie 2D estimée et versionnée, jamais d'une lecture du
  // maillage Three à l'exécution.
  const DUFOUR_310_GUNWALE = [
    { x: -4.585, halfBeam: 1.475, z: 1.040 },
    { x: -4.250, halfBeam: 1.545, z: 1.025 },
    { x: -3.600, halfBeam: 1.615, z: 1.005 },
    { x: -2.750, halfBeam: 1.650, z: 0.990 },
    { x: -1.750, halfBeam: 1.655, z: 0.980 },
    { x: -0.650, halfBeam: 1.635, z: 0.980 },
    { x: 0.500, halfBeam: 1.560, z: 0.990 },
    { x: 1.550, halfBeam: 1.405, z: 1.010 },
    { x: 2.500, halfBeam: 1.165, z: 1.035 },
    { x: 3.300, halfBeam: 0.860, z: 1.065 },
    { x: 3.950, halfBeam: 0.520, z: 1.095 },
    { x: 4.430, halfBeam: 0.230, z: 1.125 },
    { x: 4.750, halfBeam: 0, z: 1.150 }
  ];
  const DUFOUR_310_HULL_SECTION_SHAPES = [
    0.72, 0.88, 0.97, 1, 0.98, 0.94, 0.86, 0.73, 0.57, 0.38, 0.17
  ];
  const DUFOUR_310_SUPERSTRUCTURE = {
    sides: [
      ["coachroof-aft-starboard", 2.05, -0.08, 0.997, -0.90, 0.76, 1.62],
      ["coachroof-aft-port", 2.05, -0.08, -0.997, -0.90, -0.76, 1.62],
      ["coachroof-fore-starboard", 1.25, 0.12, 0.993, 1.10, 0.65, 1.68],
      ["coachroof-fore-port", 1.25, 0.12, -0.993, 1.10, -0.65, 1.68],
      ["boom-starboard", 0.80, 0, 1, -0.15, 0.16, 2.70, 0.92],
      ["boom-port", 0.80, 0, -1, -0.15, -0.16, 2.70, 0.92]
    ],
    rig: { area: 1.75, x: 0.30, z: 4.50 }
  };

  const DUFOUR_310_CLEATS = ["port", "starboard"].flatMap(side => [
    deckEquipment("cleat", "bow", 3.88, side, DUFOUR_310_GUNWALE),
    deckEquipment("cleat", "mid", 0.10, side, DUFOUR_310_GUNWALE),
    deckEquipment("cleat", "stern", -3.92, side, DUFOUR_310_GUNWALE)
  ]);

  const DUFOUR_310_FENDERS = ["port", "starboard"].flatMap(side => [
    deckEquipment("fender", "bow", 3.25, side, DUFOUR_310_GUNWALE, 0.155, 0.46),
    deckEquipment("fender", "mid", 0.05, side, DUFOUR_310_GUNWALE, 0.155, 0.46),
    deckEquipment("fender", "stern", -3.35, side, DUFOUR_310_GUNWALE, 0.155, 0.46)
  ]);

  function contactEnvelopeFromGunwale(gunwale, radius) {
    const sideSamples = ["port", "starboard"].flatMap(side => (
      gunwale.slice(0, -2).map((rail, index) => {
        const sample = offsetFromGunwale(rail.x, side, -radius, gunwale);
        return {
          id: `hull-${side}-${index}`,
          position: sample.position,
          radius,
          reference: sample.attachment
        };
      })
    ));
    const stern = [-0.8, 0, 0.8].map((y, index) => ({
      id: `hull-transom-${index}`,
      position: { x: gunwale[0].x + radius, y },
      radius,
      reference: { x: gunwale[0].x, y }
    }));
    const bow = gunwale[gunwale.length - 1];
    return [
      ...sideSamples,
      ...stern,
      {
        id: "hull-bow",
        position: { x: bow.x - radius, y: 0 },
        radius,
        reference: { x: bow.x, y: 0 }
      }
    ];
  }

  const REFERENCE_PROPELLER_SPEC = {
    diameter: 0.406,
    pitch: 0.279,
    blades: 3,
    expandedAreaRatio: 0.55,
    ktAhead: 0.19,
    ktAstern: 0.14,
    ktAdvanceAhead: 0.105,
    ktAdvanceAstern: 0.055,
    ktWindmill: 0.035,
    cqAhead: 0.0173,
    cqAstern: 0.0195,
    cqWindmill: 0.0115,
    source: "B3-55/P-D 0.69 low-order four-quadrant prior; calibrated envelope",
    uncertainty: 0.25
  };
  const REFERENCE_MECHANICS = propulsionMechanics({
    powerKw: 21.3,
    maxRpm: 3200,
    diameter: REFERENCE_PROPELLER_SPEC.diameter
  });

  const DUFOUR_310_PROPELLER_SPEC = {
    diameter: 0.38,
    pitch: 0.27,
    blades: 2,
    expandedAreaRatio: 0.38,
    ktAhead: 0.17,
    ktAstern: 0.12,
    ktAdvanceAhead: 0.095,
    ktAdvanceAstern: 0.050,
    ktWindmill: 0.032,
    cqAhead: 0.0158,
    cqAstern: 0.0175,
    cqWindmill: 0.0105,
    source: "Bipale fixe D1-20/130S : prior quatre quadrants non calibré",
    uncertainty: 0.25
  };
  const DUFOUR_310_MECHANICS = propulsionMechanics({
    powerKw: 13.8,
    maxRpm: 3200,
    diameter: DUFOUR_310_PROPELLER_SPEC.diameter
  });

  const SUN_ODYSSEY_36I = {
    schemaVersion: SCHEMA_VERSION,
    id: "sun-odyssey-36i-pedagogical",
    version: "6.1.0",
    name: "Sun Odyssey 36i",
    modelClass: MODEL_CLASS,
    steering: {
      type: "wheel",
      maximumRudderRateDegS: 52
    },
    validity: {
      speedThroughWaterKn: [0, 4],
      minimumDepthToDraftRatio: 4,
      supportedPhysics: [
        "deep-water",
        "low-speed",
        "single-fixed-propeller",
        "single-spade-rudder"
      ],
      excludedEffects: ["waves", "shallow-water", "squat", "bank-effect"]
    },
    geometry: {
      loa: 10.94,
      lwl: 9.84,
      lpp: 9.55,
      beam: 3.59,
      draft: 1.94,
      canoeDraft: 0.68,
      wettedArea: 28.5,
      gunwale: REFERENCE_GUNWALE,
      hullSections: scaledHullSections(9.84, 0.68)
    },
    mass: {
      lightDisplacement: 5700,
      displacement: 6500,
      centerOfGravity: { x: 0, y: 0 },
      yawRadius: 2.78,
      addedMassModel: {
        type: "sectional-cross-flow",
        surgeMassRatio: 0.075,
        sectionalScale: 0.36
      }
    },
    hull: {
      axialResistance: {
        type: "linear-quadratic-wave-rise",
        surgeLinear: 96,
        surgeQuadratic: 92,
        waveRise: 34,
        waveOnset: 2.15
      },
      crossFlow: {
        type: "distributed-sections",
        cd: 1.08,
        areaFactor: 0.72,
        linearDampingFroude: 0.020
      }
    },
    appendages: [{
      id: "fin-keel",
      type: "keel",
      position: { x: -0.18, y: 0, z: -1.08 },
      area: 3.15,
      span: 1.26,
      aspectRatio: 1.55,
      coefficients: {
        efficiency: 0.76,
        cd0: 0.018,
        normalCd90: 1.18,
        stallStartDeg: 24,
        stallEndDeg: 52
      }
    }],
    propulsors: [{
      id: "shaft-propeller",
      type: "fixed-pitch-propeller",
      position: { x: -3.45, y: 0, z: -0.70 },
      axis: { x: 1, y: 0 },
      rotation: "right",
      engine: {
        model: "Yanmar 3YM30",
        powerKw: 21.3,
        idleRpm: 850,
        maxRpm: 3200,
        dynamics: REFERENCE_MECHANICS.engine
      },
      gearbox: {
        model: "KM2P-1",
        ratioAhead: 2.62,
        ratioAstern: 3.06,
        efficiency: 0.94,
        clutch: REFERENCE_MECHANICS.clutch
      },
      propeller: {
        diameter: REFERENCE_PROPELLER_SPEC.diameter,
        pitch: REFERENCE_PROPELLER_SPEC.pitch,
        blades: REFERENCE_PROPELLER_SPEC.blades,
        expandedAreaRatio: REFERENCE_PROPELLER_SPEC.expandedAreaRatio,
        shaft: REFERENCE_MECHANICS.shaft,
        fourQuadrant: createFourQuadrantTable(REFERENCE_PROPELLER_SPEC),
        safety: {
          maximumThrustCoefficient: 2.2,
          maximumTorqueCoefficient: 0.12
        }
      },
      transverseWalk: {
        base: 0.045,
        gain: 0.16
      }
    }],
    rudders: [{
      id: "spade-rudder",
      position: { x: -4.35, y: 0, z: -1.12 },
      axis: { x: 0, y: 0, z: 1 },
      stock: { chordFraction: 0.20 },
      area: 0.82,
      span: 1.18,
      aspectRatio: 1.38,
      maxAngleDeg: 35,
      coefficients: {
        efficiency: 0.72,
        cd0: 0.022,
        normalCd90: 1.12,
        stallStartDeg: 24,
        stallEndDeg: 52
      },
      slipstreamSources: ["shaft-propeller"],
      slipstream: {
        stripCount: 5,
        contractionRatio: 0.86,
        downstreamVelocityFactor: 0.55,
        upstreamVelocityFactor: 0.24,
        swirlFraction: 0.055,
        convectionTimeBoundsS: [0.05, 0.55],
        flowStraightening: 0.92,
        momentumSafetyFactor: 1.18
      }
    }],
    aerodynamics: {
      referenceWindHeight: 10,
      verticalProfile: {
        type: "bounded-power-law",
        exponent: 0.08,
        minimumVelocityFactor: 0.82,
        maximumVelocityFactor: 1.05
      },
      panels: aerodynamicPanels()
    },
    contacts: {
      fenderRadius: 0.175,
      hullRadius: 0.22,
      fenderStiffness: 48000,
      hullStiffness: 98000,
      dampingRatio: 0.82,
      friction: 0.30,
      hullFriction: 0.30,
      fenderFriction: 0.03,
      forceLimit: 90000,
      fenders: REFERENCE_FENDERS,
      hullEnvelope: contactEnvelopeFromGunwale(REFERENCE_GUNWALE, 0.22)
    },
    deckHardware: {
      cleats: REFERENCE_CLEATS
    },
    mooring: {
      maxLength: 20,
      maximumLinesPerBoatCleat: 2,
      maximumHaulInducedSpeed: 0.2 * KNOT,
      humanPullForce: 200,
      haulInRate: 1,
      payOutRate: 1.2,
      tautTolerance: 0.02,
      solverTolerance: 0.001,
      solverIterations: 8,
      elasticity: {
        workingStrain: 0.15,
        workingLoadN: 12000,
        dampingRatio: 0.35,
        hardeningGain: 8,
        maximumStrain: 0.20
      }
    },
    provenance: {
      values: {
        "geometry.loa": {
          sourceType: "official",
          source: "Jeanneau Sun Odyssey 36i inventory",
          unit: "m",
          uncertainty: 0
        },
        "geometry.gunwale": {
          sourceType: "calibrated",
          source: "Rail de fargue mesuré sur kjp_sun_odyssey_36i.glb après calage métrique KJP",
          unit: "m",
          uncertainty: 0.01,
          domain: "contour de contact émergé du bateau joueur"
        },
        "mass.displacement": {
          sourceType: "estimated",
          source: "Light displacement plus cruising load",
          unit: "kg",
          uncertainty: 0.08
        },
        "propulsors.0.engine": {
          sourceType: "official",
          source: "Yanmar 3YM30 / KM2P-1 documentation",
          unit: "mixed",
          uncertainty: 0
        },
        "propulsors.0.position.z": {
          sourceType: "estimated",
          source: "Photographies de carénage du Sun Odyssey 36i fournies dans la conversation KJP du 4 octobre 2026",
          unit: "m",
          uncertainty: 0.10,
          domain: "position verticale de l'axe d'hélice relativement au sommet du safran"
        },
        "rudders.0.stock.chordFraction": {
          sourceType: "estimated",
          source: "Photographies de carénage du Sun Odyssey 36i fournies dans la conversation KJP du 4 octobre 2026 ; position fixée à 20 % de corde par décision de profil KJP",
          unit: "fraction de corde depuis le bord d'attaque",
          uncertainty: 0.08,
          domain: "safran compensé ; géométrie équivalente à corde moyenne constante"
        },
        "steering": {
          sourceType: "estimated",
          source: "Configuration KJP du Sun Odyssey 36i",
          unit: "type,deg/s",
          uncertainty: 0.25,
          domain: "barre à roue ; vitesse maximale de safran conservée à 52°/s"
        },
        "aerodynamics.panels.geometry": {
          sourceType: "estimated",
          source: "Freeboard panels integrated from the versioned KJP gunwale; coachroof, boom and rig decomposition estimated from the published Sun Odyssey 36i profile/deck layout",
          unit: "m2,m",
          uncertainty: 0.2,
          domain: "bare cruising yacht, furled sails; freeboard surface is derived without a trajectory-dependent center shift"
        },
        "aerodynamics.panels.coefficients": {
          sourceType: "calibrated",
          source: "Bluff-body drag priors constrained by the USCG medium-displacement sailboat leeway envelope",
          unit: "dimensionless",
          uncertainty: 0.2,
          domain: "bare cruising yacht, furled sails, 6-20 kn apparent wind"
        },
        "hull.crossFlow": {
          sourceType: "literature",
          source: "Sectional cross-flow model; coefficients estimated for this hull",
          unit: "dimensionless",
          uncertainty: 0.2
        },
        "hull.crossFlow.linearDampingFroude": {
          sourceType: "literature",
          source: "Fossen linear/nonlinear damping structure; Hooft cross-flow drag at finite drift",
          unit: "dimensionless Froude prior",
          uncertainty: 0.2,
          domain: "deep-water harbour manoeuvring at low sway and yaw velocities"
        },
        "contacts.fenders": {
          sourceType: "estimated",
          source: "Cylindres tangents à la normale locale du rail de fargue avec précharge de 1 cm",
          unit: "m",
          uncertainty: 0.03,
          domain: "pare-battages de diamètre 0,35 m"
        },
        "contacts.fenderFriction": {
          sourceType: "calibrated",
          source: "Coefficient tangentiel effectif calé par contact rasant déterministe à 60/120/240 Hz",
          unit: "dimensionless",
          uncertainty: 0.5,
          domain: "roulement et suspension lâche d'un pare-battage cylindrique à basse vitesse"
        },
        "contacts.hullEnvelope": {
          sourceType: "calibrated",
          source: "Échantillons circulaires tangents au rail de fargue GLB versionné dans geometry.gunwale",
          unit: "m",
          uncertainty: 0.02,
          domain: "contacts portuaires 2D à basse vitesse"
        },
        "deckHardware.cleats": {
          sourceType: "calibrated",
          source: "Positions ramenées 7 cm à l'intérieur du rail de fargue local",
          unit: "m",
          uncertainty: 0.04,
          domain: "six points d'amarrage fonctionnels"
        },
        "mooring.elasticity": {
          sourceType: "calibrated",
          source: "Generic 14 mm polyester mooring line; 15% calibrated working strain at 30% of a 40 kN breaking load",
          unit: "strain,N",
          uncertainty: 0.25,
          domain: "cruising-yacht mooring at low speed; no rupture or chafe"
        }
      }
    }
  };

  const DUFOUR_310_GL_2014 = {
    schemaVersion: SCHEMA_VERSION,
    id: "dufour-310-gl-2014-deep-keel-experimental",
    version: "1.1.0",
    name: "Dufour 310 Grand Large 2014",
    modelClass: MODEL_CLASS,
    steering: {
      type: "wheel",
      maximumRudderRateDegS: 50
    },
    validity: {
      speedThroughWaterKn: [0, 4],
      minimumDepthToDraftRatio: 4,
      supportedPhysics: [
        "deep-water",
        "low-speed",
        "single-fixed-propeller",
        "twin-spade-rudder"
      ],
      excludedEffects: [
        "waves",
        "shallow-water",
        "squat",
        "bank-effect",
        "heel",
        "rudder-emergence"
      ]
    },
    geometry: {
      loa: 9.67,
      lwl: 8.70,
      lpp: 8.45,
      beam: 3.31,
      draft: 1.90,
      canoeDraft: 0.58,
      wettedArea: 24.5,
      gunwale: DUFOUR_310_GUNWALE,
      hullSections: scaledHullSections(
        8.70,
        0.58,
        DUFOUR_310_HULL_SECTION_SHAPES
      )
    },
    mass: {
      lightDisplacement: 4917,
      displacement: 5400,
      centerOfGravity: { x: 0, y: 0 },
      yawRadius: 2.18,
      addedMassModel: {
        type: "sectional-cross-flow",
        surgeMassRatio: 0.070,
        sectionalScale: 0.35
      }
    },
    hull: {
      axialResistance: {
        type: "linear-quadratic-wave-rise",
        surgeLinear: 82,
        surgeQuadratic: 78,
        waveRise: 30,
        waveOnset: 1.95
      },
      crossFlow: {
        type: "distributed-sections",
        cd: 1.08,
        areaFactor: 0.70,
        linearDampingFroude: 0.020
      }
    },
    appendages: [{
      id: "deep-fin-keel",
      type: "keel",
      position: { x: -0.05, y: 0, z: -1.16 },
      area: 2.65,
      span: 1.32,
      aspectRatio: 1.55,
      coefficients: {
        efficiency: 0.75,
        cd0: 0.018,
        normalCd90: 1.18,
        stallStartDeg: 24,
        stallEndDeg: 52
      }
    }],
    propulsors: [{
      id: "saildrive-propeller",
      type: "fixed-pitch-propeller",
      position: { x: -2.82, y: 0, z: -0.68 },
      axis: { x: 1, y: 0 },
      rotation: "right",
      engine: {
        model: "Volvo Penta D1-20",
        powerKw: 13.8,
        idleRpm: 850,
        maxRpm: 3200,
        dynamics: DUFOUR_310_MECHANICS.engine
      },
      gearbox: {
        model: "Volvo Penta 130S",
        ratioAhead: 2.19,
        ratioAstern: 2.19,
        efficiency: 0.94,
        clutch: DUFOUR_310_MECHANICS.clutch
      },
      propeller: {
        diameter: DUFOUR_310_PROPELLER_SPEC.diameter,
        pitch: DUFOUR_310_PROPELLER_SPEC.pitch,
        blades: DUFOUR_310_PROPELLER_SPEC.blades,
        expandedAreaRatio: DUFOUR_310_PROPELLER_SPEC.expandedAreaRatio,
        shaft: DUFOUR_310_MECHANICS.shaft,
        fourQuadrant: createFourQuadrantTable(DUFOUR_310_PROPELLER_SPEC),
        safety: {
          maximumThrustCoefficient: 2.2,
          maximumTorqueCoefficient: 0.12
        }
      },
      transverseWalk: { base: 0.035, gain: 0.13 }
    }],
    rudders: ["port", "starboard"].map(side => ({
      id: `rudder-${side}`,
      position: { x: -3.92, y: side === "port" ? -1.03 : 1.03, z: -0.76 },
      axis: { x: 0, y: 0, z: 1 },
      stock: { chordFraction: 0.24 },
      area: 0.31,
      span: 0.82,
      aspectRatio: 2.17,
      maxAngleDeg: 35,
      coefficients: {
        efficiency: 0.74,
        cd0: 0.022,
        normalCd90: 1.12,
        stallStartDeg: 24,
        stallEndDeg: 52
      },
      slipstreamSources: [],
      slipstream: {
        stripCount: 5,
        contractionRatio: 0.86,
        downstreamVelocityFactor: 0.55,
        upstreamVelocityFactor: 0.24,
        swirlFraction: 0.055,
        convectionTimeBoundsS: [0.05, 0.55],
        flowStraightening: 0.92,
        momentumSafetyFactor: 1.18
      }
    })),
    aerodynamics: {
      referenceWindHeight: 10,
      verticalProfile: {
        type: "bounded-power-law",
        exponent: 0.08,
        minimumVelocityFactor: 0.82,
        maximumVelocityFactor: 1.05
      },
      panels: aerodynamicPanels(DUFOUR_310_GUNWALE, 1, 1, 1, DUFOUR_310_SUPERSTRUCTURE)
    },
    contacts: {
      fenderRadius: 0.16,
      hullRadius: 0.20,
      fenderStiffness: 40000,
      hullStiffness: 81000,
      dampingRatio: 0.82,
      friction: 0.30,
      hullFriction: 0.30,
      fenderFriction: 0.03,
      forceLimit: 75000,
      fenders: DUFOUR_310_FENDERS,
      hullEnvelope: contactEnvelopeFromGunwale(DUFOUR_310_GUNWALE, 0.20)
    },
    deckHardware: { cleats: DUFOUR_310_CLEATS },
    mooring: {
      maxLength: 18,
      maximumLinesPerBoatCleat: 2,
      maximumHaulInducedSpeed: 0.2 * KNOT,
      humanPullForce: 200,
      haulInRate: 1,
      payOutRate: 1.2,
      tautTolerance: 0.02,
      solverTolerance: 0.001,
      solverIterations: 8,
      elasticity: {
        workingStrain: 0.15,
        workingLoadN: 10000,
        dampingRatio: 0.35,
        hardeningGain: 8,
        maximumStrain: 0.20
      }
    },
    provenance: {
      values: {
        "geometry.loa-beam-draft": {
          sourceType: "official",
          source: "Dufour 310 Grand Large owner manual (2014), p. 11",
          unit: "m",
          uncertainty: 0.01,
          domain: "deep-keel production version"
        },
        "geometry.lwl": {
          sourceType: "measured",
          source: "Voile Magazine, Dufour 310 Grand Large test, June 2014",
          unit: "m",
          uncertainty: 0.01
        },
        "geometry.gunwale-appendages": {
          sourceType: "estimated",
          source: "SailboatLab drawing digitised and rescaled to official LOA and beam",
          unit: "m,m2",
          uncertainty: 0.25,
          domain: "planar 3-DOF equivalent, upright vessel"
        },
        "mass.lightDisplacement": {
          sourceType: "official",
          source: "Dufour 310 Grand Large owner manual (2014), p. 11",
          unit: "kg",
          uncertainty: 0.03
        },
        "mass.displacement": {
          sourceType: "estimated",
          source: "4917 kg light + 150 kg crew + 160 kg water + 76 kg fuel + 100 kg equipment",
          unit: "kg",
          uncertainty: 0.08,
          domain: "light cruising load"
        },
        "mass.inertia-added-mass": {
          sourceType: "literature",
          source: "Independent low-speed sectional cross-flow estimates documented in docs/physics/dufour-310-gl-2014.md",
          unit: "mixed",
          uncertainty: 0.20
        },
        "hull.resistance": {
          sourceType: "estimated",
          source: "Independent displacement-hull harbour-speed prior documented for this profile",
          unit: "mixed",
          uncertainty: 0.25
        },
        "hull.crossFlow.linearDampingFroude": {
          sourceType: "literature",
          source: "Fossen linear/nonlinear damping structure with a profile-specific low-speed Froude prior",
          unit: "dimensionless Froude prior",
          uncertainty: 0.20,
          domain: "deep-water harbour manoeuvring at low sway and yaw velocities"
        },
        "propulsors.0.engine-gearbox": {
          sourceType: "official",
          source: "Volvo Penta D1-20/130S specifications; 13.8 kW confirmed by YACHT 7/2014",
          unit: "mixed",
          uncertainty: 0.02
        },
        "propulsors.0.propeller": {
          sourceType: "estimated",
          source: "Fixed two-blade D1-20/130S compatible geometry and four-quadrant literature prior",
          unit: "mixed",
          uncertainty: 0.25,
          domain: "not the folding propeller tested by Voile Magazine"
        },
        "rudders": {
          sourceType: "estimated",
          source: "SailboatLab drawing geometry; qualitative no-wash mechanism from YACHT twin-rudder special (2024)",
          unit: "mixed",
          uncertainty: 0.25,
          domain: "two independent planar rudders; no direct propeller slipstream"
        },
        "steering": {
          sourceType: "estimated",
          source: "Configuration KJP du Dufour 310 Grand Large 2014",
          unit: "type,deg/s",
          uncertainty: 0.25,
          domain: "barres à roue couplées ; vitesse maximale commune conservée à 50°/s"
        },
        "aerodynamics": {
          sourceType: "estimated",
          source: "Dufour-specific freeboard, coachroof and rig panels digitised from the rescaled drawing with bluff-body literature coefficients",
          unit: "mixed",
          uncertainty: 0.25
        },
        "contacts-deck-mooring": {
          sourceType: "calibrated",
          source: "Profile-specific planar geometry with KJP low-speed contact and polyester-line laws",
          unit: "mixed",
          uncertainty: 0.25
        }
      }
    }
  };

  // Sun Odyssey 24.2 : profil complet indépendant. Sources et incertitudes dans provenance.
  const SUN_ODYSSEY_24_2 = {
    "schemaVersion": SCHEMA_VERSION,
    "id": "sun-odyssey-24-2-fixed-keel-experimental",
    "version": "1.1.2",
    "name": "Sun Odyssey 24.2",
    "modelClass": "displacement-sailing-monohull",
    "steering": {
      "type": "tiller",
      "maximumRudderRateDegS": 100
    },
    "validity": {
      "speedThroughWaterKn": [
        0,
        4
      ],
      "minimumDepthToDraftRatio": 4,
      "supportedPhysics": [
        "deep-water",
        "low-speed",
        "single-fixed-propeller",
        "single-rudder"
      ],
      "excludedEffects": [
        "waves",
        "shallow-water",
        "squat",
        "bank-effect",
        "heel",
        "rudder-emergence",
        "appendage-interaction",
        "propeller-folding"
      ]
    },
    "geometry": {
      "loa": 7.3,
      "lwl": 6.61,
      "lpp": 6.35,
      "beam": 2.49,
      "draft": 1.1,
      "canoeDraft": 0.43,
      "wettedArea": 16.8,
      "gunwale": [
        {
          "x": -3.5,
          "halfBeam": 0.78,
          "z": 0.78
        },
        {
          "x": -3.1,
          "halfBeam": 1.04,
          "z": 0.76
        },
        {
          "x": -2.35,
          "halfBeam": 1.18,
          "z": 0.74
        },
        {
          "x": -1.45,
          "halfBeam": 1.245,
          "z": 0.73
        },
        {
          "x": -0.4,
          "halfBeam": 1.23,
          "z": 0.74
        },
        {
          "x": 0.65,
          "halfBeam": 1.13,
          "z": 0.77
        },
        {
          "x": 1.6,
          "halfBeam": 0.92,
          "z": 0.81
        },
        {
          "x": 2.35,
          "halfBeam": 0.64,
          "z": 0.85
        },
        {
          "x": 2.95,
          "halfBeam": 0.34,
          "z": 0.9
        },
        {
          "x": 3.4,
          "halfBeam": 0.08,
          "z": 0.93
        },
        {
          "x": 3.6,
          "halfBeam": 0,
          "z": 0.94
        }
      ],
      "hullSections": [
        {
          "x": -3.004545454545455,
          "dx": 0.600909090909091,
          "breadthFactor": 0.6,
          "immersedDepth": 0.33712000000000003,
          "shape": 0.6
        },
        {
          "x": -2.403636363636364,
          "dx": 0.600909090909091,
          "breadthFactor": 0.79,
          "immersedDepth": 0.381238,
          "shape": 0.79
        },
        {
          "x": -1.8027272727272727,
          "dx": 0.600909090909091,
          "breadthFactor": 0.93,
          "immersedDepth": 0.41374600000000006,
          "shape": 0.93
        },
        {
          "x": -1.2018181818181817,
          "dx": 0.600909090909091,
          "breadthFactor": 1,
          "immersedDepth": 0.43,
          "shape": 1
        },
        {
          "x": -0.6009090909090911,
          "dx": 0.600909090909091,
          "breadthFactor": 0.98,
          "immersedDepth": 0.425356,
          "shape": 0.98
        },
        {
          "x": 0.0,
          "dx": 0.600909090909091,
          "breadthFactor": 0.92,
          "immersedDepth": 0.411424,
          "shape": 0.92
        },
        {
          "x": 0.6009090909090911,
          "dx": 0.600909090909091,
          "breadthFactor": 0.8,
          "immersedDepth": 0.38356000000000007,
          "shape": 0.8
        },
        {
          "x": 1.2018181818181817,
          "dx": 0.600909090909091,
          "breadthFactor": 0.64,
          "immersedDepth": 0.34640800000000005,
          "shape": 0.64
        },
        {
          "x": 1.8027272727272732,
          "dx": 0.600909090909091,
          "breadthFactor": 0.46,
          "immersedDepth": 0.304612,
          "shape": 0.46
        },
        {
          "x": 2.403636363636364,
          "dx": 0.600909090909091,
          "breadthFactor": 0.28,
          "immersedDepth": 0.26281600000000005,
          "shape": 0.28
        },
        {
          "x": 3.0045454545454544,
          "dx": 0.600909090909091,
          "breadthFactor": 0.12,
          "immersedDepth": 0.225664,
          "shape": 0.12
        }
      ]
    },
    "mass": {
      "lightDisplacement": 1830,
      "displacement": 2100,
      "centerOfGravity": { "x": 0, "y": 0 },
      "yawRadius": 1.61,
      "addedMassModel": {
        "type": "sectional-cross-flow",
        "surgeMassRatio": 0.065,
        "sectionalScale": 0.31
      }
    },
    "hull": {
      "axialResistance": {
        "type": "linear-quadratic-wave-rise",
        "surgeLinear": 48,
        "surgeQuadratic": 51,
        "waveRise": 18,
        "waveOnset": 1.78
      },
      "crossFlow": {
        "type": "distributed-sections",
        "cd": 1.07,
        "areaFactor": 0.69,
        "linearDampingFroude": 0.019
      }
    },
    "appendages": [
      {
        "id": "bulb-fin",
        "type": "keel",
        "position": { "x": -0.1, "y": 0, "z": -0.76 },
        "area": 1.24,
        "span": 0.67,
        "aspectRatio": 0.85,
        "coefficients": {
          "efficiency": 0.72,
          "cd0": 0.02,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      }
    ],
    "propulsors": [
      {
        "id": "shaft-propeller",
        "type": "fixed-pitch-propeller",
        "position": { "x": -2.25, "y": 0, "z": -0.52 },
        "axis": { "x": 1, "y": 0 },
        "rotation": "right",
        "engine": {
          "model": "Yanmar 1GM10 / KM2P compatible",
          "powerKw": 6.6,
          "idleRpm": 850,
          "maxRpm": 3600,
          "dynamics": {
            "inertiaKgM2": 0.07,
            "frictionNm": 1.8,
            "governorKpNmPerRadS": 0.84,
            "governorKiNmPerRad": 0.64,
            "torqueCurve": [
              {
                "rpm": 850,
                "torqueNm": 12.605071492878112
              },
              {
                "rpm": 1500,
                "torqueNm": 16.80676199050415
              },
              {
                "rpm": 2200,
                "torqueNm": 19.25774811411934
              },
              {
                "rpm": 2800,
                "torqueNm": 18.557466364515
              },
              {
                "rpm": 3600,
                "torqueNm": 17.50704374010849
              }
            ]
          }
        },
        "gearbox": {
          "model": "KM2P compatible",
          "ratioAhead": 2.62,
          "ratioAstern": 3.06,
          "efficiency": 0.94,
          "clutch": {
            "capacityEngineNm": 28.886622171179006,
            "stiffnessNmPerRadS": 0.82,
            "disengageTimeS": 0.12,
            "neutralDwellS": 0.18,
            "engageTimeS": 0.36
          }
        },
        "propeller": {
          "diameter": 0.305,
          "pitch": 0.229,
          "blades": 2,
          "expandedAreaRatio": 0.35,
          "shaft": {
            "inertiaKgM2": 0.012,
            "viscousFrictionNmPerRadS": 0.018,
            "coulombFrictionNm": 0.18
          },
          "fourQuadrant": createFourQuadrantTable({"diameter": 0.305, "pitch": 0.229, "blades": 2, "expandedAreaRatio": 0.35, "ktAhead": 0.165, "ktAstern": 0.115, "ktAdvanceAhead": 0.09, "ktAdvanceAstern": 0.048, "ktWindmill": 0.031, "cqAhead": 0.0152, "cqAstern": 0.0172, "cqWindmill": 0.0102, "source": "Prior propre Sun Odyssey 24.2 ; non calibré sur essai hélice", "uncertainty": 0.25}),
          "safety": {
            "maximumThrustCoefficient": 2.2,
            "maximumTorqueCoefficient": 0.12
          }
        },
        "transverseWalk": {
          "base": 0.032,
          "gain": 0.125
        }
      }
    ],
    "rudders": [
      {
        "id": "spade-rudder",
        "position": { "x": -2.95, "y": 0, "z": -0.64 },
        "area": 0.39,
        "span": 0.75,
        "aspectRatio": 1.44,
        "coefficients": {
          "efficiency": 0.72,
          "cd0": 0.022,
          "normalCd90": 1.12,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        },
        "axis": { "x": 0, "y": 0, "z": 1 },
        "stock": {
          "chordFraction": 0.18
        },
        "maxAngleDeg": 35,
        "slipstreamSources": [
          "shaft-propeller"
        ],
        "slipstream": {
          "stripCount": 5,
          "contractionRatio": 0.86,
          "downstreamVelocityFactor": 0.55,
          "upstreamVelocityFactor": 0.24,
          "swirlFraction": 0.055,
          "convectionTimeBoundsS": [
            0.05,
            0.55
          ],
          "flowStraightening": 0.92,
          "momentumSafetyFactor": 1.18
        }
      }
    ],
    "aerodynamics": {
      "referenceWindHeight": 10,
      "verticalProfile": {
        "type": "bounded-power-law",
        "exponent": 0.08,
        "minimumVelocityFactor": 0.82,
        "maximumVelocityFactor": 1.05
      },
      "panels": aerodynamicPanels([{"x": -3.5, "halfBeam": 0.78, "z": 0.78}, {"x": -3.1, "halfBeam": 1.04, "z": 0.76}, {"x": -2.35, "halfBeam": 1.18, "z": 0.74}, {"x": -1.45, "halfBeam": 1.245, "z": 0.73}, {"x": -0.4, "halfBeam": 1.23, "z": 0.74}, {"x": 0.65, "halfBeam": 1.13, "z": 0.77}, {"x": 1.6, "halfBeam": 0.92, "z": 0.81}, {"x": 2.35, "halfBeam": 0.64, "z": 0.85}, {"x": 2.95, "halfBeam": 0.34, "z": 0.9}, {"x": 3.4, "halfBeam": 0.08, "z": 0.93}, {"x": 3.6, "halfBeam": 0, "z": 0.94}], 1, 1, 1, {"sides": [["coachroof-aft-starboard", 1.45, -0.08, 0.997, -0.7, 0.56, 1.3], ["coachroof-aft-port", 1.45, -0.08, -0.997, -0.7, -0.56, 1.3], ["coachroof-fore-starboard", 0.85, 0.12, 0.993, 0.85, 0.46, 1.35], ["coachroof-fore-port", 0.85, 0.12, -0.993, 0.85, -0.46, 1.35], ["boom-starboard", 0.55, 0, 1, -0.12, 0.12, 2.3, 0.92], ["boom-port", 0.55, 0, -1, -0.12, -0.12, 2.3, 0.92]], "rig": {"area": 1.15, "x": 0.2, "z": 3.9}})
    },
    "contacts": {
      "fenderRadius": 0.14,
      "hullRadius": 0.15,
      "fenderStiffness": 24000,
      "hullStiffness": 48000,
      "dampingRatio": 0.82,
      "friction": 0.3,
      "hullFriction": 0.3,
      "fenderFriction": 0.03,
      "forceLimit": 45000,
      "fenders": [
        {
          "id": "fender-bow-port",
          "position": { "x": 2.245468041514768, "y": -0.8177893969145563, "z": 0.30000000000000004 },
          "attachment": { "x": 2.2, "y": -0.696, "z": 0.842 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-mid-port",
          "position": { "x": 0.01232518204163942, "y": -1.3213191733419756, "z": 0.30000000000000004 },
          "attachment": { "x": 0, "y": -1.1919047619047618, "z": 0.7514285714285714 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-stern-port",
          "position": { "x": -2.423854624703375, "y": -1.2984592990061763, "z": 0.30000000000000004 },
          "attachment": { "x": -2.4, "y": -1.1706666666666665, "z": 0.7413333333333333 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-bow-starboard",
          "position": { "x": 2.245468041514768, "y": 0.8177893969145563, "z": 0.30000000000000004 },
          "attachment": { "x": 2.2, "y": 0.696, "z": 0.842 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-mid-starboard",
          "position": { "x": 0.01232518204163942, "y": 1.3213191733419756, "z": 0.30000000000000004 },
          "attachment": { "x": 0, "y": 1.1919047619047618, "z": 0.7514285714285714 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-stern-starboard",
          "position": { "x": -2.423854624703375, "y": 1.2984592990061763, "z": 0.30000000000000004 },
          "attachment": { "x": -2.4, "y": 1.1706666666666665, "z": 0.7413333333333333 },
          "side": "starboard",
          "preload": 0.01
        }
      ],
      "hullEnvelope": [
        {
          "id": "hull-port-0",
          "position": { "x": -3.4182517474106877, "y": -0.6542334575549045 },
          "radius": 0.15,
          "reference": { "x": -3.5, "y": -0.78 }
        },
        {
          "id": "hull-port-1",
          "position": { "x": -3.018251747410688, "y": -0.9142334575549045 },
          "radius": 0.15,
          "reference": { "x": -3.1, "y": -1.04 }
        },
        {
          "id": "hull-port-2",
          "position": { "x": -2.322475433034567, "y": -1.0325469626851809 },
          "radius": 0.15,
          "reference": { "x": -2.35, "y": -1.18 }
        },
        {
          "id": "hull-port-3",
          "position": { "x": -1.439194810216612, "y": -1.095389679922323 },
          "radius": 0.15,
          "reference": { "x": -1.45, "y": -1.245 }
        },
        {
          "id": "hull-port-4",
          "position": { "x": -0.40214263851742754, "y": -1.0800153037800735 },
          "radius": 0.15,
          "reference": { "x": -0.4, "y": -1.23 }
        },
        {
          "id": "hull-port-5",
          "position": { "x": 0.6357786361058007, "y": -0.980675679110907 },
          "radius": 0.15,
          "reference": { "x": 0.65, "y": -1.13 }
        },
        {
          "id": "hull-port-6",
          "position": { "x": 1.5676236934297831, "y": -0.7735357559918759 },
          "radius": 0.15,
          "reference": { "x": 1.6, "y": -0.92 }
        },
        {
          "id": "hull-port-7",
          "position": { "x": 2.2975368751752683, "y": -0.49947377279089644 },
          "radius": 0.15,
          "reference": { "x": 2.35, "y": -0.64 }
        },
        {
          "id": "hull-port-8",
          "position": { "x": 2.8829179606750066, "y": -0.20583592135001266 },
          "radius": 0.15,
          "reference": { "x": 2.95, "y": -0.34 }
        },
        {
          "id": "hull-starboard-0",
          "position": { "x": -3.4182517474106877, "y": 0.6542334575549045 },
          "radius": 0.15,
          "reference": { "x": -3.5, "y": 0.78 }
        },
        {
          "id": "hull-starboard-1",
          "position": { "x": -3.018251747410688, "y": 0.9142334575549045 },
          "radius": 0.15,
          "reference": { "x": -3.1, "y": 1.04 }
        },
        {
          "id": "hull-starboard-2",
          "position": { "x": -2.322475433034567, "y": 1.0325469626851809 },
          "radius": 0.15,
          "reference": { "x": -2.35, "y": 1.18 }
        },
        {
          "id": "hull-starboard-3",
          "position": { "x": -1.439194810216612, "y": 1.095389679922323 },
          "radius": 0.15,
          "reference": { "x": -1.45, "y": 1.245 }
        },
        {
          "id": "hull-starboard-4",
          "position": { "x": -0.40214263851742754, "y": 1.0800153037800735 },
          "radius": 0.15,
          "reference": { "x": -0.4, "y": 1.23 }
        },
        {
          "id": "hull-starboard-5",
          "position": { "x": 0.6357786361058007, "y": 0.980675679110907 },
          "radius": 0.15,
          "reference": { "x": 0.65, "y": 1.13 }
        },
        {
          "id": "hull-starboard-6",
          "position": { "x": 1.5676236934297831, "y": 0.7735357559918759 },
          "radius": 0.15,
          "reference": { "x": 1.6, "y": 0.92 }
        },
        {
          "id": "hull-starboard-7",
          "position": { "x": 2.2975368751752683, "y": 0.49947377279089644 },
          "radius": 0.15,
          "reference": { "x": 2.35, "y": 0.64 }
        },
        {
          "id": "hull-starboard-8",
          "position": { "x": 2.8829179606750066, "y": 0.20583592135001266 },
          "radius": 0.15,
          "reference": { "x": 2.95, "y": 0.34 }
        },
        {
          "id": "hull-transom-0",
          "position": { "x": -3.35, "y": -0.63 },
          "radius": 0.15,
          "reference": { "x": -3.5, "y": -0.63 }
        },
        {
          "id": "hull-transom-1",
          "position": { "x": -3.35, "y": 0 },
          "radius": 0.15,
          "reference": { "x": -3.5, "y": 0 }
        },
        {
          "id": "hull-transom-2",
          "position": { "x": -3.35, "y": 0.63 },
          "radius": 0.15,
          "reference": { "x": -3.5, "y": 0.63 }
        },
        {
          "id": "hull-bow",
          "position": { "x": 3.45, "y": 0 },
          "radius": 0.15,
          "reference": { "x": 3.6, "y": 0 }
        }
      ]
    },
    "deckHardware": {
      "cleats": [
        {
          "id": "bow-port",
          "position": { "x": 2.768695048315003, "y": -0.35239009663000603, "z": 0.9275 },
          "attachment": { "x": 2.8, "y": -0.41500000000000015, "z": 0.8875 },
          "side": "port",
          "station": "bow"
        },
        {
          "id": "stern-port",
          "position": { "x": -2.9371552020827982, "y": -0.9991885825864179, "z": 0.796 },
          "attachment": { "x": -2.95, "y": -1.068, "z": 0.756 },
          "side": "port",
          "station": "stern"
        },
        {
          "id": "bow-starboard",
          "position": { "x": 2.768695048315003, "y": 0.35239009663000603, "z": 0.9275 },
          "attachment": { "x": 2.8, "y": 0.41500000000000015, "z": 0.8875 },
          "side": "starboard",
          "station": "bow"
        },
        {
          "id": "stern-starboard",
          "position": { "x": -2.9371552020827982, "y": 0.9991885825864179, "z": 0.796 },
          "attachment": { "x": -2.95, "y": 1.068, "z": 0.756 },
          "side": "starboard",
          "station": "stern"
        }
      ]
    },
    "mooring": {
      "maxLength": 15,
      "maximumLinesPerBoatCleat": 2,
      "maximumHaulInducedSpeed": 0.1028888,
      "humanPullForce": 200,
      "haulInRate": 1,
      "payOutRate": 1.2,
      "tautTolerance": 0.02,
      "solverTolerance": 0.001,
      "solverIterations": 8,
      "elasticity": {
        "workingStrain": 0.15,
        "workingLoadN": 6000,
        "dampingRatio": 0.35,
        "hardeningGain": 8,
        "maximumStrain": 0.2
      }
    },
    "provenance": {
      "values": {
        "geometry": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "m,m2",
          "uncertainty": 0.25,
          "method": "Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "kg,m",
          "uncertainty": 0.2,
          "method": "Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "N/(m/s),N/(m/s)^2,dimensionless",
          "uncertainty": 0.3,
          "method": "Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "appendages": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "rudders": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "m,m2,deg,deg/s",
          "uncertainty": 0.25,
          "method": "Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "steering": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "type,deg/s",
          "uncertainty": 0.25,
          "method": "Barre franche identifiée visuellement ; réglage KJP demandé : vitesse maximale de 100°/s ; estimation non calibrée sur essai réel",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "aerodynamics": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "contacts": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "m,N/m,N,dimensionless",
          "uncertainty": 0.25,
          "method": "Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "deckHardware": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.15,
          "method": "Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mooring": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.loa": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.jeanneau.com/fr/bateaux/voilier/2-sun-odyssey/486-sun-odyssey-24-2",
          "page": "Spécifications ; plan Fauroux, version quillard inboard",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.beam": {
  "sourceType": "literature",
  "evidenceClass": "B",
  "source": "https://sailboatdata.com/sailboat/sun-odyssey-242-jeanneau/",
  "page": "Sailboat Specifications",
  "unit": "m",
  "uncertainty": 0.03,
  "method": "Largeur technique secondaire 2,49 m ; absente de la page constructeur actuelle",
  "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
},
        "geometry.draft": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.jeanneau.com/fr/bateaux/voilier/2-sun-odyssey/486-sun-odyssey-24-2",
          "page": "Spécifications ; plan Fauroux, version quillard inboard",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.lightDisplacement": {
  "sourceType": "estimated",
  "evidenceClass": "E",
  "source": "https://www.jeanneau.com/fr/bateaux/voilier/2-sun-odyssey/486-sun-odyssey-24-2",
  "page": "Spécifications ; plan Fauroux, version quillard inboard",
  "unit": "kg",
  "uncertainty": 0.08,
  "method": "Poids constructeur 1830 kg ; interprétation en référence lège inboard incertaine, divergence technique 1905 kg conservée",
  "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
},
        "mass.displacement": {
          "sourceType": "estimated",
          "evidenceClass": "C",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "kg",
          "uncertainty": 0.08,
          "method": "Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.yawRadius": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/sun-odyssey-24-2-fixed-keel.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.2,
          "method": "Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.addedMassModel": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.25,
          "method": "Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull.crossFlow.linearDampingFroude": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.2,
          "method": "Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL)",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors.0.engine.powerKw": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.yanmar.com/marine/product/engines/1gm10-marine-diesel-engine/",
          "page": "Spécifications moteur",
          "unit": "kW",
          "uncertainty": 0.03,
          "method": "Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        }
      }
    }
  };

  // Contessa 26 : profil complet indépendant. Sources et incertitudes dans provenance.
  const CONTESSA_26 = {
    "schemaVersion": SCHEMA_VERSION,
    "id": "contessa-26-long-keel-experimental",
    "version": "1.1.2",
    "name": "Contessa 26",
    "modelClass": "displacement-sailing-monohull",
    "steering": {
      "type": "tiller",
      "maximumRudderRateDegS": 100
    },
    "validity": {
      "speedThroughWaterKn": [
        0,
        4
      ],
      "minimumDepthToDraftRatio": 4,
      "supportedPhysics": [
        "deep-water",
        "low-speed",
        "single-fixed-propeller",
        "single-rudder"
      ],
      "excludedEffects": [
        "waves",
        "shallow-water",
        "squat",
        "bank-effect",
        "heel",
        "rudder-emergence",
        "appendage-interaction",
        "propeller-folding"
      ]
    },
    "geometry": {
      "loa": 7.77,
      "lwl": 6.08,
      "lpp": 5.95,
      "beam": 2.28,
      "draft": 1.21,
      "canoeDraft": 0.4,
      "wettedArea": 19.5,
      "gunwale": [
        {
          "x": -3.75,
          "halfBeam": 0.32,
          "z": 0.72
        },
        {
          "x": -3.2,
          "halfBeam": 0.62,
          "z": 0.68
        },
        {
          "x": -2.5,
          "halfBeam": 0.88,
          "z": 0.64
        },
        {
          "x": -1.6,
          "halfBeam": 1.08,
          "z": 0.61
        },
        {
          "x": -0.6,
          "halfBeam": 1.14,
          "z": 0.6
        },
        {
          "x": 0.4,
          "halfBeam": 1.1,
          "z": 0.62
        },
        {
          "x": 1.4,
          "halfBeam": 0.94,
          "z": 0.67
        },
        {
          "x": 2.25,
          "halfBeam": 0.69,
          "z": 0.74
        },
        {
          "x": 2.95,
          "halfBeam": 0.41,
          "z": 0.83
        },
        {
          "x": 3.55,
          "halfBeam": 0.13,
          "z": 0.91
        },
        {
          "x": 4.02,
          "halfBeam": 0,
          "z": 0.96
        }
      ],
      "hullSections": [
        {
          "x": -2.7636363636363637,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.23,
          "immersedDepth": 0.23368000000000003,
          "shape": 0.23
        },
        {
          "x": -2.210909090909091,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.46,
          "immersedDepth": 0.28336,
          "shape": 0.46
        },
        {
          "x": -1.6581818181818182,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.69,
          "immersedDepth": 0.33304,
          "shape": 0.69
        },
        {
          "x": -1.1054545454545455,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.86,
          "immersedDepth": 0.3697600000000001,
          "shape": 0.86
        },
        {
          "x": -0.5527272727272727,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.97,
          "immersedDepth": 0.39352000000000004,
          "shape": 0.97
        },
        {
          "x": 0.0,
          "dx": 0.5527272727272727,
          "breadthFactor": 1,
          "immersedDepth": 0.4,
          "shape": 1
        },
        {
          "x": 0.5527272727272727,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.97,
          "immersedDepth": 0.39352000000000004,
          "shape": 0.97
        },
        {
          "x": 1.1054545454545455,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.86,
          "immersedDepth": 0.3697600000000001,
          "shape": 0.86
        },
        {
          "x": 1.6581818181818182,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.68,
          "immersedDepth": 0.33088000000000006,
          "shape": 0.68
        },
        {
          "x": 2.210909090909091,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.45,
          "immersedDepth": 0.28120000000000006,
          "shape": 0.45
        },
        {
          "x": 2.7636363636363637,
          "dx": 0.5527272727272727,
          "breadthFactor": 0.2,
          "immersedDepth": 0.22720000000000004,
          "shape": 0.2
        }
      ]
    },
    "mass": {
      "lightDisplacement": 2250,
      "displacement": 2500,
      "centerOfGravity": { "x": 0, "y": 0 },
      "yawRadius": 1.76,
      "addedMassModel": {
        "type": "sectional-cross-flow",
        "surgeMassRatio": 0.085,
        "sectionalScale": 0.39
      }
    },
    "hull": {
      "axialResistance": {
        "type": "linear-quadratic-wave-rise",
        "surgeLinear": 65,
        "surgeQuadratic": 68,
        "waveRise": 22,
        "waveOnset": 1.67
      },
      "crossFlow": {
        "type": "distributed-sections",
        "cd": 1.1,
        "areaFactor": 0.73,
        "linearDampingFroude": 0.02
      }
    },
    "appendages": [
      {
        "id": "long-keel-1",
        "type": "keel",
        "position": { "x": -2.7513761732020487, "y": 0, "z": -0.7465061131264273 },
        "area": 0.526720238095238,
        "span": 0.81,
        "aspectRatio": 0.20068823124569868,
        "coefficients": {
          "efficiency": 0.62,
          "cd0": 0.022,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      },
      {
        "id": "long-keel-2",
        "type": "keel",
        "position": { "x": -2.0023979521277933, "y": 0, "z": -0.8036261064959095 },
        "area": 0.6169226190476191,
        "span": 0.81,
        "aspectRatio": 0.20068823124569868,
        "coefficients": {
          "efficiency": 0.62,
          "cd0": 0.022,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      },
      {
        "id": "long-keel-3",
        "type": "keel",
        "position": { "x": -1.2392857142857148, "y": 0, "z": -0.8049999999999998 },
        "area": 0.6190714285714282,
        "span": 0.81,
        "aspectRatio": 0.20068823124569868,
        "coefficients": {
          "efficiency": 0.62,
          "cd0": 0.022,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      },
      {
        "id": "long-keel-4",
        "type": "keel",
        "position": { "x": -0.48580660263880215, "y": 0, "z": -0.7848439177254757 },
        "area": 0.5867889795918371,
        "span": 0.81,
        "aspectRatio": 0.20068823124569868,
        "coefficients": {
          "efficiency": 0.62,
          "cd0": 0.022,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      },
      {
        "id": "long-keel-5",
        "type": "keel",
        "position": { "x": 0.272654158403097, "y": 0, "z": -0.7089307316620402 },
        "area": 0.4695535860058312,
        "span": 0.81,
        "aspectRatio": 0.20068823124569868,
        "coefficients": {
          "efficiency": 0.62,
          "cd0": 0.022,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      },
      {
        "id": "long-keel-6",
        "type": "keel",
        "position": { "x": 1.020489482200647, "y": 0, "z": -0.614930073971336 },
        "area": 0.32131195335276913,
        "span": 0.81,
        "aspectRatio": 0.20068823124569868,
        "coefficients": {
          "efficiency": 0.62,
          "cd0": 0.022,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      },
      {
        "id": "long-keel-7",
        "type": "keel",
        "position": { "x": 1.695990116674409, "y": 0, "z": -0.5101744104965615 },
        "area": 0.1288811953352773,
        "span": 0.81,
        "aspectRatio": 0.20068823124569868,
        "coefficients": {
          "efficiency": 0.62,
          "cd0": 0.022,
          "normalCd90": 1.16,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      }
    ],
    "propulsors": [
      {
        "id": "shaft-propeller",
        "type": "fixed-pitch-propeller",
        "position": { "x": -2.8, "y": 0, "z": -0.73 },
        "axis": { "x": 1, "y": 0 },
        "rotation": "left",
        "engine": {
          "model": "Yanmar YS8 / inverseur intégré 2:1",
          "powerKw": 5.884,
          "idleRpm": 800,
          "maxRpm": 3200,
          "dynamics": {
            "inertiaKgM2": 0.07,
            "frictionNm": 1.8,
            "governorKpNmPerRadS": 0.84,
            "governorKiNmPerRad": 0.64,
            "torqueCurve": [
              {
                "rpm": 800,
                "torqueNm": 12.642313749561614
              },
              {
                "rpm": 1500,
                "torqueNm": 16.85641833274882
              },
              {
                "rpm": 2200,
                "torqueNm": 19.31464600627469
              },
              {
                "rpm": 2800,
                "torqueNm": 18.612295242410156
              },
              {
                "rpm": 3200,
                "torqueNm": 17.558769096613354
              }
            ]
          }
        },
        "gearbox": {
          "model": "inverseur intégré 2:1",
          "ratioAhead": 2,
          "ratioAstern": 2,
          "efficiency": 0.94,
          "clutch": {
            "capacityEngineNm": 28.97196900941203,
            "stiffnessNmPerRadS": 0.82,
            "disengageTimeS": 0.12,
            "neutralDwellS": 0.18,
            "engageTimeS": 0.36
          }
        },
        "propeller": {
          "diameter": 0.305,
          "pitch": 0.229,
          "blades": 2,
          "expandedAreaRatio": 0.34,
          "shaft": {
            "inertiaKgM2": 0.012,
            "viscousFrictionNmPerRadS": 0.018,
            "coulombFrictionNm": 0.18
          },
          "fourQuadrant": createFourQuadrantTable({"diameter": 0.305, "pitch": 0.229, "blades": 2, "expandedAreaRatio": 0.34, "ktAhead": 0.155, "ktAstern": 0.105, "ktAdvanceAhead": 0.085, "ktAdvanceAstern": 0.044, "ktWindmill": 0.03, "cqAhead": 0.0145, "cqAstern": 0.0165, "cqWindmill": 0.0098, "source": "Prior propre Contessa 26 ; non calibré sur essai hélice", "uncertainty": 0.25}),
          "safety": {
            "maximumThrustCoefficient": 2.2,
            "maximumTorqueCoefficient": 0.12
          }
        },
        "transverseWalk": {
          "base": 0.045,
          "gain": 0.15
        }
      }
    ],
    "rudders": [
      {
        "id": "keel-hung-rudder",
        "position": { "x": -3.42, "y": 0, "z": -0.77 },
        "area": 0.43,
        "span": 0.82,
        "aspectRatio": 1.56,
        "coefficients": {
          "efficiency": 0.6,
          "cd0": 0.022,
          "normalCd90": 1.12,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        },
        "axis": { "x": 0, "y": 0, "z": 1 },
        "stock": {
          "chordFraction": 0.02
        },
        "maxAngleDeg": 35,
        "slipstreamSources": [
          "shaft-propeller"
        ],
        "slipstream": {
          "stripCount": 5,
          "contractionRatio": 0.86,
          "downstreamVelocityFactor": 0.55,
          "upstreamVelocityFactor": 0.24,
          "swirlFraction": 0.055,
          "convectionTimeBoundsS": [
            0.05,
            0.55
          ],
          "flowStraightening": 0.92,
          "momentumSafetyFactor": 1.18
        }
      }
    ],
    "aerodynamics": {
      "referenceWindHeight": 10,
      "verticalProfile": {
        "type": "bounded-power-law",
        "exponent": 0.08,
        "minimumVelocityFactor": 0.82,
        "maximumVelocityFactor": 1.05
      },
      "panels": aerodynamicPanels([{"x": -3.75, "halfBeam": 0.32, "z": 0.72}, {"x": -3.2, "halfBeam": 0.62, "z": 0.68}, {"x": -2.5, "halfBeam": 0.88, "z": 0.64}, {"x": -1.6, "halfBeam": 1.08, "z": 0.61}, {"x": -0.6, "halfBeam": 1.14, "z": 0.6}, {"x": 0.4, "halfBeam": 1.1, "z": 0.62}, {"x": 1.4, "halfBeam": 0.94, "z": 0.67}, {"x": 2.25, "halfBeam": 0.69, "z": 0.74}, {"x": 2.95, "halfBeam": 0.41, "z": 0.83}, {"x": 3.55, "halfBeam": 0.13, "z": 0.91}, {"x": 4.02, "halfBeam": 0, "z": 0.96}], 1, 1, 1, {"sides": [["coachroof-aft-starboard", 0.95, -0.06, 0.998, -0.65, 0.46, 1.13], ["coachroof-aft-port", 0.95, -0.06, -0.998, -0.65, -0.46, 1.13], ["coachroof-fore-starboard", 0.7, 0.1, 0.995, 0.7, 0.4, 1.18], ["coachroof-fore-port", 0.7, 0.1, -0.995, 0.7, -0.4, 1.18], ["boom-starboard", 0.52, 0, 1, -0.1, 0.11, 2.1, 0.92], ["boom-port", 0.52, 0, -1, -0.1, -0.11, 2.1, 0.92]], "rig": {"area": 1.1, "x": 0.12, "z": 3.7}})
    },
    "contacts": {
      "fenderRadius": 0.14,
      "hullRadius": 0.14,
      "fenderStiffness": 26000,
      "hullStiffness": 52000,
      "dampingRatio": 0.82,
      "friction": 0.3,
      "hullFriction": 0.3,
      "fenderFriction": 0.03,
      "forceLimit": 48000,
      "fenders": [
        {
          "id": "fender-bow-port",
          "position": { "x": 2.2866816221189015, "y": -0.8147175152042652, "z": 0.30000000000000004 },
          "attachment": { "x": 2.25, "y": -0.69, "z": 0.74 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-mid-port",
          "position": { "x": -0.09480415501464673, "y": -1.2498961246338327, "z": 0.30000000000000004 },
          "attachment": { "x": -0.1, "y": -1.12, "z": 0.61 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-stern-port",
          "position": { "x": -2.3282009595164253, "y": -1.0513487622683584, "z": 0.30000000000000004 },
          "attachment": { "x": -2.3, "y": -0.9244444444444445, "z": 0.6333333333333333 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-bow-starboard",
          "position": { "x": 2.2866816221189015, "y": 0.8147175152042652, "z": 0.30000000000000004 },
          "attachment": { "x": 2.25, "y": 0.69, "z": 0.74 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-mid-starboard",
          "position": { "x": -0.09480415501464673, "y": 1.2498961246338327, "z": 0.30000000000000004 },
          "attachment": { "x": -0.1, "y": 1.12, "z": 0.61 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-stern-starboard",
          "position": { "x": -2.3282009595164253, "y": 1.0513487622683584, "z": 0.30000000000000004 },
          "attachment": { "x": -2.3, "y": 0.9244444444444445, "z": 0.6333333333333333 },
          "side": "starboard",
          "preload": 0.01
        }
      ],
      "hullEnvelope": [
        {
          "id": "hull-port-0",
          "position": { "x": -3.6829607017047197, "y": -0.19709461979198617 },
          "radius": 0.14,
          "reference": { "x": -3.75, "y": -0.32 }
        },
        {
          "id": "hull-port-1",
          "position": { "x": -3.13296070170472, "y": -0.49709461979198616 },
          "radius": 0.14,
          "reference": { "x": -3.2, "y": -0.62 }
        },
        {
          "id": "hull-port-2",
          "position": { "x": -2.4512538858554924, "y": -0.7487604619186328 },
          "radius": 0.14,
          "reference": { "x": -2.5, "y": -0.88 }
        },
        {
          "id": "hull-port-3",
          "position": { "x": -1.5696297359053881, "y": -0.9433338115742467 },
          "radius": 0.14,
          "reference": { "x": -1.6, "y": -1.08 }
        },
        {
          "id": "hull-port-4",
          "position": { "x": -0.5916150792980874, "y": -1.0002513216347908 },
          "radius": 0.14,
          "reference": { "x": -0.6, "y": -1.14 }
        },
        {
          "id": "hull-port-5",
          "position": { "x": 0.394404474631158, "y": -0.9601118657789496 },
          "radius": 0.14,
          "reference": { "x": 0.4, "y": -1.1 }
        },
        {
          "id": "hull-port-6",
          "position": { "x": 1.3778813298450656, "y": -0.8017583115316612 },
          "radius": 0.14,
          "reference": { "x": 1.4, "y": -0.94 }
        },
        {
          "id": "hull-port-7",
          "position": { "x": 2.210496714641183, "y": -0.5556888297800221 },
          "radius": 0.14,
          "reference": { "x": 2.25, "y": -0.69 }
        },
        {
          "id": "hull-port-8",
          "position": { "x": 2.8980053053104258, "y": -0.2800132632760637 },
          "radius": 0.14,
          "reference": { "x": 2.95, "y": -0.41 }
        },
        {
          "id": "hull-starboard-0",
          "position": { "x": -3.6829607017047197, "y": 0.19709461979198617 },
          "radius": 0.14,
          "reference": { "x": -3.75, "y": 0.32 }
        },
        {
          "id": "hull-starboard-1",
          "position": { "x": -3.13296070170472, "y": 0.49709461979198616 },
          "radius": 0.14,
          "reference": { "x": -3.2, "y": 0.62 }
        },
        {
          "id": "hull-starboard-2",
          "position": { "x": -2.4512538858554924, "y": 0.7487604619186328 },
          "radius": 0.14,
          "reference": { "x": -2.5, "y": 0.88 }
        },
        {
          "id": "hull-starboard-3",
          "position": { "x": -1.5696297359053881, "y": 0.9433338115742467 },
          "radius": 0.14,
          "reference": { "x": -1.6, "y": 1.08 }
        },
        {
          "id": "hull-starboard-4",
          "position": { "x": -0.5916150792980874, "y": 1.0002513216347908 },
          "radius": 0.14,
          "reference": { "x": -0.6, "y": 1.14 }
        },
        {
          "id": "hull-starboard-5",
          "position": { "x": 0.394404474631158, "y": 0.9601118657789496 },
          "radius": 0.14,
          "reference": { "x": 0.4, "y": 1.1 }
        },
        {
          "id": "hull-starboard-6",
          "position": { "x": 1.3778813298450656, "y": 0.8017583115316612 },
          "radius": 0.14,
          "reference": { "x": 1.4, "y": 0.94 }
        },
        {
          "id": "hull-starboard-7",
          "position": { "x": 2.210496714641183, "y": 0.5556888297800221 },
          "radius": 0.14,
          "reference": { "x": 2.25, "y": 0.69 }
        },
        {
          "id": "hull-starboard-8",
          "position": { "x": 2.8980053053104258, "y": 0.2800132632760637 },
          "radius": 0.14,
          "reference": { "x": 2.95, "y": 0.41 }
        },
        {
          "id": "hull-transom-0",
          "position": { "x": -3.61, "y": -0.18 },
          "radius": 0.14,
          "reference": { "x": -3.75, "y": -0.18 }
        },
        {
          "id": "hull-transom-1",
          "position": { "x": -3.61, "y": 0 },
          "radius": 0.14,
          "reference": { "x": -3.75, "y": 0 }
        },
        {
          "id": "hull-transom-2",
          "position": { "x": -3.61, "y": 0.18 },
          "radius": 0.14,
          "reference": { "x": -3.75, "y": 0.18 }
        },
        {
          "id": "hull-bow",
          "position": { "x": 3.8799999999999994, "y": 0 },
          "radius": 0.14,
          "reference": { "x": 4.02, "y": 0 }
        }
      ]
    },
    "deckHardware": {
      "cleats": [
        {
          "id": "bow-port",
          "position": { "x": 3.0703980174268213, "y": -0.2765671802003314, "z": 0.89 },
          "attachment": { "x": 3.1, "y": -0.33999999999999997, "z": 0.85 },
          "side": "port",
          "station": "bow"
        },
        {
          "id": "stern-port",
          "position": { "x": -3.0756269429277463, "y": -0.5915230881021736, "z": 0.7142857142857144 },
          "attachment": { "x": -3.1, "y": -0.6571428571428571, "z": 0.6742857142857144 },
          "side": "port",
          "station": "stern"
        },
        {
          "id": "bow-starboard",
          "position": { "x": 3.0703980174268213, "y": 0.2765671802003314, "z": 0.89 },
          "attachment": { "x": 3.1, "y": 0.33999999999999997, "z": 0.85 },
          "side": "starboard",
          "station": "bow"
        },
        {
          "id": "stern-starboard",
          "position": { "x": -3.0756269429277463, "y": 0.5915230881021736, "z": 0.7142857142857144 },
          "attachment": { "x": -3.1, "y": 0.6571428571428571, "z": 0.6742857142857144 },
          "side": "starboard",
          "station": "stern"
        }
      ]
    },
    "mooring": {
      "maxLength": 15,
      "maximumLinesPerBoatCleat": 2,
      "maximumHaulInducedSpeed": 0.1028888,
      "humanPullForce": 200,
      "haulInRate": 1,
      "payOutRate": 1.2,
      "tautTolerance": 0.02,
      "solverTolerance": 0.001,
      "solverIterations": 8,
      "elasticity": {
        "workingStrain": 0.15,
        "workingLoadN": 7000,
        "dampingRatio": 0.35,
        "hardeningGain": 8,
        "maximumStrain": 0.2
      }
    },
    "provenance": {
      "values": {
        "geometry": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "m,m2",
          "uncertainty": 0.25,
          "method": "Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "kg,m",
          "uncertainty": 0.2,
          "method": "Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "N/(m/s),N/(m/s)^2,dimensionless",
          "uncertainty": 0.3,
          "method": "Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "appendages": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "rudders": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "m,m2,deg,deg/s",
          "uncertainty": 0.25,
          "method": "Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "steering": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "type,deg/s",
          "uncertainty": 0.25,
          "method": "Barre franche documentée ; réglage KJP demandé : vitesse maximale de 100°/s ; estimation non calibrée sur essai réel",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "aerodynamics": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "contacts": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "m,N/m,N,dimensionless",
          "uncertainty": 0.25,
          "method": "Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "deckHardware": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.15,
          "method": "Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mooring": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.loa": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf",
          "page": "Maclan p.3 dimensions, p.5 plan et YS8",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.beam": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf",
          "page": "Maclan p.3 dimensions, p.5 plan et YS8",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.draft": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf",
          "page": "Maclan p.3 dimensions, p.5 plan et YS8",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.lightDisplacement": {
  "sourceType": "estimated",
  "evidenceClass": "E",
  "source": "https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf",
  "page": "Maclan p.3 dimensions, p.5 plan et YS8",
  "unit": "kg",
  "uncertainty": 0.08,
  "method": "Déplacement constructeur 2250 kg ; condition de pesée non précisée, employé comme référence de chargement avec incertitude",
  "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
},
        "mass.displacement": {
          "sourceType": "estimated",
          "evidenceClass": "C",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "kg",
          "uncertainty": 0.08,
          "method": "Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.yawRadius": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/contessa-26-long-keel.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.2,
          "method": "Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.addedMassModel": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.25,
          "method": "Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull.crossFlow.linearDampingFroude": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.2,
          "method": "Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL)",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors.0.engine.powerKw": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.sextan.com/wp-content/uploads/2019/02/manuel-yanmar-ys.pdf",
          "page": "Spécifications moteur",
          "unit": "kW",
          "uncertainty": 0.03,
          "method": "Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors.0.engine.maxRpm": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.sextan.com/wp-content/uploads/2019/02/manuel-yanmar-ys.pdf",
          "page": "p.43 (page PDF 46)",
          "unit": "rpm",
          "uncertainty": 0.01,
          "method": "YS8 3200 tr/min",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors.0.rotation": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.sextan.com/wp-content/uploads/2019/02/manuel-yanmar-ys.pdf",
          "page": "p.43 (page PDF 46)",
          "unit": "left/right",
          "uncertainty": 0,
          "method": "Rotation hélice à gauche explicitement indiquée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors.0.gearbox.ratioAhead": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf",
          "page": "p.5",
          "unit": "ratio",
          "uncertainty": 0.03,
          "method": "Rapport standard 2:1 ; valeur arrondie publiée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        }
      }
    }
  };

  // Pogo 40 S4 : profil complet indépendant. Sources et incertitudes dans provenance.
  const POGO_40_S4 = {
    "schemaVersion": SCHEMA_VERSION,
    "id": "pogo-40-s4-twin-rudder-experimental",
    "version": "1.1.2",
    "name": "Pogo 40 S4",
    "modelClass": "displacement-sailing-monohull",
    "steering": {
      "type": "tiller",
      "maximumRudderRateDegS": 100
    },
    "validity": {
      "speedThroughWaterKn": [
        0,
        4
      ],
      "minimumDepthToDraftRatio": 4,
      "supportedPhysics": [
        "deep-water",
        "low-speed",
        "single-fixed-propeller",
        "twin-spade-rudder"
      ],
      "excludedEffects": [
        "waves",
        "shallow-water",
        "squat",
        "bank-effect",
        "heel",
        "rudder-emergence",
        "appendage-interaction",
        "propeller-folding"
      ]
    },
    "geometry": {
      "loa": 12.19,
      "lwl": 10.9,
      "lpp": 10.65,
      "beam": 4.42,
      "draft": 3.0,
      "canoeDraft": 0.46,
      "wettedArea": 29.5,
      "gunwale": [
        {
          "x": -6.0,
          "halfBeam": 1.83,
          "z": 0.97
        },
        {
          "x": -5.0,
          "halfBeam": 2.08,
          "z": 0.93
        },
        {
          "x": -3.8,
          "halfBeam": 2.2,
          "z": 0.9
        },
        {
          "x": -2.5,
          "halfBeam": 2.21,
          "z": 0.91
        },
        {
          "x": -1.0,
          "halfBeam": 2.16,
          "z": 0.96
        },
        {
          "x": 0.5,
          "halfBeam": 2.05,
          "z": 1.05
        },
        {
          "x": 2.0,
          "halfBeam": 1.9,
          "z": 1.18
        },
        {
          "x": 3.2,
          "halfBeam": 1.7,
          "z": 1.3
        },
        {
          "x": 4.2,
          "halfBeam": 1.36,
          "z": 1.42
        },
        {
          "x": 5.0,
          "halfBeam": 0.94,
          "z": 1.52
        },
        {
          "x": 5.65,
          "halfBeam": 0.48,
          "z": 1.6
        },
        {
          "x": 6.19,
          "halfBeam": 0,
          "z": 1.65
        }
      ],
      "hullSections": [
        {
          "x": -4.954545454545455,
          "dx": 0.990909090909091,
          "breadthFactor": 0.94,
          "immersedDepth": 0.44509600000000005,
          "shape": 0.94
        },
        {
          "x": -3.963636363636364,
          "dx": 0.990909090909091,
          "breadthFactor": 1,
          "immersedDepth": 0.46,
          "shape": 1
        },
        {
          "x": -2.9727272727272727,
          "dx": 0.990909090909091,
          "breadthFactor": 0.99,
          "immersedDepth": 0.4575160000000001,
          "shape": 0.99
        },
        {
          "x": -1.981818181818182,
          "dx": 0.990909090909091,
          "breadthFactor": 0.97,
          "immersedDepth": 0.452548,
          "shape": 0.97
        },
        {
          "x": -0.9909090909090912,
          "dx": 0.990909090909091,
          "breadthFactor": 0.92,
          "immersedDepth": 0.4401280000000001,
          "shape": 0.92
        },
        {
          "x": 0.0,
          "dx": 0.990909090909091,
          "breadthFactor": 0.85,
          "immersedDepth": 0.42274000000000006,
          "shape": 0.85
        },
        {
          "x": 0.9909090909090912,
          "dx": 0.990909090909091,
          "breadthFactor": 0.75,
          "immersedDepth": 0.39790000000000003,
          "shape": 0.75
        },
        {
          "x": 1.9818181818181824,
          "dx": 0.990909090909091,
          "breadthFactor": 0.61,
          "immersedDepth": 0.36312400000000006,
          "shape": 0.61
        },
        {
          "x": 2.9727272727272736,
          "dx": 0.990909090909091,
          "breadthFactor": 0.43,
          "immersedDepth": 0.31841200000000003,
          "shape": 0.43
        },
        {
          "x": 3.963636363636364,
          "dx": 0.990909090909091,
          "breadthFactor": 0.25,
          "immersedDepth": 0.2737,
          "shape": 0.25
        },
        {
          "x": 4.954545454545454,
          "dx": 0.990909090909091,
          "breadthFactor": 0.1,
          "immersedDepth": 0.23644,
          "shape": 0.1
        }
      ]
    },
    "mass": {
      "lightDisplacement": 4500,
      "displacement": 4880,
      "centerOfGravity": { "x": 0, "y": 0 },
      "yawRadius": 2.95,
      "addedMassModel": {
        "type": "sectional-cross-flow",
        "surgeMassRatio": 0.055,
        "sectionalScale": 0.3
      }
    },
    "hull": {
      "axialResistance": {
        "type": "linear-quadratic-wave-rise",
        "surgeLinear": 72,
        "surgeQuadratic": 64,
        "waveRise": 27,
        "waveOnset": 2.2
      },
      "crossFlow": {
        "type": "distributed-sections",
        "cd": 1.05,
        "areaFactor": 0.66,
        "linearDampingFroude": 0.018
      }
    },
    "appendages": [
      {
        "id": "deep-fin-bulb",
        "type": "keel",
        "position": { "x": -0.3, "y": 0, "z": -1.68 },
        "area": 2.45,
        "span": 2.54,
        "aspectRatio": 2.63,
        "coefficients": {
          "efficiency": 0.8,
          "cd0": 0.015,
          "normalCd90": 1.14,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      }
    ],
    "propulsors": [
      {
        "id": "central-propeller",
        "type": "fixed-pitch-propeller",
        "position": { "x": -3.6, "y": 0, "z": -0.69 },
        "axis": { "x": 1, "y": 0 },
        "rotation": "right",
        "engine": {
          "model": "Lombardini 30 cv (référence exacte non publiée)",
          "powerKw": 22.065,
          "idleRpm": 850,
          "maxRpm": 3600,
          "dynamics": {
            "inertiaKgM2": 0.136803,
            "frictionNm": 3.2191076677124486,
            "governorKpNmPerRadS": 1.463230758051113,
            "governorKiNmPerRad": 0.9004496972622233,
            "torqueCurve": [
              {
                "rpm": 850,
                "torqueNm": 42.141045831872056
              },
              {
                "rpm": 1500,
                "torqueNm": 56.18806110916274
              },
              {
                "rpm": 2200,
                "torqueNm": 64.38215335424897
              },
              {
                "rpm": 2800,
                "torqueNm": 62.04098414136719
              },
              {
                "rpm": 3600,
                "torqueNm": 58.52923032204452
              }
            ]
          }
        },
        "gearbox": {
          "model": "Lombardini 30 cv (référence exacte non publiée)",
          "ratioAhead": 2.4,
          "ratioAstern": 2.4,
          "efficiency": 0.94,
          "clutch": {
            "capacityEngineNm": 96.57323003137346,
            "stiffnessNmPerRadS": 0.82,
            "disengageTimeS": 0.12,
            "neutralDwellS": 0.18,
            "engageTimeS": 0.36
          }
        },
        "propeller": {
          "diameter": 0.38,
          "pitch": 0.28,
          "blades": 2,
          "expandedAreaRatio": 0.38,
          "shaft": {
            "inertiaKgM2": 0.012,
            "viscousFrictionNmPerRadS": 0.018,
            "coulombFrictionNm": 0.18
          },
          "fourQuadrant": createFourQuadrantTable({"diameter": 0.38, "pitch": 0.28, "blades": 2, "expandedAreaRatio": 0.38, "ktAhead": 0.17, "ktAstern": 0.12, "ktAdvanceAhead": 0.095, "ktAdvanceAstern": 0.05, "ktWindmill": 0.032, "cqAhead": 0.0158, "cqAstern": 0.0175, "cqWindmill": 0.0105, "source": "Prior propre Pogo 40 S4 ; non calibré sur essai hélice", "uncertainty": 0.25}),
          "safety": {
            "maximumThrustCoefficient": 2.2,
            "maximumTorqueCoefficient": 0.12
          }
        },
        "transverseWalk": {
          "base": 0.025,
          "gain": 0.105
        }
      }
    ],
    "rudders": [
      {
        "id": "rudder-port",
        "position": { "x": -5.85, "y": -1.74, "z": -0.77 },
        "area": 0.49,
        "span": 1.1,
        "aspectRatio": 2.47,
        "coefficients": {
          "efficiency": 0.77,
          "cd0": 0.022,
          "normalCd90": 1.12,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        },
        "axis": { "x": 0, "y": 0, "z": 1 },
        "stock": {
          "chordFraction": 0.2
        },
        "maxAngleDeg": 35,
        "slipstreamSources": [],
        "slipstream": {
          "stripCount": 5,
          "contractionRatio": 0.86,
          "downstreamVelocityFactor": 0.55,
          "upstreamVelocityFactor": 0.24,
          "swirlFraction": 0.055,
          "convectionTimeBoundsS": [
            0.05,
            0.55
          ],
          "flowStraightening": 0.92,
          "momentumSafetyFactor": 1.18
        }
      },
      {
        "id": "rudder-starboard",
        "position": { "x": -5.85, "y": 1.74, "z": -0.77 },
        "area": 0.49,
        "span": 1.1,
        "aspectRatio": 2.47,
        "coefficients": {
          "efficiency": 0.77,
          "cd0": 0.022,
          "normalCd90": 1.12,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        },
        "axis": { "x": 0, "y": 0, "z": 1 },
        "stock": {
          "chordFraction": 0.2
        },
        "maxAngleDeg": 35,
        "slipstreamSources": [],
        "slipstream": {
          "stripCount": 5,
          "contractionRatio": 0.86,
          "downstreamVelocityFactor": 0.55,
          "upstreamVelocityFactor": 0.24,
          "swirlFraction": 0.055,
          "convectionTimeBoundsS": [
            0.05,
            0.55
          ],
          "flowStraightening": 0.92,
          "momentumSafetyFactor": 1.18
        }
      }
    ],
    "aerodynamics": {
      "referenceWindHeight": 10,
      "verticalProfile": {
        "type": "bounded-power-law",
        "exponent": 0.08,
        "minimumVelocityFactor": 0.82,
        "maximumVelocityFactor": 1.05
      },
      "panels": aerodynamicPanels([{"x": -6.0, "halfBeam": 1.83, "z": 0.97}, {"x": -5.0, "halfBeam": 2.08, "z": 0.93}, {"x": -3.8, "halfBeam": 2.2, "z": 0.9}, {"x": -2.5, "halfBeam": 2.21, "z": 0.91}, {"x": -1.0, "halfBeam": 2.16, "z": 0.96}, {"x": 0.5, "halfBeam": 2.05, "z": 1.05}, {"x": 2.0, "halfBeam": 1.9, "z": 1.18}, {"x": 3.2, "halfBeam": 1.7, "z": 1.3}, {"x": 4.2, "halfBeam": 1.36, "z": 1.42}, {"x": 5.0, "halfBeam": 0.94, "z": 1.52}, {"x": 5.65, "halfBeam": 0.48, "z": 1.6}, {"x": 6.19, "halfBeam": 0, "z": 1.65}], 1, 1, 1, {"sides": [["coachroof-aft-starboard", 2.1, -0.08, 0.997, -1.3, 0.86, 1.55], ["coachroof-aft-port", 2.1, -0.08, -0.997, -1.3, -0.86, 1.55], ["coachroof-fore-starboard", 1.45, 0.14, 0.99, 0.9, 0.7, 1.62], ["coachroof-fore-port", 1.45, 0.14, -0.99, 0.9, -0.7, 1.62], ["boom-starboard", 1.22, 0, 1, -0.9, 0.16, 2.8, 0.92], ["boom-port", 1.22, 0, -1, -0.9, -0.16, 2.8, 0.92]], "rig": {"area": 2.8, "x": -0.3, "z": 7.1}})
    },
    "contacts": {
      "fenderRadius": 0.18,
      "hullRadius": 0.22,
      "fenderStiffness": 42000,
      "hullStiffness": 86000,
      "dampingRatio": 0.82,
      "friction": 0.3,
      "hullFriction": 0.3,
      "fenderFriction": 0.03,
      "forceLimit": 85000,
      "fenders": [
        {
          "id": "fender-bow-port",
          "position": { "x": 3.9047234646505795, "y": -1.6399513666193513, "z": 0.33999999999999997 },
          "attachment": { "x": 3.85, "y": -1.479, "z": 1.378 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-mid-port",
          "position": { "x": -0.3875667202145799, "y": -2.285544724346638, "z": 0.33999999999999997 },
          "attachment": { "x": -0.4, "y": -2.116, "z": 0.996 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-stern-port",
          "position": { "x": -4.566915632233569, "y": -2.294156322335698, "z": 0.33999999999999997 },
          "attachment": { "x": -4.55, "y": -2.125, "z": 0.9187500000000001 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-bow-starboard",
          "position": { "x": 3.9047234646505795, "y": 1.6399513666193513, "z": 0.33999999999999997 },
          "attachment": { "x": 3.85, "y": 1.479, "z": 1.378 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-mid-starboard",
          "position": { "x": -0.3875667202145799, "y": 2.285544724346638, "z": 0.33999999999999997 },
          "attachment": { "x": -0.4, "y": 2.116, "z": 0.996 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-stern-starboard",
          "position": { "x": -4.566915632233569, "y": 2.294156322335698, "z": 0.33999999999999997 },
          "attachment": { "x": -4.55, "y": 2.125, "z": 0.9187500000000001 },
          "side": "starboard",
          "preload": 0.01
        }
      ],
      "hullEnvelope": [
        {
          "id": "hull-port-0",
          "position": { "x": -5.946642162492007, "y": -1.616568649968027 },
          "radius": 0.22,
          "reference": { "x": -6.0, "y": -1.83 }
        },
        {
          "id": "hull-port-1",
          "position": { "x": -4.946642162492007, "y": -1.866568649968027 },
          "radius": 0.22,
          "reference": { "x": -5.0, "y": -2.08 }
        },
        {
          "id": "hull-port-2",
          "position": { "x": -3.7781091818153802, "y": -1.9810918181538026 },
          "radius": 0.22,
          "reference": { "x": -3.8, "y": -2.2 }
        },
        {
          "id": "hull-port-3",
          "position": { "x": -2.498307742373745, "y": -1.9900065085868985 },
          "radius": 0.22,
          "reference": { "x": -2.5, "y": -2.21 }
        },
        {
          "id": "hull-port-4",
          "position": { "x": -1.0073292626511805, "y": -1.9401221204645862 },
          "radius": 0.22,
          "reference": { "x": -1.0, "y": -2.16 }
        },
        {
          "id": "hull-port-5",
          "position": { "x": 0.483909873218868, "y": -1.8305891802572918 },
          "radius": 0.22,
          "reference": { "x": 0.5, "y": -2.05 }
        },
        {
          "id": "hull-port-6",
          "position": { "x": 1.9781091818153802, "y": -1.6810918181538024 },
          "radius": 0.22,
          "reference": { "x": 2.0, "y": -1.9 }
        },
        {
          "id": "hull-port-7",
          "position": { "x": 3.1638322227928217, "y": -1.4829933367569283 },
          "radius": 0.22,
          "reference": { "x": 3.2, "y": -1.7 }
        },
        {
          "id": "hull-port-8",
          "position": { "x": 4.129181398687486, "y": -1.1517099961396633 },
          "radius": 0.22,
          "reference": { "x": 4.2, "y": -1.36 }
        },
        {
          "id": "hull-port-9",
          "position": { "x": 4.897736542222217, "y": -0.7452124613756523 },
          "radius": 0.22,
          "reference": { "x": 5.0, "y": -0.94 }
        },
        {
          "id": "hull-starboard-0",
          "position": { "x": -5.946642162492007, "y": 1.616568649968027 },
          "radius": 0.22,
          "reference": { "x": -6.0, "y": 1.83 }
        },
        {
          "id": "hull-starboard-1",
          "position": { "x": -4.946642162492007, "y": 1.866568649968027 },
          "radius": 0.22,
          "reference": { "x": -5.0, "y": 2.08 }
        },
        {
          "id": "hull-starboard-2",
          "position": { "x": -3.7781091818153802, "y": 1.9810918181538026 },
          "radius": 0.22,
          "reference": { "x": -3.8, "y": 2.2 }
        },
        {
          "id": "hull-starboard-3",
          "position": { "x": -2.498307742373745, "y": 1.9900065085868985 },
          "radius": 0.22,
          "reference": { "x": -2.5, "y": 2.21 }
        },
        {
          "id": "hull-starboard-4",
          "position": { "x": -1.0073292626511805, "y": 1.9401221204645862 },
          "radius": 0.22,
          "reference": { "x": -1.0, "y": 2.16 }
        },
        {
          "id": "hull-starboard-5",
          "position": { "x": 0.483909873218868, "y": 1.8305891802572918 },
          "radius": 0.22,
          "reference": { "x": 0.5, "y": 2.05 }
        },
        {
          "id": "hull-starboard-6",
          "position": { "x": 1.9781091818153802, "y": 1.6810918181538024 },
          "radius": 0.22,
          "reference": { "x": 2.0, "y": 1.9 }
        },
        {
          "id": "hull-starboard-7",
          "position": { "x": 3.1638322227928217, "y": 1.4829933367569283 },
          "radius": 0.22,
          "reference": { "x": 3.2, "y": 1.7 }
        },
        {
          "id": "hull-starboard-8",
          "position": { "x": 4.129181398687486, "y": 1.1517099961396633 },
          "radius": 0.22,
          "reference": { "x": 4.2, "y": 1.36 }
        },
        {
          "id": "hull-starboard-9",
          "position": { "x": 4.897736542222217, "y": 0.7452124613756523 },
          "radius": 0.22,
          "reference": { "x": 5.0, "y": 0.94 }
        },
        {
          "id": "hull-transom-0",
          "position": { "x": -5.78, "y": -1.61 },
          "radius": 0.22,
          "reference": { "x": -6.0, "y": -1.61 }
        },
        {
          "id": "hull-transom-1",
          "position": { "x": -5.78, "y": 0 },
          "radius": 0.22,
          "reference": { "x": -6.0, "y": 0 }
        },
        {
          "id": "hull-transom-2",
          "position": { "x": -5.78, "y": 1.61 },
          "radius": 0.22,
          "reference": { "x": -6.0, "y": 1.61 }
        },
        {
          "id": "hull-bow",
          "position": { "x": 5.970000000000001, "y": 0 },
          "radius": 0.22,
          "reference": { "x": 6.19, "y": 0 }
        }
      ]
    },
    "deckHardware": {
      "cleats": [
        {
          "id": "bow-port",
          "position": { "x": 4.717461627070706, "y": -1.009272146801344, "z": 1.52875 },
          "attachment": { "x": 4.75, "y": -1.07125, "z": 1.48875 },
          "side": "port",
          "station": "bow"
        },
        {
          "id": "mid-port",
          "position": { "x": -0.2551195857939965, "y": -2.035187466445502, "z": 1.045 },
          "attachment": { "x": -0.25, "y": -2.105, "z": 1.005 },
          "side": "port",
          "station": "mid"
        },
        {
          "id": "stern-port",
          "position": { "x": -5.133022506247457, "y": -1.9745900249898267, "z": 0.9760000000000001 },
          "attachment": { "x": -5.15, "y": -2.0425, "z": 0.936 },
          "side": "port",
          "station": "stern"
        },
        {
          "id": "bow-starboard",
          "position": { "x": 4.717461627070706, "y": 1.009272146801344, "z": 1.52875 },
          "attachment": { "x": 4.75, "y": 1.07125, "z": 1.48875 },
          "side": "starboard",
          "station": "bow"
        },
        {
          "id": "mid-starboard",
          "position": { "x": -0.2551195857939965, "y": 2.035187466445502, "z": 1.045 },
          "attachment": { "x": -0.25, "y": 2.105, "z": 1.005 },
          "side": "starboard",
          "station": "mid"
        },
        {
          "id": "stern-starboard",
          "position": { "x": -5.133022506247457, "y": 1.9745900249898267, "z": 0.9760000000000001 },
          "attachment": { "x": -5.15, "y": 2.0425, "z": 0.936 },
          "side": "starboard",
          "station": "stern"
        }
      ]
    },
    "mooring": {
      "maxLength": 22,
      "maximumLinesPerBoatCleat": 2,
      "maximumHaulInducedSpeed": 0.1028888,
      "humanPullForce": 200,
      "haulInRate": 1,
      "payOutRate": 1.2,
      "tautTolerance": 0.02,
      "solverTolerance": 0.001,
      "solverIterations": 8,
      "elasticity": {
        "workingStrain": 0.15,
        "workingLoadN": 12000,
        "dampingRatio": 0.35,
        "hardeningGain": 8,
        "maximumStrain": 0.2
      }
    },
    "provenance": {
      "values": {
        "geometry": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "m,m2",
          "uncertainty": 0.25,
          "method": "Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "kg,m",
          "uncertainty": 0.2,
          "method": "Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "N/(m/s),N/(m/s)^2,dimensionless",
          "uncertainty": 0.3,
          "method": "Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "appendages": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "rudders": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "m,m2,deg,deg/s",
          "uncertainty": 0.25,
          "method": "Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "steering": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "type,deg/s",
          "uncertainty": 0.25,
          "method": "Barre franche couplée aux deux safrans ; réglage KJP demandé : vitesse maximale de 100°/s pour chaque safran ; estimation non calibrée sur essai réel",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "aerodynamics": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "contacts": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "m,N/m,N,dimensionless",
          "uncertainty": 0.25,
          "method": "Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "deckHardware": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.15,
          "method": "Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mooring": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.loa": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf",
          "page": "Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.beam": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf",
          "page": "Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.draft": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf",
          "page": "Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.lightDisplacement": {
  "sourceType": "estimated",
  "evidenceClass": "E",
  "source": "https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf",
  "page": "Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans",
  "unit": "kg",
  "uncertainty": 0.08,
  "method": "Poids publié 4500 kg, également désigné poids de jauge ; emploi comme référence légère avec état exact incertain",
  "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
},
        "mass.displacement": {
          "sourceType": "estimated",
          "evidenceClass": "C",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "kg",
          "uncertainty": 0.08,
          "method": "Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.yawRadius": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/pogo-40-s4-twin-rudder.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.2,
          "method": "Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.addedMassModel": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.25,
          "method": "Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull.crossFlow.linearDampingFroude": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.2,
          "method": "Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL)",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors.0.engine.powerKw": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf",
          "page": "Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans",
          "unit": "kW",
          "uncertainty": 0.03,
          "method": "Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        }
      }
    }
  };

  // Oceanis 48 : profil complet indépendant. Sources et incertitudes dans provenance.
  const OCEANIS_48 = {
    "schemaVersion": SCHEMA_VERSION,
    "id": "oceanis-48-fixed-keel-experimental",
    "version": "1.1.0",
    "name": "Oceanis 48",
    "modelClass": "displacement-sailing-monohull",
    "steering": {
      "type": "wheel",
      "maximumRudderRateDegS": 46
    },
    "validity": {
      "speedThroughWaterKn": [
        0,
        4
      ],
      "minimumDepthToDraftRatio": 4,
      "supportedPhysics": [
        "deep-water",
        "low-speed",
        "single-fixed-propeller",
        "single-rudder"
      ],
      "excludedEffects": [
        "waves",
        "shallow-water",
        "squat",
        "bank-effect",
        "heel",
        "rudder-emergence",
        "appendage-interaction",
        "propeller-folding"
      ]
    },
    "geometry": {
      "loa": 14.6,
      "lwl": 13.86,
      "lpp": 13.5,
      "beam": 4.74,
      "draft": 2.17,
      "canoeDraft": 0.84,
      "wettedArea": 48.0,
      "gunwale": [
        {
          "x": -7.05,
          "halfBeam": 1.83,
          "z": 1.22
        },
        {
          "x": -6.1,
          "halfBeam": 2.13,
          "z": 1.18
        },
        {
          "x": -4.8,
          "halfBeam": 2.3,
          "z": 1.15
        },
        {
          "x": -3.3,
          "halfBeam": 2.37,
          "z": 1.13
        },
        {
          "x": -1.6,
          "halfBeam": 2.36,
          "z": 1.13
        },
        {
          "x": 0.2,
          "halfBeam": 2.25,
          "z": 1.16
        },
        {
          "x": 1.9,
          "halfBeam": 2.03,
          "z": 1.2
        },
        {
          "x": 3.4,
          "halfBeam": 1.68,
          "z": 1.28
        },
        {
          "x": 4.7,
          "halfBeam": 1.23,
          "z": 1.36
        },
        {
          "x": 5.8,
          "halfBeam": 0.75,
          "z": 1.44
        },
        {
          "x": 6.6,
          "halfBeam": 0.31,
          "z": 1.5
        },
        {
          "x": 7.22,
          "halfBeam": 0,
          "z": 1.55
        }
      ],
      "hullSections": [
        {
          "x": -6.3,
          "dx": 1.26,
          "breadthFactor": 0.72,
          "immersedDepth": 0.712992,
          "shape": 0.72
        },
        {
          "x": -5.039999999999999,
          "dx": 1.26,
          "breadthFactor": 0.87,
          "immersedDepth": 0.7810320000000001,
          "shape": 0.87
        },
        {
          "x": -3.78,
          "dx": 1.26,
          "breadthFactor": 0.97,
          "immersedDepth": 0.826392,
          "shape": 0.97
        },
        {
          "x": -2.5199999999999996,
          "dx": 1.26,
          "breadthFactor": 1,
          "immersedDepth": 0.84,
          "shape": 1
        },
        {
          "x": -1.2599999999999998,
          "dx": 1.26,
          "breadthFactor": 0.99,
          "immersedDepth": 0.8354640000000001,
          "shape": 0.99
        },
        {
          "x": 0.0,
          "dx": 1.26,
          "breadthFactor": 0.94,
          "immersedDepth": 0.812784,
          "shape": 0.94
        },
        {
          "x": 1.2599999999999998,
          "dx": 1.26,
          "breadthFactor": 0.85,
          "immersedDepth": 0.77196,
          "shape": 0.85
        },
        {
          "x": 2.5199999999999996,
          "dx": 1.26,
          "breadthFactor": 0.72,
          "immersedDepth": 0.712992,
          "shape": 0.72
        },
        {
          "x": 3.780000000000001,
          "dx": 1.26,
          "breadthFactor": 0.54,
          "immersedDepth": 0.631344,
          "shape": 0.54
        },
        {
          "x": 5.040000000000001,
          "dx": 1.26,
          "breadthFactor": 0.34,
          "immersedDepth": 0.540624,
          "shape": 0.34
        },
        {
          "x": 6.300000000000001,
          "dx": 1.26,
          "breadthFactor": 0.15,
          "immersedDepth": 0.45444,
          "shape": 0.15
        }
      ]
    },
    "mass": {
      "lightDisplacement": 12594,
      "displacement": 13200,
      "centerOfGravity": { "x": 0, "y": 0 },
      "yawRadius": 3.65,
      "addedMassModel": {
        "type": "sectional-cross-flow",
        "surgeMassRatio": 0.082,
        "sectionalScale": 0.38
      }
    },
    "hull": {
      "axialResistance": {
        "type": "linear-quadratic-wave-rise",
        "surgeLinear": 155,
        "surgeQuadratic": 156,
        "waveRise": 56,
        "waveOnset": 2.5
      },
      "crossFlow": {
        "type": "distributed-sections",
        "cd": 1.1,
        "areaFactor": 0.75,
        "linearDampingFroude": 0.02
      }
    },
    "appendages": [
      {
        "id": "deep-cast-iron-keel",
        "type": "keel",
        "position": { "x": -0.25, "y": 0, "z": -1.48 },
        "area": 4.55,
        "span": 1.33,
        "aspectRatio": 1.24,
        "coefficients": {
          "efficiency": 0.75,
          "cd0": 0.019,
          "normalCd90": 1.18,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        }
      }
    ],
    "propulsors": [
      {
        "id": "saildrive-propeller",
        "type": "fixed-pitch-propeller",
        "position": { "x": -4.45, "y": 0, "z": -0.88 },
        "axis": { "x": 1, "y": 0 },
        "rotation": "left",
        "engine": {
          "model": "Yanmar 4JH80 / SD60 conventionnel",
          "powerKw": 58.8,
          "idleRpm": 850,
          "maxRpm": 3200,
          "dynamics": {
            "inertiaKgM2": 0.36456,
            "frictionNm": 9.650757861734805,
            "governorKpNmPerRadS": 4.386708118970366,
            "governorKiNmPerRad": 2.699512688597148,
            "torqueCurve": [
              {
                "rpm": 850,
                "torqueNm": 126.33719382634652
              },
              {
                "rpm": 1500,
                "torqueNm": 168.44959176846203
              },
              {
                "rpm": 2200,
                "torqueNm": 193.0151572346961
              },
              {
                "rpm": 2800,
                "torqueNm": 185.9964242443435
              },
              {
                "rpm": 3200,
                "torqueNm": 175.46832475881462
              }
            ]
          }
        },
        "gearbox": {
          "model": "SD60 conventionnel",
          "ratioAhead": 2.23,
          "ratioAstern": 2.23,
          "efficiency": 0.94,
          "clutch": {
            "capacityEngineNm": 289.5227358520441,
            "stiffnessNmPerRadS": 0.82,
            "disengageTimeS": 0.12,
            "neutralDwellS": 0.18,
            "engageTimeS": 0.36
          }
        },
        "propeller": {
          "diameter": 0.508,
          "pitch": 0.356,
          "blades": 3,
          "expandedAreaRatio": 0.55,
          "shaft": {
            "inertiaKgM2": 0.045672241868236804,
            "viscousFrictionNmPerRadS": 0.018,
            "coulombFrictionNm": 0.18
          },
          "fourQuadrant": createFourQuadrantTable({"diameter": 0.508, "pitch": 0.356, "blades": 3, "expandedAreaRatio": 0.55, "ktAhead": 0.185, "ktAstern": 0.135, "ktAdvanceAhead": 0.103, "ktAdvanceAstern": 0.054, "ktWindmill": 0.035, "cqAhead": 0.0175, "cqAstern": 0.0194, "cqWindmill": 0.0114, "source": "Prior propre Oceanis 48 ; non calibré sur essai hélice", "uncertainty": 0.25}),
          "safety": {
            "maximumThrustCoefficient": 2.2,
            "maximumTorqueCoefficient": 0.12
          }
        },
        "transverseWalk": {
          "base": 0.035,
          "gain": 0.125
        }
      }
    ],
    "rudders": [
      {
        "id": "spade-rudder",
        "position": { "x": -5.85, "y": 0, "z": -1.2 },
        "area": 1.35,
        "span": 1.44,
        "aspectRatio": 1.54,
        "coefficients": {
          "efficiency": 0.73,
          "cd0": 0.022,
          "normalCd90": 1.12,
          "stallStartDeg": 24,
          "stallEndDeg": 52
        },
        "axis": { "x": 0, "y": 0, "z": 1 },
        "stock": {
          "chordFraction": 0.22
        },
        "maxAngleDeg": 35,
        "slipstreamSources": [
          "saildrive-propeller"
        ],
        "slipstream": {
          "stripCount": 5,
          "contractionRatio": 0.86,
          "downstreamVelocityFactor": 0.55,
          "upstreamVelocityFactor": 0.24,
          "swirlFraction": 0.055,
          "convectionTimeBoundsS": [
            0.05,
            0.55
          ],
          "flowStraightening": 0.92,
          "momentumSafetyFactor": 1.18
        }
      }
    ],
    "aerodynamics": {
      "referenceWindHeight": 10,
      "verticalProfile": {
        "type": "bounded-power-law",
        "exponent": 0.08,
        "minimumVelocityFactor": 0.82,
        "maximumVelocityFactor": 1.05
      },
      "panels": aerodynamicPanels([{"x": -7.05, "halfBeam": 1.83, "z": 1.22}, {"x": -6.1, "halfBeam": 2.13, "z": 1.18}, {"x": -4.8, "halfBeam": 2.3, "z": 1.15}, {"x": -3.3, "halfBeam": 2.37, "z": 1.13}, {"x": -1.6, "halfBeam": 2.36, "z": 1.13}, {"x": 0.2, "halfBeam": 2.25, "z": 1.16}, {"x": 1.9, "halfBeam": 2.03, "z": 1.2}, {"x": 3.4, "halfBeam": 1.68, "z": 1.28}, {"x": 4.7, "halfBeam": 1.23, "z": 1.36}, {"x": 5.8, "halfBeam": 0.75, "z": 1.44}, {"x": 6.6, "halfBeam": 0.31, "z": 1.5}, {"x": 7.22, "halfBeam": 0, "z": 1.55}], 1, 1, 1, {"sides": [["coachroof-aft-starboard", 3.8, -0.08, 0.997, -1.65, 1.08, 2.0], ["coachroof-aft-port", 3.8, -0.08, -0.997, -1.65, -1.08, 2.0], ["coachroof-fore-starboard", 2.65, 0.12, 0.993, 1.65, 0.94, 2.06], ["coachroof-fore-port", 2.65, 0.12, -0.993, 1.65, -0.94, 2.06], ["boom-starboard", 1.55, 0, 1, -0.45, 0.2, 3.3, 0.92], ["boom-port", 1.55, 0, -1, -0.45, -0.2, 3.3, 0.92]], "rig": {"area": 3.15, "x": 0.45, "z": 7.2}})
    },
    "contacts": {
      "fenderRadius": 0.22,
      "hullRadius": 0.26,
      "fenderStiffness": 65000,
      "hullStiffness": 135000,
      "dampingRatio": 0.82,
      "friction": 0.3,
      "hullFriction": 0.3,
      "fenderFriction": 0.03,
      "forceLimit": 140000,
      "fenders": [
        {
          "id": "fender-bow-port",
          "position": { "x": 4.933988335763326, "y": -1.3570187240030778, "z": 0.38 },
          "attachment": { "x": 4.85, "y": -1.1645454545454548, "z": 1.3709090909090909 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-mid-port",
          "position": { "x": -0.13719056323231418, "y": -2.480997854178293, "z": 0.38 },
          "attachment": { "x": -0.15, "y": -2.2713888888888887, "z": 1.1541666666666666 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-stern-port",
          "position": { "x": -4.97722970336954, "y": -2.488611758798741, "z": 0.38 },
          "attachment": { "x": -4.95, "y": -2.280384615384615, "z": 1.1534615384615383 },
          "side": "port",
          "preload": 0.01
        },
        {
          "id": "fender-bow-starboard",
          "position": { "x": 4.933988335763326, "y": 1.3570187240030778, "z": 0.38 },
          "attachment": { "x": 4.85, "y": 1.1645454545454548, "z": 1.3709090909090909 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-mid-starboard",
          "position": { "x": -0.13719056323231418, "y": 2.480997854178293, "z": 0.38 },
          "attachment": { "x": -0.15, "y": 2.2713888888888887, "z": 1.1541666666666666 },
          "side": "starboard",
          "preload": 0.01
        },
        {
          "id": "fender-stern-starboard",
          "position": { "x": -4.97722970336954, "y": 2.488611758798741, "z": 0.38 },
          "attachment": { "x": -4.95, "y": 2.280384615384615, "z": 1.1534615384615383 },
          "side": "starboard",
          "preload": 0.01
        }
      ],
      "hullEnvelope": [
        {
          "id": "hull-port-0",
          "position": { "x": -6.971705844336355, "y": -1.5820685070651233 },
          "radius": 0.26,
          "reference": { "x": -7.05, "y": -1.83 }
        },
        {
          "id": "hull-port-1",
          "position": { "x": -6.0217058443363545, "y": -1.882068507065123 },
          "radius": 0.26,
          "reference": { "x": -6.1, "y": -2.13 }
        },
        {
          "id": "hull-port-2",
          "position": { "x": -4.766287033923427, "y": -2.0421949652967966 },
          "radius": 0.26,
          "reference": { "x": -4.8, "y": -2.3 }
        },
        {
          "id": "hull-port-3",
          "position": { "x": -3.287879856978248, "y": -2.1102826495338975 },
          "radius": 0.26,
          "reference": { "x": -3.3, "y": -2.37 }
        },
        {
          "id": "hull-port-4",
          "position": { "x": -1.6015293853049815, "y": -2.1000044981531625 },
          "radius": 0.26,
          "reference": { "x": -1.6, "y": -2.36 }
        },
        {
          "id": "hull-port-5",
          "position": { "x": 0.18414069733524616, "y": -1.9904841382131186 },
          "radius": 0.26,
          "reference": { "x": 0.2, "y": -2.25 }
        },
        {
          "id": "hull-port-6",
          "position": { "x": 1.8666312013697586, "y": -1.7721501924026808 },
          "radius": 0.26,
          "reference": { "x": 1.9, "y": -2.03 }
        },
        {
          "id": "hull-port-7",
          "position": { "x": 3.340920299942331, "y": -1.4268012854671337 },
          "radius": 0.26,
          "reference": { "x": 3.4, "y": -1.68 }
        },
        {
          "id": "hull-port-8",
          "position": { "x": 4.614951253390377, "y": -0.9843036209055329 },
          "radius": 0.26,
          "reference": { "x": 4.7, "y": -1.23 }
        },
        {
          "id": "hull-port-9",
          "position": { "x": 5.6960144414358815, "y": -0.5116997616238954 },
          "radius": 0.26,
          "reference": { "x": 5.8, "y": -0.75 }
        },
        {
          "id": "hull-starboard-0",
          "position": { "x": -6.971705844336355, "y": 1.5820685070651233 },
          "radius": 0.26,
          "reference": { "x": -7.05, "y": 1.83 }
        },
        {
          "id": "hull-starboard-1",
          "position": { "x": -6.0217058443363545, "y": 1.882068507065123 },
          "radius": 0.26,
          "reference": { "x": -6.1, "y": 2.13 }
        },
        {
          "id": "hull-starboard-2",
          "position": { "x": -4.766287033923427, "y": 2.0421949652967966 },
          "radius": 0.26,
          "reference": { "x": -4.8, "y": 2.3 }
        },
        {
          "id": "hull-starboard-3",
          "position": { "x": -3.287879856978248, "y": 2.1102826495338975 },
          "radius": 0.26,
          "reference": { "x": -3.3, "y": 2.37 }
        },
        {
          "id": "hull-starboard-4",
          "position": { "x": -1.6015293853049815, "y": 2.1000044981531625 },
          "radius": 0.26,
          "reference": { "x": -1.6, "y": 2.36 }
        },
        {
          "id": "hull-starboard-5",
          "position": { "x": 0.18414069733524616, "y": 1.9904841382131186 },
          "radius": 0.26,
          "reference": { "x": 0.2, "y": 2.25 }
        },
        {
          "id": "hull-starboard-6",
          "position": { "x": 1.8666312013697586, "y": 1.7721501924026808 },
          "radius": 0.26,
          "reference": { "x": 1.9, "y": 2.03 }
        },
        {
          "id": "hull-starboard-7",
          "position": { "x": 3.340920299942331, "y": 1.4268012854671337 },
          "radius": 0.26,
          "reference": { "x": 3.4, "y": 1.68 }
        },
        {
          "id": "hull-starboard-8",
          "position": { "x": 4.614951253390377, "y": 0.9843036209055329 },
          "radius": 0.26,
          "reference": { "x": 4.7, "y": 1.23 }
        },
        {
          "id": "hull-starboard-9",
          "position": { "x": 5.6960144414358815, "y": 0.5116997616238954 },
          "radius": 0.26,
          "reference": { "x": 5.8, "y": 0.75 }
        },
        {
          "id": "hull-transom-0",
          "position": { "x": -6.79, "y": -1.57 },
          "radius": 0.26,
          "reference": { "x": -7.05, "y": -1.57 }
        },
        {
          "id": "hull-transom-1",
          "position": { "x": -6.79, "y": 0 },
          "radius": 0.26,
          "reference": { "x": -7.05, "y": 0 }
        },
        {
          "id": "hull-transom-2",
          "position": { "x": -6.79, "y": 1.57 },
          "radius": 0.26,
          "reference": { "x": -7.05, "y": 1.57 }
        },
        {
          "id": "hull-bow",
          "position": { "x": 6.96, "y": 0 },
          "radius": 0.26,
          "reference": { "x": 7.22, "y": 0 }
        }
      ]
    },
    "deckHardware": {
      "cleats": [
        {
          "id": "bow-port",
          "position": { "x": 5.916265687515949, "y": -0.6061648863926344, "z": 1.49125 },
          "attachment": { "x": 5.95, "y": -0.6674999999999998, "z": 1.45125 },
          "side": "port",
          "station": "bow"
        },
        {
          "id": "mid-port",
          "position": { "x": -0.10426981225589527, "y": -2.1984636782368656, "z": 1.1949999999999998 },
          "attachment": { "x": -0.1, "y": -2.2683333333333335, "z": 1.1549999999999998 },
          "side": "port",
          "station": "mid"
        },
        {
          "id": "stern-port",
          "position": { "x": -6.078920804244403, "y": -2.06324921344061, "z": 1.22 },
          "attachment": { "x": -6.1, "y": -2.13, "z": 1.18 },
          "side": "port",
          "station": "stern"
        },
        {
          "id": "bow-starboard",
          "position": { "x": 5.916265687515949, "y": 0.6061648863926344, "z": 1.49125 },
          "attachment": { "x": 5.95, "y": 0.6674999999999998, "z": 1.45125 },
          "side": "starboard",
          "station": "bow"
        },
        {
          "id": "mid-starboard",
          "position": { "x": -0.10426981225589527, "y": 2.1984636782368656, "z": 1.1949999999999998 },
          "attachment": { "x": -0.1, "y": 2.2683333333333335, "z": 1.1549999999999998 },
          "side": "starboard",
          "station": "mid"
        },
        {
          "id": "stern-starboard",
          "position": { "x": -6.078920804244403, "y": 2.06324921344061, "z": 1.22 },
          "attachment": { "x": -6.1, "y": 2.13, "z": 1.18 },
          "side": "starboard",
          "station": "stern"
        }
      ]
    },
    "mooring": {
      "maxLength": 25,
      "maximumLinesPerBoatCleat": 2,
      "maximumHaulInducedSpeed": 0.1028888,
      "humanPullForce": 200,
      "haulInRate": 1,
      "payOutRate": 1.2,
      "tautTolerance": 0.02,
      "solverTolerance": 0.001,
      "solverIterations": 8,
      "elasticity": {
        "workingStrain": 0.15,
        "workingLoadN": 18000,
        "dampingRatio": 0.35,
        "hardeningGain": 8,
        "maximumStrain": 0.2
      }
    },
    "provenance": {
      "values": {
        "geometry": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "m,m2",
          "uncertainty": 0.25,
          "method": "Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "kg,m",
          "uncertainty": 0.2,
          "method": "Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "N/(m/s),N/(m/s)^2,dimensionless",
          "uncertainty": 0.3,
          "method": "Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "appendages": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "rudders": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "m,m2,deg,deg/s",
          "uncertainty": 0.25,
          "method": "Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "steering": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "type,deg/s",
          "uncertainty": 0.25,
          "method": "Deux postes à roue couplés au safran unique ; vitesse maximale conservée à 46°/s sans nouvelle calibration",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "aerodynamics": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "m,m2,dimensionless",
          "uncertainty": 0.25,
          "method": "Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "contacts": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "m,N/m,N,dimensionless",
          "uncertainty": 0.25,
          "method": "Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "deckHardware": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.15,
          "method": "Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mooring": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "mixed",
          "uncertainty": 0.25,
          "method": "Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.loa": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf",
          "page": "Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.beam": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf",
          "page": "Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "geometry.draft": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf",
          "page": "Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe",
          "unit": "m",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.lightDisplacement": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf",
          "page": "Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe",
          "unit": "kg",
          "uncertainty": 0.03,
          "method": "Valeur constructeur ; définition et variante conservées dans la fiche",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.displacement": {
          "sourceType": "estimated",
          "evidenceClass": "C",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "kg",
          "uncertainty": 0.08,
          "method": "Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.yawRadius": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "docs/physics/oceanis-48-fixed-keel.md",
          "page": "",
          "unit": "m",
          "uncertainty": 0.2,
          "method": "Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "mass.addedMassModel": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.25,
          "method": "Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "hull.crossFlow.linearDampingFroude": {
          "sourceType": "estimated",
          "evidenceClass": "E",
          "source": "https://fossen.biz/html/marineCraftModel.html",
          "page": "",
          "unit": "dimensionless",
          "uncertainty": 0.2,
          "method": "Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL)",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        },
        "propulsors.0.engine.powerKw": {
          "sourceType": "official",
          "evidenceClass": "A",
          "source": "https://www.yanmar.com/marine/product/engines/4jh80/",
          "page": "Spécifications moteur",
          "unit": "kW",
          "uncertainty": 0.03,
          "method": "Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv",
          "domain": "upright deep-water harbour manoeuvring, 0-4 kn; plausible, not boat-specific calibration"
        }
      }
    }
  };

  function scaledSyntheticProfile(spec) {
    const lengthScale = spec.loa / SUN_ODYSSEY_36I.geometry.loa;
    const areaScale = lengthScale * lengthScale;
    const propellerSpec = {
      diameter: spec.propulsor.diameter,
      pitch: spec.propulsor.pitch,
      blades: spec.propulsor.blades ?? 3,
      expandedAreaRatio: spec.propulsor.expandedAreaRatio ?? 0.55,
      ktAhead: spec.propulsor.ktAhead ?? 0.19,
      ktAstern: spec.propulsor.ktAstern ?? 0.14,
      ktAdvanceAhead: spec.propulsor.ktAdvanceAhead ?? 0.105,
      ktAdvanceAstern: spec.propulsor.ktAdvanceAstern ?? 0.055,
      ktWindmill: spec.propulsor.ktWindmill ?? 0.035,
      cqAhead: spec.propulsor.cqAhead ?? 0.0182,
      cqAstern: spec.propulsor.cqAstern ?? 0.0195,
      cqWindmill: spec.propulsor.cqWindmill ?? 0.0115,
      source: `${spec.provenance}; dedicated synthetic four-quadrant table`,
      uncertainty: 0.3
    };
    const mechanics = propulsionMechanics({
      powerKw: spec.propulsor.powerKw,
      maxRpm: 3200,
      diameter: spec.propulsor.diameter
    });
    const cleats = REFERENCE_CLEATS.map(cleat => ({
      ...cleat,
      position: {
        x: cleat.position.x * lengthScale,
        y: cleat.position.y * (spec.beam / SUN_ODYSSEY_36I.geometry.beam),
        z: cleat.position.z * lengthScale
      },
      attachment: {
        x: cleat.attachment.x * lengthScale,
        y: cleat.attachment.y * (spec.beam / SUN_ODYSSEY_36I.geometry.beam),
        z: cleat.attachment.z * lengthScale
      }
    }));
    const fenders = REFERENCE_FENDERS.map(fender => ({
      ...fender,
      position: {
        x: fender.position.x * lengthScale,
        y: fender.position.y * (spec.beam / SUN_ODYSSEY_36I.geometry.beam),
        z: fender.position.z * lengthScale
      },
      attachment: {
        x: fender.attachment.x * lengthScale,
        y: fender.attachment.y * (spec.beam / SUN_ODYSSEY_36I.geometry.beam),
        z: fender.attachment.z * lengthScale
      },
      preload: fender.preload * lengthScale
    }));
    const gunwale = REFERENCE_GUNWALE.map(point => ({
      x: point.x * lengthScale,
      halfBeam: point.halfBeam * (spec.beam / SUN_ODYSSEY_36I.geometry.beam),
      z: point.z * lengthScale
    }));
    return {
      schemaVersion: SCHEMA_VERSION,
      id: spec.id,
      version: "5.0.0",
      name: spec.name,
      modelClass: MODEL_CLASS,
      steering: {
        type: spec.steeringType || "wheel",
        maximumRudderRateDegS: spec.maximumRudderRateDegS || 52
      },
      validity: {
        speedThroughWaterKn: [0, 4],
        minimumDepthToDraftRatio: 4,
        supportedPhysics: ["deep-water", "low-speed", "single-fixed-propeller"],
        excludedEffects: ["waves", "shallow-water", "squat", "bank-effect"]
      },
      geometry: {
        loa: spec.loa,
        lwl: spec.lwl,
        lpp: spec.lpp,
        beam: spec.beam,
        draft: spec.draft,
        canoeDraft: spec.canoeDraft,
        wettedArea: spec.wettedArea,
        gunwale,
        hullSections: scaledHullSections(spec.lwl, spec.canoeDraft)
      },
      mass: {
        lightDisplacement: spec.lightDisplacement,
        displacement: spec.displacement,
        centerOfGravity: { x: 0, y: 0 },
        yawRadius: spec.yawRadius,
        addedMassModel: {
          type: "sectional-cross-flow",
          surgeMassRatio: spec.surgeAddedMassRatio,
          sectionalScale: spec.sectionalAddedMassScale
        }
      },
      hull: {
        axialResistance: {
          type: "linear-quadratic-wave-rise",
          ...spec.axialResistance
        },
        crossFlow: {
          type: "distributed-sections",
          cd: spec.crossFlowCd,
          areaFactor: 0.72,
          linearDampingFroude: spec.linearDampingFroude
        }
      },
      appendages: [{
        id: "fin-keel",
        type: "keel",
        position: { x: spec.keel.x, y: 0, z: -spec.draft * 0.55 },
        area: spec.keel.area,
        span: spec.keel.span,
        aspectRatio: spec.keel.aspectRatio,
        coefficients: {
          efficiency: 0.74,
          cd0: 0.02,
          normalCd90: 1.18,
          stallStartDeg: 24,
          stallEndDeg: 52
        }
      }],
      propulsors: [{
        id: "shaft-propeller",
        type: "fixed-pitch-propeller",
        position: { x: spec.propulsor.x, y: 0, z: -spec.canoeDraft * 0.8 },
        axis: { x: 1, y: 0 },
        rotation: "right",
        engine: {
          model: "synthetic-validation-engine",
          powerKw: spec.propulsor.powerKw,
          idleRpm: 850,
          maxRpm: 3200,
          dynamics: mechanics.engine
        },
        gearbox: {
          model: "synthetic-validation-gearbox",
          ratioAhead: spec.propulsor.gearAhead,
          ratioAstern: spec.propulsor.gearAstern,
          efficiency: 0.94,
          clutch: mechanics.clutch
        },
        propeller: {
          diameter: propellerSpec.diameter,
          pitch: propellerSpec.pitch,
          blades: propellerSpec.blades,
          expandedAreaRatio: propellerSpec.expandedAreaRatio,
          shaft: mechanics.shaft,
          fourQuadrant: createFourQuadrantTable(propellerSpec),
          safety: {
            maximumThrustCoefficient: 2.2,
            maximumTorqueCoefficient: 0.12
          }
        },
        transverseWalk: { base: 0.045, gain: 0.16 }
      }],
      rudders: [{
        id: "spade-rudder",
        position: { x: spec.rudder.x, y: 0, z: -spec.canoeDraft },
        axis: { x: 0, y: 0, z: 1 },
        stock: { chordFraction: spec.rudder.stockChordFraction },
        area: spec.rudder.area,
        span: spec.rudder.span,
        aspectRatio: spec.rudder.aspectRatio,
        maxAngleDeg: 35,
        coefficients: {
          efficiency: 0.72,
          cd0: 0.022,
          normalCd90: 1.12,
          stallStartDeg: 24,
          stallEndDeg: 52
        },
        slipstreamSources: ["shaft-propeller"],
        slipstream: {
          stripCount: 5,
          contractionRatio: 0.86,
          downstreamVelocityFactor: 0.55,
          upstreamVelocityFactor: 0.24,
          swirlFraction: 0.055,
          convectionTimeBoundsS: [0.05, 0.55],
          flowStraightening: 0.92,
          momentumSafetyFactor: 1.18
        }
      }],
      aerodynamics: {
        referenceWindHeight: 10,
        verticalProfile: {
          type: "bounded-power-law",
          exponent: 0.08,
          minimumVelocityFactor: 0.82,
          maximumVelocityFactor: 1.05
        },
        panels: aerodynamicPanels(
          gunwale,
          lengthScale,
          spec.beam / SUN_ODYSSEY_36I.geometry.beam,
          areaScale
        )
      },
      contacts: {
        fenderRadius: 0.175 * lengthScale,
        hullRadius: 0.22 * lengthScale,
        fenderStiffness: spec.contact.fenderStiffness,
        hullStiffness: spec.contact.hullStiffness,
        dampingRatio: 0.82,
        friction: 0.3,
        hullFriction: 0.3,
        fenderFriction: 0.03,
        forceLimit: spec.contact.forceLimit,
        fenders,
        hullEnvelope: contactEnvelopeFromGunwale(gunwale, 0.22 * lengthScale)
      },
      deckHardware: { cleats },
      mooring: {
        maxLength: 20,
        maximumLinesPerBoatCleat: 2,
        maximumHaulInducedSpeed: 0.2 * KNOT,
        humanPullForce: 200,
        haulInRate: 1,
        payOutRate: 1.2,
        tautTolerance: 0.02,
        solverTolerance: 0.001,
        solverIterations: 8,
        elasticity: {
          workingStrain: 0.15,
          workingLoadN: spec.mooringWorkingLoadN,
          dampingRatio: 0.35,
          hardeningGain: 8,
          maximumStrain: 0.20
        }
      },
      provenance: {
        values: {
          "profile": {
            sourceType: "estimated",
            source: spec.provenance,
            unit: "mixed",
            uncertainty: 0.25,
            domain: "synthetic regression limit; not a commercial vessel"
          },
          "steering": {
            sourceType: "estimated",
            source: `${spec.provenance}; KJP wheel steering prior`,
            unit: "type,deg/s",
            uncertainty: 0.25,
            domain: "synthetic regression limit; maximum rudder rate retained at 52 deg/s"
          },
          "hull.crossFlow.linearDampingFroude": {
            sourceType: "literature",
            source: "Dimensionless low-speed damping prior scaled with each profile waterline length",
            unit: "dimensionless Froude prior",
            uncertainty: 0.2,
            domain: "synthetic deep-water low-speed regression profile"
          }
        }
      }
    };
  }

  const SYNTHETIC_SMALL = scaledSyntheticProfile({
    id: "synthetic-cruiser-7m",
    name: "Petit croiseur synthétique 7 m",
    loa: 7.2,
    lwl: 6.35,
    lpp: 6.15,
    beam: 2.55,
    draft: 1.35,
    canoeDraft: 0.48,
    wettedArea: 16.5,
    lightDisplacement: 2100,
    displacement: 2500,
    yawRadius: 1.82,
    surgeAddedMassRatio: 0.07,
    sectionalAddedMassScale: 0.34,
    axialResistance: {
      surgeLinear: 58,
      surgeQuadratic: 48,
      waveRise: 18,
      waveOnset: 1.75
    },
    crossFlowCd: 1.05,
    linearDampingFroude: 0.020,
    keel: { x: -0.08, area: 1.55, span: 0.92, aspectRatio: 1.45 },
    propulsor: {
      x: -2.18,
      powerKw: 10,
      gearAhead: 2.6,
      gearAstern: 3.0,
      shaftTimeAhead: 0.42,
      shaftTimeAstern: 0.50,
      diameter: 0.305,
      pitch: 0.21,
      thrustCapAhead: 1450,
      thrustCapAstern: 920
    },
    rudder: {
      x: -2.85,
      area: 0.42,
      span: 0.80,
      aspectRatio: 1.52,
      stockChordFraction: 0.30
    },
    contact: { fenderStiffness: 26000, hullStiffness: 54000, forceLimit: 42000 },
    mooringWorkingLoadN: 6000,
    provenance: "Geometric and Froude-scaled lower-bound validation profile"
  });

  const SYNTHETIC_LARGE = scaledSyntheticProfile({
    id: "synthetic-cruiser-16m",
    name: "Grand croiseur synthétique 16 m",
    loa: 15.8,
    lwl: 14.2,
    lpp: 13.8,
    beam: 4.65,
    draft: 2.45,
    canoeDraft: 0.88,
    wettedArea: 62,
    lightDisplacement: 15500,
    displacement: 18200,
    yawRadius: 4.05,
    surgeAddedMassRatio: 0.08,
    sectionalAddedMassScale: 0.39,
    axialResistance: {
      surgeLinear: 188,
      surgeQuadratic: 245,
      waveRise: 102,
      waveOnset: 2.65
    },
    crossFlowCd: 1.1,
    linearDampingFroude: 0.020,
    keel: { x: -0.28, area: 6.8, span: 1.72, aspectRatio: 1.62 },
    propulsor: {
      x: -5.15,
      powerKw: 55,
      gearAhead: 2.5,
      gearAstern: 2.95,
      shaftTimeAhead: 0.82,
      shaftTimeAstern: 0.94,
      diameter: 0.58,
      pitch: 0.40,
      thrustCapAhead: 7200,
      thrustCapAstern: 4700
    },
    rudder: {
      x: -6.15,
      area: 1.72,
      span: 1.72,
      aspectRatio: 1.72,
      stockChordFraction: 0.30
    },
    contact: { fenderStiffness: 105000, hullStiffness: 210000, forceLimit: 185000 },
    mooringWorkingLoadN: 24000,
    provenance: "Geometric and Froude-scaled upper-bound validation profile"
  });

  const REQUIRED_PATHS = [
    "schemaVersion",
    "id",
    "version",
    "name",
    "modelClass",
    "steering.type",
    "steering.maximumRudderRateDegS",
    "validity.speedThroughWaterKn",
    "geometry.loa",
    "geometry.lwl",
    "geometry.beam",
    "geometry.draft",
    "geometry.canoeDraft",
    "geometry.wettedArea",
    "geometry.gunwale",
    "geometry.hullSections",
    "mass.displacement",
    "mass.yawRadius",
    "mass.addedMassModel",
    "hull.axialResistance",
    "hull.crossFlow",
    "appendages",
    "propulsors",
    "rudders",
    "aerodynamics.referenceWindHeight",
    "aerodynamics.panels",
    "contacts.fenders",
    "deckHardware.cleats",
    "mooring",
    "provenance.values"
  ];

  function valueAtPath(object, path) {
    return path.split(".").reduce(
      (value, key) => value && value[key],
      object
    );
  }

  function upgradeLegacyProfile(rawProfile) {
    if (
      !rawProfile
      || !ADAPTABLE_SCHEMA_VERSIONS.includes(rawProfile.schemaVersion)
    ) {
      return deepClone(rawProfile);
    }
    const upgraded = deepClone(rawProfile);
    const sourceVersion = upgraded.schemaVersion;
    upgraded.schemaVersion = SCHEMA_VERSION;
    const referenceLengthScale = (
      upgraded.geometry?.loa || SUN_ODYSSEY_36I.geometry.loa
    ) / SUN_ODYSSEY_36I.geometry.loa;
    const referenceBeamScale = (
      upgraded.geometry?.beam || SUN_ODYSSEY_36I.geometry.beam
    ) / SUN_ODYSSEY_36I.geometry.beam;
    upgraded.geometry ||= {};
    upgraded.geometry.gunwale ||= REFERENCE_GUNWALE.map(point => ({
      x: point.x * referenceLengthScale,
      halfBeam: point.halfBeam * referenceBeamScale,
      z: point.z * referenceLengthScale
    }));
    upgraded.contacts ||= {};
    upgraded.contacts.hullRadius ||= 0.22 * referenceLengthScale;
    upgraded.contacts.hullEnvelope ||= contactEnvelopeFromGunwale(
      upgraded.geometry.gunwale,
      upgraded.contacts.hullRadius
    );
    for (const fender of upgraded.contacts.fenders || []) {
      fender.preload ??= 0.01 * referenceLengthScale;
      fender.attachment ||= offsetFromGunwale(
        fender.position.x,
        fender.side,
        0,
        upgraded.geometry.gunwale
      ).attachment;
    }
    for (const cleat of upgraded.deckHardware?.cleats || []) {
      cleat.attachment ||= offsetFromGunwale(
        cleat.position.x,
        cleat.side,
        0,
        upgraded.geometry.gunwale
      ).attachment;
    }
    for (const propulsor of sourceVersion === LEGACY_SCHEMA_VERSION ? upgraded.propulsors || [] : []) {
      const propeller = propulsor.propeller || {};
      const mechanics = propulsionMechanics({
        powerKw: propulsor.engine?.powerKw || 1,
        maxRpm: propulsor.engine?.maxRpm || 3200,
        diameter: propeller.diameter || 0.3,
        engageTimeS: Math.max(
          0.2,
          Math.min(0.8, propulsor.gearbox?.shaftTimeAhead || 0.36)
        )
      });
      propulsor.engine.dynamics ||= mechanics.engine;
      propulsor.gearbox.efficiency ||= 0.94;
      propulsor.gearbox.clutch ||= mechanics.clutch;
      propeller.shaft ||= mechanics.shaft;
      propeller.fourQuadrant ||= createFourQuadrantTable({
        diameter: propeller.diameter,
        pitch: propeller.pitch,
        blades: propeller.blades,
        expandedAreaRatio: propeller.expandedAreaRatio,
        ktAhead: propeller.ktAhead,
        ktAstern: propeller.ktAstern,
        ktAdvanceAhead: propeller.ktAdvanceAhead,
        ktAdvanceAstern: propeller.ktAdvanceAstern,
        ktWindmill: propeller.ktWindmill,
        source: "legacy schema 1 deterministic adapter",
        uncertainty: 0.35
      });
      propeller.safety ||= {
        maximumThrustCoefficient: 2.2,
        maximumTorqueCoefficient: 0.12
      };
    }
    for (const rudder of sourceVersion === LEGACY_SCHEMA_VERSION ? upgraded.rudders || [] : []) {
      const legacy = rudder.slipstream || {};
      rudder.slipstream = {
        stripCount: legacy.stripCount || 5,
        contractionRatio: legacy.contractionRatio || 0.86,
        downstreamVelocityFactor: (
          legacy.downstreamVelocityFactor
          || legacy.velocityFraction
          || 0.72
        ),
        upstreamVelocityFactor: legacy.upstreamVelocityFactor || 0.24,
        swirlFraction: legacy.swirlFraction || 0.055,
        convectionTimeBoundsS: legacy.convectionTimeBoundsS || [0.05, 0.55],
        flowStraightening: legacy.flowStraightening || 0.92,
        momentumSafetyFactor: (
          legacy.momentumSafetyFactor
          || Math.max(1.05, legacy.momentumFactor || 1.18)
        ),
        legacyAreaFraction: legacy.areaFraction || 0.36
      };
    }
    for (const rudder of upgraded.rudders || []) {
      // Les anciens schémas décrivaient uniquement le centre surfacique du
      // safran. Une mèche à mi-corde conserve ce centre comme point de rotation
      // et constitue donc l'adaptation déterministe la moins intrusive.
      rudder.stock ||= { chordFraction: 0.5 };
    }
    const previousRudderRates = (upgraded.rudders || [])
      .map(rudder => rudder.rateDegS)
      .filter(value => Number.isFinite(value) && value > 0);
    upgraded.steering ||= {
      type: "wheel",
      maximumRudderRateDegS: previousRudderRates.length
        ? Math.min(...previousRudderRates)
        : 52
    };
    upgraded.provenance ||= { values: {} };
    upgraded.provenance.values ||= {};
    upgraded.mooring ||= {};
    upgraded.mooring.elasticity ||= {
      workingStrain: 0.15,
      workingLoadN: Math.max(3000, 12000 * Math.pow(
        Math.max(500, upgraded.mass?.displacement || 6500) / 6500,
        2 / 3
      )),
      dampingRatio: 0.35,
      hardeningGain: 8,
      maximumStrain: 0.20
    };
    upgraded.provenance.values["schema.adapter"] = {
      sourceType: "estimated",
      source: `deterministic schema ${sourceVersion} to schema ${SCHEMA_VERSION} compatibility adapter`,
      unit: "none",
      uncertainty: 0.35,
      domain: "temporary compatibility; rudder stock placed at mid-chord until explicitly profiled"
    };
    return upgraded;
  }

  function validateVesselProfile(profileInput) {
    const errors = [];
    const warnings = [];
    if (!profileInput || typeof profileInput !== "object") {
      return { ok: false, errors: ["Le profil doit être un objet."], warnings };
    }
    const legacyInput = ADAPTABLE_SCHEMA_VERSIONS.includes(profileInput.schemaVersion);
    const rawProfile = legacyInput
      ? upgradeLegacyProfile(profileInput)
      : profileInput;
    if (legacyInput) {
      warnings.push(
        `Profil schemaVersion ${profileInput.schemaVersion} adapté vers la version ${SCHEMA_VERSION} : vérifier la commande de barre, l'élasticité des aussières et renseigner explicitement la position de mèche du safran.`
      );
    }
    for (const path of REQUIRED_PATHS) {
      const value = valueAtPath(rawProfile, path);
      if (value === undefined || value === null) errors.push(`Champ obligatoire absent : ${path}`);
    }
    if (rawProfile.schemaVersion !== SCHEMA_VERSION) {
      errors.push(`schemaVersion ${SCHEMA_VERSION} requis.`);
    }
    if (rawProfile.modelClass !== MODEL_CLASS) {
      errors.push(`Classe non prise en charge : ${rawProfile.modelClass || "absente"}.`);
    }
    if (!["wheel", "tiller"].includes(rawProfile.steering?.type)) {
      errors.push("steering.type doit valoir wheel ou tiller.");
    }
    if (
      !Number.isFinite(rawProfile.steering?.maximumRudderRateDegS)
      || rawProfile.steering.maximumRudderRateDegS <= 0
    ) {
      errors.push("steering.maximumRudderRateDegS doit être strictement positif.");
    }
    const positivePaths = [
      "geometry.loa",
      "geometry.lwl",
      "geometry.beam",
      "geometry.draft",
      "geometry.canoeDraft",
      "geometry.wettedArea",
      "mass.displacement",
      "mass.yawRadius",
      "aerodynamics.referenceWindHeight",
      "mooring.maxLength",
      "mooring.maximumHaulInducedSpeed",
      "mooring.humanPullForce",
      "mooring.haulInRate",
      "mooring.payOutRate",
      "mooring.tautTolerance",
      "mooring.solverTolerance",
      "mooring.elasticity.workingStrain",
      "mooring.elasticity.workingLoadN",
      "mooring.elasticity.dampingRatio",
      "mooring.elasticity.hardeningGain",
      "mooring.elasticity.maximumStrain"
    ];
    for (const path of positivePaths) {
      const value = valueAtPath(rawProfile, path);
      if (!Number.isFinite(value) || value <= 0) errors.push(`${path} doit être strictement positif.`);
    }
    if (
      !Number.isInteger(rawProfile.mooring?.maximumLinesPerBoatCleat)
      || rawProfile.mooring.maximumLinesPerBoatCleat < 1
    ) {
      errors.push("mooring.maximumLinesPerBoatCleat doit être un entier strictement positif.");
    }
    if (
      !Number.isInteger(rawProfile.mooring?.solverIterations)
      || rawProfile.mooring.solverIterations < 1
    ) {
      errors.push("mooring.solverIterations doit être un entier strictement positif.");
    }
    if (
      Number.isFinite(rawProfile.mooring?.elasticity?.workingStrain)
      && Number.isFinite(rawProfile.mooring?.elasticity?.maximumStrain)
      && rawProfile.mooring.elasticity.maximumStrain
        <= rawProfile.mooring.elasticity.workingStrain
    ) {
      errors.push("mooring.elasticity.maximumStrain doit dépasser workingStrain.");
    }
    if (rawProfile.geometry?.lwl > rawProfile.geometry?.loa) {
      errors.push("geometry.lwl ne peut pas dépasser geometry.loa.");
    }
    const gunwale = rawProfile.geometry?.gunwale;
    if (
      !Array.isArray(gunwale)
      || gunwale.length < 3
      || gunwale.some((point, index) => (
        ![point?.x, point?.halfBeam, point?.z].every(Number.isFinite)
        || point.halfBeam < 0
        || index > 0 && point.x <= gunwale[index - 1].x
      ))
    ) {
      errors.push("geometry.gunwale doit décrire au moins trois stations finies, de demi-largeur non négative et ordonnées par x.");
    }
    const contactPoints = rawProfile.contacts?.hullEnvelope;
    if (
      !Array.isArray(contactPoints)
      || contactPoints.length < 3
      || contactPoints.some(point => (
        !point?.id
        || ![point.position?.x, point.position?.y, point.radius].every(Number.isFinite)
        || point.radius <= 0
      ))
    ) {
      errors.push("contacts.hullEnvelope doit contenir au moins trois échantillons circulaires valides.");
    }
    for (const fender of rawProfile.contacts?.fenders || []) {
      if (
        !fender?.id
        || ![fender.position?.x, fender.position?.y, fender.position?.z,
          fender.attachment?.x, fender.attachment?.y, fender.attachment?.z,
          fender.preload].every(Number.isFinite)
        || fender.preload < 0
        || !["port", "starboard"].includes(fender.side)
      ) {
        errors.push(`Pare-battage invalide : ${fender?.id || "sans identifiant"}.`);
      }
    }
    for (const field of ["friction", "hullFriction", "fenderFriction"]) {
      const value = rawProfile.contacts?.[field];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
        errors.push(`contacts.${field} doit être compris entre 0 et 1.`);
      }
    }
    for (const cleat of rawProfile.deckHardware?.cleats || []) {
      if (
        !cleat?.id
        || ![cleat.position?.x, cleat.position?.y, cleat.position?.z,
          cleat.attachment?.x, cleat.attachment?.y, cleat.attachment?.z].every(Number.isFinite)
        || !["port", "starboard"].includes(cleat.side)
      ) {
        errors.push(`Taquet invalide : ${cleat?.id || "sans identifiant"}.`);
      }
    }
    const linearDampingFroude = rawProfile.hull?.crossFlow?.linearDampingFroude;
    if (
      linearDampingFroude !== undefined
      && (!Number.isFinite(linearDampingFroude) || linearDampingFroude <= 0)
    ) {
      errors.push("hull.crossFlow.linearDampingFroude doit être strictement positif lorsqu'il est fourni.");
    }
    const componentGroups = ["appendages", "propulsors", "rudders"];
    const ids = new Set();
    for (const group of componentGroups) {
      const components = rawProfile[group];
      if (!Array.isArray(components) || components.length === 0) {
        errors.push(`${group} doit contenir au moins un composant.`);
        continue;
      }
      for (const component of components) {
        if (!component?.id || ids.has(component.id)) {
          errors.push(`Identifiant de composant absent ou dupliqué dans ${group}.`);
        } else {
          ids.add(component.id);
        }
      }
    }
    const propulsorIds = new Set((rawProfile.propulsors || []).map(item => item.id));
    for (const propulsor of rawProfile.propulsors || []) {
      if (!["right", "left"].includes(propulsor.rotation)) {
        errors.push(
          `Le sens de rotation du propulseur ${propulsor.id || "sans identifiant"} doit valoir right ou left.`
        );
      }
      const engine = propulsor.engine || {};
      const dynamics = engine.dynamics || {};
      const gearbox = propulsor.gearbox || {};
      const clutch = gearbox.clutch || {};
      const propeller = propulsor.propeller || {};
      const table = propeller.fourQuadrant || {};
      const shaft = propeller.shaft || {};
      const positiveValues = [
        engine.powerKw,
        engine.idleRpm,
        engine.maxRpm,
        dynamics.inertiaKgM2,
        dynamics.governorKpNmPerRadS,
        dynamics.governorKiNmPerRad,
        gearbox.ratioAhead,
        gearbox.ratioAstern,
        gearbox.efficiency,
        clutch.capacityEngineNm,
        clutch.stiffnessNmPerRadS,
        clutch.disengageTimeS,
        clutch.neutralDwellS,
        clutch.engageTimeS,
        propeller.diameter,
        propeller.pitch,
        propeller.expandedAreaRatio,
        shaft.inertiaKgM2
      ];
      if (!positiveValues.every(value => Number.isFinite(value) && value > 0)) {
        errors.push(`Chaîne propulsive incomplète ou non positive : ${propulsor.id}.`);
      }
      if (
        !Array.isArray(dynamics.torqueCurve)
        || dynamics.torqueCurve.length < 2
        || dynamics.torqueCurve.some(point => (
          !Number.isFinite(point.rpm)
          || !Number.isFinite(point.torqueNm)
          || point.rpm < 0
          || point.torqueNm <= 0
        ))
      ) {
        errors.push(`Courbe de couple moteur invalide : ${propulsor.id}.`);
      }
      if (
        table.representation !== "periodic-beta-table"
        || !Number.isInteger(table.sampleCount)
        || table.sampleCount < 8
        || !Array.isArray(table.thrust)
        || !Array.isArray(table.torque)
        || table.thrust.length !== table.sampleCount
        || table.torque.length !== table.sampleCount
        || ![...table.thrust, ...table.torque].every(Number.isFinite)
      ) {
        errors.push(`Table quatre quadrants invalide : ${propulsor.id}.`);
      }
    }
    for (const rudder of rawProfile.rudders || []) {
      const positiveValues = [
        rudder.area,
        rudder.span,
        rudder.aspectRatio,
        rudder.maxAngleDeg
      ];
      if (!positiveValues.every(value => Number.isFinite(value) && value > 0)) {
        errors.push(`Géométrie ou cinématique de safran invalide : ${rudder.id}.`);
      }
      if (
        ![rudder.axis?.x, rudder.axis?.y, rudder.axis?.z].every(Number.isFinite)
        || Math.hypot(rudder.axis.x, rudder.axis.y) > 1e-6
        || Math.abs(rudder.axis.z) < 1e-6
      ) {
        errors.push(`La mèche du safran ${rudder.id} doit définir un axe vertical fini.`);
      }
      const chordFraction = rudder.stock?.chordFraction;
      if (
        !Number.isFinite(chordFraction)
        || chordFraction < 0
        || chordFraction > 1
      ) {
        errors.push(`rudders.${rudder.id}.stock.chordFraction doit être compris entre 0 et 1.`);
      }
      for (const sourceId of rudder.slipstreamSources || []) {
        if (!propulsorIds.has(sourceId)) {
          errors.push(`Le safran ${rudder.id} référence une hélice inconnue : ${sourceId}.`);
        }
      }
      const slipstream = rudder.slipstream || {};
      if (
        !Number.isInteger(slipstream.stripCount)
        || slipstream.stripCount < 3
        || slipstream.stripCount > 15
        || !Number.isFinite(slipstream.contractionRatio)
        || slipstream.contractionRatio <= 0
        || !Array.isArray(slipstream.convectionTimeBoundsS)
        || slipstream.convectionTimeBoundsS.length !== 2
        || !slipstream.convectionTimeBoundsS.every(value => Number.isFinite(value) && value > 0)
      ) {
        errors.push(`Paramètres de jet invalides : ${rudder.id}.`);
      }
    }
    const halfLength = (rawProfile.geometry?.loa || 0) / 2;
    const halfBeam = (rawProfile.geometry?.beam || 0) / 2;
    for (const component of [
      ...(rawProfile.appendages || []),
      ...(rawProfile.propulsors || []),
      ...(rawProfile.rudders || [])
    ]) {
      const position = component.position || {};
      if (![position.x, position.y, position.z].every(Number.isFinite)) {
        errors.push(`Position invalide pour ${component.id || "composant inconnu"}.`);
      } else if (
        Math.abs(position.x) > halfLength * 1.15
        || Math.abs(position.y) > halfBeam * 1.15
      ) {
        errors.push(`Position hors coque pour ${component.id}.`);
      }
    }
    for (const panel of rawProfile.aerodynamics?.panels || []) {
      if (
        !panel.id
        || !Number.isFinite(panel.area)
        || panel.area <= 0
        || ![panel.normalBody?.x, panel.normalBody?.y].every(Number.isFinite)
        || ![panel.center?.x, panel.center?.y, panel.center?.z].every(Number.isFinite)
      ) {
        errors.push(`Panneau aérodynamique invalide : ${panel.id || "sans identifiant"}.`);
      } else if (
        Math.abs(panel.center.x) > halfLength * 1.15
        || Math.abs(panel.center.y) > halfBeam * 1.15
        || panel.center.z < 0
      ) {
        errors.push(`Centre aérodynamique hors gabarit émergé : ${panel.id}.`);
      }
    }
    if (!Object.keys(rawProfile.provenance?.values || {}).length) {
      errors.push("provenance.values doit documenter les données critiques.");
    }
    if (rawProfile.id?.startsWith("synthetic-")) {
      warnings.push("Profil synthétique de validation : ne pas le présenter comme un bateau réel.");
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  function flattenPropulsor(propulsor) {
    return {
      id: propulsor.id,
      type: propulsor.type,
      x: propulsor.position.x,
      y: propulsor.position.y,
      z: propulsor.position.z,
      axis: deepClone(propulsor.axis),
      rotation: propulsor.rotation,
      enginePowerKw: propulsor.engine.powerKw,
      idleRpm: propulsor.engine.idleRpm,
      maxRpm: propulsor.engine.maxRpm,
      engineDynamics: deepClone(propulsor.engine.dynamics),
      gearAhead: propulsor.gearbox.ratioAhead,
      gearAstern: propulsor.gearbox.ratioAstern,
      gearEfficiency: propulsor.gearbox.efficiency,
      clutch: deepClone(propulsor.gearbox.clutch),
      shaftTimeAhead: (
        propulsor.gearbox.shaftTimeAhead
        || propulsor.gearbox.clutch.engageTimeS
      ),
      shaftTimeAstern: (
        propulsor.gearbox.shaftTimeAstern
        || propulsor.gearbox.clutch.engageTimeS
      ),
      ...deepClone(propulsor.propeller),
      walkBase: propulsor.transverseWalk?.base || 0,
      walkGain: propulsor.transverseWalk?.gain || 0
    };
  }

  function flattenRudder(rudder, steering) {
    const meanChord = rudder.area / rudder.span;
    const stockChordFraction = rudder.stock.chordFraction;
    const stockOffset = (0.5 - stockChordFraction) * meanChord;
    return {
      id: rudder.id,
      x: rudder.position.x,
      y: rudder.position.y,
      z: rudder.position.z,
      axis: deepClone(rudder.axis),
      meanChord,
      stockChordFraction,
      stock: {
        x: rudder.position.x + stockOffset,
        y: rudder.position.y,
        chordFraction: stockChordFraction
      },
      area: rudder.area,
      aspectRatio: rudder.aspectRatio,
      efficiency: rudder.coefficients.efficiency,
      cd0: rudder.coefficients.cd0,
      normalCd90: rudder.coefficients.normalCd90,
      stallStart: rudder.coefficients.stallStartDeg * DEG,
      stallEnd: rudder.coefficients.stallEndDeg * DEG,
      maxAngle: rudder.maxAngleDeg * DEG,
      rate: steering.maximumRudderRateDegS * DEG,
      span: rudder.span,
      slipstreamSources: [...(rudder.slipstreamSources || [])],
      slipstreamAreaFraction: rudder.slipstream.legacyAreaFraction || 0.36,
      slipstreamVelocityFraction: rudder.slipstream.downstreamVelocityFactor,
      slipstreamTurnEfficiency: rudder.slipstream.flowStraightening,
      slipstreamMomentumFactor: rudder.slipstream.momentumSafetyFactor,
      slipstream: deepClone(rudder.slipstream)
    };
  }

  function flattenAppendage(appendage) {
    return {
      id: appendage.id,
      type: appendage.type,
      x: appendage.position.x,
      y: appendage.position.y,
      z: appendage.position.z,
      area: appendage.area,
      span: appendage.span,
      aspectRatio: appendage.aspectRatio,
      efficiency: appendage.coefficients.efficiency,
      cd0: appendage.coefficients.cd0,
      normalCd90: appendage.coefficients.normalCd90,
      stallStart: appendage.coefficients.stallStartDeg * DEG,
      stallEnd: appendage.coefficients.stallEndDeg * DEG
    };
  }

  function compileVesselProfile(rawProfile) {
    if (rawProfile?.compiled === true) return rawProfile;
    const report = validateVesselProfile(rawProfile);
    if (!report.ok) {
      throw new Error(`Profil bateau invalide : ${report.errors.join(" ; ")}`);
    }
    const raw = ADAPTABLE_SCHEMA_VERSIONS.includes(rawProfile.schemaVersion)
      ? upgradeLegacyProfile(rawProfile)
      : deepClone(rawProfile);
    const appendages = raw.appendages.map(flattenAppendage);
    const propulsors = raw.propulsors.map(flattenPropulsor);
    const rudders = raw.rudders.map(rudder => flattenRudder(rudder, raw.steering));
    const cleats = raw.deckHardware.cleats.map(cleat => ({
      id: cleat.id,
      x: cleat.position.x,
      y: cleat.position.y,
      z: cleat.position.z,
      side: cleat.side,
      station: cleat.station,
      attachment: deepClone(cleat.attachment)
    }));
    const fenders = raw.contacts.fenders.map(fender => ({
      id: fender.id,
      x: fender.position.x,
      y: fender.position.y,
      z: fender.position.z,
      side: fender.side,
      preload: fender.preload,
      attachment: deepClone(fender.attachment)
    }));
    const compiled = {
      compiled: true,
      schemaVersion: raw.schemaVersion,
      id: raw.id,
      version: raw.version,
      name: raw.name,
      modelClass: raw.modelClass,
      steering: deepClone(raw.steering),
      validity: raw.validity,
      geometry: raw.geometry,
      mass: raw.mass,
      hull: raw.hull,
      appendages,
      propulsors,
      rudders,
      aerodynamics: raw.aerodynamics,
      contacts: {
        ...raw.contacts,
        hullFriction: raw.contacts.hullFriction ?? raw.contacts.friction,
        fenderFriction: raw.contacts.fenderFriction ?? raw.contacts.friction,
        fenders
      },
      deckHardware: { cleats },
      mooring: {
        ...raw.mooring,
        cleats
      },
      provenance: raw.provenance,
      warnings: report.warnings,
      configuration: {
        propellers: propulsors.length,
        rudders: rudders.length,
        bowThruster: false,
        sternThruster: false
      },
      dimensions: {
        lengthOverall: raw.geometry.loa,
        waterline: raw.geometry.lwl,
        beam: raw.geometry.beam,
        draft: raw.geometry.draft,
        canoeDraft: raw.geometry.canoeDraft,
        wettedArea: raw.geometry.wettedArea
      },
      inertia: {
        lightMass: raw.mass.lightDisplacement,
        loadedMass: raw.mass.displacement,
        yawRadius: raw.mass.yawRadius,
        surgeAddedMassRatio: raw.mass.addedMassModel.surgeMassRatio,
        sectionAddedMassScale: raw.mass.addedMassModel.sectionalScale
      },
      resistance: {
        ...raw.hull.axialResistance,
        crossFlowCd: raw.hull.crossFlow.cd,
        crossFlowAreaFactor: raw.hull.crossFlow.areaFactor,
        crossFlowLinearDampingFroude: raw.hull.crossFlow.linearDampingFroude || 0,
        crossFlowLinearSpeed: (
          (raw.hull.crossFlow.linearDampingFroude || 0)
          * Math.sqrt(GRAVITY * raw.geometry.lwl)
        )
      },
      keel: appendages.find(item => item.type === "keel") || appendages[0],
      propulsion: propulsors[0],
      rudder: rudders[0],
      windage: {
        referenceWindHeight: raw.aerodynamics.referenceWindHeight,
        verticalProfile: raw.aerodynamics.verticalProfile,
        panels: raw.aerodynamics.panels
      }
    };
    return deepFreeze(compiled);
  }

  const CALIBRATION_BOUNDS = deepFreeze({
    mass: [0.6, 1.5],
    windage: [0.3, 2],
    rudder: [0.3, 2],
    lateral: [0.3, 2]
  });

  function applyCalibrationPatch(compiledProfile, patch = {}) {
    const profile = compileVesselProfile(compiledProfile);
    const unknown = Object.keys(patch).filter(key => !(key in CALIBRATION_BOUNDS));
    if (unknown.length) {
      throw new Error(`Paramètre de calibration interdit : ${unknown.join(", ")}.`);
    }
    const multipliers = {};
    for (const [key, bounds] of Object.entries(CALIBRATION_BOUNDS)) {
      const value = patch[key] === undefined ? 1 : Number(patch[key]);
      if (!Number.isFinite(value) || value < bounds[0] || value > bounds[1]) {
        throw new Error(
          `Calibration ${key} hors limites [${bounds[0]}, ${bounds[1]}].`
        );
      }
      multipliers[key] = value;
    }
    return deepFreeze({
      profile,
      multipliers,
      massKg: profile.inertia.loadedMass * multipliers.mass
    });
  }

  const RAW_PROFILES = deepFreeze({
    [SUN_ODYSSEY_36I.id]: SUN_ODYSSEY_36I,
    [DUFOUR_310_GL_2014.id]: DUFOUR_310_GL_2014,
    [SUN_ODYSSEY_24_2.id]: SUN_ODYSSEY_24_2,
    [CONTESSA_26.id]: CONTESSA_26,
    [POGO_40_S4.id]: POGO_40_S4,
    [OCEANIS_48.id]: OCEANIS_48,
    [SYNTHETIC_SMALL.id]: SYNTHETIC_SMALL,
    [SYNTHETIC_LARGE.id]: SYNTHETIC_LARGE
  });
  const COMPILED_PROFILES = deepFreeze(Object.fromEntries(
    Object.entries(RAW_PROFILES).map(([id, profile]) => [id, compileVesselProfile(profile)])
  ));
  const DEFAULT_PROFILE = COMPILED_PROFILES[SUN_ODYSSEY_36I.id];
  const COMMERCIAL_PROFILE_IDS = deepFreeze([
    SUN_ODYSSEY_36I.id,
    DUFOUR_310_GL_2014.id,
    SUN_ODYSSEY_24_2.id,
    CONTESSA_26.id,
    POGO_40_S4.id,
    OCEANIS_48.id
  ]);

  return deepFreeze({
    SCHEMA_VERSION,
    MODEL_CLASS,
    RAW_PROFILES,
    COMPILED_PROFILES,
    DEFAULT_PROFILE,
    COMMERCIAL_PROFILE_IDS,
    upgradeLegacyProfile,
    validateVesselProfile,
    compileVesselProfile,
    applyCalibrationPatch
  });
});
