import test from "node:test";
import assert from "node:assert/strict";
import { cleanPatch } from "../lib/config.mjs";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { render } = await app("arrange");
const { stripItems } = await app("blocks");
const { stepFocus } = await app("focus-navigation");
const { LAYOUTS } = await app("seat-layout");

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive({ layout = "strip", block = 0, focus = 0 } = {}) {
  const blocks = [
    { id: "a1", ws: "a", label: "", manual: true, keys: ["s1", "s2"] },
    { id: "a2", ws: "a", label: "", manual: true, keys: ["s3"] },
    { id: "b1", ws: "b", label: "", manual: true, keys: ["s4"] }
  ];
  st.LIMIT = 4;
  st.seatLayout = layout;
  st.data = { sessions: blocks.flatMap((one) => one.keys).map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = blocks;
  st.spaces = [{ id: "a", name: "a" }, { id: "b", name: "b" }];
  st.space = "a";
  st.block = block;
  st.focus = focus;
  st.open = null;
  st.seatsKnown = true;
}

const onCanvas = () => [...document.getElementById("canvas").children].map((el) => el.dataset.key).filter(Boolean);

test("the strip is a layout the settings and the config file both accept", () => {
  assert.ok(LAYOUTS.includes("strip"));
  const { clean, problems } = cleanPatch({ layout: "strip" });
  assert.equal(clean.layout, "strip");
  assert.deepEqual(problems, []);
});

test("the strip lines up every chat of the workspace, block after block, and nothing from another workspace", () => {
  hive();
  assert.deepEqual(stripItems().map(({ it, lane, at }) => [it.key, lane, at]), [["s1", 0, 0], ["s2", 0, 1], ["s3", 1, 0]]);
  render({ animate: false });
  const canvas = document.getElementById("canvas");
  assert.equal(canvas.className, "strip");
  assert.deepEqual(onCanvas(), ["s1", "s2", "s3"]);
  assert.ok(canvas.querySelector('[data-key="s3"]').classList.contains("lane-start"));
  assert.equal(canvas.querySelector('[data-key="s1"]').classList.contains("lane-start"), false);
  assert.ok(document.body.classList.contains("strip-on"), "the block tabs step aside while the strip is on");
});

test("only the chat in focus is marked, even with the other blocks on screen", () => {
  hive({ block: 1, focus: 0 });
  render({ animate: false });
  const focused = [...document.querySelectorAll("#canvas > .focused")].map((el) => el.dataset.key);
  assert.deepEqual(focused, ["s3"]);
});

test("stepping right past the last chat of a block walks into the next block of the strip", () => {
  hive({ block: 0, focus: 1 });
  render({ animate: false });
  stepFocus(1, 0);
  assert.equal(st.blocks[st.block].id, "a2");
  assert.equal(st.focus, 0);
  stepFocus(-1, 0);
  assert.equal(st.blocks[st.block].id, "a1");
  assert.equal(st.focus, 1);
});

test("the grid keeps showing one block at a time", () => {
  hive({ layout: "grid" });
  render({ animate: false });
  assert.deepEqual(onCanvas(), ["s1", "s2"]);
  assert.equal(document.body.classList.contains("strip-on"), false);
});
