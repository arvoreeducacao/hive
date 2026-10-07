import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanBlockSize, cleanPatch, BLOCK_SIZE_DEFAULT, BLOCK_SIZE_RANGE } from "../lib/config.mjs";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const st = await state();
const { tidy } = await app("blocks");
const { GRID_ROWS } = await app("focus-navigation");
await app("themes");

const roomFor = (limit) => {
  st.LIMIT = limit;
  st.spaces = [{ id: "w0", name: "", tint: "" }];
  st.space = "w0";
  st.block = 0;
};

const lay = (shape) => { st.blocks = shape.map((keys, i) => ({ id: `b${i}`, ws: "w0", label: "", manual: false, keys: [...keys] })); };
const live = (names) => { st.data = { sessions: names.map((name) => ({ name })), spawning: [], archived: [], pod: {} }; st.seatsKnown = true; };
const shape = () => st.blocks.map((b) => [...b.keys]);

test("with room for 6 the fifth chat joins the block you are on instead of opening the next", () => {
  roomFor(6);
  lay([["a", "b", "c", "d"]]);
  live(["a", "b", "c", "d", "e"]);
  tidy();
  assert.deepEqual(shape(), [["a", "b", "c", "d", "e"]]);
});

test("with room for 6 the seventh chat is the one that opens a new block", () => {
  roomFor(6);
  lay([["a", "b", "c", "d", "e", "f"]]);
  live(["a", "b", "c", "d", "e", "f", "g"]);
  tidy();
  assert.deepEqual(shape(), [["a", "b", "c", "d", "e", "f"], ["g"]]);
});

test("with room for 2 a block fills with a pair and the rest moves on", () => {
  roomFor(2);
  lay([["a"]]);
  live(["a", "b", "c"]);
  tidy();
  assert.deepEqual(shape(), [["a", "b"], ["c"]]);
});

test("the config accepts a size inside the range and turns the rest away", () => {
  const problems = [];
  assert.equal(cleanBlockSize(undefined, "here", problems), BLOCK_SIZE_DEFAULT);
  assert.equal(cleanBlockSize(6, "here", problems), 6);
  assert.equal(cleanBlockSize(2, "here", problems), 2);
  assert.equal(cleanBlockSize(7, "here", problems), BLOCK_SIZE_DEFAULT);
  assert.equal(cleanBlockSize(1, "here", problems), BLOCK_SIZE_DEFAULT);
  assert.equal(cleanBlockSize("4", "here", problems), BLOCK_SIZE_DEFAULT);
  assert.deepEqual(problems, [
    `here: blockSize should be a number between ${BLOCK_SIZE_RANGE[0]} and ${BLOCK_SIZE_RANGE[1]}`,
    `here: blockSize should be a number between ${BLOCK_SIZE_RANGE[0]} and ${BLOCK_SIZE_RANGE[1]}`,
    `here: blockSize should be a number between ${BLOCK_SIZE_RANGE[0]} and ${BLOCK_SIZE_RANGE[1]}`
  ]);
});

test("the patch carries the size through the same cleaning as the layout", () => {
  const { clean, problems } = cleanPatch({ blockSize: 6 });
  assert.equal(clean.blockSize, 6);
  assert.deepEqual(problems, []);
});

test("the server reads the size from the file", () => {
  assert.match(server, /blockSize: cleanBlockSize\(raw\.blockSize/);
});

test("the screen has the layouts and the field the size asks for", () => {
  assert.match(page, /#canvas\.g5 \{/);
  assert.match(page, /#canvas\.g6 \{/);
  assert.deepEqual(GRID_ROWS[5], [[0, 1, 2], [3, 4]]);
  assert.deepEqual(GRID_ROWS[6], [[0, 1, 2], [3, 4, 5]]);
  const field = document.getElementById("f-size");
  assert.equal(field.type, "number");
  assert.equal(field.min, "2");
  assert.equal(field.max, "6");
});

test("typing a size into the field is what moves the limit", () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const field = document.getElementById("f-size");
  live(["a"]);
  roomFor(4);
  field.value = "6";
  field.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(st.LIMIT, 6);
  field.value = "9";
  field.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(st.LIMIT, BLOCK_SIZE_DEFAULT, "a size outside the range falls back instead of sticking");
  globalThis.fetch = saved;
});
