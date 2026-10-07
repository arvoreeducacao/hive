import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { sendSeatToBlockAt, stepSendSeat } = await app("focus-navigation");

st.LIMIT = 4;

const lay = (shape, block = 0, focus = 0) => {
  st.blocks = shape.map((keys, i) => ({ id: `b${i}`, ws: st.space, label: "", manual: false, keys: [...keys] }));
  st.data = { sessions: shape.flat().map((n) => ({ name: n, where: "local", state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
  st.open = null;
  st.block = block;
  st.focus = focus;
};

const keysOf = () => st.blocks.map((b) => [...b.keys]);

const focused = () => st.blocks[st.block].keys[st.focus];

test("the focused chat goes to the next block and the focus goes with it", () => {
  lay([["a", "b"], ["c"]], 0, 1);
  stepSendSeat(1);
  assert.deepEqual(keysOf(), [["a"], ["c", "b"]]);
  assert.equal(focused(), "b");
});

test("the focused chat goes to the previous block and the focus goes with it", () => {
  lay([["a"], ["c", "b"]], 1, 1);
  stepSendSeat(-1);
  assert.deepEqual(keysOf(), [["a", "b"], ["c"]]);
  assert.equal(focused(), "b");
});

test("past the last block the chat gets a block of its own", () => {
  lay([["a", "b"]], 0, 0);
  stepSendSeat(1);
  assert.deepEqual(keysOf(), [["b"], ["a"]]);
  assert.equal(focused(), "a");
});

test("before the first block nothing moves", () => {
  lay([["a", "b"], ["c"]], 0, 0);
  stepSendSeat(-1);
  assert.deepEqual(keysOf(), [["a", "b"], ["c"]]);
});

test("a number sends the focused chat to that block", () => {
  lay([["a", "b"], ["c"], ["d"]], 0, 0);
  sendSeatToBlockAt(2);
  assert.deepEqual(keysOf(), [["b"], ["c"], ["d", "a"]]);
  assert.equal(focused(), "a");
});

test("a number past the last block does nothing", () => {
  lay([["a", "b"], ["c"]], 0, 0);
  sendSeatToBlockAt(5);
  assert.deepEqual(keysOf(), [["a", "b"], ["c"]]);
});
