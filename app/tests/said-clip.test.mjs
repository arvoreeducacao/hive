import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvFlushAll, svConvLine, svConvSeed, svSaidClips } = await app("conversation-model");
const { structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let seq = 0;

function pane() {
  const e = getStructured({ name: `clip-${++seq}`, where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  return e;
}

const shut = (e) => { e.convView.dispose(); structPool.delete(e.name); };
const bubbleOf = (e) => (svConvFlushAll(), e.scroll.querySelector(".sv-user"));

test("a message over eight lines or 600 characters is clipped, anything shorter is not", () => {
  assert.equal(svSaidClips("one line"), false);
  assert.equal(svSaidClips(Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n")), false);
  assert.equal(svSaidClips(Array.from({ length: 9 }, (_, i) => `line ${i}`).join("\n")), true);
  assert.equal(svSaidClips("x".repeat(600)), false);
  assert.equal(svSaidClips("x".repeat(601)), true);
  assert.equal(svSaidClips(" \n".repeat(20)), false, "blank lines alone have nothing to hide");
});

test("a long message opens on Show full message and closes again on Show less", () => {
  const e = pane();
  svConvLine(e, "sv-user", Array.from({ length: 30 }, (_, i) => `step ${i + 1}`).join("\n"));
  const bubble = bubbleOf(e);
  const clip = bubble.querySelector(".sv-said-clip");
  const more = bubble.querySelector(".sv-said-more");
  assert.ok(clip, "the body sits inside the clip");
  assert.equal(clip.classList.contains("open"), false);
  assert.equal(more.textContent.trim(), "Show full message");
  assert.equal(more.getAttribute("aria-expanded"), "false");
  assert.match(clip.textContent, /step 30/, "the whole message is there, only hidden");

  more.click();
  assert.equal(clip.classList.contains("open"), true);
  assert.equal(more.textContent.trim(), "Show less");
  assert.equal(more.getAttribute("aria-expanded"), "true");

  more.click();
  assert.equal(clip.classList.contains("open"), false);
  assert.equal(more.textContent.trim(), "Show full message");
  shut(e);
});

test("an opened message stays open while the answer keeps arriving under it", () => {
  const e = pane();
  svConvLine(e, "sv-user", "x".repeat(900));
  bubbleOf(e).querySelector(".sv-said-more").click();
  svConvLine(e, "sv-user", "and one more thing");
  const first = bubbleOf(e);
  assert.equal(first.querySelector(".sv-said-clip").classList.contains("open"), true);
  assert.equal(first.querySelector(".sv-said-more").textContent.trim(), "Show less");
  shut(e);
});

test("a short message has no clip and no button", () => {
  const e = pane();
  svConvLine(e, "sv-user", "Add a test for the open-redirect case too.");
  const bubble = bubbleOf(e);
  assert.equal(bubble.querySelector(".sv-said-clip"), null);
  assert.equal(bubble.querySelector(".sv-said-more"), null);
  assert.match(bubble.textContent, /open-redirect/);
  shut(e);
});
