import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { bringSeatIn, hideSeat, hidden, hiddenUntil, tidy } = await app("blocks");
const { railViewModel, setHiddenOpen } = await app("mirror");

st.LIMIT = 4;

const lay = (keys) => {
  st.blocks = [{ id: "b0", ws: st.space, label: "", manual: false, keys: [...keys] }];
  st.block = 0;
  st.focus = 0;
};

const live = (states) => {
  st.data = {
    sessions: Object.entries(states).map(([name, state]) => ({ name, where: "local", state, raw: state })),
    spawning: [], archived: [], pod: { up: false, name: "" }
  };
  st.seatsKnown = true;
};

const onRail = () => railViewModel().groups.flatMap((g) => g.items.map((it) => it.key));

const onGrid = () => st.blocks.flatMap((b) => b.keys);

const afterTheGrace = (step) => {
  const realNow = Date.now;
  const later = realNow() + 61000;
  Date.now = () => later;
  try { step(); } finally { Date.now = realNow; }
};

test("a hidden idle chat leaves the grid and the rail, and comes back the moment it works again", () => {
  hidden.clear();
  lay(["a", "b"]);
  live({ a: "idle", b: "idle" });
  hideSeat("b");
  tidy();
  assert.deepEqual(onGrid(), ["a"]);
  assert.deepEqual(onRail(), ["a"]);
  live({ a: "idle", b: "done" });
  tidy();
  assert.deepEqual(onGrid(), ["a"]);
  live({ a: "idle", b: "working" });
  tidy();
  assert.deepEqual(onGrid(), ["a", "b"]);
  assert.deepEqual(onRail().sort(), ["a", "b"]);
  assert.equal(hidden.size, 0);
});

test("a chat hidden while it still works stays hidden until it rests and then works again", () => {
  hidden.clear();
  lay(["a", "b"]);
  live({ a: "idle", b: "working" });
  hideSeat("b");
  tidy();
  assert.deepEqual(onGrid(), ["a"]);
  live({ a: "idle", b: "idle" });
  tidy();
  assert.deepEqual(onGrid(), ["a"]);
  live({ a: "idle", b: "needs" });
  tidy();
  assert.deepEqual(onGrid(), ["a", "b"]);
});

test("a hidden chat that closes is forgotten", () => {
  hidden.clear();
  lay(["a", "b"]);
  live({ a: "idle", b: "idle" });
  hideSeat("b");
  live({ a: "idle" });
  tidy();
  afterTheGrace(tidy);
  assert.equal(hidden.size, 0);
});

test("the rail keeps a folded list of the hidden chats, and opening one brings it back", () => {
  hidden.clear();
  lay(["a", "b", "c"]);
  live({ a: "idle", b: "idle", c: "idle" });
  assert.equal(railViewModel().snoozed, null);
  hideSeat("b");
  hideSeat("c");
  setHiddenOpen(false);
  assert.equal(railViewModel().snoozed.count, 2);
  assert.deepEqual(railViewModel().snoozed.shown, []);
  setHiddenOpen(true);
  assert.deepEqual(railViewModel().snoozed.shown.map((one) => one.name), ["b", "c"]);
  bringSeatIn("b");
  assert.deepEqual(railViewModel().snoozed.shown.map((one) => one.name), ["c"]);
  assert.deepEqual(onRail().sort(), ["a", "b"]);
  assert.ok(onGrid().includes("b"));
  setHiddenOpen(false);
});

test("a chat hidden until it finishes stays away while it works and comes back when the turn ends", () => {
  hidden.clear();
  lay(["a", "b"]);
  live({ a: "idle", b: "working" });
  hideSeat("b", "ends");
  assert.equal(hiddenUntil("b"), "ends");
  tidy();
  assert.deepEqual(onGrid(), ["a"]);
  live({ a: "idle", b: "working" });
  tidy();
  assert.deepEqual(onGrid(), ["a"]);
  live({ a: "idle", b: "done" });
  tidy();
  assert.deepEqual(onGrid(), ["a", "b"]);
  assert.equal(hidden.size, 0);
});

test("a chat hidden until it finishes comes back the moment it needs the person", () => {
  hidden.clear();
  lay(["a", "b"]);
  live({ a: "idle", b: "working" });
  hideSeat("b", "ends");
  live({ a: "idle", b: "needs" });
  tidy();
  assert.deepEqual(onGrid(), ["a", "b"]);
});

test("a resting chat hidden until it finishes waits for its next turn to end", () => {
  hidden.clear();
  lay(["a", "b"]);
  live({ a: "idle", b: "idle" });
  hideSeat("b", "ends");
  tidy();
  live({ a: "idle", b: "done" });
  tidy();
  assert.deepEqual(onGrid(), ["a"], "resting is not finishing: it has to work first");
  live({ a: "idle", b: "working" });
  tidy();
  assert.deepEqual(onGrid(), ["a"]);
  live({ a: "idle", b: "answered" });
  tidy();
  assert.deepEqual(onGrid(), ["a", "b"]);
});

test("a hidden chat that comes back lands in the block it left, not the first one with room", () => {
  hidden.clear();
  st.blocks = [
    { id: "b0", ws: st.space, label: "", manual: false, keys: ["a", "x", "y"] },
    { id: "b1", ws: st.space, label: "", manual: false, keys: ["b", "c", "d"] }
  ];
  st.block = 0;
  live({ a: "idle", x: "idle", y: "idle", b: "working", c: "idle", d: "idle" });
  hideSeat("b", "ends");
  tidy();
  assert.deepEqual(st.blocks.map((b) => [...b.keys]), [["a", "x", "y"], ["c", "d"]]);
  live({ a: "idle", x: "idle", y: "idle", b: "done", c: "idle", d: "idle" });
  tidy();
  assert.deepEqual(st.blocks.map((b) => [...b.keys]), [["a", "x", "y"], ["c", "d", "b"]]);
});

test("the hidden list survives a reload with each chat's way back", () => {
  hidden.clear();
  lay(["a", "b", "c"]);
  live({ a: "idle", b: "working", c: "idle" });
  hideSeat("b", "ends");
  hideSeat("c");
  const kept = JSON.parse(localStorage.getItem("hive.hidden"));
  assert.deepEqual(kept.b, { until: "ends", armed: true, from: "b0" });
  assert.deepEqual(kept.c, { until: "works", armed: true, from: "b0" });
  hidden.clear();
});

const parkedLive = (rows) => {
  st.data = {
    sessions: rows.map(([name, state, parked]) => ({ name, where: "local", state, raw: state, ...(parked ? { parked } : {}) })),
    spawning: [], archived: [], pod: { up: false, name: "" }
  };
  st.seatsKnown = true;
};

test("a chat that parks itself leaves the grid, stays away while parked, and comes back when its wake-up turn ends", () => {
  hidden.clear();
  localStorage.removeItem("hive.parkSeen");
  lay(["a", "b"]);
  const park = { until: Date.now() + 3600000, task: "measure", at: 111 };
  let told = null;
  const listen = (ev) => { told = ev.detail; };
  document.addEventListener("hive:parked", listen);
  parkedLive([["a", "idle"], ["b", "idle", park]]);
  tidy();
  document.removeEventListener("hive:parked", listen);
  assert.deepEqual(onGrid(), ["a"]);
  assert.equal(hiddenUntil("b"), "parked");
  assert.equal(told?.name, "b");
  parkedLive([["a", "idle"], ["b", "working", park]]);
  tidy();
  assert.deepEqual(onGrid(), ["a"], "a turn while parked does not bring it back");
  parkedLive([["a", "idle"], ["b", "working"]]);
  tidy();
  assert.deepEqual(onGrid(), ["a"], "woken, it works off screen");
  assert.equal(hiddenUntil("b"), "ends");
  parkedLive([["a", "idle"], ["b", "done"]]);
  tidy();
  assert.deepEqual(onGrid(), ["a", "b"]);
});

test("a parked chat the person brings back stays on the grid, and one open alone is not taken away", () => {
  hidden.clear();
  localStorage.removeItem("hive.parkSeen");
  lay(["a", "b", "c"]);
  const park = { until: Date.now() + 3600000, task: "measure", at: 222 };
  st.open = "c";
  parkedLive([["a", "idle"], ["b", "idle", park], ["c", "idle", { ...park, at: 333 }]]);
  tidy();
  assert.deepEqual(onGrid(), ["a", "c"]);
  st.open = null;
  bringSeatIn("b");
  tidy();
  tidy();
  assert.deepEqual(onGrid().sort(), ["a", "b", "c"]);
  hidden.clear();
});
