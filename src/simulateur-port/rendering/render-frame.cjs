"use strict";

function finite(value, field) {
  if (!Number.isFinite(value)) throw new TypeError(`RenderFrame: ${field} non fini`);
  return value;
}

function pointsSnapshot(points) {
  return Object.freeze(points.map(point => Object.freeze({
    x: finite(point.x, "x"),
    y: finite(point.y, "y"),
    depth: finite(point.depth, "depth")
  })));
}

function color(value, field, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string") throw new TypeError(`RenderFrame: ${field} invalide`);
  return value;
}

// Contrat transitoire en pixels du canevas et profondeur métrique, après
// projection/clipping Legacy. Aucune référence vers l'état de simulation.
// Les copies permettent de conserver une frame après réutilisation des listes
// de construction, et empêchent un backend de modifier les entrées du suivant.
function createRenderFrame({ polygons, lines }) {
  return Object.freeze({
    version: 1,
    space: "projected-canvas",
    polygons: Object.freeze(polygons.map(item => Object.freeze({
      points: pointsSnapshot(item.points),
      fill: color(item.fill, "fill"),
      stroke: color(item.stroke, "stroke", true),
      lineWidth: finite(item.lineWidth, "lineWidth"),
      depth: finite(item.depth, "polygon.depth"),
      layer: finite(item.layer, "layer")
    }))),
    lines: Object.freeze(lines.map(item => Object.freeze({
      points: pointsSnapshot(item.points),
      color: color(item.color, "color"),
      width: finite(item.width, "width"),
      dash: Object.freeze(item.dash.map(value => finite(value, "dash"))),
      layer: finite(item.layer, "layer")
    })))
  });
}

// Adaptation de signature uniquement : aucune modification de triangulation,
// profondeur, blending, ordre de dessin ou état GPU du renderer historique.
function renderLegacyFrame(renderer, frame) {
  renderer.render(frame.polygons, frame.lines);
}

module.exports = { createRenderFrame, renderLegacyFrame };
