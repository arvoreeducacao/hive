import { answerInput, dismissNote, weaveImageMarks } from "./protocol.mjs";
import { peerEntry } from "./peer-module.mjs";
import { gatewayEntries } from "../gateway/mcp-gateway.mjs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const PEER_MCP = peerEntry();

export const CLIENT_INFO = { name: "hive", title: "Hive", version: "1" };
export const SLASH_COMMANDS = ["model", "effort", "compact", "mcp", "context"];
export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh"];

export function peerMcpConfig(seat, base) {
  return `mcp_servers.hive={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(PEER_MCP)}],env={HIVE_SEAT=${JSON.stringify(seat)},HIVE_STATE_DIR=${JSON.stringify(base)}}}`;
}

export const GATEWAY_TOKEN_ENV = "HIVE_MCP_GATEWAY_TOKEN";

export const codexMcpName = (name) => String(name).replace(/[^A-Za-z0-9_]/g, "_");

export function codexConfigPath(env = process.env) {
  return join(env.CODEX_HOME || join(homedir(), ".codex"), "config.toml");
}

const TABLE_HEADER = /^\[mcp_servers\.(?:"([^"]+)"|([^\]\s."]+))\]$/;
const INLINE_TABLE = /^mcp_servers\.(?:"([^"]+)"|([^\s=."]+))\s*=\s*\{(.*)\}\s*$/;

export function codexStdioServers(tomlText) {
  const names = [];
  let current = "";
  for (const raw of String(tomlText || "").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      const header = line.match(TABLE_HEADER);
      current = header ? header[1] || header[2] : "";
      continue;
    }
    const inline = line.match(INLINE_TABLE);
    if (inline) {
      if (/\bcommand\s*=/.test(inline[3])) names.push(inline[1] || inline[2]);
      continue;
    }
    if (current && /^command\s*=/.test(line)) {
      names.push(current);
      current = "";
    }
  }
  return names;
}

const DIRENV_SUFFIX = "_direnv";

export function codexServersToDisable(stdioNames, served) {
  const known = new Set(served.map(codexMcpName));
  const disabled = [];
  const kept = [];
  for (const name of stdioNames) {
    const normal = codexMcpName(name);
    const bare = normal.endsWith(DIRENV_SUFFIX) ? normal.slice(0, -DIRENV_SUFFIX.length) : normal;
    (known.has(normal) || known.has(bare) ? disabled : kept).push(name);
  }
  return { disabled, kept };
}

export function disabledMcpConfig(names) {
  return names.map((name) => `mcp_servers.${codexMcpName(name)}.enabled=false`);
}

export function gatewayMcpConfig(servers, port, hub = true) {
  return gatewayEntries({ servers, port, hub }).map(({ name, url }) =>
    `mcp_servers.${codexMcpName(name)}={url=${JSON.stringify(url)},bearer_token_env_var=${JSON.stringify(GATEWAY_TOKEN_ENV)}}`
  );
}

const ENV_MARK = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function remoteMcpServers(mcpJsonText, gatewayPort = 4671) {
  let parsed;
  try { parsed = JSON.parse(mcpJsonText || "{}"); } catch { return []; }
  const own = `http://127.0.0.1:${gatewayPort}/`;
  return Object.entries(parsed?.mcpServers || {})
    .filter(([, s]) => s && typeof s.url === "string" && (!s.type || s.type === "http") && !s.url.startsWith(own))
    .map(([name, s]) => ({ name, url: s.url, headers: s.headers && typeof s.headers === "object" ? s.headers : {} }));
}

export function remoteMcpConfig(servers, env = process.env) {
  return servers.map(({ name, url, headers }) => {
    const pairs = Object.entries(headers || {}).map(([k, v]) => `${JSON.stringify(k)}=${JSON.stringify(String(v).replace(ENV_MARK, (_, key) => env[key] || ""))}`);
    return `mcp_servers.${codexMcpName(name)}={url=${JSON.stringify(url)}${pairs.length ? `,http_headers={${pairs.join(",")}}` : ""}}`;
  });
}

export function contextUsage(ctx, model = "") {
  const last = ctx?.lastUsage || { input: 0, cached: 0, output: 0, reasoning: 0, total: 0 };
  const maxTokens = ctx?.contextWindow || 0;
  const totalTokens = last.total || last.input + last.output;
  const categories = [
    { name: "cached input", tokens: Math.min(last.cached, last.input), color: "var(--txt-3)" },
    { name: "fresh input", tokens: Math.max(0, last.input - last.cached), color: "var(--blue)" },
    { name: "output", tokens: Math.max(0, last.output - last.reasoning), color: "var(--green)" },
    { name: "reasoning", tokens: last.reasoning, color: "var(--yellow)" },
  ];
  return { model, maxTokens, totalTokens, percentage: maxTokens ? (totalTokens / maxTokens) * 100 : 0, categories };
}

export function mcpStatusList(result) {
  return (result?.data || []).map((server) => {
    const up = !!server.serverInfo;
    const needsLogin = !up && server.authStatus === "notLoggedIn";
    return {
      name: server.name,
      status: up ? "connected" : needsLogin ? "needs-auth" : "failed",
      error: up || needsLogin ? "" : "the server did not answer the handshake",
      tools: Object.keys(server.tools || {}),
    };
  });
}

export function appServerArgs({ seat = "", base = "", gateway = null, remote = [], disabled = [], autocompact = 0 } = {}) {
  const args = [
    "app-server",
    "--enable", "default_mode_request_user_input",
    "-c", 'approval_policy="never"',
    "-c", 'sandbox_mode="danger-full-access"',
    "-c", "suppress_unstable_features_warning=true",
  ];
  if (Number.isInteger(autocompact) && autocompact > 0) args.push("-c", `model_auto_compact_token_limit=${autocompact}`);
  if (seat) args.push("-c", peerMcpConfig(seat, base));
  if (gateway?.port) for (const one of gatewayMcpConfig(gateway.servers, gateway.port, gateway.hub)) args.push("-c", one);
  for (const one of remoteMcpConfig(remote)) args.push("-c", one);
  for (const one of disabledMcpConfig(disabled)) args.push("-c", one);
  return args;
}

export function initializeParams() {
  return { clientInfo: { ...CLIENT_INFO }, capabilities: { experimentalApi: true } };
}

export function threadParams({ cwd, model = "", preamble = "" } = {}) {
  const params = { cwd, approvalPolicy: "never", sandbox: "danger-full-access" };
  if (model) params.model = model;
  if (preamble) params.developerInstructions = preamble;
  return params;
}

export function resumeParams(threadId, rest = {}) {
  return { threadId, ...threadParams(rest) };
}

export function turnInput(text = "", images = []) {
  const input = [];
  for (const piece of weaveImageMarks(text, images.slice(0, 8))) {
    if (piece.image !== undefined) input.push({ type: "localImage", path: piece.image });
    else input.push({ type: "text", text: piece.text });
  }
  if (!input.length && text) input.push({ type: "text", text });
  return input;
}

export function turnParams({ threadId, text = "", images = [], model = "", effort = "" }) {
  const params = { threadId, input: turnInput(text, images) };
  if (model) params.model = model;
  if (effort) params.effort = effort;
  return params;
}

export function steerParams({ threadId, turnId, text = "", images = [] }) {
  return { threadId, expectedTurnId: turnId, input: turnInput(text, images) };
}

export function newThreadContext() {
  return {
    turnId: "",
    open: new Map(),
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    contextWindow: 0,
    contextTokens: 0,
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

function warning(message) {
  return { type: "driver", subtype: "warning", message: String(message || "").slice(0, 400) };
}

const TOOL_ITEMS = new Set(["commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "webSearch", "todoList", "plan", "imageView", "imageGeneration", "collabAgentToolCall", "sleep"]);
const QUIET_ITEMS = new Set(["userMessage", "hookPrompt", "subAgentActivity", "enteredReviewMode", "exitedReviewMode"]);

function compactBoundary(ctx) {
  const pre = ctx.contextTokens || null;
  return { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: pre, post_tokens: null } };
}

function changeLine(change) {
  const kind = typeof change.kind === "string" ? change.kind : change.kind?.type || "edit";
  const moved = change.kind?.move_path ? ` → ${change.kind.move_path}` : "";
  return `${kind} ${change.path}${moved}`;
}

export function codexToolShape(item) {
  const failed = item.status === "failed" || item.status === "declined" || item.success === false;
  switch (item.type) {
    case "commandExecution":
      return { name: "shell", input: { command: item.command || "" }, output: item.aggregatedOutput || "", failed };
    case "fileChange": {
      const files = (item.changes || []).map(changeLine).join(", ");
      const diff = (item.changes || []).map((c) => c.diff || "").filter(Boolean).join("\n");
      return { name: "edit", input: { file_path: files }, output: diff || item.status || "", failed };
    }
    case "mcpToolCall":
      return { name: item.tool || "mcp", input: item.arguments || {}, output: item.error || item.result?.content || item.result || item.status || "", failed: failed || !!item.error };
    case "dynamicToolCall":
      return { name: item.tool || "tool", input: item.arguments || {}, output: item.contentItems || item.status || "", failed };
    case "webSearch":
      return { name: "web_search", input: { description: item.query || "" }, output: item.results || "", failed: false };
    case "todoList": {
      const plan = (item.items || []).map((t) => (typeof t === "string" ? t : t.text || "")).filter(Boolean).join(" · ");
      return { name: "plan", input: { description: plan }, output: "", failed: false };
    }
    case "plan":
      return { name: "plan", input: { description: item.text || "" }, output: "", failed: false };
    case "imageView":
      return { name: "view_image", input: { file_path: item.path || "" }, output: "", failed: false };
    case "imageGeneration":
      return { name: "image_generation", input: { description: item.revisedPrompt || "" }, output: item.savedPath || item.status || "", failed };
    case "collabAgentToolCall":
      return { name: item.tool || "agent", input: { description: item.prompt || "" }, output: item.status || "", failed };
    case "sleep":
      return { name: "sleep", input: { description: `${item.durationMs || 0}ms` }, output: "", failed: false };
    default:
      return { name: item.type || "item", input: { description: JSON.stringify(item).slice(0, 200) }, output: "", failed };
  }
}

function toolUse(item) {
  const tool = codexToolShape(item);
  return { event: assistant([{ type: "tool_use", id: item.id, name: tool.name, input: tool.input }]), tool };
}

function closeOpenTools(ctx, interrupted) {
  const out = [];
  for (const [id, held] of ctx.open) {
    out.push(toolResult(id, held.output || "", interrupted));
  }
  ctx.open.clear();
  return out;
}

function resultEvent(turn, ctx, sessionId) {
  const status = turn?.status;
  const subtype = status === "interrupted" ? "interrupted" : status === "failed" ? "error" : "success";
  const event = {
    type: "result",
    subtype,
    is_error: subtype === "error",
    num_turns: 1,
    total_cost_usd: 0,
    usage: { ...ctx.usage },
    session_id: sessionId || "",
  };
  if (subtype === "error") event.result = turn?.error?.message || "the turn failed";
  return event;
}

export function translate(msg, ctx, sessionId = "") {
  const method = msg?.method;
  const p = msg?.params || {};
  if (!method) return [];
  if (method === "turn/started") {
    ctx.turnId = p.turn?.id || "";
    return [{ type: "driver", subtype: "turn_started" }];
  }
  if (method === "item/agentMessage/delta") return p.delta ? [streamDelta("text", p.delta)] : [];
  if (method === "item/reasoning/textDelta" || method === "item/reasoning/summaryTextDelta") return p.delta ? [streamDelta("thinking", p.delta)] : [];
  if (method === "item/commandExecution/outputDelta") {
    const held = ctx.open.get(p.itemId);
    if (held) held.output = (held.output || "") + (p.delta || "");
    return [];
  }
  if (method === "thread/tokenUsage/updated") {
    const last = p.tokenUsage?.last || {};
    const total = p.tokenUsage?.total || {};
    ctx.usage.input_tokens += last.inputTokens || 0;
    ctx.usage.output_tokens += last.outputTokens || 0;
    ctx.usage.cache_read_input_tokens += last.cachedInputTokens || 0;
    ctx.contextWindow = p.tokenUsage?.modelContextWindow || ctx.contextWindow;
    ctx.contextTokens = total.totalTokens || ctx.contextTokens;
    ctx.lastUsage = {
      input: last.inputTokens || 0,
      cached: last.cachedInputTokens || 0,
      output: last.outputTokens || 0,
      reasoning: last.reasoningOutputTokens || 0,
      total: last.totalTokens || 0,
    };
    return [];
  }
  if (method === "turn/completed") {
    const out = closeOpenTools(ctx, p.turn?.status !== "completed");
    out.push(resultEvent(p.turn, ctx, sessionId));
    ctx.turnId = "";
    return out;
  }
  if (method === "error") {
    const said = p.error?.message || p.message || "error";
    return [warning(p.willRetry ? `retrying: ${said}` : said)];
  }
  if (method === "warning") return p.message ? [warning(p.message)] : [];
  if (method === "thread/compacted") return [compactBoundary(ctx)];
  if (method !== "item/started" && method !== "item/completed") return [];
  const item = p.item || {};
  if (QUIET_ITEMS.has(item.type)) return [];
  if (item.type === "contextCompaction") return method === "item/completed" ? [compactBoundary(ctx)] : [];
  if (item.type === "agentMessage") {
    return method === "item/completed" && item.text ? [assistant([{ type: "text", text: item.text }])] : [];
  }
  if (item.type === "reasoning") {
    const said = [...(item.summary || []), ...(item.content || [])].filter(Boolean).join("\n");
    return method === "item/completed" && said ? [assistant([{ type: "thinking", thinking: said }])] : [];
  }
  if (!TOOL_ITEMS.has(item.type) && !item.id) return [];
  if (method === "item/started") {
    const { event, tool } = toolUse(item);
    ctx.open.set(item.id, { name: tool.name, output: "" });
    return [event];
  }
  const out = [];
  const held = ctx.open.get(item.id);
  const { event, tool } = toolUse(item);
  if (!held) out.push(event);
  ctx.open.delete(item.id);
  const output = tool.output || held?.output || "";
  out.push(toolResult(item.id, output, tool.failed));
  return out;
}

export function questionFromRequest(params) {
  const questions = (params?.questions || []).map((q) => ({
    question: q.question || "",
    header: q.header || "",
    options: (q.options || []).map((o) => ({ label: o.label || "", description: o.description || "" })),
    multiSelect: false,
    codexId: q.id,
    isOther: !!q.isOther,
    isSecret: !!q.isSecret,
  }));
  return { id: params?.itemId || "", questions };
}

export function answersForCodex(questions, answers) {
  const filled = answerInput({ questions }, answers);
  if (filled.error) return filled;
  const out = {};
  for (const q of questions) out[q.codexId || q.question] = { answers: [filled.input.answers[q.question]] };
  return { answers: out };
}

export function dismissalForCodex(questions, text) {
  const note = dismissNote(text);
  const out = {};
  for (const q of questions) out[q.codexId || q.question] = { answers: [note] };
  return { answers: out };
}

const STDERR_LOG = /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+(\S+):\s+(.*)$/;
const ANSI = /\x1b\[[0-9;]*m/g;
const BENIGN_STDERR = ["state db missing rollout path for thread", "record_discrepancy"];
const QUIET_MODULES = ["rmcp::transport"];

export function stderrTrouble(rawLine) {
  const line = String(rawLine || "").replace(ANSI, "").trim();
  if (!line) return null;
  const m = line.match(STDERR_LOG);
  if (!m) return null;
  if (m[1] !== "ERROR") return null;
  if (QUIET_MODULES.some((bit) => m[2].startsWith(bit))) return null;
  const said = m[3].trim();
  if (BENIGN_STDERR.some((bit) => said.includes(bit))) return null;
  return said;
}

export function serverRequestReply(method, params) {
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval" || method === "item/permissions/requestApproval") {
    return { decision: "accept" };
  }
  if (method === "execCommandApproval" || method === "applyPatchApproval") return { decision: "approved" };
  if (method === "mcpServer/elicitation/request") return { action: "decline" };
  return null;
}

export function itemDirs(item, cwd) {
  if (item?.type === "commandExecution") return typeof item.cwd === "string" ? [item.cwd] : [];
  if (item?.type !== "fileChange" || !Array.isArray(item.changes)) return [];
  return item.changes
    .filter((change) => typeof change?.path === "string" && change.path)
    .map((change) => dirname(resolve(cwd, change.path)));
}
