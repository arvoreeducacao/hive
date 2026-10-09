import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allows, narrowest, readCeiling, writeCeiling } from "../peer/ceilings.mjs";
import { PEER_TOOLS, TOOL_ACCESS, peerCalls, toolsFor } from "../peer/peer-tools.mjs";

test("every tool of the hive declares the access it needs, and nothing else is declared", () => {
  assert.deepEqual(PEER_TOOLS.map((tool) => tool.name).filter((name) => !TOOL_ACCESS[name]), []);
  assert.deepEqual(Object.keys(TOOL_ACCESS).filter((name) => !PEER_TOOLS.some((tool) => tool.name === name)), []);
});

test("a ceiling allows what is at or under it, and a child can only narrow its parent's", () => {
  assert.equal(allows("full", "full"), true);
  assert.equal(allows("operate", "full"), false);
  assert.equal(allows("operate", "read"), true);
  assert.equal(allows("read", "operate"), false);
  assert.equal(allows("", "full"), true);
  assert.equal(allows("full", "nonsense"), false);
  assert.equal(narrowest("full", "operate"), "operate");
  assert.equal(narrowest("read", "full"), "read");
  assert.equal(narrowest("operate", ""), "operate");
  assert.equal(narrowest(), "full");
});

test("the ceilings live per seat in the state dir, and full is the default", () => {
  const base = mkdtempSync(join(tmpdir(), "ceil-"));
  assert.equal(readCeiling(base, "a"), "full");
  writeCeiling(base, "a", "read");
  assert.equal(readCeiling(base, "a"), "read");
  writeCeiling(base, "a", "full");
  assert.equal(readCeiling(base, "a"), "full");
});

test("a chat under a read ceiling sees only the reading tools, and a call above it is refused", async () => {
  const base = mkdtempSync(join(tmpdir(), "ceil-"));
  writeCeiling(base, "olhador", "read");
  const names = toolsFor("read").map((tool) => tool.name);
  assert.ok(names.includes("peers"));
  assert.ok(!names.includes("message"));
  assert.ok(!names.includes("spawn"));
  assert.ok(toolsFor("operate").some((tool) => tool.name === "message"));
  assert.ok(!toolsFor("operate").some((tool) => tool.name === "publish"));
  const calls = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "olhador", PATH: "" });
  const said = await calls.spawn({ mission: "abre outro" });
  assert.equal(said.isError, true);
  assert.match(said.content[0].text, /"read" ceiling, and spawn needs "full"/);
  const sent = await calls.message({ seat: "x", text: "oi" });
  assert.match(sent.content[0].text, /"read" ceiling/);
});
