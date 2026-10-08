import { test } from "node:test";
import assert from "node:assert/strict";
import { codexMcpName, codexServerToAdd, codexKnownServers } from "../lib/codex-mcp.mjs";

const HUB = JSON.stringify({ mcpServers: {
  figma: { type: "http", url: "https://mcp.figma.com/mcp" },
  "granola-meeting-recording": { type: "http", url: "https://mcp.granola.ai/mcp" },
  "acme-mysql": { command: "node", args: ["x"] },
} });

test("a remote server the card asks to log into is added to codex under its toml-safe name, once", () => {
  assert.deepEqual(codexServerToAdd(HUB, "granola_meeting_recording", []), { name: "granola_meeting_recording", url: "https://mcp.granola.ai/mcp" });
  assert.deepEqual(codexServerToAdd(HUB, "figma", []), { name: "figma", url: "https://mcp.figma.com/mcp" });
  assert.equal(codexServerToAdd(HUB, "figma", ["figma"]), null);
  assert.equal(codexServerToAdd(HUB, "acme_mysql", []), null);
  assert.equal(codexServerToAdd(HUB, "nope", []), null);
  assert.equal(codexServerToAdd("{", "figma", []), null);
});

test("the names codex already knows come from its own list", () => {
  assert.deepEqual(codexKnownServers(JSON.stringify([{ name: "figma" }, { name: "hive" }])), ["figma", "hive"]);
  assert.deepEqual(codexKnownServers("junk"), []);
  assert.equal(codexMcpName("super-postgresql"), "super_postgresql");
});
