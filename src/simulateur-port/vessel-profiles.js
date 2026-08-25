(function initVesselProfiles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PortVesselProfiles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVesselProfilesApi() {
  "use strict";

  const DEG = Math.PI / 180;
  const KNOT = 0.514444;
  const GRAVITY = 9.80665;
  const SCHEMA_VERSION = 3;
  const LEGACY_SCHEMA_VERSION = 1;
  const PREVIOUS_SCHEMA_VERSION = 2;
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

  function scaledHullSections(lwl, canoeDraft) {
    const shapes = [0.28, 0.51, 0.73, 0.88, 0.97, 1, 0.96, 0.86, 0.70, 0.48, 0.22];
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

  function aerodynamicPanels(scaleLength = 1, scaleArea = 1) {
    const point = (x, y, z) => ({
      // Décalage calibré conjointement avec la résistance latérale : il place
      // le centre aérodynamique de la coque nue derrière le CG, sans fixer le
      // point de pivot ni ajouter de couple de rappel.
      x: (x - 0.30) * scaleLength,
      y: y * scaleLength,
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
    return [
      side("freeboard-aft-starboard", 7.0, -0.12, 0.993, -2.30, 1.42, 1.02),
      side("freeboard-aft-port", 7.0, -0.12, -0.993, -2.30, -1.42, 1.02),
      side("freeboard-fore-starboard", 4.4, 0.18, 0.984, 2.00, 1.25, 1.08),
      side("freeboard-fore-port", 4.4, 0.18, -0.984, 2.00, -1.25, 1.08),
      side("coachroof-aft-starboard", 2.5, -0.08, 0.997, -1.00, 0.82, 1.82),
      side("coachroof-aft-port", 2.5, -0.08, -0.997, -1.00, -0.82, 1.82),
      side("coachroof-fore-starboard", 1.5, 0.12, 0.993, 1.20, 0.70, 1.88),
      side("coachroof-fore-port", 1.5, 0.12, -0.993, 1.20, -0.70, 1.88),
      side("boom-starboard", 1.0, 0, 1, -0.20, 0.18, 3.05, 0.92),
      side("boom-port", 1.0, 0, -1, -0.20, -0.18, 3.05, 0.92),
      {
        id: "mast-rigging",
        area: 2.15 * scaleArea,
        normalBody: { x: 0, y: 1 },
        center: point(0.35, 0, 5.10),
        cdNormal: 1.08,
        cdTangential: 1.08,
        exposure: 0.95,
        omnidirectional: true
      },
      {
        id: "bow-front",
        area: 4.0 * scaleArea,
        normalBody: { x: 1, y: 0 },
        center: point(3.05, 0, 1.24),
        cdNormal: 0.72,
        cdTangential: 0.04,
        exposure: 0.92,
        twoSided: false
      },
      {
        id: "transom-cockpit",
        area: 5.2 * scaleArea,
        normalBody: { x: -1, y: 0 },
        center: point(-3.20, 0, 1.28),
        cdNormal: 1.02,
        cdTangential: 0.04,
        exposure: 0.96,
        twoSided: false
      }
    ];
  }

  const REFERENCE_CLEATS = [
    { id: "bow-port", position: { x: 4.25, y: -1.45, z: 1.16 }, side: "port", station: "bow" },
    { id: "mid-port", position: { x: 0, y: -1.68, z: 1.16 }, side: "port", station: "mid" },
    { id: "stern-port", position: { x: -4.2, y: -1.42, z: 1.16 }, side: "port", station: "stern" },
    { id: "bow-starboard", position: { x: 4.25, y: 1.45, z: 1.16 }, side: "starboard", station: "bow" },
    { id: "mid-starboard", position: { x: 0, y: 1.68, z: 1.16 }, side: "starboard", station: "mid" },
    { id: "stern-starboard", position: { x: -4.2, y: 1.42, z: 1.16 }, side: "starboard", station: "stern" }
  ];

  const REFERENCE_FENDERS = [
    { id: "fender-bow-port", position: { x: 3.55, y: -1.617, z: 0.9 }, side: "port", preload: 0.01 },
    { id: "fender-mid-port", position: { x: 0, y: -1.918, z: 0.9 }, side: "port", preload: 0.01 },
    { id: "fender-stern-port", position: { x: -3.55, y: -1.821, z: 0.9 }, side: "port", preload: 0.01 },
    { id: "fender-bow-starboard", position: { x: 3.55, y: 1.617, z: 0.9 }, side: "starboard", preload: 0.01 },
    { id: "fender-mid-starboard", position: { x: 0, y: 1.918, z: 0.9 }, side: "starboard", preload: 0.01 },
    { id: "fender-stern-starboard", position: { x: -3.55, y: 1.821, z: 0.9 }, side: "starboard", preload: 0.01 }
  ];

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

  const SUN_ODYSSEY_36I = {
    schemaVersion: SCHEMA_VERSION,
    id: "sun-odyssey-36i-pedagogical",
    version: "5.2.0",
    name: "Sun Odyssey 36i",
    modelClass: MODEL_CLASS,
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
      position: { x: -3.45, y: 0, z: -0.55 },
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
      area: 0.82,
      span: 1.18,
      aspectRatio: 1.38,
      maxAngleDeg: 35,
      rateDegS: 52,
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
      hullRadius: 0.32,
      fenderStiffness: 48000,
      hullStiffness: 98000,
      dampingRatio: 0.82,
      friction: 0.30,
      forceLimit: 90000,
      fenders: REFERENCE_FENDERS,
      hullEnvelope: [
        { id: "hull-bow", position: { x: 5.22, y: 0 }, radius: 0.32 },
        { id: "hull-stern", position: { x: -5.22, y: 0 }, radius: 0.32 },
        { id: "hull-port-bow", position: { x: 2.3, y: -1.695 }, radius: 0.22 },
        { id: "hull-port-stern", position: { x: -2.3, y: -1.695 }, radius: 0.22 },
        { id: "hull-starboard-bow", position: { x: 2.3, y: 1.695 }, radius: 0.22 },
        { id: "hull-starboard-stern", position: { x: -2.3, y: 1.695 }, radius: 0.22 }
      ]
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
        "aerodynamics.panels": {
          sourceType: "calibrated",
          source: "Geometric decomposition; USCG medium-displacement sailboat leeway prior",
          unit: "m2,m",
          uncertainty: 0.2,
          domain: "bare cruising yacht, 6-20 kn apparent wind"
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
          source: "Tangence géométrique au bordé local avec précharge de 1 cm",
          unit: "m",
          uncertainty: 0.03,
          domain: "pare-battages de diamètre 0,35 m"
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
      }
    }));
    const fenders = REFERENCE_FENDERS.map(fender => ({
      ...fender,
      position: {
        x: fender.position.x * lengthScale,
        y: fender.position.y * (spec.beam / SUN_ODYSSEY_36I.geometry.beam),
        z: fender.position.z * lengthScale
      }
    }));
    return {
      schemaVersion: SCHEMA_VERSION,
      id: spec.id,
      version: "3.2.0",
      name: spec.name,
      modelClass: MODEL_CLASS,
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
        area: spec.rudder.area,
        span: spec.rudder.span,
        aspectRatio: spec.rudder.aspectRatio,
        maxAngleDeg: 35,
        rateDegS: 52,
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
        panels: aerodynamicPanels(lengthScale, areaScale)
      },
      contacts: {
        fenderRadius: 0.175 * lengthScale,
        hullRadius: 0.32 * lengthScale,
        fenderStiffness: spec.contact.fenderStiffness,
        hullStiffness: spec.contact.hullStiffness,
        dampingRatio: 0.82,
        friction: 0.3,
        forceLimit: spec.contact.forceLimit,
        fenders,
        hullEnvelope: [
          { id: "hull-bow", position: { x: spec.loa / 2 - 0.25 * lengthScale, y: 0 }, radius: 0.32 * lengthScale },
          { id: "hull-stern", position: { x: -spec.loa / 2 + 0.25 * lengthScale, y: 0 }, radius: 0.32 * lengthScale }
        ]
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
    rudder: { x: -2.85, area: 0.42, span: 0.80, aspectRatio: 1.52 },
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
    rudder: { x: -6.15, area: 1.72, span: 1.72, aspectRatio: 1.72 },
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
    "validity.speedThroughWaterKn",
    "geometry.loa",
    "geometry.lwl",
    "geometry.beam",
    "geometry.draft",
    "geometry.canoeDraft",
    "geometry.wettedArea",
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
      || ![LEGACY_SCHEMA_VERSION, PREVIOUS_SCHEMA_VERSION].includes(rawProfile.schemaVersion)
    ) {
      return deepClone(rawProfile);
    }
    const upgraded = deepClone(rawProfile);
    const sourceVersion = upgraded.schemaVersion;
    upgraded.schemaVersion = SCHEMA_VERSION;
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
      source: `deterministic schema ${sourceVersion} to schema 3 compatibility adapter`,
      unit: "none",
      uncertainty: 0.35,
      domain: "temporary compatibility; replace with an explicit profile"
    };
    return upgraded;
  }

  function validateVesselProfile(profileInput) {
    const errors = [];
    const warnings = [];
    if (!profileInput || typeof profileInput !== "object") {
      return { ok: false, errors: ["Le profil doit être un objet."], warnings };
    }
    const legacyInput = [LEGACY_SCHEMA_VERSION, PREVIOUS_SCHEMA_VERSION]
      .includes(profileInput.schemaVersion);
    const rawProfile = legacyInput
      ? upgradeLegacyProfile(profileInput)
      : profileInput;
    if (legacyInput) {
      warnings.push(
        `Profil schemaVersion ${profileInput.schemaVersion} adapté vers la version 3 : vérifier les paramètres d'élasticité des aussières.`
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
      if (![position.x, position.y].every(Number.isFinite)) {
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

  function flattenRudder(rudder) {
    return {
      id: rudder.id,
      x: rudder.position.x,
      y: rudder.position.y,
      z: rudder.position.z,
      area: rudder.area,
      aspectRatio: rudder.aspectRatio,
      efficiency: rudder.coefficients.efficiency,
      cd0: rudder.coefficients.cd0,
      normalCd90: rudder.coefficients.normalCd90,
      stallStart: rudder.coefficients.stallStartDeg * DEG,
      stallEnd: rudder.coefficients.stallEndDeg * DEG,
      maxAngle: rudder.maxAngleDeg * DEG,
      rate: rudder.rateDegS * DEG,
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
    const raw = [LEGACY_SCHEMA_VERSION, PREVIOUS_SCHEMA_VERSION].includes(rawProfile.schemaVersion)
      ? upgradeLegacyProfile(rawProfile)
      : deepClone(rawProfile);
    const appendages = raw.appendages.map(flattenAppendage);
    const propulsors = raw.propulsors.map(flattenPropulsor);
    const rudders = raw.rudders.map(flattenRudder);
    const cleats = raw.deckHardware.cleats.map(cleat => ({
      id: cleat.id,
      x: cleat.position.x,
      y: cleat.position.y,
      z: cleat.position.z,
      side: cleat.side,
      station: cleat.station
    }));
    const fenders = raw.contacts.fenders.map(fender => ({
      id: fender.id,
      x: fender.position.x,
      y: fender.position.y,
      z: fender.position.z,
      side: fender.side
    }));
    const compiled = {
      compiled: true,
      schemaVersion: raw.schemaVersion,
      id: raw.id,
      version: raw.version,
      name: raw.name,
      modelClass: raw.modelClass,
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
    [SYNTHETIC_SMALL.id]: SYNTHETIC_SMALL,
    [SYNTHETIC_LARGE.id]: SYNTHETIC_LARGE
  });
  const COMPILED_PROFILES = deepFreeze(Object.fromEntries(
    Object.entries(RAW_PROFILES).map(([id, profile]) => [id, compileVesselProfile(profile)])
  ));
  const DEFAULT_PROFILE = COMPILED_PROFILES[SUN_ODYSSEY_36I.id];

  return deepFreeze({
    SCHEMA_VERSION,
    MODEL_CLASS,
    RAW_PROFILES,
    COMPILED_PROFILES,
    DEFAULT_PROFILE,
    upgradeLegacyProfile,
    validateVesselProfile,
    compileVesselProfile,
    applyCalibrationPatch
  });
});
