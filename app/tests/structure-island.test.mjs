import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PT_BR } from "../assets/i18n.mjs";
import { app, state } from "./dom.mjs";

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve(answered({ sessions: [] }));
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { structPool } = await app("structured-seats");
const { setStructure, structureWorn } = await app("structure");
const { island } = await import(new URL("../src/structures/island.js", import.meta.url).href);

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

const press = (code, mods = {}, target = document.body, key = "") => {
  const ev = new KeyboardEvent("keydown", { code, key: key || code, bubbles: true, cancelable: true, ...mods });
  target.dispatchEvent(ev);
  return ev;
};

const mod = IS_MAC ? { metaKey: true } : { ctrlKey: true };

const asking = {
  finish: { seq: 4, at: new Date(Date.now() - 2 * 60000).toISOString(), text: "I looked at the login twice.\n\nCan I open the PR for item 1?" },
  asks: [{ id: "q1", questions: [{ question: "Open the PR for item 1?", options: [{ label: "Go ahead" }, { label: "Wait" }] }] }]
};

const at = (key, block, at, state = "idle", more = {}) => ({ key, name: key, title: key, block, at, state, here: block === 0, ...more });

test("the model keeps the fleet in place order, and the one asking is lifted out of the grid", () => {
  const seats = [
    at("ask", 1, 0, "needs", asking),
    at("mine", 0, 0, "working", { now: "Building the **fifth** strip" }),
    at("rest", 0, 1, "idle", { finish: { text: "Done.\n\n- Opened `web#1006`" }, prs: ["https://github.com/o/r/pull/1"] })
  ];
  const m = island.model(seats, { focused: "mine", prs: [{ state: "open", ci: "failed" }, { state: "open", ci: "passed" }, { state: "merged", ci: "failed" }] });
  assert.deepEqual(m.dots.map((one) => [one.key, one.cur, one.gap]), [["mine", true, false], ["rest", false, false], ["ask", false, true]]);
  assert.equal(m.calls, 1);
  assert.equal(m.who, "ask");
  assert.equal(m.working, 1);
  assert.equal(m.failing, 1);
  assert.equal(m.prs, 2);
  assert.equal(m.seats, 3);
  assert.equal(m.blocks, 2);
  assert.equal(m.hot.key, "ask");
  assert.equal(m.hot.question, "Open the PR for item 1?");
  assert.equal(m.hot.context, "Can I open the PR for item 1?");
  assert.deepEqual(m.hot.options, ["Go ahead", "Wait"]);
  assert.ok(m.hot.when > 0);
  assert.deepEqual(m.cells.map((one) => [one.key, one.here, one.line, one.prs]), [
    ["mine", true, "Building the fifth strip", 0],
    ["rest", false, "Opened web#1006", 1]
  ]);
});

test("without a question the last paragraph is what it asks, and the seat in front of you is never lifted out", () => {
  const plain = at("p", 0, 0, "needs", { finish: { text: "First I checked.\n\nShould I go on?" } });
  assert.deepEqual(island.model([plain], { focused: null }).hot, { key: "p", name: "p", block: 0, at: 0, here: true, when: 0, question: "Should I go on?", context: "First I checked.", options: [] });
  const m = island.model([plain], { focused: "p" });
  assert.equal(m.hot, null);
  assert.equal(m.calls, 1);
  assert.deepEqual(m.cells.map((one) => one.key), ["p"]);
});

test("entering builds the pill and the reading column, and the real tile of the focused seat moves into it", () => {
  lay([["a", "b"], ["c"]], { b: "needs", c: "working" }, { b: asking });
  setStructure("island", { quiet: true });
  assert.equal(structureWorn(), "island");
  assert.equal(document.body.dataset.structure, "island");
  const root = $("structure-root");
  assert.ok(root.querySelector(".il-island .il-bar .il-fleet"));
  assert.equal(root.querySelectorAll(".il-bar .rc-dot").length, 3);
  assert.ok(root.querySelector(".il-bar .rc-dot.cur[data-seat='a']"));
  assert.match(root.querySelector(".il-bar").textContent, /1 needs you\s*b/);
  assert.ok(root.classList.contains("il-calling"));
  assert.equal(root.querySelector(".il-panel").hidden, true);
  assert.equal(root.querySelector(".il-title").textContent, "a");
  assert.match(root.querySelector(".il-head .eyebrow").textContent, /block 1 · seat 1 of 2/);
  const tile = tiles.get("a");
  assert.equal(tile.parentElement, root.querySelector(".il-seat"));
  assert.equal(tiles.get("b").parentElement, $("canvas"));
  setStructure("classic", { quiet: true });
  assert.equal(tiles.get("a"), tile, "the same tile, never rebuilt");
  assert.equal(tile.parentElement, $("canvas"));
  assert.equal(root.children.length, 0);
  assert.equal(root.classList.contains("il-root"), false);
});

test("going to another seat moves that one into the column instead", () => {
  lay([["a", "b"]]);
  setStructure("island", { quiet: true });
  st.focus = 1;
  render();
  const host = $("structure-root").querySelector(".il-seat");
  assert.equal(tiles.get("b").parentElement, host);
  assert.equal(tiles.get("a").parentElement, $("canvas"));
  assert.equal($("structure-root").querySelector(".il-title").textContent, "b");
  setStructure("classic", { quiet: true });
});

test("the island key opens the fleet with the one asking on top, esc closes it, and the keys go back to the app", () => {
  lay([["a", "b"], ["c"]], { b: "needs", c: "working" }, { b: asking });
  setStructure("island", { quiet: true });
  const root = $("structure-root");
  assert.equal(press("Escape", {}, document.body, "Escape").defaultPrevented, false, "esc is not taken while the island is shut");
  assert.equal(press("KeyJ", mod).defaultPrevented, true);
  assert.equal(root.querySelector(".il-panel").hidden, false);
  assert.ok(root.classList.contains("il-open"));
  const needs = root.querySelector(".il-needs");
  assert.ok(needs);
  assert.equal(needs.querySelector(".name").textContent, "b");
  assert.equal(needs.querySelector(".q").textContent, "Open the PR for item 1?");
  assert.deepEqual([...needs.querySelectorAll(".il-pill")].map((one) => one.dataset.say), ["Go ahead", "Wait"]);
  assert.equal(document.activeElement, root.querySelector(".il-in"), "the answer box takes the keyboard");
  assert.deepEqual([...root.querySelectorAll(".il-grid .il-cell[data-seat]")].map((one) => one.dataset.seat), ["a", "c"]);
  assert.ok(root.querySelector(".il-cell.here[data-seat='a']"));
  assert.ok(root.querySelector(".il-cell.picked[data-seat='a']"), "the pick starts where you are");
  assert.equal(press("Escape", {}, document.activeElement, "Escape").defaultPrevented, true);
  assert.equal(root.querySelector(".il-panel").hidden, true);
  assert.notEqual(document.activeElement, root.querySelector(".il-in"));
  press("KeyJ", mod);
  assert.equal(press("KeyJ", mod).defaultPrevented, true);
  assert.equal(root.querySelector(".il-panel").hidden, true, "the same key shuts it again");
  setStructure("classic", { quiet: true });
});

test("the arrows walk the grid and enter opens the seat picked, even in another block", () => {
  lay([["a", "b"], ["c"]], { c: "working" });
  setStructure("island", { quiet: true });
  const root = $("structure-root");
  press("KeyJ", mod);
  assert.ok(root.querySelector(".il-cell.picked[data-seat='a']"));
  assert.equal(press("ArrowRight", {}, document.body, "ArrowRight").defaultPrevented, true);
  assert.ok(root.querySelector(".il-cell.picked[data-seat='b']"));
  press("ArrowRight", {}, document.body, "ArrowRight");
  assert.ok(root.querySelector(".il-cell.picked[data-seat='c']"));
  assert.equal(press("Enter", {}, document.body, "Enter").defaultPrevented, true);
  assert.equal(root.querySelector(".il-panel").hidden, true);
  assert.equal(st.block, 1);
  assert.equal(tiles.get("c").parentElement, root.querySelector(".il-seat"));
  setStructure("classic", { quiet: true });
});

test("the answer goes to the seat that asked through the composer's own path, and you stay where you were", () => {
  lay([["a", "b"]], { b: "needs" }, { b: { ...asking, structured: true } });
  const typed = [];
  structPool.set("b", { ws: { readyState: 1 }, type: (text) => typed.push(text) });
  setStructure("island", { quiet: true });
  const root = $("structure-root");
  press("KeyJ", mod);
  const box = root.querySelector(".il-in");
  assert.equal(press("Tab", {}, box, "Tab").defaultPrevented, true);
  assert.equal(box.value, "Go ahead");
  box.value = "Go ahead with item 1";
  assert.equal(press("Enter", {}, box, "Enter").defaultPrevented, true);
  assert.deepEqual(typed, ["Go ahead with item 1"]);
  assert.equal(box.value, "");
  assert.match(root.querySelector(".il-said").textContent, /sent to b/);
  assert.equal(st.focus, 0, "the focus never left the seat you were reading");
  assert.equal(tiles.get("a").parentElement, root.querySelector(".il-seat"));
  structPool.get("b").ws.readyState = 3;
  box.value = "and the second one";
  press("Enter", {}, box, "Enter");
  assert.equal(typed.length, 1);
  assert.equal(box.value, "and the second one", "a seat that does not answer keeps the message");
  assert.match(root.querySelector(".il-said").textContent, /not answering/);
  structPool.get("b").ws.readyState = 1;
  press("Enter", { ...mod }, box, "Enter");
  assert.deepEqual(typed, ["Go ahead with item 1", "and the second one"]);
  assert.equal(root.querySelector(".il-panel").hidden, true);
  assert.equal(st.focus, 1, "with the modifier it answers and opens the seat");
  structPool.delete("b");
  setStructure("classic", { quiet: true });
});

test("a key typed in a field of the app is left alone while the island is open", () => {
  lay([["a", "b"]]);
  setStructure("island", { quiet: true });
  press("KeyJ", mod);
  const box = $("cmp-in");
  box.focus();
  assert.equal(press("ArrowRight", {}, box, "ArrowRight").defaultPrevented, false);
  box.blur();
  setStructure("classic", { quiet: true });
});

test("the island is ready and speaks portuguese", () => {
  assert.equal(island.ready, true);
  for (const said of ["1 needs you", "{n} need you", "the answer goes to {name}; you stay where you are", "block {n} · seat {m} of {k}", "Reply", "sent to {name}"]) {
    assert.ok(PT_BR[said], `${said} is not translated`);
  }
});
