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
