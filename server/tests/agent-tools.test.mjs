import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentToolsFile, isDeviceTool, readAgentTools, shareAgentTools } from "../peer/agent-tools.mjs";
import { peerCalls, toolsFor } from "../peer/peer-tools.mjs";

const fresh = () => mkdtempSync(join(tmpdir(), "agent-tools-"));

test("with no file, agents keep the device tools, as today", () => {
  assert.deepEqual(readAgentTools(fresh()), { devices: true });
});

test("the app writes the switch only when it changes, and the peer reads it back", () => {
  const base = fresh();
  assert.equal(shareAgentTools(base, { devices: true, deviceAgents: false }), true);
  assert.deepEqual(readAgentTools(base), { devices: false });
  assert.equal(shareAgentTools(base, { devices: true, deviceAgents: false }), false, "the same answer is not written twice");
  assert.equal(shareAgentTools(base, { devices: false }), false, "devices off reads the same for agents: no tools");
  assert.equal(shareAgentTools(base, {}), true);
  assert.deepEqual(JSON.parse(readFileSync(agentToolsFile(base), "utf8")), { devices: true });
});

test("a chat opened with the switch off is not offered the device_ tools, and the rest stays", () => {
  const base = fresh();
  const env = { HIVE_STATE_DIR: base, HIVE_SEAT: "olhador", PATH: "" };
  assert.ok(toolsFor("full", env).some((tool) => tool.name === "device_open"));
  shareAgentTools(base, { deviceAgents: false });
  const names = toolsFor("full", env).map((tool) => tool.name);
  assert.equal(names.some(isDeviceTool), false);
  assert.ok(names.includes("browser_navigate"));
  assert.ok(names.includes("message"));
  shareAgentTools(base, {});
});

test("a chat that already holds the tools is refused while the switch is off", async () => {
  const base = fresh();
  shareAgentTools(base, { deviceAgents: false });
  const calls = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "olhador", PATH: "" });
  const said = await calls.device_screenshot({});
  assert.equal(said.isError, true);
  assert.match(said.content[0].text, /turned the device tools off/);
  shareAgentTools(base, {});
});
