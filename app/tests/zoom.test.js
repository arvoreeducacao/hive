const { test } = require("node:test");
const assert = require("node:assert");
const { STEP, FLOOR, CEIL, nextLevel, viewMenu } = require("../main/zoom.js");

test("zooming in and out walks one step at a time", () => {
  assert.equal(nextLevel(0, STEP), STEP);
  assert.equal(nextLevel(STEP, STEP), STEP * 2);
  assert.equal(nextLevel(0, -STEP), -STEP);
});

test("actual size comes back to zero from anywhere", () => {
  assert.equal(nextLevel(3, null), 0);
  assert.equal(nextLevel(-2, null), 0);
  assert.equal(nextLevel(0, null), 0);
});

test("zoom stops at the floor and at the ceiling", () => {
  assert.equal(nextLevel(CEIL, STEP), CEIL);
  assert.equal(nextLevel(FLOOR, -STEP), FLOOR);
});

test("a level that is not a number falls back to actual size", () => {
  assert.equal(nextLevel(undefined, STEP), 0);
  assert.equal(nextLevel(NaN, -STEP), 0);
});

test("the view menu carries zoom items of its own instead of the electron role", () => {
  const items = viewMenu(() => {});
  assert.deepEqual(items.filter((i) => i.label).map((i) => i.label), ["Actual Size", "Zoom In", "Zoom In", "Zoom Out"]);
  for (const item of items) if (item.label) assert.equal(typeof item.click, "function");
});

test("cmd+= zooms in as well, which the electron role never bound on a mac", () => {
  const items = viewMenu(() => {});
  const bound = items.filter((i) => i.label === "Zoom In").map((i) => i.accelerator);
  assert.ok(bound.includes("CommandOrControl+Plus"));
  assert.ok(bound.includes("CommandOrControl+="));
  assert.equal(items.find((i) => i.accelerator === "CommandOrControl+=").visible, false);
});

test("actual size and zoom out keep the keys people already know", () => {
  const items = viewMenu(() => {});
  assert.equal(items.find((i) => i.label === "Actual Size").accelerator, "CommandOrControl+0");
  assert.equal(items.find((i) => i.label === "Zoom Out").accelerator, "CommandOrControl+-");
});

test("every zoom item asks for the step it promises", () => {
  const asked = [];
  const items = viewMenu((step) => asked.push(step));
  for (const item of items) if (item.label) item.click();
  assert.deepEqual(asked, [null, STEP, STEP, -STEP]);
});
