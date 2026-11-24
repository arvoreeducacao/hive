import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $, DEFAULT_KEYS } = await app("core");
const { paintQuitChoice, setQuitShortcut, showQuitHint } = await app("quit-hint");
const { menuAct, menuSaid, tellMenu } = await app("app-menu");
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

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

test("holding the quit key shows the keys, the words and a bar that fills", () => {
  showQuitHint({ state: "down", mode: "hold", holdMs: 1200 });
  const box = $("quit-hint");
  assert.equal(box.hidden, false);
  assert.equal(box.getAttribute("role"), "status");
  assert.match(box.textContent, /Hold (⌘Q|Ctrl\+Q) to quit/);
  assert.match(box.textContent, /or press it twice/);
  assert.ok(box.querySelector(".qh-bar"), "the bar is there");
});

test("press twice says to press again, with no bar, and goes away as soon as the key comes up", () => {
  showQuitHint({ state: "down", mode: "twice" });
  const box = $("quit-hint");
  assert.match(box.textContent, /Press (⌘Q|Ctrl\+Q) again to quit/);
  assert.equal(box.querySelector(".qh-bar"), null);
  showQuitHint({ state: "up" });
  assert.equal(box.hidden, true);
});

test("the hold hint lingers a moment after the key comes up", async () => {
  showQuitHint({ state: "down", mode: "hold", holdMs: 1200 });
  showQuitHint({ state: "up" });
  assert.equal($("quit-hint").hidden, false);
  await wait(1300);
  assert.equal($("quit-hint").hidden, true);
});

test("the quit setting shows only inside the app, and a choice goes to the config file", () => {
  delete window.hiveQuit;
  paintQuitChoice();
  assert.equal($("quit-row").hidden, true);
  window.hiveQuit = { hear() {} };
  paintQuitChoice();
  assert.equal($("quit-row").hidden, false);
  assert.deepEqual([...$("f-quit").options].map((one) => one.value), ["hold", "twice", "direct"]);
  assert.equal($("f-quit").value, "hold");
  posts.length = 0;
  setQuitShortcut("direct");
  assert.equal(st.quitShortcut, "direct");
  assert.deepEqual(posts.at(-1).body, { config: { quitShortcut: "direct" } });
  setQuitShortcut("nonsense", true);
  assert.equal(st.quitShortcut, "hold");
  delete window.hiveQuit;
});

test("the quit setting is a card row that offers its way back to the default", async () => {
  const { changed } = await app("settings-cards");
  window.hiveQuit = { hear() {} };
  const row = $("quit-row");
  assert.equal(row.classList.contains("set-row"), true);
  assert.equal(row.dataset.control, "f-quit");
  assert.equal(row.querySelector(".set-title").textContent, "Quit shortcut");
  setQuitShortcut("hold", true);
  assert.equal(changed($("f-quit")), false);
  setQuitShortcut("twice", true);
  assert.equal(changed($("f-quit")), true, "a choice other than hold can go back to the default");
  setQuitShortcut("hold", true);
  delete window.hiveQuit;
});

test("the page tells the menu its words and the settings key, once until they change", () => {
  const told = [];
  window.hiveMenu = { words: (said) => told.push(said), hear() {} };
  st.keys = { ...DEFAULT_KEYS };
  assert.equal(tellMenu(), true);
  assert.equal(tellMenu(), false);
  assert.equal(told.length, 1);
  assert.equal(told[0].words.settings, "Settings…");
  assert.equal(told[0].settingsKey.code, "Comma");
  st.keys = { ...DEFAULT_KEYS, help: null };
  assert.equal(tellMenu(), true);
  assert.equal(menuSaid().settingsKey, null);
  delete window.hiveMenu;
});

test("Settings from the menu opens the settings, and while a key is being recorded it records that key", () => {
  st.keys = { ...DEFAULT_KEYS };
  st.capturing = null;
  $("help").classList.remove("on");
  menuAct("settings");
  assert.equal($("help").classList.contains("on"), true);
  $("help").classList.remove("on");
  st.explicitKeys = new Set();
  st.capturing = "usage";
  menuAct("settings");
  assert.equal(st.capturing, null);
  assert.deepEqual(st.keys.usage, { ...DEFAULT_KEYS.help, alt: false, ctrl: !!DEFAULT_KEYS.help.ctrl, shift: false, meta: !!DEFAULT_KEYS.help.meta });
  assert.equal(st.keys.help, null, "the key moved to the action being recorded");
  st.keys = { ...DEFAULT_KEYS };
});
