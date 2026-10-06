"use strict";
const fs = require("node:fs");
const path = require("node:path");
function createLargeObstacles() {
  const definition = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "fixtures", "kjp-large-port-definition.json"),
    "utf8"
  ));
  const rectangles = [];
  const boats = [];
  const { columns, rowPitchMeters, columnPitchMeters } = definition.grid;
  for (let index = 0; index < definition.counts.pontoons + definition.counts.catways; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    rectangles.push({
      id: `structure-${index}`,
      east: 500 + column * columnPitchMeters,
      north: 500 + row * rowPitchMeters,
      width: index < definition.counts.pontoons ? 18 : 10,
      height: index < definition.counts.pontoons ? 2.4 : 0.8,
      heading: Math.PI / 2 + (index % 7) * 0.03
    });
  }
  for (let index = 0; index < definition.counts.staticBoats; index += 1) {
    boats.push({
      id: `boat-${index}`,
      east: 600 + (index % columns) * columnPitchMeters,
      north: -600 - Math.floor(index / columns) * rowPitchMeters,
      heading: Math.PI / 2,
      length: 9,
      beam: 3
    });
  }
  return { rectangles, boats };
}

module.exports = { createLargeObstacles };
