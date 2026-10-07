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
const { setStructure, structureWorn } = await app("structure");
const { NODE_H, NODE_W, PLANE_CARD_AT, PLANE_GAP, PLANE_KEY, planeShown } = await app("plane");
const mapModule = await import(new URL("../src/structures/map.js", import.meta.url).href);
const {
  MAP_WAS_KEY, blockGroups, blockLayout, blocksTangled, boxAround, cameraOn, map, mapAreaViewModel, mapCallViewModel,
  neighboursOf, seenWhole, stepRing
} = mapModule;

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const phrase = (text, vars) => Object.entries(vars || {}).reduce((said, [key, value]) => said.split(`{${key}}`).join(value), String(text));

const seat = (name, state = "idle") => ({ name, title: name, where: "local", state, kind: "chat" });

function lay(blocks, states = {}) {
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: blocks.flat().map((name) => seat(name, states[name])), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = blocks.map((keys, i) => ({ id: `b${i}`, ws: "w0", label: i === 1 ? "crm" : "", manual: true, keys: [...keys] }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.mirrorDev = "";
  st.threadChat = null;
  st.reviewChat = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threads = [];
  st.prs = [];
  st.planeSpots = {};
  st.planeLinks = [];
  render();
}

const key = (code, extra = {}) => new KeyboardEvent("keydown", { code, key: extra.key || code, bubbles: true, cancelable: true, ...extra });

function sized(width, height) {
  const plane = $("plane");
  Object.defineProperty(plane, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(plane, "clientHeight", { value: height, configurable: true });
}

function wear() {
  setStructure("map", { quiet: true });
  render();
}

function strip() {
  setStructure("classic", { quiet: true });
  localStorage.removeItem(MAP_WAS_KEY);
}

test("seats are laid out block by block: two columns inside a block, blocks side by side, three to a row", () => {
  const spots = blockLayout([["a", "b", "c"], ["d"], ["e"], ["f"]]);
  const stepX = NODE_W + PLANE_GAP;
  const stepY = NODE_H + PLANE_GAP;
  assert.deepEqual(spots.a, { x: 0, y: 0 });
  assert.deepEqual(spots.b, { x: stepX, y: 0 });
  assert.deepEqual(spots.c, { x: 0, y: stepY });
  assert.equal(spots.d.y, 0);
  assert.ok(spots.d.x > spots.b.x + NODE_W, "the next block starts to the right of the first, with room for its label");
  assert.equal(spots.e.y, 0);
  assert.ok(spots.e.x > spots.d.x + NODE_W);
  assert.equal(spots.f.x, 0, "the fourth block wraps to a new row");
  assert.ok(spots.f.y > spots.c.y + NODE_H, "below the tallest block of the row");
  assert.deepEqual(blockLayout([[], ["z"]]), { z: { x: 0, y: 0 } }, "an empty block takes no room");
});

test("a field is tangled when a seat has no spot or two blocks overlap, and tidy when the blocks sit apart", () => {
  assert.equal(blocksTangled([["a"], ["b"]], { a: { x: 0, y: 0 } }), true);
  assert.equal(blocksTangled([["a"], ["b"]], { a: { x: 0, y: 0 }, b: { x: NODE_W + 10, y: 0 } }), false);
  assert.equal(blocksTangled([["a", "c"], ["b"]], { a: { x: 0, y: 0 }, c: { x: 1200, y: 0 }, b: { x: 600, y: 0 } }), true);
  assert.equal(blocksTangled([], {}), false);
  assert.deepEqual(boxAround([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }], 2), { x: -2, y: -2, w: 34, h: 19 });
  assert.equal(boxAround([]), null);
});

test("flying to a seat centres it at a zoom where the real tile reads, never closer than 100%", () => {
  const box = { x: 1000, y: 400, w: NODE_W, h: NODE_H };
  const near = cameraOn(box, 1440, 800);
  assert.equal(near.k, 1);
  assert.equal(near.x, Math.round((1440 - NODE_W) / 2 - 1000));
  assert.equal(near.y, Math.round((800 - NODE_H) / 2 - 400));
  assert.equal(cameraOn({ x: 0, y: 0, w: 4000, h: 3000 }, 1440, 800).k, PLANE_CARD_AT, "a huge node still opens at the reading distance");
  const at = cameraOn(box, 1440, 800);
  assert.equal(seenWhole(box, at, 1440, 800), true);
  assert.equal(seenWhole(box, { ...at, k: 0.3 }, 1440, 800), false, "from far away the tile does not read, so it is not seen");
  assert.equal(seenWhole(box, { ...at, x: at.x + 2000 }, 1440, 800), false);
});

test("Tab walks the seats tied to where it started, both ways, and keeps the round while it walks", () => {
  const seated = new Set(["a", "b", "c", "d"]);
  const pairs = [{ from: "a", to: "b" }, { from: "c", to: "a" }, { from: "a", to: "gone:x" }, { from: "a", to: "b" }];
  assert.deepEqual(neighboursOf("a", pairs, seated), ["b", "c"], "a seat that left the blocks and a repeated line count once or not at all");
  assert.deepEqual(neighboursOf("d", pairs, seated), []);
  let step = stepRing(null, "a", ["b", "c"], 1);
  assert.equal(step.next, "b");
  step = stepRing(step.list, "b", ["a"], 1);
  assert.equal(step.next, "c", "from b it keeps going round a's neighbours instead of bouncing back");
  step = stepRing(step.list, "c", ["a"], 1);
  assert.equal(step.next, "a");
  assert.equal(stepRing(null, "a", ["b", "c"], -1).next, "c");
  assert.equal(stepRing(null, "d", [], 1).next, "", "with nobody tied to it Tab is left alone");
});

test("the call at the top names who needs you, skips the one already in front of you, and counts the rest", () => {
  const seats = [{ key: "x", title: "sessao crm", state: "needs" }, { key: "y", name: "y", state: "needs" }, { key: "z", state: "idle" }];
  assert.deepEqual(mapCallViewModel(seats, "z", phrase), { on: true, key: "x", name: "sessao crm", more: "+1", here: false, says: "needs you" });
  assert.equal(mapCallViewModel(seats, "x", phrase).key, "y");
  const alone = mapCallViewModel([seats[0]], "x", phrase);
  assert.equal(alone.here, true, "the only caller is the one being read");
  assert.equal(alone.more, "");
  assert.equal(mapCallViewModel([seats[2]], "z", phrase).on, false);
});

test("each block is an area named by its label, or by its number, with how many seats and how many wait", () => {
  const group = { block: 0, keys: ["a", "b"], seats: [{ state: "needs" }, { state: "idle" }] };
  assert.deepEqual(mapAreaViewModel(group, "crm", phrase), { label: "crm", sub: "1 of 2 waiting on you", needs: true });
  assert.equal(mapAreaViewModel({ ...group, seats: [{ state: "idle" }] }, "x", phrase).sub, "1 seat");
  assert.equal(mapAreaViewModel({ ...group, seats: [{ state: "idle" }, { state: "done" }] }, "x", phrase).sub, "2 seats");
  const groups = blockGroups([{ key: "c", block: 1, at: 0 }, { key: "b", block: 0, at: 1 }, { key: "a", block: 0, at: 0 }]);
  assert.deepEqual(groups.map((one) => [one.block, one.keys]), [[0, ["a", "b"]], [1, ["c"]]]);
});

test("the map is ready and says its words in portuguese", () => {
  assert.equal(map.ready, true);
  assert.equal(map.id, "map");
  for (const said of ["fly to the seat that needs you", "go", "next neighbour", "back to the fleet"]) assert.ok(PT_BR[said], `${said} is not translated`);
});

test("entering opens the plane, lays the blocks out and draws them as areas; leaving gives the plane back as it was", () => {
  lay([["a", "b"], ["c"]], { c: "needs" });
  st.planeSpots = { a: { x: 5, y: 7 } };
  st.planeOn = false;
  localStorage.removeItem(PLANE_KEY);
  wear();
  assert.equal(structureWorn(), "map");
  assert.equal(st.planeOn, true);
  assert.equal(planeShown(), true);
  assert.equal(localStorage.getItem(PLANE_KEY), null, "the classic's own choice of plane is not touched");
  assert.ok(st.planeSpots.a && st.planeSpots.b && st.planeSpots.c);
  assert.equal(st.planeSpots.a.y, st.planeSpots.b.y, "seats of one block sit side by side");
  const areas = [...document.querySelectorAll("#plane-world .mp-area")];
  assert.equal(areas.length, 2);
  assert.deepEqual(areas.map((one) => one.querySelector("b").textContent).sort(), ["block 1", "crm"]);
  assert.ok(areas.some((one) => one.classList.contains("needs") && one.querySelector("i").textContent === "1 of 1 waiting on you"));
  const call = $("structure-root").querySelector(".mp-call");
  assert.equal(call.hidden, false);
  assert.equal(call.querySelector(".mp-name").textContent, "c");
  assert.ok(JSON.parse(localStorage.getItem(MAP_WAS_KEY)), "what to give back survives a reload");
  strip();
  assert.equal(st.planeOn, false);
  assert.equal(planeShown(), false);
  assert.deepEqual(st.planeSpots.a, { x: 5, y: 7 }, "the spots the map laid out go back to what the plane had");
  assert.equal(document.querySelectorAll("#plane-world .mp-area").length, 0);
  assert.equal(localStorage.getItem(MAP_WAS_KEY), null);
});

test("a plane that was already open stays open after the map, with its camera back where it was", () => {
  lay([["a"], ["b"]]);
  st.planeOn = true;
  st.planeAt = { x: 12, y: 34, k: 0.8 };
  st.planeSpots = { a: { x: 0, y: 0 }, b: { x: 2000, y: 0 } };
  wear();
  assert.deepEqual(st.planeSpots, { a: { x: 0, y: 0 }, b: { x: 2000, y: 0 } }, "blocks already apart are left where the person put them");
  st.planeAt = { x: 0, y: 0, k: 0.4 };
  strip();
  assert.equal(st.planeOn, true);
  assert.deepEqual(st.planeAt, { x: 12, y: 34, k: 0.8 });
  st.planeOn = false;
  render();
});

test("esc and the plane key go back to the whole fleet instead of the wall; with a seat open esc is the classic's", () => {
  lay([["a", "b"], ["c"]]);
  st.planeOn = false;
  wear();
  sized(1440, 800);
  st.planeAt = { x: 900, y: 900, k: 1 };
  const esc = key("Escape", { key: "Escape" });
  document.body.dispatchEvent(esc);
  assert.equal(esc.defaultPrevented, true);
  assert.equal(st.planeOn, true, "the plane stays");
  assert.ok(st.planeAt.k < 1 && st.planeAt.x !== 900, "the camera went back to the fleet");
  st.planeAt = { x: 900, y: 900, k: 1 };
  const chord = st.keys.plane;
  const plane = key(chord.code, { altKey: !!chord.alt, ctrlKey: !!chord.ctrl, shiftKey: !!chord.shift, metaKey: !!chord.meta });
  document.body.dispatchEvent(plane);
  assert.equal(plane.defaultPrevented, true);
  assert.equal(st.planeOn, true);
  assert.notEqual(st.planeAt.x, 900);
  st.open = "a";
  const open = key("Escape", { key: "Escape" });
  assert.equal(map.keydown(open, { onPlane: () => planeShown(), inField: () => false }), false);
  st.open = null;
  strip();
});

test("⌘J flies to who needs you and leaves the cursor in their composer; Tab goes to the seat tied to it", async () => {
  lay([["a", "b"], ["c"]], { c: "needs" });
  st.planeOn = false;
  wear();
  sized(1440, 800);
  st.planeAt = { x: 0, y: 0, k: 0.3 };
  const jump = key("KeyJ", IS_MAC ? { metaKey: true } : { ctrlKey: true });
  document.body.dispatchEvent(jump);
  assert.equal(jump.defaultPrevented, true);
  assert.equal(st.block, 1);
  assert.equal(st.blocks[st.block].keys[st.focus], "c");
  assert.equal(st.planeAt.k, 1, "close enough to read the real tile");
  const box = { ...st.planeSpots.c, w: NODE_W, h: NODE_H };
  assert.equal(seenWhole(box, st.planeAt, 1440, 800), true);
  st.planeLinks = [{ from: "c", to: "a", at: Date.now(), task: "" }];
  const tab = key("Tab", { key: "Tab" });
  document.body.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(st.blocks[st.block].keys[st.focus], "a");
  st.planeLinks = [];
  const lonely = key("Tab", { key: "Tab" });
  st.focus = 1;
  render();
  document.body.dispatchEvent(lonely);
  assert.equal(lonely.defaultPrevented, false, "with nobody tied to the seat Tab stays the browser's");
  strip();
});
