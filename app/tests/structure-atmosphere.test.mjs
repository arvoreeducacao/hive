import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PT_BR, fill } from "../assets/i18n.mjs";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(HERE, "assets/structures/atmosphere.css"), "utf8");

const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ sessions: [] }), text: async () => "{}" });
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { setStructure, structureWorn } = await app("structure");
const { atmosphere } = await import(new URL("../src/structures/atmosphere.js", import.meta.url).href);

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const english = (said, slots) => fill(said, slots);
const portuguese = (said, slots) => fill(PT_BR[said] || said, slots);

const seatOf = (key, state, at, extra = {}) => ({ key, name: key, title: key, state, block: 0, at, here: true, ...extra });

const fleet = [
  seatOf("asks", "needs", 2, { now: "wants to open the PR of item 1" }),
  seatOf("told", "answered", 3),
  seatOf("busy", "working", 0),
  seatOf("stuck", "stalled", 4),
  seatOf("shipped", "ready", 5),
  seatOf("resting", "idle", 1)
];

const area = (box) => box.w * box.h;

test("the one that needs you is the big window in front, the busy ones are medium and the finished ones are a stack of miniatures", () => {
  const laid = atmosphere.arrange(fleet, { width: 1440, height: 900 });
  assert.equal(laid.front, "asks");
  const box = (key) => laid.boxes.get(key);
  assert.deepEqual(box("asks"), { x: 480, y: 92, w: 608, h: 676, size: "lg", z: 10, depth: 0 });
  assert.equal(box("told").size, "md");
  assert.equal(box("told").x, 56, "the one that answered sits under the headline, where you read next");
  assert.equal(box("busy").size, "md");
  assert.equal(box("busy").x, 1112);
  assert.equal(box("stuck").size, "md");
  assert.ok(box("stuck").y > box("busy").y + box("busy").h, "the right column stacks without overlap");
  assert.equal(box("shipped").size, "sm");
  assert.equal(box("resting").size, "sm");
  assert.ok(box("shipped").y > box("resting").y, "the most important miniature is the one fully in view at the bottom of the stack");
  assert.ok(box("shipped").z > box("resting").z);
  assert.ok(area(box("asks")) > area(box("busy")) && area(box("busy")) > area(box("shipped")), "the size says the importance");
  assert.ok(box("asks").z > box("busy").z);
  for (const one of laid.boxes.values()) assert.ok(one.x >= 0 && one.y >= 0 && one.x + one.w <= 1440 && one.y + one.h <= 900, "every window fits the screen");
  assert.equal(laid.stack.count, 2);
});

test("a seat you chose comes to the front, and one that left falls back to the most urgent", () => {
  const chosen = atmosphere.arrange(fleet, { width: 1440, height: 900, front: "resting" });
  assert.equal(chosen.front, "resting");
  assert.equal(chosen.boxes.get("resting").size, "lg");
  assert.equal(chosen.boxes.get("asks").size, "md");
  assert.equal(atmosphere.arrange(fleet, { width: 1440, height: 900, front: "gone" }).front, "asks");
  assert.equal(atmosphere.arrange([], { width: 1440, height: 900 }).front, null);
  const elsewhere = atmosphere.arrange([...fleet, { ...seatOf("far", "needs", 0), block: 1, here: false }], { width: 1440, height: 900 });
  assert.equal(elsewhere.boxes.has("far"), false, "only the seats of the block on screen become windows");
});

test("more busy seats than medium slots fall into the stack instead of covering the front", () => {
  const crowd = [seatOf("a", "needs", 0), ...["b", "c", "d", "e", "f"].map((key, i) => seatOf(key, "working", i + 1))];
  const laid = atmosphere.arrange(crowd, { width: 1440, height: 900 });
  assert.deepEqual([...laid.boxes.values()].map((one) => one.size).sort(), ["lg", "md", "md", "md", "sm", "sm"]);
  const front = laid.boxes.get("a");
  for (const [key, one] of laid.boxes) {
    if (key === "a") continue;
    const apart = one.x + one.w <= front.x || one.x >= front.x + front.w;
    assert.ok(apart, `${key} overlaps the window in front`);
  }
});

test("spreading puts every seat of the block at one size, in the order of their keys", () => {
  const laid = atmosphere.arrange(fleet, { width: 1440, height: 900, spread: true });
  assert.equal(laid.spread, true);
  const boxes = [...laid.boxes.values()];
  assert.ok(boxes.every((one) => one.size === "eq" && one.w === boxes[0].w && one.h === boxes[0].h));
  const byKey = [...laid.boxes.entries()].sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).map(([key]) => key);
  assert.deepEqual(byKey, ["busy", "resting", "asks", "told", "stuck", "shipped"]);
  assert.equal(laid.stack, null);
});

test("the headline counts the whole fleet by what it asks of you, in english and in portuguese", () => {
  assert.equal(atmosphere.storyOf(fleet, english).headline, "1 seat needs you");
  assert.equal(atmosphere.storyOf(fleet, portuguese).headline, "1 assento pede você");
  const two = [...fleet, seatOf("again", "needs", 6)];
  assert.equal(atmosphere.storyOf(two, portuguese).headline, "2 assentos pedem você");
  assert.equal(atmosphere.storyOf([seatOf("x", "answered", 0)], portuguese).headline, "1 assento respondeu");
  assert.equal(atmosphere.storyOf([seatOf("x", "working", 0), seatOf("y", "working", 1)], portuguese).headline, "2 assentos trabalhando");
  assert.equal(atmosphere.storyOf([seatOf("x", "idle", 0)], portuguese).headline, "Tudo quieto");
  assert.equal(atmosphere.storyOf([], portuguese).headline, "Nenhum assento ainda");
  const story = atmosphere.storyOf(fleet, english);
  assert.deepEqual(story.lead, { key: "asks", name: "asks", says: "wants to open the PR of item 1" });
  assert.deepEqual(story.tally, [["answered", 1], ["working", 1], ["stalled", 1], ["ready", 1], ["idle", 1]]);
  assert.equal(atmosphere.storyOf([seatOf("x", "needs", 0)], portuguese).lead.says, PT_BR["it stopped and asks you something"]);
});

test("tab walks the seats that need you, across blocks, and wraps", () => {
  const seats = [seatOf("a", "needs", 0), { ...seatOf("b", "needs", 0), block: 1, here: false }, seatOf("c", "working", 1)];
  assert.equal(atmosphere.nextNeeding(seats, null), "a");
  assert.equal(atmosphere.nextNeeding(seats, "a"), "b");
  assert.equal(atmosphere.nextNeeding(seats, "b"), "a");
  assert.equal(atmosphere.nextNeeding(seats, "c"), "a");
  assert.equal(atmosphere.nextNeeding(seats, "a", -1), "b");
  assert.equal(atmosphere.nextNeeding([seatOf("c", "working", 0)], "c"), null);
});

function fakeCtx(seats, { field = false } = {}) {
  const went = [];
  let renders = 0;
  return {
    went,
    renders: () => renders,
    seats: () => seats,
    focused: () => seats[0]?.key || null,
    focusSeat: (key) => went.push(key),
    render: () => { renders += 1; },
    inField: () => field,
    onPlane: () => false
  };
}

const key = (code, mods = {}) => ({ code, key: code === "Tab" ? "Tab" : "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

test("the keys: tab outside a text field goes to the next that needs you, ⌥⇧E spreads even while typing, ⌘digit is left to the app", () => {
  const ctx = fakeCtx(fleet);
  assert.equal(atmosphere.keydown(key("Tab"), ctx), true);
  assert.deepEqual(ctx.went, ["asks"]);
  const typing = fakeCtx(fleet, { field: true });
  assert.equal(atmosphere.keydown(key("Tab"), typing), false, "tab inside a text field stays the field's");
  assert.equal(atmosphere.keydown(key("Tab"), fakeCtx([seatOf("c", "working", 0)])), false, "with nobody asking, tab is not taken");
  assert.equal(atmosphere.keydown(key("Tab", { metaKey: true }), ctx), false);
  assert.equal(atmosphere.keydown(key("KeyE", { altKey: true, shiftKey: true }), typing), true);
  assert.equal(typing.renders(), 1);
  assert.equal(atmosphere.keydown(key("KeyE", { altKey: true, shiftKey: true }), typing), true);
  assert.equal(atmosphere.keydown(key("KeyE", { altKey: true }), ctx), false, "⌥E stays the shelf");
  assert.equal(atmosphere.keydown(key("Digit2", { metaKey: true }), ctx), false, "the app still runs its own seat key");
});

const sessionOf = (name, state) => ({ name, title: name, where: "local", state, kind: "chat" });

function lay(blocks, states) {
  const names = blocks.flat();
  st.LIMIT = 6;
  st.calmOn = false;
  st.data = { sessions: names.map((name) => sessionOf(name, states[name] || "idle")), spawning: [], archived: [], pod: { up: false, name: "" } };
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

const frameOf = (name) => tiles.get(name)?.parentElement;

test("on the real app: the tiles move into glass windows, the one that needs you in front, and the classic takes them back", () => {
  lay([["calm", "busy", "asks", "done1"], ["far"]], { busy: "working", asks: "needs", done1: "ready", far: "needs" });
  setStructure("atmosphere", { quiet: true });
  assert.equal(structureWorn(), "atmosphere");
  const root = $("structure-root");
  assert.ok(root.querySelector(".atmo-sky"), "the atmosphere is painted behind everything");
  assert.match(root.querySelector(".atmo-hero h1").textContent, /2 seats need you/);
  assert.ok(frameOf("asks").classList.contains("atmo-win") && frameOf("asks").classList.contains("front") && frameOf("asks").classList.contains("lg"));
  assert.ok(frameOf("busy").classList.contains("md"));
  assert.ok(frameOf("done1").classList.contains("sm"));
  assert.ok(frameOf("calm").classList.contains("sm"));
  assert.equal(root.querySelector('[data-key="far"]'), null, "the other block stays out of the windows");
  const asks = tiles.get("asks");
  render();
  assert.equal(tiles.get("asks"), asks, "a render reuses the tile and its window");
  assert.equal(root.querySelectorAll(".atmo-win").length, 4);
  setStructure("classic", { quiet: true });
  assert.equal(tiles.get("asks"), asks, "the conversation survives the trip back");
  assert.equal(tiles.get("asks").parentElement, $("canvas"));
  assert.equal(root.children.length, 0);
});

test("on the real app: clicking a window behind, a seat key and tab bring a seat to the front", () => {
  lay([["calm", "busy", "asks", "done1"], ["far"]], { busy: "working", asks: "needs", done1: "ready", far: "needs" });
  setStructure("atmosphere", { quiet: true });
  frameOf("busy").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.ok(frameOf("busy").classList.contains("front"));
  assert.equal(st.focus, 1, "the app's own focus follows");
  const seatKey = new KeyboardEvent("keydown", { code: "Digit4", metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true, cancelable: true });
  document.body.dispatchEvent(seatKey);
  render();
  assert.ok(frameOf("done1").classList.contains("front"), "⌘4 brings the fourth seat forward");
  document.body.focus?.();
  const tab = new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true, cancelable: true });
  document.body.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.ok(frameOf("asks").classList.contains("front"), "tab goes to the one that needs you");
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true, cancelable: true }));
  assert.equal(st.block, 1, "the next one that needs you was in the other block");
  assert.ok(frameOf("far").classList.contains("front"));
  const spread = new KeyboardEvent("keydown", { code: "KeyE", altKey: true, shiftKey: true, bubbles: true, cancelable: true });
  document.body.dispatchEvent(spread);
  assert.ok($("structure-root").classList.contains("spread"));
  assert.ok(frameOf("far").classList.contains("eq"));
  setStructure("classic", { quiet: true });
  assert.equal($("structure-root").classList.contains("spread"), false);
});

test("the stylesheet keeps a lean mode with no glass blur and quiets the motion when asked", () => {
  const lean = css.split("\n").filter((line) => line.includes(".lean"));
  assert.ok(lean.some((line) => /\.lean \.atmo-win/.test(line)) && css.includes("backdrop-filter: none"), "lean drops the backdrop blur of the windows");
  assert.ok(lean.some((line) => /\.lean \.atmo-sky \.ray/.test(line)), "lean drops the blurred rays");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.no-motion \.atmo-win/);
});
