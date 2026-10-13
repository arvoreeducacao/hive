import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { drafts, newDraft } = await app("draft-seat");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { models: [] } }) });

function bench() {
  const d = newDraft();
  document.body.appendChild(d.e.host);
  return { d, box: d.e.host.querySelector("textarea"), ink: d.e.host.querySelector(".sv-ink"), composer: d.e.host.querySelector(".sv-composer") };
}

const shut = (b) => { b.d.e.host.remove(); drafts.delete(b.d.id); };

const type = (box, text) => {
  box.value = text;
  box.setSelectionRange(text.length, text.length);
  box.dispatchEvent(new Event("input", { bubbles: true }));
};

test("a new chat draws bullets and numbers the way an open chat does", () => {
  const b = bench();
  type(b.box, "- one\n1. two");
  assert.ok(b.composer.classList.contains("inked"), "the box hands the text to the ink layer");
  assert.equal(b.ink.querySelector(".ink-bullet")?.textContent, "-");
  assert.equal(b.ink.querySelector(".ink-num")?.textContent, "1.");
  type(b.box, "plain text");
  assert.ok(!b.composer.classList.contains("inked"), "without a list the box paints itself again");
  shut(b);
});

test("shift+enter in a new chat carries the list to the next line instead of opening the chat", () => {
  const b = bench();
  type(b.box, "- one");
  const ev = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
  b.box.dispatchEvent(ev);
  assert.ok(ev.defaultPrevented);
  assert.equal(b.box.value, "- one\n- ");
  assert.ok(drafts.has(b.d.id), "the chat did not open");
  shut(b);
});
