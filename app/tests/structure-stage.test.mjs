import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PT_BR } from "../assets/i18n.mjs";
import { app, state } from "./dom.mjs";

const realFetch = globalThis.fetch;
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = (url) => Promise.resolve(answered(String(url).includes("/api/changes") ? { state: "clean", files: [] } : { sessions: [] }));
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { run } = await app("themes");
const { setStructure, structureWorn } = await app("structure");
const { stage } = await import(new URL("../src/structures/stage.js", import.meta.url).href);

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

const host = () => document.querySelector("#structure-root .stg-host");
const minis = () => [...document.querySelectorAll("#structure-root .stg-wing .stg-mini[data-seat]")].map((one) => one.dataset.seat);
const press = (code, mods = {}) => {
  const event = new KeyboardEvent("keydown", { code, metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true, cancelable: true, ...mods });
  document.body.dispatchEvent(event);
  return event;
};

const withSeats = (seats) => seats.map(([key, state, block, here, extra = {}]) => ({ key, name: key, title: key, kind: "session", state, block, here, at: 0, space: "w0", ...extra }));

test("the view model puts the focused seat on the stage, lifts whoever needs you and stacks the rest by block", () => {
  const seats = withSeats([["ask", "needs", 1, false], ["run", "working", 0, true], ["two", "working", 1, false], ["me", "idle", 0, true], ["old", "idle", 1, false], ["far", "idle", 1, false]]);
  const model = stage.model(seats, "me", { labelOf: (block) => `label ${block}` });
  assert.equal(model.onStage, "me");
  assert.equal(model.stageSeat.key, "me");
  assert.deepEqual(model.calling.map((one) => one.key), ["ask"]);
  assert.deepEqual(model.stacks.map((one) => [one.block, one.label, one.hole, one.front?.key, one.behind.map((b) => b.key), one.all.map((a) => a.key)]), [
    [0, "label 0", true, "run", [], ["run"]],
    [1, "label 1", false, "two", ["far", "old"], ["two", "old", "far"]]
  ]);
  assert.equal(model.stacks[0].here, true);
  assert.equal(model.stacks[1].here, false);
});

test("a focus the structure does not know falls back to the first seat, and a seat alone on the stage leaves a bare stack", () => {
  const seats = withSeats([["only", "idle", 0, true]]);
  const model = stage.model(seats, "ghost");
  assert.equal(model.onStage, "only");
  assert.deepEqual(model.stacks.map((one) => [one.block, one.hole, one.front]), [[0, true, null]]);
  assert.deepEqual(stage.model([], null), { onStage: null, stageSeat: null, calling: [], stacks: [] });
});

test("a thumbnail says the last thing the seat said, and the question when it needs you", () => {
  const [asking] = withSeats([["ask", "needs", 0, true, { finish: { text: "Fixed the **cookie** in `auth.ts`.\n\nCan I open the PR?", at: new Date(Date.now() - 120000).toISOString() } }]]);
  const card = stage.card(asking, { keyOf: () => "⌘3" });
  assert.equal(card.text, "Fixed the cookie in auth.ts.");
  assert.equal(card.ask, "Can I open the PR?");
  assert.equal(card.hint, "⌘3");
  assert.ok(card.when);
  const [picked] = withSeats([["pick", "needs", 0, true, { asks: [{ id: "q", questions: [{ question: "Which school?" }] }], now: "reading the deal" }]]);
  assert.equal(stage.card(picked).ask, "Which school?");
  assert.equal(stage.card(picked).text, "reading the deal");
  const [calm] = withSeats([["calm", "idle", 0, true, { finish: { text: "Done. Want more?" } }]]);
  assert.equal(stage.card(calm).ask, "");
  assert.equal(stage.card(calm).busy, false);
});

test("entering builds the wing, the stage and the side strip, and the real tile of the focused seat goes on the stage", () => {
  lay([["a", "b"], ["c"]], { b: "needs", c: "working" }, { a: { trees: [{ repo: "hub", branch: "joao/-/stage", path: "/x/.wt-stage", main: false }] } });
  setStructure("stage", { quiet: true });
  assert.equal(structureWorn(), "stage");
  assert.equal(document.body.dataset.structure, "stage");
  assert.equal($("structure-root").hidden, false);
  assert.ok(host(), "the stage is on the page");
  assert.equal(tiles.get("a").parentElement, host(), "the seat in focus is on the stage, the real tile");
  assert.equal(host().children.length, 1);
  assert.deepEqual(minis().sort(), ["b", "c"]);
  assert.ok(document.querySelector(".stg-stack.pop .stg-selo"), "who needs you gets the coral seal");
  assert.equal(document.querySelector(".stg-stack.pop .stg-mini").dataset.seat, "b");
  assert.match(document.querySelector(".stg-ctx").textContent, /\.wt-stage/);
  assert.match(document.querySelector(".stg-ctx").textContent, /stage/);
  setStructure("classic", { quiet: true });
});

test("clicking a thumbnail puts that seat on the stage, from any block", () => {
  lay([["a", "b"], ["c"]], { c: "working" });
  setStructure("stage", { quiet: true });
  document.querySelector('.stg-mini[data-seat="c"]').click();
  assert.equal(st.block, 1);
  assert.equal(tiles.get("c").parentElement, host());
  assert.equal(host().children.length, 1);
  assert.ok(minis().includes("a"), "the seat that left the stage goes back to its stack");
  document.querySelector('.stg-who-one[data-seat="b"]').click();
  assert.equal(tiles.get("b").parentElement, host());
  setStructure("classic", { quiet: true });
});

test("the seat keys the app already has change the stage", () => {
  lay([["a", "b", "c"]]);
  setStructure("stage", { quiet: true });
  assert.equal(tiles.get("a").parentElement, host());
  run("seat", 3);
  assert.equal(tiles.get("c").parentElement, host());
  run("seat", 2);
  assert.equal(tiles.get("b").parentElement, host());
  setStructure("classic", { quiet: true });
});

test("⌘J jumps to whoever needs you, and lets the key go when nobody does", () => {
  lay([["a"], ["b", "c"]], { c: "needs" });
  setStructure("stage", { quiet: true });
  const jump = press("KeyJ");
  assert.equal(jump.defaultPrevented, true);
  assert.equal(tiles.get("c").parentElement, host());
  const again = press("KeyJ");
  assert.equal(again.defaultPrevented, false, "the one that needs you is already on the stage");
  assert.equal(press("KeyJ", { shiftKey: true }).defaultPrevented, false);
  lay([["a", "b"]]);
  assert.equal(press("KeyJ").defaultPrevented, false);
  setStructure("classic", { quiet: true });
});

test("a key the person bound to ⌘J keeps working", () => {
  const moved = [];
  const ctx = { seats: () => [{ key: "b", state: "needs" }], focused: () => "a", focusSeat: (key) => moved.push(key), tile: () => null };
  const event = () => new KeyboardEvent("keydown", { code: "KeyJ", metaKey: IS_MAC, ctrlKey: !IS_MAC });
  assert.equal(stage.keydown(event(), ctx), true);
  assert.deepEqual(moved, ["b"]);
  const kept = st.keys.history;
  st.keys.history = IS_MAC ? { meta: true, code: "KeyJ" } : { ctrl: true, code: "KeyJ" };
  assert.equal(stage.keydown(event(), ctx), false);
  assert.deepEqual(moved, ["b"]);
  st.keys.history = kept;
});

test("leaving puts every tile back on the canvas and leaves the root empty", () => {
  lay([["a", "b"], ["c"]]);
  setStructure("stage", { quiet: true });
  document.querySelector('.stg-mini[data-seat="c"]').click();
  setStructure("classic", { quiet: true });
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal($("structure-root").children.length, 0);
  assert.equal($("structure-root").hidden, true);
  assert.equal(tiles.get("c").parentElement, $("canvas"));
  assert.equal(tiles.get("c").isConnected, true);
});

test("with no seat the stage steps aside for the empty wall the app shows", () => {
  lay([]);
  setStructure("stage", { quiet: true });
  assert.equal(structureWorn(), "stage");
  assert.equal($("structure-root").hidden, true);
  setStructure("classic", { quiet: true });
});

test("the stage only speaks portuguese where it says something", () => {
  for (const said of ["jumped from block {n}", "on the stage", "the other seats, stacked by block", "no worktree", "nothing uncommitted", "{n} PRs linked", "not opened yet", "no page open", "opens beside the conversation"]) {
    assert.ok(PT_BR[said], `${said} is not translated`);
  }
});
