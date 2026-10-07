import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BINARY, SLASH_COMMANDS, AUTH_METHOD, AUTH_TIMEOUT_MS, LOGIN_HINT, acpArgs, authenticateParams, needsLogin, loginTrouble, initializeParams, modelConfigId, setModelParams,
  modelsFromConfigOptions, currentModel, canCompact, newSessionContext, carryOver, translate, finishTurn, contextUsage, resumeFellThrough,
} from "../engine/cursor-acp.mjs";
import { parseCursorConfigOptions, agents } from "../engine/agents.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const S = "3eb09843-2a35-4f6e-9c1a-7d2b5e8f0a11";
const update = (u) => ({ method: "session/update", params: { sessionId: S, update: u } });
const feed = (ctx, updates) => updates.flatMap((u) => translate(update(u), ctx));

test("cursor acp: the server is cursor-agent acp, bare, and the login is the CLI's own", () => {
  assert.equal(BINARY, "cursor-agent");
  assert.deepEqual(acpArgs(), ["acp"]);
  assert.deepEqual(authenticateParams(), { methodId: "cursor_login" });
  assert.equal(AUTH_METHOD, "cursor_login");
  assert.deepEqual(initializeParams().clientCapabilities, {}, "no fs and no terminal, so the agent runs its own tools");
  assert.deepEqual(SLASH_COMMANDS, ["model", "compact", "mcp", "context"]);
  assert.ok(needsLogin("Authentication required. Please run 'agent login' first, then call authenticate() with methodId 'cursor_login'."));
  assert.ok(needsLogin("Not logged in"));
  assert.ok(!needsLogin("session not found"));
  assert.match(LOGIN_HINT, /agent login/);
  assert.match(loginTrouble("authenticate: no answer from the app-server in 20s"), /^nobody is signed in to Cursor/, "a login that is not signed in never answers authenticate, so silence reads as no login");
  assert.match(loginTrouble("Authentication required"), /^nobody is signed in to Cursor/);
  assert.equal(loginTrouble("the pipe broke"), "the pipe broke");
  assert.equal(AUTH_TIMEOUT_MS, 20000);
});

test("cursor acp: models come out of the session's configOptions under the option's own id, grouped as cursor", () => {
  const options = [
    { type: "select", id: "mode", category: "mode", currentValue: "agent", options: [{ value: "agent", name: "Agent" }, { value: "plan", name: "Plan" }] },
    { type: "select", id: "model", category: "model", currentValue: "gpt-5", options: [{ value: "gpt-5", name: "GPT-5" }, { value: "sonnet-4", name: "Sonnet 4", description: "fast" }, { value: "" }] },
  ];
  const rows = modelsFromConfigOptions(options);
  assert.deepEqual(rows.map((r) => [r.value, r.label, r.group, r.isDefault]), [["gpt-5", "GPT-5", "cursor", true], ["sonnet-4", "Sonnet 4", "cursor", false]]);
  assert.deepEqual(parseCursorConfigOptions(options).map((r) => r.value), ["gpt-5", "sonnet-4"]);
  assert.equal(currentModel(options), "gpt-5");
  assert.equal(modelConfigId(options), "model");
  assert.equal(modelConfigId([{ id: "cursor-model", category: "model", options: [] }]), "cursor-model");
  assert.deepEqual(setModelParams(S, "sonnet-4", "cursor-model"), { sessionId: S, configId: "cursor-model", value: "sonnet-4" });
  assert.deepEqual(setModelParams(S, "sonnet-4"), { sessionId: S, configId: "model", value: "sonnet-4" });
  assert.deepEqual(modelsFromConfigOptions([]), []);
  assert.ok(resumeFellThrough("session not found"));
});

test("cursor acp: usage_update feeds /context without asking, and compaction is offered only when the agent lists the command", () => {
  const ctx = newSessionContext();
  assert.equal(canCompact(ctx), false);
  feed(ctx, [
    { sessionUpdate: "available_commands_update", availableCommands: [{ name: "compact" }, { name: "mcp" }] },
    { sessionUpdate: "usage_update", used: 41000, size: 200000 },
  ]);
  assert.equal(canCompact(ctx), true);
  const u = contextUsage(ctx, "gpt-5");
  assert.equal(u.totalTokens, 41000);
  assert.equal(u.maxTokens, 200000);
  assert.equal(u.model, "gpt-5");
  const next = carryOver(ctx);
  assert.equal(canCompact(next), true, "the command list survives a turn");
  assert.equal(next.contextWindow, 200000);
});

test("cursor acp: a turn streams text and thought, opens tool cards and settles into one message with a result", () => {
  const ctx = newSessionContext();
  const out = feed(ctx, [
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "let me" } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "po" } },
    { sessionUpdate: "tool_call", toolCallId: "c1", title: "Running: echo hi", kind: "execute", status: "pending", rawInput: { command: "echo hi" } },
    { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed", content: [{ type: "content", content: { type: "text", text: "hi\n" } }] },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ng" } },
  ]);
  const tool = out.find((e) => e.type === "assistant" && e.message.content[0].type === "tool_use");
  assert.deepEqual(tool.message.content[0], { type: "tool_use", id: "c1", name: "shell", input: { command: "echo hi" } });
  const result = out.find((e) => e.type === "user");
  assert.equal(result.message.content[0].content, "hi\n");
  const end = finishTurn(ctx, "end_turn", S);
  assert.equal(end.at(-1).type, "result");
  assert.equal(end.at(-1).subtype, "success");
  assert.equal(end.at(-1).session_id, S);
  assert.equal(finishTurn(newSessionContext(), "cancelled", S).at(-1).subtype, "interrupted");
});

test("cursor acp: the driver authenticates right after initialize, never sets a mode, and refuses /compact plainly when the agent has none", () => {
  const driver = readFileSync(join(HERE, "engine/cursor-driver.mjs"), "utf8");
  assert.match(driver, /await rpc\.request\("initialize", initializeParams\(\)\);\n\s+await rpc\.request\("authenticate", authenticateParams\(\), \{ timeoutMs: AUTH_TIMEOUT_MS \}\)/, "authenticate never answers on a login that is not signed in, so it must carry a timeout");
  assert.match(driver, /throw new Error\(loginTrouble\(e\?\.message \|\| e\)\)/);
  assert.doesNotMatch(driver, /session\/set_mode/, "cursor's modes are agent, plan and ask — none is a permission mode");
  assert.match(driver, /spawn\(BINARY, acpArgs\(\)/);
  assert.match(driver, /if \(!canCompact\(ctx\)\) throw new Error\(`\$\{LABEL\} seats do not support \/compact/);
  assert.doesNotMatch(driver, /quietPrompt\("\/usage"\)/, "cursor reports usage on its own; there is no /usage to ask");
  assert.match(driver, /context: async \(\) => contextUsage\(ctx, model\)/);
  assert.match(driver, /setModelParams\(sessionId, wanted, modelOptionId\)/);
});

test("cursor acp: the catalogue asks the acp server after signing in, and the turn shape is print mode", () => {
  const calls = [];
  const rpc = async (bin, args, body) => {
    assert.equal(bin, "cursor-agent");
    assert.deepEqual(args, ["acp"]);
    return body(async (method, params) => {
      calls.push(method);
      if (method === "session/new") return { sessionId: S, configOptions: [{ id: "model", category: "model", currentValue: "gpt-5", options: [{ value: "gpt-5", name: "GPT-5" }] }] };
      return {};
    });
  };
  return agents.cursor.listCatalog({ rpc }).then((rows) => {
    assert.deepEqual(calls, ["initialize", "authenticate", "session/new"]);
    assert.deepEqual(rows.map((r) => r.value), ["gpt-5"]);
    assert.deepEqual(agents.cursor.turnArgs({ text: "hi", model: "gpt-5", sessionId: S }), ["-p", "hi", "--output-format", "stream-json", "--force", "--trust", "--model", "gpt-5", "--resume", S]);
    assert.equal(agents.cursor.binary, "cursor-agent");
  });
});
