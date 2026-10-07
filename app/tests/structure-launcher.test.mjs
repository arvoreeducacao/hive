import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PT_BR } from "../assets/i18n.mjs";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ sessions: [] }), text: async () => "{}" });
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { setStructure, structureWorn } = await app("structure");
const { launcher, launcherModel, seatLine, stepFrom } = await import(new URL("../src/structures/launcher.js", import.meta.url).href);

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const seat = (name, state = "idle", extra = {}) => ({ name, title: name, where: "local", state, kind: "chat", ...extra });

function lay(blocks, states = {}, extra = {}) {
  const names = blocks.flat();
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map((name) => seat(name, states[name], extra[name])), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = blocks.map((keys, i) => ({ id: `b${i}`, ws: "w0", label: i === 1 ? "oms" : "", manual: true, keys: [...keys] }));
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

const settle = () => new Promise((done) => setTimeout(done, 5));

const key = (init) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  (document.activeElement || document.body).dispatchEvent(event);
  return event;
};

const rows = () => [...document.querySelectorAll(".lx-row")].map((row) => row.querySelector(".t").textContent);

const picked = () => document.querySelector(".lx-row.sel")?.dataset.id || null;

const hosted = () => document.querySelector(".lx-host > .tile")?.dataset.key || null;

const row = (id, state, name = id, line = "") => ({ id, kind: "seat", key: id, state, name, line, acc: state });

test("the launcher is ready, and its english says itself in portuguese", () => {
  assert.equal(launcher.id, "launcher");
  assert.equal(launcher.ready, true);
  for (const said of ["Open a seat, run a command, search everything…", "Working", "Ready", "Commands", "Open full screen", "press {key} to run it", "{name} needs you", "back to the launcher", "jumps to who needs you", "switch seat", "Browser", "Changes"]) {
    assert.ok(PT_BR[said], `${said} is not translated`);
  }
  assert.equal(PT_BR["{name} needs you"], "{name} pede você");
});

test("the model groups the seats by what they ask of you, with the commands last", () => {
  const seats = [row("a", "needs"), row("b", "answered"), row("c", "working"), row("d", "stalled"), row("e", "idle")];
  const commands = [{ id: "cmd:new", kind: "command", name: "new chat", line: "" }];
  const model = launcherModel(seats, commands, "", null);
  assert.deepEqual(model.groups.map((group) => [group.id, group.rows.map((one) => one.id)]), [
    ["needs", ["a"]], ["working", ["c", "d"]], ["done", ["b", "e"]], ["commands", ["cmd:new"]]
  ]);
  assert.equal(model.sel, "a", "the one that needs you comes selected");
  assert.equal(launcherModel(seats, commands, "", "d").sel, "d");
  assert.equal(launcherModel(seats, commands, "", "gone").sel, "a", "a selection that left falls on the first row");
});

test("typing filters seats and commands together, ignoring case and accents", () => {
  const seats = [row("x", "idle", "Sessão CRM expirada", "o login cai"), row("y", "working", "hive visual")];
  const commands = [{ id: "cmd:usage", kind: "command", name: "usage", line: "" }];
  assert.deepEqual(launcherModel(seats, commands, "sessao", null).flat.map((one) => one.id), ["x"]);
  assert.deepEqual(launcherModel(seats, commands, "LOGIN", null).flat.map((one) => one.id), ["x"]);
  assert.deepEqual(launcherModel(seats, commands, "usa", null).flat.map((one) => one.id), ["cmd:usage"]);
  const none = launcherModel(seats, commands, "zzz", "x");
  assert.equal(none.flat.length, 0);
  assert.equal(none.sel, null);
});

test("the arrows walk the list and stop at its ends", () => {
  const flat = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(stepFrom(flat, "a", 1), "b");
  assert.equal(stepFrom(flat, "c", 1), "c");
  assert.equal(stepFrom(flat, "a", -1), "a");
  assert.equal(stepFrom(flat, "gone", 1), "a");
  assert.equal(stepFrom([], "a", 1), null);
});

test("a row says what the seat is doing, or the first line of what it last said", () => {
  assert.equal(seatLine({ verb: "Bash", measure: "confere a prévia" }), "Bash · confere a prévia");
  assert.equal(seatLine({ now: "", asks: [{ question: "Quer que eu toque?" }] }), "Quer que eu toque?");
  assert.equal(seatLine({ summary: "PR aberto\nsegunda linha" }), "PR aberto");
  assert.equal(seatLine({}), "");
});

test("entering builds one window: the list on the left and the real tile of the selection on the right", async () => {
  lay([["a", "b"], ["c"]], { b: "needs", c: "working" }, { c: { verb: "Bash", measure: "6s" } });
  const before = tiles.get("b");
  setStructure("launcher", { quiet: true });
  await settle();
  assert.equal(structureWorn(), "launcher");
  assert.equal(document.body.dataset.structure, "launcher");
  assert.ok($("structure-root").querySelector(".lx-win"));
  assert.deepEqual([...document.querySelectorAll(".lx-sec")].map((one) => one.classList[1]), ["needs", "working", "done", "commands"]);
  assert.deepEqual(rows().slice(0, 3), ["b", "c", "a"]);
  assert.equal(picked(), "b", "the seat that needs you is the one shown first");
  assert.equal(hosted(), "b");
  assert.ok(tiles.get("b") === before, "the tile is the real one, moved and not rebuilt");
  assert.equal(st.focus, 1, "the selection is the app's focus too");
  assert.equal(document.querySelector(".lx-row.sel .acc .rc-key").textContent, "↵");
  assert.match(document.querySelector('.lx-row[data-id="c"] .s').textContent, /Bash · 6s/);
  assert.equal($("structure-root").dataset.mode, "list");
});

test("the arrows change the seat in the window, and a seat of another block comes along", async () => {
  document.querySelector(".lx-q").focus();
  assert.equal(key({ key: "ArrowDown", code: "ArrowDown" }).defaultPrevented, true);
  assert.equal(picked(), "c");
  assert.equal(hosted(), "c");
  assert.equal(st.block, 1);
  assert.equal(tiles.get("b").closest(".lx-host"), null, "the seat left behind leaves the window");
  key({ key: "ArrowUp", code: "ArrowUp" });
  assert.equal(picked(), "b");
  assert.equal(st.block, 0);
});

test("typing filters the list, a key typed anywhere lands in the bar, and esc clears it", () => {
  const q = document.querySelector(".lx-q");
  q.value = "BASH";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(rows(), ["c"]);
  assert.equal(picked(), "c");
  assert.equal(hosted(), "c");
  key({ key: "Escape", code: "Escape" });
  assert.equal(q.value, "");
  assert.equal(rows().length > 3, true);
  q.blur();
  assert.equal(key({ key: "c", code: "KeyC" }).defaultPrevented, true);
  assert.equal(q.value, "c");
  assert.ok(document.activeElement === q);
  q.value = "";
  q.dispatchEvent(new Event("input", { bubbles: true }));
});

test("enter opens the seat in the big window, with the same tile, and the way back says Launcher", () => {
  const q = document.querySelector(".lx-q");
  q.focus();
  const sel = picked();
  key({ key: "Enter", code: "Enter" });
  assert.equal(st.open, sel);
  assert.equal($("structure-root").dataset.mode, "full");
  assert.equal(hosted(), sel);
  assert.equal(document.querySelector(".lx-crumb b").textContent, sel);
  assert.match(document.querySelector(".lx-hints").textContent, /back to the launcher/);
  assert.equal(key({ key: "ArrowDown", code: "ArrowDown" }).defaultPrevented, false, "in full screen the arrows belong to the seat");
  document.querySelector(".lx-back").click();
  assert.equal(st.open, null);
  assert.equal($("structure-root").dataset.mode, "list");
});

test("in full screen the bar points at the next seat that needs you", () => {
  const caller = st.data.sessions.find((one) => one.state === "needs").name;
  const other = st.data.sessions.find((one) => one.name !== caller).name;
  [...document.querySelectorAll(".lx-row")].find((one) => one.dataset.id === other).click();
  [...document.querySelectorAll(".lx-row")].find((one) => one.dataset.id === other).click();
  assert.equal(st.open, other);
  const call = document.querySelector(".lx-call");
  assert.equal(call.hidden, false);
  assert.match(call.textContent, new RegExp(`${caller} needs you`));
  call.click();
  assert.equal(st.open, caller);
  document.querySelector(".lx-back").click();
});

test("a command row runs from the list and shows what it does instead of a seat", () => {
  const q = document.querySelector(".lx-q");
  q.value = "classic";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(picked(), "cmd:classic");
  assert.equal(document.querySelector(".lx-host").hidden, true);
  assert.equal(document.querySelector(".lx-aside").hidden, false);
  assert.match(document.querySelector(".lx-aside").textContent, /Structure: Classic/);
  q.focus();
  key({ key: "Enter", code: "Enter" });
  assert.equal(st.structure, "classic");
  assert.equal(document.body.dataset.structure, "classic");
});

test("⌘K opens the real menu of the seat in the window", async () => {
  setStructure("launcher", { quiet: true });
  await settle();
  const menu = $("seatmenu");
  const bound = st.keys.palette;
  assert.equal(key({ key: "k", code: bound.code, metaKey: !!bound.meta, ctrlKey: !!bound.ctrl, altKey: !!bound.alt, shiftKey: !!bound.shift }).defaultPrevented, true);
  assert.equal(menu.classList.contains("on"), true);
  assert.match(menu.textContent, /open it alone/);
  key({ key: "Escape", code: "Escape" });
});

test("leaving gives every tile back to the canvas and empties the root", () => {
  setStructure("launcher", { quiet: true });
  const shown = hosted();
  assert.ok(shown);
  setStructure("classic", { quiet: true });
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal($("structure-root").children.length, 0);
  assert.equal($("structure-root").dataset.mode, undefined);
  assert.equal(tiles.get(shown)?.isConnected, st.blocks[st.block].keys.includes(shown));
  assert.equal(key({ key: "ArrowDown", code: "ArrowDown" }).defaultPrevented, false);
});

test("the stylesheet hides the wall and keeps a slim bar, all scoped to the launcher", () => {
  const css = readFileSync(join(HERE, "assets/structures/launcher.css"), "utf8");
  assert.match(css, /body\.experience-raycast\[data-structure="launcher"\] #canvas \{ display: none; \}/);
  assert.match(css, /\.lx-atmo/);
});
