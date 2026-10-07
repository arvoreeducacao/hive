import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import { answerInput, dismissNote, sayEvent, weaveImageMarks } from "./protocol.mjs";
import { opencodeMcpConfig } from "./agents.mjs";
import { peerEntry } from "./peer-module.mjs";

const PEER_MCP = peerEntry();

export const SLASH_COMMANDS = ["model", "effort", "compact", "mcp", "context"];
export const AGENT_MODE = "build";
export const PASSWORD_ENV = "OPENCODE_SERVER_PASSWORD";
export const LISTENING = /listening on\s+(https?:\/\/[^\s]+)/;

export function serveArgs({ port, hostname = "127.0.0.1" }) {
  return ["serve", "--hostname", hostname, "--port", String(port)];
}

export function serveEnv({ seat = "", base = "", gateway = null, remote = [], password = "", env = process.env } = {}) {
  const out = {};
  if (password) out[PASSWORD_ENV] = password;
  const content = opencodeMcpConfig({ seat, base, peerMcp: PEER_MCP, gateway, remote, env });
  if (content) out.OPENCODE_CONFIG_CONTENT = content;
  return out;
}

export function listeningUrl(text) {
  const m = LISTENING.exec(String(text || ""));
  return m ? m[1].replace(/\/+$/, "") : "";
}

export function newPassword(rand = randomBytes) {
  return rand(18).toString("base64url");
}

export function basicAuth(password) {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}

/* the seat runs the way every other hive seat runs — nothing waits on an approval
   the person never sees. The question tool stays on: that one is a card. */
export function permissionRuleset() {
  return [
    { permission: "*", pattern: "*", action: "allow" },
    { permission: "question", pattern: "*", action: "allow" },
  ];
}

export function sessionParams({ title = "" } = {}) {
  const params = { permission: permissionRuleset() };
  if (title) params.title = title;
  return params;
}

export function parseModel(id) {
  const said = String(id || "").trim();
  const cut = said.indexOf("/");
  if (cut <= 0 || cut === said.length - 1) return null;
  return { providerID: said.slice(0, cut), modelID: said.slice(cut + 1) };
}

const ALNUM = /[^A-Za-z0-9]/g;

export function newMessageId(now = Date.now(), rand = randomBytes) {
  const time = Math.max(0, Math.floor(now)).toString(16).padStart(12, "0").slice(-12);
  const tail = rand(16).toString("base64url").replace(ALNUM, "").padEnd(14, "0").slice(0, 14);
  return `msg_${time}${tail}`;
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf" };

export function filePart(path) {
  const ext = String(path).split(".").pop().toLowerCase();
  return { type: "file", mime: MIME[ext] || "application/octet-stream", filename: basename(path), url: `file://${path}` };
}

export function promptParts(text = "", images = []) {
  const parts = [];
  for (const piece of weaveImageMarks(text, images.slice(0, 8))) {
    if (piece.image !== undefined) parts.push(filePart(piece.image));
    else parts.push({ type: "text", text: piece.text });
  }
  if (!parts.length && text) parts.push({ type: "text", text });
  return parts;
}

export function promptParams({ messageID, text = "", images = [], model = "", effort = "" }) {
  const params = { messageID, agent: AGENT_MODE, parts: promptParts(text, images) };
  const picked = parseModel(model);
  if (picked) params.model = picked;
  if (effort) params.variant = effort;
  return params;
}

export function summarizeParams(model) {
  const picked = parseModel(model);
  return picked ? { providerID: picked.providerID, modelID: picked.modelID, auto: false } : null;
}

export function newSessionContext() {
  return {
    turnActive: false,
    replaying: false,
    aborted: false,
    lastError: "",
    roles: new Map(),
    parts: new Map(),
    done: new Set(),
    open: new Map(),
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    cost: 0,
    contextTokens: 0,
    contextWindow: 0,
    lastUsage: null,
  };
}

export function carryOver(ctx) {
  const fresh = newSessionContext();
  fresh.contextTokens = ctx?.contextTokens || 0;
  fresh.contextWindow = ctx?.contextWindow || 0;
  fresh.lastUsage = ctx?.lastUsage || null;
  fresh.roles = ctx?.roles || fresh.roles;
  return fresh;
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

function compactBoundary(ctx) {
  return { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: ctx.contextTokens || null, post_tokens: null } };
}

export function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  const said = error.data?.message || error.message || "";
  return error.name && error.name !== "UnknownError" ? `${error.name}: ${said}`.replace(/:\s*$/, "") : said || JSON.stringify(error).slice(0, 200);
}

function toolUse(part) {
  const state = part.state || {};
  return assistant([{ type: "tool_use", id: part.callID, name: part.tool || "tool", input: state.input || {} }]);
}

function closeOpenTools(ctx, interrupted) {
  const out = [];
  for (const [id] of ctx.open) out.push(toolResult(id, "", interrupted));
  ctx.open.clear();
  return out;
}

function resultEvent(ctx, sessionId) {
  const subtype = ctx.aborted ? "interrupted" : ctx.lastError ? "error" : "success";
  const event = {
    type: "result",
    subtype,
    is_error: subtype === "error",
    num_turns: 1,
    total_cost_usd: ctx.cost,
    usage: { ...ctx.usage },
    session_id: sessionId || "",
  };
  if (subtype === "error") event.result = ctx.lastError;
  return event;
}

function turnOver(ctx, sessionId) {
  if (!ctx.turnActive) return [];
  ctx.turnActive = false;
  const out = closeOpenTools(ctx, ctx.aborted || !!ctx.lastError);
  out.push(resultEvent(ctx, sessionId));
  return out;
}

function takeStep(ctx, part) {
  const tokens = part.tokens || {};
  const cached = tokens.cache?.read || 0;
  ctx.usage.input_tokens += tokens.input || 0;
  ctx.usage.output_tokens += tokens.output || 0;
  ctx.usage.cache_read_input_tokens += cached;
  ctx.cost += part.cost || 0;
  const total = tokens.total || (tokens.input || 0) + (tokens.output || 0) + cached;
  ctx.contextTokens = total || ctx.contextTokens;
  ctx.lastUsage = { input: (tokens.input || 0) + cached, cached, output: tokens.output || 0, reasoning: tokens.reasoning || 0, total };
}

function partUpdated(ctx, part) {
  if (!part || ctx.roles.get(part.messageID) === "user") return [];
  ctx.parts.set(part.id, part.type);
  if (part.type === "step-finish") {
    takeStep(ctx, part);
    return [];
  }
  if (part.type === "text" || part.type === "reasoning") {
    if (!part.time?.end || ctx.done.has(part.id) || !part.text) return [];
    ctx.done.add(part.id);
    return [assistant([part.type === "text" ? { type: "text", text: part.text } : { type: "thinking", thinking: part.text }])];
  }
  if (part.type !== "tool" || !part.callID) return [];
  const status = part.state?.status || "";
  if (status === "pending") return [];
  const out = [];
  if (!ctx.open.has(part.callID) && !ctx.done.has(part.callID)) {
    ctx.open.set(part.callID, { name: part.tool });
    out.push(toolUse(part));
  }
  if (status === "running") return out;
  ctx.open.delete(part.callID);
  ctx.done.add(part.callID);
  if (status === "error") out.push(toolResult(part.callID, part.state?.error || "the tool failed", true));
  else out.push(toolResult(part.callID, part.state?.output ?? "", false));
  return out;
}

export function translate(event, ctx, sessionId = "") {
  const type = event?.type;
  const p = event?.properties || {};
  if (!type) return [];
  if (sessionId && p.sessionID && p.sessionID !== sessionId) return [];
  if (type.startsWith("message.") && !ctx.turnActive && !ctx.replaying) return [];
  if (type === "message.updated") {
    if (p.info?.id) ctx.roles.set(p.info.id, p.info.role || "");
    const said = p.info?.role === "assistant" ? errorText(p.info.error) : "";
    if (said && p.info.error?.name === "MessageAbortedError") ctx.aborted = true;
    else if (said) ctx.lastError = said;
    return [];
  }
  if (type === "message.part.delta") {
    if (p.field !== "text" || !p.delta || ctx.roles.get(p.messageID) === "user") return [];
    const kind = ctx.parts.get(p.partID);
    if (kind !== "text" && kind !== "reasoning") return [];
    return [streamDelta(kind === "reasoning" ? "thinking" : "text", p.delta)];
  }
  if (type === "message.part.updated") return partUpdated(ctx, p.part);
  if (type === "session.status") {
    const status = p.status?.type;
    if (status === "retry") return [warning(`retrying${p.status.attempt ? ` (${p.status.attempt})` : ""}: ${p.status.message || "the provider did not answer"}`)];
    if (status === "idle") return turnOver(ctx, sessionId);
    return [];
  }
  if (type === "session.idle") return turnOver(ctx, sessionId);
  if (type === "session.error") {
    const said = errorText(p.error);
    if (p.error?.name === "MessageAbortedError") {
      ctx.aborted = true;
      return [];
    }
    if (said) ctx.lastError = said;
    return said ? [warning(said)] : [];
  }
  if (type === "session.compacted") return [compactBoundary(ctx)];
  return [];
}

export function historyEvents(messages, ctx, { preamble = "" } = {}) {
  const out = [];
  const lead = preamble ? `${preamble}\n\n` : "";
  for (const one of Array.isArray(messages) ? messages : []) {
    const info = one?.info || {};
    const parts = Array.isArray(one?.parts) ? one.parts : [];
    if (info.id) ctx.roles.set(info.id, info.role || "");
    if (info.role === "user") {
      const text = parts.filter((part) => part?.type === "text" && part.text).map((part) => part.text).join("\n").trim();
      const images = parts.filter((part) => part?.type === "file" && typeof part.url === "string" && part.url.startsWith("file://")).map((part) => decodeURIComponent(part.url.slice("file://".length)));
      const said = text.startsWith(lead) ? text.slice(lead.length) : text;
      if (said || images.length) out.push(sayEvent(said || "(image)", images));
      continue;
    }
    if (info.role !== "assistant") continue;
    for (const part of parts) out.push(...partUpdated(ctx, part));
    out.push(...closeOpenTools(ctx, true));
  }
  return out;
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

export function questionFromEvent(props) {
  const questions = (props?.questions || []).map((q) => ({
    question: q.question || "",
    header: q.header || "",
    options: (q.options || []).map((o) => ({ label: o.label || "", description: o.description || "" })),
    multiSelect: !!q.multiple,
    custom: !!q.custom,
  }));
  return { id: props?.id || "", sessionID: props?.sessionID || "", questions };
}

export function answersForOpencode(questions, answers) {
  const filled = answerInput({ questions }, answers);
  if (filled.error) return filled;
  return { answers: questions.map((q) => [filled.input.answers[q.question]]) };
}

export function dismissalForOpencode(questions, text) {
  const note = dismissNote(text);
  return { answers: questions.map(() => [note]) };
}

function contextSize(limit) {
  const n = Number(limit) || 0;
  if (!n) return "";
  if (n >= 1000000) return `${Math.round(n / 100000) / 10}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function effortRow(value) {
  return { value, label: value };
}

export function catalogFromProviders(said) {
  const providers = said?.all || said?.providers || [];
  const connected = new Set(Array.isArray(said?.connected) ? said.connected : []);
  const defaults = said?.default || {};
  const rows = [];
  for (const provider of providers) {
    if (connected.size && !connected.has(provider.id)) continue;
    for (const [id, m] of Object.entries(provider.models || {})) {
      if (m?.status === "deprecated") continue;
      const context = contextSize(m?.limit?.context);
      rows.push({
        value: `${provider.id}/${id}`,
        label: m?.name || id,
        description: context ? `${context} context` : "",
        context,
        contextTokens: Number(m?.limit?.context) || 0,
        group: provider.name || provider.id,
        isDefault: defaults[provider.id] === id,
        efforts: Object.keys(m?.variants || {}).map(effortRow),
        defaultEffort: "",
        badges: [],
      });
    }
  }
  return rows;
}

const MCP_STATUS = { connected: "connected", disabled: "disabled", failed: "failed", needs_auth: "needs-auth", needs_client_registration: "needs-auth" };

export function mcpStatusList(said) {
  return Object.entries(said || {}).map(([name, one]) => {
    const status = MCP_STATUS[one?.status] || "failed";
    return { name, status, error: status === "failed" ? String(one?.error || "the server did not answer the handshake") : "", tools: [] };
  });
}

export function sessionFellThrough(status) {
  return status === 404;
}
