import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PEER_TOOLS, peerCalls } from "../peer/peer-tools.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-tools-"));
  for (const dir of ["sessions", "sock", "status", "events"]) await mkdir(join(base, dir), { recursive: true });
  await writeFile(join(base, "sessions", "asker.json"), JSON.stringify({ session_id: "s1", cwd: "/w/asker" }));
  await writeFile(join(base, "sessions", "answerer.json"), JSON.stringify({ session_id: "s2", cwd: "/w/answerer" }));
  return base;
}

const said = (reply) => reply.content.map((c) => c.text).join("\n");

test("the same process answers as whichever seat the environment names, so one gateway can serve every chat", async () => {
  const base = await hive();
  try {
    const asker = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "asker", PATH: "" });
    const answerer = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "answerer", PATH: "" });
    const fromAsker = said(await asker.peers());
    const fromAnswerer = said(await answerer.peers());
    assert.match(fromAsker, /^you are asker \(/);
    assert.match(fromAsker, /answerer/);
    assert.match(fromAnswerer, /^you are answerer \(/);
    assert.match(fromAnswerer, /asker/);
    assert.doesNotMatch(fromAnswerer, /^you are asker/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("a seat the environment does not name is told to reopen, not served as somebody else", async () => {
  const base = await hive();
  try {
    const nobody = peerCalls({ HIVE_STATE_DIR: base, PATH: "" });
    const reply = await nobody.message({ seat: "answerer", text: "oi" });
    assert.equal(reply.isError, true);
    assert.match(said(reply), /no name in the hive yet/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("every call the tools make carries the seat's environment, never the process's", () => {
  const src = readFileSync(join(HERE, "peer", "peer-tools.mjs"), "utf8");
  const body = src.slice(src.indexOf("export function peerCalls(env = process.env) {"));
  assert.doesNotMatch(body, /\b(me|listSeats)\(\)/, "identity read from the process would make every chat the same seat");
  for (const line of body.split("\n")) {
    const call = /await (browser\w+|deviceCall|publishPage|answerOnPage|noteTask|renameSeat|openSeat)\(\{([^}]*)\}\)/.exec(line);
    if (call) assert.match(call[2], /\benv\b/, `${call[1]} is called without the seat's env`);
  }
  assert.doesNotMatch(body, /sendSay\([^)]*\{ from: self\.name \}\)/, "sendSay without env speaks from the process, not the seat");
  assert.match(body, /peekSeat\(found\.seat, lines, env\)/);
  assert.match(body, /askPerson\(args\.person, args\.question, \{ env \}\)/);
  assert.match(body, /buzzPhone\(args\.line, \{ env \}\)/);
  assert.match(body, /sayOnSlack\(args\.text, \{ env \}\)/);
  assert.match(body, /pay: \(self\) => spendBirths\(self, asked\), env/);
});

test("the stdio server and the gateway route hand out the same tool list", () => {
  const stdio = readFileSync(join(HERE, "peer", "peer-mcp.mjs"), "utf8");
  assert.match(stdio, /import \{ PEER_TOOLS, peerCalls \} from "\.\/peer-tools\.mjs"/);
  assert.match(stdio, /const calls = peerCalls\(process\.env\);/);
  assert.match(stdio, /if \(method === "tools\/list"\) return \{ tools: PEER_TOOLS \};/);
  const gateway = readFileSync(join(HERE, "gateway", "gateway.mjs"), "utf8");
  assert.match(gateway, /server\.setRequestHandler\(ListToolsRequestSchema, async \(\) => \(\{ tools: PEER_TOOLS \}\)\);/);
  assert.ok(PEER_TOOLS.some((tool) => tool.name === "peers") && PEER_TOOLS.some((tool) => tool.name === "publish"));
});
