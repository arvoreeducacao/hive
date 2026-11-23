import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chosenClaudeAsync, claudeVersionOfAsync } from "../engine/claude-binary.mjs";
import { seatClaudeOptions } from "../provider-catalog.mjs";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const choosing = (chosen) => async () => chosen;

test("the model list asks the machine claude when the seat would run it", async () => {
  const chosen = { path: "/home/u/.local/bin/claude", from: "machine", version: "2.1.330" };
  assert.deepEqual(await seatClaudeOptions({ builtin: "/sdk/claude", choose: choosing(chosen) }), { pathToClaudeCodeExecutable: "/home/u/.local/bin/claude" });
});

test("the model list asks the steady copy of the bundled claude when the seat would run that copy", async () => {
  const chosen = { path: "/cache/claude-agent-sdk-linux-x64-0.3.330/claude", from: "bundled", version: "2.1.330" };
  assert.deepEqual(await seatClaudeOptions({ builtin: "/sdk/claude", choose: choosing(chosen) }), { pathToClaudeCodeExecutable: chosen.path });
});

test("the model list leaves the sdk to its own claude when the seat would run that one", async () => {
  assert.deepEqual(await seatClaudeOptions({ builtin: "/sdk/claude", choose: choosing({ path: "/sdk/claude", from: "bundled", version: "2.1.330" }) }), {});
  assert.deepEqual(await seatClaudeOptions({ builtin: "", choose: choosing({ path: "", from: "machine", version: "" }) }), {});
});

test("the machine claude is weighed without holding the event loop", async () => {
  const env = { HIVE_CLAUDE: "" };
  let answered = false;
  const versionOf = (path) => new Promise((resolve) => setImmediate(() => { answered = true; resolve(path ? "2.1.330" : ""); }));
  const pending = chosenClaudeAsync({ env, builtin: "", machine: "/home/u/.local/bin/claude", versionOf });
  assert.equal(answered, false, "the version was read before the caller got the event loop back");
  assert.deepEqual(await pending, { path: "/home/u/.local/bin/claude", from: "machine", version: "2.1.330" });
});

test("the async version check reads the number, and a claude that fails answers nothing", async () => {
  const said = (wrong, out) => (_path, _args, _options, done) => setImmediate(() => done(wrong, out));
  assert.equal(await claudeVersionOfAsync("/c", said(null, "2.1.330 (Claude Code)\n")), "2.1.330");
  assert.equal(await claudeVersionOfAsync("/c", said(new Error("ENOENT"), "")), "");
  assert.equal(await claudeVersionOfAsync("", said(null, "2.1.330")), "");
});

test("the model list opens its session on the claude the seat would run", () => {
  const source = readFileSync(join(HERE, "provider-catalog.mjs"), "utf8");
  const weighed = source.indexOf("await seatClaudeOptions()");
  const session = source.indexOf("query({ prompt:");
  assert.ok(weighed > 0, "the catalog never asks which claude the seat runs");
  assert.ok(session > weighed, "the catalog opens its session before the binary is settled");
  assert.ok(source.slice(session, source.indexOf("\n", session)).includes("...seatClaude"), "the catalog session ignores the claude the seat runs");
});
