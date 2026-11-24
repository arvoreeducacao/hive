import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_COMPAT, agentCompat, compareVersions } from "../lib/agent-compat.mjs";

test("versions compare by their numbers, and a version with no numbers cannot be compared", () => {
  assert.equal(compareVersions("0.149.0", "0.159.2"), -1);
  assert.equal(compareVersions("2.1.10", "2.1.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("nightly", "1.0.0"), null);
});

test("a version below a known floor is flagged, with the recommendation and whether the latest fixes it", () => {
  assert.deepEqual(agentCompat("codex", "codex-cli 0.140.0", "0.159.2"), { status: "broken", version: "0.140.0", recommended: ">=0.159.0", latestFixes: true });
  assert.equal(agentCompat("codex", "0.140.0", "0.141.0").latestFixes, false);
  assert.equal(agentCompat("codex", "0.140.0", "").latestFixes, false);
});

test("a version at or above the floor, an unknown agent or an unreadable version says nothing", () => {
  assert.equal(agentCompat("codex", "0.149.0"), null);
  assert.equal(agentCompat("claude", "1.0.0"), null);
  assert.equal(agentCompat("codex", ""), null);
  assert.equal(agentCompat("codex", "dev build"), null);
});

test("a version with a prefix is read through the agent's pattern", () => {
  assert.equal(agentCompat("antigravity", "agy_acp_server_1.4.9").version, "1.4.9");
  assert.equal(agentCompat("antigravity", "agy_acp_server_1.5.2"), null);
});

test("the list lives in the code: every entry names a floor and a recommendation", () => {
  for (const [id, policy] of Object.entries(AGENT_COMPAT)) {
    assert.ok(policy.recommended, `${id} has no recommendation`);
    assert.ok(policy.ranges.length && policy.ranges.every((one) => compareVersions(one.below, "0.0.0") === 1), `${id} has a floor that is not a version`);
  }
});
