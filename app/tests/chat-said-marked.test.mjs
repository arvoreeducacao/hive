import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";
import { markedSaid } from "../assets/said-lists.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvLine, svConvSaid, svConvSeed, svConvFlushAll } = await app("conversation-model");
const { structPool } = await app("structured-seats");
const { needleOf, quoteLines, quotedBlock } = await app("quote-jump");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

function seat(name) {
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  return e;
}

function drop(e, name) {
  e.convView.dispose();
  structPool.delete(name);
}

test("only a message that really uses markdown is drawn as markdown", () => {
  for (const said of ["run `npm test`", "**this** matters", "```sh\nls\n```", "## plan", "| a | b |\n| --- | --- |\n| 1 | 2 |", "see [the PR](https://github.com/x/y/pull/1)", "~~not~~"]) {
    assert.equal(markedSaid(said), true, said);
  }
  for (const said of ["hi, all good?", "- one\n- two", "snake_case_name and *maybe*", "#3 and @file.ts", "/compact `now`", "costs 5 * 3"]) {
    assert.equal(markedSaid(said), false, said);
  }
});

test("a sent message with code, bold and a table shows them, and keeps its chips and quotes", () => {
  const name = "marked-1";
  const e = seat(name);
  svConvLine(e, "sv-user", "> the excerpt\n\n**The editor** runs `npm test` on [Image #1]\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```sh\nls -la\n```");
  svConvLine(e, "sv-user", "nothing special\n- just a list");
  const [marked, plain] = (svConvFlushAll(), e.scroll).querySelectorAll(".sv-user");
  const body = marked.querySelector(".sv-said-body .sv-said-md.md");
  assert.ok(body, "the markdown sits inside the said body");
  assert.equal(body.querySelector("b")?.textContent, "The editor");
  assert.equal(body.querySelector("p code")?.textContent, "npm test");
  assert.equal(body.querySelectorAll("table td").length, 2);
  assert.equal(body.querySelector(".md-codebox[data-lang=sh] pre")?.textContent, "ls -la");
  assert.equal(body.querySelector(".ctx-chip[data-kind=image]")?.textContent, "Image #1");
  assert.ok(marked.querySelector(".sv-said-quote[role=button]"), "the quote is a way back to the answer");
  assert.equal(plain.querySelector(".sv-said-md"), null, "a plain message keeps the plain drawing");
  assert.equal(plain.querySelector("ul.said-list > li")?.textContent, "just a list");
  drop(e, name);
});

test("a chip mark inside code stays code", () => {
  const name = "marked-2";
  const e = seat(name);
  svConvLine(e, "sv-user", "this `[Image #1]` is text");
  const bubble = (svConvFlushAll(), e.scroll).querySelector(".sv-user");
  assert.equal(bubble.querySelector("code")?.textContent, "[Image #1]");
  assert.equal(bubble.querySelector(".ctx-chip"), null);
  drop(e, name);
});

test("the quote finds the nearest earlier block that says its longest line", () => {
  assert.deepEqual(quoteLines("  first   line\n\n second \n"), ["first line", "second"]);
  assert.equal(needleOf(["a", "the longest one", "mid"]), "the longest one");
  const name = "quote-1";
  const e = seat(name);
  svConvSaid(e, "an older answer that says **the same words** too");
  svConvLine(e, "sv-user", "go on");
  svConvSaid(e, "the newer answer says **the same words** here");
  svConvLine(e, "sv-user", "> the same words\n\nwhy?");
  svConvFlushAll();
  const blocks = e.conv.blocks;
  const asked = blocks.findLastIndex((one) => one.kind === "bubble");
  assert.ok(quotedBlock(blocks, asked, "the same words") === blocks[2], "the closest answer above wins");
  assert.ok(quotedBlock(blocks, 2, "the same words") === blocks[0]);
  assert.equal(quotedBlock(blocks, asked, "nothing like this"), null);
  drop(e, name);
});

test("the code block buttons answer inside a chat that keeps its clicks to itself", async () => {
  await app("markdown-rich");
  const { renderMarkdown } = await import("../assets/markdown.mjs");
  const host = document.createElement("div");
  host.addEventListener("click", (ev) => ev.stopPropagation());
  host.innerHTML = renderMarkdown("```sh\nls\n```");
  document.body.append(host);
  const box = host.querySelector(".md-codebox");
  box.querySelector(".md-wrap").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(box.dataset.wrap, "false");
  host.remove();
});
