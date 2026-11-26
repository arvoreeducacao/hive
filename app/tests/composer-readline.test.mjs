import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { drafts, newDraft } = await app("draft-seat");
const { readlineChord, readlineEdit } = await app("composer-readline");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { models: [] } }) });

const CTRL = { ctrlKey: true };
const ALT = { altKey: true };

function fakeBox(value, start = value.length, end = start) {
  return { value, selectionStart: start, selectionEnd: end };
}

function chord(code, mods) {
  return { code, key: code.slice(3).toLowerCase(), ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods };
}

function run(box, code, mods, options = {}) {
  const edit = readlineEdit(chord(code, mods), box, { mac: false, ...options });
  if (!edit) return null;
  box.value = box.value.slice(0, edit.start) + edit.text + box.value.slice(edit.end);
  [box.selectionStart, box.selectionEnd] = edit.selection;
  return edit;
}

let seq = 0;

function seat() {
  const e = getStructured({ name: `readline-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  return e.host.querySelector(".sv-composer textarea");
}

function press(box, code, mods) {
  const ev = new KeyboardEvent("keydown", { code, key: code.slice(3).toLowerCase(), bubbles: true, cancelable: true, ...mods });
  box.dispatchEvent(ev);
  return ev;
}

test("only the line and word chords are taken, and the word chords stay with the Option key on a mac", () => {
  assert.equal(readlineChord(chord("KeyE", CTRL), false), "lineEnd");
  assert.equal(readlineChord(chord("KeyB", ALT), false), "wordBack");
  assert.equal(readlineChord(chord("KeyF", ALT), false), "wordForward");
  assert.equal(readlineChord(chord("KeyB", ALT), true), null, "Option+B types a character on a mac");
  assert.equal(readlineChord(chord("KeyE", CTRL), true), "lineEnd");
  assert.equal(readlineChord(chord("KeyE", { ctrlKey: true, shiftKey: true }), false), null, "a shifted chord belongs to the app");
  assert.equal(readlineChord(chord("KeyE", { ctrlKey: true, altKey: true }), false), null, "AltGr reports ctrl and alt together");
  assert.equal(readlineChord(chord("KeyE", { ctrlKey: true, isComposing: true }), false), null);
  for (const code of ["KeyA", "KeyW", "KeyU", "KeyK", "KeyY", "KeyC"]) assert.equal(readlineChord(chord(code, CTRL), false), null, `ctrl+${code.slice(3).toLowerCase()} is not taken`);
  for (const code of ["KeyD", "KeyY"]) assert.equal(readlineChord(chord(code, ALT), false), null, `alt+${code.slice(3).toLowerCase()} is not taken`);
});

test("ctrl+e moves to the end of the line the caret is on, and ctrl+a keeps the box's own select all", () => {
  const box = fakeBox("first line\nsecond line", 14);
  run(box, "KeyE", CTRL);
  assert.deepEqual([box.selectionStart, box.selectionEnd], [22, 22]);
  box.selectionStart = box.selectionEnd = 3;
  run(box, "KeyE", CTRL);
  assert.deepEqual([box.selectionStart, box.selectionEnd], [10, 10]);
  assert.equal(run(box, "KeyA", CTRL), null);
  assert.equal(box.value, "first line\nsecond line", "moving never changes the text");
});

test("alt+b and alt+f jump over words, and punctuation splits them", () => {
  const box = fakeBox("open src/app_main.js now", 24);
  run(box, "KeyB", ALT);
  assert.equal(box.selectionStart, 21);
  run(box, "KeyB", ALT);
  assert.equal(box.selectionStart, 18);
  run(box, "KeyB", ALT);
  assert.equal(box.selectionStart, 13);
  box.selectionStart = box.selectionEnd = 0;
  run(box, "KeyF", ALT);
  assert.equal(box.selectionStart, 4);
  run(box, "KeyF", ALT);
  assert.equal(box.selectionStart, 8);
});

test("a letter outside the basic plane is still part of a word", () => {
  const box = fakeBox("ab \u{1D400}\u{20000}c d");
  box.selectionStart = box.selectionEnd = 8;
  run(box, "KeyB", ALT);
  assert.equal(box.selectionStart, 3, "alt+b stops at the start of the word, not inside a surrogate pair");
  run(box, "KeyF", ALT);
  assert.equal(box.selectionStart, 8);
});

test("the chat composer and the new-chat box both answer the chords", () => {
  const box = seat();
  box.value = "write the test";
  box.setSelectionRange(box.value.length, box.value.length);
  const ev = press(box, "KeyB", ALT);
  assert.ok(ev.defaultPrevented);
  assert.equal(box.selectionStart, 10);
  assert.equal(press(box, "KeyA", CTRL).defaultPrevented, false, "ctrl+a stays with the box's select all");
  box.setSelectionRange(0, 0);
  const end = press(box, "KeyE", CTRL);
  assert.ok(end.defaultPrevented);
  assert.equal(box.selectionStart, 14, "ctrl+e reaches the box instead of a shortcut bound to it");

  const d = newDraft();
  document.body.appendChild(d.e.host);
  const draftBox = d.e.host.querySelector("textarea");
  draftBox.value = "fix the bug";
  draftBox.setSelectionRange(3, 3);
  press(draftBox, "KeyE", CTRL);
  assert.equal(draftBox.selectionStart, 11);
  d.e.host.remove();
  drafts.delete(d.id);
});
