import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTEXT_USAGE_ENV, cleanPatch, contextUsageEnv } from "../lib/config.mjs";
import { NATIVE_COMMAND_NAMES, isNativeCommand } from "../assets/slash-command.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

test("a chat is told how full it is only when the person turns it on", () => {
  assert.equal(CONTEXT_USAGE_ENV, "CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT");
  assert.deepEqual(contextUsageEnv(undefined), {});
  assert.deepEqual(contextUsageEnv({}), {});
  assert.deepEqual(contextUsageEnv({ contextUsage: false }), {});
  assert.deepEqual(contextUsageEnv({ contextUsage: true }), { [CONTEXT_USAGE_ENV]: "1" });
});

test("the setting takes true or false and turns the rest away", () => {
  assert.equal(cleanPatch({ contextUsage: true }).clean.contextUsage, true);
  assert.equal(cleanPatch({ contextUsage: false }).clean.contextUsage, false);
  const { clean, problems } = cleanPatch({ contextUsage: "yes" });
  assert.equal(clean.contextUsage, false);
  assert.deepEqual(problems, ["patch: contextUsage should be true or false"]);
});

test("the setting reaches every local chat through the environment they inherit, and leaves it when turned off", () => {
  const seatEnv = server.slice(server.indexOf("async function hubSeatEnv()"), server.indexOf("async function hubEnvIntoTmux()"));
  assert.match(seatEnv, /contextUsageEnv\(\(await readConfig\(\)\)\.config\)/);
  assert.match(seatEnv, /catch \{ return tuning; \}/);
  const intoTmux = server.slice(server.indexOf("async function hubEnvIntoTmux()"), server.indexOf("const AUTOPUSH_HERE"));
  assert.match(intoTmux, /set-environment -gu \$\{CONTEXT_USAGE_ENV\}/);
});

test("/fresh is the seat's own command, so it never travels to the session as words", () => {
  assert.ok(NATIVE_COMMAND_NAMES.includes("fresh"));
  assert.equal(isNativeCommand("fresh"), true);
});
