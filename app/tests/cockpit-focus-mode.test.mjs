import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ sessions: [] }), text: async () => "{}" });
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, defaultChords } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { armLeader } = await app("leader-key");
const { setStructure } = await app("structure");
const { setFocusMode } = await app("seat-layout");

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat", model: "Opus 5.5", trees: [] });

function wear(structure, { focus = 1 } = {}) {
  const blocks = [["a", "b", "c"], ["d"]];
  st.LIMIT = 6;
  st.calmOn = false;
  st.focusMode = false;
  st.data = { sessions: blocks.flat().map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = blocks.map((keys, i) => ({ id: `b${i}`, ws: "w0", label: "", manual: true, keys: [...keys] }));
  st.block = 0;
  st.focus = focus;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.prs = [];
  st.threads = [];
  st.leader = { ctrl: true, code: "KeyB" };
  st.chords = defaultChords();
  render();
  setStructure(structure, { quiet: true });
}

const grid = () => $("structure-root").querySelector(".ck-grid");
const panes = () => [...grid().querySelectorAll(".ck-pane")].map((el) => [el.dataset.key, el.style.getPropertyValue("--from-focus")]);
const press = (code) => document.body.dispatchEvent(new KeyboardEvent("keydown", { code, key: "", bubbles: true, cancelable: true }));

test("the cockpit keeps its shape in focus mode and lines the panes of the block around the one in focus", () => {
  wear("cockpit");
  setFocusMode(true);
  assert.equal(document.body.dataset.structure, "cockpit");
  assert.ok(grid().classList.contains("focus-mode"));
  assert.equal(grid().style.gridTemplateColumns, "");
  assert.deepEqual(panes(), [["a", "-1"], ["b", "0"], ["c", "1"]]);
  setFocusMode(false);
});

test("the cockpit's own arrows walk the panes and cross into the next block like the normal view", () => {
  wear("cockpit");
  setFocusMode(true);
  armLeader();
  press("ArrowRight");
  assert.equal(st.focus, 2);
  assert.deepEqual(panes(), [["a", "-2"], ["b", "-1"], ["c", "0"]]);
  armLeader();
  press("ArrowRight");
  assert.equal(st.blocks[st.block].id, "b1");
  assert.deepEqual(panes(), [["d", "0"]]);
  assert.ok(grid().classList.contains("focus-mode"));
  setFocusMode(false);
});

test("turning focus mode off gives the cockpit its windows back", () => {
  wear("cockpit");
  setFocusMode(true);
  setFocusMode(false);
  assert.equal(grid().classList.contains("focus-mode"), false);
  assert.notEqual(grid().style.gridTemplateColumns, "");
  assert.deepEqual(panes().map(([, from]) => from), ["", "", ""]);
});

test("a structure that does not hold focus mode still steps aside for it", () => {
  wear("map");
  assert.equal(document.body.dataset.structure, "map");
  setFocusMode(true);
  assert.equal(document.body.dataset.structure, "classic");
  setFocusMode(false);
  assert.equal(document.body.dataset.structure, "map");
});
