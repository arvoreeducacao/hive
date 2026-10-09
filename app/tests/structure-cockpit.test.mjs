import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, state } from "./dom.mjs";

const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ sessions: [] }), text: async () => "{}" });
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, defaultChords } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { armLeader, disarmLeader, tiles } = await app("leader-key");
const { setStructure } = await app("structure");
const { structPool } = await app("structured-seats");
const { cockpit } = await import(new URL("../src/structures/cockpit.js", import.meta.url).href);

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const seat = (name, extra = {}) => ({ name, title: name.replace(/-/g, " "), where: "local", state: "idle", kind: "chat", model: "Opus 5.5", trees: [{ repo: "acme-hub", branch: "", main: true }], ...extra });

function lay(blocks, extra = {}) {
  st.LIMIT = 6;
  st.calmOn = false;
  st.data = { sessions: blocks.flat().map((name) => seat(name, extra[name])), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = blocks.map((keys, i) => ({ id: `b${i}`, ws: "w0", label: i ? "OMS" : "", manual: !!i, keys: [...keys] }));
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
  st.leader = { ctrl: true, code: "KeyB" };
  st.chords = defaultChords();
  render();
}

const panes = () => [...$("structure-root").querySelectorAll(".ck-pane")];
const press = (code, extra = {}) => {
  const ev = new KeyboardEvent("keydown", { code, key: extra.key || "", bubbles: true, cancelable: true, ...extra });
  document.body.dispatchEvent(ev);
  return ev;
};
const chord = (code, extra) => {
  armLeader();
  return press(code, extra);
};

function wear(blocks, extra) {
  lay(blocks, extra);
  setStructure("cockpit", { quiet: true });
}

test("the cockpit is ready and wears its own shape on the body", () => {
  assert.equal(cockpit.ready, true);
  wear([["a", "b", "c", "d", "e", "f"], ["g"]]);
  assert.equal(document.body.dataset.structure, "cockpit");
  assert.equal($("structure-root").classList.contains("ck"), true);
  setStructure("classic", { quiet: true });
});

test("the panes follow the hive's own grid, so the arrows and the digits mean the same seat", () => {
  const spans = (n) => cockpit.cells(n).map((c) => `${c.row}/${c.col}+${c.cols}x${c.rows}`);
  assert.deepEqual(spans(6), ["1/1+2x1", "1/3+2x1", "1/5+2x1", "2/1+2x1", "2/3+2x1", "2/5+2x1"]);
  assert.deepEqual(spans(5), ["1/1+2x1", "1/3+2x1", "1/5+2x1", "2/1+3x1", "2/4+3x1"]);
  assert.deepEqual(spans(4), ["1/1+3x1", "1/4+3x1", "2/1+3x1", "2/4+3x1"]);
  assert.deepEqual(spans(3), ["1/1+3x1", "2/1+3x1", "1/4+3x2"]);
  assert.deepEqual(spans(1), ["1/1+6x1"]);
});

test("the panes follow the layout chosen in the settings: a grid, one row or a strip that scrolls sideways", () => {
  wear([["a", "b", "c", "d", "e"]]);
  const grid = $("structure-root").querySelector(".ck-grid");
  assert.equal(panes()[3].style.gridArea, "2 / 1 / span 1 / span 3");
  st.seatLayout = "row";
  render();
  assert.deepEqual(panes().map((p) => p.style.gridArea), ["1 / 1 / span 1 / span 6", "1 / 7 / span 1 / span 6", "1 / 13 / span 1 / span 6", "1 / 19 / span 1 / span 6", "1 / 25 / span 1 / span 6"]);
  assert.equal(grid.style.gridTemplateColumns, "repeat(30, minmax(0, 1fr))");
  assert.equal(grid.classList.contains("strip"), false);
  st.seatLayout = "strip";
  render();
  assert.equal(grid.classList.contains("strip"), true);
  assert.deepEqual(panes().map((p) => p.style.gridArea), ["", "", "", "", ""]);
  st.seatLayout = "grid";
  setStructure("classic", { quiet: true });
});

test("every seat of the block gets a pane with the real tile inside, a title on the divider and a status bar", () => {
  wear([["a", "b", "c", "d", "e", "f"], ["g"]], { b: { state: "working" } });
  const shown = panes();
  assert.deepEqual(shown.map((p) => p.dataset.key), ["a", "b", "c", "d", "e", "f"]);
  for (const pane of shown) assert.equal(tiles.get(pane.dataset.key).parentElement, pane.querySelector(".ck-host"), `${pane.dataset.key} is not in its pane`);
  assert.equal(tiles.get("g")?.isConnected ?? false, false, "a seat of another block stays out of view");
  assert.equal(shown[0].querySelector(".ck-pn").textContent, "1");
  assert.equal(shown[0].querySelector(".ck-pt").textContent, "a");
  assert.equal(shown[0].querySelector(".ck-pm").textContent, "acme-hub · main");
  assert.equal(shown[0].classList.contains("on"), true, "the focused seat wears the outline");
  assert.equal(shown[1].classList.contains("on"), false);
  assert.match(shown[1].querySelector(".ck-sl").textContent, /working/);
  assert.match(shown[1].querySelector(".ck-sl").textContent, /Opus 5\.5/);
  assert.equal(shown[3].style.gridArea, "2 / 1 / span 1 / span 2");
  setStructure("classic", { quiet: true });
});

test("the context window and the running tool come from the live seat", () => {
  wear([["a", "b"]], { a: { state: "working" } });
  structPool.set("a", { host: document.createElement("div"), activity: "running Bash", activitySince: Date.now() - 6000, context: { t: 62000, m: 100000, p: 62.4 } });
  render();
  const bar = panes()[0].querySelector(".ck-sl").textContent;
  structPool.delete("a");
  assert.match(bar, /Bash/);
  assert.match(bar, /6s/);
  assert.match(bar, /ctx\s+62%/);
  setStructure("classic", { quiet: true });
});

test("a seat that needs you turns its whole bar coral and takes a block of the status line", () => {
  wear([["a", "b", "c"], ["g"]], { c: { state: "needs" } });
  const need = panes().find((p) => p.dataset.key === "c");
  assert.equal(need.classList.contains("need"), true);
  assert.equal(need.querySelector(".ck-sl").classList.contains("need"), true);
  assert.match(need.querySelector(".ck-sl").textContent, /▲ needs you/);
  assert.match(need.querySelector(".ck-sl").textContent, /answers/);
  const call = $("structure-root").querySelector(".ck-line .ck-need");
  assert.match(call.textContent, /▲ 3 c/);
  call.click();
  assert.equal(st.focus, 2);
  setStructure("classic", { quiet: true });
});

test("the status line names the blocks like tmux windows, with the current one starred", () => {
  st.prs = [];
  wear([["a", "b"], ["g"]]);
  const line = $("structure-root").querySelector(".ck-line");
  const wins = [...line.querySelectorAll(".ck-win")].map((w) => w.textContent);
  assert.match(wins[0], /^1:a( \+1)?\*$/);
  assert.equal(wins[1], "2:OMS");
  assert.equal(line.querySelector(".ck-ses").textContent.includes("hive"), true);
  assert.match(line.querySelector(".ck-clock").textContent, /\d\d:\d\d/);
  line.querySelectorAll(".ck-win")[1].click();
  assert.equal(st.block, 1);
  assert.deepEqual(panes().map((p) => p.dataset.key), ["g"]);
  setStructure("classic", { quiet: true });
});

test("⌃B z zooms the focused pane over the grid, the others wait behind it, and z again brings the grid back", () => {
  wear([["a", "b", "c"]]);
  const ev = chord("KeyZ", { key: "z" });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(st.pending, false, "the prefix is spent");
  assert.equal(st.open, "a");
  assert.deepEqual(panes().map((p) => p.dataset.key), ["a"]);
  const line = $("structure-root").querySelector(".ck-line");
  assert.match(line.querySelector(".ck-win.cur").textContent, /\*Z$/);
  assert.deepEqual([...line.querySelectorAll(".ck-hid b")].map((b) => b.textContent), ["2", "3"]);
  chord("KeyZ", { key: "z" });
  assert.equal(st.open, null);
  assert.equal(panes().length, 3);
  setStructure("classic", { quiet: true });
});

test("⌃B q shows the numbers and a digit goes to that pane; any other key just hides them", () => {
  wear([["a", "b", "c", "d"]], { d: { state: "needs" } });
  const dim = st.dimOn;
  chord("KeyQ", { key: "q" });
  const grid = $("structure-root").querySelector(".ck-grid");
  assert.equal(grid.classList.contains("numbers"), true);
  assert.equal(st.dimOn, dim, "q stays the cockpit's, it does not reach dim");
  const big = panes().map((p) => p.querySelector(".ck-num").textContent);
  assert.deepEqual(big, ["1", "2", "3", "4"]);
  assert.ok(panes()[3].querySelector(".ck-big .rc-key"), "the one that needs you shows how to answer it");
  assert.match($("structure-root").querySelector(".ck-msg").textContent, /seat number/);
  const ev = press("Digit3", { key: "3" });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(st.focus, 2);
  assert.equal(grid.classList.contains("numbers"), false);
  chord("KeyQ", { key: "q" });
  const free = press("KeyK", { key: "k" });
  assert.equal(free.defaultPrevented, false, "the key goes on to wherever it was going");
  assert.equal(grid.classList.contains("numbers"), false);
  setStructure("classic", { quiet: true });
});

test("⌃B and the arrows walk the panes by their place on screen, whatever the layout preference", () => {
  wear([["a", "b", "c", "d", "e", "f"]]);
  chord("ArrowRight", { key: "ArrowRight" });
  assert.equal(st.focus, 1);
  chord("ArrowDown", { key: "ArrowDown" });
  assert.equal(st.focus, 4);
  chord("ArrowRight", { key: "ArrowRight" });
  chord("ArrowRight", { key: "ArrowRight" });
  assert.equal(st.focus, 5, "the edge holds");
  chord("ArrowUp", { key: "ArrowUp" });
  assert.equal(st.focus, 2);
  assert.equal(panes()[2].classList.contains("on"), true);
  setStructure("classic", { quiet: true });
});

test("without the prefix the cockpit leaves every key alone, and the other chords still reach the hive", () => {
  wear([["a", "b", "c"]]);
  const plain = press("KeyZ", { key: "z" });
  assert.equal(plain.defaultPrevented, false);
  assert.equal(st.open, null);
  chord("Digit2", { key: "2" });
  assert.equal(st.focus, 1, "⌃B 2 is still the hive's own goToSeat");
  disarmLeader();
  setStructure("classic", { quiet: true });
});

test("the which-key band lists the cockpit's keys, the one that answers you first in coral", () => {
  wear([["a", "b"]]);
  const band = $("structure-root").querySelector(".ck-which");
  assert.match(band.textContent, /armed · one key/);
  assert.match(band.textContent, /zoom in \/ back/);
  assert.match(band.textContent, /the seat numbers/);
  assert.match(band.querySelector(".ck-wi.hot").textContent, /who needs you/);
  setStructure("classic", { quiet: true });
});

test("an empty block says how to start one instead of showing nothing", () => {
  wear([[]]);
  assert.equal(panes().length, 0);
  assert.match($("structure-root").querySelector(".ck-grid").dataset.empty, /opens a new seat/);
  setStructure("classic", { quiet: true });
});

test("leaving gives every tile back to the canvas and leaves the root empty", () => {
  wear([["a", "b"]]);
  chord("KeyQ", { key: "q" });
  setStructure("classic", { quiet: true });
  assert.equal(tiles.get("a").parentElement, $("canvas"));
  assert.equal($("structure-root").children.length, 0);
  assert.equal($("structure-root").classList.contains("ck"), false);
  setStructure("cockpit", { quiet: true });
  assert.equal($("structure-root").querySelector(".ck-grid").classList.contains("numbers"), false, "the numbers do not survive a trip away");
  setStructure("classic", { quiet: true });
});

test("a pane the chat opens, like the browser, sits beside the chat instead of being squeezed under it", () => {
  const css = readFileSync(new URL("../assets/structures/cockpit.css", import.meta.url), "utf8");
  const pane = '.ck-host > .tile.open.arting';
  assert.match(css, new RegExp(`${pane.replace(/[.>]/g, "\\$&")} \\{ flex-direction: row; \\}`));
  assert.match(css, new RegExp(`${pane.replace(/[.>]/g, "\\$&")} > \\.well \\{ flex: 1 1 0; min-width: 0; \\}`));
  assert.match(css, new RegExp(`${pane.replace(/[.>]/g, "\\$&")} > \\.art \\{ flex: 1\\.4 1 0;`));
});
