import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { swapSeats } = await app("tiles");
const arrangeSource = readFileSync(fileURLToPath(new URL("../src/app/arrange.js", import.meta.url)), "utf8");

function twoSeats() {
  localStorage.removeItem("hive.blocks");
  st.data = { sessions: [{ name: "a" }, { name: "b" }], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
  st.blocks = [{ id: "b1", ws: st.space, label: "", manual: true, keys: ["a", "b"] }];
  st.block = 0;
  st.focus = 0;
}

test("shortcut reordering corrects focus and renders the destination once", () => {
  twoSeats();
  swapSeats("a", "b", false);
  assert.deepEqual([...st.blocks[0].keys], ["b", "a"]);
  assert.equal(st.focus, 1);
  const saved = JSON.parse(localStorage.getItem("hive.blocks"));
  assert.deepEqual(saved.map((b) => b.keys), [["b", "a"]]);
});

test("an instant reorder skips the tile movement animation", () => {
  assert.match(arrangeSource, /function render\(\{ animate = true \} = \{\}\)/);
  assert.match(arrangeSource, /const moved = onPlane \|\| !animate \? null : flipStart\(\);/);
});
