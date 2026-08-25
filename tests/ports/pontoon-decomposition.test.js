"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Decomposition = require("../../src/ports/pontoon-decomposition.js");

function pier(id, points, candidateType = "catway", width) {
  return {
    id,
    osm: { type: "way", id },
    sourceLabel: `way/${id}`,
    candidateType,
    tags: {
      man_made: "pier",
      floating: "yes",
      ...(width ? { width: String(width) } : {})
    },
    points
  };
}

function fishboneNetwork() {
  return [
    pier(1, [{ east: 0, north: 0 }, { east: 60, north: 0 }], "pontoon", 2.4),
    pier(2, [{ east: 12, north: 0 }, { east: 12, north: 10 }]),
    pier(3, [{ east: 12, north: 0 }, { east: 12, north: -10 }]),
    pier(4, [{ east: 30, north: 0 }, { east: 30, north: 11 }]),
    pier(5, [{ east: 30, north: 0 }, { east: 30, north: -9 }]),
    pier(6, [{ east: 48, north: 0 }, { east: 48, north: 10 }]),
    pier(7, [{ east: 48, north: 0 }, { east: 48, north: -10 }])
  ];
}

test("découpe graphe: l’axe principal et six catways restent raccordés sans discontinuité", () => {
  const proposal = Decomposition.proposePontoonDecomposition(fishboneNetwork(), 0);
  assert.equal(proposal.available, true);
  assert.equal(proposal.diagnostics.method, "line-graph");
  assert.equal(proposal.objects.pontoons.length, 1);
  assert.equal(proposal.objects.catways.length, 6);
  assert.equal(proposal.continuity.length, 6);
  assert.equal(proposal.continuityValid, true);
  assert.ok(proposal.maximumGap <= 0.005);
  assert.ok(Math.abs(proposal.objects.pontoons[0].length - 60) < 1e-9);
  for (const junction of proposal.continuity) {
    const catway = proposal.objects.catways[junction.childIndex];
    assert.ok(Decomposition.distance(catway.endpoints.start, junction.point) < 1e-12);
    assert.equal(junction.gap, 0);
  }
});

test("découpe surface: une emprise en peigne devient un ponton et trois doigts", () => {
  const polygon = [
    { east: 0, north: -1.5 },
    { east: 60, north: -1.5 },
    { east: 60, north: 1.5 },
    { east: 51, north: 1.5 },
    { east: 51, north: 10 },
    { east: 49, north: 10 },
    { east: 49, north: 1.5 },
    { east: 31, north: 1.5 },
    { east: 31, north: 10 },
    { east: 29, north: 10 },
    { east: 29, north: 1.5 },
    { east: 11, north: 1.5 },
    { east: 11, north: 10 },
    { east: 9, north: 10 },
    { east: 9, north: 1.5 },
    { east: 0, north: 1.5 },
    { east: 0, north: -1.5 }
  ];
  const proposal = Decomposition.proposePontoonDecomposition([
    pier(10, polygon, "pontoon")
  ], 0);
  assert.equal(proposal.available, true);
  assert.equal(proposal.diagnostics.method, "area-profile");
  assert.equal(proposal.objects.pontoons.length, 1);
  assert.equal(proposal.objects.catways.length, 3);
  assert.equal(proposal.continuityValid, true);
  assert.ok(proposal.objects.pontoons[0].length > 55);
  assert.ok(proposal.objects.catways.every(catway => catway.length > 7));
});

test("découpe: un rectangle simple n’est pas sur-segmenté", () => {
  const rectangle = [
    { east: 0, north: -1.5 },
    { east: 40, north: -1.5 },
    { east: 40, north: 1.5 },
    { east: 0, north: 1.5 },
    { east: 0, north: -1.5 }
  ];
  const proposal = Decomposition.proposePontoonDecomposition([
    pier(20, rectangle, "pontoon")
  ], 0);
  assert.equal(proposal.available, false);
  assert.equal(proposal.diagnostics.simple, true);
});

test("découpe: résultat déterministe et borné sur 500 exécutions", () => {
  const candidates = fishboneNetwork();
  const reference = Decomposition.proposePontoonDecomposition(candidates, 0);
  for (let index = 0; index < 500; index += 1) {
    const next = Decomposition.proposePontoonDecomposition(candidates, 0);
    assert.equal(next.signature, reference.signature);
    assert.equal(next.maximumGap, 0);
  }
});

test("découpe: l’index spatial borne la recherche sur un millier de pannes", () => {
  const candidates = fishboneNetwork();
  for (let index = 0; index < 1000; index += 1) {
    const east = 500 + (index % 50) * 30;
    const north = 500 + Math.floor(index / 50) * 30;
    candidates.push(pier(
      1000 + index,
      [{ east, north }, { east: east + 18, north }],
      "pontoon"
    ));
  }
  const start = performance.now();
  const proposal = Decomposition.proposePontoonDecomposition(candidates, 0);
  const elapsed = performance.now() - start;
  assert.equal(proposal.objects.catways.length, 6);
  assert.ok(elapsed < 150, `découpe en ${elapsed.toFixed(1)} ms`);
});
