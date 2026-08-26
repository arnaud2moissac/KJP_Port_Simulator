import "./styles.css";
import Map from "ol/Map.js";
import View from "ol/View.js";
import Feature from "ol/Feature.js";
import TileLayer from "ol/layer/Tile.js";
import VectorLayer from "ol/layer/Vector.js";
import OSM from "ol/source/OSM.js";
import XYZ from "ol/source/XYZ.js";
import VectorSource from "ol/source/Vector.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import LineString from "ol/geom/LineString.js";
import Select from "ol/interaction/Select.js";
import Translate from "ol/interaction/Translate.js";
import Draw from "ol/interaction/Draw.js";
import Modify from "ol/interaction/Modify.js";
import PointerInteraction from "ol/interaction/Pointer.js";
import Snap from "ol/interaction/Snap.js";
import { defaults as defaultInteractions } from "ol/interaction/defaults.js";
import { defaults as defaultControls } from "ol/control/defaults.js";
import ScaleLine from "ol/control/ScaleLine.js";
import { Fill, Stroke, Style, Circle as CircleStyle, RegularShape, Text } from "ol/style.js";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj.js";
import { getCenter } from "ol/extent.js";

const KJPCodec = require("../ports/kjp-codec.js");
const EditorCore = require("../ports/port-editor-core.js");
const OSMPortImport = require("../ports/osm-import.js");
const PontoonDecomposition = require("../ports/pontoon-decomposition.js");

const GENERATOR_VERSION = "1.1.0";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const clone = value => (
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const ENTRY_ARROW_LENGTH_METERS = 15;
const normalizeDegrees = value => ((Number(value) % 360) + 360) % 360;
const nauticalHeadingDegrees = internalHeading => normalizeDegrees(
  90 - Number(internalHeading) * 180 / Math.PI
);
const internalHeadingRadians = nauticalHeading => (
  (90 - normalizeDegrees(nauticalHeading)) * Math.PI / 180
);
const formatNauticalHeading = heading => String(
  Math.round(nauticalHeadingDegrees(heading)) % 360
).padStart(3, "0");
const format = (value, digits = 1) => Number(value).toLocaleString("fr-FR", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits
});
const safeFilename = value => (
  String(value || "port")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
  || "port"
);

let editor = new EditorCore.PortEditor(KJPCodec.createEmpty({
  name: "Nouveau port",
  latitude: 47.586,
  longitude: -3.03,
  generatorVersion: GENERATOR_VERSION
}));
let activeTool = "select";
let drawInteraction = null;
let mapsEnabled = false;
let analyzedResponses = [];
let candidates = [];
let focusedCandidateIndex = -1;
let analysisPolygonGeographic = null;
let analysisDrawInteraction = null;
let decompositionProposal = null;
let toastTimer = null;
let autosaveTimer = null;
let draftDatabase = null;
const networkRequests = [];

function documentHasGeometry(document) {
  return (
    document.structures.pontoons.length
    + document.structures.catways.length
    + document.structures.obstacles.length
    + document.structures.landAreas.length
    + (document.structures.buoys?.length || 0)
    + (document.structures.pendilles?.length || 0)
    + document.staticBoats.length
  ) > 0;
}

function projectionForDocument(document = editor.document) {
  return KJPCodec.createLocalProjection(
    document.georeference.origin.latitude,
    document.georeference.origin.longitude
  );
}

function localToMap(point, document = editor.document) {
  const geographic = projectionForDocument(document).inverse(point.east, point.north);
  return fromLonLat([geographic.longitude, geographic.latitude]);
}

function mapToLocal(coordinate, document = editor.document) {
  const [longitude, latitude] = toLonLat(coordinate);
  return projectionForDocument(document).forward(latitude, longitude);
}

function rectangleMapCoordinates(rectangle, document = editor.document) {
  const points = EditorCore.rectangleCorners(rectangle).map(point => localToMap(point, document));
  points.push(points[0]);
  return points;
}

function boatMapCoordinates(boat, document = editor.document) {
  const halfLength = boat.length / 2;
  const halfBeam = boat.beam / 2;
  const rectangle = {
    center: boat.center,
    length: boat.length,
    width: boat.beam,
    heading: boat.heading
  };
  const localShape = [
    { longitudinal: halfLength, transverse: 0 },
    { longitudinal: halfLength * 0.72, transverse: halfBeam * 0.86 },
    { longitudinal: -halfLength * 0.72, transverse: halfBeam },
    { longitudinal: -halfLength, transverse: halfBeam * 0.62 },
    { longitudinal: -halfLength, transverse: -halfBeam * 0.62 },
    { longitudinal: -halfLength * 0.72, transverse: -halfBeam },
    { longitudinal: halfLength * 0.72, transverse: -halfBeam * 0.86 }
  ];
  const points = localShape.map(local => localToMap(
    KJPCodec.localToWorld(rectangle, local),
    document
  ));
  points.push(points[0]);
  return points;
}

function showToast(message, tone = "neutral", duration = 2300, action = null) {
  const toast = $("#toast");
  clearTimeout(toastTimer);
  toast.replaceChildren(document.createTextNode(message));
  toast.classList.toggle("has-action", Boolean(action));
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      action.handler();
      toast.classList.remove("visible", "has-action");
    }, { once: true });
    toast.append(button);
  }
  toast.dataset.tone = tone;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible", "has-action"), duration);
}

function fetchTracked(url, options) {
  networkRequests.push({
    url: String(url),
    method: options?.method || "GET",
    at: Date.now()
  });
  return fetch(url, options);
}

const osmLayer = new TileLayer({
  visible: false,
  source: new OSM({
    crossOrigin: "anonymous",
    attributions: "© les contributeurs OpenStreetMap · ODbL"
  })
});
const orthoLayer = new TileLayer({
  visible: false,
  opacity: 0.45,
  source: new XYZ({
    crossOrigin: "anonymous",
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    attributions: "© IGN · BD ORTHO"
  })
});
const seamarkLayer = new TileLayer({
  visible: false,
  source: new XYZ({
    crossOrigin: "anonymous",
    url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
    attributions: "© OpenSeaMap"
  })
});
const objectSource = new VectorSource();
const candidateSource = new VectorSource();
const analysisSource = new VectorSource();
const decompositionSource = new VectorSource();
const entryDraftSource = new VectorSource();
const editHandleSource = new VectorSource();

const palette = Object.freeze({
  pontoon: { fill: "rgba(250,248,239,.94)", stroke: "#53676c" },
  catway: { fill: "rgba(239,236,222,.96)", stroke: "#66787c" },
  cleat: { fill: "#314f56", stroke: "#f8f6ed" },
  obstacle: { fill: "rgba(155,148,133,.72)", stroke: "#565e5d" },
  land: { fill: "rgba(224,220,205,.86)", stroke: "#7b817c" },
  boat: { fill: "rgba(255,255,249,.95)", stroke: "#23677a" },
  berth: { fill: "rgba(37,143,118,.08)", stroke: "#27866f" },
  visitor: { fill: "rgba(8,117,138,.11)", stroke: "#08758a" },
  entry: { fill: "#b96426", stroke: "#fff" },
  buoy: { fill: "#e2b51b", stroke: "#18353c" },
  pendille: { fill: "rgba(32,151,170,.12)", stroke: "#087f98" },
  selected: "#da7a28"
});

const buoyColourPalette = Object.freeze({
  red: "#c83b32",
  green: "#18834f",
  yellow: "#e2b51b",
  black: "#263238",
  white: "#fbfaf4",
  orange: "#d66e24",
  blue: "#2675b8"
});

const buoyCategoryOptions = Object.freeze({
  buoy_lateral: Object.freeze([
    Object.freeze({ value: "port", label: "Bâbord · rouge" }),
    Object.freeze({ value: "starboard", label: "Tribord · vert" })
  ]),
  buoy_cardinal: Object.freeze([
    Object.freeze({ value: "north", label: "Cardinale Nord" }),
    Object.freeze({ value: "east", label: "Cardinale Est" }),
    Object.freeze({ value: "south", label: "Cardinale Sud" }),
    Object.freeze({ value: "west", label: "Cardinale Ouest" })
  ]),
  buoy_isolated_danger: Object.freeze([
    Object.freeze({ value: "", label: "Danger isolé" })
  ]),
  buoy_safe_water: Object.freeze([
    Object.freeze({ value: "", label: "Eaux saines" })
  ]),
  buoy_special_purpose: Object.freeze([
    Object.freeze({ value: "", label: "Marque spéciale" })
  ]),
  buoy_installation: Object.freeze([
    Object.freeze({ value: "", label: "Installation" })
  ]),
  mooring: Object.freeze([
    Object.freeze({ value: "buoy", label: "Corps mort · bouée d’amarrage" })
  ])
});

function resolvedBuoyAppearance(buoy) {
  const recommended = KJPCodec.recommendedBuoyAppearance(buoy.seamarkType, buoy.category);
  return {
    shape: buoy.shape && buoy.shape !== "unknown" ? buoy.shape : recommended.shape,
    colours: Array.isArray(buoy.colours) && buoy.colours.length
      ? buoy.colours
      : recommended.colours
  };
}

function buoyPointStyles(object, { selected, label }) {
  const colours = resolvedBuoyAppearance(object).colours.slice(0, 4);
  const radii = colours.length === 1
    ? [6]
    : colours.map((_, index) => 7 - index * (4.5 / Math.max(1, colours.length - 1)));
  return colours.map((colour, index) => new Style({
    image: new CircleStyle({
      radius: radii[index],
      fill: new Fill({ color: buoyColourPalette[String(colour).toLowerCase()] || buoyColourPalette.yellow }),
      stroke: index === 0
        ? new Stroke({ color: selected ? palette.selected : palette.buoy.stroke, width: selected ? 3 : 1.5 })
        : undefined
    }),
    text: index === 0
      ? new Text({
        text: label,
        offsetY: -18,
        padding: [4, 5, 4, 5],
        fill: new Fill({ color: "#173238" }),
        backgroundFill: new Fill({ color: "rgba(250,249,244,.9)" }),
        font: "600 10px sans-serif"
      })
      : undefined
  }));
}

function selectedId() {
  return editor.selection;
}

function dimensionLabel(object, collection) {
  if (["pontoons", "catways"].includes(collection)) {
    const group = collection === "pontoons"
      ? editor.document.editor.catwayGroups.find(item => item.parentId === object.id)
      : null;
    const spacing = group
      ? group.parameters.mode === "spacing"
        ? ` · entraxe ${format(group.parameters.spacing)} m`
        : ` · ${group.parameters.count} par côté`
      : "";
    return `${format(object.length)} m · ${format(object.width)} m · ${format(object.heading * 180 / Math.PI, 0)}°${spacing}`;
  }
  if (collection === "obstacles") {
    const length = OSMPortImport.polylineLength(object.points);
    return `${format(length)} m · H ${format(object.height)} m`;
  }
  if (collection === "buoys") {
    return `Ø ${format(object.radius * 2)} m · H ${format(object.height)} m`;
  }
  if (collection === "pendilles") {
    return `${format(object.anchor.normalDistance)} m · prof. ${format(object.anchor.depth)} m`;
  }
  if (collection === "staticBoats") return `${format(object.length)} × ${format(object.beam)} m`;
  if (collection === "berths") return `${format(object.length)} × ${format(object.width)} m`;
  if (collection === "entries") return `Cap ${formatNauticalHeading(object.heading)}°`;
  return "";
}

function entryArrowLocalCoordinates(entry) {
  const heading = Number(entry.heading) || 0;
  return [
    entry.position,
    {
      east: entry.position.east + Math.cos(heading) * ENTRY_ARROW_LENGTH_METERS,
      north: entry.position.north + Math.sin(heading) * ENTRY_ARROW_LENGTH_METERS
    }
  ];
}

function entryArrowMapCoordinates(entry) {
  return entryArrowLocalCoordinates(entry).map(point => localToMap(point));
}

function entryStyles(feature, object, isSelected) {
  const strokeColor = isSelected ? palette.selected : palette.entry.fill;
  const heading = Number(object.heading) || 0;
  const lineWidth = isSelected ? 4 : 3;
  return [
    new Style({
      stroke: new Stroke({ color: palette.entry.stroke, width: lineWidth + 3 }),
      text: new Text({
        text: `Cap ${formatNauticalHeading(heading)}°`,
        offsetY: -17,
        padding: [4, 5, 4, 5],
        fill: new Fill({ color: "#173238" }),
        backgroundFill: new Fill({ color: "rgba(250,249,244,.94)" }),
        font: "600 10px sans-serif"
      })
    }),
    new Style({
      stroke: new Stroke({ color: strokeColor, width: lineWidth }),
      geometry: currentFeature => new Point(
        currentFeature.getGeometry().getLastCoordinate()
      ),
      image: new RegularShape({
        points: 3,
        radius: isSelected ? 10 : 9,
        angle: 0,
        rotation: Math.PI / 2 - heading,
        rotateWithView: true,
        fill: new Fill({ color: strokeColor }),
        stroke: new Stroke({ color: palette.entry.stroke, width: 1.5 })
      })
    }),
    ...(isSelected ? [new Style({
      geometry: currentFeature => new Point(
        currentFeature.getGeometry().getFirstCoordinate()
      ),
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: palette.entry.stroke }),
        stroke: new Stroke({ color: strokeColor, width: 2 })
      })
    })] : [])
  ];
}

function objectStyle(feature) {
  const collection = feature.get("collection");
  const object = feature.get("object");
  const isSelected = feature.get("objectId") === selectedId();
  const connectionStatus = feature.get("connectionStatus");
  let colors = palette[collection === "pontoons"
    ? "pontoon"
    : collection === "catways"
      ? "catway"
      : collection === "cleats"
        ? "cleat"
        : collection === "obstacles"
          ? "obstacle"
          : collection === "landAreas"
            ? "land"
            : collection === "staticBoats"
              ? "boat"
            : collection === "entries"
              ? "entry"
              : collection === "buoys"
                ? "buoy"
                : collection === "pendilles"
                  ? "pendille"
                : object?.isVisitor
                  ? "visitor"
                  : "berth"];
  const strokeColor = isSelected
    ? palette.selected
    : connectionStatus === "ok"
      ? "#23875d"
      : connectionStatus === "ramp"
        ? "#d47a20"
        : connectionStatus === "hinge"
          ? "#5d6fc3"
        : connectionStatus === "invalid"
          ? "#c54343"
          : colors.stroke;
  const geometryType = feature.getGeometry()?.getType();
  const label = isSelected ? dimensionLabel(object, collection) : "";
  if (collection === "entries") {
    return entryStyles(feature, object, isSelected);
  }
  if (geometryType === "Point") {
    if (collection === "buoys") {
      return buoyPointStyles(object, { selected: isSelected, label });
    }
    return new Style({
      image: new CircleStyle({
        radius: collection === "cleats" ? 4 : collection === "buoys" ? 6 : 7,
        fill: new Fill({ color: colors.fill }),
        stroke: new Stroke({ color: strokeColor, width: isSelected ? 3 : 1.5 })
      }),
      text: new Text({
        text: label,
        offsetY: -17,
        padding: [4, 5, 4, 5],
        fill: new Fill({ color: "#173238" }),
        backgroundFill: new Fill({ color: "rgba(250,249,244,.9)" }),
        font: "600 10px sans-serif"
      })
    });
  }
  if (collection === "pendilles") {
    return new Style({
      stroke: new Stroke({
        color: strokeColor,
        width: isSelected ? 4 : 2,
        lineDash: [7, 5]
      }),
      text: new Text({
        text: label,
        offsetY: -16,
        padding: [4, 5, 4, 5],
        fill: new Fill({ color: "#173238" }),
        backgroundFill: new Fill({ color: "rgba(250,249,244,.92)" }),
        font: "600 10px sans-serif"
      })
    });
  }
  const baseStyle = new Style({
    fill: new Fill({ color: colors.fill }),
    stroke: new Stroke({
      color: strokeColor,
      width: isSelected ? 3 : 1.5,
      lineDash: collection === "berths" ? [8, 5] : undefined
    }),
    text: new Text({
      text: label,
      overflow: true,
      padding: [4, 5, 4, 5],
      fill: new Fill({ color: "#173238" }),
      backgroundFill: new Fill({ color: "rgba(250,249,244,.9)" }),
      font: "600 10px sans-serif"
    })
  });
  if (collection === "staticBoats" && object.vesselType !== "motorboat") {
    return [baseStyle, new Style({
      geometry: currentFeature => new Point(getCenter(currentFeature.getGeometry().getExtent())),
      image: new CircleStyle({
        radius: 2.8,
        fill: new Fill({ color: "#314f56" }),
        stroke: new Stroke({ color: "#f8f6ed", width: 1.2 })
      })
    })];
  }
  return baseStyle;
}

const objectLayer = new VectorLayer({
  source: objectSource,
  style: objectStyle,
  zIndex: 20
});
const candidateLayer = new VectorLayer({
  source: candidateSource,
  style: feature => {
    const candidate = feature.get("candidate");
    const accepted = candidate.accepted;
    const focused = feature.get("candidateIndex") === focusedCandidateIndex;
    const geometryType = feature.getGeometry()?.getType();
    const candidateBuoyColour = candidate.candidateType === "buoy"
      ? buoyColourPalette[
        String(resolvedBuoyAppearance(candidate).colours[0]).toLowerCase()
      ] || buoyColourPalette.yellow
      : null;
    return new Style({
      stroke: new Stroke({
        color: focused ? "#08758a" : accepted ? "#27866f" : "#c26c2d",
        width: focused ? 7 : accepted ? 4 : 3,
        lineDash: accepted ? undefined : [7, 5]
      }),
      fill: new Fill({ color: accepted ? "rgba(39,134,111,.12)" : "rgba(194,108,45,.08)" }),
      image: geometryType === "Point"
        ? new CircleStyle({
          radius: focused ? 10 : 7,
          fill: new Fill({ color: candidateBuoyColour || (accepted ? "#27866f" : "#e2b51b") }),
          stroke: new Stroke({ color: focused ? "#08758a" : "#fff", width: focused ? 4 : 2 })
        })
        : undefined
    });
  },
  zIndex: 30
});

const analysisLayer = new VectorLayer({
  source: analysisSource,
  style: new Style({
    stroke: new Stroke({ color: "#08758a", width: 3, lineDash: [8, 5] }),
    fill: new Fill({ color: "rgba(8,117,138,.08)" })
  }),
  zIndex: 31
});

const decompositionLayer = new VectorLayer({
  source: decompositionSource,
  style: feature => new Style({
    stroke: new Stroke({
      color: feature.get("decompositionType") === "pontoon" ? "#08758a" : "#da7a28",
      width: 4
    }),
    fill: new Fill({
      color: feature.get("decompositionType") === "pontoon"
        ? "rgba(8,117,138,.20)"
        : "rgba(218,122,40,.20)"
    })
  }),
  zIndex: 33
});

const entryDraftLayer = new VectorLayer({
  source: entryDraftSource,
  style: feature => entryStyles(feature, feature.get("object"), true),
  zIndex: 34
});

const editHandleLayer = new VectorLayer({
  source: editHandleSource,
  style: feature => {
    const kind = feature.get("handleKind");
    if (kind === "rotation-guide") {
      return new Style({
        stroke: new Stroke({ color: palette.selected, width: 1.5, lineDash: [5, 4] })
      });
    }
    return new Style({
      image: kind === "rotate"
        ? new CircleStyle({
          radius: 7,
          fill: new Fill({ color: "#fff" }),
          stroke: new Stroke({ color: palette.selected, width: 3 })
        })
        : new RegularShape({
          points: 4,
          radius: 7,
          angle: Math.PI / 4,
          fill: new Fill({ color: "#fff" }),
          stroke: new Stroke({ color: palette.selected, width: 3 })
        }),
      text: new Text({
        text: kind === "rotate" ? "Rotation" : "Longueur",
        offsetY: kind === "rotate" ? -17 : 17,
        padding: [3, 4, 3, 4],
        fill: new Fill({ color: "#173238" }),
        backgroundFill: new Fill({ color: "rgba(250,249,244,.92)" }),
        font: "600 9px sans-serif"
      })
    });
  },
  zIndex: 35
});

const map = new Map({
  target: "map",
  layers: [
    osmLayer,
    orthoLayer,
    seamarkLayer,
    objectLayer,
    candidateLayer,
    analysisLayer,
    decompositionLayer,
    entryDraftLayer,
    editHandleLayer
  ],
  view: new View({
    center: fromLonLat([-3.03, 47.586]),
    zoom: 16,
    minZoom: 5,
    maxZoom: 22
  }),
  controls: defaultControls({ rotate: false }).extend([
    new ScaleLine({ units: "metric", bar: true, steps: 3, minWidth: 100 })
  ]),
  interactions: defaultInteractions({
    altShiftDragRotate: false,
    pinchRotate: false
  })
});

const selectInteraction = new Select({
  layers: [objectLayer],
  hitTolerance: 8,
  style: objectStyle
});
const translateInteraction = new Translate({
  features: selectInteraction.getFeatures(),
  hitTolerance: 10
});
const modifyInteraction = new Modify({
  features: selectInteraction.getFeatures(),
  pixelTolerance: 14
});
modifyInteraction.setActive(false);
const snapInteraction = new Snap({
  source: objectSource,
  pixelTolerance: 12,
  intersection: true,
  vertex: true,
  edge: true
});
map.addInteraction(selectInteraction);
map.addInteraction(translateInteraction);
map.addInteraction(modifyInteraction);
map.addInteraction(snapInteraction);

function syncMapSelection() {
  const selectedFeatures = selectInteraction.getFeatures();
  const selectedFeature = editor.selection
    ? objectSource.getFeatures().find(feature => feature.get("objectId") === editor.selection)
    : null;
  if (
    selectedFeatures.getLength() === (selectedFeature ? 1 : 0)
    && (!selectedFeature || selectedFeatures.item(0) === selectedFeature)
  ) return;
  selectedFeatures.clear();
  if (selectedFeature) selectedFeatures.push(selectedFeature);
  const editableLine = ["entries", "pendilles"].includes(selectedFeature?.get("collection"));
  modifyInteraction.setActive(editableLine);
  translateInteraction.setActive(activeTool === "select" && selectedFeature?.get("collection") !== "pendilles");
}

function featureForObject(object, collection) {
  let geometry;
  if (["pontoons", "catways"].includes(collection)) {
    geometry = new Polygon([rectangleMapCoordinates(object)]);
  } else if (collection === "cleats") {
    const rectangleParent = [
      ...editor.document.structures.pontoons,
      ...editor.document.structures.catways
    ].find(item => item.id === object.parentId);
    const buoyParent = editor.document.structures.buoys?.find(
      item => item.id === object.parentId
    );
    const quayParent = editor.document.structures.obstacles?.find(
      item => item.id === object.parentId && item.type === "quay"
    );
    const quayGeometry = quayParent
      ? KJPCodec.pointOnPolyline(quayParent.points, object.attachment.station)
      : null;
    const quaySideSign = object.attachment?.waterSide === "right" ? -1 : 1;
    const point = rectangleParent
      ? KJPCodec.localToWorld(rectangleParent, object.localPosition)
      : buoyParent
        ? {
          east: buoyParent.position.east + object.localPosition.longitudinal,
          north: buoyParent.position.north + object.localPosition.transverse
        }
        : quayParent
          ? {
            east: quayGeometry.point.east - quayGeometry.tangent.north * quaySideSign * quayParent.width / 2,
            north: quayGeometry.point.north + quayGeometry.tangent.east * quaySideSign * quayParent.width / 2
          }
        : { east: 0, north: 0 };
    geometry = new Point(localToMap(point));
  } else if (collection === "obstacles") {
    geometry = new LineString(object.points.map(point => localToMap(point)));
  } else if (collection === "landAreas") {
    const points = object.points.map(point => localToMap(point));
    if (points.length) points.push(points[0]);
    geometry = new Polygon([points]);
  } else if (collection === "staticBoats") {
    geometry = new Polygon([boatMapCoordinates(object)]);
  } else if (collection === "berths") {
    geometry = new Polygon([rectangleMapCoordinates({
      center: object.center,
      length: object.length,
      width: object.width,
      heading: object.heading
    })]);
  } else if (collection === "buoys") {
    geometry = new Point(localToMap(object.position));
  } else if (collection === "pendilles") {
    const parent = editor.document.structures.pontoons.find(item => item.id === object.parentId)
      || editor.document.structures.obstacles.find(item => item.id === object.parentId);
    const resolved = KJPCodec.resolvePendilleGeometry(object, parent);
    geometry = new LineString([
      localToMap(resolved.pickup),
      localToMap(resolved.anchor)
    ]);
  } else if (collection === "entries") {
    geometry = new LineString(entryArrowMapCoordinates(object));
  } else {
    geometry = new Point(localToMap(object.position));
  }
  const feature = new Feature({ geometry });
  let connectionStatus = null;
  if (collection === "catways" && (object.attachment || object.parentId)) {
    const parent = editor.document.structures.pontoons.find(item => (
      item.id === (object.attachment?.parentId || object.parentId)
    ));
    if (!parent || !object.attachment) connectionStatus = "invalid";
    else {
      const parentDeck = EditorCore.resolvedVertical(parent).deckZ;
      const catwayDeck = EditorCore.resolvedVertical(object).deckZ;
      connectionStatus = Math.abs(parentDeck - catwayDeck) <= 0.08
        ? "ok"
        : object.attachment.connector === "ramp"
          ? "ramp"
          : object.attachment.connector === "hinge"
            ? "hinge"
          : "invalid";
    }
  }
  feature.setProperties({
    objectId: object.id,
    collection,
    object,
    connectionStatus
  });
  return feature;
}

function renderObjects() {
  objectSource.clear();
  const document = editor.document;
  for (const [collection, items] of [
    ["landAreas", document.structures.landAreas],
    ["obstacles", document.structures.obstacles],
    ["pontoons", document.structures.pontoons],
    ["catways", document.structures.catways],
    ["berths", document.berths],
    ["staticBoats", document.staticBoats],
    ["buoys", document.structures.buoys || []],
    ["pendilles", document.structures.pendilles || []],
    ["cleats", document.structures.cleats],
    ["entries", document.navigation.entries]
  ]) {
    for (const object of items) objectSource.addFeature(featureForObject(object, collection));
  }
  syncMapSelection();
  renderEditHandles();
  objectLayer.changed();
  updateInspector();
  updateStatus();
}

function renderCandidates() {
  candidateSource.clear();
  for (const [index, candidate] of candidates.entries()) {
    let geometry;
    if (candidate.candidateType === "buoy") {
      geometry = new Point(localToMap(candidate.center));
    } else if (
      (candidate.candidateType === "land" || candidate.closed)
      && candidate.points.length >= 3
    ) {
      const points = candidate.points.map(point => localToMap(point));
      points.push(points[0]);
      geometry = new Polygon([points]);
    } else {
      geometry = new LineString(candidate.points.map(point => localToMap(point)));
    }
    const feature = new Feature({ geometry });
    feature.set("candidate", candidate);
    feature.set("candidateIndex", index);
    candidateSource.addFeature(feature);
  }
  candidateLayer.changed();
}

function selectedObject() {
  return editor.selection ? EditorCore.findObject(editor.document, editor.selection) : null;
}

function editableRectangle(found = selectedObject()) {
  if (!found || !["pontoons", "catways"].includes(found.collection)) return null;
  if (found.collection === "catways" && found.object.groupId) return null;
  return found;
}

function handleFeatureAtPixel(pixel) {
  return map.forEachFeatureAtPixel(pixel, feature => (
    feature.get("handleKind") === "rotation-guide" ? null : feature
  ), {
    hitTolerance: 10,
    layerFilter: layer => layer === editHandleLayer
  });
}

function rectangleHandleGeometry(rectangle, collection) {
  const resizeSigns = collection === "catways" && rectangle.attachment ? [1] : [-1, 1];
  const resize = resizeSigns.map(sign => ({
    kind: "length",
    sign,
    point: KJPCodec.localToWorld(rectangle, {
      longitudinal: sign * rectangle.length / 2,
      transverse: 0
    })
  }));
  if (collection === "catways" && rectangle.attachment) {
    return { resize, rotation: null, guideStart: null };
  }
  const rotationOffset = rectangle.width / 2 + clamp(rectangle.length * 0.12, 3, 7);
  return {
    resize,
    guideStart: KJPCodec.localToWorld(rectangle, {
      longitudinal: 0,
      transverse: rectangle.width / 2
    }),
    rotation: KJPCodec.localToWorld(rectangle, {
      longitudinal: 0,
      transverse: rotationOffset
    })
  };
}

function renderEditHandles(found = editableRectangle()) {
  editHandleSource.clear();
  const editable = editableRectangle(found);
  if (!editable || activeTool !== "select") return;
  const geometry = rectangleHandleGeometry(editable.object, editable.collection);
  for (const handle of geometry.resize) {
    const feature = new Feature({ geometry: new Point(localToMap(handle.point)) });
    feature.setProperties({
      handleKind: handle.kind,
      handleSign: handle.sign,
      objectId: editable.object.id
    });
    editHandleSource.addFeature(feature);
  }
  if (geometry.rotation && geometry.guideStart) {
    const guide = new Feature({
      geometry: new LineString([localToMap(geometry.guideStart), localToMap(geometry.rotation)])
    });
    guide.setProperties({ handleKind: "rotation-guide", objectId: editable.object.id });
    editHandleSource.addFeature(guide);
    const rotation = new Feature({ geometry: new Point(localToMap(geometry.rotation)) });
    rotation.setProperties({ handleKind: "rotate", objectId: editable.object.id });
    editHandleSource.addFeature(rotation);
  }
}

function snappedRectangleHeading(rawHeading, collection) {
  const candidates = [Math.round(rawHeading / (Math.PI / 12)) * Math.PI / 12];
  if (collection === "catways") {
    for (const pontoon of editor.document.structures.pontoons) {
      candidates.push(pontoon.heading + Math.PI / 2, pontoon.heading - Math.PI / 2);
    }
  }
  const nearest = candidates
    .map(heading => ({
      heading,
      difference: Math.abs(Math.atan2(
        Math.sin(heading - rawHeading),
        Math.cos(heading - rawHeading)
      ))
    }))
    .sort((first, second) => first.difference - second.difference)[0];
  return nearest.difference <= 3 * Math.PI / 180 ? nearest.heading : rawHeading;
}

function previewRectangleEdit(found, rectangle) {
  const feature = objectSource.getFeatures().find(candidate => (
    candidate.get("objectId") === found.object.id
  ));
  if (feature) {
    feature.set("object", rectangle);
    feature.setGeometry(new Polygon([rectangleMapCoordinates(rectangle)]));
  }
  renderEditHandles({ ...found, object: rectangle });
  objectLayer.changed();
  const metrics = $("#selectionMetrics");
  metrics.hidden = false;
  metrics.textContent = `${rectangle.id} · ${dimensionLabel(rectangle, found.collection)}`;
}

let rectangleHandleDrag = null;
const rectangleHandleInteraction = new PointerInteraction({
  stopDown: () => Boolean(rectangleHandleDrag),
  handleDownEvent(event) {
    if (activeTool !== "select") return false;
    const handle = handleFeatureAtPixel(event.pixel);
    if (!handle) return false;
    const found = editableRectangle();
    if (!found || found.object.id !== handle.get("objectId")) return false;
    rectangleHandleDrag = {
      found,
      original: clone(found.object),
      preview: clone(found.object),
      kind: handle.get("handleKind"),
      sign: Number(handle.get("handleSign")) || 1
    };
    map.getTargetElement().style.cursor = rectangleHandleDrag.kind === "rotate"
      ? "grabbing"
      : "ew-resize";
    return true;
  },
  handleDragEvent(event) {
    if (!rectangleHandleDrag) return;
    const cursor = mapToLocal(event.coordinate);
    const { found, original, kind, sign } = rectangleHandleDrag;
    const next = clone(original);
    if (kind === "length") {
      const axis = { east: Math.cos(original.heading), north: Math.sin(original.heading) };
      const opposite = {
        east: original.center.east - sign * axis.east * original.length / 2,
        north: original.center.north - sign * axis.north * original.length / 2
      };
      const projected = sign * (
        (cursor.east - opposite.east) * axis.east
        + (cursor.north - opposite.north) * axis.north
      );
      next.length = Math.max(0.2, Math.round(projected * 10) / 10);
      next.center = {
        east: opposite.east + sign * axis.east * next.length / 2,
        north: opposite.north + sign * axis.north * next.length / 2
      };
    } else if (kind === "rotate") {
      const direction = Math.atan2(
        cursor.north - original.center.north,
        cursor.east - original.center.east
      );
      next.heading = snappedRectangleHeading(direction - Math.PI / 2, found.collection);
    }
    rectangleHandleDrag.preview = next;
    previewRectangleEdit(found, next);
  },
  handleUpEvent() {
    if (!rectangleHandleDrag) return false;
    const { found, original, preview } = rectangleHandleDrag;
    rectangleHandleDrag = null;
    map.getTargetElement().style.cursor = "";
    if (
      Math.abs(preview.length - original.length) < 1e-9
      && Math.abs(preview.heading - original.heading) < 1e-9
      && Math.hypot(
        preview.center.east - original.center.east,
        preview.center.north - original.center.north
      ) < 1e-9
    ) {
      renderObjects();
      return false;
    }
    let patch = {
      center: preview.center,
      length: preview.length,
      heading: preview.heading
    };
    if (found.collection === "catways" && original.attachment) {
      const parent = editor.document.structures.pontoons.find(item => (
        item.id === (original.parentId || original.attachment.parentId)
      ));
      if (parent) {
        patch = EditorCore.attachCatwayToPontoon({ ...original, ...patch }, parent, {
          parentEdge: original.attachment.parentEdge,
          station: original.attachment.station,
          rootOverlap: original.attachment.rootOverlap,
          connector: original.attachment.connector,
          connectorLength: original.attachment.connectorLength
        });
      }
    }
    editor.update(original.id, patch, "Modifier avec les poignées");
    afterEdit({ selectId: original.id });
    return false;
  },
  handleMoveEvent(event) {
    if (rectangleHandleDrag) return;
    const handle = activeTool === "select" ? handleFeatureAtPixel(event.pixel) : null;
    map.getTargetElement().style.cursor = handle
      ? handle.get("handleKind") === "rotate" ? "grab" : "ew-resize"
      : "";
  }
});
map.addInteraction(rectangleHandleInteraction);

function configureBuoyCategorySelect(seamarkType, requestedCategory = "") {
  const select = $("#buoyCategory");
  const options = buoyCategoryOptions[seamarkType] || buoyCategoryOptions.buoy_special_purpose;
  select.replaceChildren();
  for (const option of options) select.add(new Option(option.label, option.value));
  if (requestedCategory && !options.some(option => option.value === requestedCategory)) {
    select.add(new Option(`Autre · ${requestedCategory}`, requestedCategory));
  }
  select.value = options.some(option => option.value === requestedCategory)
    ? requestedCategory
    : requestedCategory && select.querySelector(`option[value="${CSS.escape(requestedCategory)}"]`)
      ? requestedCategory
      : options[0].value;
  return select.value;
}

function updateInspector() {
  const found = selectedObject();
  $("#emptyInspector").hidden = Boolean(found);
  $("#objectInspector").hidden = !found;
  $("#inspectorTitle").textContent = found
    ? ({
      pontoons: "Ponton",
      catways: "Catway",
      cleats: "Taquet",
      obstacles: "Obstacle linéaire",
      landAreas: "Zone non navigable",
      berths: "Place",
      staticBoats: "Bateau générique",
      entries: "Entrée orientée",
      buoys: found.object.seamarkType === "mooring"
        ? "Bouée corps mort"
        : "Bouée de navigation",
      pendilles: "Pendille"
    }[found.collection] || "Objet")
    : "Aucun objet sélectionné";
  if (!found) {
    $("#catwayGenerator").hidden = true;
    $("#buoyFields").hidden = true;
    $("#pendilleFields").hidden = true;
    $("#pendilleGenerator").hidden = true;
    $("#verticalLevelField").hidden = true;
    $("#lengthPropertyLabel").textContent = "Longueur (m)";
    $("#widthPropertyLabel").textContent = "Largeur (m)";
    $("#selectionMetrics").hidden = true;
    return;
  }
  const object = found.object;
  $("#objectId").value = object.id;
  const pendilleParentObject = found.collection === "pendilles"
    ? editor.document.structures.pontoons.find(item => item.id === object.parentId)
      || editor.document.structures.obstacles.find(item => item.id === object.parentId)
    : null;
  const pendilleGeometry = pendilleParentObject
    ? KJPCodec.resolvePendilleGeometry(object, pendilleParentObject)
    : null;
  const center = object.center || object.position || pendilleGeometry?.anchor || (
    object.points?.length
      ? {
        east: object.points.reduce((sum, point) => sum + point.east, 0) / object.points.length,
        north: object.points.reduce((sum, point) => sum + point.north, 0) / object.points.length
      }
      : null
  );
  const propertyValues = {
    length: found.collection === "buoys"
      ? ""
      : object.length ?? (object.points ? OSMPortImport.polylineLength(object.points) : ""),
    width: found.collection === "buoys"
      ? object.radius * 2
      : object.width ?? object.beam ?? "",
    headingDeg: Number.isFinite(object.heading)
      ? found.collection === "entries"
        ? nauticalHeadingDegrees(object.heading)
        : object.heading * 180 / Math.PI
      : "",
    height: object.height ?? "",
    verticalLevel: ["pontoons", "catways"].includes(found.collection)
      ? object.vertical?.deckZ ?? object.height ?? ""
      : found.collection === "obstacles"
        ? object.vertical?.baseZ ?? 0
        : "",
    east: center?.east ?? "",
    north: center?.north ?? ""
  };
  for (const input of $$("[data-property]", $("#objectInspector"))) {
    input.value = propertyValues[input.dataset.property];
    input.disabled = (
      (["length", "headingDeg", "east", "north"].includes(input.dataset.property)
        && ["obstacles", "landAreas", "cleats", "pendilles"].includes(found.collection))
      || (["length", "headingDeg"].includes(input.dataset.property)
        && found.collection === "buoys")
      || (input.dataset.property === "height"
        && !["pontoons", "catways", "obstacles", "buoys"].includes(found.collection))
      || (input.dataset.property === "verticalLevel"
        && !["pontoons", "catways", "obstacles"].includes(found.collection))
    );
  }
  const visitorFields = $$(".visitor-field");
  visitorFields.forEach(field => field.classList.toggle("visible", found.collection === "berths"));
  $("#visitorToggle").checked = Boolean(object.isVisitor);
  $("#visitorName").value = object.name || "";
  $("#generateCleatsButton").hidden = !["pontoons", "catways"].includes(found.collection);
  $("#cleatGenerationFields").hidden = !["pontoons", "catways"].includes(found.collection);
  $("#groupActions").hidden = !(found.collection === "catways" && object.groupId);
  $("#catwayGenerator").hidden = found.collection !== "pontoons";
  $("#buoyFields").hidden = found.collection !== "buoys";
  $("#pendilleFields").hidden = found.collection !== "pendilles";
  const pendilleParentSelected = found.collection === "pontoons"
    || (found.collection === "obstacles" && object.type === "quay");
  $("#pendilleGenerator").hidden = !pendilleParentSelected;
  $("#lengthPropertyLabel").textContent = found.collection === "buoys"
    ? "Longueur"
    : "Longueur (m)";
  $("#widthPropertyLabel").textContent = found.collection === "buoys"
    ? "Diamètre (m)"
    : "Largeur (m)";
  $("#headingPropertyLabel").textContent = found.collection === "entries"
    ? "Cap nautique (°)"
    : "Angle (°)";
  const floatingStructure = ["pontoons", "catways"].includes(found.collection);
  $("#heightPropertyLabel").textContent = floatingStructure ? "Épaisseur (m)" : "Hauteur (m)";
  $("#verticalLevelLabel").textContent = floatingStructure
    ? "Niveau du pont au-dessus de l’eau (m)"
    : "Altitude de base (m)";
  $("#verticalLevelField").hidden = !["pontoons", "catways", "obstacles"].includes(found.collection);
  if (found.collection === "buoys") {
    $("#buoySeamarkType").value = object.seamarkType;
    configureBuoyCategorySelect(object.seamarkType, object.category || "");
    $("#buoyShape").value = object.shape || "unknown";
  }
  if (found.collection === "pendilles") {
    $("#pendilleAnchorDistance").value = object.anchor.normalDistance;
    $("#pendilleDepth").value = object.anchor.depth;
    $("#pendilleMaximumLength").value = object.line.maximumLength;
    $("#detachPendilleButton").hidden = !object.groupId;
  }

  const metrics = $("#selectionMetrics");
  metrics.hidden = false;
  metrics.textContent = `${object.id} · ${dimensionLabel(object, found.collection) || "position locale métrique"}`;
}

function updateStatus() {
  const document = editor.document;
  const structures = (
    document.structures.pontoons.length
    + document.structures.catways.length
    + document.structures.obstacles.length
    + document.structures.landAreas.length
    + (document.structures.buoys?.length || 0)
    + (document.structures.pendilles?.length || 0)
  );
  $("#objectCount").textContent = (
    `${structures} structure${structures === 1 ? "" : "s"} · `
    + `${document.staticBoats.length} bateau${document.staticBoats.length === 1 ? "" : "x"} · `
    + `${document.berths.length} place${document.berths.length === 1 ? "" : "s"}`
  );
  $("#undoButton").disabled = editor.past.length === 0;
  $("#redoButton").disabled = editor.future.length === 0;
}

function scheduleAutosave() {
  $("#saveState").textContent = "Modification locale…";
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    try {
      if (!draftDatabase) draftDatabase = await openDraftDatabase();
      await putDraft(draftDatabase, editor.snapshot());
      $("#saveState").textContent = "Brouillon enregistré";
    } catch {
      $("#saveState").textContent = "Brouillon non disponible";
    }
  }, 450);
}

function afterEdit({ selectId = editor.selection, fit = false } = {}) {
  editor.select(selectId || null);
  renderObjects();
  scheduleAutosave();
  if (fit) fitDocument();
}

function setEditorDocument(document, { fit = true, autosave = true } = {}) {
  const compatible = clone(document);
  if (!Array.isArray(compatible.structures.buoys)) compatible.structures.buoys = [];
  if (!Array.isArray(compatible.structures.pendilles)) compatible.structures.pendilles = [];
  if (!Array.isArray(compatible.editor.pendilleGroups)) compatible.editor.pendilleGroups = [];
  editor = new EditorCore.PortEditor(compatible);
  syncMetadataForm();
  renderObjects();
  if (fit) fitDocument();
  if (autosave) scheduleAutosave();
}

function fitDocument() {
  if (!objectSource.getFeatures().length) {
    const origin = editor.document.georeference.origin;
    map.getView().setCenter(fromLonLat([origin.longitude, origin.latitude]));
    map.getView().setZoom(16);
    return;
  }
  map.getView().fit(objectSource.getExtent(), {
    padding: [80, 80, 80, 80],
    maxZoom: 20,
    duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280
  });
}

function setActiveTool(tool) {
  map.getView().cancelAnimations();
  activeTool = tool;
  $$("[data-tool]").forEach(button => button.classList.toggle("active", button.dataset.tool === tool));
  selectInteraction.setActive(tool === "select");
  translateInteraction.setActive(tool === "select");
  if (drawInteraction) {
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  }
  entryDraftSource.clear();
  renderEditHandles();
  if (tool === "obstacle" || tool === "land") {
    drawInteraction = new Draw({
      source: new VectorSource(),
      type: tool === "obstacle" ? "LineString" : "Polygon"
    });
    drawInteraction.on("drawend", event => {
      const geometry = event.feature.getGeometry();
      if (tool === "obstacle") {
        const object = {
          id: EditorCore.createId("obstacle", editor.document),
          type: "breakwater",
          points: geometry.getCoordinates().map(point => mapToLocal(point)),
          width: 4,
          height: 3,
          vertical: {
            datum: "waterline",
            mode: "fixed",
            baseZ: 0,
            topZ: 3,
            deckZ: 3
          }
        };
        editor.add("obstacles", object, "Ajouter une digue");
        afterEdit({ selectId: object.id });
      } else {
        const coordinates = geometry.getCoordinates()[0].slice(0, -1).map(point => mapToLocal(point));
        const object = {
          id: EditorCore.createId("land", editor.document),
          type: "land",
          points: coordinates
        };
        editor.add("landAreas", object, "Ajouter une zone non navigable");
        afterEdit({ selectId: object.id });
      }
      setActiveTool("select");
    });
    map.addInteraction(drawInteraction);
  } else if (tool === "entry") {
    let startCoordinate = null;
    const previewEntry = (currentCoordinate, { commit = false } = {}) => {
      if (!startCoordinate) return null;
      const start = mapToLocal(startCoordinate);
      const current = mapToLocal(currentCoordinate);
      const east = current.east - start.east;
      const north = current.north - start.north;
      const distance = Math.hypot(east, north);
      const heading = distance >= 1
        ? Math.atan2(north, east)
        : Math.PI / 2;
      const object = {
        id: "entry-main",
        name: "Entrée principale",
        position: start,
        heading
      };
      if (!commit) {
        entryDraftSource.clear();
        const feature = new Feature({
          geometry: new LineString(entryArrowMapCoordinates(object))
        });
        feature.setProperties({ objectId: object.id, collection: "entries", object });
        entryDraftSource.addFeature(feature);
      }
      return object;
    };
    drawInteraction = new PointerInteraction({
      handleDownEvent(event) {
        startCoordinate = [...event.coordinate];
        previewEntry(event.coordinate);
        return true;
      },
      handleDragEvent(event) {
        previewEntry(event.coordinate);
      },
      handleUpEvent(event) {
        const object = previewEntry(event.coordinate, { commit: true });
        entryDraftSource.clear();
        startCoordinate = null;
        if (!object) return false;
        const existing = editor.document.navigation.entries.find(item => item.id === object.id);
        if (existing) {
          editor.update(object.id, {
            position: object.position,
            heading: object.heading
          }, "Replacer l’entrée");
        } else {
          editor.add("entries", object, "Placer et orienter l’entrée");
        }
        afterEdit({ selectId: object.id });
        setActiveTool("select");
        return false;
      }
    });
    map.addInteraction(drawInteraction);
  }
}

function nearestRectangle(point, rectangles, maximumDistance = 30) {
  return rectangles
    .map(rectangle => ({ rectangle, ...EditorCore.distanceToRectangle(point, rectangle) }))
    .filter(candidate => candidate.distance <= maximumDistance)
    .sort((first, second) => first.distance - second.distance)[0] || null;
}

function nearestPolylineStation(point, points = []) {
  let best = null;
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const nearest = EditorCore.nearestPointOnSegment(point, first, second);
    const segmentLength = Math.hypot(second.east - first.east, second.north - first.north);
    const distance = Math.hypot(point.east - nearest.east, point.north - nearest.north);
    if (!best || distance < best.distance) {
      const tangent = segmentLength > 1e-9
        ? { east: (second.east - first.east) / segmentLength, north: (second.north - first.north) / segmentLength }
        : { east: 1, north: 0 };
      const cross = tangent.east * (point.north - nearest.north)
        - tangent.north * (point.east - nearest.east);
      best = {
        distance,
        station: traversed + nearest.t * segmentLength,
        waterSide: cross < 0 ? "right" : "left"
      };
    }
    traversed += segmentLength;
  }
  return best;
}

function addObjectAt(coordinate) {
  const point = mapToLocal(coordinate);
  if (activeTool === "pontoon" || activeTool === "catway") {
    const isCatway = activeTool === "catway";
    const parentCandidate = isCatway
      ? nearestRectangle(point, editor.document.structures.pontoons, 30)
      : null;
    let center = point;
    let heading = 0;
    let attachment = null;
    let parentId = null;
    let vertical = EditorCore.verticalWithDeck(0.5, 0.5);
    if (parentCandidate) {
      const parent = parentCandidate.rectangle;
      const sideSign = Math.sign(parentCandidate.local.transverse || 1);
      const longitudinal = clamp(
        parentCandidate.local.longitudinal,
        -parent.length / 2,
        parent.length / 2
      );
      const length = 10;
      const rootOverlap = 0.15;
      center = KJPCodec.localToWorld(parent, {
        longitudinal,
        transverse: sideSign * (parent.width / 2 + length / 2 - rootOverlap)
      });
      heading = parent.heading + sideSign * Math.PI / 2;
      parentId = parent.id;
      const parentVertical = EditorCore.resolvedVertical(parent);
      vertical = EditorCore.verticalWithDeck(parentVertical.deckZ, 0.5);
      attachment = {
        parentId,
        parentEdge: sideSign > 0 ? "port" : "starboard",
        station: longitudinal,
        rootOverlap,
        deckZ: vertical.deckZ,
        connector: "flush",
        connectorLength: 0
      };
    } else {
      center = EditorCore.snapPoint(point, editor.document, {
        tolerance: 1.2,
        heading: 0
      }).point;
    }
    const object = {
      id: EditorCore.createId(activeTool, editor.document),
      type: activeTool,
      center,
      length: isCatway ? 10 : 60,
      width: isCatway ? 0.6 : 2,
      heading,
      height: 0.5,
      vertical,
      ...(parentId ? { parentId, attachment } : {})
    };
    editor.add(activeTool === "pontoon" ? "pontoons" : "catways", object, `Ajouter ${activeTool}`);
    afterEdit({ selectId: object.id });
  } else if (activeTool === "cleat") {
    const parentFound = selectedObject();
    const quayParent = parentFound?.collection === "obstacles" && parentFound.object.type === "quay";
    if (!parentFound || (!quayParent && !["pontoons", "catways"].includes(parentFound.collection))) {
      showToast("Sélectionnez d’abord un ponton, un catway ou un quai.", "danger");
      return;
    }
    const parent = parentFound.object;
    let object;
    if (quayParent) {
      const nearest = nearestPolylineStation(point, parent.points);
      object = {
        id: EditorCore.createId("cleat", editor.document),
        parentId: parent.id,
        attachment: {
          kind: "polyline-station",
          station: nearest.station,
          waterSide: nearest.waterSide
        },
        z: EditorCore.resolvedVertical(parent, "fixed").deckZ,
        orientation: nearest.waterSide === "right" ? -Math.PI / 2 : Math.PI / 2
      };
    } else {
      const local = KJPCodec.worldToLocal(parent, point);
      local.longitudinal = clamp(local.longitudinal, -parent.length / 2, parent.length / 2);
      local.transverse = Math.sign(local.transverse || 1) * parent.width / 2;
      object = {
        id: EditorCore.createId("cleat", editor.document),
        parentId: parent.id,
        localPosition: local,
        z: EditorCore.resolvedVertical(parent).deckZ,
        orientation: local.transverse > 0 ? Math.PI / 2 : -Math.PI / 2
      };
    }
    editor.add("cleats", object, "Ajouter un taquet");
    afterEdit({ selectId: object.id });
  } else if (activeTool === "pendille") {
    const parentFound = selectedObject();
    const quayParent = parentFound?.collection === "obstacles" && parentFound.object.type === "quay";
    if (!parentFound || (!quayParent && parentFound.collection !== "pontoons")) {
      showToast("Sélectionnez d’abord un ponton ou un quai, puis cliquez dans l’eau sur le corps-mort.", "danger");
      return;
    }
    const parent = parentFound.object;
    let attachment;
    let anchorDistance;
    if (quayParent) {
      const nearest = nearestPolylineStation(point, parent.points);
      attachment = {
        kind: "polyline-station",
        station: nearest.station,
        waterSide: nearest.waterSide,
        z: EditorCore.resolvedVertical(parent, "fixed").deckZ
      };
      anchorDistance = Math.max(3, nearest.distance - parent.width / 2);
    } else {
      const local = KJPCodec.worldToLocal(parent, point);
      const sideSign = Math.sign(local.transverse || 1);
      attachment = {
        kind: "rectangle-edge",
        edge: sideSign > 0 ? "port" : "starboard",
        station: clamp(local.longitudinal, -parent.length / 2, parent.length / 2),
        waterSide: sideSign > 0 ? "left" : "right",
        z: EditorCore.resolvedVertical(parent).deckZ
      };
      anchorDistance = Math.max(3, Math.abs(local.transverse) - parent.width / 2);
    }
    const depth = 3;
    const object = {
      id: EditorCore.createId("pendille", editor.document),
      berthId: "",
      connectionEnd: "bow",
      parentId: parent.id,
      attachment,
      anchor: { along: 0, normalDistance: anchorDistance, depth },
      line: {
        maximumLength: Math.min(200, Math.hypot(anchorDistance, depth + attachment.z) + 2),
        workingLoadN: 12000,
        workingStrain: 0.15,
        dampingRatio: 0.35
      }
    };
    editor.add("pendilles", object, "Ajouter une pendille");
    afterEdit({ selectId: object.id });
    setActiveTool("select");
  } else if (activeTool === "buoy") {
    const object = {
      id: EditorCore.createId("buoy", editor.document),
      type: "buoy",
      position: point,
      radius: 0.45,
      height: 1.45,
      seamarkType: "buoy_lateral",
      category: "port",
      shape: "can",
      colours: ["red"],
      collision: true
    };
    editor.add("buoys", object, "Ajouter une bouée");
    afterEdit({ selectId: object.id });
  } else if (activeTool === "visitor") {
    const nearest = nearestRectangle(point, editor.document.structures.catways, 35);
    if (!nearest) {
      showToast("Placez la place visiteurs contre un catway.", "danger");
      return;
    }
    const catway = nearest.rectangle;
    const sideSign = Math.sign(nearest.local.transverse || 1);
    const width = 4;
    const center = KJPCodec.localToWorld(catway, {
      longitudinal: clamp(nearest.local.longitudinal, -catway.length / 3, catway.length / 3),
      transverse: sideSign * (catway.width / 2 + width / 2)
    });
    const object = {
      id: EditorCore.createId("berth", editor.document),
      parentId: catway.id,
      side: sideSign > 0 ? "port" : "starboard",
      name: `Visiteurs ${editor.document.berths.filter(item => item.isVisitor).length + 1}`,
      center,
      heading: catway.heading,
      length: Math.max(5, catway.length - 0.8),
      width,
      maxLength: Math.max(5, catway.length - 0.8),
      maxBeam: width - 0.55,
      isVisitor: true
    };
    editor.add("berths", object, "Ajouter une place visiteurs");
    afterEdit({ selectId: object.id });
  } else if (activeTool === "boat") {
    const berth = editor.document.berths
      .map(item => ({ item, distance: Math.hypot(point.east - item.center.east, point.north - item.center.north) }))
      .sort((first, second) => first.distance - second.distance)[0]?.item;
    if (!berth) {
      showToast("Calculez d’abord les places : un bateau doit longer un catway.", "danger");
      return;
    }
    const fitted = EditorCore.fitBoatToBerth(editor.document, berth, () => 0.5);
    const object = {
      id: EditorCore.createId("boat", editor.document),
      berthId: berth.id,
      center: fitted.center,
      heading: berth.heading,
      length: fitted.length,
      beam: fitted.beam,
      vesselType: "sailboat"
    };
    const rectangle = { center: object.center, length: object.length, width: object.beam, heading: object.heading };
    const overlaps = editor.document.staticBoats.some(boat => EditorCore.rectanglesOverlap(
      rectangle,
      { center: boat.center, length: boat.length, width: boat.beam, heading: boat.heading },
      0.15
    ));
    if (overlaps) {
      showToast("Cette place est déjà occupée.", "danger");
      return;
    }
    editor.add("staticBoats", object, "Ajouter un bateau");
    afterEdit({ selectId: object.id });
  }
  if (!["select", "cleat"].includes(activeTool)) {
    const createdSelection = editor.selection;
    setActiveTool("select");
    if (createdSelection) {
      queueMicrotask(() => {
        editor.select(createdSelection);
        objectLayer.changed();
        updateInspector();
      });
    }
  }
}

map.on("singleclick", event => {
  if (activeTool === "select" && !$("#candidateDrawer").hidden) {
    const feature = map.forEachFeatureAtPixel(
      event.pixel,
      item => item,
      {
        hitTolerance: 10,
        layerFilter: layer => layer === candidateLayer
      }
    );
    if (feature) {
      focusCandidate(Number(feature.get("candidateIndex")), { scroll: true });
      return;
    }
  }
  if (!["select", "obstacle", "land"].includes(activeTool)) addObjectAt(event.coordinate);
});

map.on("pointermove", event => {
  const point = mapToLocal(event.coordinate);
  $("#cursorPosition").textContent = `Est ${format(point.east)} m · Nord ${format(point.north)} m`;
});

selectInteraction.on("select", event => {
  const feature = event.selected[0];
  editor.select(feature?.get("objectId") || null);
  const editableLine = ["entries", "pendilles"].includes(feature?.get("collection"));
  modifyInteraction.setActive(editableLine);
  translateInteraction.setActive(activeTool === "select" && feature?.get("collection") !== "pendilles");
  objectLayer.changed();
  updateInspector();
  renderEditHandles();
  if (!feature) $("#selectionMetrics").hidden = true;
});

translateInteraction.on("translateend", event => {
  const feature = event.features.item(0);
  const id = feature?.get("objectId");
  const found = id && EditorCore.findObject(editor.document, id);
  if (!found) return;
  if (found.collection === "catways" && found.object.groupId) {
    renderObjects();
    editor.select(id);
    updateInspector();
    showToast("Ce catway appartient à une série : modifiez la série ou détachez-le.", "danger", 3300);
    return;
  }
  const geometry = feature.getGeometry();
  let patch = {};
  if (found.collection === "entries" && geometry instanceof LineString) {
    const coordinates = geometry.getCoordinates();
    const start = mapToLocal(coordinates[0]);
    const end = mapToLocal(coordinates[coordinates.length - 1]);
    patch.position = start;
    patch.heading = Math.atan2(end.north - start.north, end.east - start.east);
  } else if (geometry instanceof Point) {
    const point = mapToLocal(geometry.getCoordinates());
    if (found.collection === "entries" || found.collection === "buoys") patch.position = point;
    else if (found.collection === "cleats") {
      const parent = [
        ...editor.document.structures.pontoons,
        ...editor.document.structures.catways
      ].find(item => item.id === found.object.parentId);
      if (parent) patch.localPosition = KJPCodec.worldToLocal(parent, point);
    } else patch.center = point;
  } else if (found.collection === "obstacles") {
    patch.points = geometry.getCoordinates().map(point => mapToLocal(point));
  } else if (found.collection === "landAreas") {
    patch.points = geometry.getCoordinates()[0].slice(0, -1).map(point => mapToLocal(point));
  } else {
    patch.center = mapToLocal(getCenter(geometry.getExtent()));
  }
  if (found.collection === "catways" && found.object.attachment && patch.center) {
    const parent = editor.document.structures.pontoons.find(item => (
      item.id === found.object.attachment.parentId
    ));
    if (parent) {
      const local = KJPCodec.worldToLocal(parent, patch.center);
      const sideSign = found.object.attachment.parentEdge === "starboard" ? -1 : 1;
      const station = clamp(local.longitudinal, -parent.length / 2, parent.length / 2);
      const rootOverlap = found.object.attachment.rootOverlap;
      patch.center = KJPCodec.localToWorld(parent, {
        longitudinal: station,
        transverse: sideSign * (
          parent.width / 2 + found.object.length / 2 - rootOverlap
        )
      });
      patch.heading = parent.heading + sideSign * Math.PI / 2;
      patch.vertical = EditorCore.verticalWithDeck(
        EditorCore.resolvedVertical(parent).deckZ,
        found.object.height
      );
      patch.attachment = {
        ...found.object.attachment,
        station,
        deckZ: patch.vertical.deckZ
      };
    }
  }
  editor.update(id, patch, "Déplacer");
  afterEdit({ selectId: id });
});

modifyInteraction.on("modifyend", event => {
  const feature = event.features.item(0);
  const id = feature?.get("objectId");
  const found = id && EditorCore.findObject(editor.document, id);
  const geometry = feature?.getGeometry();
  if (!found || !(geometry instanceof LineString)) return;
  const coordinates = geometry.getCoordinates();
  if (found.collection === "pendilles") {
    const parent = editor.document.structures.pontoons.find(item => item.id === found.object.parentId)
      || editor.document.structures.obstacles.find(item => item.id === found.object.parentId);
    if (!parent) return;
    const pickup = mapToLocal(coordinates[0]);
    const anchorPoint = mapToLocal(coordinates[coordinates.length - 1]);
    let attachment;
    let tangent;
    let normal;
    if (parent.type === "quay") {
      const nearest = nearestPolylineStation(pickup, parent.points);
      attachment = {
        ...found.object.attachment,
        station: nearest.station,
        waterSide: nearest.waterSide
      };
      const stationGeometry = EditorCore.pendilleStationGeometry(parent, nearest.station, nearest.waterSide);
      tangent = stationGeometry.tangent;
      normal = stationGeometry.normal;
    } else {
      const local = KJPCodec.worldToLocal(parent, pickup);
      const sideSign = Math.sign(local.transverse || 1);
      const station = clamp(local.longitudinal, -parent.length / 2, parent.length / 2);
      const waterSide = sideSign > 0 ? "left" : "right";
      attachment = {
        ...found.object.attachment,
        edge: sideSign > 0 ? "port" : "starboard",
        station,
        waterSide
      };
      const stationGeometry = EditorCore.pendilleStationGeometry(parent, station, waterSide);
      tangent = stationGeometry.tangent;
      normal = stationGeometry.normal;
    }
    const resolvedPickup = EditorCore.pendilleStationGeometry(
      parent,
      attachment.station,
      attachment.waterSide
    ).pickup;
    const delta = {
      east: anchorPoint.east - resolvedPickup.east,
      north: anchorPoint.north - resolvedPickup.north
    };
    const along = delta.east * tangent.east + delta.north * tangent.north;
    const normalDistance = Math.max(1, delta.east * normal.east + delta.north * normal.north);
    editor.update(found.object.id, {
      attachment,
      anchor: { ...found.object.anchor, along, normalDistance },
      line: {
        ...found.object.line,
        maximumLength: Math.max(
          found.object.line.maximumLength,
          Math.hypot(along, normalDistance, found.object.anchor.depth + attachment.z) + 0.5
        )
      }
    }, "Déplacer la pendille");
    afterEdit({ selectId: found.object.id });
    return;
  }
  if (found.collection !== "entries") return;
  const start = mapToLocal(coordinates[0]);
  const end = mapToLocal(coordinates[coordinates.length - 1]);
  const distance = Math.hypot(end.east - start.east, end.north - start.north);
  if (distance < 1) {
    renderObjects();
    showToast("La flèche doit indiquer une direction lisible.", "danger");
    return;
  }
  editor.update(id, {
    position: start,
    heading: Math.atan2(end.north - start.north, end.east - start.east)
  }, "Orienter l’entrée");
  afterEdit({ selectId: id });
});

function applyInspectorChange(input) {
  const found = selectedObject();
  if (!found) return;
  const value = Number(input.value);
  if (!Number.isFinite(value)) return;
  const object = found.object;
  if (found.collection === "catways" && object.groupId) {
    updateInspector();
    showToast("Choisissez « Modifier la série » ou « Détacher ce catway ».", "danger", 3000);
    return;
  }
  const property = input.dataset.property;
  let patch = {};
  if (property === "headingDeg") {
    const rawHeading = found.collection === "entries"
      ? internalHeadingRadians(value)
      : value * Math.PI / 180;
    if (found.collection === "entries") {
      patch.heading = rawHeading;
      editor.update(object.id, patch, "Modifier le cap d’entrée");
      afterEdit({ selectId: object.id });
      return;
    }
    const candidates = [Math.round(value / 15) * Math.PI / 12];
    if (found.collection === "catways") {
      for (const pontoon of editor.document.structures.pontoons) {
        candidates.push(pontoon.heading + Math.PI / 2, pontoon.heading - Math.PI / 2);
      }
    }
    const nearestHeading = candidates
      .map(heading => ({
        heading,
        difference: Math.abs(Math.atan2(
          Math.sin(heading - rawHeading),
          Math.cos(heading - rawHeading)
        ))
      }))
      .sort((first, second) => first.difference - second.difference)[0];
    patch.heading = nearestHeading.difference <= 3 * Math.PI / 180
      ? nearestHeading.heading
      : rawHeading;
  }
  else if (property === "verticalLevel") {
    const current = EditorCore.resolvedVertical(
      object,
      found.collection === "obstacles" ? "fixed" : "floating"
    );
    const thickness = Math.max(0.05, Number(object.height) || current.topZ - current.baseZ);
    if (["pontoons", "catways"].includes(found.collection)) {
      patch.vertical = EditorCore.verticalWithDeck(value, thickness);
      patch.height = thickness;
      if (found.collection === "catways" && object.attachment) {
        const parent = editor.document.structures.pontoons.find(
          item => item.id === (object.parentId || object.attachment.parentId)
        );
        const parentDeck = parent ? EditorCore.resolvedVertical(parent).deckZ : value;
        const deckGap = Math.abs(parentDeck - value);
        patch.attachment = {
          ...object.attachment,
          deckZ: value,
          // Ne jamais inventer une rampe à partir de la seule différence de
          // niveau. Une rampe doit rester une décision explicite de l'auteur.
          connector: deckGap <= 0.08 ? "flush" : "hinge",
          connectorLength: 0
        };
      }
    } else {
      patch.vertical = {
        datum: "waterline",
        mode: "fixed",
        baseZ: value,
        topZ: value + thickness,
        deckZ: value + thickness
      };
      patch.height = thickness;
    }
  }
  else if (property === "height" && ["pontoons", "catways", "obstacles"].includes(found.collection)) {
    const thickness = Math.max(0.05, value);
    const current = EditorCore.resolvedVertical(
      object,
      found.collection === "obstacles" ? "fixed" : "floating"
    );
    patch.height = thickness;
    patch.vertical = current.mode === "floating"
      ? EditorCore.verticalWithDeck(current.deckZ, thickness)
      : {
        datum: "waterline",
        mode: "fixed",
        baseZ: current.baseZ,
        topZ: current.baseZ + thickness,
        deckZ: current.baseZ + thickness
      };
  }
  else if (property === "width" && found.collection === "staticBoats") patch.beam = Math.max(0.4, value);
  else if (property === "width" && found.collection === "buoys") patch.radius = Math.max(0.1, value / 2);
  else if (["east", "north"].includes(property)) {
    const key = ["entries", "buoys"].includes(found.collection) ? "position" : "center";
    patch[key] = { ...object[key], [property]: value };
  } else patch[property] = value;
  if (
    found.collection === "catways"
    && object.attachment
    && ["length", "headingDeg"].includes(property)
  ) {
    const parent = editor.document.structures.pontoons.find(
      item => item.id === (object.parentId || object.attachment.parentId)
    );
    if (parent) {
      patch = EditorCore.attachCatwayToPontoon(
        { ...object, ...patch },
        parent,
        {
          parentEdge: object.attachment.parentEdge,
          station: object.attachment.station,
          rootOverlap: object.attachment.rootOverlap,
          connector: object.attachment.connector,
          connectorLength: object.attachment.connectorLength
        }
      );
    }
  }
  editor.update(object.id, patch, "Modifier les dimensions");
  afterEdit({ selectId: object.id });
}

$$("[data-property]", $("#objectInspector")).forEach(input => {
  input.addEventListener("change", () => applyInspectorChange(input));
});

$("#visitorToggle").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "berths") return;
  editor.update(found.object.id, { isVisitor: event.target.checked }, "Statut visiteurs");
  afterEdit({ selectId: found.object.id });
});
$("#visitorName").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "berths") return;
  editor.update(found.object.id, { name: event.target.value.trim() }, "Nom de la place");
  afterEdit({ selectId: found.object.id });
});

$("#buoySeamarkType").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "buoys") return;
  const category = configureBuoyCategorySelect(event.target.value, "");
  const appearance = KJPCodec.recommendedBuoyAppearance(event.target.value, category);
  editor.transaction("Modifier le type de bouée", next => {
    const buoy = next.structures.buoys.find(item => item.id === found.object.id);
    if (!buoy) return;
    Object.assign(buoy, {
      seamarkType: event.target.value,
      category,
      shape: appearance.shape,
      colours: appearance.colours
    });
    next.structures.cleats = next.structures.cleats.filter(
      cleat => cleat.parentId !== buoy.id
    );
    if (buoy.seamarkType === "mooring") {
      next.structures.cleats.push(EditorCore.cleatForMooringBuoy(next, buoy));
    }
  });
  afterEdit({ selectId: found.object.id });
});

$("#buoyCategory").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "buoys") return;
  const appearance = KJPCodec.recommendedBuoyAppearance(
    found.object.seamarkType,
    event.target.value
  );
  editor.update(found.object.id, {
    category: event.target.value,
    shape: appearance.shape,
    colours: appearance.colours
  }, "Modifier la catégorie de bouée");
  afterEdit({ selectId: found.object.id });
});

$("#buoyShape").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "buoys") return;
  editor.update(found.object.id, { shape: event.target.value }, "Modifier la forme de bouée");
  afterEdit({ selectId: found.object.id });
});

function updateSelectedPendille(patch, label) {
  const found = selectedObject();
  if (found?.collection !== "pendilles") return;
  editor.update(found.object.id, patch, label);
  afterEdit({ selectId: found.object.id });
}

$("#pendilleAnchorDistance").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "pendilles") return;
  updateSelectedPendille({
    anchor: {
      ...found.object.anchor,
      normalDistance: clamp(Number(event.target.value), 3, 180)
    }
  }, "Modifier le corps-mort");
});
$("#pendilleDepth").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "pendilles") return;
  updateSelectedPendille({
    anchor: {
      ...found.object.anchor,
      depth: clamp(Number(event.target.value), 0.2, 100)
    }
  }, "Modifier la profondeur");
});
$("#pendilleMaximumLength").addEventListener("change", event => {
  const found = selectedObject();
  if (found?.collection !== "pendilles") return;
  updateSelectedPendille({
    line: {
      ...found.object.line,
      maximumLength: clamp(Number(event.target.value), 1, 200)
    }
  }, "Modifier la longueur de pendille");
});
$("#detachPendilleButton").addEventListener("click", () => {
  const found = selectedObject();
  if (found?.collection !== "pendilles") return;
  editor.detachPendille(found.object.id);
  afterEdit({ selectId: found.object.id });
  showToast("Pendille détachée : elle peut maintenant être réglée seule.", "ok");
});

function selectedPontoon() {
  const found = selectedObject();
  return found?.collection === "pontoons" ? found.object : null;
}

function syncCatwayModeFields() {
  const spacingMode = $("#catwayMode").value === "spacing";
  $("#catwayCountField").hidden = spacingMode;
  $("#catwayCount").disabled = spacingMode;
  $("#catwaySpacingField").hidden = !spacingMode;
  $("#catwaySpacing").disabled = !spacingMode;
}

$("#catwayMode").addEventListener("change", syncCatwayModeFields);

function syncPendilleModeFields() {
  const spacingMode = $("#pendilleMode").value === "spacing";
  $("#pendilleCountField").hidden = spacingMode;
  $("#pendilleCount").disabled = spacingMode;
  $("#pendilleSpacingField").hidden = !spacingMode;
  $("#pendilleSpacing").disabled = !spacingMode;
}

$("#pendilleMode").addEventListener("change", syncPendilleModeFields);

function pendilleParameters() {
  return {
    mode: $("#pendilleMode").value,
    count: Number($("#pendilleCount").value),
    spacing: Number($("#pendilleSpacing").value),
    waterSide: $("#pendilleWaterSide").value,
    marginStart: Number($("#pendilleMarginStart").value),
    marginEnd: Number($("#pendilleMarginEnd").value),
    berthWidth: Number($("#pendilleBerthWidth").value),
    berthLength: Number($("#pendilleBerthLength").value),
    anchorDistance: Number($("#pendilleGroupAnchorDistance").value),
    depth: Number($("#pendilleGroupDepth").value),
    populateBoats: true
  };
}

$("#createPendilleSeries").addEventListener("click", () => {
  const found = selectedObject();
  const validParent = found?.collection === "pontoons"
    || (found?.collection === "obstacles" && found.object.type === "quay");
  if (!validParent) {
    showToast("Sélectionnez un ponton ou un quai avant de créer les places.", "danger");
    return;
  }
  editor.addPendilleGroup(found.object.id, pendilleParameters());
  afterEdit({ selectId: found.object.id });
  showToast("Places cul au quai, pendilles et taquets créés.", "ok");
});

function catwayParameters() {
  return {
    mode: $("#catwayMode").value,
    count: Number($("#catwayCount").value),
    spacing: Number($("#catwaySpacing").value),
    side: $("#catwaySide").value,
    marginStart: Number($("#catwayMarginStart").value),
    marginEnd: Number($("#catwayMarginEnd").value),
    length: Number($("#catwayLength").value),
    width: Number($("#catwayWidth").value),
    height: 0.5,
    rootOverlap: 0.15,
    cleats: true
  };
}

$("#createCatwaySeries").addEventListener("click", () => {
  const pontoon = selectedPontoon();
  if (!pontoon) {
    showToast("Sélectionnez un ponton avant de créer la série.", "danger");
    return;
  }
  editor.addCatwayGroup(pontoon.id, catwayParameters());
  afterEdit();
  showToast("Série créée et six taquets ajoutés par catway.", "ok");
});

$("#editSeriesButton").addEventListener("click", () => {
  const found = selectedObject();
  if (found?.collection !== "catways" || !found.object.groupId) return;
  editor.updateGroup(found.object.groupId, catwayParameters());
  afterEdit();
  showToast("Toute la série a été redistribuée.", "ok");
});

$("#detachCatwayButton").addEventListener("click", () => {
  const found = selectedObject();
  if (found?.collection !== "catways") return;
  editor.detachCatway(found.object.id);
  afterEdit({ selectId: found.object.id });
  showToast("Catway détaché : il peut maintenant être modifié seul.", "ok");
});

$("#generateCleatsButton").addEventListener("click", () => {
  const found = selectedObject();
  if (!found || !["pontoons", "catways"].includes(found.collection)) return;
  const mode = $("#cleatGenerationMode").value;
  const value = Math.max(1, Number($("#cleatGenerationValue").value));
  const options = mode === "spacing"
    ? { mode, spacing: value }
    : { mode, countPerSide: Math.round(value) };
  editor.generateCleats(found.object.id, options);
  afterEdit({ selectId: found.object.id });
  const count = editor.document.structures.cleats.filter(
    cleat => cleat.parentId === found.object.id
  ).length;
  showToast(`${count} taquets liés à la structure.`, "ok");
});

$("#computeBerthsButton").addEventListener("click", () => {
  const width = clamp(Number($("#berthWidth").value), 2.8, 20);
  $("#berthWidth").value = width.toFixed(1);
  editor.recomputeBerths({ defaultWidth: width });
  afterEdit();
  showToast(
    `${editor.document.berths.length} places de ${format(width)} m déduites des catways.`,
    "ok"
  );
});

$("#populateBoatsButton").addEventListener("click", () => {
  if (!editor.document.berths.length) {
    editor.recomputeBerths({
      defaultWidth: clamp(Number($("#berthWidth").value), 2.8, 20)
    });
  }
  editor.populateBoats({
    occupancyRate: Number($("#occupancyRate").value) / 100,
    seed: editor.document.editor.occupancySeed
  });
  afterEdit();
  showToast(`${editor.document.staticBoats.length} bateaux placés sans chevauchement.`, "ok");
});

$("#occupancyRate").addEventListener("input", event => {
  $("#occupancyValue").textContent = `${event.target.value} %`;
});

function removeSelected() {
  if (!editor.selection) return;
  editor.remove(editor.selection);
  afterEdit({ selectId: null });
  $("#selectionMetrics").hidden = true;
}

function duplicateSelected() {
  if (!editor.selection) return;
  const previous = new Set([
    ...editor.document.structures.pontoons,
    ...editor.document.structures.catways,
    ...editor.document.structures.obstacles,
    ...editor.document.structures.landAreas,
    ...(editor.document.structures.buoys || []),
    ...editor.document.staticBoats,
    ...editor.document.berths
  ].map(item => item.id));
  editor.duplicate(editor.selection);
  const next = [
    ...editor.document.structures.pontoons,
    ...editor.document.structures.catways,
    ...editor.document.structures.obstacles,
    ...editor.document.structures.landAreas,
    ...(editor.document.structures.buoys || []),
    ...editor.document.staticBoats,
    ...editor.document.berths
  ].find(item => !previous.has(item.id));
  afterEdit({ selectId: next?.id || editor.selection });
}

$("#deleteButton").addEventListener("click", removeSelected);
$("#duplicateButton").addEventListener("click", duplicateSelected);
$("#undoButton").addEventListener("click", () => {
  editor.undo();
  afterEdit({ selectId: null });
});
$("#redoButton").addEventListener("click", () => {
  editor.redo();
  afterEdit({ selectId: null });
});
$$("[data-tool]").forEach(button => button.addEventListener("click", () => setActiveTool(button.dataset.tool)));

function enableMaps() {
  if (!mapsEnabled) {
    mapsEnabled = true;
    $("#enableMapsButton").textContent = "Cartes en ligne actives";
    $("#enableMapsButton").disabled = true;
  }
  osmLayer.setVisible($("#osmLayerToggle").checked);
  seamarkLayer.setVisible($("#seamarkLayerToggle").checked);
  orthoLayer.setVisible($("#orthoLayerToggle").checked);
  return true;
}

$("#enableMapsButton").addEventListener("click", enableMaps);
$("#osmLayerToggle").addEventListener("change", event => {
  if (mapsEnabled) osmLayer.setVisible(event.target.checked);
});
$("#seamarkLayerToggle").addEventListener("change", event => {
  if (mapsEnabled) seamarkLayer.setVisible(event.target.checked);
});
$("#orthoLayerToggle").addEventListener("change", event => {
  if (mapsEnabled) orthoLayer.setVisible(event.target.checked);
  if (event.target.checked) ensureOrthophotoSourceReference();
});
$("#orthoOpacity").addEventListener("input", event => {
  const opacity = Number(event.target.value) / 100;
  orthoLayer.setOpacity(opacity);
  $("#orthoOpacityValue").textContent = `${event.target.value} %`;
});

function setOrigin(latitude, longitude) {
  if (![latitude, longitude].every(Number.isFinite)) throw new Error("Coordonnées invalides.");
  if (!documentHasGeometry(editor.document)) {
    editor.transaction("Changer l’origine", next => {
      next.georeference.origin = { latitude, longitude };
      next.metadata.coordinates = { latitude, longitude };
    });
    afterEdit({ selectId: null });
  }
  map.getView().setCenter(fromLonLat([longitude, latitude]));
  map.getView().setZoom(17);
  $("#latitudeInput").value = latitude.toFixed(6);
  $("#longitudeInput").value = longitude.toFixed(6);
}

$("#coordinateForm").addEventListener("submit", event => {
  event.preventDefault();
  enableMaps();
  try {
    setOrigin(Number($("#latitudeInput").value), Number($("#longitudeInput").value));
  } catch (error) {
    showToast(error.message, "danger");
  }
});

$("#searchForm").addEventListener("submit", async event => {
  event.preventDefault();
  const query = $("#placeSearch").value.trim();
  if (!query) return;
  enableMaps();
  $("#searchForm button").disabled = true;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetchTracked(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`recherche indisponible (${response.status})`);
    const result = (await response.json())[0];
    if (!result) throw new Error("lieu non trouvé");
    setOrigin(Number(result.lat), Number(result.lon));
    showToast(result.display_name || query, "ok");
  } catch (error) {
    showToast(`Recherche impossible · ${error.message}`, "danger", 3200);
  } finally {
    $("#searchForm button").disabled = false;
  }
});

function visibleGeographicBounds() {
  const size = map.getSize();
  const extent = map.getView().calculateExtent(size);
  const geographic = transformExtent(extent, "EPSG:3857", "EPSG:4326");
  return {
    west: geographic[0],
    south: geographic[1],
    east: geographic[2],
    north: geographic[3]
  };
}

function clearAnalysisPolygon() {
  if (analysisDrawInteraction) {
    map.removeInteraction(analysisDrawInteraction);
    analysisDrawInteraction = null;
  }
  analysisPolygonGeographic = null;
  analysisSource.clear();
  $("#drawAnalysisPolygon").textContent = "Tracer l’emprise";
  $("#drawAnalysisPolygon").setAttribute("aria-pressed", "false");
  $("#clearAnalysisPolygon").disabled = true;
  $("#analysisScopeStatus").textContent = "Emprise visible de la carte";
}

function beginAnalysisPolygon() {
  if (analysisDrawInteraction) {
    map.removeInteraction(analysisDrawInteraction);
    analysisDrawInteraction = null;
    $("#drawAnalysisPolygon").textContent = "Tracer l’emprise";
    $("#drawAnalysisPolygon").setAttribute("aria-pressed", "false");
    return;
  }
  setActiveTool("select");
  analysisSource.clear();
  analysisPolygonGeographic = null;
  analysisDrawInteraction = new Draw({
    source: analysisSource,
    type: "Polygon"
  });
  analysisDrawInteraction.on("drawend", event => {
    const ring = event.feature.getGeometry().getCoordinates()[0].slice(0, -1);
    analysisPolygonGeographic = ring.map(coordinate => {
      const [longitude, latitude] = toLonLat(coordinate);
      return { latitude, longitude };
    });
    map.removeInteraction(analysisDrawInteraction);
    analysisDrawInteraction = null;
    $("#drawAnalysisPolygon").textContent = "Redessiner l’emprise";
    $("#drawAnalysisPolygon").setAttribute("aria-pressed", "false");
    $("#clearAnalysisPolygon").disabled = false;
    $("#analysisScopeStatus").textContent = (
      `Polygone actif · ${analysisPolygonGeographic.length} sommets`
    );
  });
  map.addInteraction(analysisDrawInteraction);
  $("#drawAnalysisPolygon").textContent = "Annuler le tracé";
  $("#drawAnalysisPolygon").setAttribute("aria-pressed", "true");
  $("#analysisScopeStatus").textContent = "Cliquez autour de la zone, puis double-cliquez pour terminer";
}

function activeAnalysisScope() {
  if (!analysisPolygonGeographic) {
    return { bounds: visibleGeographicBounds(), polygon: null };
  }
  return {
    bounds: OSMPortImport.boundsForAnalysisPolygon(analysisPolygonGeographic),
    polygon: clone(analysisPolygonGeographic)
  };
}

$("#drawAnalysisPolygon").addEventListener("click", beginAnalysisPolygon);
$("#clearAnalysisPolygon").addEventListener("click", clearAnalysisPolygon);

function candidateCategory(candidate) {
  return candidate.candidateType === "coastline"
    ? "obstacle"
    : candidate.candidateType;
}

function focusCandidate(index, { scroll = false } = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= candidates.length) return false;
  focusedCandidateIndex = index;
  candidateLayer.changed();
  for (const row of $$("#candidateList [data-candidate-row-index]")) {
    row.classList.toggle("focused", Number(row.dataset.candidateRowIndex) === index);
  }
  const row = $(`#candidateList [data-candidate-row-index="${index}"]`);
  if (row && scroll) row.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

function updateCandidateBulkControls() {
  const selected = candidates.filter(candidate => candidate.accepted).length;
  $("#candidateSelectionCount").textContent = `${selected} / ${candidates.length} sélectionné${selected > 1 ? "s" : ""}`;
  for (const button of $$("[data-candidate-category]")) {
    const category = button.dataset.candidateCategory;
    const count = candidates.filter(candidate => candidateCategory(candidate) === category).length;
    const label = {
      pontoon: "Pontons",
      catway: "Catways",
      obstacle: "Digues / quais",
      land: "Terre",
      buoy: "Bouées"
    }[category];
    button.textContent = `${label} (${count})`;
    button.disabled = count === 0;
    const categoryCandidates = candidates.filter(candidate => (
      candidateCategory(candidate) === category
    ));
    button.setAttribute(
      "aria-pressed",
      String(categoryCandidates.length > 0 && categoryCandidates.every(candidate => candidate.accepted))
    );
  }
}

function setCandidateDrawerOpen(open) {
  $("#candidateDrawer").hidden = !open;
  $(".app-shell").classList.toggle("candidates-open", open);
  setTimeout(() => map.updateSize(), 0);
}

function setCandidateSelection(predicate, accepted) {
  for (const candidate of candidates) {
    if (predicate(candidate)) candidate.accepted = accepted;
  }
  for (const checkbox of $$("#candidateList input[data-candidate-index]")) {
    checkbox.checked = Boolean(candidates[Number(checkbox.dataset.candidateIndex)]?.accepted);
  }
  candidateLayer.changed();
  updateCandidateBulkControls();
}

function clearDecompositionPreview() {
  decompositionProposal = null;
  decompositionSource.clear();
  $("#decompositionPreview").hidden = true;
}

function renderDecompositionPreview(proposal) {
  decompositionSource.clear();
  for (const [collection, items] of [
    ["pontoon", proposal.objects.pontoons],
    ["catway", proposal.objects.catways]
  ]) {
    for (const item of items) {
      const feature = new Feature({
        geometry: new Polygon([rectangleMapCoordinates(item)])
      });
      feature.set("decompositionType", collection);
      decompositionSource.addFeature(feature);
    }
  }
  decompositionProposal = proposal;
  $("#decompositionSummary").textContent = (
    `${proposal.objects.pontoons.length} ponton · `
    + `${proposal.objects.catways.length} catway${proposal.objects.catways.length > 1 ? "s" : ""}`
  );
  $("#decompositionDetails").textContent = (
    `${proposal.reason} Continuité maximale : ${format(proposal.maximumGap * 100, 1)} cm.`
  );
  $("#decompositionPreview").hidden = false;
  const extent = decompositionSource.getExtent();
  if (extent.every(Number.isFinite)) {
    map.getView().fit(extent, {
      padding: [80, 430, 80, 80],
      maxZoom: 20,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260
    });
  }
}

function proposeCandidateDecomposition(index) {
  const proposal = PontoonDecomposition.proposePontoonDecomposition(candidates, index);
  if (!proposal.available) {
    showToast(proposal.reason, "danger", 3400);
    return;
  }
  if (!proposal.continuityValid) {
    showToast("Découpe refusée : une discontinuité géométrique subsiste.", "danger", 3800);
    return;
  }
  focusCandidate(index, { scroll: false });
  renderDecompositionPreview(proposal);
}

function applyDecompositionProposal() {
  const proposal = decompositionProposal;
  if (!proposal?.available || !proposal.continuityValid) return;
  const next = editor.snapshot();
  const sourceCandidates = proposal.candidateIndices.map(index => candidates[index]).filter(Boolean);
  const sourceIds = sourceCandidates.map(candidate => candidate.sourceLabel).join(",");
  const created = [];
  const source = {
    provider: "OpenStreetMap / OpenSeaMap",
    type: "decomposition",
    id: sourceIds,
    osmElementIds: sourceCandidates.map(candidate => (
      `${candidate.osm.type}/${candidate.osm.id}`
    )),
    method: proposal.diagnostics.method
  };
  const createdPontoons = proposal.objects.pontoons.map(item => {
    const height = Math.max(0.05, item.height || 0.5);
    const object = {
      id: EditorCore.createId("pontoon", next),
      type: "pontoon",
      center: clone(item.center),
      length: item.length,
      width: item.width,
      heading: item.heading,
      height,
      vertical: item.vertical || EditorCore.verticalWithDeck(height, height),
      source: clone(source),
      confidence: 0.88
    };
    next.structures.pontoons.push(object);
    created.push(object);
    return object;
  });
  for (const [childIndex, item] of proposal.objects.catways.entries()) {
    const height = Math.max(0.05, item.height || 0.5);
    let object = {
      id: EditorCore.createId("catway", next),
      type: "catway",
      center: clone(item.center),
      length: item.length,
      width: item.width,
      heading: item.heading,
      height,
      vertical: item.vertical || EditorCore.verticalWithDeck(height, height),
      source: clone(source),
      confidence: 0.88
    };
    const junction = proposal.continuity.find(entry => entry.childIndex === childIndex);
    const parent = junction ? createdPontoons[junction.parentIndex] : null;
    if (parent) object = EditorCore.attachCatwayToPontoon(object, parent, { rootOverlap: 0.15 });
    next.structures.catways.push(object);
    created.push(object);
  }
  editor.commit(next, "Découper un ponton OpenStreetMap");
  const consumed = new Set(proposal.candidateIndices);
  candidates = candidates.filter((candidate, index) => !consumed.has(index));
  focusedCandidateIndex = -1;
  clearDecompositionPreview();
  afterEdit({ selectId: created[0]?.id, fit: false });
  renderCandidates();
  showCandidateDrawer({ focusFirst: false, fit: false });
  showToast(`${created.length} objet(s) créés sans rupture de jonction.`, "ok", 3400);
}

$("#cancelDecomposition").addEventListener("click", clearDecompositionPreview);
$("#confirmDecomposition").addEventListener("click", applyDecompositionProposal);

function showCandidateDrawer({ focusFirst = true, fit = true } = {}) {
  const list = $("#candidateList");
  list.replaceChildren();
  for (const [index, candidate] of candidates.entries()) {
    const row = document.createElement("article");
    row.className = "candidate-item";
    row.dataset.candidateRowIndex = String(index);
    row.classList.toggle("focused", index === focusedCandidateIndex);
    row.addEventListener("click", event => {
      if (event.target.closest("input,select,button")) return;
      focusCandidate(index, { scroll: false });
    });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.candidateIndex = String(index);
    checkbox.checked = candidate.accepted;
    checkbox.setAttribute("aria-label", `Intégrer ${candidate.sourceLabel}`);
    checkbox.addEventListener("change", () => {
      candidate.accepted = checkbox.checked;
      candidateLayer.changed();
      updateCandidateBulkControls();
    });
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${candidate.sourceLabel} · confiance ${Math.round(candidate.confidence * 100)} %`;
    const reason = document.createElement("p");
    reason.textContent = candidate.reason;
    const select = document.createElement("select");
    for (const [value, label] of [
      ["pontoon", "Ponton"],
      ["catway", "Catway"],
      ["obstacle", "Digue / quai"],
      ["land", "Terre non navigable"],
      ["buoy", "Bouée de navigation"],
      ["ignore", "Ignorer"]
    ]) select.add(new Option(label, value));
    select.value = candidate.candidateType === "coastline" ? "obstacle" : candidate.candidateType;
    select.addEventListener("change", () => {
      candidate.candidateType = select.value;
      candidate.accepted = select.value !== "ignore";
      checkbox.checked = candidate.accepted;
      candidateLayer.changed();
      updateCandidateBulkControls();
    });
    content.append(title, reason, select);
    if (candidate.candidateType === "pontoon" && candidate.tags?.man_made === "pier") {
      const actions = document.createElement("div");
      actions.className = "candidate-item-actions";
      const splitButton = document.createElement("button");
      splitButton.type = "button";
      splitButton.className = "button ghost";
      splitButton.textContent = candidate.decompositionRecommended
        ? "Découper · recommandé"
        : "Découper le ponton";
      splitButton.addEventListener("click", () => proposeCandidateDecomposition(index));
      actions.append(splitButton);
      content.append(actions);
    }
    row.append(checkbox, content);
    list.append(row);
    if (focusFirst && index === 0) checkbox.focus({ preventScroll: true });
  }
  updateCandidateBulkControls();
  setCandidateDrawerOpen(true);
  setTimeout(() => {
    map.updateSize();
    if (!fit || !candidateSource.getFeatures().length) return;
    map.getView().fit(candidateSource.getExtent(), {
      padding: [70, 70, 70, 70],
      maxZoom: 20,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220
    });
  }, 0);
}

async function analyzeVisibleZone() {
  enableMaps();
  let scope;
  try {
    scope = activeAnalysisScope();
    OSMPortImport.validateAnalysisBounds(scope.bounds);
  } catch (error) {
    showToast(`${error.message} Zoomez davantage puis relancez.`, "danger", 3800);
    return;
  }
  $("#analyzeButton").disabled = true;
  $("#analyzeButton").textContent = "Analyse en cours…";
  try {
    const query = OSMPortImport.buildOverpassQuery(scope.bounds, {
      polygon: scope.polygon
    });
    const result = await OSMPortImport.requestOverpass(query, {
      fetchImpl: fetchTracked,
      onAttempt({ endpoint, index, total }) {
        $("#analyzeButton").textContent = `Analyse · serveur ${index + 1}/${total}`;
        $("#analysisStats").textContent = `Connexion à ${endpoint.label}…`;
      }
    });
    const { data } = result;
    analyzedResponses.push(data);
    const merged = OSMPortImport.mergeOverpassResponses(analyzedResponses);
    candidates = OSMPortImport.classifyOverpass(merged, editor.document.georeference)
      .filter(candidate => candidate.candidateType !== "ignore");
    focusedCandidateIndex = -1;
    clearDecompositionPreview();
    editor.transaction("Mémoriser la zone analysée", next => {
      next.editor.analyzedZones.push({
        bounds: clone(scope.bounds),
        polygon: clone(scope.polygon),
        retrievedAt: new Date().toISOString()
      });
    });
    afterEdit();
    renderCandidates();
    showCandidateDrawer();
    $("#analysisStats").textContent = (
      `${analyzedResponses.length} zone(s) · ${merged.elements.length} objet(s) OSM · `
      + `${candidates.length} candidat(s)`
    );
    if (result.attempts.length) {
      showToast(`Analyse reçue via ${result.endpoint.label}, serveur de secours.`, "ok", 3400);
    }
  } catch (error) {
    showToast(`Analyse impossible · ${error.message}`, "danger", 3800);
    $("#analysisStats").textContent = "Aucune donnée ajoutée · réessayez dans quelques instants";
  } finally {
    $("#analyzeButton").disabled = false;
    $("#analyzeButton").textContent = "Analyser cette zone";
  }
}

$("#analyzeButton").addEventListener("click", analyzeVisibleZone);
$("#closeCandidates").addEventListener("click", () => {
  clearDecompositionPreview();
  setCandidateDrawerOpen(false);
});
$("#selectAllCandidates").addEventListener("click", () => {
  setCandidateSelection(() => true, true);
});
$$("#candidateDrawer [data-candidate-category]").forEach(button => {
  button.addEventListener("click", () => {
    const categoryCandidates = candidates.filter(candidate => (
      candidateCategory(candidate) === button.dataset.candidateCategory
    ));
    const allSelected = (
      categoryCandidates.length > 0
      && categoryCandidates.every(candidate => candidate.accepted)
    );
    setCandidateSelection(
      candidate => candidateCategory(candidate) === button.dataset.candidateCategory,
      !allSelected
    );
  });
});
$("#rejectCandidates").addEventListener("click", () => {
  setCandidateSelection(() => true, false);
});
$("#integrateCandidates").addEventListener("click", () => {
  const result = OSMPortImport.integrateCandidates(editor.document, candidates);
  if (!result.added) {
    showToast("Aucun nouveau candidat sélectionné.", "danger");
    return;
  }
  const merged = OSMPortImport.mergeOverpassResponses(analyzedResponses);
  const zones = result.document.editor.analyzedZones.map(zone => zone.bounds);
  const bounds = zones.length
    ? {
      south: Math.min(...zones.map(zone => zone.south)),
      west: Math.min(...zones.map(zone => zone.west)),
      north: Math.max(...zones.map(zone => zone.north)),
      east: Math.max(...zones.map(zone => zone.east))
    }
    : visibleGeographicBounds();
  result.document.sources = result.document.sources.filter(source => source.provider !== "OpenStreetMap / OpenSeaMap");
  result.document.sources.push(OSMPortImport.sourceRecord({
    bounds,
    elements: merged.elements
  }));
  editor.commit(result.document, "Intégrer OpenStreetMap");
  afterEdit({ fit: true });
  candidates = candidates.map(candidate => ({ ...candidate, accepted: false }));
  focusedCandidateIndex = -1;
  clearDecompositionPreview();
  renderCandidates();
  setCandidateDrawerOpen(false);
  showToast(`${result.added} géométrie(s) intégrée(s). Vérifiez leur classification.`, "ok", 3200);
});

function ensureOrthophotoSourceReference() {
  if (editor.document.sources.some(source => source.provider === "IGN BD ORTHO")) return;
  editor.transaction("Référencer l’orthophoto", next => {
    next.sources.push({
      provider: "IGN BD ORTHO",
      kind: "orthophoto",
      attribution: "© IGN · BD ORTHO, utilisée uniquement comme aide visuelle",
      license: "Licence ouverte Etalab 2.0",
      url: "https://geoservices.ign.fr/bdortho",
      retrievedAt: new Date().toISOString(),
      embedded: false
    });
  });
  afterEdit();
}

function syncMetadataForm() {
  const metadata = editor.document.metadata;
  $("#portName").value = metadata.name || "";
  $("#portAuthor").value = metadata.author || "";
  $("#portSource").value = metadata.source || "OpenStreetMap";
  $("#harborMasterUrl").value = metadata.harborMasterUrl || "";
  $("#openingHours").value = metadata.openingHours || "";
  $("#currentAdvice").value = metadata.currentAdvice || "";
  $("#portComment").value = metadata.comment || "";
  $("#latitudeInput").value = editor.document.georeference.origin.latitude.toFixed(6);
  $("#longitudeInput").value = editor.document.georeference.origin.longitude.toFixed(6);
  $("#occupancyRate").value = Math.round(editor.document.editor.occupancyRate * 100);
  $("#occupancyValue").textContent = `${$("#occupancyRate").value} %`;
  $("#berthWidth").value = Number(
    editor.document.editor.defaultBerthWidth ?? 4
  ).toFixed(1);
}

function writeMetadataFromForm({ commit = true } = {}) {
  const patch = {
    name: $("#portName").value.trim(),
    author: $("#portAuthor").value.trim(),
    source: $("#portSource").value.trim(),
    harborMasterUrl: $("#harborMasterUrl").value.trim(),
    openingHours: $("#openingHours").value.trim(),
    currentAdvice: $("#currentAdvice").value.trim(),
    comment: $("#portComment").value.trim()
  };
  if (commit) {
    editor.transaction("Informations du port", next => Object.assign(next.metadata, patch));
    afterEdit();
  } else {
    Object.assign(editor.document.metadata, patch);
  }
}

$$("input, textarea", $("#metadataForm")).forEach(input => {
  input.addEventListener("change", () => writeMetadataFromForm());
});

function exportText() {
  writeMetadataFromForm({ commit: false });
  editor.document.editor.occupancyRate = Number($("#occupancyRate").value) / 100;
  editor.document.metadata.revision = Math.max(1, Number(editor.document.metadata.revision) || 1);
  editor.document.generatorVersion = GENERATOR_VERSION;
  editor.document.bounds = KJPCodec.geometryBounds(editor.document);
  return KJPCodec.serialize(editor.document);
}

function validationTarget(path) {
  const structureMatch = String(path).match(/^\$\.structures\.([a-zA-Z]+)\[(\d+)\]/);
  if (structureMatch) {
    const collection = structureMatch[1];
    const object = editor.document.structures[collection]?.[Number(structureMatch[2])];
    return object ? { collection, object } : null;
  }
  const rootMatch = String(path).match(/^\$\.(berths|staticBoats)\[(\d+)\]/);
  if (rootMatch) {
    const collection = rootMatch[1];
    const object = editor.document[collection]?.[Number(rootMatch[2])];
    return object ? { collection, object } : null;
  }
  const entryMatch = String(path).match(/^\$\.navigation\.entries\[(\d+)\]/);
  if (entryMatch) {
    const object = editor.document.navigation.entries[Number(entryMatch[1])];
    return object ? { collection: "entries", object } : null;
  }
  return null;
}

function focusObject(id) {
  if (!EditorCore.findObject(editor.document, id)) return false;
  setActiveTool("select");
  editor.select(id);
  renderObjects();
  setPanelCollapsed("right", false);
  const feature = objectSource.getFeatures().find(item => item.get("objectId") === id);
  const extent = feature?.getGeometry()?.getExtent();
  if (extent?.every(Number.isFinite)) {
    map.getView().fit(extent, {
      padding: [110, 110, 110, 110],
      maxZoom: 20,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260
    });
  }
  return true;
}

function validationTargetLabel(target) {
  return ({
    pontoons: "Ponton",
    catways: "Catway",
    cleats: "Taquet",
    obstacles: "Obstacle",
    landAreas: "Zone non navigable",
    buoys: "Bouée",
    berths: "Place",
    staticBoats: "Bateau",
    entries: "Entrée"
  })[target.collection] || "Objet";
}

$("#exportButton").addEventListener("click", () => {
  try {
    const text = exportText();
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(editor.document.metadata.name)}.kjp`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("Fichier KJP validé et exporté.", "ok");
  } catch (error) {
    const first = error.errors?.[0];
    const target = first ? validationTarget(first.path) : null;
    const targetText = target
      ? `${validationTargetLabel(target)} « ${target.object.id} » · `
      : "";
    showToast(
      first
        ? `Export impossible · ${targetText}${first.path} · ${first.message}`
        : `Export impossible · ${error.message}`,
      "danger",
      target ? 10000 : 4300,
      target ? {
        label: "Afficher l’objet",
        handler: () => focusObject(target.object.id)
      } : null
    );
  }
});

function importText(text) {
  const document = KJPCodec.parse(text, { freeze: false });
  setEditorDocument(document, { fit: true, autosave: true });
  analyzedResponses = [];
  candidates = [];
  focusedCandidateIndex = -1;
  clearDecompositionPreview();
  clearAnalysisPolygon();
  renderCandidates();
  setCandidateDrawerOpen(false);
  showToast(`Port importé · ${document.metadata.name}`, "ok");
  return document;
}

function resetWorkspace({ confirmReset = true } = {}) {
  if (
    confirmReset
    && !window.confirm("Créer un nouveau port ? Le brouillon actuel sera remplacé.")
  ) return false;
  const fallback = editor.document.georeference.origin;
  const center = map.getView().getCenter();
  const [longitude, latitude] = center ? toLonLat(center) : [fallback.longitude, fallback.latitude];
  analyzedResponses = [];
  candidates = [];
  focusedCandidateIndex = -1;
  clearDecompositionPreview();
  clearAnalysisPolygon();
  renderCandidates();
  setCandidateDrawerOpen(false);
  setEditorDocument(KJPCodec.createEmpty({
    name: "Nouveau port",
    latitude,
    longitude,
    generatorVersion: GENERATOR_VERSION
  }), { fit: false, autosave: true });
  $("#placeSearch").value = "";
  $("#analysisStats").textContent = "Aucune zone analysée";
  setActiveTool("select");
  setPanelCollapsed("left", false);
  setPanelCollapsed("right", false);
  if ($("#orthoLayerToggle").checked) ensureOrthophotoSourceReference();
  showToast("Nouveau port prêt à être modélisé.", "ok");
  return true;
}

$("#newPortButton").addEventListener("click", () => resetWorkspace());
$("#importButton").addEventListener("click", () => $("#importInput").click());
$("#importInput").addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > KJPCodec.LIMITS.fileBytes) {
    showToast("Import refusé · fichier supérieur à 10 Mo.", "danger");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      importText(String(reader.result || ""));
    } catch (error) {
      const first = error.errors?.[0];
      showToast(
        first ? `Import refusé · ${first.path} · ${first.message}` : error.message,
        "danger",
        4200
      );
    } finally {
      event.target.value = "";
    }
  });
  reader.readAsText(file, "UTF-8");
});

function setPanelCollapsed(side, collapsed) {
  const isLeft = side === "left";
  const panel = $(isLeft ? ".left-panel" : ".right-panel");
  const className = `${side}-collapsed`;
  panel.classList.toggle("collapsed", collapsed);
  $(".app-shell").classList.toggle(className, collapsed);
  $(isLeft ? "#collapseLeft" : "#collapseRight").setAttribute(
    "aria-expanded",
    String(!collapsed)
  );
  $(isLeft ? "#expandLeft" : "#expandRight").hidden = !collapsed;
  setTimeout(() => map.updateSize(), 0);
}

$("#collapseLeft").addEventListener("click", () => setPanelCollapsed("left", true));
$("#expandLeft").addEventListener("click", () => setPanelCollapsed("left", false));
$("#collapseRight").addEventListener("click", () => setPanelCollapsed("right", true));
$("#expandRight").addEventListener("click", () => setPanelCollapsed("right", false));

window.addEventListener("keydown", event => {
  const target = event.target;
  const editing = ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) editor.redo();
    else editor.undo();
    afterEdit({ selectId: null });
    return;
  }
  if (editing) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    removeSelected();
  } else if (event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelected();
  } else if (event.key.toLowerCase() === "v" || event.key === "Escape") {
    setActiveTool("select");
  }
});

function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("portance-port-generator", 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains("drafts")) {
        request.result.createObjectStore("drafts");
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function putDraft(database, document) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(document, "current");
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function getDraft(database) {
  return new Promise((resolve, reject) => {
    const request = database.transaction("drafts").objectStore("drafts").get("current");
    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function restoreDraft() {
  try {
    draftDatabase = await openDraftDatabase();
    const draft = await getDraft(draftDatabase);
    if (draft?.format === "KJP" && [1, KJPCodec.SCHEMA_VERSION].includes(draft.schemaVersion)) {
      setEditorDocument(KJPCodec.normalizeDocument(draft, { freeze: false }), { fit: true, autosave: false });
      $("#saveState").textContent = "Brouillon restauré";
    }
  } catch {
    $("#saveState").textContent = "Brouillon non disponible";
  }
}

function createDemonstrationDocument() {
  const document = KJPCodec.createEmpty({
    name: "Port test KJP",
    latitude: 47.586,
    longitude: -3.03,
    generatorVersion: GENERATOR_VERSION,
    id: "port-test-kjp"
  });
  document.structures.pontoons.push({
    id: "pontoon-main",
    type: "pontoon",
    center: { east: 0, north: 0 },
    length: 80,
    width: 2.6,
    heading: Math.PI / 10,
    height: 0.55,
    vertical: EditorCore.verticalWithDeck(0.55, 0.55)
  });
  const temporary = new EditorCore.PortEditor(document);
  temporary.addCatwayGroup("pontoon-main", {
    mode: "count",
    count: 4,
    side: "both",
    marginStart: 7,
    marginEnd: 7,
    length: 11,
    width: 0.75
  });
  temporary.recomputeBerths();
  temporary.document.berths[0].isVisitor = true;
  temporary.document.berths[0].name = "Visiteurs A";
  temporary.populateBoats({ occupancyRate: 0.55, seed: 42 });
  temporary.document.navigation.entries = [{
    id: "entry-main",
    name: "Entrée",
    position: { east: -70, north: -60 },
    heading: Math.PI / 4
  }];
  temporary.document.structures.buoys.push({
    id: "buoy-demo-starboard",
    type: "buoy",
    position: { east: -42, north: -38 },
    radius: 0.48,
    height: 1.6,
    seamarkType: "buoy_lateral",
    category: "starboard",
    shape: "conical",
    colours: ["green"],
    name: "Entrée tribord",
    collision: true
  });
  temporary.document.sources.push({
    provider: "OpenStreetMap / OpenSeaMap",
    kind: "vector",
    attribution: "© les contributeurs OpenStreetMap, données ODbL ; signalisation © OpenSeaMap",
    license: "ODbL 1.0",
    url: "https://www.openstreetmap.org/copyright",
    retrievedAt: "2026-07-30T00:00:00.000Z",
    bounds: { south: 47.58, west: -3.04, north: 47.59, east: -3.02 },
    osmElementIds: []
  });
  return temporary.snapshot();
}

function installTestApi() {
  if (!new URLSearchParams(location.search).has("test")) return;
  window.__KJP_GENERATOR_TEST__ = Object.freeze({
    generatorVersion: GENERATOR_VERSION,
    snapshot: () => editor.snapshot(),
    exportText,
    importText,
    setDocument(document) {
      setEditorDocument(clone(document), { fit: false, autosave: false });
      return editor.snapshot();
    },
    createDemonstrationDocument,
    loadDemonstration() {
      setEditorDocument(createDemonstrationDocument(), { fit: true, autosave: false });
      return editor.snapshot();
    },
    resetWorkspace: () => resetWorkspace({ confirmReset: false }),
    enableMaps,
    layers: () => ({
      enabled: mapsEnabled,
      osm: osmLayer.getVisible(),
      seamark: seamarkLayer.getVisible(),
      orthophoto: orthoLayer.getVisible(),
      orthophotoOpacity: orthoLayer.getOpacity()
    }),
    networkRequests: () => clone(networkRequests),
    classifyOverpass(response) {
      return OSMPortImport.classifyOverpass(response, editor.document.georeference);
    },
    showCandidateFixture(response) {
      candidates = OSMPortImport.classifyOverpass(response, editor.document.georeference)
        .filter(candidate => candidate.candidateType !== "ignore")
        .map(candidate => ({ ...candidate, accepted: false }));
      focusedCandidateIndex = -1;
      clearDecompositionPreview();
      renderCandidates();
      showCandidateDrawer({ focusFirst: false });
      return {
        total: candidates.length,
        selected: candidates.filter(candidate => candidate.accepted).length,
        categories: candidates.reduce((counts, candidate) => {
          const category = candidateCategory(candidate);
          counts[category] = (counts[category] || 0) + 1;
          return counts;
        }, {})
      };
    },
    candidateReport: () => ({
      open: !$("#candidateDrawer").hidden,
      total: candidates.length,
      selected: candidates.filter(candidate => candidate.accepted).length,
      focusedIndex: focusedCandidateIndex,
      selectedByCategory: candidates.reduce((counts, candidate) => {
        if (candidate.accepted) {
          const category = candidateCategory(candidate);
          counts[category] = (counts[category] || 0) + 1;
        }
        return counts;
      }, {})
    }),
    setAnalysisPolygon(localPoints) {
      clearAnalysisPolygon();
      const projection = projectionForDocument();
      analysisPolygonGeographic = localPoints.map(point => projection.inverse(point.east, point.north));
      const mapRing = localPoints.map(point => localToMap(point));
      mapRing.push(mapRing[0]);
      analysisSource.addFeature(new Feature({ geometry: new Polygon([mapRing]) }));
      $("#clearAnalysisPolygon").disabled = false;
      $("#analysisScopeStatus").textContent = `Polygone actif · ${localPoints.length} sommets`;
      return activeAnalysisScope();
    },
    clearAnalysisPolygon,
    analysisReport: () => ({
      polygon: clone(analysisPolygonGeographic),
      features: analysisSource.getFeatures().length,
      scope: activeAnalysisScope()
    }),
    focusCandidate,
    candidatePixel(index) {
      const feature = candidateSource.getFeatures().find(item => (
        Number(item.get("candidateIndex")) === index
      ));
      const geometry = feature?.getGeometry();
      const coordinate = geometry instanceof Point
        ? geometry.getCoordinates()
        : geometry?.getClosestPoint(map.getView().getCenter());
      return coordinate ? map.getPixelFromCoordinate(coordinate) : null;
    },
    candidateHitReport(index) {
      const pixel = this.candidatePixel(index);
      const feature = pixel && map.forEachFeatureAtPixel(
        pixel,
        item => item,
        {
          hitTolerance: 10,
          layerFilter: layer => layer === candidateLayer
        }
      );
      return {
        pixel,
        hitIndex: feature ? Number(feature.get("candidateIndex")) : -1,
        mapSize: map.getSize()
      };
    },
    proposeDecomposition(index) {
      const proposal = PontoonDecomposition.proposePontoonDecomposition(candidates, index);
      if (proposal.available) renderDecompositionPreview(proposal);
      return clone(proposal);
    },
    confirmDecomposition() {
      applyDecompositionProposal();
      return editor.snapshot();
    },
    panelReport: () => ({
      leftCollapsed: $(".left-panel").classList.contains("collapsed"),
      rightCollapsed: $(".right-panel").classList.contains("collapsed"),
      candidatesOpen: $(".app-shell").classList.contains("candidates-open")
    }),
    integrateFixture(response) {
      const fixtureCandidates = OSMPortImport.classifyOverpass(response, editor.document.georeference)
        .map(candidate => ({ ...candidate, accepted: candidate.candidateType !== "ignore" }));
      const result = OSMPortImport.integrateCandidates(editor.document, fixtureCandidates);
      editor.commit(result.document, "Fixture OSM");
      afterEdit({ fit: false });
      return { added: result.added, document: editor.snapshot() };
    },
    select(id) {
      editor.select(id);
      syncMapSelection();
      objectLayer.changed();
      updateInspector();
      renderEditHandles();
      return selectedObject()?.object || null;
    },
    setTool(tool) {
      setActiveTool(tool);
      return activeTool;
    },
    undo() {
      editor.undo();
      afterEdit({ selectId: null });
      return editor.snapshot();
    },
    redo() {
      editor.redo();
      afterEdit({ selectId: null });
      return editor.snapshot();
    },
    rectangleHandleReport() {
      const found = editableRectangle();
      const centerPixel = found
        ? map.getPixelFromCoordinate(localToMap(found.object.center))
        : null;
      return {
        objectId: found?.object.id || null,
        centerPixel,
        handles: editHandleSource.getFeatures()
          .filter(feature => feature.get("handleKind") !== "rotation-guide")
          .map(feature => ({
            kind: feature.get("handleKind"),
            sign: Number(feature.get("handleSign")) || null,
            pixel: map.getPixelFromCoordinate(feature.getGeometry().getCoordinates())
          }))
      };
    },
    emptyMapPixel() {
      const size = map.getSize() || [0, 0];
      for (let y = 90; y < size[1] - 70; y += 28) {
        for (let x = 90; x < size[0] - 70; x += 28) {
          const occupied = map.hasFeatureAtPixel([x, y], {
            hitTolerance: 8,
            layerFilter: layer => layer === objectLayer || layer === editHandleLayer
          });
          if (!occupied) return [x, y];
        }
      }
      return null;
    },
    renderReport: () => ({
      features: objectSource.getFeatures().length,
      candidates: candidateSource.getFeatures().length,
      buoys: editor.document.structures.buoys?.length || 0,
      decompositionFeatures: decompositionSource.getFeatures().length,
      selected: editor.selection,
      mapSelected: selectInteraction.getFeatures().getArray().map(feature => feature.get("objectId")),
      tool: activeTool,
      entries: objectSource.getFeatures()
        .filter(feature => feature.get("collection") === "entries")
        .map(feature => {
          const object = feature.get("object");
          const points = entryArrowLocalCoordinates(object);
          return {
            id: object.id,
            geometryType: feature.getGeometry().getType(),
            coordinateCount: feature.getGeometry().getCoordinates().length,
            nauticalHeading: nauticalHeadingDegrees(object.heading),
            arrowLength: Math.hypot(
              points[1].east - points[0].east,
              points[1].north - points[0].north
            )
          };
        })
    })
  });
}

syncMetadataForm();
syncCatwayModeFields();
syncPendilleModeFields();
renderObjects();
setActiveTool("select");
setPanelCollapsed("right", innerWidth <= 1040);
setPanelCollapsed("left", innerWidth <= 700);
installTestApi();
void restoreDraft();
