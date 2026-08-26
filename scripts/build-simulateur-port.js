"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(root, "src", "simulateur-port", "template.html");
const profilesPath = path.join(root, "src", "simulateur-port", "vessel-profiles.js");
const physicsPath = path.join(root, "src", "simulateur-port", "physics-core.js");
const codecPath = path.join(root, "src", "ports", "kjp-codec.js");
const outputPath = path.join(root, "simulateur-port.html");
const marker = "/*__PORT_PHYSICS_CORE__*/";
const codecMarker = "/*__KJP_CODEC__*/";
const topologyPattern = /<script\s+data-port-topology\s+src="([^"]+)"><\/script>/;

function validateTopology(topologyRelativePath) {
  if (
    path.isAbsolute(topologyRelativePath)
    || topologyRelativePath.includes("..")
    || !topologyRelativePath.startsWith("ports/")
  ) {
    throw new Error(`Chemin de topologie non autorisé : ${topologyRelativePath}`);
  }
  const topologyPath = path.join(root, topologyRelativePath);
  if (!fs.existsSync(topologyPath)) {
    throw new Error(`Topologie absente : ${topologyPath}`);
  }
  delete require.cache[require.resolve(topologyPath)];
  const topology = require(topologyPath);
  const errors = [];
  if (topology.schemaVersion !== 2) errors.push("schemaVersion doit valoir 2");
  if (topology.units?.distance !== "m") errors.push("distance doit être exprimée en m");
  if (topology.units?.speed !== "m/s") errors.push("speed doit être exprimée en m/s");
  if (topology.units?.angle !== "rad") errors.push("angle doit être exprimé en rad");
  if (!Array.isArray(topology.structures?.docks)) errors.push("structures.docks absent");
  if (!Array.isArray(topology.structures?.catways)) errors.push("structures.catways absent");
  if (!Array.isArray(topology.structures?.mooringCleats)) {
    errors.push("structures.mooringCleats absent");
  } else {
    const structures = [
      ...(topology.structures?.docks || []),
      ...(topology.structures?.catways || [])
    ];
    const parentById = new Map(structures.map(structure => [structure.id, structure]));
    const ids = new Set();
    for (const cleat of topology.structures.mooringCleats) {
      if (
        typeof cleat.id !== "string"
        || ids.has(cleat.id)
        || !["catway", "ponton", "quay"].includes(cleat.kind)
        || ![cleat.x, cleat.y, cleat.z, cleat.orientation].every(Number.isFinite)
      ) {
        errors.push(`taquet d'amarrage invalide : ${cleat.id || "sans identifiant"}`);
        continue;
      }
      ids.add(cleat.id);
      const parent = parentById.get(cleat.parentId);
      if (
        !parent
        || Math.abs(cleat.x - parent.x) > parent.w / 2 + 1e-9
        || Math.abs(cleat.y - parent.y) > parent.h / 2 + 1e-9
      ) {
        errors.push(`taquet ${cleat.id} hors de sa structure parente`);
      }
    }
    for (const catway of topology.structures?.catways || []) {
      const count = topology.structures.mooringCleats.filter(
        cleat => cleat.parentId === catway.id
      ).length;
      if (count !== 6) errors.push(`catway ${catway.id}: ${count} taquets au lieu de 6`);

      const parentId = catway.parentId || catway.attachment?.parentId;
      const parent = parentById.get(parentId);
      if (!parent || !catway.attachment) {
        errors.push(`catway ${catway.id}: raccord au ponton parent absent`);
        continue;
      }
      const rootAtX1 = (catway.hiddenFaces || []).includes("x1");
      const heading = catway.heading || 0;
      const rootLocalX = rootAtX1 ? catway.w / 2 : -catway.w / 2;
      const rootX = catway.x + Math.cos(heading) * rootLocalX;
      const rootY = catway.y + Math.sin(heading) * rootLocalX;
      const parentHeading = parent.heading || 0;
      const dx = rootX - parent.x;
      const dy = rootY - parent.y;
      const localX = Math.cos(parentHeading) * dx + Math.sin(parentHeading) * dy;
      const localY = -Math.sin(parentHeading) * dx + Math.cos(parentHeading) * dy;
      const overlap = Math.min(
        parent.w / 2 - Math.abs(localX),
        parent.h / 2 - Math.abs(localY)
      );
      if (overlap < 0.095 || overlap > 0.255) {
        errors.push(`catway ${catway.id}: recouvrement de raccord invalide (${overlap.toFixed(3)} m)`);
      }
      if (Math.abs(overlap - catway.attachment.rootOverlap) > 0.005) {
        errors.push(`catway ${catway.id}: recouvrement déclaré incohérent`);
      }
      const parentDeck = parent.deckZ ?? parent.z + parent.height / 2;
      const catwayDeck = catway.deckZ ?? catway.z + catway.height / 2;
      if (catway.attachment.connector === "flush" && Math.abs(parentDeck - catwayDeck) > 0.08) {
        errors.push(`catway ${catway.id}: raccord affleurant avec niveaux incompatibles`);
      }
    }
    for (const pontoon of (topology.structures?.docks || []).filter(
      dock => dock.kind === "ponton"
    )) {
      const count = topology.structures.mooringCleats.filter(
        cleat => cleat.parentId === pontoon.id
      ).length;
      if (count < 4) errors.push(`ponton ${pontoon.id}: taquets insuffisants`);
    }
  }
  for (const structure of [
    ...(topology.structures?.docks || []),
    ...(topology.structures?.catways || [])
  ]) {
    if (
      ![structure.baseZ, structure.topZ, structure.deckZ].every(Number.isFinite)
      || structure.topZ <= structure.baseZ
      || Math.abs(structure.topZ - structure.baseZ - structure.height) > 1e-9
      || structure.deckZ < structure.baseZ
      || structure.deckZ > structure.topZ + 1e-9
    ) {
      errors.push(`structure ${structure.id || "sans identifiant"}: contrat vertical invalide`);
    }
  }
  if (!topology.berthLanes || typeof topology.berthLanes !== "object") errors.push("berthLanes absent");
  if (!Array.isArray(topology.navigation?.fairways)) errors.push("navigation.fairways absent");
  if (!Array.isArray(topology.navigation?.trainingBerths)) errors.push("navigation.trainingBerths absent");
  if (!Array.isArray(topology.navigation?.exitLanes)) errors.push("navigation.exitLanes absent");
  const catwayPitch = topology.layout?.catwayPitch;
  const catwayRows = topology.layout?.catwayRows;
  const berthRows = topology.layout?.berthRows;
  if (
    !Number.isFinite(catwayPitch)
    || !Array.isArray(catwayRows)
    || !Array.isArray(berthRows)
    || catwayRows.length !== berthRows.length + 1
    || catwayRows.some((row, index) => (
      index > 0
      && Math.abs(row - catwayRows[index - 1] - catwayPitch) > 1e-9
    ))
    || berthRows.some((row, index) => (
      Math.abs(row - (catwayRows[index] + catwayRows[index + 1]) / 2) > 1e-9
    ))
  ) {
    errors.push("rangées et entraxe des catways incohérents");
  }
  if (topology.staticBoats?.some(boat => (
    !Number.isFinite(boat.berthRow)
    || !["south", "north"].includes(boat.berthSlot)
    || typeof boat.catwayId !== "string"
  ))) {
    errors.push("chaque bateau statique doit référencer une place et son catway");
  }
  if (topology.navigation?.trainingBerths?.some(berth => (
    !Number.isFinite(berth.x)
    || !Number.isFinite(berth.y)
    || !["south", "north"].includes(berth.berthSlot)
    || typeof berth.catwayId !== "string"
  ))) {
    errors.push("chaque place pédagogique doit référencer son catway");
  }
  if (!Array.isArray(topology.terrain?.polygons)) errors.push("terrain.polygons absent");
  if (!Array.isArray(topology.lights?.posts)) errors.push("lights.posts absent");
  if (!topology.flowField) errors.push("flowField absent");
  if (!topology.scenarios?.dockForward) errors.push("scénario dockForward absent");
  if (!topology.scenarios?.mooring?.mooringChallenge) {
    errors.push("défi pédagogique d’aussières absent");
  }
  if (errors.length) {
    throw new Error(`Topologie invalide (${topologyRelativePath}) : ${errors.join(" ; ")}`);
  }
  return topology;
}

function build() {
  const template = fs.readFileSync(templatePath, "utf8");
  const profiles = fs.readFileSync(profilesPath, "utf8");
  const physics = fs.readFileSync(physicsPath, "utf8");
  const codec = fs.readFileSync(codecPath, "utf8");
  const topologyMatch = template.match(topologyPattern);
  if (!topologyMatch) {
    throw new Error("Balise <script data-port-topology> absente du modèle HTML.");
  }
  const topologyRelativePath = topologyMatch[1];
  validateTopology(topologyRelativePath);
  const topologyPath = path.join(root, topologyRelativePath);
  const topologySource = fs.readFileSync(topologyPath, "utf8").trim();
  if (/<\/script/i.test(topologySource)) {
    throw new Error(`La topologie ${topologyRelativePath} contient une fermeture de script non intégrable.`);
  }
  if (!template.includes(marker)) {
    throw new Error(`Marqueur de build absent dans ${templatePath}`);
  }
  if (!template.includes(codecMarker)) {
    throw new Error(`Marqueur KJP absent dans ${templatePath}`);
  }
  const output = template
    .replace(
      topologyPattern,
      () => `<script data-port-topology="embedded">\n${topologySource}\n  </script>`
    )
    .replace(
      marker,
      () => `${profiles.trim()}\n\n${physics.trim()}`
    )
    .replace(codecMarker, () => codec.trim());
  if (output.includes(marker) || output.includes(codecMarker)) {
    throw new Error("Un marqueur de build subsiste dans le livrable.");
  }
  return { output, topologyRelativePath };
}

const { output, topologyRelativePath } = build();
const topologyPath = path.join(root, topologyRelativePath);
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== output) {
    console.error("simulateur-port.html n'est pas synchronisé avec ses sources.");
    process.exitCode = 1;
  } else {
    console.log(`simulateur-port.html autonome et ${topologyRelativePath} sont validés.`);
  }
} else {
  fs.writeFileSync(outputPath, output);
  console.log(`Construit: ${outputPath}`);
  console.log(`Topologie intégrée depuis: ${topologyPath}`);
}
