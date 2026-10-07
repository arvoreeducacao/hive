import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { palModel } = await app("palette");
const { closeSpace, spaceMenuRows } = await app("seat-menu");

function hive(spaces, blocks) {
  st.spaces = spaces.map((name, i) => ({ id: `w${i}`, name, tint: `#0${i}` }));
  st.space = st.spaces[0].id;
  st.blocks = blocks.map((b, i) => ({ id: `b${i}`, ws: b.ws, label: "", manual: true, keys: [...b.keys] }));
  st.block = 0;
  st.focus = 0;
  st.palMode = "";
  st.alerts = { items: [], count: 0 };
  st.prs = [];
  st.data = { sessions: blocks.flatMap((b) => b.keys).map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
}

const rows = (q) => palModel(q).filter((r) => !r.sec);
const named = (q, name) => rows(q).find((r) => r.name === name);

test("closing and renaming a workspace are in the palette, and not only behind the right button", () => {
  hive(["hive", "crm"], [{ ws: "w0", keys: ["a1"] }, { ws: "w1", keys: ["b1"] }]);
  assert.ok(named("workspace", "rename this workspace"), "renaming is findable by typing");
  assert.ok(named("workspace", "close the workspace you are on"), "so is closing");
  assert.ok(named("workspace", "new workspace"));
});

test("with a single workspace there is nothing to close, and the row is not offered", () => {
  hive(["hive"], [{ ws: "w0", keys: ["a1"] }]);
  assert.ok(!named("workspace", "close the workspace you are on"), "the last workspace stays");
  assert.ok(named("workspace", "rename this workspace"), "renaming still makes sense");
});

test("the palette says what closing costs before you press it", () => {
  hive(["hive", "crm"], [{ ws: "w0", keys: ["a1"] }, { ws: "w0", keys: ["a2"] }, { ws: "w1", keys: ["b1"] }]);
  const row = named("workspace", "close the workspace you are on");
  assert.match(row.ctx, /2 blocks|2 blocos/, "it counts the blocks that walk to the workspace before");
});

test("the menu row and the palette row close through the same door", () => {
  hive(["hive", "crm"], [{ ws: "w0", keys: ["a1"] }, { ws: "w1", keys: ["b1"] }]);
  const row = spaceMenuRows("w0").find((r) => r.label === "close this workspace");
  assert.ok(row, "the menu still offers it");
  assert.equal(typeof row.go, "function");
  assert.equal(typeof closeSpace, "function", "and both call the same function");
});
