import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

await views();

const st = await state();
const plane = await app("plane");
const $ = (id) => document.getElementById(id);

function field({ areas = [], notes = [], seats = [] } = {}) {
  document.body.classList.remove("experience-raycast");
  plane.hushPlane();
  st.data = { ...st.data, sessions: seats.map((name) => ({ name, where: "local", title: name })), gone: [], spawning: [] };
  st.blocks = [{ id: "b0", label: "", manual: false, keys: [...seats] }];
  st.block = 0;
  st.open = "";
  st.planeOn = true;
  st.planeAt = { x: 0, y: 0, k: 1 };
  st.planeFrame = null;
  st.planeArming = "";
  st.planeDraw = null;
  st.planeAreaDrag = null;
  st.planePicked = new Set();
  st.planeUndo = [];
  st.planeRedo = [];
  st.planeAreas = areas.map((one) => ({ ...one }));
  st.planeNotes = notes.map((one) => ({ ...one }));
  plane.paintPlane();
}

const world = () => $("plane-world");
const boxes = (selector) => [...world().querySelectorAll(selector)];
const area = (id) => world().querySelector(`.parea[data-thing="${id}"]`);
const note = (id) => world().querySelector(`.pnote[data-thing="${id}"]`);
const blur = (el) => (document.activeElement === el ? el.blur() : el.dispatchEvent(new Event("blur")));
const key = (el, name) => el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));

const A1 = { id: "pa1", name: "first", x: 10, y: 20, w: 300, h: 200 };
const A2 = { id: "pa2", name: "second", x: 400, y: 20, w: 300, h: 200 };
const N1 = { id: "pn1", text: "remember the milk", x: 50, y: 300, w: 220, h: 140, tint: "amber" };

test("a note stays above the seats that were already on the field when it was first drawn", () => {
  field({ notes: [N1], seats: ["seat-a"] });
  const order = [...world().children].map((el) => el.className.split(" ")[0] || el.id);
  assert.ok(order.indexOf("pnode") >= 0, "the seat has its node");
  assert.ok(order.indexOf("pnode") < order.indexOf("pnote"), "the note comes after the seat, so it is drawn over it");
});

test("the areas sit under the wires, the last one drawn first, and the notes after them", () => {
  field({ areas: [A1, A2], notes: [N1] });
  const kids = [...world().children];
  const wires = kids.indexOf($("plane-wires"));
  assert.deepEqual(boxes(".parea").map((el) => el.dataset.thing), ["pa2", "pa1"]);
  assert.ok(boxes(".parea").every((el) => kids.indexOf(el) < wires), "every area is behind the wires");
  assert.ok(kids.indexOf(note("pn1")) > wires, "the note is over the wires");
});

test("an area and a note carry the box, the name, the text and the colour the field has for them", () => {
  field({ areas: [A1], notes: [N1] });
  const box = area("pa1");
  assert.equal(box.style.left, "10px");
  assert.equal(box.style.top, "20px");
  assert.equal(box.style.width, "300px");
  assert.equal(box.style.height, "200px");
  const name = box.querySelector(".pa-name");
  assert.equal(name.textContent, "first");
  assert.equal(name.getAttribute("spellcheck"), "false");
  assert.equal(name.dataset.empty, "name this area");
  assert.match(name.title, /double-click to write the name/);
  assert.equal(box.querySelector(".pa-grip").title, "pull to resize");
  const paper = note("pn1");
  assert.equal(paper.dataset.tint, "amber");
  assert.equal(paper.querySelector(".pn-body").dataset.empty, "write it down here");
  assert.equal(paper.querySelector(".pn-body").innerText, "remember the milk");
  assert.equal(paper.querySelector(".pa-grip").title, "pull to resize");
});

test("a note with no colour still says so, with an empty tint", () => {
  field({ notes: [{ ...N1, tint: "" }] });
  assert.equal(note("pn1").getAttribute("data-tint"), "");
});

test("picking marks the thing, and letting go clears the mark", () => {
  field({ areas: [A1], notes: [N1] });
  plane.pickPlane("pa1", false);
  plane.markPlanePicked();
  assert.ok(area("pa1").classList.contains("picked"));
  assert.ok(!note("pn1").classList.contains("picked"));
  plane.pickPlane("pn1", true);
  plane.markPlanePicked();
  assert.ok(note("pn1").classList.contains("picked"));
  plane.pickPlane("", false);
  plane.markPlanePicked();
  assert.equal(boxes(".picked").length, 0);
});

test("a thing that leaves the field takes its box with it, and the others keep theirs", () => {
  field({ areas: [A1, A2], notes: [N1] });
  const kept = area("pa2");
  plane.dropPlaneThings(new Set(["pa1", "pn1"]));
  plane.paintPlane();
  assert.equal(area("pa1"), null);
  assert.equal(note("pn1"), null);
  assert.equal(area("pa2"), kept, "the area that stayed is the same element, not a new one");
});

test("holding an area marks it while the drag lasts and moves its box with the pointer", () => {
  field({ areas: [A1] });
  plane.startAreaDrag(area("pa1"), { clientX: 100, clientY: 100 }, false);
  assert.ok(area("pa1").classList.contains("holding"));
  plane.moveAreaDrag({ clientX: 130, clientY: 150 });
  assert.equal(area("pa1").style.left, "40px");
  assert.equal(area("pa1").style.top, "70px");
  plane.endAreaDrag();
  assert.ok(!area("pa1").classList.contains("holding"));
  assert.equal(st.planeAreas[0].x, 40);
});

test("pulling the grip resizes the note, never under its floor", () => {
  field({ notes: [N1] });
  plane.startAreaDrag(note("pn1"), { clientX: 0, clientY: 0 }, true);
  plane.moveAreaDrag({ clientX: 40, clientY: 10 });
  assert.equal(note("pn1").style.width, "260px");
  assert.equal(note("pn1").style.height, "150px");
  plane.moveAreaDrag({ clientX: -5000, clientY: -5000 });
  assert.equal(note("pn1").style.width, `${plane.NOTE_MIN_W}px`);
  assert.equal(note("pn1").style.height, `${plane.NOTE_MIN_H}px`);
  plane.endAreaDrag();
});

test("writing an area opens its name for typing with the old name selected", () => {
  field({ areas: [A1] });
  plane.writePlaneThing("pa1");
  const name = area("pa1").querySelector(".pa-name");
  assert.equal(name.contentEditable, "plaintext-only");
  assert.equal(document.activeElement, name);
  assert.equal(getSelection().toString(), "first");
  blur(name);
});

test("writing a note opens its body for typing", () => {
  field({ notes: [N1] });
  plane.writePlaneThing("pn1");
  const body = note("pn1").querySelector(".pn-body");
  assert.equal(body.contentEditable, "plaintext-only");
  assert.equal(document.activeElement, body);
  blur(body);
  assert.equal(body.contentEditable, "false");
});

test("an id nobody knows opens nothing", () => {
  field({ areas: [A1] });
  plane.writePlaneThing("nobody");
  assert.notEqual(document.activeElement?.className, "pa-name");
});

test("the name of an area is kept trimmed and short, and the field can undo it", () => {
  field({ areas: [A1] });
  const name = area("pa1").querySelector(".pa-name");
  name.textContent = `   ${"x".repeat(80)}   `;
  blur(name);
  assert.equal(st.planeAreas[0].name, "x".repeat(60));
  assert.equal(name.textContent, "x".repeat(60), "what is on screen is what was kept");
  assert.equal(plane.canUndoPlane(), true);
});

test("escape puts the old name back and enter keeps the new one", () => {
  field({ areas: [A1] });
  const name = area("pa1").querySelector(".pa-name");
  plane.writePlaneThing("pa1");
  name.textContent = "nope";
  key(name, "Escape");
  assert.equal(name.textContent, "first");
  assert.equal(st.planeAreas[0].name, "first");
  assert.notEqual(document.activeElement, name);
  plane.writePlaneThing("pa1");
  name.textContent = "kept";
  key(name, "Enter");
  assert.equal(st.planeAreas[0].name, "kept");
  assert.notEqual(document.activeElement, name);
});

test("a note keeps what was written, and undo puts the old text back on screen", () => {
  field({ notes: [N1] });
  const body = note("pn1").querySelector(".pn-body");
  body.innerText = "buy bread";
  blur(body);
  assert.equal(st.planeNotes[0].text, "buy bread");
  plane.stepPlaneBack(false);
  assert.equal(st.planeNotes[0].text, "remember the milk");
  assert.equal(note("pn1").querySelector(".pn-body").innerText, "remember the milk");
});

test("the same text written again is not a change to undo", () => {
  field({ notes: [N1] });
  const body = note("pn1").querySelector(".pn-body");
  blur(body);
  assert.equal(plane.canUndoPlane(), false);
});

test("arming draws on the field: the button lights, the field turns to a crosshair and the box follows the pointer", () => {
  field();
  $("plane-area").click();
  assert.equal(st.planeArming, "area");
  assert.ok($("plane").classList.contains("drawing"));
  assert.ok($("plane-area").classList.contains("armed"));
  assert.ok(!$("plane-note").classList.contains("armed"));
  plane.startPlaneDraw({ clientX: 100, clientY: 50 });
  plane.movePlaneDraw({ clientX: 40, clientY: 350 });
  const drawn = world().querySelector(".pdraw");
  assert.ok(drawn, "the box being drawn is on the field");
  assert.equal(drawn.style.left, "40px");
  assert.equal(drawn.style.top, "50px");
  assert.equal(drawn.style.width, "60px");
  assert.equal(drawn.style.height, "300px");
  plane.endPlaneDraw();
  assert.equal(world().querySelector(".pdraw"), null);
  assert.ok(!$("plane").classList.contains("drawing"));
  assert.ok(!$("plane-area").classList.contains("armed"));
});

test("an area drawn big enough is born where it was drawn, with its name open for typing", () => {
  field();
  plane.armPlane("area");
  plane.startPlaneDraw({ clientX: 0, clientY: 0 });
  plane.movePlaneDraw({ clientX: 500, clientY: 400 });
  plane.endPlaneDraw();
  const born = st.planeAreas.at(-1);
  const box = area(born.id);
  assert.equal(box.style.width, "500px");
  assert.equal(document.activeElement, box.querySelector(".pa-name"));
  assert.equal(box.querySelector(".pa-name").contentEditable, "plaintext-only");
  blur(box.querySelector(".pa-name"));
});

test("clicking the armed button again puts it down", () => {
  field();
  $("plane-note").click();
  assert.equal(st.planeArming, "note");
  assert.ok($("plane-note").classList.contains("armed"));
  $("plane-note").click();
  assert.equal(st.planeArming, "");
  assert.ok(!$("plane").classList.contains("drawing"));
});

test("the bottom bar has the same buttons in the same order, and the zoom reads the camera", () => {
  field();
  const hud = $("plane-hud");
  assert.equal(hud.dataset.noT, "");
  assert.deepEqual([...hud.children].map((el) => el.id || el.className), ["plane-out", "plane-k", "plane-in", "plane-fit", "plane-tidy", "plane-area", "plane-note", "sep", "plane-undo"]);
  assert.equal($("plane-out").getAttribute("aria-label"), "zoom out");
  assert.equal($("plane-out").textContent, "−");
  assert.equal($("plane-in").getAttribute("aria-label"), "zoom in");
  assert.deepEqual(["plane-fit", "plane-tidy", "plane-area", "plane-note", "plane-undo"].map((id) => $(id).textContent), ["fit", "tidy", "+ area", "+ note", "undo"]);
  assert.equal($("plane-k").className, "k");
  assert.equal($("plane-k").textContent, "100%");
  st.planeAt = { x: 0, y: 0, k: 0.5 };
  plane.applyPlane();
  assert.equal($("plane-k").textContent, "50%");
  assert.equal($("plane-undo").disabled, true, "nothing to undo yet");
});

test("the zoom buttons zoom by the same steps as before", () => {
  field();
  $("plane-in").click();
  assert.equal(Math.round(st.planeAt.k * 100), 125);
  $("plane-out").click();
  assert.equal(Math.round(st.planeAt.k * 100), 100);
});

test("undo on the bottom bar walks one step back", () => {
  field({ areas: [A1] });
  const name = area("pa1").querySelector(".pa-name");
  name.textContent = "changed";
  blur(name);
  plane.paintPlane();
  assert.equal($("plane-undo").disabled, false, "the next paint wakes the undo button");
  $("plane-undo").click();
  assert.equal(st.planeAreas[0].name, "first");
  assert.equal(name.textContent, "first");
});

test("in the raycast look the undo button shows its key", () => {
  field();
  document.body.classList.add("experience-raycast");
  plane.paintPlane();
  const caps = $("plane-undo").querySelectorAll(".rc-key");
  assert.equal(caps.length, 1);
  assert.equal($("plane-undo").firstChild.textContent, "undo");
  document.body.classList.remove("experience-raycast");
  plane.paintPlane();
  assert.equal($("plane-undo").querySelectorAll(".rc-key").length, 0);
});

test("an empty field says nobody is alive and how to open a chat; a seat hides it", () => {
  field();
  const empty = $("plane-empty");
  assert.equal(empty.hidden, false);
  assert.equal(empty.querySelector("b").textContent, "No worker alive");
  assert.match(empty.querySelector("span").textContent, /opens a new chat$/);
  field({ seats: ["seat-a"] });
  assert.equal(empty.hidden, true);
});

test("the raycast empty field offers a new chat and the way back to the wall", () => {
  document.body.classList.add("experience-raycast");
  st.data = { ...st.data, sessions: [], gone: [], spawning: [] };
  st.blocks = [];
  plane.paintPlane();
  const empty = $("plane-empty");
  assert.equal(empty.hidden, false);
  assert.ok(empty.querySelector(".pe-icon svg use"));
  assert.equal(empty.querySelector("b").textContent, "No seat on the field");
  assert.equal(empty.querySelector(".pe-new").firstChild.textContent, "New chat");
  assert.equal(empty.querySelector(".pe-back .rc-key").textContent, "esc");
  st.planeOn = true;
  empty.querySelector(".pe-back").click();
  assert.equal(st.planeOn, false, "back to the wall leaves the plane");
  document.body.classList.remove("experience-raycast");
});

test("the raycast top says what the field holds and stands right after the field", () => {
  field({ areas: [A1], seats: ["seat-a", "seat-b"] });
  assert.equal($("plane-top"), null, "the classic look has no top");
  document.body.classList.add("experience-raycast");
  plane.paintPlane();
  const top = $("plane-top");
  assert.ok(top);
  assert.equal(top.previousElementSibling, world());
  assert.equal(top.dataset.noT, "");
  assert.equal($("plane-title").textContent, "Plane");
  assert.equal($("plane-count").textContent, "2 seats in 1 areas");
  assert.deepEqual([...$("plane-back").querySelectorAll(".rc-key")].map((el) => el.textContent)[0], "esc");
  assert.match($("plane-back").textContent, /back to the wall/);
  document.body.classList.remove("experience-raycast");
  plane.paintPlane();
  assert.equal($("plane-top"), null, "leaving the look takes the top away");
});

test("the field says what happened, offers the undo, and goes quiet", () => {
  field({ areas: [A1] });
  const said = $("plane-said");
  plane.sayOnPlane("area removed", true);
  assert.equal(said.hidden, false);
  assert.equal(said.querySelector("b").textContent, "area removed");
  assert.match(said.querySelector("button").textContent, /^undo /);
  plane.sayOnPlane("tidied", false);
  assert.equal(said.querySelector("b").textContent, "tidied");
  assert.equal(said.querySelector("button"), null, "nothing to undo, no button");
  plane.hushPlane();
  assert.equal(said.hidden, true);
});

test("the undo in what the field said hushes it and steps back", () => {
  field({ areas: [A1] });
  const name = area("pa1").querySelector(".pa-name");
  name.textContent = "renamed";
  blur(name);
  plane.sayOnPlane("renamed", true);
  $("plane-said").querySelector("button").click();
  assert.equal(st.planeAreas[0].name, "first");
  assert.equal($("plane-said").querySelector("b").textContent, "Undone", "what it says now is the undo itself");
  assert.equal($("plane-said").querySelector("button"), null);
});

test("the bar over one picked thing stands above it and follows the camera", () => {
  field({ notes: [N1] });
  const bar = $("plane-bar");
  plane.pickPlane("pn1", false);
  plane.markPlanePicked();
  assert.equal(bar.hidden, false);
  assert.equal(st.planeBarFor, "pn1");
  assert.equal(bar.style.top, `${300 - bar.offsetHeight - 8}px`);
  const was = bar.style.left;
  st.planeAt = { x: 0, y: 400, k: 1 };
  plane.applyPlane();
  assert.equal(bar.style.left, was);
  assert.equal(bar.style.top, `${700 - bar.offsetHeight - 8}px`, "it moved down with the field");
  st.planeAt = { x: 0, y: -1000, k: 1 };
  plane.applyPlane();
  assert.equal(bar.style.top, "8px", "never above the top edge");
  plane.pickPlane("", false);
  plane.markPlanePicked();
  assert.equal(bar.hidden, true);
  assert.equal(st.planeBarFor, "");
});

test("the bar over a note offers its colours, and the one over an area offers a rename instead", () => {
  field({ areas: [A1], notes: [N1] });
  const paper = plane.planeBarViewModel("pn1", { tint: "amber" });
  assert.equal(paper.area, false);
  assert.deepEqual(paper.tints.map((one) => one.cls), ["plain", "amber", "blue"]);
  assert.deepEqual(paper.tints.map((one) => one.on), [false, true, false]);
  assert.match(paper.remove, /^remove /);
  const room = plane.planeBarViewModel("pa1", {});
  assert.equal(room.area, true);
  assert.equal(room.rename, "rename");
});

test("a paint while someone is typing never writes over what they typed, and keeps the same box", () => {
  field({ areas: [A1], notes: [N1] });
  const paper = note("pn1");
  const room = area("pa1");
  plane.writePlaneThing("pn1");
  const body = paper.querySelector(".pn-body");
  body.innerText = "half a thou";
  st.planeNotes[0].text = "changed elsewhere";
  plane.paintPlane();
  assert.equal(body.innerText, "half a thou");
  plane.writePlaneThing("pa1");
  const name = room.querySelector(".pa-name");
  name.textContent = "half a na";
  st.planeAreas[0].name = "renamed elsewhere";
  plane.paintPlane();
  assert.equal(name.textContent, "half a na");
  assert.equal(note("pn1"), paper);
  assert.equal(area("pa1"), room);
  blur(name);
});

test("every surface of the field paints through its Solid view", () => {
  field({ areas: [A1], notes: [N1], seats: ["seat-a"] });
  for (const host of [$("plane-hud"), $("plane-bar"), $("plane-empty"), $("plane-said"), $("plane-map").querySelector(".in")]) {
    assert.equal(host.dataset.view, "solid", `${host.id || host.className} is a Solid view`);
  }
  plane.pickPlane("pn1", false);
  plane.markPlanePicked();
  assert.deepEqual([...$("plane-bar").querySelectorAll("button.tint")].map((el) => el.dataset.tint), ["", "amber", "blue"]);
  assert.ok($("plane-bar").querySelector("button.tint.on[data-tint=\"amber\"]"));
  assert.ok($("plane-bar").querySelector('button.danger[data-do="drop"]'));
  plane.pickPlane("", false);
  plane.markPlanePicked();
  const map = $("plane-map").querySelector(".in");
  assert.deepEqual([...map.querySelectorAll("i")].map((el) => el.className), ["area", "note", "live"]);
  assert.ok(map.querySelector(".vp"));
  assert.ok(world().querySelector('.pnode[data-key="seat-a"] .pc-name'), "the seat that is not on the wall shows its card");
});

test("the little map puts a dot on every thing on the field and marks the ones waiting on you", () => {
  field({ areas: [{ ...A1, x: 0, y: 0, w: 10, h: 10 }], notes: [{ ...N1, x: 10, y: 10, w: 10, h: 10 }], seats: ["seat-a", "seat-b"] });
  st.data = { ...st.data, sessions: [{ name: "seat-a", state: "needs" }, { name: "seat-b", state: "idle" }] };
  st.blocks = [{ id: "b0", label: "", manual: false, keys: ["seat-a", "seat-b"] }, { id: "b1", label: "", manual: false, keys: [] }];
  st.block = 0;
  const model = plane.planeMapViewModel({ clientWidth: 100, clientHeight: 100 });
  assert.deepEqual(model.dots.map((one) => one.key), ["area:pa1", "note:pn1", "seat:seat-a", "seat:seat-b"]);
  assert.deepEqual(model.dots.map((one) => one.cls), ["area", "note", "needs", "live"]);
  st.block = 1;
  assert.equal(plane.planeMapViewModel({ clientWidth: 100, clientHeight: 100 }).dots[3].cls, "", "a seat on another block is a plain dot");
  assert.ok(model.field.k > 0);
  assert.match(model.seen.width, /px$/);
});

test("a dot is never smaller than two pixels, however far out the field is", () => {
  field({ notes: [{ ...N1, x: 0, y: 0, w: 1, h: 1 }] });
  st.planeAt = { x: 0, y: 0, k: 0.01 };
  const model = plane.planeMapViewModel({ clientWidth: 100, clientHeight: 100 });
  assert.equal(model.dots[0].at.width, "2px");
  assert.equal(model.dots[0].at.height, "2px");
});

test("a card on the field says what the seat is about, where it runs and what it carries", () => {
  st.prs = [{ session: "b2", number: 12, state: "open" }];
  const model = plane.planeCardViewModel({ key: "b2", name: "b2", title: "Persist PRs", state: "needs", when: "20:00", where: "cloud", model: "opus" });
  assert.equal(model.glyph, "g-needs");
  assert.equal(model.name, "Persist PRs");
  assert.equal(model.when, "20:00");
  assert.equal(model.said, "needs you");
  assert.equal(model.of, "on the server");
  assert.deepEqual(model.chips.map((one) => one.text), ["#12", "opus"]);
  assert.equal(model.sum, "", "a seat with no status says nothing");
  st.prs = [];
});

test("a seat on an errand is named by the errand, and a local one names no server", () => {
  st.prs = [];
  const model = plane.planeCardViewModel({ key: "b2", name: "b2", errand: "the mirror", where: "local", summary: "half done" });
  assert.equal(model.of, "the mirror · b2");
  assert.equal(model.sum, "half done");
  assert.equal(model.glyph, "g-idle");
  assert.deepEqual(model.chips, []);
});
