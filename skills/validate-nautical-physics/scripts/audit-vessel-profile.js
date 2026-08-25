#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function usage() {
  return [
    "Usage:",
    "  node audit-vessel-profile.js --module <physics-core.js|profile.json>",
    "       [--export DEFAULT_PROFILE] [--strict]",
    "",
    "Le module peut exporter directement un profil ou exposer DEFAULT_PROFILE.",
    "--strict exige le schéma multi-bateaux complet et versionné."
  ].join("\n");
}

function parseArgs(argv) {
  const result = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") {
      result.strict = true;
    } else if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else if (argument === "--module" || argument === "--export") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Valeur manquante pour ${argument}`);
      }
      result[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Argument inconnu : ${argument}`);
    }
  }
  return result;
}

function loadInput(filename, exportName) {
  const absolute = path.resolve(filename);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Fichier introuvable : ${absolute}`);
  }
  if (path.extname(absolute).toLowerCase() === ".json") {
    return { profile: JSON.parse(fs.readFileSync(absolute, "utf8")), module: null, absolute };
  }
  delete require.cache[require.resolve(absolute)];
  const loaded = require(absolute);
  const defaultProfile = loaded.DEFAULT_PROFILE || loaded.profile;
  const profile = exportName
    ? loaded[exportName]
    : (
      loaded.RAW_PROFILES?.[defaultProfile?.id]
      || loaded.DEFAULT_PROFILE
      || loaded.profile
      || (loaded.default && (loaded.default.DEFAULT_PROFILE || loaded.default.profile))
      || loaded.default
      || loaded
    );
  return { profile, module: loaded, absolute };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function get(object, dottedPath) {
  return dottedPath.split(".").reduce(
    (value, key) => (value == null ? undefined : value[key]),
    object
  );
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function auditProfile(profile, moduleExports, strict) {
  const errors = [];
  const warnings = [];
  const metrics = {};
  const addError = (code, message) => errors.push({ code, message });
  const addWarning = (code, message) => warnings.push({ code, message });

  if (!isObject(profile)) {
    addError("PROFILE_TYPE", "Le profil doit être un objet.");
    return { errors, warnings, metrics, schema: "unknown" };
  }

  const legacy = isObject(profile.dimensions) && isObject(profile.inertia);
  const schema = legacy ? "legacy" : "multi-vessel-v1";
  metrics.id = profile.id || null;
  metrics.name = profile.name || null;
  metrics.schemaVersion = profile.schemaVersion ?? null;
  metrics.profileVersion = profile.version ?? null;

  if (typeof profile.id !== "string" || !profile.id.trim()) {
    addError("PROFILE_ID", "Identifiant de profil absent.");
  }
  if (typeof profile.name !== "string" || !profile.name.trim()) {
    addError("PROFILE_NAME", "Nom de profil absent.");
  }

  if (legacy) {
    addWarning(
      "LEGACY_SCHEMA",
      "Profil historique détecté : séparer profil complet et patch de calibration."
    );
    if (strict) {
      addError(
        "STRICT_SCHEMA",
        "Le mode strict interdit le schéma historique fusionné avec un profil par défaut."
      );
    }
  } else {
    if (!Number.isInteger(profile.schemaVersion) || profile.schemaVersion < 1) {
      addError("SCHEMA_VERSION", "schemaVersion entier positif requis.");
    }
    if (typeof profile.version !== "string" || !profile.version.trim()) {
      addError("PROFILE_VERSION", "Version de profil requise.");
    }
    if (typeof profile.modelClass !== "string" || !profile.modelClass.trim()) {
      addError("MODEL_CLASS", "Classe de modèle requise.");
    }
    if (!isObject(profile.validity)) {
      addError("VALIDITY", "Domaine de validité requis.");
    }
  }

  const geometry = legacy ? profile.dimensions : profile.geometry;
  const mass = legacy ? profile.inertia : profile.mass;
  if (!isObject(geometry)) addError("GEOMETRY", "Géométrie absente.");
  if (!isObject(mass)) addError("MASS", "Données de masse absentes.");

  const dimensions = legacy
    ? [
      ["dimensions.lengthOverall", "LOA"],
      ["dimensions.waterline", "LWL"],
      ["dimensions.beam", "largeur"],
      ["dimensions.draft", "tirant d'eau"],
      ["dimensions.canoeDraft", "tirant de carène"],
      ["dimensions.wettedArea", "surface mouillée"]
    ]
    : [
      ["geometry.loa", "LOA"],
      ["geometry.lwl", "LWL"],
      ["geometry.beam", "largeur"],
      ["geometry.draft", "tirant d'eau"],
      ["geometry.canoeDraft", "tirant de carène"],
      ["geometry.wettedArea", "surface mouillée"]
    ];
  for (const [field, label] of dimensions) {
    const value = get(profile, field);
    if (!finitePositive(value)) {
      addError("DIMENSION", `${label} doit être finie et positive (${field}).`);
    }
  }

  const loa = legacy ? geometry?.lengthOverall : geometry?.loa;
  const lwl = legacy ? geometry?.waterline : geometry?.lwl;
  const beam = geometry?.beam;
  const draft = geometry?.draft;
  const canoeDraft = geometry?.canoeDraft;
  const displacement = legacy ? mass?.loadedMass : mass?.displacement;
  const yawRadius = mass?.yawRadius;
  Object.assign(metrics, { loa, lwl, beam, draft, canoeDraft, displacement, yawRadius });

  if (finitePositive(loa) && finitePositive(lwl) && lwl > loa * 1.02) {
    addError("LWL_LOA", "LWL dépasse LOA de plus de 2 %.");
  }
  if (finitePositive(draft) && finitePositive(canoeDraft) && canoeDraft > draft) {
    addError("DRAFT", "Le tirant de carène dépasse le tirant d'eau total.");
  }
  if (!finitePositive(displacement)) {
    addError("DISPLACEMENT", "Déplacement chargé fini et positif requis.");
  }
  if (!finitePositive(yawRadius)) {
    addError("YAW_RADIUS", "Rayon de giration fini et positif requis.");
  } else if (finitePositive(loa) && (yawRadius < 0.15 * loa || yawRadius > 0.45 * loa)) {
    addWarning("YAW_RADIUS_RANGE", "Rayon de giration hors prior 0,15–0,45 LOA.");
  }

  function checkUnique(items, label, requireIds = true) {
    if (!Array.isArray(items)) return;
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !item.id) {
        if (requireIds) {
          addError("COMPONENT_ID", `${label} contient un composant sans identifiant.`);
        } else {
          addWarning("LEGACY_COMPONENT_ID", `${label} contient un composant sans identifiant stable.`);
        }
      } else if (ids.has(item.id)) {
        addError("DUPLICATE_ID", `${label} contient l'identifiant dupliqué ${item.id}.`);
      } else {
        ids.add(item.id);
      }
    }
  }

  if (legacy) {
    const configuration = profile.configuration || {};
    if ((configuration.propellers || 1) !== 1) {
      addError("LEGACY_PROPELLERS", "Le schéma historique ne représente qu'une hélice.");
    }
    if ((configuration.rudders || 1) !== 1) {
      addError("LEGACY_RUDDERS", "Le schéma historique ne représente qu'un safran.");
    }
    for (const field of ["keel", "rudder", "propulsion", "resistance", "windage"]) {
      if (!isObject(profile[field])) addError("LEGACY_COMPONENT", `Composant ${field} absent.`);
    }
    addWarning(
      "DIMENSIONAL_COEFFICIENTS",
      "Les résistances, plafonds de poussée et raideurs dimensionnels ne sont pas transférables."
    );
    checkUnique(profile.contacts?.fenders, "contacts.fenders", false);
    checkUnique(profile.mooring?.cleats, "mooring.cleats");
  } else {
    for (const field of ["appendages", "propulsors", "rudders"]) {
      if (!Array.isArray(profile[field])) {
        addError("COMPONENT_ARRAY", `${field} doit être une liste, même vide.`);
      } else {
        checkUnique(profile[field], field);
      }
    }
    checkUnique(profile.aerodynamics?.panels, "aerodynamics.panels");
    checkUnique(profile.contacts?.fenders, "contacts.fenders");
    checkUnique(profile.deckHardware?.cleats, "deckHardware.cleats");

    const propulsorIds = new Set((profile.propulsors || []).map(item => item.id));
    for (const rudder of profile.rudders || []) {
      for (const source of rudder.slipstreamSources || []) {
        if (!propulsorIds.has(source)) {
          addError(
            "SLIPSTREAM_REFERENCE",
            `Le safran ${rudder.id} référence un propulseur inconnu : ${source}.`
          );
        }
      }
    }
  }

  function checkPosition(item, label) {
    const position = item?.position || item;
    const x = position?.x;
    const y = position?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      addError("POSITION", `Position non finie pour ${label}.`);
      return;
    }
    if (finitePositive(loa) && Math.abs(x) > loa * 0.65) {
      addWarning("POSITION_X", `${label} est à plus de 0,65 LOA du centre.`);
    }
    if (finitePositive(beam) && Math.abs(y) > beam * 0.75) {
      addWarning("POSITION_Y", `${label} est à plus de 0,75 B de l'axe.`);
    }
  }

  if (legacy) {
    for (const [index, item] of (profile.contacts?.fenders || []).entries()) {
      checkPosition(item, `pare-battage ${index}`);
    }
    for (const item of profile.mooring?.cleats || []) checkPosition(item, `taquet ${item.id}`);
  } else {
    for (const group of ["appendages", "propulsors", "rudders"]) {
      for (const item of profile[group] || []) checkPosition(item, `${group}.${item.id}`);
    }
    for (const item of profile.contacts?.fenders || []) {
      checkPosition(item, `pare-battage ${item.id}`);
    }
    for (const item of profile.deckHardware?.cleats || []) {
      checkPosition(item, `taquet ${item.id}`);
    }
  }

  if (moduleExports && typeof moduleExports.computeMassMatrix === "function") {
    try {
      const properties = moduleExports.computeMassMatrix(profile, displacement);
      const matrix = properties.matrix || properties;
      metrics.massMatrix = matrix;
      const valid = typeof moduleExports.massMatrixIsPositiveDefinite === "function"
        ? moduleExports.massMatrixIsPositiveDefinite(matrix)
        : null;
      metrics.massMatrixPositiveDefinite = valid;
      if (valid === false) addError("MASS_MATRIX", "Matrice de masse non définie positive.");
    } catch (error) {
      addError("MASS_MATRIX_BUILD", `Construction de masse impossible : ${error.message}`);
    }
  } else {
    addWarning("MASS_MATRIX_UNCHECKED", "Aucune API computeMassMatrix exportée.");
  }

  const provenance = profile.provenance;
  if (!isObject(provenance)) {
    addError("PROVENANCE", "Provenance absente.");
  } else if (!legacy && !isObject(provenance.values)) {
    addError("PROVENANCE_VALUES", "provenance.values est requis pour un profil multi-bateaux.");
  } else if (legacy) {
    addWarning("LEGACY_PROVENANCE", "La provenance historique n'est pas liée champ par champ.");
  }

  return { errors, warnings, metrics, schema };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.module) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  try {
    const loaded = loadInput(args.module, args.export);
    const audit = auditProfile(loaded.profile, loaded.module, args.strict);
    const output = {
      ok: audit.errors.length === 0,
      file: loaded.absolute,
      schema: audit.schema,
      strict: args.strict,
      metrics: audit.metrics,
      errors: audit.errors,
      warnings: audit.warnings
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!output.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  }
}

main();
