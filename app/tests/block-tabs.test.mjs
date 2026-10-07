import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { goToBlock } = await app("focus-navigation");
const { render } = await app("arrange");
const { paintBlocks } = await app("mirror");

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive(names, keysPerBlock) {
  st.LIMIT = 4;
  st.data = { sessions: names.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a" }];
  st.space = "a";
  st.blocks = keysPerBlock.map((keys, i) => ({ id: `blk${i}`, ws: "a", label: "", manual: false, keys }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.mirrorDev = "";
  st.holding = "";
}

const tabs = () => [...document.querySelectorAll("#blocks button[data-i]")];

test("a fifth seat opens a second block and a second tab shows up at the top", () => {
  hive(["s1", "s2", "s3", "s4"], [["s1", "s2", "s3", "s4"]]);
  render();
  assert.equal(tabs().length, 1);
  st.data = { ...st.data, sessions: ["s1", "s2", "s3", "s4", "s5"].map(seat) };
  render();
  assert.equal(st.blocks.length, 2);
  assert.deepEqual(tabs().map((b) => b.dataset.i), ["0", "1"]);
});

test("a render that changes nothing leaves the blocks untouched, so it does not wake the next render", () => {
  hive(["s1", "s2", "s3"], [["s1", "s2", "s3"]]);
  render();
  const keys = st.blocks[0].keys;
  const before = JSON.stringify(st.blocks);
  render();
  assert.equal(st.blocks[0].keys, keys, "the keys array is the same one, not a fresh copy of it");
  assert.equal(JSON.stringify(st.blocks), before);
});

test("switching tabs moves the pressed state along", () => {
  hive(["s1", "s2", "s3", "s4", "s5"], [["s1", "s2", "s3", "s4"], ["s5"]]);
  render();
  assert.deepEqual(tabs().map((b) => b.getAttribute("aria-pressed")), ["true", "false"]);
  goToBlock(1);
  assert.equal(st.block, 1);
  assert.deepEqual(tabs().map((b) => b.getAttribute("aria-pressed")), ["false", "true"]);
  goToBlock(0);
  assert.deepEqual(tabs().map((b) => b.getAttribute("aria-pressed")), ["true", "false"]);
});

test("a render that changes nothing leaves the list of blocks itself untouched too", () => {
  hive(["s1", "s2", "s3"], [["s1", "s2", "s3"]]);
  render();
  const blocks = st.blocks;
  render();
  assert.equal(st.blocks, blocks, "the list is the same one, not a fresh copy of it");
});
