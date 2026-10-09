import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, views } from "./dom.mjs";

await views();

const { artifactLink } = await app("tool-face");
const { svConvTool, svConvToolLanded, svConvToolLink, svConvFlushAll } = await app("conversation-model");
const { getStructured } = await app("chat-stretches");

let seq = 0;

function card(tool, said) {
  const e = getStructured({ name: `artifact-${++seq}`, where: "local" });
  const use = `use-${seq}`;
  const block = svConvTool(e, { id: use, name: tool, input: {} }, false);
  const land = (text) => svConvToolLanded(e, { tool_use_id: use, is_error: false, content: text }, false);
  if (said !== undefined) land(said);
  const el = () => (svConvFlushAll(), e.scroll).querySelector(".sv-tool");
  return { e, block, land, el, slot: () => el().querySelector(".tlink"), links: () => [...el().querySelectorAll(".tlink a")] };
}

const PUBLISH = "Published Sinal de Vida\nhttps://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96\nversion 3";

test("a publish result gives the card its link", () => {
  assert.equal(artifactLink(PUBLISH), "https://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96");
});

test("the same url twice is still one link", () => {
  assert.equal(artifactLink(PUBLISH + "\n" + PUBLISH), "https://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96");
});

test("a listing carries no link — the row would have to pick one and lie", () => {
  const listing = "3 published artifacts (most recent first):\n"
    + "- Sinal de Vida — https://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96 — updated 2026-08-18\n"
    + "- Auditoria — https://claude.ai/code/artifact/0fa831d5-4175-4447-861e-0d9755a93f62 — updated 2026-08-17\n"
    + "- Falhas — https://claude.ai/code/artifact/dfe20da6-d9ed-45c6-94d4-e60486ce2f30 — updated 2026-08-13";
  assert.equal(artifactLink(listing), "");
});

test("another origin publishes just as well", () => {
  assert.equal(
    artifactLink("https://claude-ai.staging.ant.dev/code/artifact/abc-123"),
    "https://claude-ai.staging.ant.dev/code/artifact/abc-123"
  );
});

test("punctuation around the url stays out of it", () => {
  assert.equal(artifactLink("(https://claude.ai/code/artifact/abc-123)"), "https://claude.ai/code/artifact/abc-123");
});

test("a result without an artifact url has no link", () => {
  assert.equal(artifactLink("asset 4f2 saved to /tmp/4f2.png"), "");
  assert.equal(artifactLink(""), "");
  assert.equal(artifactLink(undefined), "");
});

test("the artifact card opens the page in the browser, not in the app", () => {
  const c = card("Artifact", PUBLISH);
  const links = c.links();
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute("href"), "https://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96");
  assert.equal(links[0].getAttribute("target"), "_blank");
  assert.equal(links[0].getAttribute("rel"), "noopener noreferrer");
});

test("a click on the chip does not also open the card underneath it", () => {
  const c = card("Artifact", PUBLISH);
  let reachedTheCard = 0;
  c.el().addEventListener("click", () => { reachedTheCard += 1; });
  c.links()[0].dispatchEvent(new dom.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(reachedTheCard, 0, "the click went through the chip and opened the card too");
});

test("another tool that happens to print an artifact url gets no chip", () => {
  const c = card("Bash", PUBLISH);
  assert.equal(c.block.link, null);
  assert.equal(c.links().length, 0);
});

test("a rerun clears the slot instead of stacking links", () => {
  const c = card("Artifact", PUBLISH);
  assert.equal(c.links().length, 1);
  c.land("nothing published this time");
  assert.equal(c.links().length, 0);
});

test("the link is read off the card alone, never off a slot the page may not have drawn yet", () => {
  assert.deepEqual(svConvToolLink({ tool: "Artifact" }, PUBLISH),
    { url: "https://claude.ai/code/artifact/84e1f98a-bdb9-40fc-82ad-c334bfc09a96", label: "open ↗" });
  assert.equal(svConvToolLink({ tool: "Bash" }, PUBLISH), null);
  assert.equal(svConvToolLink({}, PUBLISH), null);
  assert.equal(svConvToolLink({ tool: "Artifact" }, "nothing published this time"), null);
});
