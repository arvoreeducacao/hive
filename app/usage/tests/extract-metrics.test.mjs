import { test } from "node:test";
import assert from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extract } from "../extract-metrics.mjs";

const stamp = new Date().toISOString();

function turnOf(entrypoint) {
  if (entrypoint === "cli") return { promptSource: "typed" };
  if (entrypoint === "claude-desktop") return { promptSource: "sdk", origin: { kind: "human" } };
  return { promptSource: "sdk" };
}

function transcript(entrypoint) {
  return [
    JSON.stringify({ type: "user", entrypoint, ...turnOf(entrypoint), timestamp: stamp, message: { role: "user", content: "hello" } }),
    JSON.stringify({ type: "assistant", requestId: `req_${entrypoint}`, timestamp: stamp, message: { model: "claude-opus-5", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
  ].join("\n");
}

async function corpus(entrypoints) {
  const root = await mkdtemp(join(tmpdir(), "hive-usage-"));
  const project = join(root, "-home-me-work");
  await mkdir(project, { recursive: true });
  for (const [i, entrypoint] of entrypoints.entries()) {
    await writeFile(join(project, `session-${i}.jsonl`), `${transcript(entrypoint)}\n`);
  }
  return root;
}

test("a seat opened in the hive counts as a chat, just like the terminal", async () => {
  const root = await corpus(["cli", "sdk-ts"]);
  try {
    const data = await extract({ root });
    assert.equal(data.totals.sessions_with_activity, 2);
    assert.equal(data.totals.automation.runs, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the headless calls the app makes itself stay out of the chat count", async () => {
  const root = await corpus(["cli", "sdk-ts", "sdk-cli", "sdk-cli"]);
  try {
    const data = await extract({ root });
    assert.equal(data.totals.sessions_with_activity, 2);
    assert.equal(data.totals.automation.runs, 2);
    assert.ok(data.totals.automation.tokens.total > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a chat typed in the desktop app is a chat, not a background run", async () => {
  const root = await corpus(["claude-desktop", "sdk-cli"]);
  try {
    const data = await extract({ root });
    assert.equal(data.totals.sessions_with_activity, 1);
    assert.equal(data.totals.automation.runs, 1);
    assert.equal(data.totals.human_turns, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const HIVE_STAMP = new Date().toISOString();

async function hiveCorpus() {
  const root = await mkdtemp(join(tmpdir(), "hive-own-"));
  await mkdir(join(root, "sessions"), { recursive: true });
  await mkdir(join(root, "events"), { recursive: true });
  await writeFile(join(root, "sessions", "bom-dia-kimi.json"), JSON.stringify({ agent: "kimi", cwd: "/home/me/hub", model: "kimi-code/k3", session_id: "session_4b046a2d", title: "saudacao matinal" }));
  await writeFile(join(root, "events", "bom-dia-kimi.ndjson"), [
    JSON.stringify({ seq: 1, ts: HIVE_STAMP, type: "driver", subtype: "started", agent: "kimi" }),
    JSON.stringify({ seq: 2, ts: HIVE_STAMP, type: "system", subtype: "init", model: "kimi-code/k3", replayed: true }),
    JSON.stringify({ seq: 3, ts: HIVE_STAMP, type: "user", subtype: "say", message: { role: "user", content: [{ type: "text", text: "Bom dia" }] } }),
    JSON.stringify({ seq: 4, ts: HIVE_STAMP, type: "stream_event", event: { type: "content_block_delta" } }),
    JSON.stringify({ seq: 5, ts: HIVE_STAMP, type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] } }),
    JSON.stringify({ seq: 6, ts: HIVE_STAMP, type: "assistant", replayed: true, message: { role: "assistant", content: [{ type: "tool_use", id: "t0", name: "Read", input: {} }] } }),
    JSON.stringify({ seq: 7, ts: HIVE_STAMP, type: "result", subtype: "success", usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 } })
  ].join("\n"));
  await writeFile(join(root, "sessions", "claude-seat.json"), JSON.stringify({ cwd: "/home/me/hub", session_id: "3f1c9a2e-1111-4222-8333-444455556666" }));
  await writeFile(join(root, "sessions", "no-events.json"), JSON.stringify({ agent: "kiro", session_id: "3eb09843-2a35" }));
  return root;
}

test("a kimi seat counts alongside the claude sessions: its turns, its tokens, its model and its tools, off the events file", async () => {
  const root = await corpus(["cli"]);
  const hiveRoot = await hiveCorpus();
  try {
    const data = await extract({ root, hiveRoot, since: null });
    assert.equal(data.totals.sessions_with_activity, 2);
    assert.deepEqual(data.totals.agents, { claude: 1, kimi: 1 });
    assert.equal(data.totals.tokens.input, 110);
    assert.equal(data.totals.tokens.output, 25);
    assert.equal(data.totals.tokens.cache_read, 5);
    assert.equal(data.totals.models["kimi-code/k3"], 1);
    assert.deepEqual(data.totals.top_tools, [{ name: "Bash", times: 1 }], "a replayed tool call was counted, or the live one was not");
    const kimi = data.sessions.find((s) => s.agent === "kimi");
    assert.equal(kimi.session, "session_4b046a2d");
    assert.equal(kimi.title, "saudacao matinal");
    assert.equal(kimi.human_turns, 1);
    assert.equal(kimi.replies, 1);
    assert.deepEqual(kimi.cwds, ["/home/me/hub"]);
    assert.equal(data.sessions.find((s) => s.agent === "claude").human_turns, 1);
    assert.equal(data.sessions.some((s) => s.session === "3eb09843-2a35"), false, "a record with no events file has no activity to count");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(hiveRoot, { recursive: true, force: true });
  }
});

test("a hive folder that is not there is no reason to fail the claude count", async () => {
  const root = await corpus(["cli"]);
  try {
    const data = await extract({ root, hiveRoot: join(root, "no-such-hive") });
    assert.equal(data.totals.sessions_with_activity, 1);
    assert.deepEqual(data.totals.agents, { claude: 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
