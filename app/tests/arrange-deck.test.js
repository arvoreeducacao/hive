import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { arrangeFloorStep, arrangeWheel, closeArrange, deckFloor, openArrange, paintArrange } = await app("arrange");
const { $ } = await app("core");

const host = $("arrange");
const floors = () => [...host.querySelectorAll(".floor")];
const deck = () => host.querySelector(".deck");
const innerOf = (el) => el.querySelector(".surface");

function laySpaces(names) {
  st.spaces = names.map((name, i) => ({ id: `w${i}`, name, tint: `#0${i}` }));
}

function lay(shape, at = 0) {
  st.blocks = shape.map((b, i) => ({ id: `b${i}`, ws: b.ws || "w0", label: "", manual: true, keys: [...b.keys] }));
  st.block = at;
  st.arrangeHeld = null;
  st.arrangeDragging = false;
  st.arrangeCursor = { i: 0, j: 0 };
}

function onSpace(id) {
  st.space = id;
  st.arrangeFloor = id;
}

function fresh() {
  closeArrange();
  st.LIMIT = 4;
  st.focus = 0;
  st.calmOn = false;
  st.mirrorDev = "";
  st.seatsKnown = true;
  st.data = { sessions: ["a1", "a2", "b1", "c1"].map((name) => ({ name, state: "idle" })), spawning: [], archived: [], pod: { up: false, name: "" } };
  laySpaces(["crm", "hive", "super"]);
  lay([{ ws: "w0", keys: ["a1", "a2"] }, { ws: "w1", keys: ["b1"] }, { ws: "w2", keys: ["c1"] }]);
  onSpace("w0");
}

let clockBase = 1e6;
function onTheClock(run) {
  clockBase += 1e5;
  mock.timers.enable({ apis: ["Date"], now: clockBase });
  try { run((ms) => mock.timers.tick(ms)); } finally { mock.timers.reset(); }
}

const wheel = (dy) => arrangeWheel({ deltaY: dy, deltaX: 0, deltaMode: 0, preventDefault() {} });

test("the pile draws one floor per workspace, plus the one that opens a new one", () => {
  fresh();
  paintArrange();
  assert.deepEqual(floors().map((el) => el.dataset.w), ["w0", "w1", "w2", ""]);
  assert.equal(floors().filter((el) => el.classList.contains("here")).length, 1);
});

test("a repaint brings what is inside a floor up to date and keeps the floor itself", () => {
  fresh();
  paintArrange();
  const was = floors();
  assert.ok(was.map(innerOf).every((el) => el), "every floor had contents to begin with");
  st.blocks[0].label = "the mirror";
  st.blocks[1].keys.push("b2");
  st.data.sessions.push({ name: "b2", state: "needs" });
  st.spaces[2].name = "studio";
  paintArrange();
  assert.deepEqual(floors(), was, "the sections survived — this is what lets the transform animate");
  assert.equal(was[0].querySelector('.a-card[data-i="0"] .name').textContent, "the mirror", "a block renamed shows its new name");
  assert.deepEqual([...was[1].querySelectorAll(".a-chip")].map((el) => el.dataset.key), ["b1", "b2"], "a seat that joined shows in its lane");
  assert.equal(was[1].querySelector('.a-chip[data-key="b2"]').dataset.state, "needs");
  assert.equal(was[1].querySelectorAll(".a-slot").length, 2, "and the free slots shrank");
  assert.equal(was[2].querySelector(".fl-name").value, "studio", "a workspace renamed elsewhere shows the new name");
});

test("changing floor moves the same sections instead of building new ones", () => {
  fresh();
  paintArrange();
  const was = floors();
  const before = was.map((el) => el.style.transform);
  arrangeFloorStep(1);
  assert.deepEqual(floors(), was, "no floor was thrown away to change floor");
  assert.notDeepEqual(floors().map((el) => el.style.transform), before, "and every one of them moved");
  assert.equal(deckFloor(), "w1");
  assert.equal(floors().find((el) => el.classList.contains("here")).dataset.w, "w1");
});

test("a floor further than the pile shows is faded out, not left drawn", () => {
  fresh();
  laySpaces(["a", "b", "c", "d", "e", "f", "g", "h"]);
  lay([{ ws: "w0", keys: ["a1"] }]);
  onSpace("w0");
  paintArrange();
  const far = floors().find((el) => Number(el.dataset.d) >= 6);
  assert.ok(far, "there is a floor past the six the pile shows");
  assert.equal(Number(far.style.opacity), 0);
  assert.equal(far.style.pointerEvents, "none");
});

test("a workspace that closed takes its floor with it", () => {
  fresh();
  paintArrange();
  st.spaces = st.spaces.filter((w) => w.id !== "w1");
  paintArrange();
  assert.deepEqual(floors().map((el) => el.dataset.w), ["w0", "w2", ""]);
});

test("one flick of the trackpad is one floor, however many events it arrives as", () => {
  fresh();
  paintArrange();
  onTheClock((tick) => {
    for (let i = 0; i < 40; i++) { wheel(-60); tick(8); }
  });
  assert.equal(deckFloor(), "w1", "forty events, one floor");
});

test("a nudge too small to be worth a floor moves nothing", () => {
  fresh();
  paintArrange();
  onTheClock((tick) => {
    wheel(-20);
    tick(400);
  });
  assert.equal(deckFloor(), "w0");
});

test("scrolling on, past the pause, keeps climbing", () => {
  fresh();
  paintArrange();
  onTheClock((tick) => {
    wheel(-90);
    assert.equal(deckFloor(), "w1");
    tick(500);
    wheel(-90);
  });
  assert.equal(deckFloor(), "w2");
});

test("turning the wheel the other way goes back down", () => {
  fresh();
  paintArrange();
  onTheClock((tick) => {
    wheel(-90);
    tick(500);
    wheel(90);
  });
  assert.equal(deckFloor(), "w0");
});

test("a sideways swipe is not a change of floor", () => {
  fresh();
  paintArrange();
  onTheClock(() => arrangeWheel({ deltaY: 10, deltaX: 220, deltaMode: 0, preventDefault() {} }));
  assert.equal(deckFloor(), "w0");
});

test("the pile only rises once it is on screen, so the entrance is a transition", () => {
  fresh();
  openArrange();
  assert.equal(host.hidden, false);
  assert.ok(host.classList.contains("up"));
  assert.ok(deck(), "and the deck it rises with was built");
});

test("the name being typed is not torn out from under the cursor", () => {
  fresh();
  paintArrange();
  const [one, two] = floors();
  const naming = one.querySelector(".fl-name");
  assert.ok(naming, "the floor carries the field its name is typed into");
  naming.focus();
  naming.value = "sales and sal";
  const inside = [innerOf(one), innerOf(two)];
  st.blocks[0].label = "renamed while typing";
  st.blocks[1].label = "the other floor";
  st.spaces[0].name = "sales from elsewhere";
  paintArrange();
  assert.equal(innerOf(one), inside[0], "the floor whose name is being typed was left alone");
  assert.equal(document.activeElement, naming, "and the field kept the cursor");
  assert.equal(naming.value, "sales and sal", "and what was typed");
  assert.notEqual(one.querySelector('.a-card[data-i="0"] .name').textContent, "renamed while typing", "nothing inside that floor was redrawn");
  assert.equal(two.querySelector('.a-card[data-i="1"] .name').textContent, "the other floor", "every other floor was brought up to date");
  naming.blur();
});
