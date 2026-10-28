import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { render } = await app("arrange");
const { stepFocus, stepMove } = await app("focus-navigation");
const { FOCUS_MODE_KEY, bootLayout, setFocusMode } = await app("seat-layout");
const { run } = await app("themes");
const { ACTIONS, DEFAULT_KEYS } = await app("core");

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive({ layout = "grid", block = 0, focus = 0, focusMode = true } = {}) {
  const blocks = [
    { id: "a1", ws: "a", label: "", manual: true, keys: ["s1", "s2", "s3"] },
    { id: "a2", ws: "a", label: "", manual: true, keys: ["s4"] }
  ];
  st.LIMIT = 4;
  st.seatLayout = layout;
  st.focusMode = focusMode;
  st.data = { sessions: blocks.flatMap((one) => one.keys).map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = blocks;
  st.spaces = [{ id: "a", name: "a" }];
  st.space = "a";
  st.block = block;
  st.focus = focus;
  st.open = null;
  st.seatsKnown = true;
}

const canvas = () => document.getElementById("canvas");
const onCanvas = () => [...canvas().children].map((el) => el.dataset.key).filter(Boolean);
const offsetOf = (key) => canvas().querySelector(`[data-key="${key}"]`).style.getPropertyValue("--from-focus");

test("focus mode lines up only the chats of the block, each one placed by its distance to the chat in focus", () => {
  hive({ focus: 1 });
  render({ animate: false });
  assert.equal(canvas().className, "focus-mode");
  assert.deepEqual(onCanvas(), ["s1", "s2", "s3"]);
  assert.deepEqual(["s1", "s2", "s3"].map(offsetOf), ["-1", "0", "1"]);
  assert.deepEqual([...canvas().querySelectorAll(":scope > .focused")].map((el) => el.dataset.key), ["s2"]);
  assert.deepEqual([...canvas().querySelectorAll(":scope > .focus-aside")].map((el) => el.dataset.key), ["s1", "s3"], "the faded neighbours take no clicks of their own");
});

test("outside focus mode no chat is set aside, so moving the focus never restyles a whole conversation", () => {
  hive({ focus: 1, focusMode: false });
  render({ animate: false });
  assert.equal(canvas().querySelectorAll(".focus-aside").length, 0);
  stepFocus(1, 0);
  assert.equal(canvas().querySelectorAll(".focus-aside").length, 0);
});

test("focus mode wins over the strip, and the block tabs stay on screen", () => {
  hive({ layout: "strip" });
  render({ animate: false });
  assert.equal(canvas().className, "focus-mode");
  assert.deepEqual(onCanvas(), ["s1", "s2", "s3"]);
  assert.equal(document.body.classList.contains("strip-on"), false);
  st.focus = 2;
  stepFocus(1, 0);
  assert.equal(st.blocks[st.block].id, "a2");
  assert.deepEqual(onCanvas(), ["s4"], "the next block comes alone, not the whole strip");
});

test("stepping sideways walks the block, then crosses into the next block like the normal view, still in focus", () => {
  hive({ focus: 1 });
  render({ animate: false });
  stepFocus(1, 0);
  assert.equal(st.focus, 2);
  assert.deepEqual(["s1", "s2", "s3"].map(offsetOf), ["-2", "-1", "0"]);
  stepFocus(1, 0);
  assert.equal(st.blocks[st.block].id, "a2");
  assert.equal(st.focus, 0);
  assert.equal(canvas().className, "focus-mode");
  assert.deepEqual(onCanvas(), ["s4"]);
  assert.equal(offsetOf("s4"), "0");
  stepFocus(1, 0);
  assert.equal(st.blocks[st.block].id, "a2", "past the last block of the workspace it stops");
  stepFocus(-1, 0);
  assert.equal(st.blocks[st.block].id, "a1");
  assert.equal(st.focus, 2, "coming back it lands on the chat facing the one it left");
  assert.equal(offsetOf("s3"), "0");
});

test("a held key runs to the edge of the block and stops there, as in the normal view", () => {
  hive({ focus: 2 });
  render({ animate: false });
  st.keyHeld = true;
  stepFocus(1, 0);
  st.keyHeld = false;
  assert.equal(st.blocks[st.block].id, "a1");
  assert.equal(st.focus, 2);
});

test("moving the chat in focus reorders it in the block, and past the edge trades it with the next block", () => {
  hive({ focus: 1 });
  render({ animate: false });
  stepMove(-1, 0);
  assert.deepEqual([...st.blocks[0].keys], ["s2", "s1", "s3"]);
  hive({ focus: 2 });
  render({ animate: false });
  stepMove(1, 0);
  assert.deepEqual([...st.blocks[0].keys], ["s1", "s2", "s4"]);
  assert.deepEqual([...st.blocks[1].keys], ["s3"]);
});

test("a click on a chat beside the one in focus brings it to the middle", () => {
  hive({ focus: 0 });
  render({ animate: false });
  canvas().querySelector('[data-key="s3"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  assert.equal(st.focus, 2);
  assert.equal(offsetOf("s3"), "0");
});

test("a chat open in fullscreen still takes the whole canvas", () => {
  hive();
  st.open = "s1";
  render({ animate: false });
  assert.equal(canvas().className, "zoom");
  st.open = null;
});

test("the shortcut and the palette flip it, it outlives a reload, and turning it off gives the layout back", () => {
  hive({ layout: "row", focusMode: false });
  render({ animate: false });
  assert.ok(ACTIONS.some(([action]) => action === "focusMode"));
  assert.equal(DEFAULT_KEYS.focusMode, null, "it waits for a key of your own instead of taking one");
  run("focusMode");
  assert.equal(st.focusMode, true);
  assert.equal(canvas().className, "focus-mode");
  assert.equal(localStorage.getItem(FOCUS_MODE_KEY), "1");
  st.focusMode = false;
  bootLayout();
  assert.equal(st.focusMode, true);
  st.seatLayout = "row";
  setFocusMode(false);
  assert.equal(localStorage.getItem(FOCUS_MODE_KEY), "");
  assert.match(canvas().className, /\brow\b/);
  assert.equal(offsetOf("s1"), "");
});
