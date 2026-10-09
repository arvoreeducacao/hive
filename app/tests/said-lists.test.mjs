import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, views } from "./dom.mjs";
import { continueList, listMarks, saidPieces } from "../assets/said-lists.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvLine, svConvSeed, svConvFlushAll } = await app("conversation-model");
const { structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

test("a message with no list stays one piece of text, blank lines included", () => {
  assert.deepEqual(saidPieces("first\n\n  second"), [{ kind: "text", text: "first\n\n  second" }]);
});

test("dashes, stars and numbers become lists, and the words around them stay text", () => {
  assert.deepEqual(saidPieces("do this:\n- one\n* two\n\n1. three\n2) four\nthanks"), [
    { kind: "text", text: "do this:" },
    { kind: "ul", items: [{ text: "one" }, { text: "two" }] },
    { kind: "ol", items: [{ n: 1, text: "three" }, { n: 2, text: "four" }] },
    { kind: "text", text: "thanks" }
  ]);
});

test("a dash glued to a word or a year with a full stop is not a list", () => {
  assert.equal(saidPieces("-5 degrees\n2024. was the year").length, 1);
});

test("the box marks only the list markers", () => {
  assert.deepEqual(listMarks("hi\n- one\n  12. two"), [{ kind: "ul", start: 3, end: 4 }, { kind: "ol", start: 11, end: 14 }]);
});

test("shift+enter on a list item opens the next one", () => {
  assert.deepEqual(continueList("- one", 5), { from: 5, to: 5, text: "\n- " });
  assert.deepEqual(continueList("  3) three", 10), { from: 10, to: 10, text: "\n  4) " });
});

test("shift+enter on an empty item ends the list instead of adding another", () => {
  assert.deepEqual(continueList("- one\n- ", 8), { from: 6, to: 8, text: "" });
});

test("shift+enter outside a list, before the marker or over a selection is a plain newline", () => {
  assert.equal(continueList("just text", 9), null);
  assert.equal(continueList("- one", 1), null);
  assert.equal(continueList("- one", 2, 5), null);
});

test("a sent message draws its lists as lists and keeps the command and the quote", () => {
  const name = "lists-1";
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  svConvLine(e, "sv-user", "/compact now\n- first\n- second\n1. one");
  svConvLine(e, "sv-user", "> quoted\n\nwhat about:\n- this");
  const [plain, quoted] = (svConvFlushAll(), e.scroll).querySelectorAll(".sv-user");
  assert.equal(plain.querySelector(".said-cmd")?.textContent, "/compact");
  assert.deepEqual([...plain.querySelectorAll("ul.said-list > li")].map((li) => li.textContent), ["first", "second"]);
  assert.equal(plain.querySelector("ol.said-list > li")?.textContent, "one");
  assert.ok(quoted.querySelector(".sv-said-quote"));
  assert.equal(quoted.querySelector(".sv-said-body ul.said-list > li")?.textContent, "this");
  e.convView.dispose();
  structPool.delete(name);
});

test("a link in a sent message can be clicked, and the punctuation after it stays text", () => {
  const name = "links-1";
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  const deck = "https://docs.google.com/presentation/d/1lGCIpm9umXTiwe37gaUDkHLOvF2JLraWQfPYjIkD2p4/edit?usp=sharing";
  svConvLine(e, "sv-user", `/compact see ${deck}.\n- the PR (https://github.com/acme/hive/pull/1125)\n[Image #1] and http:// alone`);
  const bubble = (svConvFlushAll(), e.scroll).querySelector(".sv-user");
  const links = [...bubble.querySelectorAll("a[href]")];
  assert.deepEqual(links.map((a) => a.getAttribute("href")), [deck, "https://github.com/acme/hive/pull/1125"]);
  assert.equal(links[0].target, "_blank");
  assert.equal(links[0].nextSibling.nodeValue.startsWith("."), true);
  assert.equal(bubble.querySelector("ul.said-list > li").textContent, "the PR (https://github.com/acme/hive/pull/1125)");
  assert.equal(bubble.querySelector(".said-cmd")?.textContent, "/compact");
  assert.equal(bubble.querySelector(".said-img")?.textContent, "[Image #1]");
  assert.equal(links[1].dataset.here, "1", "a PR link opens inside the hive like the ones the AI writes");
  e.convView.dispose();
  structPool.delete(name);
});

test("every path that rewrites the box repaints the marked layer, or the old list stays painted over it", () => {
  const source = readFileSync(new URL("../src/app/chat-stretches.js", import.meta.url), "utf8");
  const writes = [...source.matchAll(/textarea\.value = /g)].map((m) => m.index);
  assert.ok(writes.length >= 6, "sending, the mirrored send, taking a queued message back, filling and recalling all write the box");
  for (const at of writes) {
    const block = source.slice(at, source.indexOf("\n  };", at));
    assert.match(block, /paintInk\(\)/, `no repaint after ${source.slice(at, at + 60)}`);
  }
});
