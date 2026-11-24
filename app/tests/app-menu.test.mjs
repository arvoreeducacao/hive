import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { acceleratorOf, bindingHits, cleanBinding, hiveAppMenu, menuWords } = require("../main/app-menu.js");

test("the Mac app menu leads with updates, then settings with its shortcut, and ends with quit", () => {
  const acted = [];
  const menu = hiveAppMenu({ mac: true, name: "Hive", words: { settings: "Ajustes…", updates: "Procurar atualizações…" }, settingsKey: { code: "Comma", meta: true }, act: (what) => acted.push(what) });
  assert.equal(menu.label, "Hive");
  const items = menu.submenu;
  assert.equal(items[0].role, "about");
  assert.equal(items[1].label, "Procurar atualizações…");
  assert.equal(items[3].label, "Ajustes…");
  assert.equal(items[3].accelerator, "Command+,");
  assert.equal(items.at(-1).role, "quit");
  items[1].click();
  items[3].click();
  assert.deepEqual(acted, ["updates", "settings"]);
});

test("without the words from the page the menu speaks english, and without a key it shows none", () => {
  const menu = hiveAppMenu({ mac: true, act() {} });
  assert.equal(menu.submenu[1].label, "Check for Updates…");
  assert.equal(menu.submenu[3].label, "Settings…");
  assert.equal("accelerator" in menu.submenu[3], false);
});

test("off the Mac the two items come back loose, for the Hive menu to carry", () => {
  const { settings, updates } = hiveAppMenu({ mac: false, settingsKey: { code: "Comma", ctrl: true }, act() {} });
  assert.equal(settings.accelerator, "Control+,");
  assert.equal(updates.label, "Check for Updates…");
});

test("a word that is too long or not text is ignored", () => {
  assert.deepEqual(menuWords({ settings: "x".repeat(200), updates: 3 }), { settings: "Settings…", updates: "Check for Updates…" });
});

test("the key the page reports becomes an accelerator, and an odd one is dropped", () => {
  assert.equal(acceleratorOf({ code: "KeyS", meta: true, shift: true }, true), "Shift+Command+S");
  assert.equal(acceleratorOf({ code: "F6" }, true), "F6");
  assert.equal(acceleratorOf({ code: "IntlRo", meta: true }, true), "");
  assert.equal(cleanBinding({ code: "Comma", meta: 1 }).meta, true);
  assert.equal(cleanBinding({ code: "Comma; rm" }), null);
  assert.equal(cleanBinding(null), null);
});

test("the press matches the settings key exactly, never on repeat", () => {
  const key = { code: "Comma", meta: true, ctrl: false, alt: false, shift: false };
  assert.equal(bindingHits(key, { type: "keyDown", code: "Comma", meta: true }), true);
  assert.equal(bindingHits(key, { type: "keyDown", code: "Comma", meta: true, shift: true }), false);
  assert.equal(bindingHits(key, { type: "keyDown", code: "Comma", meta: true, isAutoRepeat: true }), false);
  assert.equal(bindingHits(key, { type: "keyUp", code: "Comma", meta: true }), false);
  assert.equal(bindingHits(null, { type: "keyDown", code: "Comma", meta: true }), false);
});

test("the window lets the page answer the settings key only after the page said which key it is", () => {
  const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
  assert.match(main, /let settingsKey = null;/);
  assert.match(main, /guardQuit\(window_\)/);
  assert.match(main, /guardQuit\(win\)/);
});
