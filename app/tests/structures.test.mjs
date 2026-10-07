import { after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PT_BR } from "../assets/i18n.mjs";
import { STRUCTURE_CHOICES, STRUCTURE_DEFAULT as CONFIG_DEFAULT, cleanPatch, cleanStructure } from "../lib/config.mjs";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const pkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));

const posted = [];
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (init?.method === "POST" && String(url).includes("/api/config")) posted.push(JSON.parse(init.body).config);
  return Promise.resolve(answered({ sessions: [] }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, IS_MAC, MAC_KEYS, CTRL_KEYS, DEFAULT_CHORDS } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { whichAction } = await app("brand-face");
const { run } = await app("themes");
const { runHud, dismissHud } = await app("hud");
const {
  NO_CLAIMS, STRUCTURE_KEY, adoptStructure, bootStructure, paintStructure, setStructure,
  stepStructure, structurePaletteRows, structureSeats, structureWorn
} = await app("structure");
const registry = await import(new URL("../src/structures/index.js", import.meta.url).href);
const { STRUCTURES, STRUCTURE_DEFAULT, STRUCTURE_IDS, structureOf } = registry;

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const EXPECTED = ["classic", "launcher", "inbox", "atmosphere", "cockpit", "stage", "map", "ember", "island"];

const seat = (name, state = "idle") => ({ name, title: name, where: "local", state, kind: "chat" });

function lay(blocks, states = {}) {
  const names = blocks.flat();
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map((name) => seat(name, states[name])), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = blocks.map((keys, i) => ({ id: `b${i}`, ws: "w0", label: "", manual: true, keys: [...keys] }));
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

function spyOn(id, extra = {}) {
  const module = structureOf(id).module;
  const kept = { ...module };
  const calls = { enter: [], leave: [], paint: [] };
  Object.assign(module, {
    ready: true,
    enter(ctx) { calls.enter.push(ctx); },
    leave(ctx) { calls.leave.push(ctx); },
    paint(ctx) { calls.paint.push(ctx); },
    ...extra
  });
  return { calls, restore: () => { setStructure("classic", { quiet: true }); Object.assign(module, kept); } };
}

lay([["a", "b"], ["c"]], { b: "needs", c: "working" });

test("the registry holds the nine structures in the order of the brief, classic first and the default", () => {
  assert.deepEqual(STRUCTURE_IDS, EXPECTED);
  assert.equal(STRUCTURE_DEFAULT, "classic");
  assert.equal(structureOf("nonsense").id, "classic");
  for (const def of STRUCTURES) {
    assert.ok(def.name && def.says, `${def.id} needs a name and a line that says what it is`);
    if (def.id === "classic") { assert.equal(def.module, null); continue; }
    assert.equal(def.module.id, def.id, `${def.id}.js says it is ${def.module.id}`);
    assert.equal(typeof def.module.ready, "boolean");
    for (const hook of ["enter", "leave", "paint", "keydown"]) assert.equal(typeof def.module[hook], "function", `${def.id}.${hook}`);
  }
});

test("every structure is named and described in portuguese, except a name that is the same word", () => {
  for (const def of STRUCTURES) {
    assert.ok(PT_BR[def.says], `the line of ${def.id} is not translated`);
    if (def.name !== "Cockpit") assert.ok(PT_BR[def.name], `the name of ${def.id} is not translated`);
  }
  assert.equal(PT_BR["Inbox"], "Caixa de entrada");
  assert.equal(PT_BR["Structure: {name}"], "Estrutura: {name}");
});

test("the config file knows the same nine structures and falls back to the classic", () => {
  assert.deepEqual(STRUCTURE_CHOICES, STRUCTURE_IDS);
  assert.equal(CONFIG_DEFAULT, STRUCTURE_DEFAULT);
  const problems = [];
  assert.equal(cleanStructure(undefined, "config", problems), "classic");
  assert.equal(cleanStructure("inbox", "config", problems), "inbox");
  assert.deepEqual(problems, []);
  assert.equal(cleanStructure("tetris", "config", problems), "classic");
  assert.deepEqual(problems, ["config: structure should be classic, launcher, inbox, atmosphere, cockpit, stage, map, ember, island"]);
  assert.equal(cleanPatch({ structure: "map" }).clean.structure, "map");
  assert.match(server, /structure: cleanStructure\(raw\.structure, tilde\(CONFIG_FILE\), problems\),/);
  assert.match(server, /structure: raw\.structure !== undefined/);
});

test("each structure has its own stylesheet, scoped to it, linked by the page and served and packaged", () => {
  assert.ok(pkg.build.files.includes("assets/**"));
  assert.match(page, /<body>/, "the page itself names no structure: only the flag puts one on the body");
  for (const id of EXPECTED.slice(1)) {
    const path = `/assets/structures/${id}.css`;
    assert.ok(existsSync(join(HERE, path.slice(1))), `${path} is missing`);
    const css = readFileSync(join(HERE, path.slice(1)), "utf8");
    assert.match(css, new RegExp(`body\\.experience-raycast\\[data-structure="${id}"\\]`), `${id}.css is not scoped to its structure inside the flag`);
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((one) => one.split("{")[0].trim()).filter((one) => one && !one.startsWith("@"))) {
      for (const selector of rule.split(",")) assert.ok(selector.includes(`[data-structure="${id}"]`), `${id}.css reaches past its structure: ${selector.trim()}`);
    }
    assert.ok(page.includes(`<link rel="stylesheet" href="${path}">`), `app.html does not link ${path}`);
    assert.ok(server.includes(`"${path}": ["assets/structures/${id}.css", "text/css"]`), `server.mjs does not serve ${path}`);
  }
});

test("the root of the structures is on the page, empty and hidden in the classic", () => {
  assert.equal(structureWorn(), "classic");
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal($("structure-root").hidden, true);
  assert.equal($("structure-root").children.length, 0);
  assert.equal($("structure-note").hidden, true);
});

test("the classic costs nothing: no structure paints and the canvas keeps every tile", () => {
  const spy = spyOn("inbox");
  setStructure("classic", { quiet: true });
  assert.equal(paintStructure(), NO_CLAIMS);
  assert.equal(NO_CLAIMS.size, 0);
  render();
  assert.equal(spy.calls.paint.length, 0);
  assert.equal(tiles.get("a").parentElement, $("canvas"));
  spy.restore();
});

test("a structure still being built shows the classic with a quiet note, and never enters", () => {
  const module = structureOf("cockpit").module;
  const ready = module.ready;
  module.ready = false;
  setStructure("cockpit", { quiet: true });
  assert.equal(st.structure, "cockpit");
  assert.equal(structureWorn(), "classic");
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal($("structure-root").hidden, true);
  assert.equal($("structure-note").hidden, false);
  assert.equal($("structure-note").textContent, "Cockpit · being built");
  assert.match($("structure-note").title, /Cockpit is still being built — the classic stands in/);
  assert.equal(tiles.get("a").parentElement, $("canvas"));
  setStructure("classic", { quiet: true });
  assert.equal($("structure-note").hidden, true);
  module.ready = ready;
});

test("entering wears the structure on the body and hands it the root; leaving undoes it", () => {
  const inbox = spyOn("inbox", { enter(ctx) { inboxCalls.enter.push(ctx); ctx.root.append(document.createElement("section")); } });
  const inboxCalls = inbox.calls;
  const map = spyOn("map");
  setStructure("inbox", { quiet: true });
  assert.equal(inboxCalls.enter.length, 1);
  const ctx = inboxCalls.enter[0];
  assert.equal(ctx.id, "inbox");
  assert.equal(ctx.root, $("structure-root"));
  assert.equal(document.body.dataset.structure, "inbox");
  assert.equal($("structure-root").hidden, false);
  assert.equal($("structure-root").children.length, 1);
  assert.ok(inboxCalls.paint.length >= 1, "the render after entering paints the structure");
  setStructure("map", { quiet: true });
  assert.equal(inboxCalls.leave.length, 1);
  assert.equal(map.calls.enter.length, 1);
  assert.equal(document.body.dataset.structure, "map");
  assert.equal($("structure-root").children.length, 0, "the root comes back empty for the next one");
  setStructure("classic", { quiet: true });
  assert.equal(map.calls.leave.length, 1);
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal($("structure-root").hidden, true);
  map.restore();
  inbox.restore();
});

test("the context speaks for every structure: seats by priority, the focus, opening and going to a seat", () => {
  const spy = spyOn("stage");
  setStructure("stage", { quiet: true });
  const ctx = spy.calls.enter[0];
  for (const name of ["root", "seats", "focused", "focusSeat", "openSeat", "closeSeat", "place", "tile", "render", "listen", "onPlane", "inField", "label", "color", "keyHint", "phrase", "esc", "svgIcon"]) {
    assert.ok(name in ctx, `ctx.${name} is missing`);
  }
  assert.deepEqual(ctx.seats().map((one) => [one.key, one.state, one.block, one.here]), [["b", "needs", 0, true], ["c", "working", 1, false], ["a", "idle", 0, true]]);
  assert.deepEqual(structureSeats().map((one) => one.key), ["b", "c", "a"]);
  assert.equal(ctx.focused(), "a");
  ctx.focusSeat("c");
  assert.equal(st.block, 1);
  assert.equal(ctx.focused(), "c");
  ctx.openSeat("b");
  assert.equal(st.open, "b");
  assert.equal(st.block, 0);
  assert.equal(ctx.focused(), "b");
  ctx.closeSeat();
  assert.equal(st.open, null);
  assert.equal(ctx.label("needs"), "needs you");
  assert.equal(ctx.tile("a"), tiles.get("a"));
  spy.restore();
});

test("place mounts the real tile in the structure's own container, from any block, and the classic takes it back", () => {
  let holder = null;
  const spy = spyOn("ember", {
    enter(ctx) { holder = document.createElement("div"); holder.className = "ember-page"; ctx.root.append(holder); },
    paint(ctx) { ctx.place("c", holder); ctx.place("a", holder); }
  });
  st.block = 0;
  setStructure("ember", { quiet: true });
  assert.equal(tiles.get("c").parentElement, holder, "the seat of another block came to the structure");
  assert.equal(tiles.get("a").parentElement, holder);
  assert.equal(tiles.get("b").parentElement, $("canvas"), "a seat nobody placed stays on the canvas");
  const sameTile = tiles.get("a");
  setStructure("classic", { quiet: true });
  assert.equal(tiles.get("a"), sameTile, "the tile is moved, never rebuilt — the conversation and the draft go with it");
  assert.equal(tiles.get("a").parentElement, $("canvas"));
  assert.equal(tiles.get("c").isConnected, false, "the seat of the other block leaves with the structure");
  spy.restore();
});

test("place only counts inside paint, so what a structure mounts is always what it said last", () => {
  let holder = null;
  let keep = true;
  const spy = spyOn("launcher", {
    enter(ctx) { holder = document.createElement("div"); ctx.root.append(holder); ctx.place("a", holder); },
    paint(ctx) { if (keep) ctx.place("b", holder); }
  });
  setStructure("launcher", { quiet: true });
  assert.equal(tiles.get("a").parentElement, $("canvas"));
  assert.equal(tiles.get("b").parentElement, holder);
  keep = false;
  render();
  assert.equal(tiles.get("b").parentElement, $("canvas"));
  spy.restore();
});

test("a structure that breaks falls back to the classic instead of breaking the screen", () => {
  const warn = console.warn;
  console.warn = () => {};
  const spy = spyOn("atmosphere", { paint() { throw new Error("boom"); } });
  setStructure("atmosphere", { quiet: true });
  console.warn = warn;
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal($("structure-root").hidden, true);
  assert.equal($("structure-note").hidden, false);
  assert.equal($("structure-note").textContent, "Atmosphere · could not start");
  assert.match($("structure-note").title, /Atmosphere could not start/);
  assert.equal(tiles.get("a").parentElement, $("canvas"));
  assert.equal(spy.calls.leave.length, 1, "even a broken one gets to undo what it did");
  spy.restore();
});

test("listen is undone on leave, and a key the structure takes stops there", () => {
  let heard = 0;
  const spy = spyOn("island", {
    enter(ctx) { ctx.listen(document, "hive:poke", () => { heard += 1; }); },
    keydown(event) { return event.code === "KeyJ" && event.metaKey; }
  });
  setStructure("island", { quiet: true });
  document.dispatchEvent(new CustomEvent("hive:poke"));
  const taken = new KeyboardEvent("keydown", { code: "KeyJ", metaKey: true, bubbles: true, cancelable: true });
  let reached = false;
  const below = () => { reached = true; };
  document.addEventListener("keydown", below);
  document.body.dispatchEvent(taken);
  assert.equal(taken.defaultPrevented, true);
  assert.equal(reached, false);
  setStructure("classic", { quiet: true });
  document.dispatchEvent(new CustomEvent("hive:poke"));
  assert.equal(heard, 1);
  const free = new KeyboardEvent("keydown", { code: "KeyJ", metaKey: true, bubbles: true, cancelable: true });
  document.body.dispatchEvent(free);
  assert.equal(reached, true, "in the classic the key goes where it always went");
  document.removeEventListener("keydown", below);
  spy.restore();
});

test("the choice is kept on this machine and in the config file, and comes back from both", () => {
  posted.length = 0;
  setStructure("inbox");
  assert.equal(localStorage.getItem(STRUCTURE_KEY), "inbox");
  assert.deepEqual(posted, [{ structure: "inbox" }]);
  dismissHud();
  setStructure("classic", { quiet: true });
  localStorage.setItem(STRUCTURE_KEY, "stage");
  bootStructure();
  assert.equal(st.structure, "stage");
  adoptStructure({ config: { structure: "classic" }, has: { structure: false } });
  assert.equal(st.structure, "stage", "a file that never named it keeps what this machine had");
  adoptStructure({ config: { structure: "map" }, has: { structure: true } });
  assert.equal(st.structure, "map");
  localStorage.setItem(STRUCTURE_KEY, "tetris");
  bootStructure();
  assert.equal(st.structure, "classic");
  posted.length = 0;
});

test("changing says so in the HUD, and undo puts the one before back", () => {
  setStructure("classic", { quiet: true });
  setStructure("inbox");
  assert.equal($("hud").hidden, false);
  assert.match($("hud").textContent, /Structure: Inbox/);
  assert.match($("hud").textContent, /Undo/);
  runHud();
  assert.equal(st.structure, "classic");
  dismissHud();
});

test("one key walks the nine forward and the same key with shift walks back, and none of the app's keys moved", () => {
  for (const table of [MAC_KEYS, CTRL_KEYS, DEFAULT_CHORDS]) {
    assert.equal(table.structure, undefined);
    assert.equal(table.structureBack, undefined);
  }
  const press = (shift) => {
    const ev = new KeyboardEvent("keydown", { code: "KeyS", key: "s", altKey: true, shiftKey: shift, metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    return ev;
  };
  setStructure("classic", { quiet: true });
  assert.equal(press(false).defaultPrevented, true);
  assert.equal(st.structure, "launcher");
  press(true);
  assert.equal(st.structure, "classic");
  stepStructure(-1);
  assert.equal(st.structure, "island");
  stepStructure(1);
  assert.equal(st.structure, "classic");
  const seen = [];
  for (let i = 0; i < EXPECTED.length; i++) { press(false); seen.push(st.structure); }
  assert.deepEqual(seen, [...EXPECTED.slice(1), "classic"]);
  setStructure("classic", { quiet: true });
  dismissHud();
});
test("settings, the palette and the ··· menu all offer the structures", () => {
  setStructure("classic", { quiet: true });
  const options = [...$("f-structure").querySelectorAll("[data-structure]")];
  assert.deepEqual(options.map((one) => one.dataset.structure), EXPECTED);
  assert.equal(options[0].getAttribute("aria-checked"), "true");
  assert.match(options[2].textContent, /Inbox/);
  assert.match(options[2].textContent, /who needs you/);
  options[2].click();
  assert.equal(st.structure, "inbox");
  assert.equal($("f-structure").querySelector('[data-structure="inbox"]').getAttribute("aria-checked"), "true");
  const rows = structurePaletteRows();
  assert.deepEqual(rows.map((one) => one.name), STRUCTURES.map((def) => `Structure: ${def.name}`));
  assert.equal(rows.find((one) => one.on).id, "structure:inbox");
  rows[0].go();
  assert.equal(st.structure, "classic");
  assert.equal($("structure-now").textContent, "Classic");
  $("btn-structure").click();
  assert.equal(st.structure, "launcher");
  assert.equal($("structure-now").textContent, "Launcher");
  setStructure("classic", { quiet: true });
  dismissHud();
});

test("changing the structure keeps the focus where it was", () => {
  const spy = spyOn("inbox");
  const box = $("cmp-in");
  box.value = "half a sentence";
  box.focus();
  setStructure("inbox", { quiet: true });
  assert.equal(document.activeElement, box);
  assert.equal(box.value, "half a sentence");
  setStructure("classic", { quiet: true });
  assert.equal(document.activeElement, box);
  box.value = "";
  box.blur();
  spy.restore();
});

test("another hive on screen, or a seat in a window of its own, is always the classic", () => {
  const spy = spyOn("map");
  setStructure("map", { quiet: true });
  assert.equal(document.body.dataset.structure, "map");
  st.mirrorDev = "someone";
  render();
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal(spy.calls.leave.length, 1);
  assert.equal($("structure-note").hidden, true);
  st.mirrorDev = "";
  render();
  assert.equal(document.body.dataset.structure, "map");
  assert.equal(spy.calls.enter.length, 2);
  spy.restore();
});

test("with the flag off the structures do not exist: no markup, no keys, no rows, and the classic stands whatever was chosen", () => {
  setStructure("inbox", { quiet: true });
  assert.equal(structureWorn(), "inbox");
  document.body.classList.remove("experience-raycast");
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "current", was: "raycast" } }));
  for (const id of ["structure-root", "structure-note", "btn-structure", "structure-pick", "f-structure", "structure-now"]) assert.equal($(id), null, `#${id} is on the page with the flag off`);
  assert.equal(document.body.dataset.structure, undefined);
  assert.equal(structureWorn(), "classic");
  assert.equal(paintStructure(), NO_CLAIMS);
  assert.deepEqual(structurePaletteRows(), []);
  const ev = new KeyboardEvent("keydown", { code: "KeyS", key: "s", altKey: true, metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true, cancelable: true });
  window.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, false);
  assert.equal(st.structure, "inbox", "the choice is kept for when the flag comes back");
  setStructure("map", { quiet: true });
  assert.equal(document.body.dataset.structure, undefined);
  assert.equal(paintStructure(), NO_CLAIMS);
  document.body.classList.add("experience-raycast");
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));
  assert.ok($("structure-root"));
  assert.equal(structureWorn(), "map");
  setStructure("classic", { quiet: true });
  assert.equal(document.body.dataset.structure, "classic");
});
