import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function cut(from, to, what) {
  const a = server.indexOf(from);
  const b = server.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${what} out of server.mjs`);
  return server.slice(a, b);
}

function opener(block, name) {
  const made = new Function("openJob", "runJob", `return ({ ${block} })[${JSON.stringify(name)}];`);
  return (openJob, runJob) => made(openJob, runJob);
}

function bench(block, name) {
  const seen = [];
  const open = opener(block, name)(
    (body) => { seen.push(body); return { id: "n1", name: "um-chat", where: body.where === "cloud" ? "cloud" : "local", step: "up", error: "" }; },
    async (job, body) => { seen.push(body); }
  );
  return { open, seen };
}

const PHONE = cut("  spawn: async (mission) => {", "\n  answer: async (kind", "the opener the phone asks for a chat with");
const RELAY = cut("    openSeat: async (mission) => {", "\n    handBirth:", "the opener another device asks for a chat with");

test("a chat asked from the phone is born as a chat, not as a terminal the phone cannot read", async () => {
  const { open, seen } = bench(PHONE, "spawn");
  const made = await open({ prompt: "abre isso pra mim", where: "local", agent: "claude" });
  assert.equal(made.name, "um-chat");
  assert.ok(seen.length >= 2, "the opener has to name the chat and then run it");
  for (const asked of seen) assert.equal(asked.structured, true, "a seat with no event stream never reaches the phone's list");
});

test("a chat asked from another device of yours is born the same way", async () => {
  const { open, seen } = bench(RELAY, "openSeat");
  const made = await open({ prompt: "abre isso pra mim", where: "cloud" });
  assert.equal(made.name, "um-chat");
  for (const asked of seen) assert.equal(asked.structured, true, "the relay reads a seat through its events, and only a chat has them");
});

test("what the asker sent is carried whole, the flag is the only thing added", async () => {
  const { open, seen } = bench(PHONE, "spawn");
  await open({ prompt: "abre", where: "cloud", model: "opus", account: "arvore", repo: "hub", agent: "codex" });
  const [asked] = seen;
  assert.deepEqual(asked, { prompt: "abre", where: "cloud", model: "opus", account: "arvore", repo: "hub", agent: "codex", structured: true });
});
