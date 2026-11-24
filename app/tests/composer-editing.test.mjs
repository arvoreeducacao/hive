import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { drafts, newDraft } = await app("draft-seat");
const { codeBlockAt, fenceEnter, fenceTab } = await app("composer-fences");
const { listContinuation, listIndent, listOutdent } = await app("composer-lists");
const { enterEdit, tabEdit } = await app("composer-editing");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, data: { models: [] } }) });

const applied = (value, edit) => value.slice(0, edit.start) + edit.text + value.slice(edit.end);

let seq = 0;

function seat(agent = "claude") {
  const e = getStructured({ name: `keys-${++seq}`, where: "local" });
  e.agent = agent;
  document.body.appendChild(e.host);
  const sent = [];
  e.ws = { readyState: 1, send: (line) => {
    const cmd = JSON.parse(line);
    sent.push(cmd);
    queueMicrotask(() => e.pending.get(cmd.cid)?.({ ok: true }));
  } };
  return { e, sent, box: e.host.querySelector(".sv-composer textarea") };
}

function put(box, text, start = text.length, end = start) {
  box.value = text;
  box.setSelectionRange(start, end);
}

function press(box, key, mods = {}) {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  box.dispatchEvent(ev);
  return ev;
}

const settle = () => new Promise((go) => setTimeout(go, 5));

test("enter on a fence line opens the block instead of sending", () => {
  assert.deepEqual(fenceEnter("```ts", 5), { start: 5, end: 5, text: "\n", selection: [6, 6] });
  assert.equal(fenceEnter("```ts", 3), null, "the caret has to sit at the end of the fence line");
  assert.equal(fenceEnter("look ```", 8), null, "a fence in the middle of a sentence is just text");
  assert.equal(fenceEnter("```a`b", 6), null, "a backtick fence whose language holds a backtick is not a fence");
});

test("inside an unclosed block, enter breaks the line and keeps the indent", () => {
  const said = "```js\nif (a) {\n  call()";
  assert.ok(codeBlockAt(said, said.length));
  assert.deepEqual(fenceEnter(said, said.length), { start: said.length, end: said.length, text: "\n  ", selection: [said.length + 3, said.length + 3] });
  assert.equal(applied("```\ncode", fenceEnter("```\ncode", 8)), "```\ncode\n");
  assert.equal(codeBlockAt("```\ncode\n```\nafter", 18), null, "after the closing fence the text is prose again");
});

test("a closing fence and enter, or two blank lines at the end, leave the block", () => {
  const closed = "```\ncode\n```";
  assert.equal(applied(closed, fenceEnter(closed, closed.length)), "```\ncode\n```\n");
  const open = "```\ncode\n\n";
  const leave = fenceEnter(open, open.length);
  assert.equal(applied(open, leave), "```\ncode\n```\n", "the blank lines go and the block is closed for the prose after it");
  assert.deepEqual(leave.selection, [13, 13]);
  const once = "```\ncode\n";
  assert.equal(applied(once, fenceEnter(once, once.length)), "```\ncode\n\n", "one empty line is still code");
  const middle = "```\ncode\n\n\n```\nrest";
  assert.equal(applied(middle, fenceEnter(middle, 10)), "```\ncode\n```\n\nrest", "a block closed below gets a fresh line after its fence");
});

test("tab and shift+tab indent and outdent every line the selection touches", () => {
  const said = "```\na\n\nb";
  const indented = fenceTab(said, 4, said.length);
  assert.equal(applied(said, indented), "```\n  a\n\n  b", "empty lines stay empty");
  assert.deepEqual(indented.selection, [6, 12]);
  const nested = "```\n  a\n\tb\n c";
  assert.equal(applied(nested, fenceTab(nested, 4, nested.length, true)), "```\na\nb\nc", "two spaces, else a tab, else one space");
  assert.equal(applied("```\nab", fenceTab("```\nab", 5)), "```\na  b", "a caret takes two spaces where it is");
  assert.deepEqual(fenceTab("```\nab", 5, 5, true), { consumed: true }, "nothing to outdent still keeps the key");
  assert.equal(fenceTab("plain", 2, 2), null);
});

test("shift+enter continues a task unchecked and renumbers the items after it", () => {
  assert.equal(applied("- [x] done", listContinuation("- [x] done", 10)), "- [x] done\n- [ ] ");
  const numbered = "1. a\n2. b\n3. c";
  assert.equal(applied(numbered, listContinuation(numbered, 4)), "1. a\n2. \n3. b\n4. c");
  assert.equal(applied("09. x", listContinuation("09. x", 5)), "09. x\n10. ");
  assert.equal(applied("- one", listContinuation("- one", 5)), "- one\n- ");
  assert.equal(applied("  3) three", listContinuation("  3) three", 10)), "  3) three\n  4) ");
  assert.equal(applied("- one\n- ", listContinuation("- one\n- ", 8)), "- one\n", "an empty item ends the list");
  assert.equal(applied("- a\n  - ", listContinuation("- a\n  - ", 8)), "- a\n- ", "an empty nested item moves out one level");
  assert.equal(listContinuation("just text", 9), null);
  assert.equal(listContinuation("- one", 1), null, "the caret before the marker is a plain newline");
  assert.equal(enterEdit("- one", 2, 5, true), null, "a selection is a plain newline");
});

test("tab nests an item under the one above and shift+tab brings it back", () => {
  assert.equal(applied("- a\n- b", listIndent("- a\n- b", 7)), "- a\n  - b");
  assert.equal(applied("1. a\n2. b", listIndent("1. a\n2. b", 9)), "1. a\n   1. b", "a nested number starts over");
  assert.equal(applied("- a", listIndent("- a", 3)), "  - a", "the first item just takes two spaces");
  assert.equal(applied("- a\n  - b", listOutdent("- a\n  - b", 9)), "- a\n- b");
  const nested = "1. a\n   1. b\n2. c";
  assert.equal(applied(nested, listOutdent(nested, 12)), "1. a\n2. b\n3. c", "coming back out renumbers the parent's list");
  assert.equal(listOutdent("- a", 3), null);
  assert.deepEqual(tabEdit("- a", 3, 3, true), { consumed: true }, "shift+tab on a list line is the list's, even with nothing to outdent");
  assert.equal(tabEdit("words", 3, 3, true), null);
});

test("in a chat, enter inside a code block writes a line and never sends", async () => {
  const { e, sent, box } = seat();
  put(box, "```\nconst a = 1");
  const ev = press(box, "Enter");
  await settle();
  assert.ok(ev.defaultPrevented);
  assert.equal(box.value, "```\nconst a = 1\n");
  assert.equal(sent.filter((cmd) => cmd.type === "say").length, 0, "nothing went to the driver");
  put(box, "```\nconst a = 1\n```\n");
  press(box, "Enter");
  await settle();
  assert.equal(sent.filter((cmd) => cmd.type === "say").length, 1, "outside the block enter sends again");
  e.host.remove();
});

test("in a claude chat, shift+tab on a list line outdents instead of switching plan mode", async () => {
  const { e, sent, box } = seat("claude");
  put(box, "- a\n  - b");
  const ev = press(box, "Tab", { shiftKey: true });
  await settle();
  assert.ok(ev.defaultPrevented);
  assert.equal(box.value, "- a\n- b");
  assert.equal(sent.length, 0, "the plan mode was not touched");
  put(box, "plain words");
  press(box, "Tab", { shiftKey: true });
  await settle();
  assert.deepEqual(sent.map((cmd) => cmd.op), ["setMode"], "off a list, shift+tab still switches plan mode");
  e.host.remove();
});

test("tab in a chat nests the list item and leaves focus in the box", () => {
  const { e, box } = seat();
  put(box, "- a\n- b");
  const ev = press(box, "Tab");
  assert.ok(ev.defaultPrevented);
  assert.equal(box.value, "- a\n  - b");
  e.host.remove();
});

test("the new-chat composer keeps the same code and list keys", () => {
  const d = newDraft();
  document.body.appendChild(d.e.host);
  const box = d.e.host.querySelector("textarea");
  put(box, "```\nx");
  const ev = press(box, "Enter");
  assert.ok(ev.defaultPrevented);
  assert.equal(box.value, "```\nx\n");
  assert.ok(drafts.has(d.id), "the chat did not open");
  put(box, "1. a\n2. b");
  press(box, "Enter", { shiftKey: true });
  assert.equal(box.value, "1. a\n2. b\n3. ");
  put(box, "- a\n- b");
  press(box, "Tab");
  assert.equal(box.value, "- a\n  - b");
  d.e.host.remove();
  drafts.delete(d.id);
});
