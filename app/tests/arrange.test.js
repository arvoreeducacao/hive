import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { SPACE_TINTS } = await app("blocks");
const { arrangeDrop, arrangeFloorStep, arrangeKeys, arrangeNewCard, arrangeStep, arrangeTake, deckFloor } = await app("arrange");

const STORED = ["hive.blocks", "hive.block", "hive.detached", "hive.spaces", "hive.space"];

const laySpaces = (names) => {
  st.spaces = names.map((name, i) => ({ id: `w${i}`, name, tint: SPACE_TINTS[i % SPACE_TINTS.length] }));
  st.space = st.spaces[0].id;
  st.arrangeFloor = st.space;
};

const lay = (shape, at) => {
  for (const key of STORED) localStorage.removeItem(key);
  st.LIMIT = 4;
  st.focus = 0;
  st.open = null;
  st.mirrorDev = "";
  st.seatsKnown = true;
  const keys = shape.flatMap((b) => b.keys);
  st.data = { sessions: keys.map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: b.ws || "w0", label: "", manual: !!b.manual, keys: [...b.keys] }));
  st.block = at || 0;
  st.arrangeHeld = null;
  st.arrangeCursor = { i: 0, j: 0 };
};

const one = () => { laySpaces([""]); };

const shape = () => st.blocks.map((b) => ({ ws: b.ws, manual: b.manual, keys: [...b.keys] }));
const cursor = () => ({ ...st.arrangeCursor });
const held = () => st.arrangeHeld;

const four = [
  { manual: true, keys: ["a1", "a2", "a3", "a4"] },
  { manual: true, keys: ["b1", "b2", "b3"] },
  { manual: true, keys: ["c1", "c2"] }
];

const press = (key, mods) => ({ key, code: key === " " ? "Space" : key, preventDefault() {}, ...(mods || {}) });

test("a seat dropped on a free slot lands in that block", () => {
  one();
  lay(four);
  arrangeDrop("a1", 2, null);
  assert.deepEqual(shape()[0].keys, ["a2", "a3", "a4"]);
  assert.deepEqual(shape()[1].keys, ["b1", "b2", "b3"], "with room to spare nothing is traded");
  assert.deepEqual(shape()[2].keys, ["c1", "c2", "a1"]);
});

test("a seat dropped on a name in a full block trades with that one, not with the last", () => {
  one();
  lay(four);
  arrangeDrop("c1", 0, "a2");
  assert.deepEqual(shape()[0].keys, ["a1", "c1", "a3", "a4"]);
  assert.deepEqual(shape()[2].keys, ["a2", "c2"]);
});

test("dropping on a name inside the same block reorders it, and moves nobody out", () => {
  one();
  lay(four);
  arrangeDrop("a1", 0, "a4");
  assert.deepEqual(shape()[0].keys, ["a4", "a2", "a3", "a1"]);
  assert.equal(shape().length, 3, "no block was opened or closed");
});

test("dropping on the new-block card opens one and moves the seat there", () => {
  one();
  lay(four);
  arrangeDrop("b2", arrangeNewCard(), null);
  assert.deepEqual(shape()[1].keys, ["b1", "b3"]);
  assert.deepEqual(shape()[3].keys, ["b2"]);
  assert.equal(shape()[3].manual, true, "the new block is manual, so tidy leaves it alone");
});

test("the only seat of a block is already alone — the new-block card does nothing to it", () => {
  one();
  lay([{ manual: true, keys: ["a1"] }, { manual: true, keys: ["b1", "b2"] }]);
  arrangeDrop("a1", arrangeNewCard(), null);
  assert.equal(shape().length, 2);
  assert.deepEqual(shape()[0].keys, ["a1"]);
});

test("a full block that is not the one being aimed at is left alone", () => {
  one();
  lay(four);
  arrangeDrop("c2", 1, null);
  assert.deepEqual(shape()[0].keys, ["a1", "a2", "a3", "a4"]);
  assert.deepEqual(shape()[1].keys, ["b1", "b2", "b3", "c2"]);
});

test("the cursor follows the seat to where it landed", () => {
  one();
  lay(four);
  arrangeDrop("a1", 2, null);
  assert.deepEqual(cursor(), { i: 2, j: 2 });
});

test("clicking a seat picks it up, and clicking the same one puts it down where it was", () => {
  one();
  lay(four);
  arrangeTake("b1", 1, 0);
  assert.equal(held(), "b1");
  arrangeTake("b1", 1, 0);
  assert.equal(held(), null);
  assert.deepEqual(shape()[1].keys, ["b1", "b2", "b3"], "putting it down where it was moves nothing");
});

test("a drop always lets go of the seat, even when it changed nothing", () => {
  one();
  lay(four);
  st.arrangeHeld = "a1";
  arrangeDrop("a1", 0, null);
  assert.equal(held(), null);
});

test("the cursor walks the cards and stops at the new-block one", () => {
  one();
  lay(four);
  st.arrangeCursor = { i: 0, j: 0 };
  arrangeStep(1, 0);
  assert.deepEqual(cursor(), { i: 1, j: 0 });
  arrangeStep(1, 0);
  arrangeStep(1, 0);
  assert.deepEqual(cursor(), { i: 3, j: 0 }, "three blocks, so the fourth card is the new one");
  arrangeStep(1, 0);
  assert.deepEqual(cursor(), { i: 3, j: 0 }, "and there is nothing past it");
  arrangeStep(-1, 0);
  assert.deepEqual(cursor(), { i: 2, j: 0 });
});

test("the cursor walks the seats of a card without leaving it", () => {
  one();
  lay(four);
  st.arrangeCursor = { i: 0, j: 0 };
  arrangeStep(0, 1);
  arrangeStep(0, 1);
  assert.deepEqual(cursor(), { i: 0, j: 2 });
  arrangeStep(0, 1);
  arrangeStep(0, 1);
  assert.deepEqual(cursor(), { i: 0, j: 3 }, "a block holds four, so the fourth is the last");
  arrangeStep(0, -1);
  assert.deepEqual(cursor(), { i: 0, j: 2 });
});

test("landing on the new-block card puts the cursor on its first seat, not on a slot", () => {
  one();
  lay(four);
  st.arrangeCursor = { i: 0, j: 3 };
  arrangeStep(1, 0);
  arrangeStep(1, 0);
  arrangeStep(1, 0);
  assert.deepEqual(cursor(), { i: 3, j: 0 });
});

test("a key with a modifier is not swallowed, so the chord that opened the panel closes it", () => {
  one();
  lay(four);
  assert.equal(arrangeKeys(press("l", { ctrlKey: true })), false);
  assert.equal(arrangeKeys(press("ArrowRight")), true, "a bare key is the panel's");
});

test("escape with a seat in hand lets go of it before it closes anything", () => {
  one();
  lay(four);
  st.arrangeHeld = "a1";
  arrangeKeys(press("Escape"));
  assert.equal(held(), null);
  assert.deepEqual(shape()[0].keys, ["a1", "a2", "a3", "a4"], "letting go moves nobody");
});

test("space picks a seat up and space on another block puts it down there", () => {
  one();
  lay(four);
  st.arrangeCursor = { i: 1, j: 0 };
  arrangeKeys(press(" "));
  assert.equal(held(), "b1");
  st.arrangeCursor = { i: 2, j: 0 };
  arrangeKeys(press(" "));
  assert.equal(held(), null);
  assert.deepEqual(shape()[1].keys, ["b2", "b3"]);
  assert.deepEqual(shape()[2].keys, ["c1", "c2", "b1"], "a block with room just takes the seat — nobody is traded out of it");
});

test("space on an empty slot of another block moves the seat there", () => {
  one();
  lay(four);
  st.arrangeCursor = { i: 0, j: 0 };
  arrangeKeys(press(" "));
  st.arrangeCursor = { i: 2, j: 2 };
  arrangeKeys(press(" "));
  assert.deepEqual(shape()[0].keys, ["a2", "a3", "a4"]);
  assert.deepEqual(shape()[2].keys, ["c1", "c2", "a1"]);
});

test("the shift arrows change floor, and the cursor starts on the first card of the one you reached", () => {
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a", "b"] }, { ws: "w1", keys: ["c"] }], 0);
  st.space = "w0";
  st.arrangeFloor = "w0";
  arrangeFloorStep(1);
  assert.equal(deckFloor(), "w1");
  assert.deepEqual(cursor(), { i: 1, j: 0 });
  arrangeFloorStep(-1);
  assert.equal(deckFloor(), "w0");
  assert.deepEqual(cursor(), { i: 0, j: 0 });
});

test("the pile stops at its ends instead of wrapping to the other side of the building", () => {
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a"] }, { ws: "w1", keys: ["b"] }], 0);
  st.arrangeFloor = "w0";
  arrangeFloorStep(-1);
  assert.equal(deckFloor(), "w0");
  st.arrangeFloor = "w1";
  arrangeFloorStep(1);
  assert.equal(deckFloor(), "w1");
});

test("left and right walk the cards of the floor at the front, and never a card of another one", () => {
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a"] }, { ws: "w1", keys: ["b"] }, { ws: "w1", keys: ["c"] }], 0);
  st.space = "w1";
  st.arrangeFloor = "w1";
  st.arrangeCursor = { i: 1, j: 0 };
  arrangeStep(1, 0);
  assert.equal(cursor().i, 2);
  arrangeStep(1, 0);
  assert.equal(cursor().i, arrangeNewCard(), "past the last card is the new-block one");
  arrangeStep(1, 0);
  assert.equal(cursor().i, arrangeNewCard(), "and it stops there");
  arrangeStep(-1, 0);
  arrangeStep(-1, 0);
  assert.equal(cursor().i, 1, "walking back stops at the first card of this floor, not at block 0");
});

test("a seat dropped on the new-block card opens it on the floor at the front", () => {
  laySpaces(["crm", "hive"]);
  lay([{ ws: "w0", keys: ["a", "b"] }], 0);
  st.space = "w0";
  st.arrangeFloor = "w1";
  arrangeDrop("b", arrangeNewCard(), null);
  assert.deepEqual(shape().map((b) => [b.ws, b.keys]), [["w0", ["a"]], ["w1", ["b"]]]);
});
