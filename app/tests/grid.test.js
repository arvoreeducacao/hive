import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const page = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "app.html"), "utf8");

const st = await state();
await views();
const { stepFocus, stepMove } = await app("focus-navigation");

const lay = (n, at, layout = "grid") => {
  st.LIMIT = 4;
  st.seatLayout = layout;
  st.moveMode = "navigate";
  st.open = null;
  st.space = "w0";
  st.spaces = [{ id: "w0", name: "", tint: "#CD694A" }];
  const keys = Array.from({ length: n }, (_, i) => `s${i}`);
  st.data = { sessions: keys.map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys }];
  st.block = 0;
  st.focus = at;
};

const keysNow = () => [...st.blocks[0].keys];

test("3 seats: the third stands tall on the right, so right from either tile on the left lands on it", () => {
  lay(3, 0);
  stepFocus(1, 0);
  assert.equal(st.focus, 2);
  lay(3, 1);
  stepFocus(1, 0);
  assert.equal(st.focus, 2);
});

test("3 seats: the tall tile has no neighbour above or below", () => {
  lay(3, 2);
  stepFocus(0, 1);
  assert.equal(st.focus, 2);
  stepFocus(0, -1);
  assert.equal(st.focus, 2);
});

test("3 seats: the two on the left are stacked, so up and down walk between them", () => {
  lay(3, 1);
  stepFocus(0, -1);
  assert.equal(st.focus, 0);
  lay(3, 0);
  stepFocus(-1, 0);
  assert.equal(st.focus, 0);
});

test("3 seats: moving the tall tile left swaps it with the one beside it", () => {
  lay(3, 2);
  stepMove(-1, 0);
  assert.deepEqual(keysNow(), ["s2", "s1", "s0"]);
});

test("3 seats: moving the top left tile up is a no-op, never a self-swap", () => {
  lay(3, 0);
  stepMove(0, -1);
  assert.deepEqual(keysNow(), ["s0", "s1", "s2"]);
});

test("4 seats keep the 2x2 walk", () => {
  lay(4, 3);
  stepFocus(0, -1);
  assert.equal(st.focus, 1);
  lay(4, 0);
  stepFocus(0, 1);
  assert.equal(st.focus, 2);
});

test("side by side: the walk is one row, and up and down lead nowhere", () => {
  lay(4, 0, "row");
  stepFocus(1, 0);
  assert.equal(st.focus, 1);
  lay(4, 3, "row");
  stepFocus(1, 0);
  assert.equal(st.focus, 3);
  lay(4, 2, "row");
  stepFocus(0, 1);
  assert.equal(st.focus, 2);
  stepFocus(0, -1);
  assert.equal(st.focus, 2);
});

test("side by side: moving a seat swaps it with the one next to it", () => {
  lay(4, 1, "row");
  stepMove(1, 0);
  assert.deepEqual(keysNow(), ["s0", "s2", "s1", "s3"]);
});

test("side by side: the row reset undoes the grid-of-three placement, so it must tie its specificity and come later", () => {
  const placed = page.indexOf("#canvas.g3 > .tile:nth-child(3)");
  const reset = page.indexOf("#canvas.row > .tile:nth-child(n)");
  assert.ok(placed > -1, "the grid of three still places its tiles by hand");
  assert.ok(reset > placed, "without :nth-child(n) the row reset loses to the grid of three and one seat ends up squeezed below");
});

const twoBlocks = (left, right, block, at, layout = "row") => {
  lay(left, at, layout);
  const keys = Array.from({ length: right }, (_, i) => `r${i}`);
  st.data.sessions.push(...keys.map((name) => ({ name, state: "idle" })));
  st.blocks.push({ id: "b1", ws: "w0", label: "", manual: true, keys });
  st.block = block;
  st.focus = at;
  st.keyHeld = false;
};

test("side by side: right from the last seat goes on to the first seat of the block beside it", () => {
  twoBlocks(3, 2, 0, 2);
  stepFocus(1, 0);
  assert.equal(st.block, 1);
  assert.equal(st.focus, 0);
});

test("side by side: left from the first seat comes back to the last seat of the block before", () => {
  twoBlocks(3, 2, 1, 0);
  stepFocus(-1, 0);
  assert.equal(st.block, 0);
  assert.equal(st.focus, 2);
});

test("past the last block of the space the focus stops at the edge", () => {
  twoBlocks(3, 2, 1, 1);
  stepFocus(1, 0);
  assert.equal(st.block, 1);
  assert.equal(st.focus, 1);
  twoBlocks(3, 2, 0, 0);
  stepFocus(-1, 0);
  assert.equal(st.block, 0);
  assert.equal(st.focus, 0);
});

test("a held key runs to the edge and stops there instead of crossing", () => {
  twoBlocks(3, 2, 0, 2);
  st.keyHeld = true;
  stepFocus(1, 0);
  assert.equal(st.block, 0);
  assert.equal(st.focus, 2);
  st.keyHeld = false;
});

test("up and down never cross into another block", () => {
  twoBlocks(3, 2, 0, 2);
  stepFocus(0, 1);
  assert.equal(st.block, 0);
  assert.equal(st.focus, 2);
});

test("in the grid the crossing lands on the seat facing the row it left", () => {
  twoBlocks(4, 4, 0, 3, "grid");
  stepFocus(1, 0);
  assert.equal(st.block, 1);
  assert.equal(st.focus, 2);
  twoBlocks(4, 4, 1, 0, "grid");
  stepFocus(-1, 0);
  assert.equal(st.block, 0);
  assert.equal(st.focus, 1);
});

test("a block of another space is not beside this one", () => {
  twoBlocks(3, 2, 0, 2);
  st.spaces.push({ id: "w1", name: "", tint: "#4A8ACD" });
  st.blocks[1].ws = "w1";
  stepFocus(1, 0);
  assert.equal(st.block, 0);
  assert.equal(st.focus, 2);
});
