import { test } from "node:test";
import assert from "node:assert/strict";
import { machineNeeds } from "../lib/providers.mjs";

const seatAgent = { name: "claude", forSeats: true };

test("an agent signed in through the app is enough, even with no claude on the PATH the app was started with", () => {
  assert.equal(machineNeeds(seatAgent, { agentSignedIn: true }), false,
    "the machine step asks to install claude when the signed-in claude is the one the app carries");
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
