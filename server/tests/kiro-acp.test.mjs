import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BINARY, SLASH_COMMANDS, EFFORT_LEVELS, COMMAND_EXECUTE, COMMAND_OPTIONS, acpArgs, initializeParams, setModelParams, commandParams, commandOptionsParams, effortCommandArgs,
  modelsFromSession, modelsFromOptions, currentModel, newSessionContext, carryOver, translate, finishTurn, contextUsage, mcpStatus, toolName, toolInput, toolOutcome, mcpServersFor,
  kiroMcpServers, schemaTrouble, SKIP_ENV, SCHEMA_UNSAFE_SERVERS,
} from "../engine/kiro-acp.mjs";

const S = "0f856291-ab71-4b02-b40b-62f50a441291";
const update = (u) => ({ method: "session/update", params: { sessionId: S, update: u } });
const ext = (method, params) => ({ method, params: { sessionId: S, ...params } });
const feed = (ctx, msgs) => msgs.flatMap((m) => translate(m.method ? m : update(m), ctx));

test("kiro acp: the process is kiro-cli acp with every tool trusted, and model and effort ride on the command line", () => {
  assert.equal(BINARY, "kiro-cli");
  assert.deepEqual(acpArgs(), ["acp", "--trust-all-tools"]);
  assert.deepEqual(acpArgs({ model: "claude-sonnet-5", effort: "high" }), ["acp", "--trust-all-tools", "--model", "claude-sonnet-5", "--effort", "high"]);
  assert.deepEqual(initializeParams().clientCapabilities, {});
  assert.deepEqual(setModelParams(S, "gpt-5.6-luna"), { sessionId: S, modelId: "gpt-5.6-luna" });
  assert.deepEqual(commandParams(S, "effort", effortCommandArgs("max")), { sessionId: S, command: { command: "effort", args: { value: "max" } } });
  assert.deepEqual(commandParams(S, "context"), { sessionId: S, command: { command: "context", args: {} } });
  assert.deepEqual(commandOptionsParams(S, "model"), { sessionId: S, command: "model" });
  assert.equal(COMMAND_EXECUTE, "_kiro.dev/commands/execute");
  assert.equal(COMMAND_OPTIONS, "_kiro.dev/commands/options");
  assert.deepEqual(SLASH_COMMANDS, ["model", "effort", "compact", "mcp", "context"]);
  assert.deepEqual(EFFORT_LEVELS, ["low", "medium", "high", "xhigh", "max"]);
  assert.equal(mcpServersFor({ seat: "orca", base: "/h" })[0].name, "hive");
});

test("kiro acp: models come out of session/new's models block, the current one marked default, every one with kiro's effort levels", () => {
  const opened = { sessionId: S, modes: { currentModeId: "kiro_default", availableModes: [] }, models: { currentModelId: "claude-opus-4.8", availableModels: [
    { modelId: "claude-opus-5", name: "claude-opus-5", description: "Claude Opus 5 model with 1M context window" },
    { modelId: "claude-opus-4.8", name: "claude-opus-4.8", description: "Claude Opus 4.8 model with 1M context window" },
  ] } };
  const rows = modelsFromSession(opened);
  assert.deepEqual(rows.map((r) => [r.value, r.isDefault, r.group]), [["claude-opus-5", false, "kiro"], ["claude-opus-4.8", true, "kiro"]]);
  assert.deepEqual(rows[0].efforts.map((e) => e.value), EFFORT_LEVELS);
  assert.equal(currentModel(opened), "claude-opus-4.8");
  assert.deepEqual(modelsFromSession({}), []);
  const fromOptions = modelsFromOptions([
    { value: "claude-sonnet-5", label: "claude-sonnet-5", description: "Claude Sonnet 5 model with 1M context window [active]", group: "1.30x credits" },
    { value: "gpt-5.6-luna", label: "gpt-5.6-luna", description: "Experimental preview", group: "1.00x credits" },
  ]);
  assert.deepEqual(fromOptions.map((r) => [r.value, r.isDefault]), [["claude-sonnet-5", true], ["gpt-5.6-luna", false]]);
  assert.equal(fromOptions[0].description, "Claude Sonnet 5 model with 1M context window · 1.30x credits");
});

test("kiro acp: text and thought chunks stream and settle into one assistant message at the end of the turn", () => {
  const ctx = newSessionContext();
  const out = feed(ctx, [
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Straight" } },
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "forward." } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "po" } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ng" } },
  ]);
  assert.deepEqual(out.map((e) => e.event?.delta), [{ type: "thinking_delta", thinking: "Straight" }, { type: "thinking_delta", thinking: "forward." }, { type: "text_delta", text: "po" }, { type: "text_delta", text: "ng" }]);
  const end = finishTurn(ctx, "end_turn", S);
  assert.equal(end.length, 2);
  assert.deepEqual(end[0].message.content, [{ type: "thinking", thinking: "Straightforward." }, { type: "text", text: "pong" }]);
  assert.equal(end[1].type, "result");
  assert.equal(end[1].subtype, "success");
  assert.equal(end[1].session_id, S);
});

test("kiro acp: a shell call is announced twice by kiro and becomes one card, with kiro's rawOutput read as stdout", () => {
  const ctx = newSessionContext();
  const id = "toolu_bdrk_011UgbpmnEDyByKY2RKmtT2H";
  const first = feed(ctx, [
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Running." } },
    { sessionUpdate: "tool_call", toolCallId: id, title: "shell", kind: "execute", status: "in_progress" },
  ]);
  assert.equal(first.filter((e) => e.type === "assistant").length, 0, "a title alone is not a card yet");
  const second = feed(ctx, [
    { sessionUpdate: "tool_call", toolCallId: id, title: "Running: echo hi", kind: "execute", rawInput: { __tool_use_purpose: "Executar echo hi.", command: "echo hi" }, _meta: { kiro: { toolName: "shell" } } },
  ]);
  assert.equal(second.length, 2);
  assert.deepEqual(second[0].message.content, [{ type: "text", text: "Running." }]);
  assert.deepEqual(second[1].message.content, [{ type: "tool_use", id, name: "shell", input: { command: "echo hi", description: "Executar echo hi." } }]);
  assert.deepEqual(feed(ctx, [{ sessionUpdate: "tool_call", toolCallId: id, title: "Running: echo hi", kind: "execute", rawInput: { command: "echo hi" } }]), [], "a repeat of an announced call is not a second card");
  const streamed = feed(ctx, [{ sessionUpdate: "tool_call_update", toolCallId: id, content: [{ type: "content", content: { type: "text", text: "hi\n" } }] }]);
  assert.deepEqual(streamed, []);
  const done = feed(ctx, [
    { sessionUpdate: "tool_call_update", toolCallId: id, kind: "execute", status: "completed", title: "Running: echo hi", rawOutput: { items: [{ Json: { exit_status: "exit status: 0", stdout: "hi\n", stderr: "" } }] } },
  ]);
  assert.equal(done.length, 1);
  assert.deepEqual(done[0].message.content, [{ type: "tool_result", tool_use_id: id, content: "hi\n", is_error: false }]);
  assert.equal(ctx.open.size, 0);
});

test("kiro acp: a non-zero exit is an error result, a failed status too, and an open call closes on cancel", () => {
  assert.deepEqual(toolOutcome({ items: [{ Json: { exit_status: "exit status: 2", stdout: "", stderr: "no such file" } }] }), { text: "no such file\nexit status: 2", failed: true });
  assert.deepEqual(toolOutcome(undefined, "streamed"), { text: "streamed", failed: false });
  assert.deepEqual(toolOutcome("plain"), { text: "plain", failed: false });
  assert.deepEqual(toolOutcome({ items: [{ Text: "a" }, { text: "b" }, "c"] }), { text: "a\nb\nc", failed: false });
  assert.deepEqual(toolOutcome({ ok: true }), { text: '{"ok":true}', failed: false });
  const ctx = newSessionContext();
  feed(ctx, [{ sessionUpdate: "tool_call", toolCallId: "t1", title: "Reading .mcp.json:1", kind: "read", rawInput: { path: ".mcp.json", __tool_use_purpose: "look" } }]);
  const b = feed(ctx, [{ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "failed", content: [{ type: "content", content: { type: "text", text: "boom" } }] }]);
  assert.deepEqual(b[0].message.content, [{ type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true }]);
  feed(ctx, [{ sessionUpdate: "tool_call", toolCallId: "t2", title: "Writing src/a.js", kind: "edit", rawInput: { path: "src/a.js", command: "create", file_text: "x" } }]);
  feed(ctx, [{ sessionUpdate: "tool_call", toolCallId: "t3", title: "web_fetch", kind: "fetch" }]);
  const end = finishTurn(ctx, "cancelled", S);
  assert.equal(end.filter((e) => e.type === "user").length, 2);
  assert.ok(end.filter((e) => e.type === "user").every((e) => e.message.content[0].is_error));
  assert.equal(end.at(-1).subtype, "interrupted");
  assert.equal(ctx.open.size, 0);
});

test("kiro acp: tool names come from kiro's meta, mcp tools keep the hive's mcp__server__tool shape", () => {
  assert.equal(toolName({ title: "Running: echo hi", kind: "execute", _meta: { kiro: { toolName: "shell" } } }), "shell");
  assert.equal(toolName({ title: "Running: @hive/peers", kind: "other" }), "mcp__hive__peers");
  assert.equal(toolName({ title: "peers", kind: "other", _meta: { kiro: { toolName: "@hive/peers" } } }), "mcp__hive__peers");
  assert.equal(toolName({ title: "Reading .mcp.json:1", kind: "read" }), "read");
  assert.equal(toolName({ title: "write", kind: "edit" }), "edit");
  assert.equal(toolName({ title: "Something Odd", kind: "" }), "something_odd");
  assert.equal(toolName({ title: "", kind: "search" }), "search");
  assert.deepEqual(toolInput("shell", { command: "ls" }, "Running: ls"), { command: "ls" });
  assert.deepEqual(toolInput("read", { path: "a.md", __tool_use_purpose: "x", start_line: 1 }, ""), { file_path: "a.md", start_line: 1 });
  assert.deepEqual(toolInput("mcp__hive__peers", { __tool_use_purpose: "x" }, ""), {});
  assert.deepEqual(toolInput("edit", "not an object", "Writing a.js"), { description: "Writing a.js" });
});

test("kiro acp: kiro's own notifications feed effort, credits, commands, mcp servers and tools into the context, and survive the turn", () => {
  const ctx = newSessionContext();
  const out = feed(ctx, [
    ext("_kiro.dev/metadata", { contextUsagePercentage: 7.34 }),
    ext("_kiro.dev/commands/available", { commands: [{ name: "/model" }, { name: "/effort" }], tools: [{ name: "peers", source: "mcp:hive" }, { name: "code", source: "built-in" }], mcpServers: [{ name: "hive", status: "running", toolCount: 1 }] }),
    ext("_kiro.dev/metadata", { contextUsagePercentage: 3.05, meteringUsage: [{ value: 0.23, unit: "credit" }, { value: 0.12, unit: "credit" }], turnDurationMs: 6333, effort: "high" }),
    ext("_kiro.dev/subagent/list_update", { subagents: [] }),
    ext("_kiro.dev/session/update", { update: { sessionUpdate: "tool_call_chunk", toolCallId: "x", title: "shell" } }),
  ]);
  assert.deepEqual(out, []);
  assert.equal(ctx.percent, 3.05);
  assert.equal(ctx.effort, "high");
  assert.ok(Math.abs(ctx.credits - 0.35) < 1e-9);
  assert.deepEqual(ctx.commands, ["model", "effort"]);
  assert.equal(ctx.open.size, 0, "kiro's early tool_call_chunk preview opens nothing");
  const next = carryOver(ctx);
  assert.equal(next.percent, 3.05);
  assert.equal(next.effort, "high");
  assert.deepEqual(next.mcp, [{ name: "hive", status: "running", toolCount: 1 }]);
  assert.equal(next.tools.length, 2);
  assert.equal(next.text, "");
  assert.deepEqual(mcpStatus(next.mcp, next.tools), [{ name: "hive", status: "connected", error: "", tools: ["peers"] }]);
  assert.deepEqual(mcpStatus([{ name: "figma", status: "loading", authenticating: true }, { name: "x", status: "failed to start" }, { name: "y", status: "starting" }, { name: "z", status: "running", authenticating: true }]).map((s) => s.status), ["needs-auth", "failed", "pending", "connected"]);
  const warnings = feed(ctx, [
    ext("_kiro.dev/mcp/server_init_failure", { serverName: "hive", error: "connection closed: initialize response" }),
    ext("_kiro.dev/mcp/oauth_request", { serverName: "figma", oauthUrl: "https://figma.com/oauth?state=1" }),
    ext("_kiro.dev/mcp/oauth_request", { serverName: "figma", oauthUrl: "https://figma.com/oauth?state=1" }),
    ext("_kiro.dev/mcp/oauth_request", { serverName: "linear", oauthUrl: "https://linear.app/oauth" }),
    ext("_kiro.dev/mcp/server_initialized", { serverName: "linear" }),
  ]);
  assert.deepEqual(warnings.map((w) => [w.type, w.subtype]), [["driver", "warning"]], "a login request is not a warning per server: the /mcp card carries it");
  assert.match(warnings[0].message, /hive did not start: connection closed/);
  assert.deepEqual(ctx.oauth, { figma: "https://figma.com/oauth?state=1" });
  const card = mcpStatus([{ name: "figma", status: "loading", toolCount: 0, authenticating: false }, { name: "linear", status: "running", toolCount: 3 }], [], carryOver(ctx).oauth);
  assert.deepEqual(card, [{ name: "figma", status: "needs-auth", error: "", tools: [], login_url: "https://figma.com/oauth?state=1" }, { name: "linear", status: "connected", error: "", tools: [] }]);
});

test("kiro acp: /context is read from kiro's own breakdown, the window derived from the percentage", () => {
  const data = { model: "claude-sonnet-5", contextUsagePercentage: 2, breakdown: { contextFiles: { tokens: 7347 }, tools: { tokens: 7275 }, kiroResponses: { tokens: 200 }, yourPrompts: { tokens: 178 }, sessionFiles: { tokens: 0 } } };
  const u = contextUsage(data, "fallback-model", 9);
  assert.equal(u.model, "claude-sonnet-5");
  assert.equal(u.totalTokens, 15000);
  assert.equal(u.maxTokens, 750000);
  assert.equal(u.percentage, 2);
  assert.deepEqual(u.categories.map((c) => c.name), ["context files", "tools", "your prompts", "kiro responses"]);
  const bare = contextUsage(undefined, "m", 4.5);
  assert.equal(bare.model, "m");
  assert.equal(bare.percentage, 4.5);
  assert.equal(bare.totalTokens, 0);
  assert.deepEqual(bare.categories, [{ name: "context", tokens: 0, color: "var(--blue)" }]);
});

test("kiro acp: while a stored session replays on load, nothing is written twice; compaction status reaches whoever waits on it", () => {
  const ctx = newSessionContext();
  ctx.muted = true;
  const replay = feed(ctx, [
    { sessionUpdate: "user_message_chunk", content: { type: "text", text: "old prompt" } },
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "old answer" } },
    { sessionUpdate: "tool_call", toolCallId: "old", title: "shell", kind: "execute", rawInput: { command: "ls" } },
  ]);
  assert.deepEqual(replay, []);
  assert.equal(ctx.text, "");
  assert.equal(ctx.open.size, 0);
  ctx.muted = false;
  const seen = [];
  ctx.onCompaction = (status, summary) => seen.push([status, summary]);
  feed(ctx, [ext("_kiro.dev/compaction/status", { status: { type: "started" }, summary: null }), ext("_kiro.dev/compaction/status", { status: { type: "completed" }, summary: "short" })]);
  assert.deepEqual(seen, [["started", null], ["completed", "short"]]);
  assert.equal(ctx.compaction, "completed");
});

test("kiro acp: a refusal and an error end the turn as errors, max_tokens keeps its stop reason, the checklist is a note and never a plan", () => {
  assert.equal(finishTurn(newSessionContext(), "refusal", S).at(-1).subtype, "error");
  const err = finishTurn(newSessionContext(), "", S, "kiro broke").at(-1);
  assert.equal(err.is_error, true);
  assert.equal(err.result, "kiro broke");
  const capped = finishTurn(newSessionContext(), "max_tokens", S).at(-1);
  assert.equal(capped.subtype, "success");
  assert.equal(capped.stop_reason, "max_tokens");
  const ctx = newSessionContext();
  const list = feed(ctx, [{ sessionUpdate: "plan", entries: [{ content: "read", status: "completed" }, { content: "write", status: "pending" }] }]);
  assert.deepEqual(list, [{ type: "driver", subtype: "todo", text: "✓ read\n· write" }], "acp calls it a plan; in the hive a plan stops the seat, so this goes out as a todo");
});

test("kiro acp: servers whose tool schemas the model refuses through kiro are left out, and the env can change the list", () => {
  const opts = { seat: "orca", base: "/h", gateway: { port: 4671, servers: ["nng"] }, remote: [{ name: "360dialog", url: "https://mcp.360dialog.io/mcp", headers: {} }, { name: "linear", url: "https://mcp.linear.app/mcp", headers: {} }] };
  const byDefault = kiroMcpServers(opts, { HIVE_MCP_GATEWAY_TOKEN: "t" });
  assert.deepEqual(byDefault.servers.map((s) => s.name), ["hive", "hub", "linear"]);
  assert.deepEqual(byDefault.skipped, ["360dialog"]);
  assert.deepEqual(SCHEMA_UNSAFE_SERVERS, ["360dialog"]);
  const overridden = kiroMcpServers(opts, { [SKIP_ENV]: "linear, hub" });
  assert.deepEqual(overridden.servers.map((s) => s.name), ["hive", "360dialog"]);
  assert.deepEqual(kiroMcpServers(opts, { [SKIP_ENV]: "" }).skipped, []);
  assert.match(schemaTrouble("Internal error: Encountered an error in the response stream: Bedrock error message: The model returned the following errors: tools.160.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the top level (request_id: x)"), /tool #160.*HIVE_KIRO_MCP_SKIP/);
  assert.equal(schemaTrouble("rate limited"), "");
});
