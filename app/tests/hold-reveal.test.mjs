import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { $ } = await app("core");
const { keyLabel } = await app("brand-face");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { HOLD_WAIT, dropHold, heldLevel, holdSpan, trackHold } = await app("hold-numbers");

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive({ spaces = 2, blocks = 3, seats = 4 } = {}) {
  const here = Array.from({ length: seats }, (_, i) => `s${i}`);
  const elsewhere = Array.from({ length: blocks - 1 }, (_, i) => `o${i}`);
  st.LIMIT = 4;
  st.data = { sessions: [...here, ...elsewhere].map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = Array.from({ length: spaces }, (_, i) => ({ id: `w${i}`, name: "" }));
  st.space = "w0";
  st.blocks = Array.from({ length: blocks }, (_, i) => ({ id: `b${i}`, ws: "w0", label: "", manual: true, keys: i === 0 ? here : [elsewhere[i - 1]] }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.pending = false;
  st.capturing = null;
  st.typing = null;
  st.tourAt = -1;
  st.leader = null;
  st.chords = {};
  st.keys = {
    seat: { meta: true, code: "Digit" },
    block: { alt: true, code: "Digit" },
    space: { meta: true, alt: true, code: "Digit" }
  };
  dropHold();
  render();
}

const down = (key, mods = {}) => ({
  key,
  altKey: !!mods.alt, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, metaKey: !!mods.meta
});

const waited = () => new Promise((again) => setTimeout(again, HOLD_WAIT + 120));

test("each modifier answers for the level its own binding owns", () => {
  hive();
  assert.equal(heldLevel(down("Meta", { meta: true })), "seat");
  assert.equal(heldLevel(down("Alt", { alt: true })), "block");
  assert.equal(heldLevel(down("Alt", { meta: true, alt: true })), "space");
});

test("shift on top of the modifier belongs to no level, so nothing is promised", () => {
  hive();
  assert.equal(heldLevel(down("Shift", { meta: true, shift: true })), null);
  assert.equal(heldLevel(down("Shift", { shift: true })), null);
});

test("the marker reads the binding, so moving the chat moves the marker with it", () => {
  hive();
  st.keys.seat = { ctrl: true, shift: true, code: "Digit" };
  assert.equal(heldLevel(down("Meta", { meta: true })), null);
  assert.equal(heldLevel(down("Control", { ctrl: true, shift: true })), "seat");
});

test("holding arms the wait instead of painting at once", () => {
  hive();
  trackHold(down("Meta", { meta: true }));
  assert.equal(st.holding, null);
  assert.notEqual(st.holdTimer, null);
  dropHold();
});

test("a real key means the person committed to a shortcut, and the marker gets out of the way", () => {
  hive();
  trackHold(down("Meta", { meta: true }));
  trackHold(down("k", { meta: true }));
  assert.equal(st.holdTimer, null);
  assert.equal(st.holding, null);
});

test("letting go before the wait is over leaves nothing armed", () => {
  hive();
  trackHold(down("Meta", { meta: true }));
  trackHold(down("Meta", {}));
  assert.equal(st.holdTimer, null);
  assert.equal(st.holding, null);
});

test("the second modifier arriving mid-wait paints the level it became, not the one it was", async () => {
  hive();
  trackHold(down("Meta", { meta: true }));
  trackHold(down("Alt", { meta: true, alt: true }));
  assert.equal(st.holdArmed, "space");
  await waited();
  assert.equal(st.holding, "space");
  dropHold();
});

test("once it is up, adding a modifier switches level with no second wait", async () => {
  hive();
  trackHold(down("Meta", { meta: true }));
  await waited();
  assert.equal(st.holding, "seat");
  trackHold(down("Alt", { meta: true, alt: true }));
  assert.equal(st.holding, "space");
  dropHold();
});

test("the terminal owning the keyboard shows no marker, because the digit would not obey", () => {
  hive();
  st.typing = "a-seat";
  trackHold(down("Meta", { meta: true }));
  assert.equal(st.holdTimer, null);
  assert.equal(st.holding, null);
});

test("an armed leader key keeps the marker out of the mode strip it is already using", () => {
  hive();
  st.pending = true;
  trackHold(down("Meta", { meta: true }));
  assert.equal(st.holding, null);
});

test("the strip says which level and how far the digits go on it", async () => {
  hive();
  trackHold(down("Alt", { alt: true }));
  await waited();
  assert.equal($("mode").hidden, false);
  assert.equal($("mode-txt").textContent, `${keyLabel(st.keys.block, null, 3)} · block`);
  assert.match($("mode-txt").textContent, /1…3/, "the strip counts the blocks the digits reach");
  dropHold();
  assert.equal($("mode").hidden, true);
});

test("each level counts what it can actually reach", () => {
  hive();
  assert.equal(holdSpan("seat"), 4);
  assert.equal(holdSpan("block"), 3);
  assert.equal(holdSpan("space"), 2);
});

test("a level with one target only has nothing to choose, so it paints nothing", () => {
  hive({ spaces: 1 });
  trackHold(down("Alt", { meta: true, alt: true }));
  assert.equal(st.holdTimer, null);
  assert.equal(st.holding, null);
  trackHold(down("Alt", { alt: true }));
  assert.notEqual(st.holdTimer, null);
  dropHold();
});
