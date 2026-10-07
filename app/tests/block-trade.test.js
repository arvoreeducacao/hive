import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { landOnBlock, seatsToTradeOn } = await app("blocks");

function lay(shape) {
  const keys = shape.flatMap((b) => b.keys);
  st.LIMIT = 4;
  st.data = { sessions: keys.map((name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: "w0", label: "", manual: !!b.manual, keys: [...b.keys] }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
}

const keysOf = () => st.blocks.map((b) => [...b.keys]);

test("a block with room just takes the seat, and nobody is traded away", () => {
  lay([{ keys: ["a", "b", "c", "d"] }, { keys: ["e", "f"] }]);
  assert.equal(landOnBlock("a", 1), true);
  assert.deepEqual(keysOf(), [["b", "c", "d"], ["e", "f", "a"]]);
});

test("a full block takes the seat by trading the one you dropped on", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d", "e", "f"] }]);
  assert.equal(landOnBlock("a", 1, "d"), true);
  assert.deepEqual(keysOf(), [["d", "b"], ["c", "a", "e", "f"]]);
});

test("dropping on the tab and not on a name trades with the last of that block", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d", "e", "f"] }]);
  landOnBlock("a", 1);
  assert.deepEqual(keysOf(), [["f", "b"], ["c", "d", "e", "a"]]);
});

test("a name that is not in the target block falls back to the last, never to nothing", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d", "e", "f"] }]);
  landOnBlock("a", 1, "zzz");
  assert.deepEqual(keysOf(), [["f", "b"], ["c", "d", "e", "a"]]);
});

test("both blocks are marked by hand, so nothing rearranges them afterwards", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d", "e", "f"] }]);
  landOnBlock("a", 1, "d");
  assert.deepEqual(st.blocks.map((b) => b.manual), [true, true]);
});

test("landing a seat on the block it already sits in does nothing at all", () => {
  lay([{ keys: ["a", "b", "c", "d"] }]);
  assert.equal(landOnBlock("a", 0, "c"), false);
  assert.deepEqual(keysOf(), [["a", "b", "c", "d"]]);
});

test("a block that is not there is not a place to land", () => {
  lay([{ keys: ["a", "b"] }]);
  assert.equal(landOnBlock("a", 7), false);
});

test("the names to choose from are the full block's own, and only when it is full", () => {
  lay([{ keys: ["a", "b"] }, { keys: ["c", "d", "e", "f"] }, { keys: ["g"] }]);
  assert.deepEqual(seatsToTradeOn(1, "a"), ["c", "d", "e", "f"]);
  assert.deepEqual(seatsToTradeOn(2, "a"), []);
  assert.deepEqual(seatsToTradeOn(1, "c"), []);
});
