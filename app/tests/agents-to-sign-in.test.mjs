import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsToSignIn, machineNeeds } from "../lib/providers.mjs";

const provider = (id, more = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), installed: true, enabled: true, ready: false, why: "", accounts: [], ...more });

test("the first run offers a sign-in for every agent this machine has, and only those", () => {
  const rows = agentsToSignIn([
    provider("claude", { ready: true, accounts: [{ name: "default", loggedIn: true, email: "ada@example.com" }] }),
    provider("codex"),
    provider("kimi", { installed: false }),
    provider("cursor", { enabled: false })
  ]);
  assert.deepEqual(rows.map((one) => one.id), ["claude", "codex"]);
  assert.deepEqual(rows[0], { id: "claude", name: "Claude", ready: true, who: "ada@example.com", why: "" });
  assert.equal(rows[1].ready, false);
});

test("with no agent installed there is nothing to sign in to", () => {
  assert.deepEqual(agentsToSignIn([provider("claude", { installed: false })]), []);
  assert.deepEqual(agentsToSignIn(undefined), []);
});

const seatAgent = { name: "claude", forSeats: true };

test("an agent signed in through the app is enough, even with no claude on the PATH the app was started with", () => {
  assert.equal(machineNeeds(seatAgent, { agentSignedIn: true }), false,
    "the machine step stays on Check again with every row green when the signed-in claude is the bundled one");
  assert.equal(machineNeeds(seatAgent, { anotherAgentHere: true }), false);
  assert.equal(machineNeeds(seatAgent, {}), true, "a machine with no agent signed in and none installed is not told what to install");
});

test("the other tools keep their own rule", () => {
  assert.equal(machineNeeds({ name: "tmux", posixOnly: true }, { platform: "win32", agentSignedIn: true }), false);
  assert.equal(machineNeeds({ name: "tmux", posixOnly: true }, { platform: "darwin", agentSignedIn: true }), true);
  assert.equal(machineNeeds({ name: "kubectl", forCluster: true }, { wantsCluster: true, agentSignedIn: true }), true);
  assert.equal(machineNeeds({ name: "kubectl", forCluster: true }, { wantsCluster: false }), false);
  assert.equal(machineNeeds({ name: "gh" }, { agentSignedIn: true }), true);
});
