import test from "node:test";
import assert from "node:assert/strict";
import { mcpServersFor } from "../engine/kimi-acp.mjs";
import { gatewayMcpConfig } from "../engine/codex-app-server.mjs";
import { opencodeMcpConfig } from "../engine/agents.mjs";

test("all gateway adapters retain individual URLs while an older gateway is running", () => {
  const gateway = { port: 4671, servers: ["one-two", "second"], hub: false };
  const expected = ["http://127.0.0.1:4671/mcp/one-two", "http://127.0.0.1:4671/mcp/second"];
  assert.deepEqual(mcpServersFor({ gateway }).map((server) => server.url), expected);
  assert.deepEqual(Object.values(JSON.parse(opencodeMcpConfig({ gateway })).mcp).map((server) => server.url), expected);
  const config = gatewayMcpConfig(gateway.servers, gateway.port, gateway.hub);
  assert.equal(config.length, 2);
  assert.ok(config[0].includes('mcp_servers.one_two={url="' + expected[0] + '"'));
});

test("an upgraded empty gateway is still connected so servers added later can be discovered", () => {
  const gateway = { port: 4671, servers: [], hub: true };
  assert.equal(mcpServersFor({ gateway })[0].name, "hub");
  assert.ok(JSON.parse(opencodeMcpConfig({ gateway })).mcp.hub);
  assert.equal(gatewayMcpConfig([], 4671, true).length, 1);
});
