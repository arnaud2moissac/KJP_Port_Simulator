"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Codec = require("../../src/ports/kjp-codec.js");
const Editor = require("../../src/ports/port-editor-core.js");
const OSMImport = require("../../src/ports/osm-import.js");

function createValidPort() {
  const document = Codec.createEmpty({
    id: "port-test",
    name: "Port de test",
    latitude: 47.586,
    longitude: -3.03,
    generatorVersion: "1.0.0"
  });
  document.metadata.createdAt = "2026-07-30T00:00:00.000Z";
  document.metadata.updatedAt = "2026-07-30T00:00:00.000Z";
  document.structures.pontoons.push({
    id: "pontoon-main",
    type: "pontoon",
    center: { east: 0, north: 0 },
    length: 70,
    width: 2.6,
    heading: Math.PI / 9,
    height: 0.55
  });
  const editor = new Editor.PortEditor(document);
  editor.addCatwayGroup("pontoon-main", {
    mode: "count",
    count: 4,
    side: "both",
    marginStart: 6,
    marginEnd: 6,
    length: 11,
    width: 0.75
  });
  editor.recomputeBerths();
  editor.document.berths[0].isVisitor = true;
  editor.document.berths[0].name = "Visiteurs A";
  editor.populateBoats({ occupancyRate: 0.62, seed: 77 });
  editor.document.structures.obstacles.push({
    id: "breakwater-main",
    type: "breakwater",
    points: [
      { east: -100, north: -80 },
      { east: 20, north: -95 },
      { east: 120, north: -45 }
    ],
    width: 7,
    height: 4
  });
  editor.document.structures.landAreas.push({
    id: "land-main",
    type: "land",
    points: [
      { east: -150, north: 60 },
      { east: -50, north: 120 },
      { east: 80, north: 130 },
      { east: 130, north: 70 }
    ]
  });
  editor.document.structures.buoys.push({
    id: "buoy-starboard-1",
    type: "buoy",
    position: { east: -35, north: -42 },
    radius: 0.48,
    height: 1.6,
    seamarkType: "buoy_lateral",
    category: "starboard",
    shape: "conical",
    colours: ["green"],
    name: "Entrée tribord",
    collision: true
  });
  editor.document.navigation.entries = [{
    id: "entry-main",
    name: "Entrée sud",
    position: { east: -80, north: -60 },
    heading: Math.PI / 4
  }];
  editor.document.sources.push({
    provider: "OpenStreetMap / OpenSeaMap",
    kind: "vector",
    attribution: "© les contributeurs OpenStreetMap · ODbL",
    license: "ODbL 1.0",
    url: "https://www.openstreetmap.org/copyright",
    retrievedAt: "2026-07-30T00:00:00.000Z",
    bounds: { south: 47.58, west: -3.04, north: 47.59, east: -3.02 },
    osmElementIds: ["way/1"]
  });
  return editor.snapshot();
}

function expectValidationError(mutator, code) {
  const document = createValidPort();
  mutator(document);
  assert.throws(
    () => Codec.serialize(document),
    error => (
      error instanceof Codec.KJPValidationError
      && error.errors.some(item => !code || item.code === code)
    )
  );
}

test("projection locale azimutale: aller-retour et distance sous 0,10 m sur 4 km", () => {
  const projection = Codec.createLocalProjection(47.586, -3.03);
  const targets = [
    { east: 2000, north: 0 },
    { east: -2000, north: 2000 },
    { east: 0, north: -2000 },
    { east: 2828, north: 2828 }
  ];
  for (const target of targets) {
    const geographic = projection.inverse(target.east, target.north);
    const roundTrip = projection.forward(geographic.latitude, geographic.longitude);
    assert.ok(Math.hypot(roundTrip.east - target.east, roundTrip.north - target.north) < 0.001);
    assert.ok(Math.abs(Math.hypot(roundTrip.east, roundTrip.north) - Math.hypot(target.east, target.north)) < 0.1);
  }
});

test("codec KJP: export → import → réexport exactement équivalent", () => {
  const first = Codec.serialize(createValidPort());
  const parsed = Codec.parse(first);
  const second = Codec.serialize(parsed);
  assert.equal(second, first);
  assert.equal(parsed.format, "KJP");
  assert.equal(parsed.schemaVersion, 3);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.structures.catways));
  assert.equal(parsed.structures.buoys.length, 1);
  assert.ok(parsed.staticBoats.every(boat => boat.vesselType === "sailboat"));
});

test("nouveau port: valeurs de quai, places et catways conformes aux défauts métier", () => {
  const document = Codec.createEmpty({
    id: "defaults-port",
    name: "Valeurs par défaut",
    latitude: 47.586,
    longitude: -3.03,
    generatorVersion: "test"
  });
  assert.equal(document.metadata.source, "OpenStreetMap");
  assert.equal(document.editor.defaultBerthWidth, 4);
  document.structures.pontoons.push({
    id: "pontoon-defaults",
    type: "pontoon",
    center: { east: 0, north: 0 },
    length: 42,
    width: 2,
    heading: 0,
    height: 0.55
  });
  const generated = Editor.createCatwayGroup(document, "pontoon-defaults");
  assert.equal(generated.group.parameters.mode, "spacing");
  assert.equal(generated.group.parameters.spacing, 10);
  assert.equal(generated.group.parameters.marginEnd, 0);
  assert.equal(generated.group.parameters.width, 0.6);
  assert.ok(generated.catways.every(catway => catway.endShape === "rounded"));
});

test("catways arrondis: le contour partagé conserve la racine et l'extrémité déclarée", () => {
  const document = createValidPort();
  const source = document.structures.catways[0];
  delete source.endShape;
  const parsed = Codec.parse(Codec.serialize(document));
  const catway = parsed.structures.catways.find(item => item.id === source.id);
  assert.equal(catway.endShape, "rounded");
  const points = Codec.catwayPlanform(catway);
  const local = points.map(point => Codec.worldToLocal(catway, point));
  const minimum = Math.min(...local.map(point => point.longitudinal));
  const maximum = Math.max(...local.map(point => point.longitudinal));
  assert.ok(Math.abs(minimum - (-catway.length / 2 + catway.attachment.rootOverlap)) < 1e-9);
  assert.ok(Math.abs(maximum - catway.length / 2) < 1e-9);
  assert.equal(local.filter(point => Math.abs(point.longitudinal - minimum) < 1e-9).length, 2);
  assert.ok(local.some(point => (
    Math.abs(point.longitudinal - maximum) < 1e-9
    && Math.abs(point.transverse) < 1e-9
  )));

  const square = Codec.catwayPlanform({ ...catway, endShape: "square" });
  assert.equal(square.length, 4);
  assert.throws(
    () => Codec.serialize({
      ...document,
      structures: {
        ...document.structures,
        catways: document.structures.catways.map(item => (
          item.id === source.id ? { ...item, endShape: "pointed" } : item
        ))
      }
    }),
    error => error instanceof Codec.KJPValidationError
  );
});

test("pendilles: une série reste liée au quai et traverse KJP → runtime sans discontinuité", () => {
  const document = Codec.createEmpty({
    id: "med-port",
    name: "Port méditerranéen",
    latitude: 43.3,
    longitude: 5.36,
    generatorVersion: "test"
  });
  document.structures.pontoons.push({
    id: "quay-med",
    type: "pontoon",
    center: { east: 0, north: 0 },
    length: 32,
    width: 2,
    heading: 0,
    height: 0.6,
    vertical: Editor.verticalWithDeck(0.6, 0.6)
  });
  document.navigation.entries.push({
    id: "entry-med",
    name: "Entrée",
    position: { east: 0, north: -40 },
    heading: 0
  });
  const editor = new Editor.PortEditor(document);
  editor.addPendilleGroup("quay-med", {
    mode: "count",
    count: 3,
    waterSide: "right",
    marginStart: 4,
    marginEnd: 4,
    berthWidth: 4,
    berthLength: 14,
    anchorDistance: 18,
    depth: 3
  });
  assert.equal(editor.document.structures.pendilles.length, 3);
  assert.equal(editor.document.berths.length, 3);
  assert.equal(editor.document.staticBoats.length, 3);
  const parsed = Codec.parse(Codec.serialize(editor.document));
  const runtime = Codec.toRuntimeTopology(parsed);
  assert.equal(runtime.structures.pendilles.length, 3);
  for (const pendille of runtime.structures.pendilles) {
    assert.ok(Number.isFinite(pendille.pickupPoint.east));
    assert.ok(Number.isFinite(pendille.anchorPoint.north));
    assert.equal(pendille.anchorPoint.z, -3);
    assert.ok(pendille.maximumLength <= 200);
  }
  const firstBefore = runtime.structures.pendilles[0].pickupPoint;
  editor.update("quay-med", { center: { east: 12, north: -5 }, heading: Math.PI / 6 });
  const moved = Codec.toRuntimeTopology(Codec.parse(Codec.serialize(editor.document)));
  const firstAfter = moved.structures.pendilles[0].pickupPoint;
  assert.ok(Math.hypot(firstAfter.east - firstBefore.east, firstAfter.north - firstBefore.north) > 5);
});

test("codec KJP: les anciens documents v1 sans tableau de bouées restent compatibles", () => {
  const document = createValidPort();
  document.schemaVersion = 1;
  delete document.structures.buoys;
  for (const structure of [
    ...document.structures.pontoons,
    ...document.structures.catways,
    ...document.structures.obstacles
  ]) delete structure.vertical;
  for (const catway of document.structures.catways) {
    delete catway.parentId;
    delete catway.attachment;
  }
  const parsed = Codec.parse(JSON.stringify(document));
  assert.deepEqual(parsed.structures.buoys, []);
  assert.equal(parsed.schemaVersion, 3);
  assert.ok(parsed.structures.catways.every(catway => catway.attachment?.parentId === "pontoon-main"));
});

test("codec KJP: un document v2 migre vers v3 avec des pendilles vides", () => {
  const document = createValidPort();
  document.schemaVersion = 2;
  delete document.structures.pendilles;
  delete document.editor.pendilleGroups;
  const parsed = Codec.parse(JSON.stringify(document));
  assert.equal(parsed.schemaVersion, 3);
  assert.deepEqual(parsed.structures.pendilles, []);
  assert.deepEqual(parsed.editor.pendilleGroups, []);
});

test("codec KJP: limites, références, versions et contenu malveillant sont refusés avec un chemin", () => {
  expectValidationError(document => { document.schemaVersion = 99; }, "version");
  expectValidationError(document => {
    document.structures.cleats[0].parentId = "missing";
  }, "reference");
  expectValidationError(document => {
    document.metadata.comment = "<script>alert(1)</script>";
  }, "unsafe-text");
  expectValidationError(document => {
    document.metadata.harborMasterUrl = "javascript:alert(1)";
  }, "url");
  expectValidationError(document => {
    document.staticBoats[0].center.east = Infinity;
  }, "non-finite");
  expectValidationError(document => {
    document.structures.catways[1].id = document.structures.catways[0].id;
  }, "duplicate");
  expectValidationError(document => {
    document.structures.buoys[0].seamarkType = "submarine";
  }, "enum");
  expectValidationError(document => {
    document.structures.buoys[0].radius = -1;
  }, "range");
  const oversized = " ".repeat(Codec.LIMITS.fileBytes + 1);
  assert.throws(() => Codec.parse(oversized), Codec.KJPValidationError);
  assert.throws(
    () => Codec.parse('{"format":"KJP","__proto__":{"polluted":true}}'),
    error => error.errors.some(item => item.code === "unsafe-key")
  );
  expectValidationError(document => {
    document.navigation.entries[0].position = { east: 15000, north: 15000 };
  }, "range");
  expectValidationError(document => {
    document.structures.pontoons[0].vertical = {
      datum: "waterline",
      mode: "floating",
      baseZ: 1,
      topZ: 0.5,
      deckZ: 0.5
    };
  }, "geometry");
  expectValidationError(document => {
    document.structures.catways[0].center.east += 0.4;
  }, "geometry");
});

test("codec KJP: plafonds de structures, taquets et bateaux sont réellement appliqués", () => {
  const structures = createValidPort();
  structures.structures.obstacles = Array.from(
    { length: Codec.LIMITS.structures + 1 },
    (_, index) => ({
      id: `bulk-obstacle-${index}`,
      type: "obstacle",
      points: [{ east: 100, north: 100 }, { east: 101, north: 100 }],
      width: 1,
      height: 1
    })
  );
  assert.throws(
    () => Codec.normalizeDocument(structures),
    error => error.errors.some(item => item.path === "$.structures" && item.code === "limit")
  );

  const cleats = createValidPort();
  cleats.structures.cleats = Array.from(
    { length: Codec.LIMITS.cleats + 1 },
    (_, index) => ({
      id: `bulk-cleat-${index}`,
      parentId: "pontoon-main",
      localPosition: { longitudinal: 0, transverse: 1.3 },
      z: 0.55,
      orientation: 0
    })
  );
  assert.throws(
    () => Codec.normalizeDocument(cleats),
    error => error.errors.some(item => item.path === "$.structures.cleats" && item.code === "limit")
  );

  const boats = createValidPort();
  boats.staticBoats = Array.from(
    { length: Codec.LIMITS.boats + 1 },
    (_, index) => ({
      id: `bulk-boat-${index}`,
      berthId: "",
      center: { east: 100 + index % 10, north: 100 + Math.floor(index / 10) },
      heading: 0,
      length: 7,
      beam: 2.5
    })
  );
  assert.throws(
    () => Codec.normalizeDocument(boats),
    error => error.errors.some(item => item.path === "$.staticBoats" && item.code === "limit")
  );
});

test("codec KJP: les champs affichés et les groupes incomplets sont refusés avant installation", () => {
  for (const mutate of [
    document => { document.metadata.createdAt = { toString: "bad" }; },
    document => { document.metadata.updatedAt = []; },
    document => { document.berths[0].name = { toString: "bad" }; },
    document => { delete document.editor.catwayGroups[0].parameters; },
    document => { document.editor.catwayGroups[0].parameters.count = 1e12; }
  ]) {
    const document = createValidPort();
    mutate(document);
    assert.throws(() => Codec.parse(JSON.stringify(document)), Codec.KJPValidationError);
  }
});

test("codec KJP: profondeur et géométries sont bornées avant les traitements coûteux", () => {
  const document = createValidPort();
  const deepText = JSON.stringify(document).slice(0, -1)
    + ',"extension":' + "[".repeat(5000) + "0" + "]".repeat(5000) + "}";
  assert.throws(() => Codec.parse(deepText), error => error instanceof Codec.KJPValidationError
    && error.errors[0].code === "limit");
  document.structures.obstacles[0].points = Array.from({ length: Codec.LIMITS.pointsPerGeometry },
    (_, i) => ({ east: i % 100, north: 0 }));
  assert.equal(Codec.parse(JSON.stringify(document)).structures.obstacles[0].points.length, Codec.LIMITS.pointsPerGeometry);
  document.structures.obstacles[0].points.push({ east: 0, north: 0 });
  assert.throws(() => Codec.parse(JSON.stringify(document)), error => error.errors[0].code === "limit");
  document.structures.obstacles = Array.from({ length: 9 }, (_, i) => ({
    ...document.structures.obstacles[0], id: `polyline-${i}`,
    points: document.structures.obstacles[0].points.slice(0, Codec.LIMITS.pointsPerGeometry)
  }));
  assert.throws(() => Codec.parse(JSON.stringify(document)), error => error.errors[0].code === "limit");
});

test("codec KJP: les diagnostics restent bornés et la migration refuse les types invalides", () => {
  const document = createValidPort();
  document.structures.obstacles = Array(500).fill(null);
  assert.throws(() => Codec.parse(JSON.stringify(document)), error => error instanceof Codec.KJPValidationError
    && error.errors.length === Codec.LIMITS.errors && error.message.length < 10000);
  document.schemaVersion = 1;
  document.structures.pontoons = {};
  assert.throws(() => Codec.parse(JSON.stringify(document)), error => error instanceof Codec.KJPValidationError
    && error.errors[0].code === "type");
});

test("codec KJP: les deux ports La Trinité restent compatibles après durcissement", () => {
  for (const relative of ["la_Trinite.kjp", "examples/la-trinite-sur-mer.kjp"]) {
    const text = fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");
    const document = Codec.parse(text);
    assert.equal(document.metadata.name, "La Trinité sur mer");
    assert.equal(Codec.toRuntimeTopology(document).structures.catways.length, document.structures.catways.length);
    assert.equal(Codec.serialize(Codec.parse(Codec.serialize(document))), Codec.serialize(document));
  }
});

test("codec KJP: le grand port de référence conserve ses 3 000 objets", () => {
  const { rectangles, boats } = require("../helpers/large-port-obstacles.js").createLargeObstacles();
  const document = Codec.createEmpty({ id: "large-security-control", name: "Grand port" });
  document.schemaVersion = 1;
  rectangles.forEach((rectangle, i) => {
    const type = i < 1000 ? "pontoon" : "catway";
    document.structures[type === "pontoon" ? "pontoons" : "catways"].push({
      id: rectangle.id, type, center: { east: rectangle.east, north: rectangle.north },
      length: rectangle.width, width: rectangle.height, heading: rectangle.heading, height: 0.5
    });
  });
  document.staticBoats = boats.map(boat => ({
    id: boat.id, center: { east: boat.east, north: boat.north },
    heading: boat.heading, length: boat.length, beam: boat.beam
  }));
  document.navigation.entries = [{ id: "entry", position: { east: 0, north: 0 }, heading: 0 }];
  const runtime = Codec.toRuntimeTopology(Codec.parse(JSON.stringify(document)));
  assert.equal(runtime.structures.docks.length, 1000);
  assert.equal(runtime.structures.catways.length, 1000);
  assert.equal(runtime.staticBoats.length, 1000);
});

test("une orthophoto reste une référence visuelle et aucune tuile ou image n'entre dans KJP", () => {
  const document = createValidPort();
  document.sources.push({
    provider: "IGN BD ORTHO",
    kind: "orthophoto",
    attribution: "© IGN",
    license: "Licence ouverte",
    url: "https://geoservices.ign.fr/bdortho",
    retrievedAt: "2026-07-30T00:00:00.000Z",
    embedded: false
  });
  const text = Codec.serialize(document);
  assert.doesNotMatch(text, /data:image|tileData|imageBlob/i);
  assert.match(text, /"kind": "orthophoto"/);
  document.sources.at(-1).imageBlob = "AAAA";
  assert.throws(() => Codec.serialize(document), Codec.KJPValidationError);
});

test("groupes paramétriques: redistribution, six taquets par catway et positions locales liées", () => {
  const document = createValidPort();
  const editor = new Editor.PortEditor(document);
  const group = editor.document.editor.catwayGroups[0];
  const countBefore = group.memberIds.length;
  assert.equal(
    editor.document.structures.cleats.filter(cleat => group.memberIds.includes(cleat.parentId)).length,
    countBefore * 6
  );
  const parentBefore = editor.document.structures.pontoons[0];
  const firstCatwayBefore = editor.document.structures.catways.find(item => item.id === group.memberIds[0]);
  const rootBefore = Codec.localToWorld(firstCatwayBefore, {
    longitudinal: -firstCatwayBefore.length / 2,
    transverse: 0
  });
  const rootBeforeLocal = Codec.worldToLocal(parentBefore, rootBefore);
  assert.ok(Math.abs(
    parentBefore.width / 2 - Math.abs(rootBeforeLocal.transverse) - 0.15
  ) < 1e-9);
  assert.equal(firstCatwayBefore.attachment.parentId, parentBefore.id);
  assert.equal(firstCatwayBefore.attachment.rootOverlap, 0.15);
  assert.equal(firstCatwayBefore.vertical.deckZ, Editor.resolvedVertical(parentBefore).deckZ);
  editor.update(parentBefore.id, {
    length: 90,
    heading: parentBefore.heading + Math.PI / 12,
    center: { east: 20, north: -10 }
  });
  const updatedGroup = editor.document.editor.catwayGroups.find(item => item.id === group.id);
  const firstCatwayAfter = editor.document.structures.catways.find(item => item.id === updatedGroup.memberIds[0]);
  assert.notDeepEqual(firstCatwayAfter.center, firstCatwayBefore.center);
  assert.equal(firstCatwayAfter.attachment.parentId, parentBefore.id);
  assert.equal(firstCatwayAfter.attachment.rootOverlap, 0.15);
  const roundTrip = Codec.parse(Codec.serialize(editor.document));
  const persisted = roundTrip.structures.catways.find(item => item.id === firstCatwayAfter.id);
  assert.deepEqual(persisted.attachment, firstCatwayAfter.attachment);
  assert.deepEqual(persisted.vertical, firstCatwayAfter.vertical);
  assert.equal(
    editor.document.structures.cleats.filter(cleat => updatedGroup.memberIds.includes(cleat.parentId)).length,
    updatedGroup.memberIds.length * 6
  );
  for (const cleat of editor.document.structures.cleats) {
    const parent = [
      ...editor.document.structures.pontoons,
      ...editor.document.structures.catways
    ].find(item => item.id === cleat.parentId);
    assert.ok(parent);
    assert.ok(Math.abs(cleat.localPosition.longitudinal) <= parent.length / 2 + 1e-9);
    assert.ok(Math.abs(cleat.localPosition.transverse) <= parent.width / 2 + 1e-9);
  }
});

test("catway manuel: le redimensionnement conserve longueur, raccord et niveau", () => {
  const parent = {
    id: "ponton-manuel",
    center: { east: 12, north: -4 },
    length: 50,
    width: 2.4,
    heading: Math.PI / 7,
    height: 0.45,
    vertical: Editor.verticalWithDeck(0.55, 0.45)
  };
  const edge = Codec.localToWorld(parent, { longitudinal: 8, transverse: parent.width / 2 });
  const initial = {
    id: "catway-manuel",
    center: Codec.localToWorld(parent, { longitudinal: 8, transverse: 6.2 }),
    length: 10,
    width: 0.8,
    heading: parent.heading + Math.PI / 2,
    height: 0.3,
    vertical: Editor.verticalWithDeck(0.55, 0.3)
  };
  assert.ok(Math.hypot(initial.center.east - edge.east, initial.center.north - edge.north) > 4);
  const attached = Editor.attachCatwayToPontoon(initial, parent, {
    parentEdge: "port",
    station: 8,
    rootOverlap: 0.15
  });
  const resized = Editor.attachCatwayToPontoon(
    { ...attached, length: 14 },
    parent,
    attached.attachment
  );
  const root = Codec.localToWorld(resized, { longitudinal: -resized.length / 2, transverse: 0 });
  const rootLocal = Codec.worldToLocal(parent, root);
  assert.equal(resized.length, 14);
  assert.ok(Math.abs(parent.width / 2 - rootLocal.transverse - 0.15) < 1e-9);
  assert.equal(resized.parentId, parent.id);
  assert.equal(resized.attachment.parentId, parent.id);
  assert.equal(resized.vertical.deckZ, parent.vertical.deckZ);
});

test("taquets de ponton: génération par nombre ou par espacement", () => {
  const editor = new Editor.PortEditor(createValidPort());
  const pontoon = editor.document.structures.pontoons[0];

  editor.generateCleats(pontoon.id, { mode: "count", countPerSide: 4, margin: 1 });
  assert.equal(
    editor.document.structures.cleats.filter(cleat => cleat.parentId === pontoon.id).length,
    8
  );

  editor.generateCleats(pontoon.id, { mode: "spacing", spacing: 10, margin: 1 });
  const spaced = editor.document.structures.cleats.filter(cleat => cleat.parentId === pontoon.id);
  assert.equal(spaced.length, 16);
  const positions = [...new Set(spaced.map(cleat => cleat.localPosition.longitudinal))].sort((a, b) => a - b);
  assert.equal(positions.length, 8);
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index] - positions[index - 1] <= 10 + 1e-9);
  }
});

test("accrochage métrique: extrémités, axes et angles restent déterministes", () => {
  const document = createValidPort();
  const pontoon = document.structures.pontoons[0];
  const onAxis = Codec.localToWorld(pontoon, { longitudinal: 12, transverse: 0 });
  const result = Editor.snapPoint(
    { east: onAxis.east + 0.35, north: onAxis.north - 0.25 },
    document,
    { tolerance: 1, heading: 89.2 * Math.PI / 180, angleStep: Math.PI / 2 }
  );
  const local = Codec.worldToLocal(pontoon, result.point);
  assert.equal(result.snapped, true);
  assert.ok(Math.abs(local.transverse) < 1e-9);
  assert.ok(Math.abs(result.heading - Math.PI / 2) < 1e-12);
});

test("places et bateaux: génération déterministe, contre un catway et sans chevauchement", () => {
  const first = createValidPort();
  const editor = new Editor.PortEditor(first);
  editor.populateBoats({ occupancyRate: 0.8, seed: 123456 });
  const boatsFirst = cloneBoats(editor.document.staticBoats);
  editor.populateBoats({ occupancyRate: 0.8, seed: 123456 });
  assert.deepEqual(editor.document.staticBoats, boatsFirst);
  const catwayById = new Map(editor.document.structures.catways.map(item => [item.id, item]));
  const berthById = new Map(editor.document.berths.map(item => [item.id, item]));
  for (const boat of editor.document.staticBoats) {
    const berth = berthById.get(boat.berthId);
    const parent = catwayById.get(berth.parentId);
    assert.ok(parent);
    const local = Codec.worldToLocal(parent, boat.center);
    assert.ok(Math.abs(local.transverse) >= parent.width / 2 + boat.beam / 2 - 0.01);
  }
  for (let firstIndex = 0; firstIndex < editor.document.staticBoats.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < editor.document.staticBoats.length; secondIndex += 1) {
      const firstBoat = editor.document.staticBoats[firstIndex];
      const secondBoat = editor.document.staticBoats[secondIndex];
      assert.equal(Editor.rectanglesOverlap(
        { center: firstBoat.center, length: firstBoat.length, width: firstBoat.beam, heading: firstBoat.heading },
        { center: secondBoat.center, length: secondBoat.length, width: secondBoat.beam, heading: secondBoat.heading },
        0.1
      ), false);
    }
  }
});

test("largeur des places et gabarit des bateaux restent cohérents et rééditables", () => {
  const narrowEditor = new Editor.PortEditor(createValidPort());
  narrowEditor.recomputeBerths({ defaultWidth: 2.8 });
  narrowEditor.populateBoats({ occupancyRate: 1, seed: 42 });
  assert.equal(narrowEditor.document.editor.defaultBerthWidth, 2.8);
  assert.ok(narrowEditor.document.berths.every(berth => berth.width === 2.8));
  assert.ok(narrowEditor.document.staticBoats.length > 0);
  const narrowBeam = Math.max(...narrowEditor.document.staticBoats.map(boat => boat.beam));

  const wideEditor = new Editor.PortEditor(createValidPort());
  wideEditor.recomputeBerths({ defaultWidth: 7.2 });
  wideEditor.populateBoats({ occupancyRate: 1, seed: 42 });
  assert.equal(wideEditor.document.editor.defaultBerthWidth, 7.2);
  assert.ok(wideEditor.document.berths.every(berth => berth.width === 7.2));
  assert.ok(Math.max(...wideEditor.document.staticBoats.map(boat => boat.beam)) > narrowBeam);
  for (const boat of wideEditor.document.staticBoats) {
    const berth = wideEditor.document.berths.find(item => item.id === boat.berthId);
    assert.ok(boat.length <= berth.maxLength + 1e-9);
    assert.ok(boat.beam <= berth.maxBeam + 1e-9);
  }

  const roundTrip = Codec.parse(Codec.serialize(wideEditor.document));
  assert.equal(roundTrip.editor.defaultBerthWidth, 7.2);
});

test("longueur des places: dimension demandée, ancrage et sauvegarde des réglages", () => {
  const editor = new Editor.PortEditor(createValidPort());
  editor.document.structures.obstacles = [];
  editor.document.structures.landAreas = [];
  const original = editor.snapshot();
  editor.recomputeBerths({ defaultWidth: 7, defaultLength: 30 });
  assert.equal(editor.document.editor.defaultBerthLength, 30);
  assert.ok(editor.document.berths.length > 0);
  for (const berth of editor.document.berths) {
    assert.equal(berth.length, 30);
    assert.equal(berth.maxLength, 30);
    const parent = editor.document.structures.catways.find(item => item.id === berth.parentId);
    const local = Codec.worldToLocal(parent, berth.center);
    assert.ok(Math.abs(local.longitudinal - berth.length / 2 + parent.length / 2 - 0.4) < 1e-9);
    const fitted = Editor.fitBoatToBerth(editor.document, berth, () => 0.5);
    const fittedLocal = Codec.worldToLocal(parent, fitted.center);
    assert.ok(Math.abs(fittedLocal.longitudinal - local.longitudinal) < 1e-9);
  }
  const restored = Codec.parse(Codec.serialize(editor.document));
  assert.equal(restored.editor.defaultBerthLength, 30);
  editor.undo();
  assert.deepEqual(editor.document.berths, original.berths);
  assert.equal(editor.document.editor.defaultBerthLength, undefined);
  editor.redo();
  editor.recomputeBerths();
  assert.ok(editor.document.berths.every(berth => berth.length === 30));
  editor.recomputeBerths({ defaultLength: 9.5 });
  assert.ok(editor.document.berths.every(berth => berth.length === 9.5));
});

test("dégagement des places: réduction devant une digue et conservation du point d'ancrage", () => {
  const document = Codec.createEmpty();
  document.structures.catways = [{ id: "finger-a", center: { east: 5, north: 0 }, length: 10, width: 1, heading: 0 }];
  document.structures.obstacles = [{ points: [{ east: 20.9, north: -30 }, { east: 20.9, north: 30 }], width: 1 }];
  const berths = Editor.inferBerths(document, { defaultWidth: 4, defaultLength: 12 });
  assert.equal(berths.length, 2);
  for (const berth of berths) {
    assert.ok(Math.abs(berth.length - 10) < 1e-8);
    assert.equal(berth.maxLength, berth.length);
    assert.ok(Math.abs(berth.center.east - berth.length / 2 - 0.4) < 1e-8);
    assert.ok(20.4 - (berth.center.east + berth.length / 2) >= berth.length - 1e-8);
  }
  document.structures.obstacles[0].points.forEach(point => { point.east = 60; });
  assert.ok(Editor.inferBerths(document, { defaultLength: 12 }).every(berth => berth.length === 12));
  document.structures.obstacles[0].points.forEach(point => { point.east = 1.9; });
  assert.equal(Editor.inferBerths(document, { defaultLength: 12 }).length, 0, "aucune place inutilisable ou sans dégagement n'est conservée");
});

test("dégagement des places: toute la largeur est contrôlée devant une terre concave", () => {
  const document = Codec.createEmpty();
  document.structures.catways = [{ id: "finger-a", center: { east: 5, north: 0 }, length: 10, width: 1, heading: 0 }];
  document.structures.landAreas = [{ points: [
    { east: 16.4, north: 4 }, { east: 22, north: 4 }, { east: 22, north: 8 },
    { east: 10.4, north: 8 }, { east: 10.4, north: 5 }, { east: 16.4, north: 5 }
  ] }];
  const berths = Editor.inferBerths(document, { defaultWidth: 4, defaultLength: 12 });
  assert.equal(berths.length, 2);
  assert.ok(Math.abs(berths.find(berth => berth.side === "port").length - 8) < 1e-8);
  assert.equal(berths.find(berth => berth.side === "starboard").length, 12);
});

test("dégagement des places face à face: les deux longueurs diminuent et partagent une allée suffisante", () => {
  for (const heading of [0, Math.PI / 3]) {
    const document = Codec.createEmpty();
    const transform = point => Codec.localToWorld({ center: { east: 20, north: -15 }, heading }, {
      longitudinal: point.east, transverse: point.north
    });
    document.structures.catways = [
      { id: "finger-a", center: transform({ east: 5, north: 0 }), length: 10, width: 1, heading },
      { id: "finger-b", center: transform({ east: 25, north: 0 }), length: 10, width: 1, heading: heading + Math.PI }
    ];
    const settings = { defaultWidth: 4, defaultLength: 20 };
    const berths = Editor.inferBerths(document, settings);
    assert.equal(berths.length, 4, "les places opposées sont réduites au lieu d'être supprimées par ordre de parcours");
    for (const berth of berths) assert.ok(Math.abs(berth.length - 29.2 / 3) < 1e-7);
    const first = berths.find(berth => berth.parentId === "finger-a" && berth.side === "port");
    const second = berths.find(berth => berth.parentId === "finger-b" && berth.side === "starboard");
    const firstEnd = Codec.localToWorld(first, { longitudinal: first.length / 2, transverse: 0 });
    const secondEnd = Codec.localToWorld(second, { longitudinal: second.length / 2, transverse: 0 });
    const gap = Math.hypot(firstEnd.east - secondEnd.east, firstEnd.north - secondEnd.north);
    assert.ok(gap >= Math.max(first.length, second.length) - 1e-7);
    document.structures.catways.reverse();
    const reversed = Editor.inferBerths(document, settings);
    for (const berth of berths) {
      const other = reversed.find(item => item.parentId === berth.parentId && item.side === berth.side);
      assert.ok(Math.abs(berth.length - other.length) < 1e-7);
    }
  }
});

test("dégagement des places de longueurs différentes: le dégagement couvre la plus grande", () => {
  const document = Codec.createEmpty();
  document.structures.catways = [
    { id: "finger-a", center: { east: 5, north: 0 }, length: 10, width: 1, heading: 0 },
    { id: "finger-b", center: { east: 20, north: 0 }, length: 20, width: 1, heading: Math.PI }
  ];
  const berths = Editor.inferBerths(document, { defaultWidth: 4 });
  assert.equal(berths.length, 4);
  const first = berths.find(berth => berth.parentId === "finger-a" && berth.side === "port");
  const second = berths.find(berth => berth.parentId === "finger-b" && berth.side === "starboard");
  assert.ok(first.length < 9.2 && second.length < 19.2);
  assert.ok(Math.abs(first.length / second.length - 9.2 / 19.2) < 1e-8);
  assert.ok(29.2 - first.length - second.length >= Math.max(first.length, second.length) - 1e-7);
});

test("dégagement des places: un bateau débordant d'une place raccourcie n'est pas conservé", () => {
  const document = Codec.createEmpty();
  document.structures.catways = [{ id: "finger-a", center: { east: 5, north: 0 }, length: 10, width: 1, heading: 0 }];
  const editor = new Editor.PortEditor(document);
  editor.recomputeBerths({ defaultWidth: 4, defaultLength: 12 });
  const berth = editor.document.berths.find(item => item.side === "port");
  editor.document.staticBoats = [{ id: "boat-existing", berthId: berth.id, center: { east: berth.center.east, north: 2 }, heading: 0, length: 6, beam: 2 }];
  editor.document.structures.obstacles = [{ points: [{ east: 16.9, north: -30 }, { east: 16.9, north: 30 }], width: 1 }];
  editor.recomputeBerths();
  assert.ok(editor.document.berths.every(item => Math.abs(item.length - 8) < 1e-8));
  assert.equal(editor.document.staticBoats.length, 0);
});

test("tailles des bateaux: cloche décentrée, hauteurs aux limites et tirage borné", () => {
  const distribution = Editor.normalizeBoatSizeDistribution({
    minLength: 4, maxLength: 20, minPercent: 15, maxPercent: 5, center: 8
  });
  assert.ok(Math.abs(Editor.boatSizeDensity(4, distribution) - 0.15) < 1e-12);
  assert.ok(Math.abs(Editor.boatSizeDensity(20, distribution) - 0.05) < 1e-12);
  assert.equal(Editor.boatSizeDensity(8, distribution), 1);
  const drawMean = center => {
    const settings = { ...distribution, center };
    const random = Editor.xorshift32(42);
    const values = Array.from({ length: 4000 }, () => Editor.sampleBoatLength(settings, 30, random));
    assert.ok(values.every(value => value >= 4 && value <= 20));
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  assert.ok(drawMean(15) > drawMean(7) + 2, "le centre déplace effectivement les longueurs tirées");
  const random = Editor.xorshift32(77);
  const limited = Array.from({ length: 1000 }, () => Editor.sampleBoatLength(distribution, 7, random));
  assert.ok(limited.every(value => value >= 4 && value <= 7 * 0.96));
  assert.equal(limited.filter(value => value === 7 * 0.96).length, 0, "aucun écrêtage à la limite de la place");
  assert.equal(Editor.sampleBoatLength(distribution, 3, random), null);
  for (const percent of [0, 100]) {
    const edge = Editor.normalizeBoatSizeDistribution({ minLength: 7, maxLength: 7.2, center: 20, minPercent: percent, maxPercent: percent });
    const length = Editor.sampleBoatLength(edge, 10, random);
    assert.ok(Number.isFinite(length) && length >= 7 && length <= 7.2);
    assert.equal(Editor.boatSizeDensity(edge.minLength, edge), percent / 100);
    assert.equal(Editor.boatSizeDensity(edge.maxLength, edge), percent / 100);
  }
});

test("tailles des bateaux: placement reproductible, sauvegarde et annulation des réglages", () => {
  const editor = new Editor.PortEditor(createValidPort());
  const settings = { minLength: 4, maxLength: 6, minPercent: 20, maxPercent: 10, center: 5 };
  editor.populateBoats({ occupancyRate: 1, seed: 123, boatSizeDistribution: settings });
  const boats = cloneBoats(editor.document.staticBoats);
  assert.ok(boats.length > 0);
  assert.ok(boats.every(boat => boat.length >= 4 && boat.length <= 6));
  assert.ok(boats.every(boat => !editor.document.berths.find(berth => berth.id === boat.berthId).isVisitor));
  editor.populateBoats({ occupancyRate: 1, seed: 123 });
  assert.deepEqual(editor.document.staticBoats, boats);
  const restored = Codec.parse(Codec.serialize(editor.document));
  assert.deepEqual(restored.editor.boatSizeDistribution, settings);
  editor.populateBoats({ boatSizeDistribution: { ...settings, minLength: 15, maxLength: 18, center: 16 } });
  assert.equal(editor.document.staticBoats.length, 0, "les places trop courtes restent libres");
  editor.undo();
  assert.deepEqual(editor.document.editor.boatSizeDistribution, settings);
  assert.deepEqual(editor.document.staticBoats, boats);
});

test("apparence IALA A: les catégories standard imposent forme et couleurs", () => {
  assert.deepEqual(
    Codec.recommendedBuoyAppearance("buoy_lateral", "port"),
    { shape: "can", colours: ["red"] }
  );
  assert.deepEqual(
    Codec.recommendedBuoyAppearance("buoy_lateral", "starboard"),
    { shape: "conical", colours: ["green"] }
  );
  assert.deepEqual(
    Codec.recommendedBuoyAppearance("buoy_cardinal", "east").colours,
    ["black", "yellow", "black"]
  );
  assert.deepEqual(
    Codec.recommendedBuoyAppearance("buoy_isolated_danger").colours,
    ["black", "red", "black"]
  );
  assert.deepEqual(
    Codec.recommendedBuoyAppearance("buoy_safe_water").colours,
    ["red", "white", "red", "white"]
  );
  assert.deepEqual(
    Codec.recommendedBuoyAppearance("mooring", "buoy"),
    { shape: "spherical", colours: ["yellow"] }
  );
});

test("bouée corps mort: un taquet unique suit son parent dans le KJP et le simulateur", () => {
  const document = createValidPort();
  const buoy = {
    id: "mooring-buoy-1",
    type: "buoy",
    position: { east: 24, north: -18 },
    radius: 0.65,
    height: 1.3,
    seamarkType: "mooring",
    category: "buoy",
    shape: "spherical",
    colours: ["yellow"],
    name: "Corps mort visiteurs",
    collision: true
  };
  document.structures.buoys.push(buoy);
  document.structures.cleats.push(Editor.cleatForMooringBuoy(document, buoy));

  const parsed = Codec.parse(Codec.serialize(document));
  const cleat = parsed.structures.cleats.find(item => item.parentId === buoy.id);
  assert.ok(cleat);
  assert.equal(cleat.z, buoy.height);
  const runtime = Codec.toRuntimeTopology(parsed);
  const runtimeCleat = runtime.structures.mooringCleats.find(item => item.parentId === buoy.id);
  assert.deepEqual(runtimeCleat, {
    id: cleat.id,
    parentId: buoy.id,
    kind: "buoy",
    x: buoy.position.east,
    y: buoy.position.north,
    z: buoy.height,
    orientation: 0
  });

  const editor = new Editor.PortEditor(parsed);
  editor.update(buoy.id, { height: 1.8 });
  assert.equal(
    editor.document.structures.cleats.find(item => item.parentId === buoy.id).z,
    1.8
  );
  const duplicate = Editor.duplicateObject(editor.document, buoy.id);
  const duplicatedBuoys = duplicate.structures.buoys.filter(item => item.seamarkType === "mooring");
  assert.equal(duplicatedBuoys.length, 2);
  assert.ok(duplicatedBuoys.every(item => (
    duplicate.structures.cleats.filter(cleat => cleat.parentId === item.id).length === 1
  )));
  const removed = Editor.removeObject(duplicate, buoy.id);
  assert.equal(removed.structures.cleats.some(item => item.parentId === buoy.id), false);

  const invalid = createValidPort();
  invalid.structures.buoys.push(buoy);
  assert.throws(
    () => Codec.serialize(invalid),
    error => error.errors?.some(item => (
      item.path === `$.structures.buoys[${invalid.structures.buoys.length - 1}]`
      && item.code === "reference"
    ))
  );
});

function cloneBoats(boats) {
  return JSON.parse(JSON.stringify(boats));
}

test("import OSM hors ligne: classification, fusion et déduplication", () => {
  const fixturePath = path.join(__dirname, "..", "fixtures", "osm-port-sample.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const duplicate = {
    ...fixture,
    elements: [fixture.elements[0], {
      ...fixture.elements[1],
      geometry: fixture.elements[1].geometry.slice(0, 1)
    }]
  };
  const merged = OSMImport.mergeOverpassResponses([fixture, duplicate]);
  assert.equal(merged.elements.length, fixture.elements.length);
  assert.equal(merged.elements.find(item => item.id === 1002).geometry.length, 2);
  const classified = OSMImport.classifyOverpass(merged, createValidPort().georeference);
  assert.equal(classified.find(item => item.osm.id === 1001).candidateType, "pontoon");
  assert.equal(classified.find(item => item.osm.id === 1002).candidateType, "catway");
  assert.equal(classified.find(item => item.osm.id === 2001).obstacleType, "breakwater");
  assert.equal(classified.find(item => item.osm.id === 3001).candidateType, "land");
  const buoy = classified.find(item => item.osm.id === 4001);
  assert.equal(buoy.candidateType, "buoy");
  assert.equal(buoy.seamarkType, "buoy_lateral");
  assert.equal(buoy.category, "starboard");
  assert.deepEqual(buoy.colours, ["green"]);
  assert.ok(classified.every(item => item.confidence >= 0 && item.confidence <= 1));
  const accepted = classified.map(candidate => ({ ...candidate, accepted: true }));
  const integrated = OSMImport.integrateCandidates(Codec.createEmpty({
    name: "Import",
    latitude: 47.586,
    longitude: -3.03
  }), accepted);
  assert.equal(integrated.document.structures.buoys.length, 1);
  assert.equal(integrated.document.structures.buoys[0].collision, true);
});

test("import OpenSeaMap: une bouée d'amarrage devient un corps mort avec taquet", () => {
  const document = Codec.createEmpty({ name: "Mouillages", latitude: 47.586, longitude: -3.03 });
  document.navigation.entries.push({
    id: "entry-moorings",
    name: "Entrée",
    position: { east: 0, north: 0 },
    heading: 0
  });
  const response = {
    elements: [{
      type: "node",
      id: 4101,
      lat: 47.5861,
      lon: -3.0298,
      tags: {
        "seamark:type": "mooring",
        "seamark:mooring:category": "buoy",
        "seamark:name": "Corps mort A"
      }
    }]
  };
  const [candidate] = OSMImport.classifyOverpass(response, document.georeference);
  assert.equal(candidate.seamarkType, "mooring");
  assert.equal(candidate.category, "buoy");
  const integrated = OSMImport.integrateCandidates(document, [{ ...candidate, accepted: true }]);
  const buoy = integrated.document.structures.buoys[0];
  const cleats = integrated.document.structures.cleats.filter(item => item.parentId === buoy.id);
  assert.equal(cleats.length, 1);
  assert.doesNotThrow(() => Codec.serialize(integrated.document));
});

test("import OSM: les hauteurs métriques avec unités restent distinctes des valeurs absentes", () => {
  const document = Codec.createEmpty({ id: "metric-heights", name: "Hauteurs", latitude: 47, longitude: -3 });
  const base = {
    candidateType: "pontoon",
    center: { east: 0, north: 0 },
    length: 30,
    width: 2.5,
    heading: 0,
    confidence: 0.9,
    osm: { type: "way", id: 1 }
  };
  const centimeters = OSMImport.candidateToObject({ ...base, tags: { height: "55 cm" } }, document).object;
  const meters = OSMImport.candidateToObject({ ...base, tags: { height: "0.55 m" } }, document).object;
  const missing = OSMImport.candidateToObject({ ...base, tags: {} }, document).object;
  assert.equal(centimeters.height, 0.55);
  assert.equal(meters.height, 0.55);
  assert.equal(missing.height, 0.5);
  assert.equal(centimeters.vertical.deckZ, 0.55);
});

test("requête Overpass: emprise 2 × 2 km et balises portuaires explicites", () => {
  const bounds = {
    south: 47.58,
    west: -3.035,
    north: 47.59,
    east: -3.025
  };
  const query = OSMImport.buildOverpassQuery(bounds);
  assert.match(query, /man_made"="pier/);
  assert.match(query, /breakwater\|groyne\|quay/);
  assert.match(query, /natural"="coastline/);
  assert.match(query, /seamark:type/);
  assert.match(query, /buoy_\(cardinal/);
  assert.match(query, /seamark:type"="mooring/);
  assert.throws(() => OSMImport.validateAnalysisBounds({
    south: 47.5,
    west: -3.2,
    north: 47.55,
    east: -3.1
  }), /2 × 2 km/);
});

test("requête Overpass: un polygone limite réellement la requête et le filtrage local", () => {
  const polygon = [
    { latitude: 47.5857, longitude: -3.0302 },
    { latitude: 47.5857, longitude: -3.0285 },
    { latitude: 47.5864, longitude: -3.0285 },
    { latitude: 47.5864, longitude: -3.0302 }
  ];
  const bounds = OSMImport.boundsForAnalysisPolygon(polygon);
  const query = OSMImport.buildOverpassQuery(bounds, { polygon });
  assert.match(query, /\(poly:"47\.5857000 -3\.0302000/);
  assert.doesNotMatch(query, /way\["man_made"="pier"\]\(47/);

  const fixturePath = path.join(__dirname, "..", "fixtures", "osm-port-sample.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const georeference = createValidPort().georeference;
  const candidates = OSMImport.classifyOverpass(fixture, georeference);
  const filtered = OSMImport.filterCandidatesByGeographicPolygon(candidates, polygon, georeference);
  assert.ok(filtered.length > 0);
  assert.ok(filtered.length < candidates.length);
  assert.ok(filtered.some(candidate => candidate.osm.id === 4001));
});

test("classification OSM: une surface de ponton utilise son rectangle orienté, jamais son périmètre", () => {
  const projection = Codec.createLocalProjection(47.586, -3.03);
  const localRectangle = [
    { east: -20, north: -1.5 },
    { east: 20, north: -1.5 },
    { east: 20, north: 1.5 },
    { east: -20, north: 1.5 },
    { east: -20, north: -1.5 }
  ].map(point => {
    const geographic = projection.inverse(point.east, point.north);
    return { lat: geographic.latitude, lon: geographic.longitude };
  });
  const [candidate] = OSMImport.classifyOverpass({
    elements: [{
      type: "way",
      id: 9090,
      tags: { man_made: "pier", area: "yes", floating: "yes" },
      geometry: localRectangle
    }]
  }, createValidPort().georeference);
  assert.equal(candidate.closed, true);
  assert.ok(Math.abs(candidate.length - 40) < 0.02);
  assert.ok(Math.abs(candidate.width - 3) < 0.02);
  assert.equal(candidate.decompositionRecommended, false);
});

test("client Overpass: bascule séquentielle après panne réseau ou surcharge", async () => {
  const calls = [];
  const attempts = [];
  const endpoints = [
    { id: "primary", label: "Primaire", url: "https://primary.test/interpreter" },
    { id: "secondary", label: "Secondaire", url: "https://secondary.test/interpreter" },
    { id: "third", label: "Troisième", url: "https://third.test/interpreter" }
  ];
  const result = await OSMImport.requestOverpass("[out:json];out;", {
    endpoints,
    timeoutMs: 1000,
    onAttempt: attempt => attempts.push(attempt.endpoint.id),
    async fetchImpl(url, options) {
      calls.push({ url, options });
      if (url.includes("primary")) throw new TypeError("Failed to fetch");
      if (url.includes("secondary")) return { ok: false, status: 504 };
      return {
        ok: true,
        status: 200,
        async json() {
          return { version: 0.6, elements: [{ type: "way", id: 1 }] };
        }
      };
    }
  });
  assert.deepEqual(attempts, ["primary", "secondary", "third"]);
  assert.equal(result.endpoint.id, "third");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.data.elements.length, 1);
  assert.match(calls[0].options.body, /^data=/);
  assert.equal(
    calls[0].options.headers["Content-Type"],
    "application/x-www-form-urlencoded;charset=UTF-8"
  );
  assert.equal(calls[0].options.headers.Accept, undefined);
});

test("client Overpass: erreur localisée et aucun retry sur requête invalide", async () => {
  let calls = 0;
  await assert.rejects(
    OSMImport.requestOverpass("[out:json];bad;", {
      endpoints: [
        { id: "first", label: "Premier", url: "https://first.test/interpreter" },
        { id: "second", label: "Second", url: "https://second.test/interpreter" }
      ],
      timeoutMs: 1000,
      async fetchImpl() {
        calls += 1;
        return { ok: false, status: 400 };
      }
    }),
    error => (
      error.name === "OverpassAvailabilityError"
      && error.message.includes("Premier: HTTP 400")
      && error.attempts.length === 1
    )
  );
  assert.equal(calls, 1);
});

test("client Overpass: jusqu’à cinq tentatives automatiques sur une panne transitoire", async () => {
  let calls = 0;
  const attempts = [];
  const retries = [];
  const delays = [];
  const result = await OSMImport.requestOverpass("[out:json];out;", {
    endpoints: [
      { id: "unstable", label: "Instable", url: "https://unstable.test/interpreter" }
    ],
    timeoutMs: 1000,
    maxRounds: 5,
    retryBaseDelayMs: 25,
    onAttempt: attempt => attempts.push({
      round: attempt.round,
      maxRounds: attempt.maxRounds,
      attemptNumber: attempt.attemptNumber
    }),
    onRetry: retry => retries.push({
      nextRound: retry.nextRound,
      delayMs: retry.delayMs
    }),
    async sleepImpl(delayMs) {
      delays.push(delayMs);
    },
    async fetchImpl() {
      calls += 1;
      if (calls < 5) throw new TypeError("Failed to fetch");
      return {
        ok: true,
        status: 200,
        async json() {
          return { version: 0.6, elements: [] };
        }
      };
    }
  });
  assert.equal(calls, 5);
  assert.equal(result.round, 5);
  assert.equal(result.maxRounds, 5);
  assert.equal(result.attempts.length, 4);
  assert.deepEqual(attempts.map(attempt => attempt.round), [1, 2, 3, 4, 5]);
  assert.ok(attempts.every(attempt => attempt.maxRounds === 5));
  assert.deepEqual(retries.map(retry => retry.nextRound), [2, 3, 4, 5]);
  assert.deepEqual(delays, [25, 50, 100, 200]);
});

test("client Overpass: le dernier serveur fiable est essayé en premier", async () => {
  const calls = [];
  const endpoints = [
    { id: "first", label: "Premier", url: "https://first.test/interpreter" },
    { id: "preferred", label: "Préféré", url: "https://preferred.test/interpreter" }
  ];
  const result = await OSMImport.requestOverpass("[out:json];out;", {
    endpoints,
    preferredEndpointId: "preferred",
    timeoutMs: 1000,
    async fetchImpl(url) {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return { version: 0.6, elements: [] };
        }
      };
    }
  });
  assert.deepEqual(calls, ["https://preferred.test/interpreter"]);
  assert.equal(result.endpoint.id, "preferred");
});

test("adaptation simulateur: entrée unique, navigation libre, visiteurs et géométries orientées", () => {
  const runtime = Codec.toRuntimeTopology(createValidPort());
  assert.equal(runtime.sourceFormat, "KJP");
  assert.deepEqual(Object.keys(runtime.scenarios).sort(), ["community", "free"]);
  assert.equal(runtime.scenarios.community.environment.windSpeedKn, 0);
  assert.equal(runtime.scenarios.community.environment.currentSpeedKn, 0);
  assert.equal(runtime.scenarios.community.initial.u, 0);
  assert.ok(runtime.structures.docks[0].heading !== 0);
  assert.equal(runtime.navigation.visitorBerths.length, 1);
  assert.equal(runtime.structures.linearObstacles.length, 1);
  assert.equal(runtime.structures.landAreas.length, 1);
  assert.equal(runtime.terrain.polygons.length, 0, "une zone terrestre ne doit pas être rendue deux fois");
  assert.equal(runtime.structures.buoys.length, 1);
  assert.equal(runtime.structures.buoys[0].seamarkType, "buoy_lateral");
});
