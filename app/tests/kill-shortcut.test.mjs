import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $, ACTIONS, CTRL_KEYS, DEFAULT_CHORDS, DEFAULT_KEYS, IS_MAC, MAC_KEYS } = await app("core");
await app("themes");
await app("hold-numbers");

window.hiveLink = { open: () => ({ send() {}, close() {} }) };

const posts = [];

const was = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  posts.push({ url, body: init?.body ? JSON.parse(init.body) : null });
  if (String(url).startsWith("/api/hive")) return { ok: true, json: async () => JSON.parse(JSON.stringify(st.data)) };
  return { ok: true, json: async () => ({}) };
};
test.after(() => { globalThis.fetch = was; });

const settle = () => new Promise((done) => setImmediate(done));

const seat = (name, where = "local") => ({ name, title: name, where, state: "idle", kind: "chat" });

function hive(sessions, { open = null, focus = 0 } = {}) {
  st.LIMIT = 4;
  st.data = { sessions, spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: sessions.map((s) => s.name) }];
  st.block = 0;
  st.focus = focus;
  st.open = open;
  st.seatsKnown = true;
  st.typing = null;
  st.pending = false;
  st.leader = null;
  st.chords = {};
  st.keys = { ...DEFAULT_KEYS };
  st.capturing = null;
  st.tourAt = -1;
  posts.length = 0;
  $("confirm").classList.remove("on");
}

const dialogOn = () => $("confirm").classList.contains("on");

const kills = () => posts.filter((p) => p.url === "/api/kill").map((p) => p.body);

const press = (key) => document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

const shortcut = () => document.dispatchEvent(new window.KeyboardEvent("keydown", {
  key: "W", code: "KeyW", shiftKey: true, altKey: !IS_MAC ? false : true, ctrlKey: IS_MAC ? false : true,
  bubbles: true, cancelable: true
}));

test("kill session has a key on both families, a chord and a line in the shortcuts panel", () => {
  assert.deepEqual(MAC_KEYS.kill, { alt: true, shift: true, code: "KeyW" });
  assert.deepEqual(CTRL_KEYS.kill, { ctrl: true, shift: true, code: "KeyW" });
  assert.equal(DEFAULT_CHORDS.kill, "x");
  assert.ok(ACTIONS.some(([a]) => a === "kill"), "the shortcuts panel lists it");
});

test("the shortcut asks before killing, and Enter is the yes", async () => {
  hive([seat("uma"), seat("outra")], { focus: 1 });
  shortcut();
  await settle();
  assert.equal(dialogOn(), true);
  assert.equal($("c-who").textContent, "outra");
  assert.deepEqual(kills(), []);
  press("Enter");
  await settle();
  await settle();
  assert.deepEqual(kills(), [{ name: "outra", where: "local" }]);
  assert.equal(dialogOn(), false);
});

test("Esc on the question kills nothing", async () => {
  hive([seat("uma")]);
  shortcut();
  await settle();
  assert.equal(dialogOn(), true);
  press("Escape");
  await settle();
  await settle();
  assert.deepEqual(kills(), []);
  assert.equal(dialogOn(), false);
});

test("the open chat is the one the shortcut kills, whatever the focus says", async () => {
  hive([seat("uma"), seat("outra", "cloud")], { open: "outra", focus: 0 });
  shortcut();
  await settle();
  assert.equal($("c-who").textContent, "outra");
  press("Enter");
  await settle();
  await settle();
  assert.deepEqual(kills(), [{ name: "outra", where: "cloud" }]);
});

test("with no chat in focus the shortcut asks nothing", async () => {
  hive([]);
  shortcut();
  await settle();
  assert.equal(dialogOn(), false);
  assert.deepEqual(kills(), []);
});
