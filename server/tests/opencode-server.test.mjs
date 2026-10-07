import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SLASH_COMMANDS, serveArgs, serveEnv, listeningUrl, newPassword, basicAuth, permissionRuleset, sessionParams, parseModel, newMessageId, filePart, promptParts, promptParams, summarizeParams,
  newSessionContext, carryOver, translate, errorText, contextUsage, questionFromEvent, answersForOpencode, dismissalForOpencode, catalogFromProviders, mcpStatusList, sessionFellThrough,
} from "../engine/opencode-server.mjs";

const S = "ses_f938f1bbaffepP7I2JvwUSCKNl";
const M = "msg_06c70e5bc001akI5xJF2UvFQZf";

const ev = (type, properties) => ({ id: "evt_1", type, properties });
const part = (extra) => ({ id: "prt_1", sessionID: S, messageID: M, ...extra });

const feed = (events, sessionId = S) => {
  const ctx = newSessionContext();
  ctx.turnActive = true;
  const out = [];
  for (const one of events) out.push(...translate(one, ctx, sessionId));
  return { ctx, out };
};

const A_TURN = [
  ev("message.updated", { sessionID: S, info: { id: "msg_user", role: "user", sessionID: S } }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_u", messageID: "msg_user", type: "text", text: "Run echo hi", time: { start: 1, end: 2 } }) }),
  ev("session.status", { sessionID: S, status: { type: "busy" } }),
  ev("message.updated", { sessionID: S, info: { id: M, role: "assistant", sessionID: S, modelID: "big-pickle", providerID: "opencode" } }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_r", type: "reasoning", text: "", time: { start: 1 } }) }),
  ev("message.part.delta", { sessionID: S, messageID: M, partID: "prt_r", field: "text", delta: "The user wants" }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_r", type: "reasoning", text: "The user wants echo.", time: { start: 1, end: 2 } }) }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_t", type: "tool", callID: "call_1", tool: "bash", state: { status: "pending", input: {}, raw: "" } }) }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_t", type: "tool", callID: "call_1", tool: "bash", state: { status: "running", input: { command: "echo hi" }, title: "echo hi", time: { start: 1 } } }) }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_t", type: "tool", callID: "call_1", tool: "bash", state: { status: "completed", input: { command: "echo hi" }, output: "hi\n", title: "echo hi", metadata: { exit: 0 }, time: { start: 1, end: 2 } } }) }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_s", type: "step-finish", reason: "tool-calls", cost: 0, tokens: { total: 8816, input: 6921, output: 103, reasoning: 0, cache: { write: 0, read: 1792 } } }) }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_a", type: "text", text: "", time: { start: 3 } }) }),
  ev("message.part.delta", { sessionID: S, messageID: M, partID: "prt_a", field: "text", delta: "Done" }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_a", type: "text", text: "Done.", time: { start: 3, end: 4 } }) }),
  ev("message.part.updated", { sessionID: S, part: part({ id: "prt_s2", type: "step-finish", reason: "stop", cost: 0.001, tokens: { total: 9000, input: 7000, output: 200, reasoning: 0, cache: { write: 0, read: 1800 } } }) }),
  ev("session.status", { sessionID: S, status: { type: "idle" } }),
  ev("session.idle", { sessionID: S }),
];

test("the server is started on the port the seat picked, with the password and the hive's tools in its config env", () => {
  assert.deepEqual(serveArgs({ port: 4123 }), ["serve", "--hostname", "127.0.0.1", "--port", "4123"]);
  const env = serveEnv({ seat: "orca", base: "/b", gateway: { port: 4671, servers: ["linear"] }, password: "pw", env: { HIVE_MCP_GATEWAY_TOKEN: "t" } });
  assert.equal(env.OPENCODE_SERVER_PASSWORD, "pw");
  const parsed = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  assert.equal(parsed.mcp.hive.environment.HIVE_SEAT, "orca");
  assert.equal(parsed.mcp.hub.url, "http://127.0.0.1:4671/mcp/hub", "the gateway rides as one server, hub");
  assert.deepEqual(serveEnv({}), {}, "with nothing to hand over there is no env to force");
  assert.equal(listeningUrl("opencode server listening on http://127.0.0.1:4096\n"), "http://127.0.0.1:4096");
  assert.equal(listeningUrl("Warning: OPENCODE_SERVER_PASSWORD is not set"), "");
  assert.match(newPassword(), /^[A-Za-z0-9_-]{20,}$/);
  assert.equal(basicAuth("pw"), `Basic ${Buffer.from("opencode:pw").toString("base64")}`);
});

test("a seat's session runs like every other hive seat — nothing waits on an approval — and the question tool stays a card", () => {
  assert.deepEqual(permissionRuleset(), [{ permission: "*", pattern: "*", action: "allow" }, { permission: "question", pattern: "*", action: "allow" }]);
  assert.deepEqual(sessionParams({ title: "orca" }), { permission: permissionRuleset(), title: "orca" });
  assert.deepEqual(Object.keys(sessionParams()), ["permission"]);
  assert.deepEqual(SLASH_COMMANDS, ["model", "effort", "compact", "mcp", "context"]);
});

test("a model is provider/model, a message id is opencode's own shape, and a prompt carries text, images and the variant", () => {
  assert.deepEqual(parseModel("opencode/big-pickle"), { providerID: "opencode", modelID: "big-pickle" });
  assert.deepEqual(parseModel("github-copilot/claude-opus-5"), { providerID: "github-copilot", modelID: "claude-opus-5" });
  assert.equal(parseModel("big-pickle"), null);
  assert.equal(parseModel("opencode/"), null);
  const id = newMessageId(1788525732961, () => Buffer.from("abcdefghijklmnopqrstuvwxyz"));
  assert.match(id, /^msg_[0-9a-f]{12}[A-Za-z0-9]{14}$/);
  assert.equal(id.slice(4, 16), "01a06c70e451".slice(0, 12).replace("01a06c70e451", (1788525732961).toString(16).padStart(12, "0")));
  assert.deepEqual(filePart("/tmp/shot.png"), { type: "file", mime: "image/png", filename: "shot.png", url: "file:///tmp/shot.png" });
  assert.deepEqual(promptParts("look [Image #1] here", ["/tmp/a.jpg"]), [{ type: "text", text: "look " }, filePart("/tmp/a.jpg"), { type: "text", text: " here" }]);
  assert.deepEqual(promptParts("plain", []), [{ type: "text", text: "plain" }]);
  const params = promptParams({ messageID: "msg_x", text: "hi", model: "opencode/big-pickle", effort: "high" });
  assert.deepEqual(params, { messageID: "msg_x", agent: "build", parts: [{ type: "text", text: "hi" }], model: { providerID: "opencode", modelID: "big-pickle" }, variant: "high" });
  assert.deepEqual(Object.keys(promptParams({ messageID: "msg_x", text: "hi" })), ["messageID", "agent", "parts"], "no model means opencode's own default, no variant means none");
  assert.deepEqual(summarizeParams("opencode/big-pickle"), { providerID: "opencode", modelID: "big-pickle", auto: false });
  assert.equal(summarizeParams(""), null);
});

test("one turn on the event stream becomes the hive's transcript: thinking, tool use with its result, the answer, the tokens and the result", () => {
  const { ctx, out } = feed(A_TURN);
  const types = out.map((e) => `${e.type}${e.subtype ? `/${e.subtype}` : ""}${e.message?.content?.[0]?.type ? `:${e.message.content[0].type}` : ""}`);
  assert.deepEqual(types, ["stream_event", "assistant:thinking", "assistant:tool_use", "user:tool_result", "stream_event", "assistant:text", "result/success"]);
  assert.equal(out[0].event.delta.thinking, "The user wants");
  assert.equal(out[1].message.content[0].thinking, "The user wants echo.");
  assert.deepEqual(out[2].message.content[0], { type: "tool_use", id: "call_1", name: "bash", input: { command: "echo hi" } });
  assert.deepEqual(out[3].message.content[0], { type: "tool_result", tool_use_id: "call_1", content: "hi\n", is_error: false });
  assert.equal(out[4].event.delta.text, "Done");
  assert.equal(out[5].message.content[0].text, "Done.");
  const result = out[6];
  assert.equal(result.subtype, "success");
  assert.equal(result.is_error, false);
  assert.deepEqual(result.usage, { input_tokens: 13921, output_tokens: 303, cache_read_input_tokens: 3592 });
  assert.equal(result.total_cost_usd, 0.001);
  assert.equal(result.session_id, S);
  assert.equal(ctx.contextTokens, 9000);
  assert.equal(ctx.turnActive, false, "the turn is over once the session went idle");
});

test("the person's own words never come back as the assistant's, and a second idle does not end a turn twice", () => {
  const { out } = feed(A_TURN);
  assert.ok(!out.some((e) => e.type === "assistant" && e.message.content[0].text === "Run echo hi"));
  assert.equal(out.filter((e) => e.type === "result").length, 1);
});

test("a tool that ends in error is a failed result, and a tool never seen running still gets its tool_use before the result", () => {
  const { out } = feed([
    ev("message.updated", { sessionID: S, info: { id: M, role: "assistant" } }),
    ev("message.part.updated", { sessionID: S, part: part({ id: "prt_t", type: "tool", callID: "call_9", tool: "read", state: { status: "error", input: { filePath: "/x" }, error: "no such file", time: { start: 1, end: 2 } } }) }),
  ]);
  assert.equal(out[0].message.content[0].type, "tool_use");
  assert.equal(out[0].message.content[0].name, "read");
  assert.deepEqual(out[1].message.content[0], { type: "tool_result", tool_use_id: "call_9", content: "no such file", is_error: true });
});

test("an error on the session ends the turn as an error with its sentence, an abort ends it as interrupted with open tools closed", () => {
  const failed = feed([
    ev("message.updated", { sessionID: S, info: { id: M, role: "assistant" } }),
    ev("session.error", { sessionID: S, error: { name: "APIError", data: { message: "rate limit exceeded", isRetryable: false, statusCode: 429 } } }),
    ev("session.status", { sessionID: S, status: { type: "idle" } }),
  ]);
  assert.equal(failed.out[0].subtype, "warning");
  assert.match(failed.out[0].message, /APIError: rate limit exceeded/);
  const result = failed.out.at(-1);
  assert.equal(result.subtype, "error");
  assert.equal(result.is_error, true);
  assert.match(result.result, /rate limit exceeded/);

  const aborted = feed([
    ev("message.updated", { sessionID: S, info: { id: M, role: "assistant" } }),
    ev("message.part.updated", { sessionID: S, part: part({ id: "prt_t", type: "tool", callID: "call_1", tool: "bash", state: { status: "running", input: { command: "sleep 99" }, time: { start: 1 } } }) }),
    ev("session.error", { sessionID: S, error: { name: "MessageAbortedError", data: { message: "aborted" } } }),
    ev("session.status", { sessionID: S, status: { type: "idle" } }),
  ]);
  const types = aborted.out.map((e) => e.type);
  assert.deepEqual(types, ["assistant", "user", "result"]);
  assert.equal(aborted.out[1].message.content[0].is_error, true, "the tool that was still running is closed as failed");
  assert.equal(aborted.out[2].subtype, "interrupted");
  assert.equal(aborted.out[2].is_error, false);
});

test("a retry from the provider is a warning, a compaction is a boundary, and other sessions' events are not this seat's", () => {
  const { out } = feed([
    ev("session.status", { sessionID: S, status: { type: "retry", attempt: 2, message: "overloaded", next: 5 } }),
    ev("session.compacted", { sessionID: S }),
    ev("message.part.updated", { sessionID: "ses_other", part: part({ id: "prt_o", sessionID: "ses_other", messageID: "msg_o", type: "text", text: "child says", time: { start: 1, end: 2 } }) }),
    ev("session.idle", { sessionID: "ses_other" }),
  ]);
  assert.equal(out[0].subtype, "warning");
  assert.match(out[0].message, /retrying \(2\): overloaded/);
  assert.equal(out[1].subtype, "compact_boundary");
  assert.equal(out.length, 2);
});

test("the context read after a turn is the last step's tokens against the model's window", () => {
  const { ctx } = feed(A_TURN);
  ctx.contextWindow = 200000;
  const usage = contextUsage(ctx, "opencode/big-pickle");
  assert.equal(usage.totalTokens, 9000);
  assert.equal(usage.maxTokens, 200000);
  assert.equal(Math.round(usage.percentage * 10) / 10, 4.5);
  assert.deepEqual(usage.categories.map((c) => c.tokens), [1800, 7000, 200, 0]);
  const next = carryOver(ctx);
  assert.equal(next.contextTokens, 9000);
  assert.equal(next.contextWindow, 200000);
  assert.equal(next.turnActive, false);
  assert.equal(errorText({ name: "ProviderAuthError", data: { providerID: "openai", message: "not logged in" } }), "ProviderAuthError: not logged in");
  assert.equal(errorText({ name: "UnknownError", data: { message: "boom" } }), "boom");
});

test("a question from opencode is the card the app already knows, and the answer goes back as labels in order", () => {
  const asked = questionFromEvent({ id: "que_1", sessionID: S, questions: [{ question: "Which colour do you prefer?", header: "Colour", options: [{ label: "Red", description: "Red colour" }, { label: "Blue", description: "Blue colour" }] }, { question: "Ship it?", header: "Ship", options: [{ label: "Yes", description: "" }], multiple: true, custom: true }] });
  assert.equal(asked.id, "que_1");
  assert.deepEqual(asked.questions[0], { question: "Which colour do you prefer?", header: "Colour", options: [{ label: "Red", description: "Red colour" }, { label: "Blue", description: "Blue colour" }], multiSelect: false, custom: false });
  assert.equal(asked.questions[1].multiSelect, true);
  assert.deepEqual(answersForOpencode(asked.questions, { "Which colour do you prefer?": "Blue", "Ship it?": "Yes" }), { answers: [["Blue"], ["Yes"]] });
  assert.match(answersForOpencode(asked.questions, { "Which colour do you prefer?": "Blue" }).error, /missing answer for: Ship it\?/);
  const dismissed = dismissalForOpencode(asked.questions, "forget the colour, just ship");
  assert.equal(dismissed.answers.length, 2);
  assert.match(dismissed.answers[0][0], /forget the colour, just ship/);
});

test("the catalogue is every model of a connected provider, with the default marked and the variants as the effort levels", () => {
  const said = {
    all: [
      { id: "opencode", name: "OpenCode", models: { "big-pickle": { id: "big-pickle", name: "Big Pickle", limit: { context: 200000, output: 32000 }, status: "active" }, old: { id: "old", name: "Old", limit: { context: 8000, output: 1 }, status: "deprecated" } } },
      { id: "openai", name: "OpenAI", models: { "gpt-5.5": { id: "gpt-5.5", name: "GPT-5.5", limit: { context: 1000000, output: 100000 }, variants: { low: {}, high: {} } } } },
      { id: "anthropic", name: "Anthropic", models: { "claude-opus-5": { id: "claude-opus-5", name: "Opus 5", limit: { context: 200000, output: 1 } } } },
    ],
    default: { opencode: "big-pickle", openai: "gpt-5.5" },
    connected: ["opencode", "openai"],
  };
  const rows = catalogFromProviders(said);
  assert.deepEqual(rows.map((r) => r.value), ["opencode/big-pickle", "openai/gpt-5.5"]);
  assert.equal(rows[0].label, "Big Pickle");
  assert.equal(rows[0].description, "200k context");
  assert.equal(rows[0].contextTokens, 200000);
  assert.equal(rows[0].isDefault, true);
  assert.equal(rows[0].group, "OpenCode");
  assert.deepEqual(rows[1].efforts.map((e) => e.value), ["low", "high"]);
  assert.equal(rows[1].description, "1M context");
  assert.equal(catalogFromProviders({ providers: said.all, default: {} }).length, 3, "with no connected list, every provider is offered");
});

test("the mcp list reads opencode's status words into the ones the app paints", () => {
  assert.deepEqual(mcpStatusList({ hive: { status: "connected" }, linear: { status: "failed", error: "401" }, slack: { status: "needs_auth" }, off: { status: "disabled" } }), [
    { name: "hive", status: "connected", error: "", tools: [] },
    { name: "linear", status: "failed", error: "401", tools: [] },
    { name: "slack", status: "needs-auth", error: "", tools: [] },
    { name: "off", status: "disabled", error: "", tools: [] },
  ]);
  assert.equal(sessionFellThrough(404), true);
  assert.equal(sessionFellThrough(500), false);
});
