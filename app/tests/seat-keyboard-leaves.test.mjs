import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, dom, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const MODULES = readdirSync(join(HERE, "src/app")).filter((one) => one.endsWith(".js"));
const sourceOf = (one) => readFileSync(join(HERE, "src/app", one), "utf8");
const SOURCES = MODULES.map(sourceOf);
const VIEWS = [
  ...readdirSync(join(HERE, "src")).filter((one) => one.endsWith(".jsx")).map((one) => join(HERE, "src", one)),
  ...readdirSync(join(HERE, "src/panels")).filter((one) => one.endsWith(".jsx")).map((one) => join(HERE, "src/panels", one))
].map((where) => readFileSync(where, "utf8"));

const st = await state();
await views();
const { $, LABEL, perf, phrase } = await app("core");
const { render } = await app("arrange");
const { clickLeavesKeyboard, keyboardHome, releaseKeyboard, takeKeyboard } = await app("focus-navigation");
const { pool, receiving, tiles } = await app("leader-key");
const { structPool } = await app("structured-seats");

const wasFetch = globalThis.fetch;
const wasLink = window.hiveLink;
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = wasFetch; window.hiveLink = wasLink; });

function world(sessions, seed) {
  structPool.clear();
  pool.clear();
  tiles.clear();
  receiving.clear();
  st.typing = null;
  st.open = null;
  st.mirrorDev = "";
  st.block = 0;
  st.focus = 0;
  document.body.classList.remove("typing-on");
  $("canvas").innerHTML = "";
  st.data = {
    sessions: sessions.map((one) => ({ where: "local", state: "idle", ...one })),
    spawning: [], archived: [], pod: {}
  };
  st.blocks = [{ id: "b1", ws: st.space, label: "", manual: false, keys: sessions.map((one) => one.name) }];
  if (seed) seed();
  render();
}

function chatSeat(name) {
  world([{ name, structured: true }]);
  const e = structPool.get(name);
  assert.ok(e && e.host.isConnected, "the chat seat never reached the screen");
  return { seat: e, box: e.host.querySelector(".sv-composer textarea"), tile: tiles.get(name) };
}

function termSeat(name) {
  const said = [];
  const term = { focus: () => said.push("focus"), blur: () => said.push("blur") };
  world([{ name }], () => pool.set(name, {
    name, where: "local", term, host: document.createElement("div"),
    attached: true, ws: { readyState: 1, send() {}, close() {} }, fit: { fit() {} }
  }));
  return { said, tile: tiles.get(name) };
}

const renders = () => perf.now().count;

test("the keyboard that goes into a chat seat comes back out of it", () => {
  const { box } = chatSeat("ana");
  takeKeyboard("ana");
  assert.equal(st.typing, "ana");
  assert.equal(document.activeElement, box, "the chat box never took the keyboard");
  releaseKeyboard();
  assert.equal(st.typing, null);
  assert.notEqual(document.activeElement, box, "the chat box kept the keyboard after the hive said it was free");
});

test("the keyboard that goes into a terminal seat comes back out of it", () => {
  const { said } = termSeat("ana");
  takeKeyboard("ana");
  releaseKeyboard();
  assert.deepEqual(said, ["focus", "blur"]);
  assert.equal(st.typing, null);
});

test("a click inside the seat that holds the keyboard leaves it there", () => {
  const { box, tile } = chatSeat("ana");
  takeKeyboard("ana");
  assert.equal(clickLeavesKeyboard(box), false);
  assert.equal(clickLeavesKeyboard(tile), false);
});

test("a click anywhere else takes the keyboard back", () => {
  chatSeat("ana");
  takeKeyboard("ana");
  assert.equal(clickLeavesKeyboard($("btn-prs")), true, "clicking out of the seat left the keyboard behind");
});

test("with no seat holding the keyboard a click has nothing to take back", () => {
  chatSeat("ana");
  assert.equal(st.typing, null);
  assert.equal(keyboardHome(), null);
  assert.equal(clickLeavesKeyboard($("btn-prs")), false);
});

test("the home of the keyboard is the tile of the seat, and nothing that left the screen", () => {
  const { tile } = chatSeat("ana");
  takeKeyboard("ana");
  assert.equal(keyboardHome(), tile);
  tiles.delete("ana");
  assert.equal(keyboardHome(), null, "a home the markup no longer holds must answer nothing, never throw");
  assert.equal(clickLeavesKeyboard($("btn-prs")), false);
});

test("an outside press releases the keyboard only after it becomes a click", () => {
  chatSeat("ana");
  takeKeyboard("ana");
  const away = $("btn-prs");
  away.dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(st.typing, "ana", "a press that has not become a click yet took the keyboard back");
  away.dispatchEvent(new dom.MouseEvent("click", { bubbles: true }));
  assert.equal(st.typing, null, "the click outside the seat left the keyboard behind");
});

test("a pointer-driven release does not move focus from the clicked control to the body", () => {
  chatSeat("ana");
  takeKeyboard("ana");
  const away = $("btn-prs");
  away.focus();
  releaseKeyboard(false);
  assert.equal(document.activeElement, away, "the release pulled the focus down to the body under the click");
});

test("releasing the keyboard does not render the old tab before its click runs", () => {
  const { tile } = chatSeat("ana");
  takeKeyboard("ana");
  const before = renders();
  releaseKeyboard(false);
  assert.equal(renders(), before, "the release repainted the whole hive under the click");
  assert.equal(document.body.classList.contains("typing-on"), false);
  assert.equal(tile.classList.contains("typing"), false);
  assert.equal(tile.querySelector(".label").textContent, phrase(LABEL.idle));
  assert.equal(tile.querySelector(".badge").textContent, phrase("live terminal"));
  render();
  assert.equal(renders(), before + 1, "renders are not counted, so the assertion above proves nothing");
});

test("the page has only one global pointer path that releases the keyboard", () => {
  const sweeps = SOURCES.reduce((n, one) => n + (one.match(/clickLeavesKeyboard\(ev\.target\)/g) || []).length, 0);
  assert.equal(sweeps, 1);
  for (const one of SOURCES) {
    assert.doesNotMatch(one, /addEventListener\("mousedown", \(e\) => \{\s*disarmLeader\(\);\s*if \(!st\.typing\)/);
  }
});

test("escape in a chat composer gives the keyboard back to the hive, it does not just drop the cursor", () => {
  const { box } = chatSeat("ana");
  takeKeyboard("ana");
  box.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  assert.equal(st.typing, null, "escape still only blurs the box, so the hive goes on believing the seat has the keyboard");
  assert.notEqual(document.activeElement, box);
});

test("the chord that leaves a seat reaches the hive from inside a chat composer", () => {
  const { box } = chatSeat("ana");
  const wasKeys = st.keys;
  st.keys = { release: { code: "KeyR", alt: true } };
  takeKeyboard("ana");
  const press = (over) => box.dispatchEvent(new dom.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...over }));
  try {
    press({ key: "x", code: "KeyX" });
    assert.equal(st.typing, "ana", "an ordinary letter belongs to the composer, not to the hive");
    press({ key: "r", code: "KeyR", altKey: true });
    assert.equal(st.typing, null, "the composer swallows every key before the hive can see the chord that leaves");
  } finally {
    st.keys = wasKeys;
  }
});

test("every id the page reads exists in the markup", () => {
  const asked = SOURCES.flatMap((one) => [...one.matchAll(/\$\("([a-z0-9-]+)"\)/g)].map((m) => m[1]));
  assert.ok(asked.length > 50, "no module asks the page for an id — the scan is looking at the wrong files");
  const built = (id) => page.includes(`id="${id}"`)
    || SOURCES.some((one) => one.includes(`id="${id}"`))
    || VIEWS.some((one) => one.includes(`id="${id}"`));
  const missing = [...new Set(asked)].filter((id) => !built(id));
  assert.deepEqual(missing, [], `getElementById of ids that nothing on the page ever writes: ${missing.join(", ")}`);
});
