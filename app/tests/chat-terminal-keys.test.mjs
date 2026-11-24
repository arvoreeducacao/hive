import { test } from "node:test";
import assert from "node:assert/strict";
import { chordOf, shortcutText, withShortcut } from "../src/app/chat-terminal-keys.js";
import { terminalNavKey } from "../src/app/terminal-keys.js";

const key = (code, extra = {}) => ({ type: "keydown", code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra });
const cmd = (code, extra) => key(code, { metaKey: true, ...extra });
const ctrl = (code, extra) => key(code, { ctrlKey: true, ...extra });
const inTerminal = { inTerminal: true, inDrawer: true };
const inBar = { inTerminal: false, inDrawer: true };
const outside = { inTerminal: false, inDrawer: false };

test("on the Mac the drawer takes ⌘D, ⇧⌘D, ⌘N and ⌘W, and ⌘K only inside the terminal", () => {
  const on = { mac: true, ...inTerminal };
  assert.equal(chordOf(cmd("KeyD"), on), "split");
  assert.equal(chordOf(cmd("KeyD", { shiftKey: true }), on), "split-down");
  assert.equal(chordOf(cmd("KeyN"), on), "new");
  assert.equal(chordOf(cmd("KeyW"), on), "close");
  assert.equal(chordOf(cmd("KeyK"), on), "clear");
  assert.equal(chordOf(cmd("KeyD"), { mac: true, ...inBar }), "split", "the drawer's buttons count as the drawer");
  assert.equal(chordOf(cmd("KeyK"), { mac: true, ...inBar }), "", "⌘K outside the terminal is the palette");
  assert.equal(chordOf(cmd("KeyJ"), on), "", "showing and hiding belongs to the app's own terminal key");
});

test("on the Mac the drawer's chords stay with the rest of the app outside the drawer, and ctrl stays with the shell", () => {
  const off = { mac: true, ...outside };
  for (const code of ["KeyD", "KeyN", "KeyW", "KeyK"]) assert.equal(chordOf(cmd(code), off), "", code);
  assert.equal(chordOf(ctrl("KeyD"), { mac: true, ...inTerminal }), "", "ctrl+D on the Mac is the shell's EOF");
  assert.equal(chordOf(cmd("KeyD", { altKey: true }), { mac: true, ...inTerminal }), "");
});

test("off the Mac the drawer takes no key at all: split, new and close live on the buttons", () => {
  for (const where of [inTerminal, inBar, outside]) {
    for (const code of ["KeyD", "KeyW", "KeyN", "KeyK", "KeyJ"]) {
      assert.equal(chordOf(ctrl(code), { mac: false, ...where }), "", code);
      assert.equal(chordOf(ctrl(code, { shiftKey: true }), { mac: false, ...where }), "", `shift+${code}`);
    }
  }
});

test("the buttons show the key only on the Mac", () => {
  assert.equal(shortcutText("D", { mac: true }), "⌘D");
  assert.equal(shortcutText("D", { mac: true, shift: true }), "⇧⌘D");
  assert.equal(shortcutText("D", { mac: false }), "");
  assert.equal(withShortcut("New Terminal", shortcutText("N", { mac: true })), "New Terminal (⌘N)");
  assert.equal(withShortcut("New Terminal", shortcutText("N", { mac: false })), "New Terminal");
});

test("every terminal reads Shift+PageUp and Shift+PageDown as a page of scrollback", () => {
  for (const mac of [true, false]) {
    assert.equal(terminalNavKey(key("PageUp", { shiftKey: true }), { mac }), "page-up");
    assert.equal(terminalNavKey(key("PageDown", { shiftKey: true }), { mac }), "page-down");
    assert.equal(terminalNavKey(key("PageUp"), { mac }), "", "a bare PageUp is the program's");
    assert.equal(terminalNavKey(key("PageUp", { shiftKey: true, altKey: true }), { mac }), "");
  }
});

test("⌘⇧Home and ⌘⇧End jump to the start and the end on the Mac, ctrl+shift elsewhere", () => {
  assert.equal(terminalNavKey(cmd("Home", { shiftKey: true }), { mac: true }), "top");
  assert.equal(terminalNavKey(cmd("End", { shiftKey: true }), { mac: true }), "bottom");
  assert.equal(terminalNavKey(ctrl("Home", { shiftKey: true }), { mac: false }), "top");
  assert.equal(terminalNavKey(ctrl("End", { shiftKey: true }), { mac: false }), "bottom");
  assert.equal(terminalNavKey(ctrl("Home", { shiftKey: true }), { mac: true }), "", "ctrl on the Mac stays with the shell");
  assert.equal(terminalNavKey(cmd("Home"), { mac: true }), "", "without shift it is the program's");
});

test("select all is ⌘A on the Mac and ctrl+shift+A elsewhere, so ctrl+A still goes to the start of the line", () => {
  assert.equal(terminalNavKey(cmd("KeyA"), { mac: true }), "select-all");
  assert.equal(terminalNavKey(cmd("KeyA", { shiftKey: true }), { mac: true }), "");
  assert.equal(terminalNavKey(ctrl("KeyA", { shiftKey: true }), { mac: false }), "select-all");
  assert.equal(terminalNavKey(ctrl("KeyA"), { mac: false }), "");
  assert.equal(terminalNavKey(ctrl("KeyA"), { mac: true }), "");
  assert.equal(terminalNavKey({ ...cmd("KeyA"), type: "keyup" }, { mac: true }), "");
});
