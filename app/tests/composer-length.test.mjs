import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { drafts, newDraft } = await app("draft-seat");
const { PROMPT_MAX_CHARS, promptExcess, tooLongSaid } = await app("composer-length");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

let seq = 0;
let spawned = 0;

globalThis.fetch = async (url) => {
  if (String(url).includes("/api/spawn")) spawned += 1;
  return { ok: true, json: async () => ({ ok: false, data: { models: [] } }) };
};

function seat() {
  const e = getStructured({ name: `long-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  const sent = [];
  e.ws = { readyState: 1, send: (line) => {
    const cmd = JSON.parse(line);
    sent.push(cmd.type);
    queueMicrotask(() => e.pending.get(cmd.cid)?.({ ok: true }));
  } };
  return { e, sent, box: e.host.querySelector(".sv-composer textarea") };
}

function type(box, text) {
  box.value = text;
  box.setSelectionRange(text.length, text.length);
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

const enter = (box) => box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
const settle = () => new Promise((go) => setTimeout(go, 5));
const alertOf = (host) => host.querySelector(".sv-composer .sv-too-long");

test("the limit counts the trimmed text and says the excess", () => {
  assert.equal(PROMPT_MAX_CHARS, 120000);
  assert.equal(promptExcess(`  ${"a".repeat(120000)}  `), 0);
  assert.equal(promptExcess("a".repeat(120002)), 2);
  assert.equal(tooLongSaid(1), `Prompt is 1 character over the ${(120000).toLocaleString()}-character limit. Shorten or split it before sending.`);
  assert.match(tooLongSaid(3), /3 characters over/);
});

test("a message over the limit stays in the box with the warning, which follows the edits", async () => {
  const { e, sent, box } = seat();
  type(box, "a".repeat(120001));
  enter(box);
  await settle();
  assert.deepEqual(sent, [], "nothing went out");
  assert.equal(box.value.length, 120001, "the words stay in the box");
  const alert = alertOf(e.host);
  assert.ok(alert, "the warning shows");
  assert.equal(alert.getAttribute("role"), "alert");
  assert.ok(alert.previousElementSibling === e.host.querySelector(".sv-well"), "it sits right under the text");
  assert.match(alert.textContent, /1 character over/);
  type(box, "a".repeat(120005));
  assert.match(alertOf(e.host).textContent, /5 characters over/);
  type(box, "short now");
  assert.equal(alertOf(e.host), null, "within the limit the warning goes away");
  enter(box);
  await settle();
  assert.deepEqual(sent, ["say"]);
  e.host.remove();
});

test("the warning does not show while typing, only after a send was refused", () => {
  const { e, box } = seat();
  type(box, "a".repeat(120010));
  assert.equal(alertOf(e.host), null);
  e.host.remove();
});

test("a new chat over the limit does not open", async () => {
  const d = newDraft();
  document.body.appendChild(d.e.host);
  const box = d.e.host.querySelector("textarea");
  type(box, "b".repeat(120003));
  enter(box);
  await settle();
  assert.equal(spawned, 0);
  assert.ok(drafts.has(d.id));
  assert.match(alertOf(d.e.host).textContent, /3 characters over/);
  type(box, "b");
  assert.equal(alertOf(d.e.host), null);
  d.e.host.remove();
  drafts.delete(d.id);
});
