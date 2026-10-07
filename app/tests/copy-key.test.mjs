import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $, DEFAULT_KEYS } = await app("core");
const { pool } = await app("leader-key");
const { copySelection } = await app("terminal-history");
await app("themes");
await app("hold-numbers");

window.hiveLink = { open: () => ({ send() {}, close() {} }) };

const clipped = [];
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: async (text) => { clipped.push(text); } },
  configurable: true
});

const was = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
test.after(() => { globalThis.fetch = was; });

const settle = () => new Promise((done) => setImmediate(done));

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive({ typing = null } = {}) {
  st.LIMIT = 4;
  st.data = { sessions: [seat("uma")], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["uma"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.typing = typing;
  st.pending = false;
  st.leader = null;
  st.chords = {};
  st.keys = { ...DEFAULT_KEYS, copy: { meta: true, code: "KeyC" } };
  st.capturing = null;
  st.tourAt = -1;
  pool.clear();
  clipped.length = 0;
  $("confirm").classList.remove("on");
}

const terminalHolding = (text) => pool.set("uma", {
  name: "uma",
  host: document.createElement("div"),
  attached: true,
  term: { hasSelection: () => !!text, getSelection: () => text, open() {}, blur() {}, focus() {} },
  fit: { fit() {} }
});

function pressCopy() {
  const ev = new window.KeyboardEvent("keydown", {
    key: "c", code: "KeyC", metaKey: true, bubbles: true, cancelable: true
  });
  document.dispatchEvent(ev);
  return ev;
}

test("with the copy key on cmd+c and no terminal selection, the press is left for the browser to copy the page", async () => {
  hive();
  const ev = pressCopy();
  await settle();
  assert.equal(ev.defaultPrevented, false);
  assert.deepEqual(clipped, []);
});

test("the same press while a seat holds the keyboard is still the browser's", async () => {
  hive({ typing: "uma" });
  const ev = pressCopy();
  await settle();
  assert.equal(ev.defaultPrevented, false);
  assert.deepEqual(clipped, []);
});

test("a terminal holding a selection is the one case the hive takes the key", async () => {
  hive();
  terminalHolding("o que o terminal escreveu");
  const ev = pressCopy();
  await settle();
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(clipped, ["o que o terminal escreveu"]);
});

test("a terminal holding the keyboard and a selection copies too", async () => {
  hive({ typing: "uma" });
  terminalHolding("duas linhas\ne mais uma");
  const ev = pressCopy();
  await settle();
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(clipped, ["duas linhas\ne mais uma"]);
});

test("called with nothing selected anywhere, copying says so instead of writing an empty clipboard", () => {
  hive();
  assert.equal(copySelection(), false);
  assert.deepEqual(clipped, []);
});
