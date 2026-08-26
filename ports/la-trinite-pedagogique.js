(function installPortTopology(root, factory) {
  "use strict";

  // Contrat de chargement sans réseau :
  // - une unité x/y/z vaut exactement un mètre ;
  // - les angles sont en radians, 0 vers l'est et positifs vers le nord ;
  // - le fichier expose une topologie immuable dans globalThis.PORT_TOPOLOGY ;
  // - remplacer le src dans src/simulateur-port/template.html puis reconstruire
  //   suffit pour changer de port, à condition de conserver schemaVersion = 2 ;
  // - le build intègre ensuite cette topologie dans le HTML autonome.
  const topology = factory();
  if (typeof module === "object" && module.exports) module.exports = topology;
  root.PORT_TOPOLOGY = topology;
}(typeof globalThis !== "undefined" ? globalThis : this, function createPortTopology() {
  "use strict";

  const deepFreeze = value => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
  };

  const catwayRows = [-26.5, -17.5, -8.5, 0.5, 9.5, 18.5];
  const berthRows = catwayRows
    .slice(0, -1)
    .map((row, index) => (row + catwayRows[index + 1]) / 2);
  const layout = {
    berthRows,
    catwayRows,
    catwayPitch: 9,
    catwayLength: 12.6,
    catwayWidth: 0.7,
    catwayRootOverlap: 0.15,
    berthFenderGap: 0.18,
    playerFenderGap: 0.30,
    minimumBetweenBoats: 0.5,
    pontoonHalfWidth: 1.3,
    breakwaterHalfWidth: 2.5,
    westPontoonX: -48,
    centralPontoonX: 0,
    eastBreakwaterX: 52,
    northExitY: 60
  };

  const docks = [
    { id: "quay-south", x: -4, y: -49, w: 112, h: 6, z: 0.42, height: 0.84, baseZ: 0, topZ: 0.84, deckZ: 0.84, kind: "quay" },
    { id: "ponton-west", x: layout.westPontoonX, y: -13.5, w: 2.6, h: 65, z: 0.18, height: 0.36, baseZ: 0, topZ: 0.36, deckZ: 0.36, kind: "ponton" },
    { id: "ponton-central", x: layout.centralPontoonX, y: -13.5, w: 2.6, h: 65, z: 0.18, height: 0.36, baseZ: 0, topZ: 0.36, deckZ: 0.36, kind: "ponton" },
    { id: "breakwater-east", x: layout.eastBreakwaterX, y: 3, w: 5, h: 98, z: 0.62, height: 1.24, baseZ: 0, topZ: 1.24, deckZ: 1.24, kind: "breakwater" }
  ];

  const catwaySides = [
    {
      id: "west-outside",
      dockId: "ponton-west",
      edgeX: layout.westPontoonX - layout.pontoonHalfWidth,
      direction: -1
    },
    {
      id: "west-inner",
      dockId: "ponton-west",
      edgeX: layout.westPontoonX + layout.pontoonHalfWidth,
      direction: 1
    },
    {
      id: "central-west",
      dockId: "ponton-central",
      edgeX: layout.centralPontoonX - layout.pontoonHalfWidth,
      direction: -1
    },
    {
      id: "central-east",
      dockId: "ponton-central",
      edgeX: layout.centralPontoonX + layout.pontoonHalfWidth,
      direction: 1
    },
    {
      id: "breakwater-west",
      dockId: "breakwater-east",
      edgeX: layout.eastBreakwaterX - layout.breakwaterHalfWidth,
      direction: -1
    }
  ];

  const dockById = new Map(docks.map(dock => [dock.id, dock]));
  const catways = [];
  for (const side of catwaySides) {
    for (const y of layout.catwayRows) {
      const parent = dockById.get(side.dockId);
      const catwayDeckZ = 0.36;
      const parentDeckZ = parent.z + parent.height / 2;
      // Une différence de niveau ne crée jamais implicitement une rampe.
      // Le raccord articulé maintient le catway flottant à son niveau d'eau ;
      // une rampe ne doit apparaître que si elle est explicitement modélisée.
      const connector = Math.abs(parentDeckZ - catwayDeckZ) <= 0.08 ? "flush" : "hinge";
      catways.push({
        id: `catway-${side.id}-${y}`,
        dockId: side.dockId,
        berthSide: side.id,
        x: side.edgeX + side.direction * (
          layout.catwayLength / 2 - layout.catwayRootOverlap
        ),
        y,
        w: layout.catwayLength,
        h: layout.catwayWidth,
        z: catwayDeckZ - 0.15,
        height: 0.3,
        baseZ: catwayDeckZ - 0.3,
        topZ: catwayDeckZ,
        deckZ: catwayDeckZ,
        kind: "catway",
        direction: side.direction,
        parentId: side.dockId,
        attachment: {
          parentId: side.dockId,
          parentEdge: side.id,
          station: y,
          rootOverlap: layout.catwayRootOverlap,
          deckZ: catwayDeckZ,
          connector,
          connectorLength: 0
        },
        hiddenFaces: [side.direction > 0 ? "x0" : "x1"]
      });
    }
  }

  const mooringCleats = [];
  const cleatId = (parentId, edge, station) => (
    `cleat-${parentId}-${edge}-${station}`
  );
  for (const catway of catways) {
    const rootX = catway.x - catway.direction * catway.w / 2;
    const stations = [
      ["root", 1],
      ["mid", catway.w / 2],
      ["tip", catway.w - 1]
    ];
    for (const [station, distance] of stations) {
      for (const [edge, edgeSign] of [["south", -1], ["north", 1]]) {
        mooringCleats.push({
          id: cleatId(catway.id, edge, station),
          parentId: catway.id,
          kind: "catway",
          edge,
          station,
          x: rootX + catway.direction * distance,
          y: catway.y + edgeSign * (catway.h / 2 - 0.09),
          z: catway.z + catway.height / 2 + 0.12,
          orientation: 0
        });
      }
    }
  }

  for (const dock of docks.filter(item => item.kind === "ponton")) {
    for (const [edge, edgeSign] of [["west", -1], ["east", 1]]) {
      for (const berthRow of berthRows) {
        for (const offset of [-2.5, 2.5]) {
          const station = `${berthRow}-${offset < 0 ? "south" : "north"}`;
          mooringCleats.push({
            id: cleatId(dock.id, edge, station),
            parentId: dock.id,
            kind: "ponton",
            edge,
            station,
            x: dock.x + edgeSign * (dock.w / 2 - 0.12),
            y: berthRow + offset,
            z: dock.z + dock.height / 2 + 0.12,
            orientation: Math.PI / 2
          });
        }
      }
    }
  }

  const berthLanes = {
    "west-outside": { x: -55.45, heading: Math.PI, exitX: -68, fairway: "outside-west" },
    "west-inner": { x: -40.55, heading: 0, exitX: -27.5, fairway: "west-central" },
    "central-west": { x: -7.25, heading: Math.PI, exitX: -20.2, fairway: "west-central" },
    "central-east": { x: 7.25, heading: 0, exitX: 20.2, fairway: "central-east" },
    "breakwater-west": { x: 43.15, heading: Math.PI, exitX: 30, fairway: "central-east" }
  };

  /*
   * Un intervalle entre deux catways contient deux places : une le long du
   * catway sud et une le long du catway nord. Le centre d'un bateau n'est donc
   * jamais placé artificiellement au milieu de l'intervalle.
   */
  const berthPosition = (
    berth,
    berthRow,
    berthSlot,
    beam,
    fenderGap = layout.berthFenderGap
  ) => {
    if (!layout.berthRows.includes(berthRow)) {
      throw new Error(`Rangée de place inconnue : ${berthRow}`);
    }
    if (!["south", "north"].includes(berthSlot)) {
      throw new Error(`Côté de place inconnu : ${berthSlot}`);
    }
    const rowIndex = layout.berthRows.indexOf(berthRow);
    const catwayY = layout.catwayRows[
      rowIndex + (berthSlot === "north" ? 1 : 0)
    ];
    const towardGap = berthSlot === "north" ? -1 : 1;
    return {
      x: berthLanes[berth].x,
      y: (
        catwayY
        + towardGap * (
          layout.catwayWidth / 2
          + fenderGap
          + beam / 2
        )
      ),
      berth,
      berthRow,
      berthSlot,
      fenderGap,
      catwayId: `catway-${berth}-${catwayY}`
    };
  };

  const berthedBoat = boat => ({
    ...boat,
    ...berthPosition(boat.berth, boat.berthRow, boat.berthSlot, boat.beam)
  });

  const staticBoats = [
    berthedBoat({ id: "s01", berth: "west-outside", berthRow: -22, berthSlot: "south", heading: Math.PI, length: 9.4, beam: 3.1, color: "#e9e4d7" }),
    berthedBoat({ id: "s02", berth: "west-outside", berthRow: -22, berthSlot: "north", heading: Math.PI, length: 10.2, beam: 3.35, color: "#e6e2d5" }),
    berthedBoat({ id: "s03", berth: "west-outside", berthRow: 14, berthSlot: "south", heading: Math.PI, length: 8.8, beam: 2.95, color: "#f0ece0" }),
    berthedBoat({ id: "s04", berth: "west-inner", berthRow: -13, berthSlot: "south", heading: 0, length: 10.5, beam: 3.45, color: "#ede8db" }),
    berthedBoat({ id: "s05", berth: "west-inner", berthRow: 5, berthSlot: "south", heading: 0, length: 9.2, beam: 3.05, color: "#e4dfd3" }),
    berthedBoat({ id: "s06", berth: "west-inner", berthRow: 5, berthSlot: "north", heading: 0, length: 10.8, beam: 3.5, color: "#e5dfd0" }),
    berthedBoat({ id: "s07", berth: "central-west", berthRow: -22, berthSlot: "north", heading: Math.PI, length: 8.9, beam: 2.9, color: "#eee9dc" }),
    berthedBoat({ id: "s08", berth: "central-west", berthRow: -4, berthSlot: "south", heading: Math.PI, length: 10.1, beam: 3.3, color: "#e7e2d6" }),
    berthedBoat({ id: "s09", berth: "central-west", berthRow: -4, berthSlot: "north", heading: Math.PI, length: 9.8, beam: 3.2, color: "#e9e3d7" }),
    berthedBoat({ id: "s10", berth: "central-east", berthRow: -22, berthSlot: "south", heading: 0, length: 10.4, beam: 3.4, color: "#efeadd" }),
    berthedBoat({ id: "s11", berth: "central-east", berthRow: -22, berthSlot: "north", heading: 0, length: 9.1, beam: 3, color: "#e4dfd4" }),
    berthedBoat({ id: "s12", berth: "central-east", berthRow: -4, berthSlot: "north", heading: 0, length: 9.7, beam: 3.2, color: "#e8e3d7" }),
    berthedBoat({ id: "s13", berth: "central-east", berthRow: 14, berthSlot: "south", heading: 0, length: 10.6, beam: 3.45, color: "#f0ebe0" }),
    berthedBoat({ id: "s14", berth: "breakwater-west", berthRow: -22, berthSlot: "south", heading: Math.PI, length: 11.5, beam: 3.6, color: "#e5e0d4" }),
    berthedBoat({ id: "s15", berth: "breakwater-west", berthRow: -4, berthSlot: "north", heading: Math.PI, length: 10.8, beam: 3.5, color: "#eee9dd" }),
    berthedBoat({ id: "s16", berth: "breakwater-west", berthRow: 14, berthSlot: "north", heading: Math.PI, length: 11.3, beam: 3.55, color: "#e7e2d6" })
  ];

  const trainingExitBerth = {
    id: "place-sortie-pedagogique",
    lane: "central-east",
    ...berthPosition(
      "central-east",
      5,
      "north",
      3.59,
      layout.playerFenderGap
    ),
    heading: 0
  };
  const trainingApproachBerth = {
    id: "place-approche-pedagogique",
    lane: "central-east",
    ...berthPosition(
      "central-east",
      5,
      "south",
      3.59,
      layout.playerFenderGap
    ),
    heading: Math.PI
  };

  // Atelier méditerranéen compact : trois postes cul au quai, sans catway.
  // La place centrale est réservée aux exercices, les deux voisines sont occupées.
  const medQuay = {
    id: "med-quay",
    x: -90,
    y: 45,
    w: 30,
    h: 2,
    z: 0.32,
    height: 0.64,
    baseZ: 0,
    topZ: 0.64,
    deckZ: 0.64,
    kind: "quay"
  };
  docks.push(medQuay);
  const medBerthXs = [-99, -90, -81];
  for (const x of medBerthXs) {
    for (const offset of [-1.8, 1.8]) {
      mooringCleats.push({
        id: `cleat-med-quay-${x}-${offset < 0 ? "west" : "east"}`,
        parentId: medQuay.id,
        kind: "quay",
        edge: "south",
        station: x,
        x: x + offset,
        y: 44.05,
        z: 0.76,
        orientation: 0
      });
    }
  }
  const pendilles = medBerthXs.map((x, index) => ({
    id: `pendille-med-${index + 1}`,
    berthId: `med-berth-${index + 1}`,
    connectionEnd: "bow",
    parentId: medQuay.id,
    pickupPoint: { east: x, north: 44.05, z: 0.4 },
    anchorPoint: { east: x, north: 20, z: -3 },
    maximumLength: 32,
    elasticity: {
      workingLoadN: 12000,
      workingStrain: 0.15,
      dampingRatio: 0.35
    }
  }));
  Object.assign(berthLanes, {
    "med-west": { x: -99, heading: -Math.PI / 2, exitX: -99, fairway: "med-basin" },
    "med-center": { x: -90, heading: -Math.PI / 2, exitX: -90, fairway: "med-basin" },
    "med-east": { x: -81, heading: -Math.PI / 2, exitX: -81, fairway: "med-basin" }
  });
  staticBoats.push(
    { id: "med-neighbor-west", x: -99, y: 38, heading: -Math.PI / 2, length: 10.2, beam: 3.35, color: "#eee9dc", berth: "med-west", berthRow: 45, berthSlot: "south", catwayId: medQuay.id, mooringType: "pendille", pendilleId: "pendille-med-1" },
    { id: "med-neighbor-east", x: -81, y: 38, heading: -Math.PI / 2, length: 11.1, beam: 3.55, color: "#e6e2d5", berth: "med-east", berthRow: 45, berthSlot: "south", catwayId: medQuay.id, mooringType: "pendille", pendilleId: "pendille-med-3" }
  );

  const calm = {
    windSpeedKn: 0,
    windFromDeg: 0,
    currentSpeedKn: 0,
    currentFromDeg: 0
  };
  const scenarios = {
    dockForward: {
      kicker: "Situation de départ",
      title: "Quitter le ponton en marche avant",
      copy: "Le bateau est amarré cul au ponton entre deux catways, sans vent ni courant. Avancez dans le chenal avant de commencer votre giration.",
      objective: "Sortez de la place en marche avant et gagnez le chenal vert.",
      initial: { x: trainingExitBerth.x, y: trainingExitBerth.y, heading: 0 },
      initialMoorings: [
        {
          id: "dock-forward-bow",
          boatCleatId: "bow-port",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "tip")
        },
        {
          id: "dock-forward-stern",
          boatCleatId: "stern-port",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "root")
        }
      ],
      environment: { ...calm },
      goal: { x: 26, y: trainingExitBerth.y, w: 10, h: 7, heading: 0, speedKn: 1.4, kind: "rect" }
    },
    dockReverse: {
      kicker: "Situation de départ",
      title: "Quitter le ponton en marche arrière",
      copy: "Le bateau est amarré étrave au ponton entre deux catways. Reculez jusqu'au chenal et observez le déplacement de la poupe dû au pas de l'hélice.",
      objective: "Sortez en marche arrière dans le chenal vert sans choc.",
      initial: { x: trainingExitBerth.x, y: trainingExitBerth.y, heading: Math.PI },
      initialMoorings: [
        {
          id: "dock-reverse-bow",
          boatCleatId: "bow-starboard",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "root")
        },
        {
          id: "dock-reverse-stern",
          boatCleatId: "stern-starboard",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "tip")
        }
      ],
      environment: { ...calm },
      goal: { x: 26, y: trainingExitBerth.y, w: 10, h: 7, heading: Math.PI, speedKn: 1.4, kind: "rect" }
    },
    approach: {
      kicker: "Situation de départ",
      title: "Rejoindre sa place",
      copy: "Vous arrivez par le bassin extérieur, sans vent ni courant. Descendez le large chenal puis engagez-vous dans le poste libre, le long du catway sud.",
      objective: "Placez le bateau dans la silhouette verte, contre le catway, presque à l'arrêt et étrave vers le ponton.",
      initial: { x: 26, y: 58, heading: -Math.PI / 2 },
      environment: { ...calm },
      goal: {
        x: trainingApproachBerth.x,
        y: trainingApproachBerth.y,
        radius: 1.2,
        heading: trainingApproachBerth.heading,
        speedKn: 0.16,
        kind: "berth",
        berthId: trainingApproachBerth.id,
        catwayId: trainingApproachBerth.catwayId,
        length: 11.6,
        beam: 4.3
      }
    },
    free: {
      kicker: "Atelier libre",
      title: "Explorez à votre rythme",
      copy: "Commencez par de petites impulsions. Observez combien de temps le bateau continue sur son erre quand la commande revient au neutre.",
      objective: "",
      initial: { x: 25, y: 48, heading: -Math.PI / 2 },
      environment: { ...calm },
      goal: null
    },
    inertia: {
      kicker: "Défi 01",
      title: "Dompter l'inertie",
      copy: "Prenez un peu d'erre, puis anticipez le neutre et la marche arrière. La cible doit être atteinte presque à l'arrêt.",
      objective: "Arrêtez-vous dans le cercle, cap au sud, sous 0,15 nd.",
      initial: { x: 25, y: 45, heading: -Math.PI / 2 },
      environment: { ...calm },
      goal: { x: 25, y: 27, radius: 3.4, heading: -Math.PI / 2, speedKn: 0.15, kind: "circle" }
    },
    dock: {
      kicker: "Défi 02",
      title: "Accostage bâbord",
      copy: "Sans vent ni courant, concentrez-vous sur l'erre. Cassez-la tôt et laissez les pare-battages absorber un appui très doux.",
      objective: "Immobilisez-vous parallèle au ponton, sans contact supérieur à 0,20 m/s.",
      initial: { x: 25, y: -25, heading: 5 * Math.PI / 4 },
      environment: { ...calm },
      goal: { x: 25, y: -42.7, radius: 3.6, heading: Math.PI, speedKn: 0.16, kind: "dock" }
    },
    reverse: {
      kicker: "Défi 03",
      title: "Sortir en marche arrière",
      copy: "Reculez dans la passe. L'hélice droitière chasse la poupe vers bâbord : compensez quand le safran commence à mordre.",
      objective: "Sortez dans le rectangle vert, en marche arrière, sans toucher les bateaux.",
      initial: { x: trainingExitBerth.x, y: trainingExitBerth.y, heading: Math.PI },
      initialMoorings: [
        {
          id: "reverse-bow",
          boatCleatId: "bow-starboard",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "root")
        },
        {
          id: "reverse-stern",
          boatCleatId: "stern-starboard",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "tip")
        }
      ],
      environment: { ...calm },
      goal: { x: 26, y: trainingExitBerth.y, w: 10, h: 7, heading: Math.PI, speedKn: 1.2, kind: "rect" }
    },
    mooring: {
      kicker: "Défi 04",
      title: "Sortir sur garde",
      copy: "Un vent de travers vous plaque contre le catway bâbord. Installez une garde arrière, utilisez-la comme point de pivot, puis quittez la place en marche avant.",
      objective: "Frappez la garde indiquée, reprenez son mou, écartez l’étrave de 20 à 35°, puis larguez au neutre et gagnez la zone verte.",
      initial: { x: trainingExitBerth.x, y: trainingExitBerth.y, heading: 0 },
      initialMoorings: [
        {
          id: "mooring-bow-line",
          boatCleatId: "bow-port",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "tip")
        },
        {
          id: "mooring-stern-line",
          boatCleatId: "stern-port",
          shoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "root")
        }
      ],
      environment: {
        windSpeedKn: 8,
        windFromDeg: 180,
        currentSpeedKn: 0,
        currentFromDeg: 0
      },
      mooringChallenge: {
        type: "spring-departure",
        springBoatCleatId: "stern-port",
        springShoreCleatId: cleatId(trainingExitBerth.catwayId, "south", "tip"),
        initialLineIds: ["mooring-bow-line", "mooring-stern-line"],
        initialSlack: 0.8,
        openingDirection: -1,
        minimumOpeningDeg: 20,
        idealOpeningDeg: 27,
        maximumOpeningDeg: 35,
        safeReleaseSpeedKn: 0.3,
        maximumReverseCommand: 0.45
      },
      goal: {
        x: 25,
        y: 2.5,
        w: 10,
        h: 10,
        heading: -12 * Math.PI / 180,
        speedKn: 1.4,
        kind: "rect"
      }
    },
    medDock: {
      kicker: "Défi 05",
      title: "Accoster sur pendille",
      copy: "Approchez cul au quai avec 10 nd de vent traversier. Tenez d’abord la poupe au vent, récupérez la pendille puis équilibrez les trois amarres.",
      objective: "Reculez dans la place centrale, frappez l’arrière au vent, menez la pendille à l’étrave puis terminez avec la seconde aussière arrière.",
      initial: { x: -90, y: 25, heading: -Math.PI / 2 },
      environment: { windSpeedKn: 10, windFromDeg: 90, currentSpeedKn: 0, currentFromDeg: 0 },
      pendilleChallenge: {
        type: "med-docking",
        pendilleId: "pendille-med-2",
        windwardBoatCleatId: "stern-starboard",
        windwardShoreCleatId: "cleat-med-quay--90-west",
        leewardBoatCleatId: "stern-port",
        leewardShoreCleatId: "cleat-med-quay--90-east",
        propellerPenalty: 20
      },
      goal: { x: -90, y: 37.5, radius: 1.2, heading: -Math.PI / 2, speedKn: 0.1, kind: "berth" }
    },
    medDeparture: {
      kicker: "Défi 06",
      title: "Appareiller sur pendille",
      copy: "Le bateau est cul au quai, tenu par deux aussières arrière et sa pendille d’étrave. Libérez les lignes dans l’ordre et gardez l’hélice claire.",
      objective: "Larguez sous le vent, détendez puis larguez la pendille au neutre, contrôlez avec l’arrière au vent puis sortez en marche avant.",
      initial: { x: -90, y: 37.5, heading: -Math.PI / 2 },
      initialMoorings: [
        { id: "med-departure-windward", boatCleatId: "stern-starboard", shoreCleatId: "cleat-med-quay--90-west" },
        { id: "med-departure-leeward", boatCleatId: "stern-port", shoreCleatId: "cleat-med-quay--90-east" }
      ],
      initialPendilles: [
        { id: "pendille-med-2", state: "secured", boatCleatId: "bow-starboard" }
      ],
      environment: { windSpeedKn: 10, windFromDeg: 90, currentSpeedKn: 0, currentFromDeg: 0 },
      pendilleChallenge: {
        type: "med-departure",
        pendilleId: "pendille-med-2",
        windwardLineId: "med-departure-windward",
        leewardLineId: "med-departure-leeward",
        propellerPenalty: 20
      },
      goal: { x: -90, y: 24, w: 9, h: 8, heading: -Math.PI / 2, speedKn: 1.2, kind: "rect" }
    }
  };

  return deepFreeze({
    schemaVersion: 2,
    id: "la-trinite-pedagogique",
    name: "La Trinité-sur-Mer — bassin pédagogique",
    units: {
      distance: "m",
      speed: "m/s",
      angle: "rad"
    },
    coordinateSystem: {
      x: "est",
      y: "nord",
      headingZero: "est",
      headingPositive: "anti-horaire"
    },
    referenceBoat: {
      id: "sun-odyssey-36i",
      length: 10.94,
      beam: 3.59
    },
    bounds: {
      minX: -108,
      maxX: 70,
      minY: -62,
      maxY: 64
    },
    flowField: {
      minX: -108,
      width: 178,
      minY: -54,
      height: 118
    },
    layout,
    structures: {
      docks,
      catways,
      mooringCleats,
      pendilles
    },
    berthLanes,
    staticBoats,
    scenarios,
    navigation: {
      designTurningDiameterFactor: 1.4,
      requiredFairwayFactor: 1.2,
      requiredBerthBeamFactor: 2,
      requiredTurningDepthLengthFactor: 1.5,
      berthOpening: layout.catwayPitch - layout.catwayWidth,
      outerTurningDepth: 28.65,
      fairways: [
        { id: "west-central", left: -34.1, right: -13.9, width: 20.2 },
        { id: "central-east", left: 13.9, right: 36.9, width: 23 }
      ],
      trainingBerths: [
        trainingExitBerth,
        trainingApproachBerth
      ],
      exitLanes: [
        {
          id: "chenal-ouest",
          start: { x: -68, y: 38, heading: Math.PI / 2 },
          target: { x: -68, y: layout.northExitY, heading: Math.PI / 2 }
        },
        {
          id: "chenal-west-central",
          start: { x: -24, y: 38, heading: Math.PI / 2 },
          target: { x: -24, y: layout.northExitY, heading: Math.PI / 2 }
        },
        {
          id: "chenal-central-est",
          start: { x: 25.4, y: 38, heading: Math.PI / 2 },
          target: { x: 25.4, y: layout.northExitY, heading: Math.PI / 2 }
        }
      ]
    },
    terrain: {
      polygons: [
        {
          points: [[-76, -62, -0.08], [62, -62, -0.08], [62, -52, -0.08], [-76, -52, -0.08]],
          top: "#314248",
          side: "rgba(3,16,23,.38)"
        },
        {
          points: [[-76, -62, 0.02], [62, -62, 0.02], [62, -55, 0.02], [46, -53, 0.02], [20, -55, 0.02], [-8, -53, 0.02], [-36, -56, 0.02], [-76, -54, 0.02]],
          top: "#435155",
          side: "rgba(3,16,23,.5)"
        }
      ]
    },
    lights: {
      posts: [
        ...[-52, -34, -16, 2, 20, 38].map(x => ({ x, y: -45.8, z0: 0.65, z1: 4.4 })),
        ...[-36, -16, 4, 24, 44].map(y => ({ x: 49.2, y, z0: 1, z1: 5 })),
        { x: layout.westPontoonX, y: 18.5, z0: 0.45, z1: 3.2, head: true },
        { x: layout.centralPontoonX, y: 18.5, z0: 0.45, z1: 3.2, head: true }
      ],
      entrance: { x: 49.2, y: 52, z0: 0.8, zLight: 7.2, zTop: 8.4 }
    }
  });
}));
