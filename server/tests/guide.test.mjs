import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GUIDE_DIR, GUIDE_ORDER, answerGuide, parseTopic, readGuide } from "../peer/guide.mjs";
import { HIVE_INSTRUCTIONS, toolsFor } from "../peer/peer-tools.mjs";
import { buildPeerFacade } from "../gateway/gateway.mjs";
import { seatPreamble } from "../engine/protocol.mjs";

const SERVER = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(SERVER, "..");

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "hive-guide-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, `${name}.md`), body);
  return dir;
}

const MCP_TOPIC = "# MCP servers\n\nHow a chat gets its MCP servers.\n\n## Adding a server\n\nWrite it in the hub's .mcp.json and every new chat gets it.\n\n## The gateway\n\nThe gateway serves the hub's MCP servers to every chat on one port.\n";
const HUB_TOPIC = "# The hub\n\nThe folder every chat opens in.\n\n## What goes in it\n\nThe repositories, AGENTS.md and the .env the MCP servers read.\n";

test("with no argument the guide lists every topic, its title and the sentence that says what it covers", () => {
  const dir = fixture({ mcp: MCP_TOPIC, hub: HUB_TOPIC });
  try {
    const said = answerGuide({}, readGuide(dir));
    assert.match(said.text, /- hub: The hub\. The folder every chat opens in\./);
    assert.match(said.text, /- mcp: MCP servers\. How a chat gets its MCP servers\./);
    assert.ok(said.text.indexOf("- hub:") < said.text.indexOf("- mcp:"), "the topics come in the guide's own order, the hub before MCP");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a topic is read whole, and a name the guide does not have is answered with the names it has", () => {
  const topics = readGuide(fixture({ mcp: MCP_TOPIC, hub: HUB_TOPIC }));
  assert.equal(answerGuide({ topic: "MCP" }, topics).text, MCP_TOPIC.trim());
  assert.equal(answerGuide({ topic: "hu" }, topics).text, HUB_TOPIC.trim());
  const missing = answerGuide({ topic: "billing" }, topics);
  assert.match(missing.error, /no topic "billing"\. Topics: hub, mcp/);
});

test("a search returns the sections that hold every word first, each named by its topic", () => {
  const topics = readGuide(fixture({ mcp: MCP_TOPIC, hub: HUB_TOPIC }));
  const said = answerGuide({ search: "gateway port" }, topics).text;
  assert.match(said, /^\[mcp\] ## The gateway/);
  const loose = answerGuide({ search: ".env repositories" }, topics).text;
  assert.match(loose, /^\[hub\] ## What goes in it/);
  assert.match(answerGuide({ search: "kubernetes" }, topics).error, /nothing in the guide mentions kubernetes/);
  assert.match(answerGuide({ search: "a" }, topics).error, /at least one word/);
});

test("a build without the guide says so instead of answering with nothing", () => {
  const empty = mkdtempSync(join(tmpdir(), "hive-guide-empty-"));
  assert.match(answerGuide({}, readGuide(empty)).error, /carries no guide/);
  assert.match(answerGuide({}, readGuide(join(empty, "missing"))).error, /carries no guide/);
});

test("a topic's sections are cut at its second-level headings, and the title falls back to the file name", () => {
  const topic = parseTopic("odd", "no title here\n\nfirst words\n\n## One\n\na\n\n## Two\n\nb\n");
  assert.equal(topic.title, "odd");
  assert.equal(topic.summary, "first words");
  assert.deepEqual(topic.sections.map((s) => s.heading), ["One", "Two"]);
});

const shipped = readGuide();

test("the guide the Hive ships has every topic in its order, and nothing outside it", () => {
  const files = readdirSync(GUIDE_DIR).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(files, [...GUIDE_ORDER].sort());
  assert.deepEqual(shipped.map((t) => t.name), GUIDE_ORDER);
});

test("every shipped topic opens with its title and one short sentence the index can show", () => {
  for (const topic of shipped) {
    assert.match(topic.body, /^# \S/, `${topic.name} starts with its title`);
    assert.ok(topic.summary, `${topic.name} says what it covers`);
    assert.ok(topic.summary.split(/\s+/).length <= 40, `${topic.name}'s summary is short enough for the index`);
    assert.ok(topic.sections.length >= 2, `${topic.name} is cut into sections a search can return`);
  }
});

test("every path a topic names under In the code is still in the repository", () => {
  for (const topic of shipped) {
    const where = topic.sections.find((s) => s.heading === "In the code");
    assert.ok(where, `${topic.name} ends with In the code`);
    const paths = [...where.text.matchAll(/`([^`\s]+)`/g)].map((m) => m[1].replace(/\/$/, ""));
    assert.ok(paths.length, `${topic.name} names at least one path`);
    for (const path of paths) assert.ok(existsSync(join(REPO, path)), `${topic.name} names ${path}, which is gone`);
  }
});

test("the packaged app carries the guide next to the server, so a DMG, deb or AppImage knows it with no repository", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "app", "package.json"), "utf8"));
  const server = pkg.build.extraResources.find((r) => r.from === "../server");
  assert.ok(server.filter.includes("guide/*.md"), "the server resource takes the guide's markdown");
  assert.ok(server.filter.includes("peer/*.mjs"), "and the module that reads it");
  assert.equal(GUIDE_DIR, join(SERVER, "guide"));
});

test("the guide is open to a chat at the read ceiling, the narrowest one", () => {
  assert.ok(toolsFor("read").some((tool) => tool.name === "guide"));
});

test("every seat is told, before its first turn, to ask the guide about the Hive before reading its source", () => {
  assert.match(seatPreamble("a", "local"), /call the hive guide tool before you read its source/);
});

function stdio(env) {
  const child = spawn(process.execPath, [join(SERVER, "peer", "peer-mcp.mjs")], { env, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const waiting = new Map();
  child.stdout.on("data", (data) => {
    buf += data;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  });
  let id = 0;
  return {
    call(method, params) {
      id += 1;
      const mine = id;
      const answer = new Promise((resolve) => waiting.set(mine, resolve));
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`);
      return answer;
    },
    stop() { child.kill(); },
  };
}

test("a seat on the stdio server is told about the guide when it connects, and gets the index from it", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-guide-seat-"));
  writeFileSync(join(base, "ceilings.json"), JSON.stringify({ reader: "read" }));
  const client = stdio({ HIVE_STATE_DIR: base, HIVE_SEAT: "reader", PATH: "" });
  try {
    const hello = await client.call("initialize", { protocolVersion: "2025-06-18" });
    assert.equal(hello.result.instructions, HIVE_INSTRUCTIONS);
    assert.match(hello.result.instructions, /call guide first/);
    const listed = await client.call("tools/list", {});
    assert.ok(listed.result.tools.some((tool) => tool.name === "guide"));
    const index = await client.call("tools/call", { name: "guide", arguments: {} });
    const said = index.result.content[0].text;
    for (const name of GUIDE_ORDER) assert.match(said, new RegExp(`^- ${name}: `, "m"));
  } finally {
    client.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a seat that reaches the hive through the gateway is told about the guide the same way", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-guide-gw-"));
  const server = buildPeerFacade({ HIVE_STATE_DIR: base, HIVE_SEAT: "via-gateway", PATH: "" });
  const [near, far] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "seat", version: "0" });
  try {
    await server.connect(far);
    await client.connect(near);
    assert.equal(client.getInstructions(), HIVE_INSTRUCTIONS);
    const read = await client.callTool({ name: "guide", arguments: { topic: "mcp" } });
    assert.match(read.content[0].text, /^# /);
  } finally {
    await client.close();
    await server.close();
    rmSync(base, { recursive: true, force: true });
  }
});
