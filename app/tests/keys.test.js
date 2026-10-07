import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, state, dom, views } from "./dom.mjs";

const st = await state();
await views();
const { applyBindings } = await app("shared");
const { isLeader, silenced, whichAction, whichChord } = await app("brand-face");
const { $, ACTION_GROUPS, ACTIONS, DEFAULT_KEYS, formatKey, overrides } = await app("core");
const { captureKey, keyHint, literalOf } = await app("leader-key");
await app("themes");

const apply = (file) => applyBindings(file);
const leader = () => st.leader;
const ev = (code, mods = {}) => ({ code, key: "", altKey: !!mods.alt, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, metaKey: !!mods.meta });

function offline(run) {
  const was = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve({ ok: true, json: async () => ({}) });
  try { return run(); } finally { globalThis.fetch = was; }
}

test("with no leader in the file nothing changes", () => {
  assert.deepEqual(apply({}), []);
  assert.equal(leader(), null);
  assert.deepEqual(overrides(), {});
  assert.equal(whichAction(ev("KeyN", { ctrl: true })).action, "new");
  assert.equal(isLeader(ev("KeyB", { ctrl: true })), false);
});

test("leader: on is ctrl+b and leaves the direct shortcuts alone", () => {
  assert.deepEqual(apply({ leader: "on" }), []);
  assert.equal(formatKey(leader()), "ctrl+b");
  assert.equal(isLeader(ev("KeyB", { ctrl: true })), true);
  assert.equal(whichAction(ev("KeyN", { ctrl: true })).action, "new");
  assert.deepEqual(overrides(), { leader: "on" });
});

test("every command answers one key after the leader", () => {
  apply({ leader: "on" });
  assert.equal(whichChord(ev("KeyN")).action, "new");
  assert.equal(whichChord(ev("KeyG")).action, "prs");
  assert.deepEqual(whichChord(ev("Digit3")), { action: "seat", digit: 3 });
  assert.equal(whichChord(ev("ArrowLeft")).action, "focusLeft");
  assert.equal(whichChord(ev("Enter")).action, "type");
  assert.equal(whichChord(ev("Escape")).action, "release");
  assert.equal(whichChord(ev("KeyZ")), null);
});

test("a chord ignores shift on a symbol, so , works where typing it needs shift", () => {
  apply({ leader: "on" });
  assert.equal(whichChord(ev("Comma", { shift: true })).action, "help");
});

test("a chord can be moved or unbound one line at a time", () => {
  assert.deepEqual(apply({ leader: "on", "leader.new": "z", "leader.term": "off" }), []);
  assert.equal(whichChord(ev("KeyZ")).action, "new");
  assert.equal(whichChord(ev("KeyN")), null);
  assert.equal(whichChord(ev("KeyT")), null);
  assert.deepEqual(overrides(), { leader: "on", "leader.new": "z", "leader.term": "off" });
});

test("direct: off hands the combinations back to Claude Code", () => {
  assert.deepEqual(apply({ leader: "on", direct: "off" }), []);
  assert.equal(silenced("new"), true);
  assert.equal(whichAction(ev("KeyN", { ctrl: true })), null);
  assert.equal(whichChord(ev("KeyN")).action, "new");
  assert.equal(keyHint("new"), "Ctrl+B N");
});

test("direct: off leaves a shortcut the terminal cannot read alone", () => {
  assert.deepEqual(apply({ leader: "on", direct: "off", new: "meta+n" }), []);
  assert.equal(silenced("new"), false);
  assert.equal(whichAction(ev("KeyN", { meta: true })).action, "new");
});

test("direct: off keeps the shortcuts that never reach a terminal", () => {
  apply({ leader: "on", direct: "off" });
  assert.equal(silenced("type"), false);
  assert.equal(whichAction(ev("Enter")).action, "type");
});

test("with no chord to fall back on, a direct shortcut survives direct: off", () => {
  apply({ leader: "on", direct: "off", "leader.term": "off" });
  assert.equal(silenced("term"), false);
  assert.equal(whichAction(ev("KeyT", { ctrl: true })).action, "term");
});

test("the pod key is gone with its screen, and a file that still names it is neither refused nor obeyed", () => {
  assert.deepEqual(apply({ pod: "ctrl+k", "leader.pod": "k", asked: "ctrl+q" }), []);
  assert.equal(whichAction(ev("KeyK", { ctrl: true })), null);
  assert.equal("pod" in DEFAULT_KEYS, false);
  assert.deepEqual(overrides(), {});
});

test("your day answers a key out of the box on the ctrl family — it used to be the one line with nothing on it", () => {
  assert.deepEqual(apply({}), []);
  assert.equal(whichAction(ev("KeyY", { ctrl: true, shift: true })).action, "day");
  assert.equal(keyHint("day"), "Ctrl+Shift+Y");
  apply({ leader: "on" });
  assert.equal(whichChord(ev("KeyD")).action, "day");
  assert.equal(whichChord(ev("KeyQ")).action, "dim", "dim moved off the d, so the day could have it");
});

test("every action the app runs is on the panel, can take a key, and answers after the leader", () => {
  const listed = ACTIONS.map(([a]) => a);
  assert.deepEqual([...new Set(listed)], listed, "an action is listed twice");
  assert.deepEqual(listed.slice().sort(), Object.keys(DEFAULT_KEYS).sort(), "the panel and the key map name different actions — a line with nothing to bind, or a key nobody can see");
  assert.deepEqual(ACTION_GROUPS.flatMap(([, , actions]) => actions), listed, "the groups do not add up to the list");
  const dispatcher = readFileSync(new URL("../src/app/themes.js", import.meta.url), "utf8");
  const missing = listed.filter((a) => !dispatcher.includes(`case "${a}":`));
  assert.deepEqual(missing, [], "these actions are on the panel but the dispatcher has no case for them");
});

test("rename, the worktrees, the themes, the doctor and the window of its own bind like any other action", () => {
  const file = { rename: "ctrl+shift+r", worktrees: "ctrl+shift+o", themes: "ctrl+shift+t", doctor: "ctrl+shift+g", detach: "ctrl+shift+i" };
  assert.deepEqual(apply(file), []);
  assert.equal(whichAction(ev("KeyR", { ctrl: true, shift: true })).action, "rename");
  assert.equal(whichAction(ev("KeyO", { ctrl: true, shift: true })).action, "worktrees");
  assert.equal(whichAction(ev("KeyT", { ctrl: true, shift: true })).action, "themes");
  assert.equal(whichAction(ev("KeyG", { ctrl: true, shift: true })).action, "doctor");
  assert.equal(whichAction(ev("KeyI", { ctrl: true, shift: true })).action, "detach");
  assert.deepEqual(overrides(), file);
  apply({ leader: "on" });
  assert.equal(whichChord(ev("KeyK")).action, "worktrees");
  assert.equal(whichChord(ev("KeyT", { shift: true })).action, "themes");
  assert.equal(whichChord(ev("KeyD", { shift: true })).action, "doctor");
  assert.equal(whichChord(ev("KeyR", { shift: true })).action, "rename");
  assert.equal(whichChord(ev("KeyO")).action, "detach");
});

test("turning the leader off puts everything back", () => {
  apply({ leader: "on", direct: "off" });
  assert.deepEqual(apply({ leader: "off" }), []);
  assert.equal(leader(), null);
  assert.equal(whichAction(ev("KeyN", { ctrl: true })).action, "new");
});

test("a leader with no modifier is refused, so the terminal keeps its keys", () => {
  assert.deepEqual(apply({ leader: "b" }), ["leader: b needs ctrl, alt or meta"]);
  assert.deepEqual(apply({ leader: "ctrl+é" }), ["leader: ctrl+é"]);
});

test("what the file gets wrong is named, never silently dropped", () => {
  assert.deepEqual(apply({ leader: "on", "leader.nope": "x" }), ["leader.nope"]);
  assert.deepEqual(apply({ leader: "on", "leader.seat": "s" }), ["leader.seat: s is the 1…9 family, so it takes digit"]);
  assert.deepEqual(apply({ direct: "sometimes" }), ["direct: sometimes"]);
});

test("a chord asked for twice is called out and the first one keeps it", () => {
  assert.deepEqual(apply({ leader: "on", "leader.prs": "n" }), ["ctrl+b n on prs: new already has it"]);
  assert.equal(whichChord(ev("KeyN")).action, "new");
});

test("a leader sitting on a shortcut is called out too", () => {
  assert.deepEqual(apply({ leader: "ctrl+n" }), ["ctrl+n on new: the leader already has it"]);
});

test("off unbinds a single command and comes back out of the file", () => {
  assert.deepEqual(apply({ new: "off" }), []);
  assert.equal(whichAction(ev("KeyN", { ctrl: true })), null);
  assert.deepEqual(overrides(), { new: "off" });
});

test("pressing the leader twice sends the real key to the terminal", () => {
  assert.equal(literalOf({ ctrl: true, code: "KeyB" }), "\x02");
  assert.equal(literalOf({ ctrl: true, code: "KeyA" }), "\x01");
  assert.equal(literalOf({ ctrl: true, code: "Space" }), "\x00");
  assert.equal(literalOf({ alt: true, code: "KeyB" }), "\x1bb");
  assert.equal(literalOf({ meta: true, code: "KeyB" }), "");
});

test("the default fullscreen key writes nothing into a terminal, so the hive can keep it", () => {
  apply({});
  assert.equal(literalOf({ ctrl: true, code: "Enter" }), "");
  assert.equal(literalOf({ meta: true, code: "Enter" }), "");
  assert.equal(literalOf({ ctrl: true, code: "KeyF" }), "\x06");
});

test("the reorder actions come unbound, like the focus arrows", () => {
  assert.deepEqual(apply({}), []);
  assert.equal(whichAction(ev("KeyH", { ctrl: true, shift: true })), null);
  assert.deepEqual(overrides(), {});
});

test("a move shortcut binds, rebinds and unbinds like any other", () => {
  assert.deepEqual(apply({ moveLeft: "ctrl+shift+h", moveRight: "ctrl+shift+j" }), []);
  assert.equal(whichAction(ev("KeyH", { ctrl: true, shift: true })).action, "moveLeft");
  assert.equal(whichAction(ev("KeyJ", { ctrl: true, shift: true })).action, "moveRight");
  assert.deepEqual(overrides(), { moveLeft: "ctrl+shift+h", moveRight: "ctrl+shift+j" });
  assert.deepEqual(apply({ moveLeft: "off" }), []);
  assert.equal(whichAction(ev("KeyH", { ctrl: true, shift: true })), null);
});

test("a configured shortcut wins over a default that used the same key", () => {
  assert.deepEqual(apply({ moveRight: "ctrl+shift+l" }), []);
  assert.equal(whichAction(ev("KeyL", { ctrl: true, shift: true })).action, "moveRight");
  assert.deepEqual(overrides(), { plane: "off", moveRight: "ctrl+shift+l" });
});

test("the shortcut editor also lets a custom binding displace a default", () => {
  apply({});
  st.capturing = "moveRight";
  offline(() => captureKey({
    code: "KeyL",
    key: "L",
    altKey: false,
    ctrlKey: true,
    shiftKey: true,
    metaKey: false,
    preventDefault() {},
    stopPropagation() {}
  }));
  assert.equal(st.keys.plane, null);
  assert.deepEqual(st.keys.moveRight, { alt: false, ctrl: true, shift: true, meta: false, code: "KeyL" });
  assert.equal(whichAction(ev("KeyL", { ctrl: true, shift: true })).action, "moveRight");
});

test("reset clears explicit shortcut ownership before restoring defaults", () => {
  apply({ leader: "on", direct: "off", moveRight: "ctrl+shift+l" });
  assert.equal(st.explicitKeys.has("moveRight"), true);
  offline(() => $("t-reset").dispatchEvent(new dom.Event("click", { bubbles: true })));
  assert.equal(st.explicitKeys.size, 0, "an explicit owner survived the reset and would block the default that wants the key back");
  assert.equal(st.keys.moveRight, DEFAULT_KEYS.moveRight);
  assert.deepEqual(st.keys.plane, DEFAULT_KEYS.plane);
  assert.equal(st.leader, null);
  assert.equal(st.directMode, "keep");
  assert.equal(whichAction(ev("KeyL", { ctrl: true, shift: true })).action, "plane");
});

test("the shelf answers a shortcut out of the box, direct and after the leader", () => {
  assert.deepEqual(apply({}), []);
  assert.equal(whichAction(ev("KeyE", { ctrl: true, shift: true })).action, "shelf");
  apply({ leader: "on" });
  assert.equal(whichChord(ev("KeyE")).action, "shelf");
});

test("the shelf rebinds and unbinds like any other command", () => {
  assert.deepEqual(apply({ shelf: "ctrl+alt+e" }), []);
  assert.equal(whichAction(ev("KeyE", { ctrl: true, alt: true })).action, "shelf");
  assert.equal(whichAction(ev("KeyE", { ctrl: true, shift: true })), null);
  assert.deepEqual(overrides(), { shelf: "ctrl+alt+e" });
  assert.deepEqual(apply({ shelf: "off" }), []);
  assert.equal(whichAction(ev("KeyE", { ctrl: true, alt: true })), null);
  assert.deepEqual(overrides(), { shelf: "off" });
});

test("shift is the case of a letter, so the leader tells A from a", () => {
  apply({ leader: "on" });
  assert.equal(whichChord(ev("KeyA")).action, "accounts");
  assert.equal(whichChord(ev("KeyA", { shift: true })), null,
    "an unshifted chord swallowed the shifted key, so no letter can ever be bound in both cases");
});

test("a shifted letter chord answers only shifted", () => {
  assert.deepEqual(apply({ leader: "on", "leader.archive": "shift+a" }), []);
  assert.equal(whichChord(ev("KeyA", { shift: true })).action, "archive");
  assert.equal(whichChord(ev("KeyA")).action, "accounts",
    "the shifted chord stole the plain letter from whoever already had it");
});

test("the tolerance stays where shift is how the key is typed at all", () => {
  apply({ leader: "on" });
  assert.equal(whichChord(ev("Comma", { shift: true })).action, "help");
  assert.deepEqual(whichChord(ev("Digit3", { shift: true })), { action: "seat", digit: 3 });
});

test("two letters that differ only by case are not a conflict the file should refuse", () => {
  assert.deepEqual(apply({ leader: "on", "leader.accounts": "a", "leader.archive": "shift+a" }), [],
    "the file was refused for a clash that no longer happens at the keyboard");
});

test("the digits climb three levels: one modifier goes up one, both go up two", () => {
  assert.deepEqual(apply({}), []);
  assert.equal(whichAction(ev("Digit2", { ctrl: true })).action, "seat");
  assert.equal(whichAction(ev("Digit2", { alt: true })).action, "block");
  assert.equal(whichAction(ev("Digit2", { ctrl: true, alt: true })).action, "space");
});

test("the digit travels with the action, so the level knows which one it is", () => {
  assert.deepEqual(apply({}), []);
  assert.deepEqual(whichAction(ev("Digit7", { alt: true })), { action: "block", digit: 7 });
  assert.deepEqual(whichAction(ev("Digit3", { ctrl: true, alt: true })), { action: "space", digit: 3 });
});

test("the pile of floors answers a key out of the box — it used to answer none", () => {
  assert.deepEqual(apply({}), []);
  assert.equal(whichAction(ev("Digit0", { ctrl: true, alt: true })).action, "arrange");
  assert.equal(keyHint("arrange"), "Ctrl+Alt+0");
});

test("each level prints its own ceiling: the block holds four seats, the ruler holds nine", () => {
  assert.deepEqual(apply({}), []);
  assert.equal(keyHint("seat"), "Ctrl+1…4");
  assert.equal(keyHint("block"), "Alt+1…9");
  assert.equal(keyHint("space"), "Ctrl+Alt+1…9");
});

test("a level of the digit family only takes a digit, the same way the seat always did", () => {
  assert.deepEqual(apply({ block: "alt+k" }), ["block: alt+k is the 1…9 family, so it takes digit"]);
  assert.equal(whichAction(ev("Digit2", { alt: true })).action, "block");
});
