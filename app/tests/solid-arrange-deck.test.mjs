import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const arrange = await app("arrange");
const { $ } = await app("core");

const host = $("arrange");
const floorOf = (id) => host.querySelector(`.floor[data-w="${id}"]`);
const chipOf = (key) => host.querySelector(`.a-chip[data-key="${key}"]`);

function drag(el, type, extra = {}) {
  const ev = new dom.Event(type, { bubbles: true, cancelable: true });
  ev.dataTransfer = { effectAllowed: "", dropEffect: "", setData() {}, getData: () => "" };
  Object.assign(ev, extra);
  el.dispatchEvent(ev);
  return ev;
}

function fresh(blocks) {
  arrange.closeArrange();
  st.LIMIT = 4;
  st.focus = 0;
  st.calmOn = false;
  st.mirrorDev = "";
  st.seatsKnown = true;
  st.spaces = [{ id: "w0", name: "sales", tint: "#112233" }, { id: "w1", name: "", tint: "#445566" }];
  st.space = "w0";
  st.arrangeFloor = "w0";
  const shape = blocks || [{ ws: "w0", keys: ["a1", "a2"] }, { ws: "w1", keys: ["b1"] }];
  const keys = shape.flatMap((b) => b.keys);
  st.data = { sessions: keys.map((name) => ({ name, title: `title ${name}`, state: name === "a2" ? "needs" : "idle", errand: name === "a1" ? "the mirror" : "" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: b.ws, label: "", manual: true, keys: [...b.keys] }));
  st.block = 0;
  arrange.openArrange();
}

test("the deck is drawn by its Solid view, on the same host, with the same pieces", () => {
  fresh();
  assert.equal(host.dataset.view, "solid");
  assert.deepEqual([...host.children].map((el) => el.className), ["glow", "scene", "fl-more", "fl-foot"]);
  assert.equal(host.querySelector(".scene > .deck").children.length, 3);
  assert.equal(host.querySelector(".fl-more").hidden, true, "two floors fit, so nothing is further up");
  const keys = host.querySelector(".fl-foot .keys");
  assert.deepEqual([...keys.children].map((el) => el.textContent), ["shift↑↓ floor", "←→ seat", "space pick up", "esc close"]);
  assert.deepEqual([...keys.children].map((el) => [el.lastChild.nodeType, el.lastChild.nodeValue]), [[3, " floor"], [3, " seat"], [3, " pick up"], [3, " close"]], "each hint is one text node, shaped as one run like before");
});

test("a floor carries its tint, its place in the pile and its name field", () => {
  fresh();
  const floor = floorOf("w0");
  assert.ok(floor.classList.contains("floor") && floor.classList.contains("here"));
  assert.equal(floor.style.getPropertyValue("--wtint"), "#112233");
  assert.equal(floor.dataset.d, "0");
  assert.equal(floor.style.transform, "translate3d(0,0px,0px)");
  assert.equal(floor.style.opacity, "1");
  assert.equal(floor.style.pointerEvents, "auto");
  const name = floor.querySelector(".tag .fl-name");
  assert.equal(name.dataset.w, "w0");
  assert.equal(name.value, "sales");
  assert.equal(name.getAttribute("spellcheck"), "false");
  assert.equal(name.getAttribute("aria-label"), "what this workspace is about");
  assert.equal(floor.querySelector(".tag .seats").textContent, "1·2");
  const door = floor.querySelector(".tag .fl-more-btn");
  assert.equal(door.getAttribute("type"), "button");
  assert.equal(door.title, "rename or close this workspace");
  assert.equal(door.getAttribute("aria-label"), "rename or close this workspace");
  assert.equal(door.textContent, "×");
  assert.equal(floorOf("w1").querySelector(".fl-name").placeholder.length > 0, true, "an unnamed workspace shows its default name as the hint");
  const fresh_ = floorOf("");
  assert.ok(fresh_.classList.contains("fresh"));
  assert.equal(fresh_.querySelector(".fl-empty .t").textContent, "new workspace");
  assert.equal(fresh_.querySelector('.tag[data-w=""]').textContent, "new workspace");
});

test("a lane shows its number, name, count, seats and free slots", () => {
  fresh();
  const card = floorOf("w0").querySelector('.a-card[data-i="0"]');
  assert.ok(card.classList.contains("here"));
  assert.equal(card.querySelector(".a-top i").textContent, "1");
  assert.equal(card.querySelector(".a-top em").textContent, "2/4");
  const chip = chipOf("a1");
  assert.equal(chip.getAttribute("type"), "button");
  assert.equal(chip.getAttribute("draggable"), "true");
  assert.deepEqual([chip.dataset.i, chip.dataset.j, chip.dataset.state], ["0", "0", "idle"]);
  assert.equal(chip.title, "title a1");
  assert.equal(chip.querySelector(".nm").textContent, "title a1");
  assert.equal(chip.querySelector(".er").textContent, "the mirror");
  assert.ok(chip.querySelector(".st i").style.background);
  assert.ok(chip.classList.contains("at"), "the cursor starts on the first seat");
  assert.equal(chipOf("a2").dataset.state, "needs");
  assert.equal(chipOf("a2").querySelector(".er"), null, "a seat with no errand has no errand line");
  const slots = [...card.querySelectorAll(".a-slot")];
  assert.deepEqual(slots.map((el) => [el.dataset.i, el.dataset.j, el.textContent]), [["0", "2", "free"], ["0", "3", "free"]]);
  assert.equal(card.querySelector(".a-note").textContent, "where you are");
  const room = floorOf("w0").querySelector(".a-new");
  assert.equal(room.dataset.w, "w0");
  assert.equal(room.querySelector(".t").textContent, "new block");
  assert.equal(floorOf("w1").querySelector(".a-new"), null, "only the floor at the front offers a new block");
});

test("the foot says where you are, and what you carry once a seat is picked up", () => {
  fresh();
  const say = host.querySelector(".fl-foot .say");
  assert.equal(say.querySelector("em").textContent, "sales");
  assert.match(say.textContent, /^sales — 1 block · 2 seats$/);
  chipOf("a2").click();
  assert.equal(st.arrangeHeld, "a2");
  assert.equal(say.querySelector("em").textContent, "title a2");
  assert.match(say.textContent, /^moving title a2 — 2 blocks take it, on any floor$/);
  assert.ok(chipOf("a2").classList.contains("lifting"));
  assert.ok(floorOf("w0").querySelector(".a-new").classList.contains("hot"));
});

test("opening lifts the pile in, closing hides it and empties it", () => {
  fresh();
  assert.equal(host.hidden, false);
  assert.ok(host.classList.contains("up"));
  assert.equal(arrange.arrangeOn(), true);
  arrange.closeArrange();
  assert.equal(host.hidden, true);
  assert.ok(!host.classList.contains("up"));
  assert.equal(host.children.length, 0, "nothing is left drawn behind the closed pile");
  assert.equal(arrange.arrangeOn(), false);
});

test("a press on the dark around the pile closes it, a press on a floor does not", () => {
  fresh();
  floorOf("w0").dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(arrange.arrangeOn(), true);
  host.dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(arrange.arrangeOn(), false);
});

test("escape in the name field puts back the name the workspace has", () => {
  fresh();
  const name = floorOf("w0").querySelector(".fl-name");
  name.focus();
  name.value = "nope";
  name.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(name.value, "sales");
  assert.notEqual(document.activeElement, name);
});

test("a committed name renames the workspace, and so does leaving the field", () => {
  fresh();
  const name = floorOf("w0").querySelector(".fl-name");
  name.value = "sales";
  name.dispatchEvent(new dom.Event("change"));
  assert.equal(st.spaces[0].name, "sales");
  assert.equal(host.querySelector(".fl-foot .say em").textContent, "sales", "the pile was painted again with the new name");
  name.value = "  sales and ops  ";
  name.dispatchEvent(new dom.Event("blur"));
  assert.equal(st.spaces[0].name, "sales and ops");
});

test("a key typed in the name field never reaches the pile's own keys", () => {
  fresh();
  const name = floorOf("w0").querySelector(".fl-name");
  let reached = false;
  const listen = () => { reached = true; };
  host.addEventListener("keydown", listen);
  name.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  host.removeEventListener("keydown", listen);
  assert.equal(reached, false);
});

test("the floor that was climbed keeps its mark after it comes forward, until the climb stops", () => {
  fresh();
  st.arrangeHeld = "a1";
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    arrange.climbTo("w1");
    assert.ok(floorOf("w1").classList.contains("climbing"));
    mock.timers.tick(arrange.CLIMB_WAIT + 10);
    assert.equal(st.arrangeFloor, "w1");
    assert.ok(floorOf("w1").classList.contains("here"));
    assert.equal(floorOf("w1").dataset.d, "0");
    assert.ok(floorOf("w1").classList.contains("climbing"), "the mark stays, as before");
    arrange.stopClimb();
    assert.ok(!floorOf("w1").classList.contains("climbing"));
  } finally {
    mock.timers.reset();
  }
});

test("the pile turns on the wheel over the scene, and the scene listener is not passive", () => {
  fresh([{ ws: "w0", keys: ["a1"] }, { ws: "w1", keys: ["b1"] }]);
  const scene = host.querySelector(".scene");
  const ev = new dom.WheelEvent("wheel", { deltaY: -300, deltaX: 0, bubbles: true, cancelable: true });
  scene.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, "the page itself never scrolls under the pile");
  assert.equal(arrange.deckFloor(), "w1");
});

test("the door on a floor opens the workspace menu under it", () => {
  fresh();
  const door = floorOf("w0").querySelector(".fl-more-btn");
  door.click();
  assert.equal(arrange.arrangeOn(), true, "the click did not reach the floor behind it");
  assert.equal($("seatmenu").hidden, false);
});

test("a drag over a lane of the front floor lights it and the drop lands the seat there", () => {
  fresh([{ ws: "w0", keys: ["a1", "a2"] }, { ws: "w0", keys: ["c1"] }, { ws: "w1", keys: ["b1"] }]);
  const chip = chipOf("a1");
  drag(chip, "dragstart");
  const lane = floorOf("w0").querySelector('.a-card[data-i="1"]');
  assert.ok(drag(lane, "dragover").defaultPrevented);
  assert.ok(lane.classList.contains("taking"));
  assert.equal(lane.querySelector(".a-slot").textContent, "drop here");
  assert.ok(host.contains(chip), "the seat in the hand is still on the page");
  drag(lane, "drop");
  drag(chip, "dragend");
  assert.deepEqual([...st.blocks[1].keys], ["c1", "a1"]);
  assert.equal(st.arrangeHeld, null);
  assert.ok(chipOf("a1").closest('.a-card[data-i="1"]'), "after the drop the seat is drawn in its new lane");
});
