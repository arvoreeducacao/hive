import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { opencodeMcpConfig, agents } from "../engine/agents.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/turn-driver.mjs"), "utf8");
const cut = (from, to) => {
  const a = driver.indexOf(from);
  assert.ok(a >= 0, `${from} is not in turn-driver.mjs`);
  const b = driver.indexOf(to, a);
  assert.ok(b > a, `${to} does not follow ${from}`);
  return driver.slice(a, b);
};

test("opencode is handed the hive's own tools and the hub's gateway servers through its config env", () => {
  const content = opencodeMcpConfig({
    seat: "orca", base: "/home/me/.hive", peerMcp: "/app/server/peer/peer-mcp.mjs",
    gateway: { port: 4671, servers: ["linear", "slack-advanced"] },
    remote: [{ name: "metrics", url: "https://metrics.example.test/mcp", headers: { Authorization: "Bearer ${METRICS_TOKEN}" } }],
    env: { HIVE_MCP_GATEWAY_TOKEN: "gw-secret", METRICS_TOKEN: "sz-secret" }
  });
  const parsed = JSON.parse(content);
  assert.deepEqual(parsed.mcp.hive, { type: "local", command: [process.execPath, "/app/server/peer/peer-mcp.mjs"], environment: { HIVE_SEAT: "orca", HIVE_STATE_DIR: "/home/me/.hive" }, enabled: true });
  assert.deepEqual(parsed.mcp.hub, { type: "remote", url: "http://127.0.0.1:4671/mcp/hub", enabled: true, headers: { Authorization: "Bearer gw-secret" } });
  assert.deepEqual(parsed.mcp.metrics, { type: "remote", url: "https://metrics.example.test/mcp", enabled: true, headers: { Authorization: "Bearer sz-secret" } });
  assert.equal(opencodeMcpConfig({}), "", "with nothing to hand over there is no config to force on the person");
  const digit = JSON.parse(opencodeMcpConfig({ gateway: { port: 4671, servers: ["360dialog"], hub: false }, remote: [{ name: "360remote", url: "https://x.test/mcp" }], env: {} }));
  assert.equal(digit.mcp["360dialog"], undefined, "a server named with a leading digit would make every tool name start with a digit, which the model provider rejects");
  assert.equal(digit.mcp.mcp_360dialog.url, "http://127.0.0.1:4671/mcp/360dialog", "the sanitised key still routes to the real server through the gateway path");
  assert.equal(digit.mcp.mcp_360remote.url, "https://x.test/mcp");
  assert.deepEqual(agents.opencode.turnEnv({ seat: "orca", base: "/b", peerMcp: "/p.mjs" }), { OPENCODE_CONFIG_CONTENT: opencodeMcpConfig({ seat: "orca", base: "/b", peerMcp: "/p.mjs" }) });
  assert.deepEqual(agents.opencode.turnEnv({}), {});
});

test("the turn driver starts the gateway and runs every turn with the agent's config env", () => {
  assert.match(driver, /const gateway = await ensureGateway\(\{ hub: hubFor\(cwd\) \}\)/);
  assert.match(driver, /subtype: "mcp_gateway"/);
  assert.match(driver, /return \{ \.\.\.inherited, \.\.\.providerEnv\(agentName, accountDir\), \.\.\.\(agent\.turnEnv \? agent\.turnEnv\(\{ seat: name, base, peerMcp: PEER_MCP, gateway: gatewayLink, remote: hubRemoteServers\(hubFor\(cwd\)\) \}\) : \{\}\) \};/);
  const run = cut("function runTurn(", "child.stdout.on");
  assert.match(run, /spawn\(agent\.binary, args, \{ cwd, env: turnEnv,/, "the turn runs without the config env, so opencode has no hive tools");
});

test("a message from a peer arrives with the hive header, and an expected answer is consumed instead of queued", () => {
  const say = cut('if (cmd.type === "say") {', 'if (cmd.type === "expect") {');
  assert.match(say, /if \(expecting\.take\(from, \{ text: said, images, side: cmd\.side \}\)\) \{\n\s+emit\(sayEvent\(said, images, cmd\.cid, from, true\)\);\n\s+return reply\(\{ ok: true, consumed: true \}\);/);
  assert.match(say, /text: from \? peerSayText\(from, said, cmd\.side\) : said/);
  assert.match(say, /return reply\(\{ ok: true, queued \}\)/, "the app cannot tell a queued message from one that entered the turn");
  const expect = cut('if (cmd.type === "expect") {', 'if (cmd.type === "unsay") {');
  assert.match(expect, /expecting\.expect\(from, cmd\.wait_ms\)/);
  assert.match(expect, /if \(cmd\.type === "collect"\)/);
  assert.match(expect, /if \(cmd\.type === "unexpect"\)/);
  const state = cut('if (cmd.type === "state") {', 'if (cmd.type === "control") {');
  for (const field of ["side", "expecting: expecting.waitingOn()"]) assert.ok(state.includes(field), `state does not carry ${field}`);
});

test("the seat introduces itself once, before the first thing it is told, and remembers having done so", () => {
  assert.match(driver, /let preambleSaid = !!loadedMeta\.preamble_said;/);
  const pre = cut("function withPreamble(text) {", "function runTurn(");
  assert.match(pre, /persistSession\(\{ preamble_said: true \}\)/);
  assert.match(pre, /seatPreamble\(name, side\)/);
  const run = cut("function runTurn(", "child.stdout.on");
  assert.match(run, /text: withPreamble\(inlineImageMarks\(turn\.text, turn\.images\)\)/);
});

test("the ceiling is taken from the command line and answered honestly: this agent compacts on its own", () => {
  assert.match(driver, /const autocompactAt = autocompactTokens\(arg\("--autocompact"\)\);/);
  assert.match(driver, /if \(autocompactAt\) \{\n\s+emit\(\{ type: "driver", subtype: "warning", message: `\$\{agent\.label\} compacts its context by its own rules/);
});
