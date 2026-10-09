import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ceilingOf, peerCalls, toolsFor } from "../peer/peer-tools.mjs";
import { externalMcpCommand } from "../../app/routes/external-mcp.mjs";

test("an agent from outside the hive reads by default, can be let to operate, and never gets full", () => {
  assert.equal(ceilingOf({ HIVE_CLIENT: "terminal" }), "read");
  assert.equal(ceilingOf({ HIVE_CLIENT: "terminal", HIVE_CLIENT_CEILING: "operate" }), "operate");
  assert.equal(ceilingOf({ HIVE_CLIENT: "terminal", HIVE_CLIENT_CEILING: "full" }), "read");
  const names = toolsFor(ceilingOf({ HIVE_CLIENT: "terminal" })).map((tool) => tool.name);
  assert.ok(names.includes("peers") && names.includes("peek"));
  assert.ok(!names.includes("message") && !names.includes("spawn"));
});

test("an outside agent under read is refused a message, and one under operate is not turned away for having no seat", async () => {
  const base = mkdtempSync(join(tmpdir(), "ext-"));
  mkdirSync(join(base, "sessions"), { recursive: true });
  const reader = peerCalls({ HIVE_CLIENT: "terminal", HIVE_STATE_DIR: base, PATH: "" });
  assert.match((await reader.message({ seat: "x", text: "oi" })).content[0].text, /"read" ceiling/);
  const talker = peerCalls({ HIVE_CLIENT: "terminal", HIVE_CLIENT_CEILING: "operate", HIVE_STATE_DIR: base, PATH: "" });
  const said = (await talker.message({ seat: "x", text: "oi" })).content[0].text;
  assert.doesNotMatch(said, /has no name in the hive/);
});

test("the command to connect names the entry, the ceiling and the hive's state", () => {
  assert.equal(externalMcpCommand({ entry: "/a/peer-mcp.mjs", node: "/n/node", stateDir: "/h", ceiling: "operate" }), "claude mcp add hive -e HIVE_CLIENT=terminal -e HIVE_CLIENT_CEILING=operate -e HIVE_STATE_DIR=/h -- /n/node /a/peer-mcp.mjs");
});
