import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";
await views();
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");

test("a message another chat wrote lands as a peer bubble under its banner, with its cid", () => {
  const e = getStructured({ name: "peer-say", where: "local", agent: "claude" });
  document.body.appendChild(e.host);
  svEvent(e, { type: "user", subtype: "say", from: "outro-chat", cid: "c1", message: { content: [{ type: "text", text: "Acordando este assento" }] } });
  const [banner, bubble] = e.conv.blocks.slice(-2);
  assert.equal(banner.kind, "peer");
  assert.equal(bubble.kind, "bubble");
  assert.equal(bubble.peer, true);
  assert.equal(bubble.dataset.cid, "c1");
});
