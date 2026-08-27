"use strict";

(function universalModule(root, factory) {
  const codec = typeof module === "object" && module.exports
    ? require("./kjp-codec.js")
    : root.KJPCodec;
  const api = factory(codec);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OSMPortImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createOSMImport(KJPCodec) {
  const MAX_ANALYSIS_SIDE_METERS = 2000;
  const METERS_PER_DEGREE = 111320;
  const DEFAULT_OVERPASS_ENDPOINTS = Object.freeze([
    Object.freeze({
      id: "fossgis",
      label: "Overpass FOSSGIS",
      url: "https://overpass-api.de/api/interpreter"
    }),
    Object.freeze({
      id: "vk-maps",
      label: "Overpass VK Maps",
      url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    }),
    Object.freeze({
      id: "private-coffee",
      label: "Overpass Private.coffee",
      url: "https://overpass.private.coffee/api/interpreter"
    }),
    // Les deux hôtes suivants sont les nœuds officiels derrière overpass-api.de.
    // Ils ne sont essayés qu'en dernier recours pour contourner une panne DNS
    // ou la défaillance ponctuelle d'un des nœuds du répartiteur FOSSGIS.
    Object.freeze({
      id: "fossgis-gall",
      label: "Overpass FOSSGIS · Gall",
      url: "https://gall.openstreetmap.de/api/interpreter",
      fallbackOnly: true
    }),
    Object.freeze({
      id: "fossgis-lambert",
      label: "Overpass FOSSGIS · Lambert",
      url: "https://lambert.openstreetmap.de/api/interpreter",
      fallbackOnly: true
    })
  ]);
  const DEFAULT_OVERPASS_MAX_ROUNDS = 5;
  const DEFAULT_OVERPASS_TOTAL_TIMEOUT_MS = 180000;
  const NON_RETRYABLE_OVERPASS_STATUS = new Set([400, 413, 414, 422]);
  const NAVIGATION_BUOY_TYPES = new Set([
    "buoy_cardinal",
    "buoy_installation",
    "buoy_isolated_danger",
    "buoy_lateral",
    "buoy_safe_water",
    "buoy_special_purpose"
  ]);

  function isBuoySeamark(tags = {}) {
    const seamarkType = tags["seamark:type"];
    return NAVIGATION_BUOY_TYPES.has(seamarkType)
      || (
        seamarkType === "mooring"
        && tags["seamark:mooring:category"] === "buoy"
      );
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function elementKey(element) {
    return `${element.type || "way"}/${element.id}`;
  }

  function mergeOverpassResponses(responses) {
    const merged = new Map();
    for (const response of responses || []) {
      for (const element of response?.elements || []) {
        const key = elementKey(element);
        const previous = merged.get(key);
        if (!previous) {
          merged.set(key, clone(element));
          continue;
        }
        const previousGeometry = previous.geometry?.length || 0;
        const nextGeometry = element.geometry?.length || 0;
        if (nextGeometry > previousGeometry) {
          merged.set(key, { ...clone(previous), ...clone(element) });
        } else {
          previous.tags = { ...(previous.tags || {}), ...(element.tags || {}) };
        }
      }
    }
    return {
      version: 0.6,
      generator: "KJP merge",
      elements: [...merged.values()].sort((first, second) => (
        elementKey(first).localeCompare(elementKey(second))
      ))
    };
  }

  function validateAnalysisBounds(bounds) {
    const { south, west, north, east } = bounds || {};
    if (![south, west, north, east].every(Number.isFinite)) {
      throw new Error("Emprise géographique incomplète.");
    }
    if (south >= north || west >= east) throw new Error("Emprise géographique inversée.");
    const midLatitude = (south + north) / 2 * Math.PI / 180;
    const width = (east - west) * METERS_PER_DEGREE * Math.cos(midLatitude);
    const height = (north - south) * METERS_PER_DEGREE;
    if (width > MAX_ANALYSIS_SIDE_METERS + 1 || height > MAX_ANALYSIS_SIDE_METERS + 1) {
      throw new Error("L’analyse est limitée à une zone de 2 × 2 km.");
    }
    return { width, height };
  }

  function normalizeAnalysisPolygon(polygon) {
    if (polygon === undefined || polygon === null) return null;
    if (!Array.isArray(polygon) || polygon.length < 3) {
      throw new Error("Le polygone d’analyse doit comporter au moins trois sommets.");
    }
    const normalized = polygon.map((point, index) => {
      const latitude = Number(point?.latitude);
      const longitude = Number(point?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(`Sommet ${index + 1} du polygone invalide.`);
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new Error(`Sommet ${index + 1} du polygone hors du globe.`);
      }
      return { latitude, longitude };
    });
    if (
      normalized.length > 3
      && normalized[0].latitude === normalized.at(-1).latitude
      && normalized[0].longitude === normalized.at(-1).longitude
    ) normalized.pop();
    if (normalized.length < 3) {
      throw new Error("Le polygone d’analyse doit comporter trois sommets distincts.");
    }
    return normalized;
  }

  function boundsForAnalysisPolygon(polygon) {
    const normalized = normalizeAnalysisPolygon(polygon);
    const bounds = {
      south: Math.min(...normalized.map(point => point.latitude)),
      west: Math.min(...normalized.map(point => point.longitude)),
      north: Math.max(...normalized.map(point => point.latitude)),
      east: Math.max(...normalized.map(point => point.longitude))
    };
    validateAnalysisBounds(bounds);
    return bounds;
  }

  function buildOverpassQuery(bounds, options = {}) {
    validateAnalysisBounds(bounds);
    const bbox = [bounds.south, bounds.west, bounds.north, bounds.east]
      .map(value => Number(value).toFixed(7))
      .join(",");
    const polygon = normalizeAnalysisPolygon(options.polygon);
    if (polygon) {
      const polygonBounds = boundsForAnalysisPolygon(polygon);
      const tolerance = 1e-7;
      if (
        polygonBounds.south < bounds.south - tolerance
        || polygonBounds.west < bounds.west - tolerance
        || polygonBounds.north > bounds.north + tolerance
        || polygonBounds.east > bounds.east + tolerance
      ) {
        throw new Error("Le polygone doit être contenu dans l’emprise analysée.");
      }
    }
    const scope = polygon
      ? `(poly:"${polygon.map(point => (
        `${point.latitude.toFixed(7)} ${point.longitude.toFixed(7)}`
      )).join(" ")}")`
      : `(${bbox})`;
    return `[out:json][timeout:30];
(
  way["man_made"="pier"]${scope};
  way["man_made"~"^(breakwater|groyne|quay)$"]${scope};
  way["natural"="coastline"]${scope};
  way["natural"~"^(land|beach|cliff)$"]${scope};
  way["landuse"]${scope};
  relation["natural"="coastline"]${scope};
  relation["natural"="land"]${scope};
  node["seamark:type"~"^buoy_(cardinal|installation|isolated_danger|lateral|safe_water|special_purpose)$"]${scope};
  node["seamark:type"="mooring"]["seamark:mooring:category"="buoy"]${scope};
);
out tags geom;`;
  }

  function describeOverpassFailure(error) {
    if (error?.name === "AbortError") return "délai dépassé";
    if (error instanceof TypeError) return "réseau ou politique CORS";
    return String(error?.message || "erreur réseau").replace(/\s+/g, " ").slice(0, 120);
  }

  function retryAfterMilliseconds(response) {
    const value = response?.headers?.get?.("Retry-After");
    if (value === undefined || value === null || value === "") {
      return Number(response?.status) === 429 ? 30000 : 0;
    }
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
  }

  function prioritizeOverpassEndpoints(endpoints, preferredEndpointId) {
    const preferred = endpoints.find(endpoint => endpoint.id === preferredEndpointId);
    if (!preferred || preferred.fallbackOnly) return endpoints.slice();
    return [preferred, ...endpoints.filter(endpoint => endpoint !== preferred)];
  }

  function summarizeOverpassAttempts(attempts) {
    const byEndpoint = new Map();
    for (const attempt of attempts) {
      const previous = byEndpoint.get(attempt.endpoint);
      byEndpoint.set(attempt.endpoint, {
        label: attempt.label,
        reason: attempt.reason,
        count: (previous?.count || 0) + 1
      });
    }
    return [...byEndpoint.values()]
      .map(item => `${item.label}${item.count > 1 ? ` ×${item.count}` : ""}: ${item.reason}`)
      .join(" ; ");
  }

  async function requestOverpass(query, options = {}) {
    if (typeof query !== "string" || !query.trim()) throw new Error("Requête Overpass vide.");
    const fetchImpl = options.fetchImpl || (
      typeof fetch === "function" ? fetch.bind(globalThis) : null
    );
    if (typeof fetchImpl !== "function") throw new Error("Client réseau indisponible.");
    const configuredEndpoints = options.endpoints?.length
      ? options.endpoints
      : DEFAULT_OVERPASS_ENDPOINTS;
    const endpoints = prioritizeOverpassEndpoints(
      configuredEndpoints,
      options.preferredEndpointId
    );
    const requestedTimeoutMs = Number(options.timeoutMs ?? 32000);
    const timeoutMs = Number.isFinite(requestedTimeoutMs)
      ? Math.max(1000, requestedTimeoutMs)
      : 32000;
    const requestedMaxRounds = Number(options.maxRounds ?? DEFAULT_OVERPASS_MAX_ROUNDS);
    const maxRounds = Math.min(
      DEFAULT_OVERPASS_MAX_ROUNDS,
      Math.max(
        1,
        Math.floor(Number.isFinite(requestedMaxRounds)
          ? requestedMaxRounds
          : DEFAULT_OVERPASS_MAX_ROUNDS)
      )
    );
    const requestedTotalTimeoutMs = Number(
      options.totalTimeoutMs ?? DEFAULT_OVERPASS_TOTAL_TIMEOUT_MS
    );
    const totalTimeoutMs = Number.isFinite(requestedTotalTimeoutMs)
      ? Math.max(timeoutMs, requestedTotalTimeoutMs)
      : DEFAULT_OVERPASS_TOTAL_TIMEOUT_MS;
    const requestedRetryDelayMs = Number(options.retryBaseDelayMs ?? 1000);
    const retryBaseDelayMs = Number.isFinite(requestedRetryDelayMs)
      ? Math.max(0, requestedRetryDelayMs)
      : 1000;
    const sleepImpl = typeof options.sleepImpl === "function"
      ? options.sleepImpl
      : delay => new Promise(resolve => setTimeout(resolve, delay));
    const attempts = [];
    const body = `data=${encodeURIComponent(query)}`;
    const startedAt = Date.now();
    let completedRounds = 0;
    let totalDeadlineReached = false;

    requestLoop:
    for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
      completedRounds = roundIndex + 1;
      let roundRetryAfterMs = 0;
      for (let index = 0; index < endpoints.length; index += 1) {
        const elapsedMs = Date.now() - startedAt;
        const remainingMs = totalTimeoutMs - elapsedMs;
        if (remainingMs < 1000) {
          totalDeadlineReached = true;
          break requestLoop;
        }
        const endpoint = endpoints[index];
        const attemptNumber = attempts.length + 1;
        options.onAttempt?.({
          endpoint,
          index,
          total: endpoints.length,
          round: roundIndex + 1,
          maxRounds,
          attemptNumber
        });
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const attemptTimeoutMs = Math.min(timeoutMs, remainingMs);
        const timeout = controller
          ? setTimeout(() => controller.abort(), attemptTimeoutMs)
          : null;
        try {
          // Type formulaire officiellement supporté et « CORS-safelisted » : aucune
          // pré-requête n'est nécessaire, y compris depuis un fichier HTML local.
          const response = await fetchImpl(endpoint.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            },
            body,
            ...(controller ? { signal: controller.signal } : {})
          });
          if (!response?.ok) {
            const status = Number(response?.status) || 0;
            attempts.push({
              endpoint: endpoint.id,
              label: endpoint.label,
              round: roundIndex + 1,
              status,
              reason: status ? `HTTP ${status}` : "réponse invalide"
            });
            if (NON_RETRYABLE_OVERPASS_STATUS.has(status)) break requestLoop;
            roundRetryAfterMs = Math.max(
              roundRetryAfterMs,
              retryAfterMilliseconds(response)
            );
            continue;
          }
          const data = await response.json();
          if (!data || !Array.isArray(data.elements)) {
            attempts.push({
              endpoint: endpoint.id,
              label: endpoint.label,
              round: roundIndex + 1,
              status: response.status,
              reason: "JSON Overpass invalide"
            });
            continue;
          }
          return {
            data,
            endpoint: { ...endpoint },
            attempts: clone(attempts),
            round: roundIndex + 1,
            maxRounds
          };
        } catch (error) {
          attempts.push({
            endpoint: endpoint.id,
            label: endpoint.label,
            round: roundIndex + 1,
            status: 0,
            reason: describeOverpassFailure(error)
          });
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }

      if (roundIndex + 1 >= maxRounds) break;
      const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
      if (remainingMs < 1000) {
        totalDeadlineReached = true;
        break;
      }
      const exponentialDelayMs = retryBaseDelayMs * (2 ** roundIndex);
      const delayMs = Math.min(
        Math.max(exponentialDelayMs, roundRetryAfterMs),
        60000,
        Math.max(0, remainingMs - 500)
      );
      options.onRetry?.({
        round: roundIndex + 1,
        nextRound: roundIndex + 2,
        maxRounds,
        delayMs,
        attempts: clone(attempts)
      });
      if (delayMs > 0) await sleepImpl(delayMs);
    }

    const summary = summarizeOverpassAttempts(attempts);
    const error = new Error(
      `Aucun serveur Overpass disponible après ${completedRounds} tentative(s) automatique(s)`
      + `${totalDeadlineReached ? " dans la limite de trois minutes" : ""}`
      + `${summary ? ` · ${summary}` : ""}`
    );
    error.name = "OverpassAvailabilityError";
    error.attempts = clone(attempts);
    error.rounds = completedRounds;
    error.maxRounds = maxRounds;
    error.totalDeadlineReached = totalDeadlineReached;
    throw error;
  }

  function geometryForElement(element) {
    if (Array.isArray(element.geometry)) {
      return element.geometry
        .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
        .map(point => ({ latitude: point.lat, longitude: point.lon }));
    }
    if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
      return [{ latitude: element.lat, longitude: element.lon }];
    }
    return [];
  }

  function polylineLength(points) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
      length += Math.hypot(
        points[index].east - points[index - 1].east,
        points[index].north - points[index - 1].north
      );
    }
    return length;
  }

  function lineHeading(points) {
    if (points.length < 2) return 0;
    const first = points[0];
    const last = points[points.length - 1];
    return Math.atan2(last.north - first.north, last.east - first.east);
  }

  function lineCenter(points) {
    if (!points.length) return { east: 0, north: 0 };
    if (points.length === 1) return { ...points[0] };
    const total = polylineLength(points);
    if (total < 1e-9) return { ...points[0] };
    let remaining = total / 2;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const length = Math.hypot(end.east - start.east, end.north - start.north);
      if (remaining <= length) {
        const ratio = length ? remaining / length : 0;
        return {
          east: start.east + (end.east - start.east) * ratio,
          north: start.north + (end.north - start.north) * ratio
        };
      }
      remaining -= length;
    }
    return { ...points[points.length - 1] };
  }

  function closedGeometry(points, tolerance = 1.5) {
    return (
      points.length >= 4
      && Math.hypot(
        points[0].east - points.at(-1).east,
        points[0].north - points.at(-1).north
      ) <= tolerance
    );
  }

  function polygonArea(points) {
    const clean = closedGeometry(points) ? points.slice(0, -1) : points;
    let twiceArea = 0;
    for (let index = 0; index < clean.length; index += 1) {
      const next = clean[(index + 1) % clean.length];
      twiceArea += clean[index].east * next.north - next.east * clean[index].north;
    }
    return Math.abs(twiceArea) / 2;
  }

  function orientedRectangle(points) {
    const clean = closedGeometry(points) ? points.slice(0, -1) : points;
    const centroid = {
      east: clean.reduce((sum, point) => sum + point.east, 0) / clean.length,
      north: clean.reduce((sum, point) => sum + point.north, 0) / clean.length
    };
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (const point of clean) {
      const east = point.east - centroid.east;
      const north = point.north - centroid.north;
      xx += east * east;
      xy += east * north;
      yy += north * north;
    }
    const heading = 0.5 * Math.atan2(2 * xy, xx - yy);
    const axis = { east: Math.cos(heading), north: Math.sin(heading) };
    const transverse = { east: -axis.north, north: axis.east };
    const longitudinalValues = clean.map(point => (
      (point.east - centroid.east) * axis.east
      + (point.north - centroid.north) * axis.north
    ));
    const transverseValues = clean.map(point => (
      (point.east - centroid.east) * transverse.east
      + (point.north - centroid.north) * transverse.north
    ));
    const minimumLongitudinal = Math.min(...longitudinalValues);
    const maximumLongitudinal = Math.max(...longitudinalValues);
    const minimumTransverse = Math.min(...transverseValues);
    const maximumTransverse = Math.max(...transverseValues);
    const centerLongitudinal = (minimumLongitudinal + maximumLongitudinal) / 2;
    const centerTransverse = (minimumTransverse + maximumTransverse) / 2;
    const length = maximumLongitudinal - minimumLongitudinal;
    const width = maximumTransverse - minimumTransverse;
    return {
      center: {
        east: centroid.east + axis.east * centerLongitudinal + transverse.east * centerTransverse,
        north: centroid.north + axis.north * centerLongitudinal + transverse.north * centerTransverse
      },
      length,
      width,
      heading,
      fillRatio: length * width > 1e-9 ? polygonArea(clean) / (length * width) : 0
    };
  }

  function endpointKey(point, tolerance = 1.5) {
    return `${Math.round(point.east / tolerance)}:${Math.round(point.north / tolerance)}`;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let first = 0, second = polygon.length - 1; first < polygon.length; second = first++) {
      const a = polygon[first];
      const b = polygon[second];
      const intersects = (
        (a.north > point.north) !== (b.north > point.north)
        && point.east < (
          (b.east - a.east) * (point.north - a.north)
          / ((b.north - a.north) || Number.EPSILON)
          + a.east
        )
      );
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function orientation(first, second, third) {
    return (
      (second.east - first.east) * (third.north - first.north)
      - (second.north - first.north) * (third.east - first.east)
    );
  }

  function segmentsIntersect(a, b, c, d) {
    const first = orientation(a, b, c);
    const second = orientation(a, b, d);
    const third = orientation(c, d, a);
    const fourth = orientation(c, d, b);
    const overlapsBounds = (
      Math.max(Math.min(a.east, b.east), Math.min(c.east, d.east))
        <= Math.min(Math.max(a.east, b.east), Math.max(c.east, d.east)) + 1e-9
      && Math.max(Math.min(a.north, b.north), Math.min(c.north, d.north))
        <= Math.min(Math.max(a.north, b.north), Math.max(c.north, d.north)) + 1e-9
    );
    return (
      overlapsBounds
      &&
      (first === 0 || second === 0 || Math.sign(first) !== Math.sign(second))
      && (third === 0 || fourth === 0 || Math.sign(third) !== Math.sign(fourth))
    );
  }

  function candidateIntersectsPolygon(candidate, polygon) {
    const points = candidate?.points || [];
    if (!points.length || !Array.isArray(polygon) || polygon.length < 3) return false;
    if (points.some(point => pointInPolygon(point, polygon))) return true;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex += 1) {
        if (segmentsIntersect(
          points[pointIndex - 1],
          points[pointIndex],
          polygon[edgeIndex],
          polygon[(edgeIndex + 1) % polygon.length]
        )) return true;
      }
    }
    return false;
  }

  function filterCandidatesByGeographicPolygon(candidates, polygon, georeference) {
    const geographic = normalizeAnalysisPolygon(polygon);
    if (!geographic) return [...(candidates || [])];
    const projection = KJPCodec.createLocalProjection(
      georeference.origin.latitude,
      georeference.origin.longitude
    );
    const localPolygon = geographic.map(point => (
      projection.forward(point.latitude, point.longitude)
    ));
    return (candidates || []).filter(candidate => (
      candidateIntersectsPolygon(candidate, localPolygon)
    ));
  }

  function pierGraph(lines) {
    const endpointOwners = new Map();
    for (const line of lines) {
      for (const endpoint of [line.points[0], line.points[line.points.length - 1]]) {
        const key = endpointKey(endpoint);
        if (!endpointOwners.has(key)) endpointOwners.set(key, []);
        endpointOwners.get(key).push(line.id);
      }
    }
    const connections = new Map(lines.map(line => [line.id, new Set()]));
    for (const owners of endpointOwners.values()) {
      for (const first of owners) {
        for (const second of owners) if (first !== second) connections.get(first).add(second);
      }
    }
    return connections;
  }

  function classifyOverpass(response, georeference) {
    const projection = KJPCodec.createLocalProjection(
      georeference.origin.latitude,
      georeference.origin.longitude
    );
    const raw = [];
    for (const element of response?.elements || []) {
      const geographic = geometryForElement(element);
      const buoySeamark = isBuoySeamark(element.tags);
      if (geographic.length < (buoySeamark ? 1 : 2)) continue;
      const points = geographic.map(point => projection.forward(point.latitude, point.longitude));
      const closed = closedGeometry(points);
      const fittedRectangle = closed ? orientedRectangle(points) : null;
      raw.push({
        id: `osm-${element.type || "way"}-${element.id}`,
        osm: { type: element.type || "way", id: element.id },
        tags: clone(element.tags || {}),
        points,
        length: fittedRectangle?.length ?? polylineLength(points),
        width: fittedRectangle?.width,
        heading: fittedRectangle?.heading ?? lineHeading(points),
        center: fittedRectangle?.center ?? lineCenter(points),
        closed,
        fittedRectangle
      });
    }
    const piers = raw.filter(item => item.tags.man_made === "pier");
    const connections = pierGraph(piers);
    return raw.map(item => {
      const tags = item.tags;
      const sourceLabel = `${item.osm.type}/${item.osm.id}`;
      const seamarkType = tags["seamark:type"];
      if (isBuoySeamark(tags)) {
        const prefix = `seamark:${seamarkType}`;
        const category = tags[`${prefix}:category`] || "";
        const shape = tags[`${prefix}:shape`] || "unknown";
        const colours = String(tags[`${prefix}:colour`] || "")
          .split(";")
          .map(value => value.trim().toLowerCase())
          .filter(Boolean);
        return {
          ...item,
          candidateType: "buoy",
          seamarkType,
          category,
          shape,
          colours,
          name: tags["seamark:name"] || tags.name || "",
          radius: shape === "super-buoy"
            ? 3
            : seamarkType === "buoy_installation"
              ? 1.8
              : seamarkType === "mooring"
                ? 0.65
              : 0.45,
          height: ["spar", "pillar"].includes(shape) ? 2.2 : 1.45,
          confidence: 0.99,
          reason: `${seamarkType}${category ? ` · ${category}` : ""} selon OpenSeaMap`,
          sourceLabel,
          accepted: false
        };
      }
      if (tags.man_made === "pier") {
        const connected = connections.get(item.id)?.size || 0;
        const floating = tags.floating === "yes";
        const namedMain = Boolean(tags.name) || tags.pier === "floating";
        const pontoonScore = (
          0.35
          + Math.min(0.28, item.length / 180)
          + Math.min(0.2, connected * 0.08)
          + (namedMain ? 0.09 : 0)
          + (floating ? 0.05 : 0)
        );
        const proposedType = item.length >= 28 || connected >= 2 ? "pontoon" : "catway";
        const decompositionRecommended = (
          item.closed
          && item.fittedRectangle
          && item.fittedRectangle.fillRatio < 0.78
        );
        const confidence = proposedType === "pontoon"
          ? Math.min(0.97, pontoonScore)
          : Math.min(0.92, 0.52 + (item.length < 18 ? 0.22 : 0) + (floating ? 0.08 : 0));
        return {
          ...item,
          candidateType: proposedType,
          confidence,
          reason: decompositionRecommended
            ? `emprise non rectangulaire (${Math.round(item.fittedRectangle.fillRatio * 100)} %) : découpe recommandée`
            : proposedType === "pontoon"
              ? `${Math.round(item.length)} m et ${connected} connexion(s) : axe principal probable`
            : `${Math.round(item.length)} m et peu de connexions : catway probable`,
          decompositionRecommended,
          sourceLabel,
          accepted: false
        };
      }
      if (["breakwater", "groyne", "quay"].includes(tags.man_made)) {
        return {
          ...item,
          candidateType: "obstacle",
          obstacleType: tags.man_made,
          confidence: tags.man_made === "breakwater" ? 0.96 : 0.9,
          reason: `balise man_made=${tags.man_made}`,
          sourceLabel,
          accepted: false
        };
      }
      if (
        tags.natural === "coastline"
        || ["land", "beach", "cliff"].includes(tags.natural)
        || tags.landuse
      ) {
        const closed = item.points.length >= 3 && (
          Math.hypot(
            item.points[0].east - item.points[item.points.length - 1].east,
            item.points[0].north - item.points[item.points.length - 1].north
          ) < 2
        );
        return {
          ...item,
          candidateType: closed ? "land" : "coastline",
          confidence: tags.natural === "coastline" ? 0.93 : 0.76,
          reason: tags.natural
            ? `balise natural=${tags.natural}`
            : `balise landuse=${tags.landuse}`,
          sourceLabel,
          accepted: false
        };
      }
      return {
        ...item,
        candidateType: "ignore",
        confidence: 0.2,
        reason: "géométrie non reconnue",
        sourceLabel,
        accepted: false
      };
    });
  }

  function candidateToObject(candidate, document) {
    const editorCore = typeof module === "object" && module.exports
      ? require("./port-editor-core.js")
      : globalThis.PortEditorCore;
    const idPrefix = {
      pontoon: "pontoon",
      catway: "catway",
      obstacle: "obstacle",
      coastline: "obstacle",
      land: "land",
      buoy: "buoy"
    }[candidate.candidateType] || "object";
    const id = editorCore.createId(idPrefix, document);
    const parseMetric = (value, fallback) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const text = String(value ?? "").trim().toLowerCase().replace(",", ".");
      const match = text.match(/^(-?\d+(?:\.\d+)?)\s*(m|cm|mm)?$/);
      if (!match) return fallback;
      const numeric = Number(match[1]);
      if (!Number.isFinite(numeric)) return fallback;
      if (match[2] === "cm") return numeric / 100;
      if (match[2] === "mm") return numeric / 1000;
      return numeric;
    };
    if (["pontoon", "catway"].includes(candidate.candidateType)) {
      const height = Math.max(0.05, parseMetric(candidate.tags.height, 0.5));
      return {
        collection: candidate.candidateType === "pontoon" ? "pontoons" : "catways",
        object: {
          id,
          type: candidate.candidateType,
          center: clone(candidate.center),
          length: Math.max(1, candidate.length),
          width: Number(candidate.tags.width) || (
            candidate.width
            || (candidate.candidateType === "pontoon" ? 2 : 0.6)
          ),
          heading: candidate.heading,
          height,
          vertical: {
            datum: "waterline",
            mode: "floating",
            baseZ: 0,
            topZ: height,
            deckZ: height
          },
          source: { provider: "OpenStreetMap", ...candidate.osm },
          confidence: candidate.confidence
        }
      };
    }
    if (candidate.candidateType === "buoy") {
      return {
        collection: "buoys",
        object: {
          id,
          type: "buoy",
          position: clone(candidate.center),
          radius: candidate.radius,
          height: candidate.height,
          seamarkType: candidate.seamarkType,
          category: candidate.category || "",
          shape: candidate.shape || "unknown",
          colours: clone(candidate.colours || []),
          name: candidate.name || "",
          collision: true,
          source: { provider: "OpenStreetMap / OpenSeaMap", ...candidate.osm },
          confidence: candidate.confidence
        }
      };
    }
    if (candidate.candidateType === "land") {
      const points = [...candidate.points];
      if (points.length > 2) {
        const first = points[0];
        const last = points[points.length - 1];
        if (Math.hypot(first.east - last.east, first.north - last.north) < 2) points.pop();
      }
      return {
        collection: "landAreas",
        object: {
          id,
          type: "land",
          points,
          source: { provider: "OpenStreetMap", ...candidate.osm }
        }
      };
    }
    return {
      collection: "obstacles",
      object: {
        id,
        type: candidate.obstacleType || (
          candidate.candidateType === "coastline" ? "quay" : "obstacle"
        ),
        points: clone(candidate.points),
        width: Number(candidate.tags.width) || (
          candidate.obstacleType === "breakwater" ? 8 : 2.5
        ),
        height: Math.max(0.05, parseMetric(candidate.tags.height, (
          candidate.obstacleType === "breakwater" ? 4 : 1.5
        ))),
        vertical: (() => {
          const height = Math.max(0.05, parseMetric(candidate.tags.height, (
            candidate.obstacleType === "breakwater" ? 4 : 1.5
          )));
          return {
            datum: "waterline",
            mode: "fixed",
            baseZ: 0,
            topZ: height,
            deckZ: height
          };
        })(),
        source: { provider: "OpenStreetMap", ...candidate.osm }
      }
    };
  }

  function integrateCandidates(document, candidates) {
    const next = clone(document);
    if (!Array.isArray(next.structures.buoys)) next.structures.buoys = [];
    const editorCore = typeof module === "object" && module.exports
      ? require("./port-editor-core.js")
      : globalThis.PortEditorCore;
    const existingSources = new Set();
    for (const list of [
      next.structures.pontoons,
      next.structures.catways,
      next.structures.obstacles,
      next.structures.landAreas,
      next.structures.buoys || []
    ]) {
      for (const item of list) {
        if (item.source?.type && item.source?.id !== undefined) {
          existingSources.add(`${item.source.type}/${item.source.id}`);
        }
        for (const sourceId of item.source?.osmElementIds || []) {
          existingSources.add(String(sourceId));
        }
      }
    }
    let added = 0;
    for (const candidate of candidates || []) {
      if (!candidate.accepted || candidate.candidateType === "ignore") continue;
      const key = `${candidate.osm.type}/${candidate.osm.id}`;
      if (existingSources.has(key)) continue;
      const converted = candidateToObject(candidate, next);
      next.structures[converted.collection].push(converted.object);
      if (
        converted.collection === "buoys"
        && converted.object.seamarkType === "mooring"
      ) {
        next.structures.cleats.push(
          editorCore.cleatForMooringBuoy(next, converted.object)
        );
      }
      existingSources.add(key);
      added += 1;
    }
    for (let index = 0; index < next.structures.catways.length; index += 1) {
      const catway = next.structures.catways[index];
      if (catway.attachment || catway.parentId) continue;
      const direction = { east: Math.cos(catway.heading), north: Math.sin(catway.heading) };
      const endpoints = [-1, 1].map(sign => ({
        east: catway.center.east + sign * direction.east * catway.length / 2,
        north: catway.center.north + sign * direction.north * catway.length / 2
      }));
      const matches = next.structures.pontoons.map(parent => {
        const perpendicularity = Math.abs(Math.cos(catway.heading - parent.heading));
        const endpointDistance = Math.min(...endpoints.map(point => (
          editorCore.distanceToRectangle(point, parent).distance
        )));
        return { parent, perpendicularity, endpointDistance };
      }).filter(match => match.perpendicularity <= Math.sin(20 * Math.PI / 180))
        .filter(match => match.endpointDistance <= 2)
        .sort((first, second) => first.endpointDistance - second.endpointDistance);
      if (matches.length && (
        matches.length === 1
        || matches[1].endpointDistance - matches[0].endpointDistance > 0.25
      )) {
        next.structures.catways[index] = editorCore.attachCatwayToPontoon(
          catway,
          matches[0].parent,
          { rootOverlap: 0.15 }
        );
      }
    }
    return { document: next, added };
  }

  function sourceRecord({ bounds, elements, retrievedAt = new Date().toISOString() }) {
    return {
      provider: "OpenStreetMap / OpenSeaMap",
      kind: "vector",
      attribution: "© les contributeurs OpenStreetMap, données ODbL ; signalisation © OpenSeaMap",
      license: "ODbL 1.0",
      url: "https://www.openstreetmap.org/copyright",
      retrievedAt,
      bounds: clone(bounds),
      osmElementIds: (elements || []).map(element => elementKey(element))
    };
  }

  return Object.freeze({
    MAX_ANALYSIS_SIDE_METERS,
    DEFAULT_OVERPASS_ENDPOINTS,
    DEFAULT_OVERPASS_MAX_ROUNDS,
    mergeOverpassResponses,
    validateAnalysisBounds,
    normalizeAnalysisPolygon,
    boundsForAnalysisPolygon,
    buildOverpassQuery,
    requestOverpass,
    geometryForElement,
    polylineLength,
    closedGeometry,
    polygonArea,
    orientedRectangle,
    pointInPolygon,
    candidateIntersectsPolygon,
    filterCandidatesByGeographicPolygon,
    classifyOverpass,
    candidateToObject,
    integrateCandidates,
    sourceRecord
  });
});
