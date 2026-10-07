import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { bringSeatIn, hideSeat, hidden, tidy } = await app("blocks");
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
