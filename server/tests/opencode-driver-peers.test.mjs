import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveEnv } from "../engine/opencode-server.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/opencode-driver.mjs"), "utf8");
const cut = (from, to) => {
  const a = driver.indexOf(from);
  assert.ok(a >= 0, `${from} is not in opencode-driver.mjs`);
  const b = driver.indexOf(to, a);
  assert.ok(b > a, `${to} does not follow ${from}`);
  return driver.slice(a, b);
};

test("the seat's own tools and the hub's gateway servers reach opencode through the serve config env", () => {
  const out = serveEnv({
    seat: "orca", base: "/home/me/.hive", password: "pw",
    gateway: { port: 4671, servers: ["linear", "slack-advanced"] },
    remote: [{ name: "metrics", url: "https://metrics.example.test/mcp", headers: { Authorization: "Bearer ${METRICS_TOKEN}" } }],
    env: { HIVE_MCP_GATEWAY_TOKEN: "gw-secret", METRICS_TOKEN: "sz-secret" },
  });
  assert.equal(out.OPENCODE_SERVER_PASSWORD, "pw");
  const parsed = JSON.parse(out.OPENCODE_CONFIG_CONTENT);
  assert.equal(parsed.mcp.hive.environment.HIVE_SEAT, "orca");
  assert.equal(parsed.mcp.hub.url, "http://127.0.0.1:4671/mcp/hub");
  assert.equal(parsed.mcp.hub.headers.Authorization, "Bearer gw-secret");
  assert.equal(parsed.mcp.metrics.headers.Authorization, "Bearer sz-secret");
  assert.equal(serveEnv({}).OPENCODE_CONFIG_CONTENT, undefined, "with nothing to hand over there is no config to force on the person");
});

test("the driver starts the gateway and hands each server the config env plus a fresh password", () => {
  assert.match(driver, /const gateway = await ensureGateway\(\{ hub: hubFor\(cwd\) \}\)/);
  assert.match(driver, /subtype: "mcp_gateway"/);
  assert.match(driver, /const gatewayLink = gateway\.ok \? \{ port: gateway\.port, servers: hubServers\(hubFor\(cwd\)\), hub: gateway\.hub \} : null;/);
  const open = cut("async function openServer()", "function startStream(");
  assert.match(open, /const password = newPassword\(\);/);
  assert.match(open, /serveEnv\(\{ seat: name, base, gateway: gatewayLink, remote: remoteLink, password, env: childEnv \}\)/);
});

test("a message from a peer arrives with the hive header, and an expected answer is consumed instead of queued", () => {
  const say = cut('if (cmd.type === "say") {', 'if (cmd.type === "expect") {');
  assert.match(say, /if \(expecting\.take\(from, \{ text, images, side: cmd\.side \}\)\) \{\n\s+emit\(sayEvent\(text, images, cmd\.cid, from, true\)\);\n\s+return reply\(\{ ok: true, consumed: true \}\);/);
  assert.match(say, /text: from \? peerSayText\(from, text, cmd\.side\) : text/);
  const expect = cut('if (cmd.type === "expect") {', 'if (cmd.type === "unsay") {');
  assert.match(expect, /expecting\.expect\(from, cmd\.wait_ms\)/);
  assert.match(expect, /if \(cmd\.type === "collect"\)/);
  assert.match(expect, /return reply\(\{ ok: true, seq \}\)/, "ask() scans from the seq the expect reply hands back");
  assert.match(expect, /if \(cmd\.type === "unexpect"\)/);
  const state = cut('if (cmd.type === "state") {', 'if (cmd.type === "control") {');
  for (const field of ["side", "expecting: expecting.waitingOn()"]) assert.ok(state.includes(field), `state does not carry ${field}`);
});

test("the seat introduces itself once, before the first thing it is told, and remembers having done so", () => {
  assert.match(driver, /let preambleSaid = !!loadedMeta\.preamble_said;/);
  const pre = cut("function withPreamble(text) {", "function hubServers(");
  assert.match(pre, /persistSession\(\{ preamble_said: true \}\)/);
  assert.match(pre, /seatPreamble\(name, side\)/);
  assert.match(driver, /text: withPreamble\(item\.text\)/);
});

test("a question blocks the turn, the answer op settles it, and exactly one closer is emitted", () => {
  const ask = cut("async function askTheDev(p) {", "function dismissQuestions(");
  assert.match(ask, /emit\(\{ type: "driver", subtype: "question", id, questions: asked\.questions \}\)/);
  assert.match(ask, /pendingQuestions\.set\(id, \{ resolve, questions: asked\.questions \}\)/);
  assert.match(ask, /subtype: "question_dismissed"/);
  assert.match(ask, /subtype: "question_answered"/);
  assert.match(ask, /subtype: "question_failed"/);
  const answer = cut('if (cmd.type === "answer") {', 'if (cmd.type === "interrupt") {');
  assert.match(answer, /pendingQuestions\.get\(cmd\.id\)/);
  assert.match(answer, /waiting\.resolve\(\{ answers: cmd\.answers \}\)/);
  assert.match(answer, /no pending question \$\{cmd\.id\}/);
});

test("the driver keeps the hive's autocompact ceiling and compacts on its own at it", () => {
  assert.match(driver, /const autocompactAt = autocompactTokens\(arg\("--autocompact"\)\);/);
  const ceiling = cut("function compactAtTheCeiling()", "async function interruptTurn");
  assert.match(ceiling, /ctx\.contextTokens < autocompactAt/);
  assert.match(ceiling, /compactNow\("ceiling"\)/);
});
