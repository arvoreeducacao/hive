import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasConversationEvents, replayCodexThread } from "../engine/codex-history.mjs";
import { initializeParams, threadParams, resumeParams } from "../engine/codex-app-server.mjs";

const thread = {
  id: "old-thread",
  turns: [{ id: "turn-1", items: [
    { type: "userMessage", content: [{ type: "text", text: "Fix login" }, { type: "localImage", path: "/tmp/login.png" }] },
    { type: "commandExecution", id: "shell-1", command: "pwd", aggregatedOutput: "/repo", status: "completed", exitCode: 0 },
    { type: "agentMessage", text: "Login is fixed." },
  ] }],
};

test("reopening without Hive events restores messages, attachments and completed tools", () => {
  const events = replayCodexThread(thread);
  assert.equal(events[0].subtype, "replayed");
  assert.equal(events[1].message.content[0].text, "Fix login");
  assert.deepEqual(events[1].images, ["/tmp/login.png"]);
  assert.equal(events.at(-1).message.content[0].text, "Login is fixed.");
  assert.ok(events.every((event) => event.replayed));
  assert.ok(events.some((event) => event.message?.content[0]?.type === "tool_result"));
  assert.ok(!events.some((event) => event.type === "result"));
});

test("startup notices alone do not count as a conversation already displayed", () => {
  assert.equal(hasConversationEvents('{"type":"driver","subtype":"started"}\ninvalid'), false);
  assert.equal(hasConversationEvents(replayCodexThread(thread).map(JSON.stringify).join("\n")), true);
});

test("history replay bounds the displayed tail and handles an empty thread", () => {
  assert.deepEqual(replayCodexThread({ turns: [] }), []);
  const items = Array.from({ length: 450 }, (_, i) => ({ type: "agentMessage", text: String(i) }));
  const events = replayCodexThread({ id: "old", turns: [{ items }] });
  assert.equal(events.length, 401);
  assert.equal(events[0].total, 450);
  assert.equal(events[1].message.content[0].text, "50");
});

function driverOpening({ sessionId = "old-thread", replayNeeded = true, fail = "", includeTurns = true } = {}) {
  const source = readFileSync(new URL("../engine/codex-driver.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function openAppServer() {");
  const end = source.indexOf("\nfunction dispatchSay(", start);
  const calls = [], events = [], saved = [];
  const rpc = {
    alive: true,
    close() {},
    notify() {},
    async request(method, params) {
      calls.push({ method, params });
      if (method === "initialize") return {};
      if (method === "thread/resume" && fail) throw new Error(fail);
      if (method === "thread/read") return { thread };
      return { thread: includeTurns ? thread : { id: thread.id }, model: "gpt-6-astra", reasoningEffort: "high" };
    },
  };
  const open = new Function("rpc", "initial", "calls", "events", "saved", "initializeParams", "threadParams", "resumeParams", "replayCodexThread", `
    let client = null, opening = null, sessionId = initial.sessionId, replayNeeded = initial.replayNeeded;
    let model = "", effort = "";
    const cwd = "/repo", name = "revived", side = "local", base = "/tmp/hive";
    const gatewayLink = null, remoteLink = [], autocompactAt = "", childEnv = {};
    const spawn = () => ({}), appServerArgs = () => [], createRpcClient = () => rpc, stdioServersTheGatewayServes = () => [];
    const onNotification = () => {}, onRequest = () => {}, onExit = () => {}, onStderr = () => {};
    const seatPreamble = () => "", emit = (event) => events.push(event);
    const persistSession = (data) => saved.push(data);
    const initEvent = () => ({ type: "system", model, effort, session_id: sessionId });
    ${source.slice(start, end)}
    return openAppServer;
  `)(rpc, { sessionId, replayNeeded }, calls, events, saved, initializeParams, threadParams, resumeParams, replayCodexThread);
  return { open, calls, events, saved };
}

test("the actual driver restores history on open and retains the resolved model and effort", async () => {
  const driver = driverOpening();
  await driver.open();
  await driver.open();
  assert.deepEqual(driver.calls.map((call) => call.method), ["initialize", "thread/resume"]);
  assert.equal(driver.events.filter((event) => event.subtype === "replayed").length, 1);
  assert.deepEqual(driver.saved.at(-1), { model: "gpt-6-astra", model_id: "gpt-6-astra", effort: "high" });
});

test("the actual driver reads turns when resume returns only the thread summary", async () => {
  const driver = driverOpening({ includeTurns: false });
  await driver.open();
  assert.deepEqual(driver.calls.at(-1), { method: "thread/read", params: { threadId: "old-thread", includeTurns: true } });
  assert.ok(driver.events.some((event) => event.subtype === "replayed"));
});

test("existing Hive history is not duplicated on resume", async () => {
  const driver = driverOpening({ replayNeeded: false });
  await driver.open();
  assert.ok(!driver.events.some((event) => event.replayed));
});

test("a missing Codex thread fails visibly without starting or saving a replacement", async () => {
  const driver = driverOpening({ fail: "no rollout found for thread old-thread" });
  await assert.rejects(driver.open(), /no rollout found/);
  assert.deepEqual(driver.calls.map((call) => call.method), ["initialize", "thread/resume"]);
  assert.deepEqual(driver.saved, []);
});
