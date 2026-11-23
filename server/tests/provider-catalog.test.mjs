import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seatClaudeOptions } from "../provider-catalog.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the model list asks the machine claude when the seat would run it", () => {
  const chosen = { path: "/home/u/.local/bin/claude", from: "machine", version: "2.1.330" };
  assert.deepEqual(seatClaudeOptions({ builtin: "/sdk/claude", chosen }), { pathToClaudeCodeExecutable: "/home/u/.local/bin/claude" });
});

test("the model list asks the steady copy of the bundled claude when the seat would run that copy", () => {
  const chosen = { path: "/cache/claude-agent-sdk-linux-x64-0.3.330/claude", from: "bundled", version: "2.1.330" };
  assert.deepEqual(seatClaudeOptions({ builtin: "/sdk/claude", chosen }), { pathToClaudeCodeExecutable: chosen.path });
});

test("the model list leaves the sdk to its own claude when the seat would run that one", () => {
  assert.deepEqual(seatClaudeOptions({ builtin: "/sdk/claude", chosen: { path: "/sdk/claude", from: "bundled", version: "2.1.330" } }), {});
  assert.deepEqual(seatClaudeOptions({ builtin: "", chosen: { path: "", from: "machine", version: "" } }), {});
});

test("the model list opens its session on the claude the seat would run", () => {
  const source = readFileSync(join(HERE, "provider-catalog.mjs"), "utf8");
  const session = source.indexOf("query({ prompt:");
  assert.ok(session > 0, "provider-catalog.mjs no longer opens a claude session");
  assert.ok(source.indexOf("seatClaudeOptions()", session) > session, "the catalog session ignores the claude the seat runs");
});
