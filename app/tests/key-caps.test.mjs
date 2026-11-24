import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const rail = readFileSync(join(HERE, "assets", "raycast", "rail.css"), "utf8");
const top = readFileSync(join(HERE, "assets", "raycast", "top.css"), "utf8");

const st = await state();
const { IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { KEY_CAPS_WAIT, HOLD_WAIT, dropHold, trackHold } = await app("hold-numbers");

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive() {
  st.LIMIT = 4;
  st.data = { sessions: ["s0", "s1", "o0"].map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["s0", "s1"] }, { id: "b1", ws: "w0", label: "", manual: true, keys: ["o0"] }];
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

const press = (key, mods = {}) => ({
  key,
  altKey: !!mods.alt, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, metaKey: !!mods.meta
});

const command = IS_MAC ? press("Meta", { meta: true }) : press("Control", { ctrl: true });

const shown = () => document.body.classList.contains("key-caps");

const pause = (ms) => new Promise((again) => setTimeout(again, ms));

test("holding option shows the key caps after a short wait, never at once", async () => {
  hive();
  trackHold(press("Alt", { alt: true }));
  assert.equal(shown(), false, "a quick shortcut must not flash every key on the screen");
  await pause(KEY_CAPS_WAIT + 60);
  assert.equal(shown(), true);
  assert.ok(KEY_CAPS_WAIT < HOLD_WAIT, "the caps come before the big numbers of the long hold");
  dropHold();
});

test("holding command shows them too", async () => {
  hive();
  trackHold(command);
  await pause(KEY_CAPS_WAIT + 60);
  assert.equal(shown(), true);
  dropHold();
});

test("letting go of the modifier hides them", async () => {
  hive();
  trackHold(press("Alt", { alt: true }));
  await pause(KEY_CAPS_WAIT + 60);
  trackHold(press("Alt", {}));
  assert.equal(shown(), false);
});

test("pressing any other key hides them, because the person already chose the shortcut", async () => {
  hive();
  trackHold(press("Alt", { alt: true }));
  await pause(KEY_CAPS_WAIT + 60);
  trackHold(press("1", { alt: true }));
  assert.equal(shown(), false);
});

test("a shortcut typed before the wait is over leaves nothing behind", async () => {
  hive();
  trackHold(press("Alt", { alt: true }));
  trackHold(press("1", { alt: true }));
  await pause(KEY_CAPS_WAIT + 60);
  assert.equal(shown(), false);
});

test("the window losing focus hides them", async () => {
  hive();
  trackHold(press("Alt", { alt: true }));
  await pause(KEY_CAPS_WAIT + 60);
  window.dispatchEvent(new Event("blur"));
  assert.equal(shown(), false);
});

test("shift alone is no shortcut modifier, so it shows nothing", async () => {
  hive();
  trackHold(press("Shift", { shift: true }));
  await pause(KEY_CAPS_WAIT + 60);
  assert.equal(shown(), false);
});

test("a chat holding the keyboard shows no caps, because the keys would go to the chat", async () => {
  hive();
  st.typing = "s0";
  trackHold(press("Alt", { alt: true }));
  await pause(KEY_CAPS_WAIT + 60);
  assert.equal(shown(), false);
  st.typing = null;
});

test("shift on top of the held modifier keeps them up", async () => {
  hive();
  trackHold(press("Alt", { alt: true }));
  await pause(KEY_CAPS_WAIT + 60);
  trackHold(press("Shift", { alt: true, shift: true }));
  assert.equal(shown(), true);
  dropHold();
});

test("every key cap of the bar, the tiles and the search hides until the modifier is held", () => {
  const rule = page.split("\n").find((line) => line.includes("body:not(.key-caps)"));
  assert.ok(rule, "app.html has one rule that hides the caps at rest in both visuals");
  assert.match(rule, /\{ display: none; \}/);
  for (const cap of ["#blocks .ws-btn kbd", "#strip .num.rc-key", "#k-plane", "#k-pal", ".tile .t-key"]) {
    assert.ok(rule.includes(cap), `${cap} is hidden at rest`);
  }
  assert.match(top, /@media \(min-width: 1280px\) \{ :where\(body\.experience-raycast:not\(\.key-caps\)\) #blocks button\[data-i\] \.rc-key \{ display: none; \} \}/,
    "a block tab hides its key at rest only while it has room for its name; in a narrow window the key is the whole label");
  assert.doesNotMatch(top, /\.ws-btn:is\(:hover[^}]*\.rc-key \{ display: inline-grid/, "hovering the workspace no longer reveals its key: the tooltip says it");
});

test("the rail hides the block key at rest only where the header has words, not in the narrow rail where the key is the label", () => {
  const rule = rail.split("\n").find((line) => line.includes("key-caps"));
  assert.ok(rule);
  assert.match(rule, /@media \(min-width: 1101px\)/);
  assert.match(rule, /#shell:not\(\.rail-min\) #rail \.group-title \.rc-key \{ display: none; \}/);
});
