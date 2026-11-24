import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();

const { getStructured } = await app("chat-stretches");
const { drafts, newDraft } = await app("draft-seat");
const { $ } = await app("core");
const { closePal, openPal } = await app("palette");
await app("composer");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { models: [] } }) });

let seq = 0;

function focusedSeat() {
  const e = getStructured({ name: `paste-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  st.open = e.name;
  return { e, box: e.host.querySelector(".sv-composer textarea"), done: () => { st.open = null; e.host.remove(); } };
}

function clipboard(words) {
  const data = new DataTransfer();
  data.setData("text/plain", words);
  return data;
}

function paste(target, data) {
  const ev = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

const settle = () => new Promise((go) => setTimeout(go, 5));

test("a paste with no field in focus lands at the end of the focused chat's composer", () => {
  const s = focusedSeat();
  s.box.value = "before ";
  s.box.blur();
  const ev = paste(document.body, clipboard("pasted words"));
  assert.ok(ev.defaultPrevented);
  assert.equal(s.box.value, "before pasted words");
  assert.ok(document.activeElement === s.box, "the composer takes the focus");
  assert.equal(s.box.selectionStart, s.box.value.length);
  s.done();
});

test("a paste into a field, onto a button or carrying a file is left alone", () => {
  const s = focusedSeat();
  const input = document.createElement("input");
  const button = document.createElement("button");
  document.body.append(input, button);
  assert.equal(paste(input, clipboard("x")).defaultPrevented, false);
  assert.equal(paste(button, clipboard("x")).defaultPrevented, false);
  const withFile = clipboard("x");
  withFile.items.add(new window.File(["png"], "shot.png", { type: "image/png" }));
  assert.equal(paste(document.body, withFile).defaultPrevented, false, "images keep their own path");
  assert.equal(s.box.value, "");
  input.remove();
  button.remove();
  s.done();
});

test("a paste another listener already took is not typed into the composer as well", () => {
  const s = focusedSeat();
  const claim = (ev) => ev.preventDefault();
  document.addEventListener("paste", claim, true);
  try {
    paste(document.body, clipboard("hive://seat/other"));
    assert.equal(s.box.value, "");
  } finally { document.removeEventListener("paste", claim, true); }
  s.done();
});

test("a paste while the palette is open stays out of the composer", () => {
  const s = focusedSeat();
  $("pal").hidden = false;
  try {
    assert.equal(paste(document.body, clipboard("x")).defaultPrevented, false);
  } finally { $("pal").hidden = true; }
  s.done();
});

test("a paste with no field in focus reaches a new chat's composer too", () => {
  const d = newDraft();
  document.body.appendChild(d.e.host);
  st.open = d.key;
  const box = d.e.host.querySelector("textarea");
  paste(document.body, clipboard("first words"));
  assert.equal(box.value, "first words");
  st.open = null;
  d.e.host.remove();
  drafts.delete(d.id);
});

test("closing the palette puts the caret back at the end of the composer", async () => {
  const s = focusedSeat();
  s.box.value = "half written";
  s.box.focus();
  s.box.setSelectionRange(2, 2);
  openPal();
  assert.ok(document.activeElement === $("pal-q"));
  closePal();
  await settle();
  assert.ok(document.activeElement === s.box);
  assert.equal(s.box.selectionStart, "half written".length);
  s.done();
});

test("closing the palette leaves the focus where a command put it", async () => {
  const s = focusedSeat();
  const elsewhere = document.createElement("input");
  document.body.appendChild(elsewhere);
  openPal();
  closePal();
  elsewhere.focus();
  await settle();
  assert.ok(document.activeElement === elsewhere);
  elsewhere.remove();
  s.done();
});
