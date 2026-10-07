import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve(answered({ sessions: [] }));
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function lay(names) {
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: [...names] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.threadChat = null;
  st.reviewChat = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threads = [];
  st.prs = [];
  render();
}

function measuredIn(names, leaving) {
  lay(names);
  const canvas = $("canvas");
  const before = canvas.className;
  const el = tiles.get(leaving);
  const seen = [];
  const real = el.getBoundingClientRect;
  el.getBoundingClientRect = function (...args) { seen.push(canvas.className); return real.apply(this, args); };
  st.data.sessions = names.filter((one) => one !== leaving).map(seat);
  render();
  el.getBoundingClientRect = real;
  return { before, after: canvas.className, seen, faded: el.dataset.gone === "1" };
}

test("the seat that leaves is measured in the grid it was still in", () => {
  const one = measuredIn(["a", "b"], "a");
  assert.equal(one.before, "g2");
  assert.equal(one.after, "g1");
  assert.ok(one.faded, "the tile that leaves never took the fading path");
  assert.deepEqual([...new Set(one.seen)], ["g2"]);
});

test("a seat leaving a fuller block is measured in the grid it was still in", () => {
  const one = measuredIn(["a", "b", "c", "d"], "c");
  assert.equal(one.before, "g4");
  assert.equal(one.after, "g3");
  assert.ok(one.faded, "the tile that leaves never took the fading path");
  assert.deepEqual([...new Set(one.seen)], ["g4"]);
});
