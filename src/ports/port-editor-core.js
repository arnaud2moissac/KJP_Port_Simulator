"use strict";

(function universalModule(root, factory) {
  const codec = typeof module === "object" && module.exports
    ? require("./kjp-codec.js")
    : root.KJPCodec;
  const api = factory(codec);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PortEditorCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEditorCore(KJPCodec) {
  const TAU = Math.PI * 2;

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function wrapAngle(value) {
    return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
  }

  function resolvedVertical(object, mode = "floating") {
    if (object?.vertical) return clone(object.vertical);
    const topZ = Number.isFinite(object?.height) ? object.height : 0.5;
    return { datum: "waterline", mode, baseZ: 0, topZ, deckZ: topZ };
  }

  function verticalWithDeck(deckZ, thickness = 0.5) {
    const safeThickness = Math.max(0.05, Number(thickness) || 0.5);
    return {
      datum: "waterline",
      mode: "floating",
      baseZ: deckZ - safeThickness,
      topZ: deckZ,
      deckZ
    };
  }

  function distanceToRectangle(point, rectangle) {
    const local = KJPCodec.worldToLocal(rectangle, point);
    const dx = Math.max(0, Math.abs(local.longitudinal) - rectangle.length / 2);
    const dy = Math.max(0, Math.abs(local.transverse) - rectangle.width / 2);
    return { distance: Math.hypot(dx, dy), local };
  }

  function attachCatwayToPontoon(catway, parent, options = {}) {
    const rootOverlap = clamp(Number(options.rootOverlap ?? 0.15), 0.1, 0.25);
    const axis = { east: Math.cos(catway.heading), north: Math.sin(catway.heading) };
    const endpoints = [-1, 1].map(sign => ({
      east: catway.center.east + sign * axis.east * catway.length / 2,
      north: catway.center.north + sign * axis.north * catway.length / 2
    }));
    const ranked = endpoints.map((point, index) => ({
      point,
      index,
      ...distanceToRectangle(point, parent)
    })).sort((first, second) => first.distance - second.distance);
    const currentRoot = ranked[0];
    const outer = endpoints[1 - currentRoot.index];
    const requestedEdge = options.parentEdge;
    const sideSign = requestedEdge === "port"
      ? 1
      : requestedEdge === "starboard"
        ? -1
        : Math.sign(currentRoot.local.transverse || KJPCodec.worldToLocal(parent, catway.center).transverse || 1);
    const station = clamp(
      Number.isFinite(options.station) ? options.station : currentRoot.local.longitudinal,
      -parent.length / 2,
      parent.length / 2
    );
    const root = KJPCodec.localToWorld(parent, {
      longitudinal: station,
      transverse: sideSign * (parent.width / 2 - rootOverlap)
    });
    const dx = outer.east - currentRoot.point.east;
    const dy = outer.north - currentRoot.point.north;
    const directionLength = Math.hypot(dx, dy);
    const direction = directionLength > 1e-9
      ? { east: dx / directionLength, north: dy / directionLength }
      : { east: Math.cos(catway.heading), north: Math.sin(catway.heading) };
    const length = Number(catway.length);
    if (length < 0.2) throw new Error("Catway trop court après raccordement");
    const parentVertical = resolvedVertical(parent);
    const thickness = Math.max(0.05, Number(catway.height) || 0.5);
    const vertical = verticalWithDeck(parentVertical.deckZ, thickness);
    return {
      ...catway,
      parentId: parent.id,
      center: {
        east: root.east + direction.east * length / 2,
        north: root.north + direction.north * length / 2
      },
      length,
      heading: Math.atan2(direction.north, direction.east),
      height: thickness,
      vertical,
      attachment: {
        parentId: parent.id,
        parentEdge: sideSign > 0 ? "port" : "starboard",
        station,
        rootOverlap,
        deckZ: vertical.deckZ,
        connector: options.connector || "flush",
        connectorLength: Number(options.connectorLength) || 0
      }
    };
  }

  function xorshift32(seed) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;
    return function random() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function createId(prefix, document) {
    const used = new Set();
    const structures = document.structures || {};
    for (const list of [
      structures.pontoons,
      structures.catways,
      structures.cleats,
      structures.obstacles,
      structures.landAreas,
      structures.buoys,
      document.berths,
      document.staticBoats,
      document.navigation?.entries,
      document.editor?.catwayGroups
    ]) {
      for (const item of list || []) if (item?.id) used.add(item.id);
    }
    let index = 1;
    while (used.has(`${prefix}-${index}`)) index += 1;
    return `${prefix}-${index}`;
  }

  function rectangleCorners(rectangle, clearance = 0) {
    const halfLength = rectangle.length / 2 + clearance;
    const halfWidth = rectangle.width / 2 + clearance;
    return [
      { longitudinal: -halfLength, transverse: -halfWidth },
      { longitudinal: halfLength, transverse: -halfWidth },
      { longitudinal: halfLength, transverse: halfWidth },
      { longitudinal: -halfLength, transverse: halfWidth }
    ].map(local => KJPCodec.localToWorld(rectangle, local));
  }

  function boatRectangle(boat, clearance = 0) {
    return {
      center: boat.center,
      length: boat.length + clearance * 2,
      width: boat.beam + clearance * 2,
      heading: boat.heading
    };
  }

  function polygonAxes(points) {
    return points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      const dx = next.east - point.east;
      const dy = next.north - point.north;
      const length = Math.hypot(dx, dy) || 1;
      return { east: -dy / length, north: dx / length };
    });
  }

  function projectPolygon(points, axis) {
    const values = points.map(point => point.east * axis.east + point.north * axis.north);
    return { minimum: Math.min(...values), maximum: Math.max(...values) };
  }

  function rectanglesOverlap(first, second, clearance = 0) {
    const firstPoints = rectangleCorners(first, clearance);
    const secondPoints = rectangleCorners(second, clearance);
    return [...polygonAxes(firstPoints), ...polygonAxes(secondPoints)].every(axis => {
      const a = projectPolygon(firstPoints, axis);
      const b = projectPolygon(secondPoints, axis);
      return a.maximum > b.minimum + 1e-9 && b.maximum > a.minimum + 1e-9;
    });
  }

  function pointDistance(first, second) {
    return Math.hypot(first.east - second.east, first.north - second.north);
  }

  function nearestPointOnSegment(point, start, end) {
    const dx = end.east - start.east;
    const dy = end.north - start.north;
    const denominator = dx * dx + dy * dy || 1;
    const t = clamp(
      ((point.east - start.east) * dx + (point.north - start.north) * dy) / denominator,
      0,
      1
    );
    return {
      east: start.east + dx * t,
      north: start.north + dy * t,
      t
    };
  }

  function snapPoint(point, document, options = {}) {
    const tolerance = Number(options.tolerance ?? 1.2);
    const angleStep = Number(options.angleStep ?? Math.PI / 12);
    const anchors = [];
    for (const rectangle of [
      ...(document.structures?.pontoons || []),
      ...(document.structures?.catways || [])
    ]) {
      anchors.push({ point: rectangle.center, kind: "center", id: rectangle.id });
      const half = rectangle.length / 2;
      anchors.push({
        point: KJPCodec.localToWorld(rectangle, { longitudinal: -half, transverse: 0 }),
        kind: "endpoint",
        id: rectangle.id
      });
      anchors.push({
        point: KJPCodec.localToWorld(rectangle, { longitudinal: half, transverse: 0 }),
        kind: "endpoint",
        id: rectangle.id
      });
      const axisStart = KJPCodec.localToWorld(rectangle, { longitudinal: -half, transverse: 0 });
      const axisEnd = KJPCodec.localToWorld(rectangle, { longitudinal: half, transverse: 0 });
      const nearest = nearestPointOnSegment(point, axisStart, axisEnd);
      anchors.push({ point: nearest, kind: "axis", id: rectangle.id });
    }
    const candidate = anchors
      .map(anchor => ({ ...anchor, distance: pointDistance(point, anchor.point) }))
      .filter(anchor => anchor.distance <= tolerance)
      .sort((first, second) => first.distance - second.distance)[0];
    const snapped = candidate ? { ...candidate.point } : { ...point };
    const heading = options.heading === undefined
      ? undefined
      : Math.round(options.heading / angleStep) * angleStep;
    return {
      point: snapped,
      heading,
      snapped: Boolean(candidate) || (
        options.heading !== undefined && Math.abs(heading - options.heading) > 1e-9
      ),
      anchor: candidate || null
    };
  }

  function distributePositions(length, {
    mode = "count",
    count = 8,
    spacing = 12,
    marginStart = 4,
    marginEnd = 4
  } = {}) {
    const usable = Math.max(0, length - marginStart - marginEnd);
    const resolvedCount = mode === "spacing"
      ? Math.max(1, Math.ceil(usable / Math.max(1, spacing)) + 1)
      : Math.max(1, Math.round(count));
    if (resolvedCount === 1) return [(-length / 2 + marginStart + length / 2 - marginEnd) / 2];
    const pitch = usable / (resolvedCount - 1);
    return Array.from(
      { length: resolvedCount },
      (_, index) => -length / 2 + marginStart + pitch * index
    );
  }

  function cleatsForRectangle(document, rectangle, options = {}) {
    const mode = options.mode === "spacing" ? "spacing" : "count";
    const countPerSide = Math.max(1, Math.round(options.countPerSide ?? 3));
    const spacing = Math.max(0.5, Number(options.spacing ?? 12));
    const margin = Math.min(rectangle.length / 3, Number(options.margin ?? 0.45));
    const longitudinal = distributePositions(rectangle.length, {
      mode,
      count: countPerSide,
      spacing,
      marginStart: margin,
      marginEnd: margin
    });
    const cleats = [];
    for (const transverse of [-rectangle.width / 2, rectangle.width / 2]) {
      for (const position of longitudinal) {
        cleats.push({
          id: createId("cleat", {
            ...document,
            structures: {
              ...document.structures,
              cleats: [...document.structures.cleats, ...cleats]
            }
          }),
          parentId: rectangle.id,
          localPosition: { longitudinal: position, transverse },
          z: resolvedVertical(rectangle).deckZ,
          orientation: transverse < 0 ? -Math.PI / 2 : Math.PI / 2
        });
      }
    }
    return cleats;
  }

  function cleatForMooringBuoy(document, buoy) {
    if (!buoy || buoy.seamarkType !== "mooring") {
      throw new Error("Une bouée corps mort est requise pour créer son taquet");
    }
    return {
      id: createId("cleat", document),
      parentId: buoy.id,
      localPosition: { longitudinal: 0, transverse: 0 },
      z: Math.max(0.2, Number(buoy.height) || 1.2),
      orientation: 0
    };
  }

  function createCatwayGroup(document, parentId, parameters = {}) {
    const parent = document.structures.pontoons.find(item => item.id === parentId);
    if (!parent) throw new Error(`Ponton parent absent : ${parentId}`);
    const settings = {
      mode: parameters.mode === "count" ? "count" : "spacing",
      count: Math.max(1, Math.round(parameters.count ?? 8)),
      spacing: Math.max(2, Number(parameters.spacing ?? 10)),
      side: ["port", "starboard", "both"].includes(parameters.side)
        ? parameters.side
        : "both",
      marginStart: Math.max(0, Number(parameters.marginStart ?? 4)),
      marginEnd: Math.max(0, Number(parameters.marginEnd ?? 0)),
      length: Math.max(2, Number(parameters.length ?? 10)),
      width: Math.max(0.3, Number(parameters.width ?? 0.6)),
      height: Math.max(0.2, Number(parameters.height ?? 0.5)),
      rootOverlap: clamp(Number(parameters.rootOverlap ?? 0.15), 0.1, 0.25),
      cleats: parameters.cleats !== false
    };
    const parentVertical = resolvedVertical(parent);
    const positions = distributePositions(parent.length, settings);
    const sideSigns = settings.side === "both"
      ? [-1, 1]
      : [settings.side === "port" ? 1 : -1];
    const groupId = parameters.id || createId("catway-group", document);
    const catways = [];
    const cleats = [];
    for (const sideSign of sideSigns) {
      for (const longitudinal of positions) {
        const id = createId("catway", {
          ...document,
          structures: {
            ...document.structures,
            catways: [...document.structures.catways, ...catways]
          }
        });
        const localCenter = {
          longitudinal,
          transverse: sideSign * (
            parent.width / 2 + settings.length / 2 - settings.rootOverlap
          )
        };
        const center = KJPCodec.localToWorld(parent, localCenter);
        const catway = {
          id,
          type: "catway",
          parentId,
          groupId,
          side: sideSign > 0 ? "port" : "starboard",
          attachmentLongitudinal: longitudinal,
          center,
          length: settings.length,
          width: settings.width,
          heading: wrapAngle(parent.heading + sideSign * Math.PI / 2),
          height: settings.height,
          vertical: verticalWithDeck(parentVertical.deckZ, settings.height),
          attachment: {
            parentId,
            parentEdge: sideSign > 0 ? "port" : "starboard",
            station: longitudinal,
            rootOverlap: settings.rootOverlap,
            deckZ: parentVertical.deckZ,
            connector: "flush",
            connectorLength: 0
          }
        };
        catways.push(catway);
        if (settings.cleats) cleats.push(...cleatsForRectangle({
          ...document,
          structures: {
            ...document.structures,
            cleats: [...document.structures.cleats, ...cleats]
          }
        }, catway));
      }
    }
    return {
      group: {
        id: groupId,
        parentId,
        memberIds: catways.map(item => item.id),
        parameters: settings
      },
      catways,
      cleats
    };
  }

  function redistributeCatwayGroup(document, groupId) {
    const group = document.editor.catwayGroups.find(item => item.id === groupId);
    if (!group) throw new Error(`Groupe absent : ${groupId}`);
    const memberIds = new Set(group.memberIds);
    const retainedCatways = document.structures.catways.filter(item => !memberIds.has(item.id));
    const retainedCleats = document.structures.cleats.filter(item => !memberIds.has(item.parentId));
    const working = clone(document);
    working.structures.catways = retainedCatways;
    working.structures.cleats = retainedCleats;
    working.editor.catwayGroups = working.editor.catwayGroups.filter(item => item.id !== groupId);
    const generated = createCatwayGroup(working, group.parentId, {
      ...group.parameters,
      id: group.id
    });
    working.structures.catways.push(...generated.catways);
    working.structures.cleats.push(...generated.cleats);
    working.editor.catwayGroups.push(generated.group);
    return working;
  }

  function inferBerths(document, options = {}) {
    const defaultWidth = clamp(
      Number(options.defaultWidth ?? document.editor.defaultBerthWidth ?? 4),
      2.8,
      20
    );
    const minimumLength = Math.max(3, Number(options.minimumLength ?? 5));
    const existingVisitorByParent = new Map(
      (document.berths || []).filter(item => item.isVisitor)
        .map(item => [`${item.parentId}:${item.side}`, item])
    );
    const berths = [];
    const addBerth = (catway, sideSign) => {
      const side = sideSign > 0 ? "port" : "starboard";
      const width = defaultWidth;
      const center = KJPCodec.localToWorld(catway, {
        longitudinal: 0,
        transverse: sideSign * (catway.width / 2 + width / 2)
      });
      const previous = existingVisitorByParent.get(`${catway.id}:${side}`);
      berths.push({
        id: previous?.id || createId("berth", { ...document, berths }),
        parentId: catway.id,
        side,
        name: previous?.name || "",
        center,
        heading: catway.heading,
        length: Math.max(minimumLength, catway.length - 0.8),
        width,
        maxLength: Math.max(minimumLength, catway.length - 0.8),
        maxBeam: Math.max(2.2, width - 0.55),
        isVisitor: Boolean(previous?.isVisitor)
      });
    };
    for (const catway of document.structures.catways) {
      addBerth(catway, -1);
      addBerth(catway, 1);
    }
    return berths.filter((berth, index, list) => {
      const testRectangle = {
        center: berth.center,
        length: berth.length,
        width: berth.width,
        heading: berth.heading
      };
      return !list.slice(0, index).some(previous => rectanglesOverlap(testRectangle, {
        center: previous.center,
        length: previous.length,
        width: previous.width,
        heading: previous.heading
      }, -0.1));
    });
  }

  function fitBoatToBerth(document, berth, random = Math.random) {
    const availableLength = Math.max(
      0.5,
      Math.min(Number(berth.length) || 0, Number(berth.maxLength) || Number(berth.length) || 0)
    );
    const availableBeam = Math.max(
      0.5,
      Math.min(Number(berth.width) || 0, Number(berth.maxBeam) || Number(berth.width) || 0)
    );
    const length = clamp(
      availableLength * (0.72 + random() * 0.2),
      Math.min(3.2, availableLength * 0.72),
      availableLength * 0.96
    );
    const beamCeiling = Math.max(0.45, Math.min(availableBeam, (Number(berth.width) || availableBeam) - 0.3));
    const beam = clamp(
      length * (0.27 + random() * 0.055),
      Math.min(1.35, beamCeiling * 0.72),
      beamCeiling
    );
    let center = { ...berth.center };
    const parent = document.structures.catways.find(item => item.id === berth.parentId);
    if (parent) {
      const berthLocal = KJPCodec.worldToLocal(parent, berth.center);
      const sideSign = berth.side === "port" ? 1 : -1;
      center = KJPCodec.localToWorld(parent, {
        longitudinal: clamp(berthLocal.longitudinal, -parent.length / 2, parent.length / 2),
        transverse: sideSign * (parent.width / 2 + 0.18 + beam / 2)
      });
    }
    return { center, length, beam };
  }

  function populateBoats(document, options = {}) {
    const occupancyRate = clamp(
      Number(options.occupancyRate ?? document.editor.occupancyRate ?? 0.62),
      0,
      1
    );
    const seed = Number(options.seed ?? document.editor.occupancySeed ?? 1) >>> 0;
    const random = xorshift32(seed);
    const boats = [];
    const sortedBerths = [...document.berths].sort((first, second) => first.id.localeCompare(second.id));
    for (const berth of sortedBerths) {
      if (berth.isVisitor || random() > occupancyRate) continue;
      const fitted = fitBoatToBerth(document, berth, random);
      const boat = {
        id: createId("boat", { ...document, staticBoats: boats }),
        berthId: berth.id,
        center: fitted.center,
        heading: berth.heading + (random() > 0.5 ? 0 : Math.PI),
        length: fitted.length,
        beam: fitted.beam,
        vesselType: "sailboat"
      };
      const rectangle = boatRectangle(boat, 0.08);
      const collidesStructure = [
        ...document.structures.pontoons,
        ...document.structures.catways
      ].some(structure => rectanglesOverlap(rectangle, structure, 0));
      const collidesBoat = boats.some(other => rectanglesOverlap(rectangle, boatRectangle(other), 0.12));
      if (!collidesStructure && !collidesBoat) boats.push(boat);
    }
    return boats;
  }

  function updateChildGeometry(document, parentId) {
    const parent = document.structures.pontoons.find(item => item.id === parentId);
    if (!parent) return document;
    const groupIds = document.editor.catwayGroups
      .filter(group => group.parentId === parentId)
      .map(group => group.id);
    let result = clone(document);
    for (const groupId of groupIds) result = redistributeCatwayGroup(result, groupId);
    const updatedParent = result.structures.pontoons.find(item => item.id === parentId);
    result.structures.catways = result.structures.catways.map(catway => {
      if (catway.parentId !== parentId || catway.groupId || !catway.attachment) return catway;
      const sideSign = catway.attachment.parentEdge === "starboard" ? -1 : 1;
      const rootOverlap = catway.attachment.rootOverlap ?? 0.15;
      const station = clamp(
        Number(catway.attachment.station) || 0,
        -updatedParent.length / 2,
        updatedParent.length / 2
      );
      const heading = wrapAngle(updatedParent.heading + sideSign * Math.PI / 2);
      const center = KJPCodec.localToWorld(updatedParent, {
        longitudinal: station,
        transverse: sideSign * (
          updatedParent.width / 2 + catway.length / 2 - rootOverlap
        )
      });
      return attachCatwayToPontoon({ ...catway, center, heading }, updatedParent, {
        parentEdge: catway.attachment.parentEdge,
        station,
        rootOverlap,
        connector: catway.attachment.connector,
        connectorLength: catway.attachment.connectorLength
      });
    });
    return result;
  }

  function findObject(document, id) {
    const collections = [
      ["pontoons", document.structures.pontoons],
      ["catways", document.structures.catways],
      ["cleats", document.structures.cleats],
      ["obstacles", document.structures.obstacles],
      ["landAreas", document.structures.landAreas],
      ["buoys", document.structures.buoys || []],
      ["berths", document.berths],
      ["staticBoats", document.staticBoats],
      ["entries", document.navigation.entries],
      ["catwayGroups", document.editor.catwayGroups]
    ];
    for (const [collection, items] of collections) {
      const index = items.findIndex(item => item.id === id);
      if (index >= 0) return { collection, items, index, object: items[index] };
    }
    return null;
  }

  function removeObject(document, id) {
    const result = clone(document);
    const found = findObject(result, id);
    if (!found) return result;
    found.items.splice(found.index, 1);
    if (found.collection === "pontoons") {
      const childIds = new Set(
        result.structures.catways.filter(item => item.parentId === id).map(item => item.id)
      );
      result.structures.catways = result.structures.catways.filter(item => !childIds.has(item.id));
      result.structures.cleats = result.structures.cleats.filter(
        item => item.parentId !== id && !childIds.has(item.parentId)
      );
      result.berths = result.berths.filter(item => !childIds.has(item.parentId) && item.parentId !== id);
      result.editor.catwayGroups = result.editor.catwayGroups.filter(item => item.parentId !== id);
    } else if (found.collection === "catways") {
      result.structures.cleats = result.structures.cleats.filter(item => item.parentId !== id);
      result.berths = result.berths.filter(item => item.parentId !== id);
      for (const group of result.editor.catwayGroups) {
        group.memberIds = group.memberIds.filter(memberId => memberId !== id);
      }
    } else if (["pontoons", "catways", "buoys"].includes(found.collection)) {
      result.structures.cleats = result.structures.cleats.filter(item => item.parentId !== id);
    } else if (found.collection === "berths") {
      result.staticBoats = result.staticBoats.filter(item => item.berthId !== id);
    }
    return result;
  }

  function duplicateObject(document, id, offset = { east: 2, north: -2 }) {
    const result = clone(document);
    const found = findObject(result, id);
    if (!found || ["cleats", "catwayGroups"].includes(found.collection)) return result;
    const copy = clone(found.object);
    copy.id = createId(
      found.collection === "staticBoats" ? "boat" : found.collection.replace(/s$/, ""),
      result
    );
    if (copy.center) {
      copy.center.east += offset.east;
      copy.center.north += offset.north;
    }
    if (copy.position) {
      copy.position.east += offset.east;
      copy.position.north += offset.north;
    }
    if (copy.points) {
      copy.points = copy.points.map(point => ({
        east: point.east + offset.east,
        north: point.north + offset.north
      }));
    }
    if (found.collection === "entries") result.navigation.entries = [copy];
    else {
      found.items.push(copy);
      if (found.collection === "buoys" && copy.seamarkType === "mooring") {
        result.structures.cleats.push(cleatForMooringBuoy(result, copy));
      }
    }
    return result;
  }

  class PortEditor {
    constructor(document, options = {}) {
      this.historyLimit = Math.max(10, options.historyLimit ?? 100);
      this.document = clone(document);
      this.past = [];
      this.future = [];
      this.selection = null;
    }

    snapshot() {
      return clone(this.document);
    }

    commit(nextDocument, label = "Modification") {
      const before = JSON.stringify(this.document);
      const after = JSON.stringify(nextDocument);
      if (before === after) return this.snapshot();
      this.past.push({ document: this.document, label });
      if (this.past.length > this.historyLimit) this.past.shift();
      this.document = clone(nextDocument);
      this.document.metadata.updatedAt = new Date().toISOString();
      this.future = [];
      return this.snapshot();
    }

    transaction(label, mutate) {
      const next = clone(this.document);
      mutate(next);
      return this.commit(next, label);
    }

    undo() {
      const previous = this.past.pop();
      if (!previous) return this.snapshot();
      this.future.push({ document: this.document, label: previous.label });
      this.document = previous.document;
      this.selection = null;
      return this.snapshot();
    }

    redo() {
      const next = this.future.pop();
      if (!next) return this.snapshot();
      this.past.push({ document: this.document, label: next.label });
      this.document = next.document;
      this.selection = null;
      return this.snapshot();
    }

    select(id) {
      this.selection = findObject(this.document, id)?.object?.id || null;
      return this.selection;
    }

    add(collection, object, label = "Ajout") {
      return this.transaction(label, next => {
        const target = collection === "entries"
          ? next.navigation.entries
          : collection === "catwayGroups"
            ? next.editor.catwayGroups
            : next.structures[collection] || next[collection];
        if (!Array.isArray(target)) throw new Error(`Collection inconnue : ${collection}`);
        if (collection === "entries") target.splice(0, target.length, object);
        else target.push(object);
        this.selection = object.id;
      });
    }

    update(id, patch, label = "Modification") {
      const next = clone(this.document);
      const found = findObject(next, id);
      if (!found) return this.snapshot();
      Object.assign(found.object, clone(patch));
      let result = next;
      if (found.collection === "pontoons") result = updateChildGeometry(next, id);
      if (
        found.collection === "buoys"
        && found.object.seamarkType === "mooring"
        && Object.hasOwn(patch, "height")
      ) {
        for (const cleat of next.structures.cleats) {
          if (cleat.parentId === id) cleat.z = Math.max(0.2, Number(found.object.height) || 1.2);
        }
      }
      return this.commit(result, label);
    }

    remove(id) {
      if (!findObject(this.document, id)) return this.snapshot();
      if (this.selection === id) this.selection = null;
      return this.commit(removeObject(this.document, id), "Suppression");
    }

    duplicate(id) {
      const next = duplicateObject(this.document, id);
      return this.commit(next, "Duplication");
    }

    addCatwayGroup(parentId, parameters) {
      const next = clone(this.document);
      const generated = createCatwayGroup(next, parentId, parameters);
      next.structures.catways.push(...generated.catways);
      next.structures.cleats.push(...generated.cleats);
      next.editor.catwayGroups.push(generated.group);
      return this.commit(next, "Série de catways");
    }

    updateGroup(groupId, parameters) {
      const next = clone(this.document);
      const group = next.editor.catwayGroups.find(item => item.id === groupId);
      if (!group) return this.snapshot();
      group.parameters = { ...group.parameters, ...clone(parameters) };
      return this.commit(redistributeCatwayGroup(next, groupId), "Modifier la série");
    }

    detachCatway(catwayId) {
      return this.transaction("Détacher le catway", next => {
        const catway = next.structures.catways.find(item => item.id === catwayId);
        if (!catway?.groupId) return;
        const group = next.editor.catwayGroups.find(item => item.id === catway.groupId);
        if (group) group.memberIds = group.memberIds.filter(id => id !== catwayId);
        delete catway.groupId;
        delete catway.parentId;
        delete catway.attachment;
      });
    }

    generateCleats(parentId, options = {}) {
      return this.transaction("Générer les taquets", next => {
        const parent = [
          ...next.structures.pontoons,
          ...next.structures.catways
        ].find(item => item.id === parentId);
        if (!parent) throw new Error(`Structure absente : ${parentId}`);
        next.structures.cleats = next.structures.cleats.filter(item => item.parentId !== parentId);
        next.structures.cleats.push(...cleatsForRectangle(next, parent, options));
      });
    }

    recomputeBerths(options = {}) {
      return this.transaction("Recalculer les places", next => {
        next.editor.defaultBerthWidth = clamp(
          Number(options.defaultWidth ?? next.editor.defaultBerthWidth ?? 4),
          2.8,
          20
        );
        next.berths = inferBerths(next, options);
        const berthIds = new Set(next.berths.map(item => item.id));
        next.staticBoats = next.staticBoats.filter(item => !item.berthId || berthIds.has(item.berthId));
      });
    }

    populateBoats(options = {}) {
      return this.transaction("Remplir le port", next => {
        next.editor.occupancyRate = clamp(
          Number(options.occupancyRate ?? next.editor.occupancyRate),
          0,
          1
        );
        next.editor.occupancySeed = Number(options.seed ?? next.editor.occupancySeed) >>> 0;
        next.staticBoats = populateBoats(next, options);
      });
    }
  }

  return Object.freeze({
    PortEditor,
    wrapAngle,
    xorshift32,
    createId,
    resolvedVertical,
    verticalWithDeck,
    distanceToRectangle,
    attachCatwayToPontoon,
    rectangleCorners,
    rectanglesOverlap,
    nearestPointOnSegment,
    snapPoint,
    distributePositions,
    cleatsForRectangle,
    cleatForMooringBuoy,
    createCatwayGroup,
    redistributeCatwayGroup,
    inferBerths,
    fitBoatToBerth,
    populateBoats,
    findObject,
    removeObject,
    duplicateObject
  });
});
