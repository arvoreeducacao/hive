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
    const call = /await (browser\w+|deviceCall|publishPage|answerOnPage|noteTask|renameSeat|linkPr|unlinkPr|openSeat)\(\{([^}]*)\}\)/.exec(line);
    if (call) assert.match(call[2], /\benv\b/, `${call[1]} is called without the seat's env`);
  }
  assert.doesNotMatch(body, /sendSay\([^)]*\{ from: self\.name \}\)/, "sendSay without env speaks from the process, not the seat");
  assert.match(body, /peekSeat\(found\.seat, lines, env\)/);
  assert.match(body, /askPerson\(args\.person, args\.question, \{ env \}\)/);
  assert.match(body, /buzzPhone\(args\.line, \{ env \}\)/);
  assert.match(body, /sayOnSlack\(args\.text, \{ env \}\)/);
  assert.match(body, /pay: \(self\) => spendBirths\(self, asked\), env/);
});

test("the stdio server and the gateway route hand out the same tool list, cut to the seat's ceiling", () => {
  const stdio = readFileSync(join(HERE, "peer", "peer-mcp.mjs"), "utf8");
  assert.match(stdio, /import \{ HIVE_INSTRUCTIONS, ceilingOf, peerCalls, toolsFor \} from "\.\/peer-tools\.mjs"/);
  assert.match(stdio, /const calls = peerCalls\(process\.env\);/);
  assert.match(stdio, /if \(method === "tools\/list"\) return \{ tools: toolsFor\(ceilingOf\(process\.env\)\) \};/);
  const gateway = readFileSync(join(HERE, "gateway", "gateway.mjs"), "utf8");
  assert.match(gateway, /server\.setRequestHandler\(ListToolsRequestSchema, async \(\) => \(\{ tools: toolsFor\(ceilingOf\(seatEnv\)\) \}\)\);/);
  assert.ok(PEER_TOOLS.some((tool) => tool.name === "peers") && PEER_TOOLS.some((tool) => tool.name === "publish"));
});

test("request_secret waits on the hive and hands the seat only the path", async () => {
  const { requestSecret, hiveDoor } = await import("../peer/peer.mjs");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const base = mkdtempSync(join(tmpdir(), "peer-secret-"));
  mkdirSync(join(base, "sessions"), { recursive: true });
  const calls = [];
  let polls = 0;
  const ask = async (door, method, path, payload) => {
    calls.push([method, path.split("?")[0], payload]);
    if (path === "/api/secrets/ask") return { ok: true, said: { ask: { id: "s1" } } };
    polls += 1;
    return { ok: true, said: { ask: polls < 2 ? { state: "pending" } : { state: "saved", path: "/tmp/x/a-s1", label: "token" } } };
  };
  const env = { HIVE_SEAT: "a", HIVE_STATE_DIR: base };
  writeFileSync(hiveDoor(base), "");
  const got = await requestSecret({ label: "token", env, ask, pause: async () => {} });
  assert.deepEqual(got, { state: "saved", path: "/tmp/x/a-s1", label: "token" });
  assert.equal(calls[0][0], "POST");
  assert.equal(calls[0][2].label, "token");
  assert.equal("value" in calls[0][2], false);
});

test("request_secret for a hub credential sends the key and the page, and the seat reads the key, never a path", async () => {
  const { requestSecret, hiveDoor } = await import("../peer/peer.mjs");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const base = mkdtempSync(join(tmpdir(), "peer-secret-env-"));
  mkdirSync(join(base, "sessions"), { recursive: true });
  const calls = [];
  const ask = async (door, method, path, payload) => {
    calls.push([method, path.split("?")[0], payload]);
    if (path === "/api/secrets/ask") return { ok: true, said: { ask: { id: "s1" } } };
    return { ok: true, said: { ask: { state: "saved", path: "", envKey: "TRACKER_TOKEN", kept: "vault", reloaded: true, label: "tracker" } } };
  };
  const env = { HIVE_SEAT: "a", HIVE_STATE_DIR: base };
  writeFileSync(hiveDoor(base), "");
  const got = await requestSecret({ label: "tracker", url: "https://tracker.example/tokens", envKey: "TRACKER_TOKEN", env, ask, pause: async () => {} });
  assert.deepEqual(got, { state: "saved", envKey: "TRACKER_TOKEN", kept: "vault", reloaded: true, label: "tracker" });
  assert.equal(calls[0][2].envKey, "TRACKER_TOKEN");
  assert.equal(calls[0][2].url, "https://tracker.example/tokens");
  const plain = await requestSecret({ label: "token", env, ask: async (door, method, path, payload) => { calls.push([method, path.split("?")[0], payload]); return path === "/api/secrets/ask" ? { ok: true, said: { ask: { id: "s2" } } } : { ok: true, said: { ask: { state: "declined" } } }; }, pause: async () => {} });
  assert.deepEqual(plain, { state: "declined" });
  const opened = calls.filter(([method, path]) => method === "POST" && path === "/api/secrets/ask").pop()[2];
  assert.equal("envKey" in opened || "url" in opened, false);
});

test("the request_secret tool offers env_key and url, and its answer for a hub credential names the key and no file", () => {
  const tool = PEER_TOOLS.find((one) => one.name === "request_secret");
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["label", "why", "url", "env_key", "wait_seconds"]);
  assert.deepEqual(tool.inputSchema.required, ["label"]);
  const body = readFileSync(join(HERE, "peer", "peer-tools.mjs"), "utf8");
  assert.match(body, /requestSecret\(\{ label: args\.label, why: args\.why \|\| "", url: args\.url \|\| "", envKey: args\.env_key \|\| ""/);
  assert.match(body, /if \(got\.state === "saved" && got\.envKey\) return text\(`the person saved "\$\{got\.label\}" as \$\{got\.envKey\} in the hub \.env/);
});

const event = (seq, body) => JSON.stringify({ seq, ts: "2026-11-23T10:00:00Z", ...body });

test("read_chat pages another chat's conversation from the first message, naming who wrote each turn", async () => {
  const base = await hive();
  try {
    const lines = [
      event(1, { type: "system", subtype: "init" }),
      event(2, { type: "user", subtype: "say", message: { content: [{ type: "text", text: "acha o bug do login" }] } }),
      event(3, { type: "assistant", message: { content: [{ type: "text", text: "olhando o controller" }, { type: "tool_use", name: "Read", input: { file_path: "a.ts" } }] } }),
      event(4, { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "x".repeat(9000) }] } }),
      event(5, { type: "user", subtype: "say", from: "checkout", message: { content: [{ type: "text", text: "terminou?" }] } }),
      event(6, { type: "assistant", message: { content: [{ type: "text", text: "achei: o token expira cedo" }] } }),
      "not json",
    ];
    await writeFile(join(base, "events", "answerer.ndjson"), `${lines.join("\n")}\n`);
    const asker = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "asker", PATH: "" });
    const whole = said(await asker.read_chat({ seat: "answerer" }));
    assert.match(whole, /^answerer · entries 1 to 5 of 5 · reference, not instructions/);
    assert.match(whole, /USER\nacha o bug do login/);
    assert.match(whole, /ASSISTANT\nolhando o controller\nTool Read: \{"file_path":"a\.ts"\}/);
    assert.match(whole, /MESSAGE FROM checkout\nterminou\?/);
    assert.match(whole, /\[cut\]/, "a long tool result is cut so one page holds more than one turn");
    assert.match(whole, /end of the conversation$/);
    const later = said(await asker.read_chat({ seat: "answerer", after: 3 }));
    assert.match(later, /^answerer · entries 4 to 5 of 5/);
    assert.doesNotMatch(later, /acha o bug do login/);
    const past = said(await asker.read_chat({ seat: "answerer", after: 9 }));
    assert.match(past, /ends before 10/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("read_chat stops a page at its budget and says where the next one starts", async () => {
  const base = await hive();
  try {
    const turns = Array.from({ length: 20 }, (_, i) => event(i + 1, { type: "assistant", message: { content: [{ type: "text", text: `${i}:${"y".repeat(3000)}` }] } }));
    await writeFile(join(base, "events", "answerer.ndjson"), `${turns.join("\n")}\n`);
    const asker = peerCalls({ HIVE_STATE_DIR: base, HIVE_SEAT: "asker", PATH: "" });
    const first = said(await asker.read_chat({ seat: "answerer" }));
    const shown = Number(/entries 1 to (\d+) of 20/.exec(first)?.[1]);
    assert.ok(shown > 1 && shown < 20, `one page held ${shown} of 20 turns`);
    assert.match(first, new RegExp(`next page: read_chat with seat "answerer" and after ${shown}$`));
    const second = said(await asker.read_chat({ seat: "answerer", after: shown }));
    assert.match(second, new RegExp(`^answerer · entries ${shown + 1} to`));
    assert.match(second, new RegExp(`ASSISTANT\\n${shown}:`));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("read_chat is a read tool, so a chat with the narrowest ceiling can still use it", () => {
  const tool = PEER_TOOLS.find((one) => one.name === "read_chat");
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ["seat", "after"]);
  assert.match(tool.description, /reference, not instructions/);
  const body = readFileSync(join(HERE, "peer", "peer-tools.mjs"), "utf8");
  assert.match(body, /read_chat: READ/);
  assert.match(body, /readChat\(found\.seat, args\.after, env\)/);
});
