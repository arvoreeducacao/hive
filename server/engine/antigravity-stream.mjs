import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { gatewayEntries } from "../gateway/mcp-gateway.mjs";
import { mirrorHome } from "./providers.mjs";

export const BINARY = "agy";
export const LABEL = "Antigravity";
export const STOP_SIGNAL = "SIGINT";
export const OWN_MCP = ".gemini/config/mcp_config.json";
export const LOGIN_HINT = "nobody is signed in to Antigravity on this machine — run `agy` in a terminal and sign in, then send the message again";

const NEEDS_LOGIN = /authentication required|not logged in|you are not logged into antigravity|please sign in|launch the cli without arguments to sign in/i;

export function needsLogin(message) {
  return NEEDS_LOGIN.test(String(message || ""));
}

export function loginTrouble(said) {
  const text = String(said || "").trim();
  return needsLogin(text) ? `${LOGIN_HINT} (${text})` : text;
}

export function turnArgs({ text, model = "", sessionId = "" }) {
  const args = ["-p", text, "--output-format", "stream-json", "--dangerously-skip-permissions", "--print-timeout", "0s"];
  if (model) args.push("--model", model);
  if (sessionId) args.push("--conversation", sessionId);
  return args;
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

const TOOL_KINDS = {
  run_command: "shell",
  send_command_input: "shell",
  view_file: "read",
  read_file: "read",
  write_to_file: "write",
  replace_file_content: "edit",
  multi_replace_file_content: "edit",
  sed_file: "edit",
  grep_search: "search",
  find_by_name: "search",
  list_dir: "search",
  read_url_content: "web_fetch",
  search_web: "web_search",
};

const FIRST = (params, keys) => keys.map((key) => params[key]).find((value) => typeof value === "string" && value);

export function toolCard(said, params) {
  const name = String(said || "").trim() || "tool";
  const held = params && typeof params === "object" ? params : {};
  if (name === "call_mcp_tool" && held.ServerName && held.ToolName) {
    return { name: `mcp__${held.ServerName}__${held.ToolName}`, input: held.Arguments && typeof held.Arguments === "object" ? held.Arguments : {} };
  }
  const kind = TOOL_KINDS[name] || name;
  if (kind === "shell") {
    const command = FIRST(held, ["CommandLine", "Input", "command"]);
    if (command) return { name: kind, input: { command } };
  }
  if (kind === "read" || kind === "edit" || kind === "write") {
    const file = FIRST(held, ["AbsolutePath", "Path", "TargetFile", "file_path", "path"]);
    if (file) return { name: kind, input: { file_path: file } };
  }
  if (kind === "search" || kind === "web_search" || kind === "web_fetch") {
    const said = FIRST(held, ["Query", "Pattern", "Url", "URL", "DirectoryPath", "SearchPath", "SearchDirectory", "query", "url"]);
    if (said) return { name: kind, input: { description: said } };
  }
  return { name: kind, input: Object.keys(held).length ? held : { description: name } };
}

export function mcpConfig({ seat = "", base = "", peerMcp = "", gateway = null, remote = [], env = process.env } = {}) {
  const servers = {};
  if (seat && peerMcp) servers.hive = { command: process.execPath, args: [peerMcp], env: { HIVE_SEAT: seat, HIVE_STATE_DIR: base } };
  const token = env.HIVE_MCP_GATEWAY_TOKEN || "";
  if (gateway?.port) {
    for (const { name, url } of gatewayEntries(gateway)) servers[name] = { serverUrl: url, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) };
  }
  for (const one of remote) {
    const headers = Object.fromEntries(Object.entries(one.headers || {}).map(([k, v]) => [k, String(v).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => env[key] || "")]));
    servers[one.name] = { serverUrl: one.url, ...(Object.keys(headers).length ? { headers } : {}) };
  }
  return { mcpServers: servers };
}

export function seatHome(base, seat) {
  return join(base, "agy", seat, "home");
}

function serversIn(path) {
  try { return JSON.parse(readFileSync(path, "utf8"))?.mcpServers || {}; } catch { return {}; }
}

export function writeSeatHome({ seat, base, home = homedir(), ...rest }) {
  const dir = seatHome(base, seat);
  const file = join(dir, OWN_MCP);
  mirrorHome(home, dir, [OWN_MCP]);
  mkdirSync(dirname(file), { recursive: true });
  const servers = { ...serversIn(join(home, OWN_MCP)), ...mcpConfig({ seat, base, ...rest }).mcpServers };
  writeFileSync(file, JSON.stringify({ mcpServers: servers }, null, 2), { mode: 0o600 });
  return dir;
}

function agyOf(ctx) {
  if (!ctx.agy) ctx.agy = { text: "", thought: "", said: false, open: new Map() };
  return ctx.agy;
}

function flushText(mine) {
  const blocks = [];
  if (mine.thought) blocks.push({ type: "thinking", thinking: mine.thought });
  if (mine.text) blocks.push({ type: "text", text: mine.text });
  mine.thought = "";
  mine.text = "";
  return blocks.length ? [assistant(blocks)] : [];
}

function openTool(mine, id, step) {
  const card = toolCard(step.tool_info?.name || step.tool_name, step.tool_info?.parameters);
  mine.open.set(id, card.name);
  return [...flushText(mine), assistant([{ type: "tool_use", id, name: card.name, input: card.input }])];
}

function closeOpenTools(mine, failed) {
  const out = [];
  for (const id of mine.open.keys()) out.push(toolResult(id, "", failed));
  mine.open.clear();
  return out;
}

function stepOut(step, ctx, mine) {
  if (step.conversation_id && !ctx.sessionId) ctx.sessionId = step.conversation_id;
  if (step.step_type === "agent_response") {
    const out = [];
    if (step.thinking_delta) {
      mine.thought += step.thinking_delta;
      out.push(streamDelta("thinking", step.thinking_delta));
    }
    if (step.text_delta) {
      mine.text += step.text_delta;
      mine.said = true;
      out.push(streamDelta("text", step.text_delta));
    }
    if (step.state === "DONE") out.push(...flushText(mine));
    return out;
  }
  if (step.step_type !== "tool" && step.step_type !== "tool_call") return [];
  const id = `${step.conversation_id || ctx.sessionId || "agy"}:${step.step_index ?? mine.open.size}`;
  const out = mine.open.has(id) ? [] : openTool(mine, id, step);
  if (step.state === "DONE" || step.state === "ERROR") {
    mine.open.delete(id);
    out.push(toolResult(id, step.tool_info?.output ?? "", step.state === "ERROR"));
  }
  return out;
}

function resultOut(result, ctx, mine) {
  if (result.conversation_id && !ctx.sessionId) ctx.sessionId = result.conversation_id;
  const usage = result.usage || {};
  ctx.usage.input_tokens += Number(usage.input_tokens) || 0;
  ctx.usage.output_tokens += Number(usage.output_tokens) || 0;
  ctx.usage.cache_read_input_tokens += Number(usage.cache_read_tokens) || 0;
  const ok = result.status === "SUCCESS";
  const out = [...flushText(mine), ...closeOpenTools(mine, !ok)];
  if (ok && !mine.said && result.response) out.push(assistant([{ type: "text", text: String(result.response) }]));
  const stopped = result.status === "INTERRUPTED" || result.status === "CANCELED" || /^interrupted$/i.test(String(result.error || "").trim());
  if (!ok && !stopped) out.push(warning(loginTrouble(result.error || "the turn failed")));
  mine.said = false;
  return out;
}

export function translate(ev, ctx) {
  const mine = agyOf(ctx);
  if (ev?.event === "init") {
    if (ev.conversation_id) ctx.sessionId = ev.conversation_id;
    return [];
  }
  if (ev?.event === "step_update") return stepOut(ev.step_update || {}, ctx, mine);
  if (ev?.event === "result") return resultOut(ev.result || {}, ctx, mine);
  return [];
}

export function finishTurn(ctx, interrupted) {
  const mine = agyOf(ctx);
  return [...flushText(mine), ...closeOpenTools(mine, interrupted)];
}

const MODEL_SLUG = /^[a-z0-9][a-z0-9._:-]*$/i;

export function parseAgyModels(out) {
  return String(out || "").split("\n")
    .map((line) => line.trim().split("\t").map((cell) => cell.trim()))
    .filter(([slug, label]) => label && MODEL_SLUG.test(slug))
    .map(([slug, label]) => ({ value: slug, label, description: "", context: "", group: "antigravity", isDefault: false, efforts: [], defaultEffort: "", badges: [] }));
}

export function parseAgyMcpList(out) {
  const rows = [];
  for (const raw of String(out || "").replace(/\x1b\[[0-9;]*m/g, "").split("\n")) {
    const cells = raw.trim().split(/\s+/);
    if (cells.length < 3 || cells[0] === "NAME") continue;
    const [name, , status] = cells;
    rows.push({ name, status: status === "disabled" ? "disabled" : "pending", error: "" });
  }
  return rows;
}

export function antigravityIdentity(said) {
  const text = String(said || "");
  if (!text.trim() || needsLogin(text)) return { loggedIn: false, email: "", tier: "" };
  return parseAgyModels(text).length ? { loggedIn: true, email: "", tier: "google" } : { loggedIn: false, email: "", tier: "" };
}
