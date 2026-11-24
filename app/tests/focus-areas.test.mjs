import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $, DEFAULT_KEYS, overrides } = await app("core");
const { structPool } = await app("structured-seats");
const { areasNow, rowAt, stepArea } = await app("focus-areas");
const { removeKey, restoreKey, keyMenuItems } = await app("leader-key");
await app("themes");
await app("hold-numbers");

window.hiveLink = { open: () => ({ send() {}, close() {} }) };

const posts = [];
const was = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  posts.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
  return { ok: true, json: async () => ({}) };
};
test.after(() => { globalThis.fetch = was; });

const settle = () => new Promise((done) => setImmediate(done));

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive(names, { focus = 0 } = {}) {
  st.LIMIT = 4;
  st.data = { sessions: names.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: [...names] }];
  st.block = 0;
  st.focus = focus;
  st.open = null;
  st.seatsKnown = true;
  st.typing = null;
  st.pending = false;
  st.leader = null;
  st.chords = {};
  st.keys = { ...DEFAULT_KEYS };
  st.explicitKeys = new Set();
  st.capturing = null;
  st.tourAt = -1;
  posts.length = 0;
  $("help").classList.remove("on");
  $("hud").hidden = true;
}

function railOf(names) {
  $("rail-sessions").innerHTML = names.map((name) => `<div class="item" tabindex="-1" data-name="${name}"><span class="name">${name}</span></div>`).join("");
}

function conversationOf(name) {
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-scroll"><p>hello</p><button type="button" class="in-chat">copy</button></div><form class="sv-composer"><textarea></textarea></form>`;
  document.body.append(host);
  structPool.set(name, { name, host });
  return host;
}

const pressOn = (el, init) => {
  const ev = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev;
};

test("F6 walks the list, the conversation and the composer, then wraps; shift goes back", async () => {
  hive(["uma"]);
  railOf(["uma"]);
  const host = conversationOf("uma");
  assert.deepEqual(areasNow().map((one) => one.name).slice(0, 3), ["list", "conversation", "composer"]);
  document.body.focus();
  stepArea(1);
  assert.ok(document.activeElement === $("rail-sessions").querySelector('[data-name="uma"]'));
  stepArea(1);
  assert.ok(document.activeElement === host.querySelector(".sv-scroll"));
  stepArea(1);
  assert.ok(document.activeElement === host.querySelector("textarea"));
  stepArea(-1);
  assert.ok(document.activeElement === host.querySelector(".sv-scroll"));
  structPool.delete("uma");
  host.remove();
});

test("coming back to an area puts the focus where it was left", () => {
  hive(["uma"]);
  railOf(["uma"]);
  const host = conversationOf("uma");
  const inside = host.querySelector(".in-chat");
  inside.focus();
  host.querySelector("textarea").focus();
  stepArea(-1);
  assert.ok(document.activeElement === inside, "the button inside the conversation got the focus back");
  structPool.delete("uma");
  host.remove();
});

test("the F6 key reaches the areas even from inside the composer", async () => {
  hive(["uma"]);
  railOf(["uma"]);
  const host = conversationOf("uma");
  const box = host.querySelector("textarea");
  box.focus();
  const ev = pressOn(box, { key: "F6", code: "F6" });
  await settle();
  assert.equal(ev.defaultPrevented, true);
  assert.ok(document.activeElement !== box, "the focus left the composer");
  structPool.delete("uma");
  host.remove();
});

test("in the settings, F6 goes between the sections and the open section", () => {
  hive(["uma"]);
  $("help").classList.add("on");
  const nav = $("pref-nav");
  nav.querySelector('button[data-pane="keyboard"]').setAttribute("aria-current", "true");
  stepArea(1);
  assert.ok(document.activeElement === nav.querySelector('button[aria-current="true"]'));
  stepArea(1);
  assert.ok($("pref-body").contains(document.activeElement), "the focus went into the open section");
  $("help").classList.remove("on");
});

test("F2 on a row of the list opens a name field over it, and Enter keeps the new name", async () => {
  hive(["uma"]);
  railOf(["uma"]);
  const row = $("rail-sessions").querySelector('[data-name="uma"]');
  row.focus();
  assert.equal(rowAt(row).name, "uma");
  const ev = pressOn(row, { key: "F2", code: "F2" });
  assert.equal(ev.defaultPrevented, true);
  const field = document.querySelector(".row-rename");
  assert.ok(field, "the field opened");
  assert.equal(field.value, "uma");
  field.value = "Pagamento do lote";
  pressOn(field, { key: "Enter", code: "Enter" });
  await settle();
  assert.equal(document.querySelector(".row-rename"), null);
  assert.deepEqual(posts.find((one) => one.url === "/api/rename")?.body, { name: "uma", where: "local", title: "Pagamento do lote" });
});

test("Esc on the name field leaves the name alone and gives the focus back to the row", async () => {
  hive(["uma"]);
  railOf(["uma"]);
  const row = $("rail-sessions").querySelector('[data-name="uma"]');
  row.focus();
  pressOn(row, { key: "F2", code: "F2" });
  const field = document.querySelector(".row-rename");
  field.value = "outro";
  pressOn(field, { key: "Escape", code: "Escape" });
  await settle();
  assert.equal(posts.filter((one) => one.url === "/api/rename").length, 0);
  assert.ok(document.activeElement === $("rail-sessions").querySelector('[data-name="uma"]'));
});

test("Shift+F10 and the menu key open the menu of the focused row", () => {
  hive(["uma"]);
  railOf(["uma"]);
  const row = $("rail-sessions").querySelector('[data-name="uma"]');
  row.focus();
  st.seatMenuFor = "";
  const ev = pressOn(row, { key: "F10", code: "F10", shiftKey: true });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(st.seatMenuFor, "uma");
  st.seatMenuFor = "";
  pressOn(row, { key: "ContextMenu", code: "ContextMenu" });
  assert.equal(st.seatMenuFor, "uma");
});

test("a shortcut can be removed and given back its default from the menu of its row", () => {
  hive(["uma"]);
  assert.deepEqual(keyMenuItems("palette", { edit() {} }).map((one) => one.label), ["Edit shortcut", "Remove shortcut"], "a default key offers no way back to itself");
  removeKey("palette");
  assert.equal(st.keys.palette, null);
  assert.equal(overrides().palette, "off");
  assert.deepEqual(keyMenuItems("palette", { edit() {} }).map((one) => one.label), ["Edit shortcut", "Restore default"]);
  assert.equal(restoreKey("palette"), null);
  assert.deepEqual(st.keys.palette, DEFAULT_KEYS.palette);
  assert.equal("palette" in overrides(), false);
});

test("the default cannot come back while another action you chose holds that key", () => {
  hive(["uma"]);
  st.keys.prs = { ...DEFAULT_KEYS.palette };
  st.keys.palette = null;
  st.explicitKeys = new Set(["prs"]);
  assert.equal(restoreKey("palette"), "prs");
  assert.equal(st.keys.palette, null);
  assert.deepEqual(st.keys.prs, DEFAULT_KEYS.palette);
});

test("in the shortcut list a key is reached by keyboard: Enter records, the menu key opens its actions, Esc only closes the menu", async () => {
  hive(["uma"]);
  const { paintKeys } = await app("leader-key");
  $("help").classList.add("on");
  st.keysOpen = true;
  paintKeys();
  await settle();
  const cell = $("help-keys").querySelector('[data-slot="direct"][data-action="palette"]');
  assert.ok(cell, "the palette row is in the list");
  assert.equal(cell.getAttribute("tabindex"), "0");
  cell.focus();
  pressOn(cell, { key: "Enter", code: "Enter" });
  assert.equal(st.capturing, "palette");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  assert.equal(st.capturing, null);
  await settle();
  const again = $("help-keys").querySelector('[data-slot="direct"][data-action="palette"]');
  again.focus();
  pressOn(again, { key: "F10", code: "F10", shiftKey: true });
  const menu = document.querySelector(".md-ctx");
  assert.ok(menu, "the actions of the shortcut opened");
  assert.deepEqual([...menu.querySelectorAll("button")].map((one) => one.textContent), ["Edit shortcut", "Remove shortcut"]);
  pressOn(document.activeElement, { key: "Escape", code: "Escape" });
  assert.equal(document.querySelector(".md-ctx"), null);
  assert.equal($("help").classList.contains("on"), true, "the settings stayed open");
  const more = $("help-keys").querySelector('[data-w="key-menu"][data-action="palette"]');
  more.click();
  const picked = [...document.querySelectorAll(".md-ctx button")].find((one) => one.textContent === "Remove shortcut");
  picked.click();
  await settle();
  assert.equal(st.keys.palette, null);
  $("help").classList.remove("on");
  st.keysOpen = false;
});

test("F2 inside a conversation or a field is left alone, even inside a row that names a seat", () => {
  hive(["uma"]);
  const row = document.createElement("div");
  row.setAttribute("data-name", "uma");
  row.innerHTML = '<div class="sv"><textarea></textarea></div>';
  $("rail-sessions").replaceChildren(row);
  const box = row.querySelector("textarea");
  box.focus();
  const ev = pressOn(box, { key: "F2", code: "F2" });
  assert.equal(ev.defaultPrevented, false);
  assert.equal(document.querySelector(".row-rename"), null);
  assert.equal(rowAt(box), null);
});
