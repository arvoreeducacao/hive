import {
  GATEWAY_TOKEN_ENV, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, promptBlocks, promptParams, resumeFellThrough, serverRequestReply, stderrTrouble,
} from "./kimi-acp.mjs";

export { GATEWAY_TOKEN_ENV, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, promptBlocks, promptParams, resumeFellThrough, serverRequestReply, stderrTrouble };

export const BINARY = "kiro-cli";
export const SLASH_COMMANDS = ["model", "effort", "compact", "mcp", "context"];
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];
export const NAMER_MODEL = "claude-haiku-4.5";
export const COMMAND_EXECUTE = "_kiro.dev/commands/execute";
export const COMMAND_OPTIONS = "_kiro.dev/commands/options";
export const SKIP_ENV = "HIVE_KIRO_MCP_SKIP";
export const SCHEMA_UNSAFE_SERVERS = ["360dialog"];

const skipList = (env) => String(env?.[SKIP_ENV] ?? SCHEMA_UNSAFE_SERVERS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);

export function kiroMcpServers(opts = {}, env = process.env) {
  const skip = new Set(skipList(env));
  const all = mcpServersFor({ ...opts, env });
  return { servers: all.filter((s) => !skip.has(s.name)), skipped: all.filter((s) => skip.has(s.name)).map((s) => s.name) };
}

const SCHEMA_REJECTED = /input_schema does not support (oneOf|allOf|anyOf)/i;

export function schemaTrouble(message) {
  const said = String(message || "");
  if (!SCHEMA_REJECTED.test(said)) return "";
  const hit = /tools\.(\d+)\./.exec(said);
  return `the model refused the tool list: one MCP tool carries a schema Kiro cannot pass to it (tool #${hit ? hit[1] : "?"}: oneOf/allOf/anyOf at the top level). Add that server to ${SKIP_ENV} and reopen the seat.`;
}

export function acpArgs({ model = "", effort = "" } = {}) {
  const args = ["acp", "--trust-all-tools"];
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);
  return args;
}

export function setModelParams(sessionId, modelId) {
  return { sessionId, modelId };
}

export function commandParams(sessionId, command, args = {}) {
  return { sessionId, command: { command, args } };
}

export function commandOptionsParams(sessionId, command) {
  return { sessionId, command };
}

export function effortCommandArgs(level) {
  return { value: level };
}

const effortRows = () => EFFORT_LEVELS.map((value) => ({ value, label: value, description: "" }));

export function modelsFromSession(result) {
  const models = result?.models || {};
  return (models.availableModels || []).map((row) => ({
    value: row.modelId,
    label: row.name || row.modelId,
    description: row.description || "",
    group: "kiro",
    isDefault: row.modelId === models.currentModelId,
    efforts: effortRows(),
    defaultEffort: "",
    badges: [],
  })).filter((row) => row.value);
}

export function modelsFromOptions(options) {
  return (options || []).map((row) => ({
    value: row.value,
    label: row.label || row.value,
    description: [row.description, row.group].filter(Boolean).join(" · ").replace(/ \[active\]/, ""),
    group: "kiro",
    isDefault: /\[active\]/.test(row.description || ""),
    efforts: effortRows(),
    defaultEffort: "",
    badges: [],
  })).filter((row) => row.value);
}

export function currentModel(result) {
  return result?.models?.currentModelId || "";
}

export function newSessionContext() {
  return {
    open: new Map(),
    text: "",
    thought: "",
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    percent: null,
    effort: "",
    credits: 0,
    title: "",
    commands: [],
    mcp: [],
    tools: [],
    compaction: "",
    oauth: {},
    muted: false,
    onCompaction: null,
  };
}

export function carryOver(ctx) {
  return {
    ...newSessionContext(),
    percent: ctx?.percent ?? null,
    effort: ctx?.effort || "",
    credits: ctx?.credits || 0,
    title: ctx?.title || "",
    commands: ctx?.commands || [],
    mcp: ctx?.mcp || [],
    tools: ctx?.tools || [],
    oauth: { ...(ctx?.oauth || {}) },
    muted: !!ctx?.muted,
    onCompaction: ctx?.onCompaction || null,
  };
}

function assistant(blocks) {
  return { type: "assistant", message: { role: "assistant", content: blocks }, parent_tool_use_id: null };
}

function toolResult(id, output, failed) {
  const content = typeof output === "string" ? output : JSON.stringify(output ?? "");
  return {
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: !!failed }] },
    parent_tool_use_id: null,
  };
}

function streamDelta(kind, text) {
  const delta = kind === "thinking" ? { type: "thinking_delta", thinking: text } : { type: "text_delta", text };
  return { type: "stream_event", event: { type: "content_block_delta", index: 0, delta }, parent_tool_use_id: null };
}

const KIND_NAMES = { execute: "shell", edit: "edit", read: "read", search: "search", fetch: "web_fetch", think: "plan", delete: "delete", move: "move" };
const KIRO_NAMES = { shell: "shell", execute_bash: "shell", read: "read", fs_read: "read", write: "edit", fs_write: "edit", str_replace: "edit", web_fetch: "web_fetch", web_search: "web_search" };
const MCP_TOOL = /^@([^/\s]+)\/(\S+)$/;
const TITLE_VERBS = /^(running|reading|writing|editing|searching|fetching|creating|deleting|listing):?\s+/i;

const mcpName = (said) => {
  const hit = MCP_TOOL.exec(String(said || "").trim());
  return hit ? `mcp__${hit[1]}__${hit[2]}` : "";
};

export function toolName(update) {
  const meta = String(update?._meta?.kiro?.toolName || "").trim();
  if (meta) return mcpName(meta) || KIRO_NAMES[meta] || meta;
  const title = String(update?.title || "").trim();
  const bare = title.replace(TITLE_VERBS, "");
  const asMcp = mcpName(bare) || mcpName(title);
  if (asMcp) return asMcp;
  if (KIRO_NAMES[title]) return KIRO_NAMES[title];
  if (KIND_NAMES[update?.kind]) return KIND_NAMES[update.kind];
  return title.toLowerCase().replace(/\s+/g, "_") || update?.kind || "tool";
}

const PURPOSE = "__tool_use_purpose";

export function toolInput(name, raw, title) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { description: String(title || name || "") };
  const { [PURPOSE]: purpose, ...rest } = raw;
  if (name === "shell" && typeof rest.command === "string") return purpose ? { command: rest.command, description: String(purpose) } : { command: rest.command };
  const path = rest.path || rest.file_path || rest.file;
  if ((name === "edit" || name === "read") && typeof path === "string") {
    const { path: _p, file_path: _f, file: _g, ...others } = rest;
    return { file_path: path, ...others };
  }
  return rest;
}

const EXIT_OK = /exit status:\s*0\b/i;

export function toolOutcome(rawOutput, streamed = "") {
  if (rawOutput === undefined || rawOutput === null) return { text: streamed, failed: false };
  if (typeof rawOutput !== "object") return { text: String(rawOutput), failed: false };
  const items = Array.isArray(rawOutput.items) ? rawOutput.items : Array.isArray(rawOutput) ? rawOutput : null;
  if (!items) return { text: JSON.stringify(rawOutput), failed: false };
  let failed = false;
  const parts = items.map((item) => {
    if (typeof item === "string") return item;
    const json = item?.Json ?? item?.json;
    if (json && typeof json === "object") {
      if ("stdout" in json || "stderr" in json || "exit_status" in json) {
        const status = String(json.exit_status || "");
        if (status && !EXIT_OK.test(status)) failed = true;
        return [json.stdout || "", json.stderr || "", status && !EXIT_OK.test(status) ? status : ""].filter(Boolean).join("\n");
      }
      return JSON.stringify(json);
    }
    if (typeof item?.Text === "string") return item.Text;
    if (typeof item?.text === "string") return item.text;
    return JSON.stringify(item);
  });
  return { text: parts.join("\n") || streamed, failed };
}

const contentText = (content) => (Array.isArray(content) ? content : []).map((c) => (c?.type === "content" ? c.content?.text || "" : c?.type === "diff" ? `${c.path || ""}\n${c.newText || ""}` : "")).join("");

function flushText(ctx) {
  const blocks = [];
  if (ctx.thought) blocks.push({ type: "thinking", thinking: ctx.thought });
  if (ctx.text) blocks.push({ type: "text", text: ctx.text });
  ctx.thought = "";
  ctx.text = "";
  return blocks.length ? [assistant(blocks)] : [];
}

function openTool(ctx, id, held) {
  held.name = toolName(held);
  const input = toolInput(held.name, held.rawInput, held.title);
  held.emitted = true;
  return [...flushText(ctx), assistant([{ type: "tool_use", id, name: held.name, input }])];
}

function closeOpenTools(ctx, interrupted) {
  const out = [];
  for (const [id, held] of ctx.open) {
    if (!held.emitted) out.push(...openTool(ctx, id, held));
    out.push(toolResult(id, held.output || "", interrupted));
  }
  ctx.open.clear();
  return out;
}

const warning = (message) => ({ type: "driver", subtype: "warning", message: String(message || "").slice(0, 400) });

export function translate(msg, ctx) {
  const method = msg?.method;
  const params = msg?.params || {};
  if (method === "_kiro.dev/metadata") {
    if (typeof params.contextUsagePercentage === "number") ctx.percent = params.contextUsagePercentage;
    if (typeof params.effort === "string" && params.effort) ctx.effort = params.effort;
    for (const one of params.meteringUsage || []) ctx.credits += Number(one?.value) || 0;
    return [];
  }
  if (method === "_kiro.dev/commands/available") {
    ctx.commands = (params.commands || []).map((c) => String(c?.name || "").replace(/^\//, "")).filter(Boolean);
    if (Array.isArray(params.mcpServers)) ctx.mcp = params.mcpServers;
    if (Array.isArray(params.tools)) ctx.tools = params.tools;
    return [];
  }
  if (method === "_kiro.dev/compaction/status") {
    const status = params.status?.type || "";
    ctx.compaction = status;
    if (typeof ctx.onCompaction === "function") ctx.onCompaction(status, params.summary || null);
    return [];
  }
  if (method === "_kiro.dev/mcp/server_init_failure") {
    return [warning(`mcp ${params.serverName || "?"} did not start: ${String(params.error || params.message || "").slice(0, 300)}`)];
  }
  if (method === "_kiro.dev/mcp/oauth_request") {
    const server = String(params.serverName || "");
    const url = String(params.oauthUrl || params.url || "");
    if (server) ctx.oauth[server] = url;
    return [];
  }
  if (method === "_kiro.dev/mcp/server_initialized") {
    const server = String(params.serverName || "");
    if (server) delete ctx.oauth[server];
    return [];
  }
  if (method !== "session/update" || ctx.muted) return [];
  const update = params.update || {};
  const kind = update.sessionUpdate;
  if (kind === "agent_message_chunk") {
    const text = update.content?.type === "text" ? update.content.text || "" : "";
    if (!text) return [];
    ctx.text += text;
    return [streamDelta("text", text)];
  }
  if (kind === "agent_thought_chunk") {
    const text = update.content?.type === "text" ? update.content.text || "" : "";
    if (!text) return [];
    ctx.thought += text;
    return [streamDelta("thinking", text)];
  }
  if (kind === "tool_call") {
    const id = update.toolCallId;
    if (!id) return [];
    const known = ctx.open.get(id);
    if (known?.emitted) return [];
    const held = known || { title: "", kind: "", rawInput: undefined, _meta: undefined, output: "", emitted: false, name: "" };
    if (update.title) held.title = update.title;
    if (update.kind) held.kind = update.kind;
    if (update.rawInput && typeof update.rawInput === "object") held.rawInput = update.rawInput;
    if (update._meta) held._meta = update._meta;
    ctx.open.set(id, held);
    if (held.rawInput) return openTool(ctx, id, held);
    return [];
  }
  if (kind === "tool_call_update") {
    const id = update.toolCallId;
    const held = ctx.open.get(id);
    if (!held) return [];
    if (update.title) held.title = update.title;
    if (update.kind) held.kind = update.kind;
    if (update.rawInput && typeof update.rawInput === "object") held.rawInput = update.rawInput;
    if (update._meta) held._meta = update._meta;
    const piece = contentText(update.content);
    if (piece) held.output += piece;
    const out = [];
    if (update.status === "completed" || update.status === "failed") {
      if (!held.emitted) out.push(...openTool(ctx, id, held));
      const outcome = toolOutcome(update.rawOutput, held.output);
      ctx.open.delete(id);
      out.push(toolResult(id, outcome.text, update.status === "failed" || outcome.failed));
      return out;
    }
    if (!held.emitted && held.rawInput) out.push(...openTool(ctx, id, held));
    return out;
  }
  if (kind === "available_commands_update") {
    ctx.commands = (update.availableCommands || []).map((c) => String(c?.name || "").replace(/^\//, "")).filter(Boolean);
    return [];
  }
  if (kind === "plan") {
    const lines = (update.entries || []).map((e) => `${e.status === "completed" ? "✓" : "·"} ${e.content || ""}`).filter(Boolean).join("\n");
    if (!lines) return [];
    return [...flushText(ctx), { type: "driver", subtype: "todo", text: lines }];
  }
  return [];
}

export function finishTurn(ctx, stopReason, sessionId = "", error = "") {
  const cancelled = stopReason === "cancelled";
  const refused = stopReason === "refusal";
  const failed = !!error;
  const out = [...flushText(ctx), ...closeOpenTools(ctx, cancelled || failed)];
  const subtype = cancelled ? "interrupted" : failed || refused ? "error" : "success";
  const result = {
    type: "result",
    subtype,
    is_error: subtype === "error",
    num_turns: 1,
    total_cost_usd: 0,
    usage: { ...ctx.usage },
    session_id: sessionId || "",
  };
  if (subtype === "error") result.result = error || "the agent refused to continue";
  if (stopReason === "max_tokens" || stopReason === "max_turn_requests") result.stop_reason = stopReason;
  out.push(result);
  return out;
}

const CONTEXT_GROUPS = [
  ["contextFiles", "context files", "var(--txt-3)"],
  ["tools", "tools", "var(--yellow)"],
  ["yourPrompts", "your prompts", "var(--blue)"],
  ["kiroResponses", "kiro responses", "var(--green)"],
  ["sessionFiles", "session files", "var(--txt-3)"],
];

export function contextUsage(data, model = "", fallbackPercent = null) {
  const breakdown = data?.breakdown || {};
  const categories = CONTEXT_GROUPS
    .map(([key, name, color]) => ({ name, tokens: Number(breakdown[key]?.tokens) || 0, color }))
    .filter((c) => c.tokens > 0);
  const totalTokens = categories.reduce((sum, c) => sum + c.tokens, 0);
  const percentage = typeof data?.contextUsagePercentage === "number" ? data.contextUsagePercentage : Number(fallbackPercent) || 0;
  const maxTokens = percentage > 0 && totalTokens ? Math.round((totalTokens * 100) / percentage) : 0;
  return {
    model: data?.model || model,
    maxTokens,
    totalTokens,
    percentage,
    categories: categories.length ? categories : [{ name: "context", tokens: totalTokens, color: "var(--blue)" }],
  };
}

const RUNNING = /^(running|ready|connected|initialized|ok)$/i;

export function mcpStatus(servers = [], tools = [], oauth = {}) {
  return (servers || []).map((s) => {
    const said = String(s?.status || "");
    const waitsOnLogin = !RUNNING.test(said) && (s?.authenticating || Object.hasOwn(oauth || {}, s?.name || ""));
    const status = waitsOnLogin ? "needs-auth"
      : RUNNING.test(said) ? "connected"
        : /fail|error/i.test(said) ? "failed"
          : /disabled/i.test(said) ? "disabled"
            : "pending";
    const row = {
      name: s?.name || "",
      status,
      error: s?.error || (status === "failed" ? said : ""),
      tools: (tools || []).filter((t) => t?.source === `mcp:${s?.name}`).map((t) => t.name).filter(Boolean),
    };
    if (status === "needs-auth" && oauth?.[row.name]) row.login_url = oauth[row.name];
    return row;
  });
}
