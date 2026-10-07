import test from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { seatDrag } = await app("tiles");
const { detached } = await app("blocks");

function twoSeats() {
  detached.clear();
  st.data = { sessions: [{ name: "a" }, { name: "b" }], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
  st.blocks = [{ id: "b1", ws: st.space, label: "", manual: true, keys: ["a", "b"] }];
  st.block = 0;
  st.focus = 0;
  st.planeOn = false;
  st.dragSeat = null;
  st.typing = null;
  st.pending = false;
}

function tile(name) {
  const el = document.createElement("div");
  el.className = "tile";
  el.dataset.name = name;
  el.innerHTML = `<div class="t-head"><span class="t-name">${name}</span></div>`;
  document.body.appendChild(el);
  seatDrag(el, name);
  return { el, head: el.querySelector(".t-head"), title: el.querySelector(".t-name") };
}

const press = (on) => on.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));

function drag(kind, on) {
  const ev = new window.Event(kind, { bubbles: true, cancelable: true });
  ev.dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
  on.dispatchEvent(ev);
  return ev;
}

test("the head carries the seat by default", () => {
  twoSeats();
  const one = tile("a");
  assert.equal(one.head.draggable, true);
});

test("pressing the title takes the head out of the drag, so a double-click can rename", () => {
  twoSeats();
  const one = tile("a");
  press(one.title);
  assert.equal(one.head.draggable, false);
});

test("pressing anywhere else in the head keeps the seat draggable", () => {
  twoSeats();
  const one = tile("a");
  press(one.title);
  press(one.head);
  assert.equal(one.head.draggable, true);
});

test("letting the title go gives the head back its grip", () => {
  twoSeats();
  const one = tile("a");
  press(one.title);
  one.head.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
  assert.equal(one.head.draggable, true);
});

test("a drag that starts outside the title still swaps the two seats", () => {
  twoSeats();
  const from = tile("a");
  const to = tile("b");
  press(from.head);
  drag("dragstart", from.head);
  assert.equal(st.dragSeat, "a");
  assert.ok(from.el.classList.contains("lifting"));
  drag("dragover", to.el);
  assert.ok(to.el.classList.contains("landing"));
  drag("drop", to.el);
  assert.equal(st.dragTook, true);
  assert.deepEqual([...st.blocks[0].keys], ["b", "a"]);
  assert.ok(!to.el.classList.contains("landing"));
});

test("a seat dropped on itself is left where it is", () => {
  twoSeats();
  const one = tile("a");
  press(one.head);
  drag("dragstart", one.head);
  drag("drop", one.el);
  assert.deepEqual([...st.blocks[0].keys], ["a", "b"]);
});

test("dragging a seat releases a terminal keyboard even though no click follows", () => {
  twoSeats();
  const one = tile("a");
  st.typing = "a";
  drag("dragstart", one.head);
  assert.equal(st.typing, null);
});

test("dragging a seat disarms a pending leader even though no click follows", () => {
  twoSeats();
  const one = tile("a");
  st.pending = true;
  drag("dragstart", one.head);
  assert.equal(st.pending, false);
  assert.equal(document.getElementById("mode").hidden, true);
});

const withBridge = (bridge, run) => {
  const had = Object.getOwnPropertyDescriptor(window, "hiveSeatWindow");
  Object.defineProperty(window, "hiveSeatWindow", { value: bridge, configurable: true });
  try { return run(); }
  finally {
    if (had) Object.defineProperty(window, "hiveSeatWindow", had);
    else delete window.hiveSeatWindow;
  }
};

const leaveTheWindow = () => {
  const ev = new window.Event("dragleave", { bubbles: true });
  ev.relatedTarget = null;
  window.dispatchEvent(ev);
};

test("a seat let go outside the window opens in a window of its own", () => {
  twoSeats();
  const one = tile("a");
  const taken = [];
  withBridge({ detach: (name) => taken.push(name) }, () => {
    drag("dragstart", one.head);
    leaveTheWindow();
    drag("dragend", one.head);
  });
  assert.deepEqual(taken, ["a"]);
  assert.deepEqual([...st.blocks[0].keys], ["b"]);
});

test("a seat dropped on another one never leaves for a window", () => {
  twoSeats();
  const from = tile("a");
  const to = tile("b");
  const taken = [];
  withBridge({ detach: (name) => taken.push(name) }, () => {
    drag("dragstart", from.head);
    leaveTheWindow();
    drag("drop", to.el);
    drag("dragend", from.head);
  });
  assert.deepEqual(taken, []);
  assert.deepEqual([...st.blocks[0].keys], ["b", "a"]);
});
