import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appServerArgs, gatewayMcpConfig, mcpStatusList, codexMcpName, remoteMcpServers, remoteMcpConfig, codexConfigPath, codexStdioServers, codexServersToDisable, disabledMcpConfig, contextUsage, SLASH_COMMANDS, initializeParams, threadParams, resumeParams, turnInput, turnParams, steerParams,
  newThreadContext, translate, codexToolShape, questionFromRequest, answersForCodex, dismissalForCodex, stderrTrouble, serverRequestReply,
} from "../engine/codex-app-server.mjs";
import { peerEntry } from "../engine/peer-module.mjs";

const T = "01a06428-2f9d-76c1-be68-44a052356c23";

const feed = (lines, sessionId = T) => {
  const ctx = newThreadContext();
  const out = [];
  for (const line of lines) out.push(...translate(typeof line === "string" ? JSON.parse(line) : line, ctx, sessionId));
  return { ctx, out };
};

const SHELL_TURN = [
  `{"method":"turn/started","params":{"threadId":"${T}","turn":{"id":"turn-1","items":[],"status":"inProgress"}}}`,
  `{"method":"item/started","params":{"item":{"type":"userMessage","id":"u1","content":[{"type":"text","text":"Run echo hi"}]},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"item/completed","params":{"item":{"type":"userMessage","id":"u1","content":[{"type":"text","text":"Run echo hi"}]},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"item/started","params":{"item":{"type":"agentMessage","id":"msg_1","text":"","phase":"commentary"},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"item/agentMessage/delta","params":{"threadId":"${T}","turnId":"turn-1","itemId":"msg_1","delta":"I’ll"}}`,
  `{"method":"item/agentMessage/delta","params":{"threadId":"${T}","turnId":"turn-1","itemId":"msg_1","delta":" run that."}}`,
  `{"method":"item/completed","params":{"item":{"type":"agentMessage","id":"msg_1","text":"I’ll run that.","phase":"commentary"},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"hook/started","params":{"threadId":"${T}","turnId":"turn-1","run":{"id":"pre-tool-use:0","eventName":"preToolUse"}}}`,
  `{"method":"item/started","params":{"item":{"type":"commandExecution","id":"exec-1","command":"/usr/bin/zsh -lc 'echo hi'","cwd":"/tmp/probe","status":"inProgress","commandActions":[{"type":"unknown","command":"echo hi"}],"aggregatedOutput":null,"exitCode":null},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"item/commandExecution/outputDelta","params":{"threadId":"${T}","turnId":"turn-1","itemId":"exec-1","delta":"h"}}`,
  `{"method":"item/completed","params":{"item":{"type":"commandExecution","id":"exec-1","command":"/usr/bin/zsh -lc 'echo hi'","cwd":"/tmp/probe","status":"completed","commandActions":[{"type":"unknown","command":"echo hi"}],"aggregatedOutput":"hi\\n","exitCode":0,"durationMs":0},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"thread/tokenUsage/updated","params":{"threadId":"${T}","turnId":"turn-1","tokenUsage":{"total":{"totalTokens":13737,"inputTokens":13629,"cachedInputTokens":0,"outputTokens":108},"last":{"totalTokens":13737,"inputTokens":13629,"cachedInputTokens":0,"outputTokens":108},"modelContextWindow":258400}}}`,
  `{"method":"account/rateLimits/updated","params":{"rateLimits":{"limitId":"codex"}}}`,
  `{"method":"item/started","params":{"item":{"type":"reasoning","id":"rs_1","summary":[],"content":[]},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"item/completed","params":{"item":{"type":"reasoning","id":"rs_1","summary":[],"content":[]},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"item/started","params":{"item":{"type":"agentMessage","id":"msg_2","text":"","phase":"final_answer"},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"item/agentMessage/delta","params":{"threadId":"${T}","turnId":"turn-1","itemId":"msg_2","delta":"Done."}}`,
  `{"method":"item/completed","params":{"item":{"type":"agentMessage","id":"msg_2","text":"Done.","phase":"final_answer"},"threadId":"${T}","turnId":"turn-1"}}`,
  `{"method":"thread/tokenUsage/updated","params":{"threadId":"${T}","turnId":"turn-1","tokenUsage":{"total":{"totalTokens":27505,"inputTokens":27391,"cachedInputTokens":11264,"outputTokens":114},"last":{"totalTokens":13768,"inputTokens":13762,"cachedInputTokens":11264,"outputTokens":6},"modelContextWindow":258400}}}`,
  `{"method":"thread/status/changed","params":{"threadId":"${T}","status":{"type":"idle"}}}`,
  `{"method":"turn/completed","params":{"threadId":"${T}","turn":{"id":"turn-1","items":[],"status":"completed","error":null,"durationMs":8592}}}`,
];

test("codex app-server: the spawn carries yolo, the question flag and the hive mcp", () => {
  const args = appServerArgs({ seat: "orca", base: "/Users/dev/.hive" });
  assert.equal(args[0], "app-server");
  assert.ok(args.includes("default_mode_request_user_input"));
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('sandbox_mode="danger-full-access"'));
  const peer = peerEntry();
  assert.ok(args.includes(`mcp_servers.hive={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(peer)}],env={HIVE_SEAT="orca",HIVE_STATE_DIR="/Users/dev/.hive"}}`));
  assert.ok(!appServerArgs().some((a) => a.startsWith("mcp_servers")));
  assert.ok(appServerArgs({ autocompact: 150000 }).includes("model_auto_compact_token_limit=150000"), "the hive's ceiling becomes codex's own auto-compact limit");
  assert.ok(!appServerArgs({ autocompact: 0 }).some((a) => a.startsWith("model_auto_compact")));
  assert.ok(!appServerArgs().some((a) => a.startsWith("model_auto_compact")));
});

test("codex app-server: the hub gateway rides along as one streamable http mcp server named hub", () => {
  const lines = gatewayMcpConfig(["acme-mysql", "signoz"], 4671);
  assert.deepEqual(lines, ['mcp_servers.hub={url="http://127.0.0.1:4671/mcp/hub",bearer_token_env_var="HIVE_MCP_GATEWAY_TOKEN"}'], "however many servers the gateway hosts, codex gets one: hub");
  assert.deepEqual(gatewayMcpConfig([], 4671, false), []);
  assert.equal(gatewayMcpConfig([], 4671).length, 1, "an empty gateway still discovers servers added later");
  assert.equal(codexMcpName("super-postgresql"), "super_postgresql");
  const args = appServerArgs({ seat: "orca", base: "/Users/dev/.hive", gateway: { port: 4671, servers: ["acme-mysql"] } });
  assert.ok(args.includes(lines[0]));
  assert.ok(args.some((a) => a.startsWith("mcp_servers.hive=")));
  const without = appServerArgs({ seat: "orca", base: "/Users/dev/.hive", gateway: null });
  assert.ok(!without.some((a) => a.startsWith("mcp_servers.hub")));
  assert.ok(!appServerArgs({ seat: "orca", base: "/x", gateway: { port: 4671, servers: [], hub: false } }).some((a) => a.startsWith("mcp_servers.hub")));
});

test("codex app-server: the hub's remote http servers ride along too, the gateway's own left to the gateway", () => {
  const mcpJson = JSON.stringify({ mcpServers: {
    figma: { type: "http", url: "https://mcp.figma.com/mcp" },
    "granola-meeting-recording": { type: "http", url: "https://mcp.granola.ai/mcp", headers: { "X-Key": "${GRANOLA_KEY}" } },
    "acme-mysql": { type: "http", url: "http://127.0.0.1:4671/mcp/acme-mysql", headers: { Authorization: "Bearer ${HIVE_MCP_GATEWAY_TOKEN}" } },
    local: { command: "node", args: ["x.mjs"] },
    odd: { type: "sse", url: "https://x/sse" },
  } });
  const remote = remoteMcpServers(mcpJson, 4671);
  assert.deepEqual(remote.map((s) => s.name), ["figma", "granola-meeting-recording"]);
  const lines = remoteMcpConfig(remote, { GRANOLA_KEY: "k1" });
  assert.equal(lines[0], 'mcp_servers.figma={url="https://mcp.figma.com/mcp"}');
  assert.equal(lines[1], 'mcp_servers.granola_meeting_recording={url="https://mcp.granola.ai/mcp",http_headers={"X-Key"="k1"}}');
  assert.deepEqual(remoteMcpServers("not json"), []);
  const args = appServerArgs({ seat: "orca", base: "/x", remote });
  assert.ok(args.includes(lines[0]));
});

test("codex app-server: /context reads the last turn's usage against the model's window", () => {
  assert.ok(SLASH_COMMANDS.includes("context"));
  const ctx = newThreadContext();
  assert.equal(contextUsage(ctx, "gpt-5.6-luna").totalTokens, 0);
  assert.equal(contextUsage(ctx, "gpt-5.6-luna").percentage, 0);
  translate({ method: "thread/tokenUsage/updated", params: { threadId: T, turnId: "turn-1", tokenUsage: {
    total: { totalTokens: 40000, inputTokens: 39000, cachedInputTokens: 11264, outputTokens: 1000, reasoningOutputTokens: 300 },
    last: { totalTokens: 27505, inputTokens: 27391, cachedInputTokens: 11264, outputTokens: 114, reasoningOutputTokens: 40 },
    modelContextWindow: 258400,
  } } }, ctx, T);
  const u = contextUsage(ctx, "gpt-5.6-luna");
  assert.equal(u.model, "gpt-5.6-luna");
  assert.equal(u.maxTokens, 258400);
  assert.equal(u.totalTokens, 27505);
  assert.ok(u.percentage > 10 && u.percentage < 11);
  assert.deepEqual(u.categories.map((c) => [c.name, c.tokens]), [["cached input", 11264], ["fresh input", 16127], ["output", 74], ["reasoning", 40]]);
  assert.equal(u.categories.reduce((n, c) => n + c.tokens, 0), 27505);
});

test("codex app-server: mcpServerStatus/list becomes the rows the /mcp card paints", () => {
  const rows = mcpStatusList({ data: [
    { name: "db_diagram", serverInfo: { name: "db-diagram-mcp-server (hub)" }, tools: { a: {}, b: {} }, authStatus: "bearerToken" },
    { name: "hubspot", serverInfo: null, tools: {}, authStatus: "bearerToken" },
  ] });
  assert.deepEqual(rows[0], { name: "db_diagram", status: "connected", error: "", tools: ["a", "b"] });
  assert.equal(rows[1].status, "failed");
  assert.ok(rows[1].error);
  assert.deepEqual(mcpStatusList(null), []);
  const [figma] = mcpStatusList({ data: [{ name: "figma", serverInfo: null, tools: {}, authStatus: "notLoggedIn" }] });
  assert.equal(figma.status, "needs-auth");
  assert.equal(figma.error, "");
});

test("codex app-server: initialize opts into the experimental api", () => {
  assert.deepEqual(initializeParams().capabilities, { experimentalApi: true });
  assert.equal(initializeParams().clientInfo.name, "hive");
});

test("codex app-server: thread params are explicit on start and on resume", () => {
  const start = threadParams({ cwd: "/repo", model: "gpt-5.6", preamble: "You are seat orca" });
  assert.deepEqual(start, { cwd: "/repo", approvalPolicy: "never", sandbox: "danger-full-access", model: "gpt-5.6", developerInstructions: "You are seat orca" });
  const back = resumeParams("thread-1", { cwd: "/repo" });
  assert.equal(back.threadId, "thread-1");
  assert.equal(back.sandbox, "danger-full-access");
  assert.equal("model" in back, false);
});

test("codex app-server: image marks in the text become localImage items in place", () => {
  const input = turnInput("look at [Image #1] and tell me", ["/tmp/a.png"]);
  assert.deepEqual(input, [
    { type: "text", text: "look at " },
    { type: "localImage", path: "/tmp/a.png" },
    { type: "text", text: " and tell me" },
  ]);
  assert.deepEqual(turnInput("hi", ["/tmp/b.png"]), [{ type: "localImage", path: "/tmp/b.png" }, { type: "text", text: "hi" }]);
  assert.deepEqual(turnInput("(image)", []), [{ type: "text", text: "(image)" }]);
});

test("codex app-server: turn and steer params carry model and effort only when set", () => {
  const plain = turnParams({ threadId: "t", text: "hi" });
  assert.deepEqual(plain, { threadId: "t", input: [{ type: "text", text: "hi" }] });
  const picked = turnParams({ threadId: "t", text: "hi", model: "gpt-5.6", effort: "high" });
  assert.equal(picked.model, "gpt-5.6");
  assert.equal(picked.effort, "high");
  assert.deepEqual(steerParams({ threadId: "t", turnId: "turn-9", text: "also this" }), { threadId: "t", expectedTurnId: "turn-9", input: [{ type: "text", text: "also this" }] });
});

test("codex app-server: agentMessage deltas stream and the completed item lands as assistant text", () => {
  const { out } = feed(SHELL_TURN);
  const deltas = out.filter((e) => e.type === "stream_event");
  assert.equal(deltas.length, 3);
  assert.equal(deltas[0].event.delta.type, "text_delta");
  assert.equal(deltas[0].event.delta.text, "I’ll");
  const texts = out.filter((e) => e.type === "assistant" && e.message.content[0].type === "text").map((e) => e.message.content[0].text);
  assert.deepEqual(texts, ["I’ll run that.", "Done."]);
});

test("codex app-server: commandExecution pairs a shell tool_use with its result, keeping the final output", () => {
  const { out } = feed(SHELL_TURN);
  const use = out.find((e) => e.type === "assistant" && e.message.content[0].type === "tool_use");
  assert.equal(use.message.content[0].id, "exec-1");
  assert.equal(use.message.content[0].name, "shell");
  assert.equal(use.message.content[0].input.command, "/usr/bin/zsh -lc 'echo hi'");
  const result = out.find((e) => e.type === "user");
  assert.equal(result.message.content[0].tool_use_id, "exec-1");
  assert.equal(result.message.content[0].content, "hi\n");
  assert.equal(result.message.content[0].is_error, false);
  assert.ok(out.indexOf(use) < out.indexOf(result));
});

test("codex app-server: empty reasoning items, user messages, hooks and rate limits make no event", () => {
  const { out } = feed(SHELL_TURN);
  assert.ok(!out.some((e) => e.type === "assistant" && e.message.content[0].type === "thinking"));
  assert.deepEqual(out.filter((e) => e.type === "driver"), [{ type: "driver", subtype: "turn_started" }]);
  assert.equal(out.filter((e) => e.type === "assistant").length, 3);
});

test("codex app-server: reasoning with a summary becomes a thinking block", () => {
  const { out } = feed([
    `{"method":"item/reasoning/summaryTextDelta","params":{"threadId":"${T}","turnId":"turn-1","itemId":"rs_2","contentIndex":0,"delta":"Thinking about"}}`,
    `{"method":"item/completed","params":{"item":{"type":"reasoning","id":"rs_2","summary":["Thinking about the file"],"content":[]},"threadId":"${T}","turnId":"turn-1"}}`,
  ]);
  assert.equal(out[0].type, "stream_event");
  assert.equal(out[0].event.delta.type, "thinking_delta");
  assert.equal(out[1].message.content[0].type, "thinking");
  assert.equal(out[1].message.content[0].thinking, "Thinking about the file");
});

test("codex app-server: usage sums each model call of the turn and the result carries it", () => {
  const { ctx, out } = feed(SHELL_TURN);
  assert.equal(ctx.usage.input_tokens, 13629 + 13762);
  assert.equal(ctx.usage.output_tokens, 108 + 6);
  assert.equal(ctx.usage.cache_read_input_tokens, 11264);
  assert.equal(ctx.contextWindow, 258400);
  const result = out.at(-1);
  assert.equal(result.type, "result");
  assert.equal(result.subtype, "success");
  assert.equal(result.is_error, false);
  assert.equal(result.session_id, T);
  assert.equal(result.usage.input_tokens, 13629 + 13762);
});

test("codex app-server: turn/started remembers the active turn and turn/completed forgets it", () => {
  const ctx = newThreadContext();
  translate(JSON.parse(SHELL_TURN[0]), ctx);
  assert.equal(ctx.turnId, "turn-1");
  translate(JSON.parse(SHELL_TURN.at(-1)), ctx);
  assert.equal(ctx.turnId, "");
});

test("codex app-server: an interrupted turn closes the open tools as errors and ends as interrupted", () => {
  const { out } = feed([
    SHELL_TURN[0],
    `{"method":"item/started","params":{"item":{"type":"commandExecution","id":"exec-slow","command":"sleep 30","cwd":"/tmp","status":"inProgress","commandActions":[]},"threadId":"${T}","turnId":"turn-1"}}`,
    `{"method":"item/commandExecution/outputDelta","params":{"threadId":"${T}","turnId":"turn-1","itemId":"exec-slow","delta":"partial"}}`,
    `{"method":"turn/completed","params":{"threadId":"${T}","turn":{"id":"turn-1","items":[],"status":"interrupted","error":null}}}`,
  ]);
  const closed = out.find((e) => e.type === "user");
  assert.equal(closed.message.content[0].tool_use_id, "exec-slow");
  assert.equal(closed.message.content[0].content, "partial");
  assert.equal(closed.message.content[0].is_error, true);
  assert.equal(out.at(-1).subtype, "interrupted");
  assert.equal(out.at(-1).is_error, false);
});

test("codex app-server: a failed turn ends as an error carrying the message", () => {
  const { out } = feed([
    `{"method":"error","params":{"threadId":"${T}","turnId":"turn-1","error":{"message":"rate limited"},"willRetry":true}}`,
    `{"method":"turn/completed","params":{"threadId":"${T}","turn":{"id":"turn-1","items":[],"status":"failed","error":{"message":"the model gave up"}}}}`,
  ]);
  assert.equal(out[0].type, "driver");
  assert.equal(out[0].message, "retrying: rate limited");
  assert.equal(out[1].subtype, "error");
  assert.equal(out[1].is_error, true);
  assert.equal(out[1].result, "the model gave up");
});

test("codex app-server: fileChange becomes an edit card whose result is the diff", () => {
  const { out } = feed([
    `{"method":"item/started","params":{"item":{"type":"fileChange","id":"exec-fc","changes":[{"path":"/tmp/probe/note.txt","kind":{"type":"add"},"diff":"hello\\n"}],"status":"inProgress"},"threadId":"${T}","turnId":"turn-2"}}`,
    `{"method":"turn/diff/updated","params":{"threadId":"${T}","turnId":"turn-2","diff":"diff --git a/note.txt b/note.txt"}}`,
    `{"method":"item/completed","params":{"item":{"type":"fileChange","id":"exec-fc","changes":[{"path":"/tmp/probe/note.txt","kind":{"type":"add"},"diff":"hello\\n"}],"status":"completed"},"threadId":"${T}","turnId":"turn-2"}}`,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].message.content[0].name, "edit");
  assert.equal(out[0].message.content[0].input.file_path, "add /tmp/probe/note.txt");
  assert.equal(out[1].message.content[0].content, "hello\n");
  assert.equal(out[1].message.content[0].is_error, false);
});

test("codex app-server: a completed tool never seen as started still makes both events", () => {
  const { out } = feed([
    `{"method":"item/completed","params":{"item":{"type":"mcpToolCall","id":"call-9","server":"hive","tool":"peers","arguments":{},"result":{"content":[{"type":"text","text":"orca, gato"}]},"status":"completed"},"threadId":"${T}","turnId":"turn-3"}}`,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].message.content[0].type, "tool_use");
  assert.equal(out[0].message.content[0].name, "peers");
  assert.equal(out[1].message.content[0].type, "tool_result");
  assert.match(out[1].message.content[0].content, /orca, gato/);
});

test("codex app-server: a declined command and an mcp error read as failures", () => {
  assert.equal(codexToolShape({ type: "commandExecution", command: "rm -rf /", status: "declined" }).failed, true);
  assert.equal(codexToolShape({ type: "mcpToolCall", tool: "x", status: "completed", error: "boom" }).failed, true);
  assert.equal(codexToolShape({ type: "fileChange", changes: [{ path: "a", kind: { type: "update", move_path: "b" } }], status: "completed" }).input.file_path, "update a → b");
});

test("codex app-server: context compaction marks a boundary the app already knows how to draw", () => {
  const { out } = feed([
    SHELL_TURN[11],
    `{"method":"item/started","params":{"item":{"type":"contextCompaction","id":"cc-1"},"threadId":"${T}","turnId":"turn-4"}}`,
    `{"method":"item/completed","params":{"item":{"type":"contextCompaction","id":"cc-1"},"threadId":"${T}","turnId":"turn-4"}}`,
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "system");
  assert.equal(out[0].subtype, "compact_boundary");
  assert.equal(out[0].compact_metadata.pre_tokens, 13737);
});

const QUESTION = {
  threadId: T, turnId: "turn-5", itemId: "call_0i4ScoLlahz7AEfbWrHV56gr",
  questions: [{ id: "preferred_color", header: "Color", question: "Which color do you prefer?", isOther: true, isSecret: false, options: [{ label: "Red (Recommended)", description: "Choose red." }, { label: "Blue", description: "Choose blue." }] }],
  autoResolutionMs: null,
};

test("codex app-server: requestUserInput becomes the same question card the claude seat shows", () => {
  const q = questionFromRequest(QUESTION);
  assert.equal(q.id, "call_0i4ScoLlahz7AEfbWrHV56gr");
  assert.equal(q.questions.length, 1);
  assert.equal(q.questions[0].question, "Which color do you prefer?");
  assert.equal(q.questions[0].header, "Color");
  assert.deepEqual(q.questions[0].options.map((o) => o.label), ["Red (Recommended)", "Blue"]);
  assert.equal(q.questions[0].multiSelect, false);
  assert.equal(q.questions[0].codexId, "preferred_color");
});

test("codex app-server: the answer from the card goes back keyed by the codex question id", () => {
  const q = questionFromRequest(QUESTION);
  const reply = answersForCodex(q.questions, { "Which color do you prefer?": "Blue" });
  assert.deepEqual(reply, { answers: { preferred_color: { answers: ["Blue"] } } });
  const missing = answersForCodex(q.questions, {});
  assert.match(missing.error, /missing answer/);
});

test("codex app-server: a message typed over the card answers it with the dev's words", () => {
  const q = questionFromRequest(QUESTION);
  const reply = dismissalForCodex(q.questions, "blue, obviously");
  assert.match(reply.answers.preferred_color.answers[0], /blue, obviously$/);
  assert.match(reply.answers.preferred_color.answers[0], /did not pick any of the options/);
});

test("codex app-server: only ERROR lines of stderr reach the seat, and known noise does not", () => {
  assert.equal(stderrTrouble("2026-09-02T21:44:54.254615Z ERROR codex_core::tools::router: error=request_user_input is unavailable in Default mode"), "error=request_user_input is unavailable in Default mode");
  assert.equal(stderrTrouble("\x1b[2m2026-09-02T21:44:54Z\x1b[0m \x1b[31mERROR\x1b[0m \x1b[2mcodex_core::x\x1b[0m\x1b[2m:\x1b[0m boom"), "boom");
  assert.equal(stderrTrouble("2026-09-02T21:44:54Z WARN codex_core::x: meh"), null);
  assert.equal(stderrTrouble("2026-09-02T21:44:54Z ERROR codex_core::state: state db missing rollout path for thread abc"), null);
  assert.equal(stderrTrouble("plain text"), null);
  assert.equal(stderrTrouble('2026-09-02T23:45:02Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when UnexpectedServerResponse("HTTP 500")'), null);
});

test("codex app-server: approvals are accepted in yolo and elicitations declined", () => {
  assert.deepEqual(serverRequestReply("item/commandExecution/requestApproval", {}), { decision: "accept" });
  assert.deepEqual(serverRequestReply("item/fileChange/requestApproval", {}), { decision: "accept" });
  assert.deepEqual(serverRequestReply("mcpServer/elicitation/request", {}), { action: "decline" });
  assert.equal(serverRequestReply("item/tool/requestUserInput", {}), null);
});

test("codex app-server: the stdio servers of config.toml that the gateway already serves are disabled, the rest kept", () => {
  const toml = `
model = "gpt-5"

[mcp_servers.acme_mysql]
command = "npx"
args = ["-y", "@acme/mysql-mcp"]

[mcp_servers.acme_mysql.env]
MYSQL_HOST = "x"

[mcp_servers."super-postgresql_direnv"]
command = "direnv"

[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"

[mcp_servers.playwright]
command = "npx"

mcp_servers.hubspot = { command = "npx", args = ["-y", "@acme/hubspot-mcp"] }
mcp_servers.linear = { url = "https://mcp.linear.app/mcp" }
`;
  assert.deepEqual(codexStdioServers(toml), ["acme_mysql", "super-postgresql_direnv", "playwright", "hubspot"]);
  assert.deepEqual(codexStdioServers(""), []);
  const { disabled, kept } = codexServersToDisable(codexStdioServers(toml), ["acme-mysql", "super-postgresql", "hubspot", "clickhouse"]);
  assert.deepEqual(disabled, ["acme_mysql", "super-postgresql_direnv", "hubspot"]);
  assert.deepEqual(kept, ["playwright"]);
  assert.deepEqual(disabledMcpConfig(disabled), ["mcp_servers.acme_mysql.enabled=false", "mcp_servers.super_postgresql_direnv.enabled=false", "mcp_servers.hubspot.enabled=false"]);
  const args = appServerArgs({ seat: "orca", base: "/x", gateway: { port: 4671, servers: ["acme-mysql"] }, disabled });
  assert.ok(args.includes("mcp_servers.acme_mysql.enabled=false"));
  assert.ok(!appServerArgs({ seat: "orca", base: "/x" }).some((a) => a.endsWith(".enabled=false")));
  assert.equal(codexConfigPath({ CODEX_HOME: "/accounts/b/.codex" }), "/accounts/b/.codex/config.toml");
  assert.ok(codexConfigPath({}).endsWith("/.codex/config.toml"));
});
