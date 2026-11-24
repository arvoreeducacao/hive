import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app } from "./dom.mjs";

const { renderMarkdownBlocks } = await app("core");
const hive = await app("conversation-model");

const seat = () => ({
  name: "bruno", tag: "t", where: "local", at: Date.now(), atBottom: false,
  scroll: { scrollTop: 0, scrollHeight: 0 }, host: document.createElement("div"),
  tools: new Map(), subs: new Map(), conv: hive.svConvSeed(), convView: null, subsView: null
});

const SAY = "# t\n\n```js\nconst a = 1;\n```\n\n| a |\n|---|\n| 1 |\n\nfim **forte**";

test("the finished answer settles into the block it streamed in, keeping every part already drawn", () => {
  const e = seat();
  for (const one of SAY) {
    hive.svConvStream(e, one);
    hive.svConvDraftPaint(e);
  }
  const block = e.draft.block;
  const drawn = [...block.parts];
  assert.equal(hive.svConvSettle(e, SAY), block);
  assert.equal(block.streaming, false);
  assert.deepEqual(block.parts, renderMarkdownBlocks(SAY));
  assert.deepEqual(block.parts.slice(0, -1), drawn.slice(0, -1), "the closed blocks are the very strings on screen");
  assert.equal(e.conv.blocks.filter((one) => one.kind === "said").length, 1);
});

test("an answer that is not what was streamed takes a block of its own", () => {
  const e = seat();
  hive.svConvStream(e, "um rascunho");
  hive.svConvDraftPaint(e);
  assert.equal(hive.svConvSettle(e, "outra coisa"), null);
});

test("the seat settles the draft instead of dropping it when the text is the first thing the answer says", () => {
  const page = readFileSync(new URL("../src/app/chat-and-panes.js", import.meta.url), "utf8");
  const cut = page.slice(page.indexOf("function svAssistant"), page.indexOf("function svAssistant") + 1600);
  assert.match(cut, /svConvSettle\(e, said\.text\)/);
  assert.match(cut, /if \(e\.conv && !settled\) svConvDraftDrop\(e\)/);
});
