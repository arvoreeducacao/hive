import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SLASH_COMMANDS, acpArgs, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, setModeParams, setModelParams,
  promptBlocks, resumeFellThrough, modelsFromConfigOptions, currentModel, newSessionContext, carryOver, translate, finishTurn,
  contextUsage, serverRequestReply, stderrTrouble, toolName,
} from "../engine/kimi-acp.mjs";
import { peerEntry } from "../engine/peer-module.mjs";

const S = "session_fccab479-81ac-4d6d-a7d6-03a72a72aef8";
const update = (u) => ({ method: "session/update", params: { sessionId: S, update: u } });
const feed = (ctx, updates) => updates.flatMap((u) => translate(update(u), ctx));

test("kimi acp: the client announces no fs and no terminal, so kimi runs its own tools", () => {
  assert.deepEqual(acpArgs(), ["acp"]);
  const init = initializeParams();
  assert.equal(init.protocolVersion, 1);
  assert.deepEqual(init.clientCapabilities, {});
  assert.equal(init.clientInfo.name, "hive");
  assert.deepEqual(setModeParams(S), { sessionId: S, modeId: "yolo" });
  assert.deepEqual(setModelParams(S, "kimi-code/k3"), { sessionId: S, configId: "model", value: "kimi-code/k3" });
  assert.deepEqual(SLASH_COMMANDS, ["model", "effort", "compact", "mcp", "context"]);
});

test("kimi acp: the hive peer rides as stdio, the hub's gateway as one http server named hub, and remotes with their headers", () => {
  const servers = mcpServersFor({ seat: "orca", base: "/Users/dev/.hive", gateway: { port: 4671, servers: ["acme-mysql"] }, remote: [{ name: "figma", url: "https://mcp.figma.com/mcp", headers: { "X-Key": "${K}" } }], env: { HIVE_MCP_GATEWAY_TOKEN: "tok", K: "k1" } });
  assert.equal(servers[0].name, "hive");
  assert.equal(servers[0].command, process.execPath);
  assert.equal(servers[0].args[0], peerEntry());
  assert.deepEqual(servers[0].env, [{ name: "HIVE_SEAT", value: "orca" }, { name: "HIVE_STATE_DIR", value: "/Users/dev/.hive" }]);
  assert.deepEqual(servers[1], { type: "http", name: "hub", url: "http://127.0.0.1:4671/mcp/hub", headers: [{ name: "Authorization", value: "Bearer tok" }] }, "the gateway rides as one server, hub, whatever it hosts");
  assert.deepEqual(servers[2], { type: "http", name: "figma", url: "https://mcp.figma.com/mcp", headers: [{ name: "X-Key", value: "k1" }] });
  assert.deepEqual(mcpServersFor({}), []);
  assert.deepEqual(newSessionParams({ cwd: "/w", mcpServers: servers }).mcpServers.length, 3);
  assert.deepEqual(loadSessionParams(S, { cwd: "/w" }), { sessionId: S, cwd: "/w", mcpServers: [] });
});

test("kimi acp: the prompt is text blocks with images woven in as base64", () => {
  const load = (path) => (path.endsWith(".png") ? { data: "AAAA", mimeType: "image/png" } : null);
  assert.deepEqual(promptBlocks("hello", [], load), [{ type: "text", text: "hello" }]);
  const woven = promptBlocks("look [image:1] here", ["/tmp/a.png"], load);
  assert.ok(woven.some((b) => b.type === "image" && b.data === "AAAA" && b.mimeType === "image/png"));
  assert.ok(woven.some((b) => b.type === "text"));
  assert.deepEqual(promptBlocks("", ["/tmp/x.gif"], load), []);
});

test("kimi acp: models come out of session/new's configOptions, the current one marked default", () => {
  const options = [
    { type: "select", id: "model", category: "model", currentValue: "kimi-code/k3", options: [{ value: "kimi-code/kimi-for-coding", name: "K2.7 Coding" }, { value: "kimi-code/k3", name: "K3" }] },
    { type: "select", id: "mode", category: "mode", currentValue: "default", options: [] },
  ];
  const rows = modelsFromConfigOptions(options);
  assert.deepEqual(rows.map((r) => [r.value, r.label, r.isDefault]), [["kimi-code/kimi-for-coding", "K2.7 Coding", false], ["kimi-code/k3", "K3", true]]);
  assert.equal(currentModel(options), "kimi-code/k3");
  assert.deepEqual(modelsFromConfigOptions([]), []);
  assert.ok(resumeFellThrough("session not found"));
  assert.ok(!resumeFellThrough("rate limited"));
});

test("kimi acp: text and thought chunks stream, and settle into one assistant message when the turn ends", () => {
  const ctx = newSessionContext();
  const out = feed(ctx, [
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm" } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "po" } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ng" } },
  ]);
  assert.deepEqual(out.map((e) => e.event?.delta), [{ type: "thinking_delta", thinking: "hmm" }, { type: "text_delta", text: "po" }, { type: "text_delta", text: "ng" }]);
  const end = finishTurn(ctx, "end_turn", S);
  assert.equal(end.length, 2);
  assert.deepEqual(end[0].message.content, [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "pong" }]);
  assert.equal(end[1].type, "result");
  assert.equal(end[1].subtype, "success");
  assert.equal(end[1].session_id, S);
  assert.equal(ctx.text, "");
});

test("kimi acp: a tool call shows up as soon as its streamed arguments parse, and closes with its output", () => {
  const ctx = newSessionContext();
  const id = "0:tool_x7L1";
  const first = feed(ctx, [
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Running." } },
    { sessionUpdate: "tool_call", toolCallId: id, title: "Bash", kind: "execute", status: "pending", content: [{ type: "content", content: { type: "text", text: "" } }] },
    { sessionUpdate: "tool_call_update", toolCallId: id, status: "in_progress", content: [{ type: "content", content: { type: "text", text: '{"command":"echo' } }] },
  ]);
  assert.equal(first.filter((e) => e.type === "assistant").length, 0, "half an argument list is not a card yet");
  const second = feed(ctx, [
    { sessionUpdate: "tool_call_update", toolCallId: id, status: "in_progress", content: [{ type: "content", content: { type: "text", text: ' hi"}' } }] },
  ]);
  assert.equal(second.length, 2);
  assert.deepEqual(second[0].message.content, [{ type: "text", text: "Running." }]);
  assert.deepEqual(second[1].message.content, [{ type: "tool_use", id, name: "shell", input: { command: "echo hi" } }]);
  const done = feed(ctx, [
    { sessionUpdate: "tool_call_update", toolCallId: id, status: "completed", content: [{ type: "content", content: { type: "text", text: "hi\n" } }], rawOutput: "hi\n" },
  ]);
  assert.equal(done.length, 1);
  assert.deepEqual(done[0].message.content, [{ type: "tool_result", tool_use_id: id, content: "hi\n", is_error: false }]);
  assert.equal(ctx.open.size, 0);
});

test("kimi acp: a tool call with rawInput is a card at once, a failed one is an error result, an open one closes on cancel", () => {
  const ctx = newSessionContext();
  const a = feed(ctx, [{ sessionUpdate: "tool_call", toolCallId: "t1", title: "mcp__hive__peers", kind: "other", status: "pending", rawInput: { seat: "x" } }]);
  assert.deepEqual(a[0].message.content, [{ type: "tool_use", id: "t1", name: "mcp__hive__peers", input: { seat: "x" } }]);
  const b = feed(ctx, [{ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "failed", content: [{ type: "content", content: { type: "text", text: "boom" } }] }]);
  assert.equal(b[0].message.content[0].is_error, true);
  feed(ctx, [{ sessionUpdate: "tool_call", toolCallId: "t2", title: "Edit", kind: "edit", status: "pending" }]);
  const end = finishTurn(ctx, "cancelled", S);
  assert.equal(end[0].message.content[0].type, "tool_use");
  assert.equal(end[0].message.content[0].name, "edit");
  assert.equal(end[1].message.content[0].is_error, true);
  assert.equal(end[2].subtype, "interrupted");
  assert.equal(toolName("Read File", "read"), "read");
  assert.equal(toolName("Something Odd", ""), "something_odd");
});

test("kimi acp: usage_update feeds /context, the title and commands are kept across turns", () => {
  const ctx = newSessionContext();
  feed(ctx, [
    { sessionUpdate: "session_info_update", title: "Run echo hi" },
    { sessionUpdate: "available_commands_update", availableCommands: [{ name: "compact" }, { name: "usage" }] },
    { sessionUpdate: "usage_update", used: 32443, size: 262144 },
  ]);
  const u = contextUsage(ctx, "kimi-code/k3");
  assert.equal(u.totalTokens, 32443);
  assert.equal(u.maxTokens, 262144);
  assert.ok(u.percentage > 12 && u.percentage < 13);
  assert.deepEqual(u.categories, [{ name: "context", tokens: 32443, color: "var(--blue)" }]);
  const next = carryOver(ctx);
  assert.equal(next.contextWindow, 262144);
  assert.equal(next.title, "Run echo hi");
  assert.deepEqual(next.commands, ["compact", "usage"]);
  assert.equal(next.text, "");
  assert.equal(contextUsage(newSessionContext()).percentage, 0);
});

test("kimi acp: a refusal and an error end the turn as errors, max_tokens keeps its stop reason", () => {
  assert.equal(finishTurn(newSessionContext(), "refusal", S).at(-1).subtype, "error");
  const err = finishTurn(newSessionContext(), "", S, "the agent broke").at(-1);
  assert.equal(err.is_error, true);
  assert.equal(err.result, "the agent broke");
  const capped = finishTurn(newSessionContext(), "max_tokens", S).at(-1);
  assert.equal(capped.subtype, "success");
  assert.equal(capped.stop_reason, "max_tokens");
});

test("kimi acp: permission requests are allowed, preferring 'always', and stderr only speaks on error", () => {
  const r = serverRequestReply("session/request_permission", { options: [{ optionId: "approve_once", kind: "allow_once" }, { optionId: "approve_always", kind: "allow_always" }, { optionId: "reject", kind: "reject_once" }] });
  assert.deepEqual(r, { outcome: { outcome: "selected", optionId: "approve_always" } });
  assert.deepEqual(serverRequestReply("session/request_permission", { options: [] }), { outcome: { outcome: "cancelled" } });
  assert.equal(serverRequestReply("fs/read_text_file", {}), null);
  assert.equal(stderrTrouble('{"level":"info","msg":"acp: auth readiness probe failed","error":"x"}'), null);
  assert.equal(stderrTrouble('{"level":"error","msg":"provider failed","error":"no credential configured"}'), "provider failed: no credential configured");
  assert.equal(stderrTrouble("error: failed to run prompt: provider managed:kimi-code has no credential configured"), "error: failed to run prompt: provider managed:kimi-code has no credential configured");
  assert.equal(stderrTrouble("plain chatter"), null);
});
