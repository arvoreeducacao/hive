import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { QUIT_HOLD_MS, QUIT_TWICE_MS, quitModeOf, quitShortcut } = require("../main/quit-hold.js");

function rig(mode = "hold", mac = true) {
  let clock = 1000;
  const timers = new Map();
  let next = 1;
  const said = [];
  const result = { quits: 0, concealed: 0 };
  const handler = quitShortcut({
    mac,
    mode: () => mode,
    notify: (hint) => said.push(hint),
    conceal: () => { result.concealed += 1; },
    quit: () => { result.quits += 1; },
    now: () => clock,
    later: (fn, ms) => { const id = next++; timers.set(id, { fn, at: clock + ms }); return id; },
    cancel: (id) => timers.delete(id)
  });
  const advance = (ms) => {
    clock += ms;
    for (const [id, one] of [...timers]) if (one.at <= clock) { timers.delete(id); one.fn(); }
  };
  const key = (type, key, extra = {}) => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    handler(event, { type, key, meta: mac && extra.mod !== false, control: !mac && extra.mod !== false, alt: false, shift: false, isAutoRepeat: !!extra.repeat });
    return event;
  };
  return { said, result, advance, key };
}

test("a quick press only shows the hint and quits nothing", () => {
  const { said, result, advance, key } = rig("hold");
  assert.equal(key("keyDown", "q").prevented, true);
  assert.deepEqual(said[0], { state: "down", mode: "hold", holdMs: QUIT_HOLD_MS });
  key("keyUp", "q");
  advance(3000);
  assert.equal(result.quits, 0);
  assert.equal(said.at(-1).state, "up");
});

test("holding for the whole time hides the window and quits when the key comes up", () => {
  const { result, advance, key } = rig("hold");
  key("keyDown", "q");
  for (let at = 0; at < 14; at += 1) {
    advance(100);
    key("keyDown", "q", { repeat: true });
  }
  assert.equal(result.concealed, 1);
  assert.equal(result.quits, 0);
  key("keyUp", "q");
  assert.equal(result.quits, 1);
});

test("two quick presses quit in hold mode too", () => {
  const { result, advance, key } = rig("hold");
  key("keyDown", "q");
  key("keyUp", "q");
  advance(QUIT_TWICE_MS - 100);
  key("keyDown", "q");
  assert.equal(result.quits, 1);
});

test("two presses too far apart do not quit", () => {
  const { result, advance, key } = rig("twice");
  key("keyDown", "q");
  key("keyUp", "q");
  advance(QUIT_TWICE_MS + 50);
  key("keyDown", "q");
  assert.equal(result.quits, 0);
});

test("press twice mode shows its own hint and quits on the second press", () => {
  const { said, result, key } = rig("twice");
  key("keyDown", "q");
  assert.equal(said[0].mode, "twice");
  key("keyUp", "q");
  key("keyDown", "q");
  assert.equal(result.quits, 1);
});

test("direct leaves the press alone, so the menu quits the way it always did", () => {
  const { said, result, key } = rig("direct");
  assert.equal(key("keyDown", "q").prevented, false);
  assert.deepEqual(said, []);
  assert.equal(result.quits, 0);
});

test("other keys and q without the modifier are not touched", () => {
  const { said, key } = rig("hold");
  assert.equal(key("keyDown", "w").prevented, false);
  assert.equal(key("keyDown", "q", { mod: false }).prevented, false);
  assert.deepEqual(said, []);
});

test("off the Mac it is ctrl that has to be held", () => {
  const { said, key } = rig("hold", false);
  assert.equal(key("keyDown", "q").prevented, true);
  assert.equal(said[0].mode, "hold");
});

test("an unknown mode in the file falls back to hold", () => {
  assert.equal(quitModeOf("nonsense"), "hold");
  assert.equal(quitModeOf(undefined), "hold");
  assert.equal(quitModeOf("direct"), "direct");
});
