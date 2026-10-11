"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const physics = require("../src/simulateur-port/physics-core.js");
const { createController } = require("../src/simulateur-port/boat-placement.js");
const profile = physics.createSimulator().getProfile();
const controller = obstacles => createController({ physics, profile, obstacles });
const eastPose = east => ({ east, north: 0, heading: Math.PI / 2 });

for (const [kind, item] of [
  ["rectangles", { id: "quay", east: 0, north: 0, width: .08, height: 40 }],
  ["polylines", { id: "catway", width: .04, points: [{ east: 0, north: -20 }, { east: 0, north: 20 }] }],
  ["polygons", { id: "land", points: [{ east: 0, north: -20 }, { east: 2, north: -20 }, { east: 2, north: 20 }, { east: 0, north: 20 }] }],
  ["boats", { id: "boat", east: 0, north: 0, heading: 0, length: 12, beam: 4 }],
  ["circles", { id: "buoy", east: 0, north: 0, radius: .2 }]
]) test("placement stops a fast translation at " + kind, () => {
  const c = controller({ [kind]: [item] });
  const from = eastPose(-15), to = eastPose(15);
  assert.equal(c.inspect(from).valid, true);
  assert.equal(c.inspect(to).valid, true);
  const result = c.move(from, to);
  assert.equal(result.blocked, true);
  assert.equal(result.inspection.valid, true);
  assert.ok(result.pose.east < 0);
  assert.equal(result.contact.id, item.id);
  assert.deepEqual(from, eastPose(-15));
});

test("rotation checks its swept envelope with clear endpoints", () => {
  const c = controller({ circles: [{ id: "buoy", east: 4, north: 0, radius: .15 }] });
  const from = { east: 0, north: 0, heading: 0 }, to = { ...from, heading: Math.PI };
  assert.equal(c.inspect(from).valid, true);
  assert.equal(c.inspect(to).valid, true);
  const result = c.move(from, to);
  assert.equal(result.blocked, true);
  assert.equal(result.inspection.valid, true);
  assert.ok(Math.abs(result.pose.heading) < Math.PI);
});

test("large empty-water movement is accepted and disabled obstacles are ignored", () => {
  const c = controller({ rectangles: [{ id: "decoration", east: 0, north: 0, width: 1, height: 40, collision: false }] });
  const result = c.move(eastPose(-1000), eastPose(1000));
  assert.equal(result.blocked, false);
  assert.deepEqual(result.pose, eastPose(1000));
});

test("hidden rectangle joins are not contact surfaces", () => {
  const c = controller({ rectangles: [{ id: "join", east: 0, north: 0, width: 2, height: 20, hiddenFaces: ["x0"] }] });
  assert.equal(c.inspect(eastPose(-5.8)).valid, true);
  assert.equal(c.inspect(eastPose(5.8)).valid, false);
});

test("an overlapping start can escape, but cannot move further into its blocker", () => {
  const c = controller({ rectangles: [{ id: "quay", east: 0, north: 0, width: 1, height: 30 }] });
  const from = eastPose(-5);
  assert.equal(c.inspect(from).valid, false);
  assert.equal(c.move(from, eastPose(-3)).blocked, true);
  const escaped = c.move(from, eastPose(-12));
  assert.equal(escaped.blocked, false);
  assert.equal(escaped.inspection.valid, true);
});

test("an obstacle enclosed inside the initial hull is detected", () => {
  const c = controller({ circles: [{ id: "inside", east: 0, north: 0, radius: .02 }] });
  assert.equal(c.inspect(eastPose(0)).valid, false);
});

test("an occupied bow cannot move deeper into a thin quay", () => {
  const c = controller({ polylines: [{ id: "quay", width: .1,
    points: [{ east: 0, north: -20 }, { east: 0, north: 20 }] }] });
  const from = eastPose(-5);
  assert.equal(c.inspect(from).valid, false);
  assert.equal(c.move(from, eastPose(-4)).blocked, true);
  const escape = c.move(from, eastPose(-6));
  assert.equal(escape.blocked, false);
  assert.equal(escape.inspection.valid, true);
});

test("invalid input cannot replace a valid pose", () => {
  const c = controller({});
  assert.equal(c.inspect({ east: NaN, north: 0, heading: 0 }).valid, false);
  const result = c.move(eastPose(0), eastPose(Infinity));
  assert.equal(result.blocked, true);
  assert.deepEqual(result.pose, eastPose(0));
});

test("a long diagonal drag glides along a quay without a distance or acceleration cap", () => {
  const c = controller({ rectangles: [{ id: "quay", east: 0, north: 0, width: .1, height: 400 }] });
  const from = { ...eastPose(-15), north: -60 }, target = { ...eastPose(15), north: 60 };
  const result = c.move(from, target);
  assert.equal(result.sliding, true);
  assert.equal(result.inspection.valid, true);
  assert.ok(result.pose.east < -5);
  assert.ok(Math.abs(result.pose.north - target.north) < 1e-5);
  const away = c.move(result.pose, { ...result.pose, east: result.pose.east - .5 });
  assert.equal(away.blocked, false);
  assert.ok(away.pose.east < result.pose.east - .49);
});

test("contact with an oblique quay preserves the tangential movement", () => {
  const c = controller({ rectangles: [{ id: "quay", east: 0, north: 0, heading: Math.PI / 4, width: 200, height: .1 }] });
  const from = { east: -20, north: 20, heading: 0 }, target = { east: 20, north: 20, heading: 0 };
  const result = c.move(from, target);
  assert.equal(result.sliding, true);
  assert.equal(result.inspection.valid, true);
  assert.ok(result.pose.north > 20);
  assert.ok(result.pose.east > from.east);
});

for (const [kind, shape] of [
  ["polylines", { id: "corner", width: .1, points: [{ east: 0, north: -40 }, { east: 0, north: 0 }, { east: -40, north: 0 }] }],
  ["polygons", { id: "corner", points: [{ east: 0, north: -40 }, { east: 5, north: -40 }, { east: 5, north: 5 },
    { east: -40, north: 5 }, { east: -40, north: 0 }, { east: 0, north: 0 }] }]
]) test("sliding respects both arms of a concave " + kind + " and can pull away", () => {
  const c = controller({ [kind]: [shape] });
  const from = { ...eastPose(-15), north: -15 }, target = { ...eastPose(15), north: 15 };
  const result = c.move(from, target);
  assert.equal(result.sliding, true);
  assert.equal(result.inspection.valid, true);
  assert.ok(result.pose.east < -5 && result.pose.north < -1.9);
  const escape = c.move(result.pose, from);
  assert.equal(escape.blocked, false);
  assert.equal(escape.inspection.valid, true);
});

for (const [kind, shape] of [
  ["boats", { id: "boat", east: 0, north: 0, heading: 0, length: 12, beam: 4 }],
  ["circles", { id: "buoy", east: 0, north: 0, radius: .5 }]
]) test("diagonal contact with " + kind + " permits sliding without overlap", () => {
  const c = controller({ [kind]: [shape] });
  const from = { ...eastPose(-15), north: -10 }, target = { ...eastPose(15), north: 10 };
  const result = c.move(from, target);
  assert.equal(result.sliding, true);
  assert.equal(result.inspection.valid, true);
  assert.ok(Math.hypot(result.pose.east - from.east, result.pose.north - from.north) > 10);
});
