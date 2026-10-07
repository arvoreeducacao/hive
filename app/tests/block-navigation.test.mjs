import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { stepBlock } = await app("focus-navigation");

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

const BLOCKS = () => [
  { id: "a1", ws: "a", label: "", manual: true, keys: ["s1"] },
  { id: "a2", ws: "a", label: "", manual: true, keys: ["s2"] },
  { id: "b1", ws: "b", label: "", manual: true, keys: ["s3"] },
  { id: "b2", ws: "b", label: "", manual: true, keys: ["s4"] }
];

function hive({ space, block, without }) {
  const blocks = BLOCKS().filter((one) => one.ws !== without);
  st.LIMIT = 4;
  st.data = { sessions: blocks.flatMap((one) => one.keys).map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = blocks;
  st.spaces = [{ id: "a", name: "a" }, { id: "b", name: "b" }];
  st.space = space;
  st.block = block;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
}

test("walking backward across a workspace renders only its last block", () => {
  hive({ space: "b", block: 2 });
  stepBlock(-1);
  assert.equal(st.blocks[st.block].id, "a2");
  assert.equal(st.space, "a");
});

test("walking forward across a workspace renders only its first block", () => {
  hive({ space: "a", block: 1 });
  stepBlock(1);
  assert.equal(st.blocks[st.block].id, "b1");
  assert.equal(st.space, "b");
});

test("an empty adjacent workspace is still reachable", () => {
  hive({ space: "a", block: 1, without: "b" });
  stepBlock(1);
  assert.equal(st.space, "b");
  assert.equal(st.blocks.every((one) => one.ws === "a"), true);
});
