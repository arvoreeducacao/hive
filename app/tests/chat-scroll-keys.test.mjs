import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { ACTION_GROUPS, DEFAULT_KEYS } = await app("core");
const { pool } = await app("leader-key");
const { structPool } = await app("structured-seats");
await app("themes");
await app("hold-numbers");

window.hiveLink = { open: () => ({ send() {}, close() {} }) };

const was = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
test.after(() => { globalThis.fetch = was; });

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

const moved = [];

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
  st.keys = { ...DEFAULT_KEYS, usage: { ctrl: true, shift: true, code: "KeyU" }, scrollUp: { ctrl: true, code: "KeyU" }, scrollDown: { ctrl: true, code: "KeyD" } };
  st.capturing = null;
  st.tourAt = -1;
  pool.clear();
  structPool.clear();
  moved.length = 0;
}

function nativeChat() {
  const scroll = document.createElement("div");
  Object.defineProperty(scroll, "clientHeight", { value: 400, configurable: true });
  scroll.scrollBy = ({ top }) => moved.push(top);
  document.body.append(scroll);
  structPool.set("uma", { name: "uma", host: document.createElement("div"), scroll });
}

function terminal() {
  pool.set("uma", { name: "uma", host: document.createElement("div"), attached: true, term: { open() {}, blur() {}, focus() {} }, fit: { fit() {} } });
}

function press(key) {
  const ev = new window.KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}`, ctrlKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  return ev;
}

test("the two chat scrolls come with no key, and sit with the other chat actions", () => {
  assert.equal(DEFAULT_KEYS.scrollUp, null);
  assert.equal(DEFAULT_KEYS.scrollDown, null);
  const chats = ACTION_GROUPS.find(([id]) => id === "chats")[2];
  assert.ok(chats.includes("scrollUp") && chats.includes("scrollDown"));
});

test("bound to ctrl+u and ctrl+d, they move the focused chat half a screen up and down", () => {
  hive();
  nativeChat();
  const down = press("d");
  const up = press("u");
  assert.deepEqual(moved, [200, -200]);
  assert.equal(down.defaultPrevented, true);
  assert.equal(up.defaultPrevented, true);
});

test("they still scroll while you are typing in that chat", () => {
  hive({ typing: "uma" });
  nativeChat();
  const ev = press("d");
  assert.deepEqual(moved, [200]);
  assert.equal(ev.defaultPrevented, true);
});

test("a terminal holding the keyboard keeps ctrl+u and ctrl+d for its shell", () => {
  hive({ typing: "uma" });
  terminal();
  const up = press("u");
  const down = press("d");
  assert.deepEqual(moved, []);
  assert.equal(up.defaultPrevented, false);
  assert.equal(down.defaultPrevented, false);
});
