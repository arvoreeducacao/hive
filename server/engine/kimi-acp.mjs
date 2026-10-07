import { weaveImageMarks } from "./protocol.mjs";
import { peerEntry } from "./peer-module.mjs";
import { gatewayEntries } from "../gateway/mcp-gateway.mjs";

const PEER_MCP = peerEntry();

export const CLIENT_INFO = { name: "hive", title: "Hive", version: "1" };
export const SLASH_COMMANDS = ["model", "effort", "compact", "mcp", "context"];
export const GATEWAY_TOKEN_ENV = "HIVE_MCP_GATEWAY_TOKEN";
export const YOLO_MODE = "yolo";

const ENV_MARK = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function acpArgs() {
  return ["acp"];
}

export function initializeParams() {
  return { protocolVersion: 1, clientCapabilities: {}, clientInfo: { ...CLIENT_INFO } };
}

const headerList = (headers, env) => Object.entries(headers || {}).map(([name, value]) => ({ name, value: String(value).replace(ENV_MARK, (_, key) => env[key] || "") }));

export function mcpServersFor({ seat = "", base = "", gateway = null, remote = [], env = process.env } = {}) {
  const servers = [];
  if (seat) {
    servers.push({ name: "hive", command: process.execPath, args: [PEER_MCP], env: [{ name: "HIVE_SEAT", value: seat }, { name: "HIVE_STATE_DIR", value: base }] });
  }
  if (gateway?.port) {
    const token = env[GATEWAY_TOKEN_ENV] || "";
    for (const entry of gatewayEntries(gateway)) servers.push({
      type: "http",
      ...entry,
      headers: token ? [{ name: "Authorization", value: `Bearer ${token}` }] : [],
    });
  }
  for (const one of remote) servers.push({ type: "http", name: one.name, url: one.url, headers: headerList(one.headers, env) });
  return servers;
}

export function newSessionParams({ cwd, mcpServers = [] }) {
  return { cwd, mcpServers };
}

export function loadSessionParams(sessionId, { cwd, mcpServers = [] }) {
  return { sessionId, cwd, mcpServers };
}

export function setModeParams(sessionId, modeId = YOLO_MODE) {
  return { sessionId, modeId };
}

export function setModelParams(sessionId, model) {
  return { sessionId, configId: "model", value: model };
}

export function thinkingOption(configOptions) {
  return (configOptions || []).find((option) => option?.id === "thinking" || option?.category === "thought_level");
}

export function setEffortParams(sessionId, level, configOptions) {
  const option = thinkingOption(configOptions);
  if (!option?.options?.some((row) => row.value === level)) throw new Error(`Kimi does not offer thinking ${level} for this model`);
  return { sessionId, configId: option.id, value: level };
}

export function currentEffort(configOptions) {
  return thinkingOption(configOptions)?.currentValue || "";
}

export function promptBlocks(text = "", images = [], loadImage = () => null) {
  const blocks = [];
  for (const piece of weaveImageMarks(text, images.slice(0, 8))) {
    if (piece.image !== undefined) {
      const loaded = loadImage(piece.image);
      if (loaded) blocks.push({ type: "image", data: loaded.data, mimeType: loaded.mimeType });
    } else if (piece.text) {
      blocks.push({ type: "text", text: piece.text });
    }
  }
  if (!blocks.length && text) blocks.push({ type: "text", text });
  return blocks;
}

export function promptParams(sessionId, text, images = [], loadImage) {
  return { sessionId, prompt: promptBlocks(text, images, loadImage) };
}

const RESUME_FELL_THROUGH = ["not found", "no such session", "unknown session", "does not exist", "missing"];

export function resumeFellThrough(message) {
  const said = String(message || "").toLowerCase();
  return said.includes("session") && RESUME_FELL_THROUGH.some((bit) => said.includes(bit));
}

export function modelsFromConfigOptions(configOptions) {
  const option = (configOptions || []).find((o) => o?.id === "model" || o?.category === "model");
  if (!option) return [];
  const thinking = thinkingOption(configOptions);
  return (option.options || []).map((row) => ({
    value: row.value,
    label: row.name || row.value,
    description: row.description || "",
    group: "kimi",
    isDefault: row.value === option.currentValue,
    efforts: row.value === option.currentValue ? (thinking?.options || []).map((level) => ({ value: level.value, label: level.name || level.value, description: level.description || "" })) : [],
    defaultEffort: row.value === option.currentValue ? currentEffort(configOptions) : "",
    badges: [],
  }));
}

export function currentModel(configOptions) {
  const option = (configOptions || []).find((o) => o?.id === "model" || o?.category === "model");
  return option?.currentValue || "";
}

export function newSessionContext() {
  return {
    open: new Map(),
    text: "",
    thought: "",
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    lastUsage: null,
    contextWindow: 0,
    title: "",
    commands: [],
    muted: false,
  };
}

export function carryOver(ctx) {
  return { ...newSessionContext(), lastUsage: ctx?.lastUsage || null, contextWindow: ctx?.contextWindow || 0, title: ctx?.title || "", commands: ctx?.commands || [], muted: !!ctx?.muted };
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

const A_SUBAGENT_IS_LAUNCHING = /^launching\b.*\bagents?\b/i;

export function toolName(title, kind) {
  const said = String(title || "").trim();
  if (/^mcp__/.test(said)) return said;
  if (A_SUBAGENT_IS_LAUNCHING.test(said)) return "agent";
  if (KIND_NAMES[kind]) return KIND_NAMES[kind];
  return said.toLowerCase().replace(/\s+/g, "_") || kind || "tool";
}

export function toolInput(name, raw, title) {
  if (raw && typeof raw === "object") {
    if (name === "shell" && typeof raw.command === "string") return { command: raw.command };
    if ((name === "edit" || name === "read") && typeof (raw.path || raw.file_path || raw.file) === "string") return { file_path: raw.path || raw.file_path || raw.file };
    return raw;
  }
  return { description: String(title || name || "") };
}

const contentText = (content) => (Array.isArray(content) ? content : []).map((c) => (c?.type === "content" ? c.content?.text || "" : c?.type === "diff" ? `${c.path || ""}\n${c.newText || ""}` : "")).join("");

function parsedArgs(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function flushText(ctx) {
  const blocks = [];
  if (ctx.thought) blocks.push({ type: "thinking", thinking: ctx.thought });
  if (ctx.text) blocks.push({ type: "text", text: ctx.text });
  ctx.thought = "";
  ctx.text = "";
  return blocks.length ? [assistant(blocks)] : [];
}

function openTool(ctx, id, held) {
  held.name = toolName(held.title, held.kind);
  const input = toolInput(held.name, held.rawInput ?? parsedArgs(held.args), held.title);
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

export function translate(msg, ctx) {
  if (msg?.method !== "session/update" || ctx.muted) return [];
  const update = msg.params?.update || {};
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
    const held = { title: update.title || "", kind: update.kind || "", args: "", rawInput: update.rawInput, output: "", emitted: false, name: "" };
    ctx.open.set(id, held);
    if (held.rawInput && typeof held.rawInput === "object") return openTool(ctx, id, held);
    return [];
  }
  if (kind === "tool_call_update") {
    const id = update.toolCallId;
    const held = ctx.open.get(id);
    if (!held) return [];
    if (update.title) held.title = update.title;
    if (update.kind) held.kind = update.kind;
    if (update.rawInput && typeof update.rawInput === "object") held.rawInput = update.rawInput;
    const out = [];
    if (update.status === "in_progress" || update.status === "pending") {
      const piece = contentText(update.content);
      if (!held.emitted) {
        if (piece) held.args += piece;
        if (held.rawInput || parsedArgs(held.args)) out.push(...openTool(ctx, id, held));
      }
      return out;
    }
    if (update.status === "completed" || update.status === "failed") {
      if (!held.emitted) out.push(...openTool(ctx, id, held));
      const text = update.rawOutput !== undefined && typeof update.rawOutput !== "object" ? String(update.rawOutput) : contentText(update.content) || (update.rawOutput ? JSON.stringify(update.rawOutput) : "");
      ctx.open.delete(id);
      out.push(toolResult(id, text, update.status === "failed"));
      return out;
    }
    return out;
  }
  if (kind === "usage_update") {
    ctx.lastUsage = { total: Number(update.used) || 0 };
    ctx.contextWindow = Number(update.size) || ctx.contextWindow;
    return [];
  }
  if (kind === "session_info_update") {
    if (typeof update.title === "string") ctx.title = update.title;
    return [];
  }
  if (kind === "available_commands_update") {
    ctx.commands = (update.availableCommands || []).map((c) => c?.name).filter(Boolean);
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

export function contextUsage(ctx, model = "") {
  const totalTokens = ctx?.lastUsage?.total || 0;
  const maxTokens = ctx?.contextWindow || 0;
  return {
    model,
    maxTokens,
    totalTokens,
    percentage: maxTokens ? (totalTokens / maxTokens) * 100 : 0,
    categories: [{ name: "context", tokens: totalTokens, color: "var(--blue)" }],
  };
}

export function serverRequestReply(method, params) {
  if (method === "session/request_permission") {
    const options = Array.isArray(params?.options) ? params.options : [];
    const pick = options.find((o) => o.kind === "allow_always") || options.find((o) => o.kind === "allow_once") || options[0];
    return { outcome: pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" } };
  }
  return null;
}

export function stderrTrouble(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) return null;
  if (line.startsWith("{")) {
    let log;
    try { log = JSON.parse(line); } catch { return null; }
    if (String(log.level || "").toLowerCase() !== "error") return null;
    return [log.msg, log.error].filter(Boolean).join(": ").slice(0, 400) || null;
  }
  if (/^error[: ]/i.test(line)) return line.slice(0, 400);
  return null;
}
