"use strict";

(function universalModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.KJPCodec = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createKJPCodec() {
  const FORMAT = "KJP";
  const SCHEMA_VERSION = 2;
  const LEGACY_SCHEMA_VERSION = 1;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_STRUCTURES = 5000;
  const MAX_CLEATS = 20000;
  const MAX_BOATS = 2000;
  const MAX_EXTENT_METERS = 20000;
  const BUOY_TYPES = Object.freeze([
    "buoy_cardinal",
    "buoy_installation",
    "buoy_isolated_danger",
    "buoy_lateral",
    "buoy_safe_water",
    "buoy_special_purpose",
    "mooring"
  ]);
  const BUOY_SHAPES = Object.freeze([
    "can",
    "conical",
    "spherical",
    "pillar",
    "spar",
    "barrel",
    "super-buoy",
    "unknown"
  ]);
  const BUOY_APPEARANCES = Object.freeze({
    buoy_lateral: Object.freeze({
      port: Object.freeze({ shape: "can", colours: Object.freeze(["red"]) }),
      starboard: Object.freeze({ shape: "conical", colours: Object.freeze(["green"]) })
    }),
    buoy_cardinal: Object.freeze({
      north: Object.freeze({ shape: "pillar", colours: Object.freeze(["yellow", "black"]) }),
      east: Object.freeze({ shape: "pillar", colours: Object.freeze(["black", "yellow", "black"]) }),
      south: Object.freeze({ shape: "pillar", colours: Object.freeze(["black", "yellow"]) }),
      west: Object.freeze({ shape: "pillar", colours: Object.freeze(["yellow", "black", "yellow"]) })
    }),
    buoy_isolated_danger: Object.freeze({
      default: Object.freeze({ shape: "pillar", colours: Object.freeze(["black", "red", "black"]) })
    }),
    buoy_safe_water: Object.freeze({
      default: Object.freeze({ shape: "spherical", colours: Object.freeze(["red", "white", "red", "white"]) })
    }),
    buoy_special_purpose: Object.freeze({
      default: Object.freeze({ shape: "pillar", colours: Object.freeze(["yellow"]) })
    }),
    buoy_installation: Object.freeze({
      default: Object.freeze({ shape: "super-buoy", colours: Object.freeze(["yellow"]) })
    }),
    mooring: Object.freeze({
      buoy: Object.freeze({ shape: "spherical", colours: Object.freeze(["yellow"]) }),
      default: Object.freeze({ shape: "spherical", colours: Object.freeze(["yellow"]) })
    })
  });
  const EARTH_RADIUS = 6371008.8;
  const DANGEROUS_TEXT = /<\s*\/?\s*(?:script|iframe|object|embed|svg|html)\b|\bon[a-z]+\s*=|javascript\s*:/i;
  const SAFE_URL = /^https?:\/\//i;

  class KJPValidationError extends Error {
    constructor(errors, message = "Fichier KJP invalide") {
      super(`${message} : ${errors.map(error => `${error.path} — ${error.message}`).join(" ; ")}`);
      this.name = "KJPValidationError";
      this.errors = errors;
    }
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function recommendedBuoyAppearance(seamarkType, category = "") {
    const byCategory = BUOY_APPEARANCES[seamarkType] || BUOY_APPEARANCES.buoy_special_purpose;
    const normalizedCategory = String(category || "").toLowerCase();
    const appearance = byCategory[normalizedCategory] || byCategory.default || Object.values(byCategory)[0];
    return {
      shape: appearance.shape,
      colours: [...appearance.colours]
    };
  }

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])])
    );
  }

  function stableStringify(value, space = 2) {
    return `${JSON.stringify(canonicalize(value), null, space)}\n`;
  }

  function freezeDeep(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
    return value;
  }

  function textBytes(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).byteLength;
    return Buffer.byteLength(text, "utf8");
  }

  function addError(errors, path, message, code = "invalid") {
    errors.push({ path, message, code });
  }

  function inspectUnsafeValues(value, path, errors, seen = new Set()) {
    if (value && typeof value === "object") {
      if (seen.has(value)) {
        addError(errors, path, "référence circulaire interdite", "circular");
        return;
      }
      seen.add(value);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      addError(errors, path, "nombre non fini", "non-finite");
    } else if (typeof value === "string") {
      if (value.length > 20000) addError(errors, path, "texte trop long", "limit");
      if (DANGEROUS_TEXT.test(value)) {
        addError(errors, path, "contenu HTML ou script interdit", "unsafe-text");
      }
    } else if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
      addError(errors, path, "type non JSON interdit", "non-json");
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => inspectUnsafeValues(item, `${path}[${index}]`, errors, seen));
    } else if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (DANGEROUS_TEXT.test(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
          addError(errors, `${path}.${key}`, "clé dangereuse interdite", "unsafe-key");
        } else {
          inspectUnsafeValues(item, `${path}.${key}`, errors, seen);
        }
      }
    }
    if (value && typeof value === "object") seen.delete(value);
  }

  function requireObject(value, path, errors) {
    if (!isObject(value)) {
      addError(errors, path, "objet attendu", "type");
      return {};
    }
    return value;
  }

  function requireArray(value, path, errors) {
    if (!Array.isArray(value)) {
      addError(errors, path, "tableau attendu", "type");
      return [];
    }
    return value;
  }

  function requireString(value, path, errors, { required = true, max = 5000 } = {}) {
    if (value === undefined || value === null || value === "") {
      if (required) addError(errors, path, "texte obligatoire", "required");
      return "";
    }
    if (typeof value !== "string") {
      addError(errors, path, "texte attendu", "type");
      return "";
    }
    const result = value.trim();
    if (required && !result) addError(errors, path, "texte obligatoire", "required");
    if (result.length > max) addError(errors, path, `maximum ${max} caractères`, "limit");
    return result;
  }

  function requireNumber(value, path, errors, {
    minimum = -Infinity,
    maximum = Infinity,
    required = true
  } = {}) {
    if (value === undefined || value === null || value === "") {
      if (required) addError(errors, path, "nombre obligatoire", "required");
      return 0;
    }
    if (!finite(value)) {
      addError(errors, path, "nombre fini attendu", "type");
      return 0;
    }
    if (value < minimum || value > maximum) {
      addError(errors, path, `valeur hors limites [${minimum}, ${maximum}]`, "range");
    }
    return value;
  }

  function validateUrl(value, path, errors) {
    if (value === undefined || value === null || value === "") return;
    if (typeof value !== "string" || !SAFE_URL.test(value)) {
      addError(errors, path, "seules les URL HTTP/HTTPS sont autorisées", "url");
      return;
    }
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
    } catch {
      addError(errors, path, "URL HTTP/HTTPS invalide", "url");
    }
  }

  function validateId(value, path, errors, ids) {
    const id = requireString(value, path, errors, { max: 160 });
    if (id && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(id)) {
      addError(errors, path, "identifiant invalide", "id");
    }
    if (id && ids.has(id)) addError(errors, path, "identifiant dupliqué", "duplicate");
    if (id) ids.add(id);
    return id;
  }

  function validatePoint(point, path, errors) {
    const object = requireObject(point, path, errors);
    const east = requireNumber(object.east, `${path}.east`, errors, {
      minimum: -MAX_EXTENT_METERS,
      maximum: MAX_EXTENT_METERS
    });
    const north = requireNumber(object.north, `${path}.north`, errors, {
      minimum: -MAX_EXTENT_METERS,
      maximum: MAX_EXTENT_METERS
    });
    if (Math.hypot(east, north) > MAX_EXTENT_METERS + 1e-9) {
      addError(errors, path, `point situé à plus de ${MAX_EXTENT_METERS} m de l’origine`, "range");
    }
    return { east, north };
  }

  function legacyVertical(height, mode) {
    const topZ = finite(height) ? height : 0.5;
    return {
      datum: "waterline",
      mode,
      baseZ: 0,
      topZ,
      deckZ: topZ
    };
  }

  function validateVertical(value, path, errors, fallbackHeight, expectedMode) {
    if (value === undefined || value === null) {
      return legacyVertical(fallbackHeight, expectedMode);
    }
    const object = requireObject(value, path, errors);
    const datum = object.datum === "waterline" ? object.datum : "waterline";
    if (object.datum !== "waterline") {
      addError(errors, `${path}.datum`, "doit valoir waterline", "enum");
    }
    const mode = ["floating", "fixed"].includes(object.mode)
      ? object.mode
      : expectedMode;
    if (!["floating", "fixed"].includes(object.mode)) {
      addError(errors, `${path}.mode`, "mode vertical inconnu", "enum");
    }
    const baseZ = requireNumber(object.baseZ, `${path}.baseZ`, errors, {
      minimum: -50,
      maximum: 200
    });
    const topZ = requireNumber(object.topZ, `${path}.topZ`, errors, {
      minimum: -50,
      maximum: 200
    });
    const deckZ = requireNumber(object.deckZ, `${path}.deckZ`, errors, {
      minimum: -50,
      maximum: 200
    });
    if (topZ < baseZ) addError(errors, path, "topZ doit être supérieur ou égal à baseZ", "geometry");
    if (deckZ < baseZ - 1e-9 || deckZ > topZ + 1e-9) {
      addError(errors, `${path}.deckZ`, "deckZ doit être compris entre baseZ et topZ", "geometry");
    }
    if (finite(fallbackHeight) && Math.abs((topZ - baseZ) - fallbackHeight) > 1e-6) {
      addError(errors, path, "height doit correspondre à topZ - baseZ", "geometry");
    }
    return { datum, mode, baseZ, topZ, deckZ };
  }

  function validateRectangle(rectangle, path, errors, ids, type) {
    const object = requireObject(rectangle, path, errors);
    const id = validateId(object.id, `${path}.id`, errors, ids);
    const center = validatePoint(object.center, `${path}.center`, errors);
    const length = requireNumber(object.length, `${path}.length`, errors, {
      minimum: 0.2,
      maximum: MAX_EXTENT_METERS
    });
    const width = requireNumber(object.width, `${path}.width`, errors, {
      minimum: 0.1,
      maximum: 1000
    });
    const heading = requireNumber(object.heading, `${path}.heading`, errors, {
      minimum: -Math.PI * 8,
      maximum: Math.PI * 8
    });
    const height = requireNumber(object.height, `${path}.height`, errors, {
      minimum: 0,
      maximum: 100,
      required: false
    });
    const vertical = validateVertical(
      object.vertical,
      `${path}.vertical`,
      errors,
      height,
      "floating"
    );
    return { ...object, id, type, center, length, width, heading, height, vertical };
  }

  function validatePolyline(obstacle, path, errors, ids) {
    const object = requireObject(obstacle, path, errors);
    const id = validateId(object.id, `${path}.id`, errors, ids);
    const type = ["breakwater", "groyne", "quay", "obstacle"].includes(object.type)
      ? object.type
      : "obstacle";
    if (type !== object.type) addError(errors, `${path}.type`, "type d'obstacle inconnu", "enum");
    const points = requireArray(object.points, `${path}.points`, errors)
      .map((point, index) => validatePoint(point, `${path}.points[${index}]`, errors));
    if (points.length < 2) addError(errors, `${path}.points`, "au moins deux points requis", "geometry");
    const width = requireNumber(object.width, `${path}.width`, errors, {
      minimum: 0.1,
      maximum: 1000
    });
    const height = requireNumber(object.height, `${path}.height`, errors, {
      minimum: 0,
      maximum: 200
    });
    const vertical = validateVertical(
      object.vertical,
      `${path}.vertical`,
      errors,
      height,
      "fixed"
    );
    return { ...object, id, type, points, width, height, vertical };
  }

  function validatePolygon(area, path, errors, ids) {
    const object = requireObject(area, path, errors);
    const id = validateId(object.id, `${path}.id`, errors, ids);
    const points = requireArray(object.points, `${path}.points`, errors)
      .map((point, index) => validatePoint(point, `${path}.points[${index}]`, errors));
    if (points.length < 3) addError(errors, `${path}.points`, "au moins trois points requis", "geometry");
    return { ...object, id, type: "land", points };
  }

  function validateBuoy(buoy, path, errors, ids) {
    const object = requireObject(buoy, path, errors);
    const id = validateId(object.id, `${path}.id`, errors, ids);
    const position = validatePoint(object.position, `${path}.position`, errors);
    const radius = requireNumber(object.radius, `${path}.radius`, errors, {
      minimum: 0.1,
      maximum: 10
    });
    const height = requireNumber(object.height, `${path}.height`, errors, {
      minimum: 0.2,
      maximum: 30
    });
    const seamarkType = requireString(
      object.seamarkType,
      `${path}.seamarkType`,
      errors,
      { max: 80 }
    );
    if (!BUOY_TYPES.includes(seamarkType)) {
      addError(errors, `${path}.seamarkType`, "type de bouée ou d'amarrage inconnu", "enum");
    }
    const shape = requireString(
      object.shape ?? "unknown",
      `${path}.shape`,
      errors,
      { max: 80 }
    );
    if (!BUOY_SHAPES.includes(shape)) {
      addError(errors, `${path}.shape`, "forme de bouée inconnue", "enum");
    }
    const category = requireString(
      object.category,
      `${path}.category`,
      errors,
      { required: false, max: 120 }
    );
    const name = requireString(
      object.name,
      `${path}.name`,
      errors,
      { required: false, max: 240 }
    );
    const colours = (
      object.colours === undefined
        ? []
        : requireArray(object.colours, `${path}.colours`, errors)
    ).map((colour, index) => requireString(
      colour,
      `${path}.colours[${index}]`,
      errors,
      { max: 40 }
    ));
    if (colours.length > 8) {
      addError(errors, `${path}.colours`, "maximum 8 couleurs", "limit");
    }
    return {
      ...object,
      id,
      type: "buoy",
      position,
      radius,
      height,
      seamarkType,
      shape,
      category,
      name,
      colours,
      collision: object.collision !== false
    };
  }

  function structurePosition(structure) {
    return structure?.center || null;
  }

  function localToWorld(parent, local) {
    const c = Math.cos(parent.heading);
    const s = Math.sin(parent.heading);
    return {
      east: parent.center.east + local.longitudinal * c - local.transverse * s,
      north: parent.center.north + local.longitudinal * s + local.transverse * c
    };
  }

  function worldToLocal(parent, point) {
    const dx = point.east - parent.center.east;
    const dy = point.north - parent.center.north;
    const c = Math.cos(parent.heading);
    const s = Math.sin(parent.heading);
    return {
      longitudinal: dx * c + dy * s,
      transverse: -dx * s + dy * c
    };
  }

  function geometryBounds(document) {
    const points = [];
    const add = point => {
      if (point && finite(point.east) && finite(point.north)) points.push(point);
    };
    for (const rectangle of [
      ...(document.structures?.pontoons || []),
      ...(document.structures?.catways || [])
    ]) {
      if (!rectangle.center) continue;
      const halfLength = rectangle.length / 2;
      const halfWidth = rectangle.width / 2;
      for (const longitudinal of [-halfLength, halfLength]) {
        for (const transverse of [-halfWidth, halfWidth]) {
          add(localToWorld(rectangle, { longitudinal, transverse }));
        }
      }
    }
    for (const obstacle of document.structures?.obstacles || []) {
      obstacle.points?.forEach(add);
    }
    for (const area of document.structures?.landAreas || []) area.points?.forEach(add);
    for (const buoy of document.structures?.buoys || []) {
      if (!buoy.position) continue;
      add({
        east: buoy.position.east - (buoy.radius || 0),
        north: buoy.position.north - (buoy.radius || 0)
      });
      add({
        east: buoy.position.east + (buoy.radius || 0),
        north: buoy.position.north + (buoy.radius || 0)
      });
    }
    for (const boat of document.staticBoats || []) add(boat.center);
    for (const berth of document.berths || []) add(berth.center);
    for (const entry of document.navigation?.entries || []) add(entry.position);
    if (!points.length) return { minEast: 0, minNorth: 0, maxEast: 0, maxNorth: 0 };
    return {
      minEast: Math.min(...points.map(point => point.east)),
      minNorth: Math.min(...points.map(point => point.north)),
      maxEast: Math.max(...points.map(point => point.east)),
      maxNorth: Math.max(...points.map(point => point.north))
    };
  }

  function migrateLegacyDocument(input) {
    if (!isObject(input) || input.schemaVersion !== LEGACY_SCHEMA_VERSION) return input;
    const document = clone(input);
    const structures = document.structures || {};
    for (const rectangle of [
      ...(structures.pontoons || []),
      ...(structures.catways || [])
    ]) {
      if (!rectangle.vertical) rectangle.vertical = legacyVertical(rectangle.height, "floating");
    }
    for (const obstacle of structures.obstacles || []) {
      if (!obstacle.vertical) obstacle.vertical = legacyVertical(obstacle.height, "fixed");
    }

    const pontoons = new Map((structures.pontoons || []).map(item => [item.id, item]));
    const catways = new Map((structures.catways || []).map(item => [item.id, item]));
    for (const group of document.editor?.catwayGroups || []) {
      const parent = pontoons.get(group.parentId);
      if (!parent) continue;
      for (const memberId of group.memberIds || []) {
        const catway = catways.get(memberId);
        if (!catway || catway.attachment) continue;
        const parentDeckZ = parent.vertical?.deckZ ?? parent.height ?? 0.5;
        const catwayThickness = finite(catway.height) ? catway.height : 0.5;
        catway.vertical = {
          datum: "waterline",
          mode: "floating",
          baseZ: parentDeckZ - catwayThickness,
          topZ: parentDeckZ,
          deckZ: parentDeckZ
        };
        const local = worldToLocal(parent, catway.center);
        const sideSign = Math.sign(local.transverse || 1);
        const rootOverlap = 0.15;
        const headingVector = {
          east: Math.cos(catway.heading),
          north: Math.sin(catway.heading)
        };
        const root = {
          east: catway.center.east - headingVector.east * catway.length / 2,
          north: catway.center.north - headingVector.north * catway.length / 2
        };
        const expectedRoot = localToWorld(parent, {
          longitudinal: local.longitudinal,
          transverse: sideSign * (parent.width / 2 - rootOverlap)
        });
        catway.center.east += expectedRoot.east - root.east;
        catway.center.north += expectedRoot.north - root.north;
        catway.parentId = parent.id;
        catway.attachment = {
          parentId: parent.id,
          parentEdge: sideSign > 0 ? "port" : "starboard",
          station: local.longitudinal,
          rootOverlap,
          deckZ: parentDeckZ,
          connector: "flush",
          connectorLength: 0
        };
      }
    }
    document.schemaVersion = SCHEMA_VERSION;
    return document;
  }

  function validateCatwayAttachment(catway, index, pontoons, errors) {
    const path = `$.structures.catways[${index}]`;
    if (catway.attachment === undefined && catway.parentId === undefined) return;
    const attachment = requireObject(catway.attachment, `${path}.attachment`, errors);
    const parentId = requireString(
      attachment.parentId ?? catway.parentId,
      `${path}.attachment.parentId`,
      errors,
      { max: 160 }
    );
    const parent = pontoons.find(item => item.id === parentId);
    if (!parent) {
      addError(errors, `${path}.attachment.parentId`, "ponton parent absent", "reference");
      return;
    }
    if (catway.parentId !== undefined && catway.parentId !== parentId) {
      addError(errors, `${path}.parentId`, "parentId incohérent avec attachment.parentId", "reference");
    }
    const parentEdge = ["port", "starboard"].includes(attachment.parentEdge)
      ? attachment.parentEdge
      : "";
    if (!parentEdge) addError(errors, `${path}.attachment.parentEdge`, "rive port ou starboard attendue", "enum");
    const station = requireNumber(attachment.station, `${path}.attachment.station`, errors, {
      minimum: -parent.length / 2,
      maximum: parent.length / 2
    });
    const rootOverlap = requireNumber(
      attachment.rootOverlap,
      `${path}.attachment.rootOverlap`,
      errors,
      { minimum: 0.1, maximum: 0.25 }
    );
    const connector = ["flush", "hinge", "ramp"].includes(attachment.connector)
      ? attachment.connector
      : "";
    if (!connector) addError(errors, `${path}.attachment.connector`, "raccord inconnu", "enum");
    const connectorLength = requireNumber(
      attachment.connectorLength,
      `${path}.attachment.connectorLength`,
      errors,
      { minimum: 0, maximum: 20 }
    );
    if (connector === "ramp" && connectorLength < 0.2) {
      addError(errors, `${path}.attachment.connectorLength`, "une rampe doit mesurer au moins 0,20 m", "geometry");
    }
    const deckZ = requireNumber(attachment.deckZ, `${path}.attachment.deckZ`, errors, {
      minimum: -50,
      maximum: 200
    });
    const sideSign = parentEdge === "starboard" ? -1 : 1;
    const expectedRoot = localToWorld(parent, {
      longitudinal: station,
      transverse: sideSign * (parent.width / 2 - rootOverlap)
    });
    const direction = { east: Math.cos(catway.heading), north: Math.sin(catway.heading) };
    const roots = [-1, 1].map(sign => ({
      east: catway.center.east + sign * direction.east * catway.length / 2,
      north: catway.center.north + sign * direction.north * catway.length / 2
    }));
    const rootGap = Math.min(...roots.map(point => Math.hypot(
      point.east - expectedRoot.east,
      point.north - expectedRoot.north
    )));
    if (rootGap > 0.02) {
      addError(errors, `${path}.attachment`, `racine distante de ${(rootGap * 100).toFixed(1)} cm du raccord`, "geometry");
    }
    if (Math.abs(deckZ - catway.vertical.deckZ) > 1e-6) {
      addError(errors, `${path}.attachment.deckZ`, "deckZ doit correspondre au niveau du catway", "geometry");
    }
    if (
      connector === "flush"
      && Math.abs(parent.vertical.deckZ - catway.vertical.deckZ) > 0.08
    ) {
      addError(errors, `${path}.attachment.connector`, "écart vertical supérieur à 0,08 m : rampe ou articulation requise", "geometry");
    }
  }

  function normalizeDocument(document, options = {}) {
    const errors = [];
    if (!isObject(document)) {
      throw new KJPValidationError([{ path: "$", message: "objet JSON attendu", code: "type" }]);
    }
    inspectUnsafeValues(document, "$", errors);
    document = migrateLegacyDocument(document);
    if (document.format !== FORMAT) addError(errors, "$.format", `doit valoir "${FORMAT}"`, "format");
    if (document.schemaVersion !== SCHEMA_VERSION) {
      addError(errors, "$.schemaVersion", `version ${document.schemaVersion} non prise en charge`, "version");
    }
    requireString(document.generatorVersion, "$.generatorVersion", errors, { max: 80 });

    const metadata = requireObject(document.metadata, "$.metadata", errors);
    requireString(metadata.id, "$.metadata.id", errors, { max: 160 });
    requireNumber(metadata.revision, "$.metadata.revision", errors, { minimum: 1, maximum: 1000000 });
    requireString(metadata.name, "$.metadata.name", errors, { max: 240 });
    requireString(metadata.author, "$.metadata.author", errors, { required: false, max: 240 });
    requireString(metadata.source, "$.metadata.source", errors, { required: false, max: 500 });
    validateUrl(metadata.harborMasterUrl, "$.metadata.harborMasterUrl", errors);
    for (const field of ["openingHours", "currentAdvice", "comment"]) {
      requireString(metadata[field], `$.metadata.${field}`, errors, { required: false, max: 5000 });
    }

    const georeference = requireObject(document.georeference, "$.georeference", errors);
    if (georeference.coordinateSystem !== "local-ENU") {
      addError(errors, "$.georeference.coordinateSystem", "doit valoir local-ENU", "enum");
    }
    const origin = requireObject(georeference.origin, "$.georeference.origin", errors);
    requireNumber(origin.latitude, "$.georeference.origin.latitude", errors, { minimum: -90, maximum: 90 });
    requireNumber(origin.longitude, "$.georeference.origin.longitude", errors, { minimum: -180, maximum: 180 });
    if (georeference.distanceUnit !== "m") addError(errors, "$.georeference.distanceUnit", "doit valoir m", "unit");
    if (georeference.angleUnit !== "rad") addError(errors, "$.georeference.angleUnit", "doit valoir rad", "unit");

    const sources = requireArray(document.sources, "$.sources", errors);
    sources.forEach((source, index) => {
      const path = `$.sources[${index}]`;
      const object = requireObject(source, path, errors);
      requireString(object.provider, `${path}.provider`, errors, { max: 160 });
      requireString(object.attribution, `${path}.attribution`, errors, { max: 1000 });
      requireString(object.license, `${path}.license`, errors, { max: 500 });
      validateUrl(object.url, `${path}.url`, errors);
      if (object.kind === "orthophoto" && object.embedded === true) {
        addError(errors, `${path}.embedded`, "une orthophoto ne peut jamais être embarquée", "imagery");
      }
      for (const key of Object.keys(object)) {
        if (/tile|image|blob|dataurl/i.test(key) && !["retrievedAt"].includes(key)) {
          addError(errors, `${path}.${key}`, "donnée raster interdite dans KJP", "imagery");
        }
      }
    });

    const structures = requireObject(document.structures, "$.structures", errors);
    const ids = new Set();
    const pontoons = requireArray(structures.pontoons, "$.structures.pontoons", errors)
      .map((item, index) => validateRectangle(item, `$.structures.pontoons[${index}]`, errors, ids, "pontoon"));
    const catways = requireArray(structures.catways, "$.structures.catways", errors)
      .map((item, index) => validateRectangle(item, `$.structures.catways[${index}]`, errors, ids, "catway"));
    const obstacles = requireArray(structures.obstacles, "$.structures.obstacles", errors)
      .map((item, index) => validatePolyline(item, `$.structures.obstacles[${index}]`, errors, ids));
    const landAreas = requireArray(structures.landAreas, "$.structures.landAreas", errors)
      .map((item, index) => validatePolygon(item, `$.structures.landAreas[${index}]`, errors, ids));
    const buoys = (
      structures.buoys === undefined
        ? []
        : requireArray(structures.buoys, "$.structures.buoys", errors)
    ).map((item, index) => validateBuoy(
      item,
      `$.structures.buoys[${index}]`,
      errors,
      ids
    ));
    const structureCount = (
      pontoons.length
      + catways.length
      + obstacles.length
      + landAreas.length
      + buoys.length
    );
    if (structureCount > MAX_STRUCTURES) {
      addError(errors, "$.structures", `maximum ${MAX_STRUCTURES} structures`, "limit");
    }
    const parentById = new Map([...pontoons, ...catways, ...buoys].map(item => [item.id, item]));
    const pontoonById = new Map(pontoons.map(item => [item.id, item]));
    catways.forEach((catway, index) => validateCatwayAttachment(catway, index, pontoons, errors));

    const cleats = requireArray(structures.cleats, "$.structures.cleats", errors).map((item, index) => {
      const path = `$.structures.cleats[${index}]`;
      const object = requireObject(item, path, errors);
      const id = validateId(object.id, `${path}.id`, errors, ids);
      const parentId = requireString(object.parentId, `${path}.parentId`, errors, { max: 160 });
      const parent = parentById.get(parentId);
      if (!parent) addError(errors, `${path}.parentId`, "structure parente absente", "reference");
      const local = requireObject(object.localPosition, `${path}.localPosition`, errors);
      const localPosition = {
        longitudinal: requireNumber(local.longitudinal, `${path}.localPosition.longitudinal`, errors, {
          minimum: -MAX_EXTENT_METERS,
          maximum: MAX_EXTENT_METERS
        }),
        transverse: requireNumber(local.transverse, `${path}.localPosition.transverse`, errors, {
          minimum: -1000,
          maximum: 1000
        })
      };
      const outsideParent = parent?.type === "buoy"
        ? (
          Math.abs(localPosition.longitudinal) > parent.radius + 0.15
          || Math.abs(localPosition.transverse) > parent.radius + 0.15
        )
        : parent && (
          Math.abs(localPosition.longitudinal) > parent.length / 2 + 0.15
          || Math.abs(localPosition.transverse) > parent.width / 2 + 0.15
        );
      if (outsideParent) {
        addError(errors, `${path}.localPosition`, "taquet hors de sa structure parente", "geometry");
      }
      const z = requireNumber(object.z, `${path}.z`, errors, { minimum: -10, maximum: 100 });
      if (parent?.type === "buoy" && Math.abs(z - parent.height) > 0.2) {
        addError(errors, `${path}.z`, "le taquet doit être placé au sommet de la bouée", "geometry");
      }
      const orientation = requireNumber(object.orientation, `${path}.orientation`, errors, {
        minimum: -Math.PI * 8,
        maximum: Math.PI * 8
      });
      return { ...object, id, parentId, localPosition, z, orientation };
    });
    if (cleats.length > MAX_CLEATS) {
      addError(errors, "$.structures.cleats", `maximum ${MAX_CLEATS} taquets`, "limit");
    }
    buoys.forEach((buoy, index) => {
      const buoyCleats = cleats.filter(cleat => cleat.parentId === buoy.id);
      if (buoy.seamarkType === "mooring" && buoyCleats.length !== 1) {
        addError(
          errors,
          `$.structures.buoys[${index}]`,
          "une bouée corps mort doit posséder exactement un taquet",
          "reference"
        );
      }
      if (buoy.seamarkType !== "mooring" && buoyCleats.length) {
        addError(
          errors,
          `$.structures.buoys[${index}]`,
          "seule une bouée corps mort peut porter un taquet",
          "reference"
        );
      }
    });

    const berths = requireArray(document.berths, "$.berths", errors).map((item, index) => {
      const path = `$.berths[${index}]`;
      const object = requireObject(item, path, errors);
      const id = validateId(object.id, `${path}.id`, errors, ids);
      const parentId = requireString(object.parentId, `${path}.parentId`, errors, { max: 160 });
      if (!parentById.has(parentId)) addError(errors, `${path}.parentId`, "structure parente absente", "reference");
      if (!["port", "starboard", "end"].includes(object.side)) {
        addError(errors, `${path}.side`, "côté invalide", "enum");
      }
      const center = validatePoint(object.center, `${path}.center`, errors);
      const heading = requireNumber(object.heading, `${path}.heading`, errors, {
        minimum: -Math.PI * 8,
        maximum: Math.PI * 8
      });
      const length = requireNumber(object.length, `${path}.length`, errors, { minimum: 1, maximum: 500 });
      const width = requireNumber(object.width, `${path}.width`, errors, { minimum: 0.5, maximum: 100 });
      const maxLength = requireNumber(object.maxLength ?? length, `${path}.maxLength`, errors, {
        minimum: 1,
        maximum: 500
      });
      const maxBeam = requireNumber(object.maxBeam ?? width, `${path}.maxBeam`, errors, {
        minimum: 0.5,
        maximum: 100
      });
      return {
        ...object,
        id,
        parentId,
        center,
        heading,
        length,
        width,
        maxLength,
        maxBeam,
        isVisitor: Boolean(object.isVisitor)
      };
    });
    const berthIds = new Set(berths.map(berth => berth.id));

    const staticBoats = requireArray(document.staticBoats, "$.staticBoats", errors).map((item, index) => {
      const path = `$.staticBoats[${index}]`;
      const object = requireObject(item, path, errors);
      const id = validateId(object.id, `${path}.id`, errors, ids);
      const berthId = requireString(object.berthId, `${path}.berthId`, errors, {
        required: false,
        max: 160
      });
      if (berthId && !berthIds.has(berthId)) addError(errors, `${path}.berthId`, "place absente", "reference");
      const center = validatePoint(object.center, `${path}.center`, errors);
      const heading = requireNumber(object.heading, `${path}.heading`, errors, {
        minimum: -Math.PI * 8,
        maximum: Math.PI * 8
      });
      const length = requireNumber(object.length, `${path}.length`, errors, { minimum: 1, maximum: 500 });
      const beam = requireNumber(object.beam, `${path}.beam`, errors, { minimum: 0.4, maximum: 100 });
      const vesselType = object.vesselType === undefined ? "sailboat" : object.vesselType;
      if (!["sailboat", "motorboat"].includes(vesselType)) {
        addError(errors, `${path}.vesselType`, "sailboat ou motorboat attendu", "enum");
      }
      return { ...object, id, berthId, center, heading, length, beam, vesselType };
    });
    if (staticBoats.length > MAX_BOATS) {
      addError(errors, "$.staticBoats", `maximum ${MAX_BOATS} bateaux`, "limit");
    }

    const navigation = requireObject(document.navigation, "$.navigation", errors);
    const entries = requireArray(navigation.entries, "$.navigation.entries", errors).map((item, index) => {
      const path = `$.navigation.entries[${index}]`;
      const object = requireObject(item, path, errors);
      const id = validateId(object.id, `${path}.id`, errors, ids);
      const name = requireString(object.name, `${path}.name`, errors, { required: false, max: 240 });
      const position = validatePoint(object.position, `${path}.position`, errors);
      const heading = requireNumber(object.heading, `${path}.heading`, errors, {
        minimum: -Math.PI * 8,
        maximum: Math.PI * 8
      });
      return { ...object, id, name, position, heading };
    });
    if (entries.length !== 1) {
      addError(errors, "$.navigation.entries", "un point d’entrée unique est obligatoire", "cardinality");
    }

    const bounds = requireObject(document.bounds, "$.bounds", errors);
    for (const key of ["minEast", "minNorth", "maxEast", "maxNorth"]) {
      requireNumber(bounds[key], `$.bounds.${key}`, errors, {
        minimum: -MAX_EXTENT_METERS,
        maximum: MAX_EXTENT_METERS
      });
    }
    if (finite(bounds.minEast) && finite(bounds.maxEast) && bounds.minEast > bounds.maxEast) {
      addError(errors, "$.bounds", "bornes est inversées", "geometry");
    }
    if (finite(bounds.minNorth) && finite(bounds.maxNorth) && bounds.minNorth > bounds.maxNorth) {
      addError(errors, "$.bounds", "bornes nord inversées", "geometry");
    }

    const editor = requireObject(document.editor, "$.editor", errors);
    requireNumber(editor.occupancySeed, "$.editor.occupancySeed", errors, {
      minimum: 0,
      maximum: 4294967295
    });
    requireNumber(editor.occupancyRate, "$.editor.occupancyRate", errors, {
      minimum: 0,
      maximum: 1
    });
    if (editor.defaultBerthWidth !== undefined) {
      requireNumber(editor.defaultBerthWidth, "$.editor.defaultBerthWidth", errors, {
        minimum: 2.8,
        maximum: 20
      });
    }
    const groups = requireArray(editor.catwayGroups, "$.editor.catwayGroups", errors);
    groups.forEach((group, index) => {
      const path = `$.editor.catwayGroups[${index}]`;
      const object = requireObject(group, path, errors);
      validateId(object.id, `${path}.id`, errors, ids);
      if (!pontoonById.has(object.parentId)) {
        addError(errors, `${path}.parentId`, "ponton parent absent", "reference");
      }
      requireArray(object.memberIds, `${path}.memberIds`, errors).forEach((id, memberIndex) => {
        if (!catways.some(catway => catway.id === id)) {
          addError(errors, `${path}.memberIds[${memberIndex}]`, "catway absent", "reference");
        }
      });
    });

    if (errors.length) throw new KJPValidationError(errors);

    const normalized = clone(document);
    normalized.format = FORMAT;
    normalized.schemaVersion = SCHEMA_VERSION;
    normalized.structures.pontoons = clone(pontoons);
    normalized.structures.catways = clone(catways);
    normalized.structures.obstacles = clone(obstacles);
    normalized.structures.landAreas = clone(landAreas);
    normalized.structures.buoys = clone(buoys);
    normalized.structures.cleats = clone(cleats);
    normalized.editor.defaultBerthWidth = finite(editor.defaultBerthWidth)
      ? editor.defaultBerthWidth
      : 4;
    normalized.bounds = geometryBounds(normalized);
    return options.freeze === false ? normalized : freezeDeep(normalized);
  }

  function parse(text, options = {}) {
    if (typeof text !== "string") {
      throw new KJPValidationError([{ path: "$", message: "texte UTF-8 attendu", code: "type" }]);
    }
    const bytes = textBytes(text);
    if (bytes > MAX_FILE_BYTES) {
      throw new KJPValidationError([{
        path: "$",
        message: `fichier supérieur à ${MAX_FILE_BYTES} octets`,
        code: "limit"
      }]);
    }
    let document;
    try {
      document = JSON.parse(text);
    } catch (error) {
      throw new KJPValidationError([{
        path: "$",
        message: `JSON illisible (${error.message})`,
        code: "json"
      }]);
    }
    return normalizeDocument(document, options);
  }

  function serialize(document, options = {}) {
    const normalized = normalizeDocument(document, { freeze: false });
    const text = stableStringify(normalized, options.compact ? 0 : 2);
    if (textBytes(text) > MAX_FILE_BYTES) {
      throw new KJPValidationError([{ path: "$", message: "fichier exporté trop volumineux", code: "limit" }]);
    }
    return text;
  }

  function createEmpty({
    name = "Nouveau port",
    latitude = 47.586,
    longitude = -3.03,
    generatorVersion = "1.0.0",
    id
  } = {}) {
    const now = new Date().toISOString();
    const stableId = id || `port-${Math.abs(hashString(`${name}:${latitude}:${longitude}`)).toString(36)}`;
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      generatorVersion,
      metadata: {
        id: stableId,
        revision: 1,
        name,
        author: "",
        source: "OpenStreetMap",
        coordinates: { latitude, longitude },
        harborMasterUrl: "",
        openingHours: "",
        currentAdvice: "",
        comment: "",
        createdAt: now,
        updatedAt: now
      },
      georeference: {
        coordinateSystem: "local-ENU",
        origin: { latitude, longitude },
        distanceUnit: "m",
        angleUnit: "rad"
      },
      sources: [],
      bounds: { minEast: 0, minNorth: 0, maxEast: 0, maxNorth: 0 },
      structures: {
        pontoons: [],
        catways: [],
        cleats: [],
        obstacles: [],
        landAreas: [],
        buoys: []
      },
      berths: [],
      staticBoats: [],
      navigation: { entries: [] },
      editor: {
        catwayGroups: [],
        occupancyRate: 0.62,
        occupancySeed: 20260730,
        defaultBerthWidth: 4,
        analyzedZones: []
      }
    };
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createLocalProjection(latitude, longitude) {
    const phi0 = latitude * Math.PI / 180;
    const lambda0 = longitude * Math.PI / 180;
    const sinPhi0 = Math.sin(phi0);
    const cosPhi0 = Math.cos(phi0);
    return Object.freeze({
      origin: { latitude, longitude },
      forward(nextLatitude, nextLongitude) {
        const phi = nextLatitude * Math.PI / 180;
        const deltaLambda = nextLongitude * Math.PI / 180 - lambda0;
        const cosC = Math.max(-1, Math.min(1,
          sinPhi0 * Math.sin(phi) + cosPhi0 * Math.cos(phi) * Math.cos(deltaLambda)
        ));
        const c = Math.acos(cosC);
        const k = Math.abs(c) < 1e-12 ? 1 : c / Math.sin(c);
        return {
          east: EARTH_RADIUS * k * Math.cos(phi) * Math.sin(deltaLambda),
          north: EARTH_RADIUS * k * (
            cosPhi0 * Math.sin(phi) - sinPhi0 * Math.cos(phi) * Math.cos(deltaLambda)
          )
        };
      },
      inverse(east, north) {
        const rho = Math.hypot(east, north);
        if (rho < 1e-12) return { latitude, longitude };
        const c = rho / EARTH_RADIUS;
        const sinC = Math.sin(c);
        const cosC = Math.cos(c);
        const phi = Math.asin(
          cosC * sinPhi0 + north * sinC * cosPhi0 / rho
        );
        const lambda = lambda0 + Math.atan2(
          east * sinC,
          rho * cosPhi0 * cosC - north * sinPhi0 * sinC
        );
        return {
          latitude: phi * 180 / Math.PI,
          longitude: lambda * 180 / Math.PI
        };
      }
    });
  }

  function toRuntimeTopology(document) {
    const kjp = normalizeDocument(document, { freeze: false });
    const parents = new Map(
      [
        ...kjp.structures.pontoons,
        ...kjp.structures.catways,
        ...kjp.structures.buoys
      ].map(item => [item.id, item])
    );
    const toSceneRectangle = rectangle => ({
      id: rectangle.id,
      x: rectangle.center.east,
      y: rectangle.center.north,
      w: rectangle.length,
      h: rectangle.width,
      heading: rectangle.heading,
      z: (rectangle.vertical.baseZ + rectangle.vertical.topZ) / 2,
      height: rectangle.vertical.topZ - rectangle.vertical.baseZ,
      baseZ: rectangle.vertical.baseZ,
      topZ: rectangle.vertical.topZ,
      deckZ: rectangle.vertical.deckZ,
      parentId: rectangle.attachment?.parentId || rectangle.parentId || null,
      attachment: rectangle.attachment ? clone(rectangle.attachment) : null,
      hiddenFaces: rectangle.attachment ? ["x0"] : [],
      kind: rectangle.type === "catway" ? "catway" : "ponton",
      collision: rectangle.collision !== false
    });
    const cleats = kjp.structures.cleats.map(cleat => {
      const parent = parents.get(cleat.parentId);
      const buoyParent = parent.type === "buoy";
      const point = buoyParent
        ? {
          east: parent.position.east + cleat.localPosition.longitudinal,
          north: parent.position.north + cleat.localPosition.transverse
        }
        : localToWorld(parent, cleat.localPosition);
      return {
        id: cleat.id,
        parentId: cleat.parentId,
        kind: buoyParent ? "buoy" : parent.type === "catway" ? "catway" : "ponton",
        x: point.east,
        y: point.north,
        z: cleat.z,
        orientation: (buoyParent ? 0 : parent.heading) + cleat.orientation
      };
    });
    const entry = kjp.navigation.entries[0];
    const visitorBerths = kjp.berths.filter(berth => berth.isVisitor).map(berth => ({
      id: berth.id,
      name: berth.name || berth.id,
      x: berth.center.east,
      y: berth.center.north,
      heading: berth.heading,
      length: berth.length,
      width: berth.width,
      maxLength: berth.maxLength,
      maxBeam: berth.maxBeam
    }));
    const scenario = {
      initial: {
        x: entry.position.east,
        y: entry.position.north,
        heading: entry.heading,
        u: 0,
        v: 0,
        r: 0
      },
      environment: {
        windSpeedKn: 0,
        windFromDeg: 0,
        currentSpeedKn: 0,
        currentFromDeg: 0
      },
      kicker: "Port communautaire",
      title: kjp.metadata.name,
      copy: "Navigation libre depuis le point d’entrée défini par l’auteur.",
      objective: visitorBerths.length
        ? "Explorez le port ou surlignez une place visiteurs."
        : "Explorez librement le port.",
      goal: null
    };
    const flowBounds = geometryBounds(kjp);
    return {
      sourceFormat: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      id: kjp.metadata.id,
      name: kjp.metadata.name,
      units: { distance: "m", speed: "m/s", angle: "rad" },
      coordinateSystem: { x: "east", y: "north", heading: "rad-counterclockwise-from-east" },
      referenceBoat: { length: 10.94, beam: 3.59 },
      bounds: {
        minX: flowBounds.minEast,
        minY: flowBounds.minNorth,
        maxX: flowBounds.maxEast,
        maxY: flowBounds.maxNorth
      },
      layout: {
        berthFenderGap: 0.35,
        catwayPitch: 0,
        catwayWidth: 0,
        minimumBetweenBoats: 0,
        catwayRows: [],
        berthRows: []
      },
      structures: {
        docks: kjp.structures.pontoons.map(toSceneRectangle),
        catways: kjp.structures.catways.map(toSceneRectangle),
        mooringCleats: cleats,
        linearObstacles: clone(kjp.structures.obstacles),
        landAreas: clone(kjp.structures.landAreas),
        buoys: kjp.structures.buoys.map(buoy => ({
          id: buoy.id,
          x: buoy.position.east,
          y: buoy.position.north,
          radius: buoy.radius,
          height: buoy.height,
          seamarkType: buoy.seamarkType,
          category: buoy.category,
          shape: buoy.shape,
          colours: clone(buoy.colours),
          name: buoy.name,
          collision: buoy.collision !== false
        }))
      },
      berthLanes: {},
      berths: clone(kjp.berths),
      staticBoats: kjp.staticBoats.map(boat => ({
        id: boat.id,
        x: boat.center.east,
        y: boat.center.north,
        heading: boat.heading,
        length: boat.length,
        beam: boat.beam,
        berthId: boat.berthId,
        vesselType: boat.vesselType || "sailboat"
      })),
      navigation: {
        fairways: [],
        trainingBerths: [],
        visitorBerths,
        exitLanes: [],
        entries: clone(kjp.navigation.entries)
      },
      terrain: {
        // Les zones terrestres KJP sont déjà rendues via structures.landAreas.
        // Ne pas les dupliquer ici évite deux surfaces quasi coplanaires.
        polygons: []
      },
      lights: { posts: [], entrance: null },
      flowField: {
        minX: flowBounds.minEast - 30,
        minY: flowBounds.minNorth - 30,
        width: Math.max(100, flowBounds.maxEast - flowBounds.minEast + 60),
        height: Math.max(100, flowBounds.maxNorth - flowBounds.minNorth + 60)
      },
      scenarios: { community: scenario, free: scenario },
      metadata: clone(kjp.metadata),
      georeference: clone(kjp.georeference)
    };
  }

  function legacyTopologyToRuntime(topology) {
    if (!isObject(topology) || topology.schemaVersion !== 2) {
      throw new KJPValidationError([{ path: "$.schemaVersion", message: "topologie historique v2 attendue", code: "version" }]);
    }
    return clone({
      ...topology,
      sourceFormat: "PORT_TOPOLOGY",
      structures: {
        ...topology.structures,
        linearObstacles: topology.structures?.linearObstacles || [],
        landAreas: topology.structures?.landAreas || [],
        buoys: topology.structures?.buoys || []
      },
      navigation: {
        ...topology.navigation,
        visitorBerths: topology.navigation?.visitorBerths || [],
        entries: topology.navigation?.entries || []
      }
    });
  }

  return Object.freeze({
    FORMAT,
    SCHEMA_VERSION,
    LIMITS: Object.freeze({
      fileBytes: MAX_FILE_BYTES,
      structures: MAX_STRUCTURES,
      cleats: MAX_CLEATS,
      boats: MAX_BOATS,
      extentMeters: MAX_EXTENT_METERS
    }),
    BUOY_TYPES,
    BUOY_SHAPES,
    BUOY_APPEARANCES,
    recommendedBuoyAppearance,
    KJPValidationError,
    normalizeDocument,
    parse,
    serialize,
    canonicalize,
    stableStringify,
    createEmpty,
    createLocalProjection,
    geometryBounds,
    localToWorld,
    worldToLocal,
    hashString,
    toRuntimeTopology,
    legacyTopologyToRuntime
  });
});
