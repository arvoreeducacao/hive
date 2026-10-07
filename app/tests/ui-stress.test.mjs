import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(here, "..", ...p), "utf8");
const page = read("app.html");
const main = read("main.js");
const seatMenu = read("src", "app", "seat-menu.js");
const mirror = read("src", "app", "mirror.js");
const palette = read("src", "app", "palette.js");
const seats = read("src", "app", "structured-seats.js");
const stretches = read("src", "app", "chat-stretches.js");
const panes = read("src", "app", "chat-and-panes.js");
const day = read("src", "panels", "day.jsx");
const i18n = read("assets", "i18n.mjs");
const rule = (selector) => {
  const at = page.indexOf(`${selector} {`);
  assert.ok(at >= 0, `no rule for ${selector}`);
  return page.slice(at, page.indexOf("}", at));
};

test("a right click inside a field or over selected text leaves the seat menu shut", () => {
  assert.match(seatMenu, /if \(asksForTheEditMenu\(ev, el\)\) return;\s*ev\.preventDefault\(\);/);
  assert.match(seatMenu, /closest\("textarea, input, \[contenteditable\]/);
  assert.match(seatMenu, /within\.contains\(picked\.anchorNode\)/);
});

test("the window answers that right click with cut, copy and paste", () => {
  const from = main.indexOf('webContents.on("context-menu"');
  const hook = main.slice(from, main.indexOf('webContents.on("did-finish-load"', from));
  assert.match(hook, /if \(!params\.isEditable && !params\.selectionText\) return;/);
  for (const role of ["cut", "copy", "paste", "selectAll"]) assert.match(hook, new RegExp(`role: "${role}"`));
});

test("the chat in the rail opens the same menu the tile does", () => {
  const hook = mirror.slice(mirror.indexOf('$("rail-sessions").addEventListener("contextmenu"'), mirror.indexOf('$("rail-sessions").addEventListener("click"'));
  assert.match(hook, /st\.data\.sessions\.find\(\(x\) => x\.name === item\.dataset\.name\)/);
  assert.match(hook, /openSeatMenu\(it, ev\.clientX, ev\.clientY\)/);
});

test("the seat menu scrolls instead of leaving the window", () => {
  assert.match(rule("#seatmenu"), /max-height: calc\(100vh - 12px\); overflow-y: auto;/);
});

test("a pair of columns can shrink below what it holds", () => {
  assert.match(rule(".pair"), /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.match(rule(".pair.trio"), /minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(rule(".rt-field"), /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(rule(".pv-hint"), /overflow-wrap: anywhere;/);
  assert.match(rule(".pv-add-row .btn"), /box-sizing: border-box; width: 100%; min-width: 0; white-space: normal;/);
  assert.match(mirror, /import \{ openBlockMenu, openSeatMenu, openSpaceMenu, openTeamMenu \} from "\.\/seat-menu\.js";/);
});

test("the composer pills are neither clipped nor shrunk — #782 already fits them to the seat", () => {
  assert.equal(rule(".sv-pick"), ".sv-pick { display: flex; align-items: center; gap: 2px; min-width: 0; margin-left: -3px; ");
  assert.ok(!page.includes(".sv-pick .sv-pill {"), "a pill that shrinks to fit shows 'F…' for Fable in a three-seat block");
});

test("the palette names the themes in the language of the person", () => {
  assert.match(palette, /name: phrase\("themes"\)/);
  assert.match(i18n, /"themes": "temas"/);
});

test("the activity clock restarts when the verb changes", () => {
  const fn = seats.slice(seats.indexOf("function svActivity"), seats.indexOf("function paintActivity"));
  assert.match(fn, /const changed = \(verb \|\| ""\) !== e\.activity;/);
  assert.match(fn, /else if \(changed \|\| !e\.activitySince\) e\.activitySince = Date\.now\(\);/);
});

test("the room observer settles in the next frame instead of looping on itself", () => {
  assert.match(stretches, /roomFrame = requestAnimationFrame\(\(\) => \{ roomFrame = 0; svGutter\(e\); svNarrow\(e\); svReserve\(e\); \}\);/);
});

test("a webview only counts as a page once it can run script", () => {
  assert.match(panes, /if \(frame && frame\.dataset\.here && typeof frame\.executeJavaScript === "function"\) return settle\(frame\);/);
});

test("chats opened by hand are not called nothing open", () => {
  assert.match(day, /<Show when=\{props\.model\.brief \|\| props\.model\.fold\} fallback=\{/);
  assert.match(day, /<Show when=\{props\.model\.brief\}>\s*<div class="day-brief">/);
});
