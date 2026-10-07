import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { CLIMB_WAIT, bindFloorShell, climbTo, closeArrange, dressDrag, landOnFloor, openArrange, paintArrange, stopClimb } = await app("arrange");
const { $ } = await app("core");

const host = $("arrange");
const floors = () => [...host.querySelectorAll(".floor")];
const floorOf = (id) => host.querySelector(`.floor[data-w="${id}"]`);
const cardOf = (i) => host.querySelector(`.a-card[data-i="${i}"]`);
const chipOf = (key) => host.querySelector(`.a-chip[data-key="${key}"]`);
const blockOf = (key) => st.blocks.find((b) => b.keys.includes(key));
const keysOf = (i) => [...st.blocks[i].keys];

function laySpaces(names) {
  st.spaces = names.map((name, i) => ({ id: `w${i}`, name, tint: `#0${i}` }));
}

function lay(shape) {
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: b.ws || "w0", label: "", manual: true, keys: [...b.keys] }));
  st.block = 0;
  st.arrangeHeld = null;
  st.arrangeDragging = false;
  st.arrangeOver = -1;
  st.arrangeCursor = { i: 0, j: 0 };
}

function fresh(shape) {
  closeArrange();
  host.hidden = true;
  host.innerHTML = "";
  st.LIMIT = 4;
  st.focus = 0;
  st.calmOn = false;
  st.mirrorDev = "";
  st.seatsKnown = true;
  const keys = (shape || []).flatMap((b) => b.keys);
  st.data = { sessions: keys.map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  laySpaces(["hive", "crm"]);
  lay(shape || []);
  st.space = "w0";
  st.arrangeFloor = "w0";
  host.hidden = false;
  paintArrange();
}

/* happy-dom has no drag payload of its own, so the event carries the same shape the browser gives */
function drag(el, type, extra = {}) {
  const ev = new dom.Event(type, { bubbles: true, cancelable: true });
  ev.dataTransfer = { effectAllowed: "", dropEffect: "", setData() {}, getData: () => "" };
  Object.assign(ev, extra);
  el.dispatchEvent(ev);
  return ev;
}

const click = (el) => el.dispatchEvent(new dom.Event("click", { bubbles: true, cancelable: true }));

const FOUR = [
  { ws: "w0", keys: ["a1", "a2", "a3", "a4"] },
  { ws: "w0", keys: ["b1", "b2", "b3", "b4"] },
  { ws: "w0", keys: ["c1"] },
  { ws: "w1", keys: ["d1"] }
];

test("the card you grabbed is still on the page, which is what keeps the gesture alive", () => {
  fresh(FOUR);
  const chip = chipOf("a1");
  const surface = floorOf("w0").querySelector(".surface");
  drag(chip, "dragstart");
  assert.ok(host.contains(chip), "the very element under the pointer survived the start of the drag");
  assert.equal(floorOf("w0").querySelector(".surface"), surface, "and the floor around it was not rebuilt");
  assert.ok(chip.classList.contains("lifting"));
  assert.equal(st.arrangeHeld, "a1");
});

test("a repaint arriving mid-gesture leaves the deck alone", () => {
  fresh(FOUR);
  const chip = chipOf("a1");
  drag(chip, "dragstart");
  paintArrange();
  assert.ok(host.contains(chip), "the seat in the hand is not swept away by a repaint");
});

test("the pointer over a lane lights the whole lane, not only the seats in it", () => {
  fresh(FOUR);
  drag(chipOf("a1"), "dragstart");
  const ev = drag(cardOf(2), "dragover");
  assert.ok(ev.defaultPrevented, "the lane took the drop");
  assert.ok(cardOf(2).classList.contains("taking"));
  assert.equal(st.arrangeOver, 2);
  drag(cardOf(2), "dragleave", { relatedTarget: cardOf(1) });
  assert.equal(st.arrangeOver, -1);
  assert.ok(!cardOf(2).classList.contains("taking"));
});

test("the lane a seat came from refuses it back", () => {
  fresh(FOUR);
  drag(chipOf("a1"), "dragstart");
  const ev = drag(cardOf(0), "dragover");
  assert.ok(!ev.defaultPrevented, "its own lane is not a destination");
});

test("let go anywhere on a full lane, and the last seat is the one that leaves", () => {
  fresh(FOUR);
  drag(chipOf("a1"), "dragstart");
  drag(cardOf(1).querySelector(".a-note"), "drop");
  assert.deepEqual([...blockOf("a1").keys], ["b1", "b2", "b3", "a1"]);
  assert.deepEqual(keysOf(0), ["b4", "a2", "a3", "a4"], "the last one walked to where the seat came from");
});

test("let go on a name, and that name is the one that leaves", () => {
  fresh(FOUR);
  drag(chipOf("a1"), "dragstart");
  drag(chipOf("b2"), "drop");
  assert.ok(st.blocks[1].keys.includes("a1"));
  assert.ok(st.blocks[0].keys.includes("b2"), "the seat you dropped on took the free place");
  assert.ok(!st.blocks[1].keys.includes("b2"));
});

test("a lane with room takes the seat without anyone leaving", () => {
  fresh(FOUR);
  drag(chipOf("a1"), "dragstart");
  drag(cardOf(2), "drop");
  assert.deepEqual(keysOf(2), ["c1", "a1"]);
  assert.deepEqual(keysOf(0), ["a2", "a3", "a4"]);
});

test("resting on the floor above brings it to the front, and only after the wait", () => {
  fresh(FOUR);
  st.arrangeHeld = "a1";
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    climbTo("w1");
    assert.equal(st.arrangeFloor, "w0", "a pointer passing by does not change floor");
    assert.ok(floorOf("w1").classList.contains("climbing"));
    mock.timers.tick(CLIMB_WAIT + 10);
    assert.equal(st.arrangeFloor, "w1", "resting there did");
  } finally {
    mock.timers.reset();
  }
  assert.ok(host.contains(chipOf("a1")), "and the seat in the hand crossed the floor with the deck");
});

test("the pointer leaving before the wait is up climbs nothing", () => {
  fresh(FOUR);
  st.arrangeHeld = "a1";
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    climbTo("w1");
    stopClimb();
    mock.timers.tick(CLIMB_WAIT + 10);
    assert.equal(st.arrangeFloor, "w0");
    assert.ok(!floorOf("w1").classList.contains("climbing"));
  } finally {
    mock.timers.reset();
  }
});

test("a seat let go on another floor changes workspace with it", () => {
  fresh(FOUR);
  st.arrangeHeld = "a1";
  landOnFloor("w1");
  assert.equal(blockOf("a1").ws, "w1");
  assert.equal(st.arrangeHeld, null);
});

test("let go on the floor it already lives in, the seat stays where it was", () => {
  fresh(FOUR);
  st.arrangeHeld = "a1";
  landOnFloor("w0");
  assert.deepEqual(keysOf(0), ["a1", "a2", "a3", "a4"]);
  assert.equal(st.arrangeHeld, null);
});

test("let go on the floor that opens a workspace, the seat opens it", () => {
  fresh(FOUR);
  st.arrangeHeld = "a1";
  landOnFloor("");
  assert.equal(st.spaces.length, 3);
  assert.equal(blockOf("a1").ws, st.spaces[2].id);
  assert.deepEqual([...blockOf("a1").keys], ["a1"]);
});

test("clicking a lane with a seat in hand puts it down, instead of walking you to that workspace", () => {
  fresh(FOUR);
  st.arrangeHeld = "a1";
  click(floorOf("w1"));
  assert.equal(blockOf("a1").ws, "w1");
  assert.equal(st.space, "w0", "you did not travel: the seat did");
});

test("every floor carries a door to rename and close its workspace", () => {
  fresh(FOUR);
  const doors = floors().filter((el) => el.dataset.w).map((el) => el.querySelector(".tag .fl-more-btn"));
  assert.ok(doors.length >= 2);
  assert.ok(doors.every((one) => one && one.dataset.w));
});

test("a full lane says what happens when you let go anywhere on it", () => {
  fresh(FOUR);
  st.arrangeHeld = "a1";
  st.arrangeOver = 1;
  dressDrag();
  assert.match(cardOf(1).querySelector(".a-note").textContent, /last one leaves|sai o último/);
});

test("the floor shell is bound once, however many times the deck is painted", () => {
  fresh(FOUR);
  const floor = floorOf("w1");
  paintArrange();
  paintArrange();
  assert.equal(floorOf("w1"), floor, "the same section, so its listeners were not stacked");
  st.arrangeHeld = "a1";
  click(floor);
  assert.equal(blockOf("a1").ws, "w1");
  assert.equal(st.blocks.filter((b) => b.keys.includes("a1")).length, 1, "the seat landed once");
});
