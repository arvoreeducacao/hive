import { gatewayEntries } from "../gateway/mcp-gateway.mjs";
import { peerEntry } from "./peer-module.mjs";
import { modelsFromConfigOptions as parseKimiConfigOptions, setModelParams } from "./kimi-acp.mjs";

export { parseKimiConfigOptions };

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

function warning(message) {
  return { type: "driver", subtype: "warning", message: String(message || "").slice(0, 400) };
}

const PEER_MCP = peerEntry();

const ANSI = /\[[0-9;]*m/g;

export function parseOpencodeMcpList(out) {
  const rows = [];
  for (const raw of String(out || "").replace(ANSI, "").split("\n")) {
    const m = raw.match(/●\s+[✓⚠✗x]\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const said = m[2].trim().toLowerCase();
    const status = said.startsWith("connected") ? "connected"
      : said.startsWith("needs authentication") ? "needs-auth"
      : said.startsWith("disabled") ? "disabled"
      : "failed";
    rows.push({
      name: m[1],
      status,
      error: status === "failed" ? m[2].trim() : "",
    });
  }
  return rows;
}

export function parseCodexMcpList(out) {
  let list;
  try { list = JSON.parse(out); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({
    name: s.name || s.id || "mcp",
    status: s.enabled === false ? "disabled" : "pending",
    error: "",
  }));
}

function contextSize(tokens) {
  if (!tokens) return "";
  if (tokens >= 1000000) return `${Math.round(tokens / 100000) / 10}M`.replace(".0M", "M");
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return String(tokens);
}

function effortRow(value, description) {
  return { value, label: value, description: description || "" };
}

export function parseOpencodeCatalog(out) {
  const models = [];
  let buf = null;
  for (const raw of String(out || "").replace(ANSI, "").split("\n")) {
    const line = raw.trimEnd();
    if (line === "{") { buf = ["{"]; continue; }
    if (line === "}" && buf) {
      const text = buf.concat("}").join("\n");
      buf = null;
      let m;
      try { m = JSON.parse(text); } catch { continue; }
      if (!m?.id || !m?.providerID) continue;
      const context = contextSize(m.limit?.context);
      models.push({
        value: `${m.providerID}/${m.id}`,
        label: m.name || m.id,
        description: context ? `${context} context` : "",
        context,
        group: m.providerID,
        isDefault: false,
        efforts: Object.keys(m.variants || {}).map((v) => effortRow(v)),
        defaultEffort: "",
        badges: [],
      });
      continue;
    }
    if (buf) buf.push(line);
  }
  return models;
}

export function parseCodexCatalog(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((m) => !m.hidden && (m.model || m.id))
    .map((m) => ({
      value: m.model || m.id,
      label: m.displayName || m.model || m.id,
      description: m.description || "",
      context: "",
      group: "",
      isDefault: !!m.isDefault,
      efforts: (m.supportedReasoningEfforts || [])
        .filter((e) => e?.reasoningEffort)
        .map((e) => effortRow(e.reasoningEffort, e.description)),
      defaultEffort: m.defaultReasoningEffort || "",
      badges: [],
    }));
}

/* the claude catalogue comes from the CLI's own supportedModels(); this only
   puts it in the same shape the other two arrive in. Shared so the live seat
   and the new-chat box cannot drift apart. */
const CONTEXT_SAID = /(\d+(?:\.\d+)?\s*[km])\s*context/i;
const CONTEXT_VARIANT = /\[(\d+(?:\.\d+)?[km])\]/i;

function claudeContext(m) {
  const said = CONTEXT_SAID.exec(`${m.displayName || ""} ${m.description || ""}`)
    || CONTEXT_VARIANT.exec(`${m.value || ""} ${m.resolvedModel || ""}`);
  return said ? said[1].replace(/\s+/g, "").toUpperCase().replace("K", "k") : "";
}

const CLAUDE_GENERATION = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/;

function claudeGeneration(m) {
  const found = CLAUDE_GENERATION.exec(withoutVariant(m.resolvedModel || m.value));
  return found ? { family: found[1], rank: Number(found[2]) * 100 + Number(found[3] || 0) } : null;
}

function latestClaudeGenerations(rows) {
  const newest = new Map();
  for (const m of rows) {
    const generation = claudeGeneration(m);
    if (generation && generation.rank > (newest.get(generation.family) ?? -1)) newest.set(generation.family, generation.rank);
  }
  return rows.filter((m) => {
    if (m.value === "default") return true;
    const generation = claudeGeneration(m);
    return !generation || generation.rank === newest.get(generation.family);
  });
}

export function normalizeClaudeModels(rows) {
  return latestClaudeGenerations(Array.isArray(rows) ? rows : []).map((m) => ({
    value: m.value,
    label: m.displayName || m.value,
    description: m.description || "",
    context: claudeContext(m),
    group: "",
    resolved: m.resolvedModel || "",
    isDefault: m.value === "default",
    efforts: (m.supportedEffortLevels || []).map((v) => effortRow(v)),
    defaultEffort: "",
    badges: m.supportsFastMode ? ["fast mode"] : [],
  }));
}

/* the level claude runs at when nobody set one this session: the settings
   files, later file winning — the same order Claude Code itself resolves. Pure
   on purpose, so the driver and the app's server can share one answer. */
export function effortFromSettings(texts) {
  let found = "";
  for (const text of texts || []) {
    let said;
    try { said = JSON.parse(text); } catch { continue; }
    if (typeof said?.effortLevel === "string" && said.effortLevel) found = said.effortLevel;
  }
  return found;
}

export function withAppliedDefault(row, applied) {
  if (!row || row.defaultEffort || typeof applied !== "string") return row;
  if (!(row.efforts || []).some((level) => level.value === applied)) return row;
  row.defaultEffort = applied;
  return row;
}

/* the id a live session reports and the id the catalogue carries do not always
   agree on the context-window variant: claude's init says `claude-opus-5` while
   supportedModels() says `claude-opus-5[1m]`. Matching on the exact string alone
   leaves every row unselected, so fall back to the id without the variant. */
export function withoutVariant(id) {
  return String(id || "").replace(/\[[^\]]*\]/g, "");
}

export function pickModelRow(models, id) {
  const rows = Array.isArray(models) ? models : [];
  if (!rows.length) return null;
  const want = String(id || "");
  if (!want) return rows.find((m) => m.isDefault) || null;
  const bare = withoutVariant(want);
  return rows.find((m) => m.value === want)
    || rows.find((m) => m.resolved === want && !m.isDefault)
    || rows.find((m) => m.resolved === want)
    || rows.find((m) => m.resolved && withoutVariant(m.resolved) === bare && !m.isDefault)
    || rows.find((m) => m.resolved && withoutVariant(m.resolved) === bare)
    || rows.find((m) => withoutVariant(m.value) === bare)
    || null;
}

export function newTurnContext() {
  return {
    sessionId: "",
    cost: 0,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    open: new Set(),
  };
}

function codexToolShape(item) {
  if (item.type === "command_execution") {
    return {
      name: "shell",
      input: { command: item.command || "" },
      output: item.aggregated_output || "",
      failed: item.status === "failed",
    };
  }
  if (item.type === "file_change") {
    const files = (item.changes || []).map((c) => `${c.kind || "edit"} ${c.path}`).join(", ");
    return { name: "edit", input: { file_path: files }, output: item.status || "", failed: item.status === "failed" };
  }
  if (item.type === "mcp_tool_call") {
    return { name: item.tool || "mcp", input: item.arguments || item, output: item.result || item.status || "", failed: item.status === "failed" };
  }
  if (item.type === "web_search") {
    return { name: "web_search", input: { description: item.query || "" }, output: "", failed: false };
  }
  if (item.type === "todo_list") {
    const plan = (item.items || []).map((t) => (typeof t === "string" ? t : t.text || "")).filter(Boolean).join(" · ");
    return { name: "plan", input: { description: plan }, output: "", failed: false };
  }
  return { name: item.type || "item", input: { description: JSON.stringify(item).slice(0, 200) }, output: "", failed: item.status === "failed" };
}

/* opencode reads its whole configuration off OPENCODE_CONFIG_CONTENT, so a turn can carry
   the hive's own tools and the hub's gateway servers without touching the person's files.
   A stdio server is `local` with a command array; the gateway's are `remote`. */
/* opencode names every MCP tool <server>_<tool>, and the model provider rejects a
   function name that does not start with a letter. A server whose name opens with a
   digit (360dialog) would poison the whole tool list, so the config key is made to
   start with a letter while the gateway path and the remote url keep the real name. */
export function opencodeMcpKey(name) {
  const clean = String(name || "").replace(/[^A-Za-z0-9_-]/g, "_");
  return /^[A-Za-z]/.test(clean) ? clean : `mcp_${clean}`;
}

export function opencodeMcpConfig({ seat = "", base = "", peerMcp = "", gateway = null, remote = [], env = process.env } = {}) {
  const mcp = {};
  if (seat && peerMcp) {
    mcp.hive = { type: "local", command: [process.execPath, peerMcp], environment: { HIVE_SEAT: seat, HIVE_STATE_DIR: base }, enabled: true };
  }
  if (gateway?.port) {
    const token = env.HIVE_MCP_GATEWAY_TOKEN || "";
    for (const { name, url } of gatewayEntries(gateway)) mcp[opencodeMcpKey(name)] = { type: "remote", url, enabled: true, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) };
  }
  for (const one of remote) {
    const headers = Object.fromEntries(Object.entries(one.headers || {}).map(([k, v]) => [k, String(v).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => env[key] || "")]));
    mcp[opencodeMcpKey(one.name)] = { type: "remote", url: one.url, enabled: true, ...(Object.keys(headers).length ? { headers } : {}) };
  }
  return Object.keys(mcp).length ? JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp }) : "";
}

export const agents = {
  opencode: {
    label: "OpenCode",
    binary: "opencode",
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    turnEnv({ seat = "", base = "", peerMcp = "", gateway = null, remote = [], env = process.env } = {}) {
      const content = opencodeMcpConfig({ seat, base, peerMcp, gateway, remote, env });
      return content ? { OPENCODE_CONFIG_CONTENT: content } : {};
    },
    turnArgs({ text, images = [], model = "", effort = "", sessionId = "" }) {
      const args = ["run", "--format", "json", "--auto", "--agent", "build"];
      if (model) args.push("--model", model);
      if (effort) args.push("--variant", effort);
      if (sessionId) args.push("--session", sessionId);
      for (const f of images) args.push("--file", f);
      args.push(text);
      return args;
    },
    async listModels(run) {
      const out = await run("opencode", ["models"]);
      return out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && l.includes("/") && !l.includes(" "))
        .map((value) => ({ value, displayName: value }));
    },
    async listCatalog({ run }) {
      const models = parseOpencodeCatalog(await run("opencode", ["models", "--verbose"]));
      if (models.length) return models;
      return (await this.listModels(run)).map((m) => ({
        value: m.value, label: m.value, description: "", group: m.value.split("/")[0],
        isDefault: false, efforts: [], defaultEffort: "", badges: [],
      }));
    },
    async listMcp(run) {
      return parseOpencodeMcpList(await run("opencode", ["mcp", "list"]));
    },
    translate(ev, ctx) {
      const out = [];
      if (ev.sessionID && !ctx.sessionId) ctx.sessionId = ev.sessionID;
      const part = ev.part || {};
      if (ev.type === "text" && part.text) out.push(assistant([{ type: "text", text: part.text }]));
      if (ev.type === "reasoning" && part.text) out.push(assistant([{ type: "thinking", thinking: part.text }]));
      if (ev.type === "tool_use" && part.callID) {
        const state = part.state || {};
        out.push(assistant([{ type: "tool_use", id: part.callID, name: part.tool || "tool", input: state.input || {} }]));
        out.push(toolResult(part.callID, state.output ?? "", state.status === "error"));
      }
      if (ev.type === "step_finish" && part.tokens) {
        ctx.usage.input_tokens += part.tokens.input || 0;
        ctx.usage.output_tokens += part.tokens.output || 0;
        ctx.usage.cache_read_input_tokens += part.tokens.cache?.read || 0;
        ctx.cost += part.cost || 0;
      }
      if (ev.type === "error") out.push(warning(ev.error?.message || ev.message || JSON.stringify(ev).slice(0, 200)));
      return out;
    },
  },

  codex: {
    label: "Codex",
    binary: "codex",
    effortLevels: ["low", "medium", "high", "xhigh"],
    turnArgs({ text, images = [], model = "", effort = "", sessionId = "", seat = "", base = "" }) {
      const args = sessionId ? ["exec", "resume", sessionId] : ["exec"];
      args.push("--json", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check");
      if (seat) args.push("-c", `mcp_servers.hive={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(PEER_MCP)}],env={HIVE_SEAT=${JSON.stringify(seat)},HIVE_STATE_DIR=${JSON.stringify(base)}}}`);
      if (model) args.push("--model", model);
      if (effort) args.push("-c", `model_reasoning_effort="${effort}"`);
      for (const f of images) args.push("--image", f);
      args.push(text);
      return args;
    },
    async listModels(run, io) {
      const models = await this.listCatalog({ run, ...io });
      return models.map((m) => ({ value: m.value, displayName: m.label, description: m.description }));
    },
    async listCatalog({ rpc }) {
      if (!rpc) throw new Error("this seat's driver cannot reach the codex app-server");
      const rows = await rpc("codex", ["app-server"], async (call) => {
        await call("initialize", {
          clientInfo: { name: "hive", title: "Hive", version: "1" },
          capabilities: { experimentalApi: true },
        });
        const all = [];
        let cursor = "";
        do {
          const page = await call("model/list", cursor ? { cursor } : {});
          all.push(...(page?.data || []));
          cursor = page?.nextCursor || "";
        } while (cursor);
        return all;
      });
      return parseCodexCatalog(rows);
    },
    async listMcp(run) {
      return parseCodexMcpList(await run("codex", ["mcp", "list", "--json"]));
    },
    translate(ev, ctx) {
      const out = [];
      if (ev.type === "thread.started" && ev.thread_id) ctx.sessionId = ev.thread_id;
      if (ev.type === "turn.completed" && ev.usage) {
        ctx.usage.input_tokens += ev.usage.input_tokens || 0;
        ctx.usage.output_tokens += ev.usage.output_tokens || 0;
        ctx.usage.cache_read_input_tokens += ev.usage.cached_input_tokens || 0;
      }
      if (ev.type === "turn.failed") out.push(warning(ev.error?.message || "the turn failed"));
      if (ev.type === "error") out.push(warning(ev.message || "error"));
      if (ev.type !== "item.started" && ev.type !== "item.completed") return out;
      const item = ev.item || {};
      if (item.type === "agent_message") {
        if (ev.type === "item.completed" && item.text) out.push(assistant([{ type: "text", text: item.text }]));
        return out;
      }
      if (item.type === "reasoning") {
        if (ev.type === "item.completed" && item.text) out.push(assistant([{ type: "thinking", thinking: item.text }]));
        return out;
      }
      const tool = codexToolShape(item);
      if (ev.type === "item.started") {
        ctx.open.add(item.id);
        out.push(assistant([{ type: "tool_use", id: item.id, name: tool.name, input: tool.input }]));
        return out;
      }
      if (!ctx.open.has(item.id)) out.push(assistant([{ type: "tool_use", id: item.id, name: tool.name, input: tool.input }]));
      ctx.open.delete(item.id);
      out.push(toolResult(item.id, tool.output, tool.failed));
      return out;
    },
  },
};

agents.kimi = {
  label: "Kimi",
  binary: "kimi",
  effortLevels: [],
  turnArgs({ text, model = "", sessionId = "" }) {
    const args = ["-p", text, "--output-format", "stream-json", "--auto"];
    if (model) args.push("-m", model);
    if (sessionId) args.push("--session", sessionId);
    return args;
  },
  async listModels(run, io) {
    const models = await this.listCatalog({ run, ...io });
    return models.map((m) => ({ value: m.value, displayName: m.label, description: m.description }));
  },
  async listCatalog({ rpc }) {
    if (!rpc) throw new Error("this seat's driver cannot reach kimi acp");
    return rpc("kimi", ["acp"], async (call) => {
      await call("initialize", { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "hive", title: "Hive", version: "1" } });
      const opened = await call("session/new", { cwd: process.cwd(), mcpServers: [] });
      const models = parseKimiConfigOptions(opened?.configOptions);
      for (const row of models) {
        if (row.isDefault) continue;
        const changed = await call("session/set_config_option", setModelParams(opened.sessionId, row.value));
        const selected = parseKimiConfigOptions(changed?.configOptions).find((model) => model.value === row.value);
        if (selected) Object.assign(row, { efforts: selected.efforts, defaultEffort: selected.defaultEffort });
      }
      return models;
    });
  },
  async listMcp() {
    return [];
  },
  translate(ev, ctx) {
    const out = [];
    if (ev.role === "assistant" && typeof ev.content === "string" && ev.content) out.push(assistant([{ type: "text", text: ev.content }]));
    return out;
  },
};

export function parseCursorConfigOptions(configOptions) {
  const option = (configOptions || []).find((o) => o?.id === "model" || o?.category === "model");
  return (option?.options || []).map((row) => ({
    value: row.value, label: row.name || row.value, description: row.description || "", group: "cursor",
    isDefault: row.value === option.currentValue, efforts: [], defaultEffort: "", badges: [],
  })).filter((row) => row.value);
}

agents.cursor = {
  label: "Cursor",
  binary: "cursor-agent",
  effortLevels: [],
  turnArgs({ text, model = "", sessionId = "" }) {
    const args = ["-p", text, "--output-format", "stream-json", "--force", "--trust"];
    if (model) args.push("--model", model);
    if (sessionId) args.push("--resume", sessionId);
    return args;
  },
  async listModels(run, io) {
    const models = await this.listCatalog({ run, ...io });
    return models.map((m) => ({ value: m.value, displayName: m.label, description: m.description }));
  },
  async listCatalog({ rpc }) {
    if (!rpc) throw new Error("this seat's driver cannot reach cursor-agent acp");
    const options = await rpc("cursor-agent", ["acp"], async (call) => {
      await call("initialize", { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "hive", title: "Hive", version: "1" } });
      await call("authenticate", { methodId: "cursor_login" });
      const opened = await call("session/new", { cwd: process.cwd(), mcpServers: [] });
      return opened?.configOptions || [];
    });
    return parseCursorConfigOptions(options);
  },
  async listMcp() {
    return [];
  },
  translate(ev, ctx) {
    const out = [];
    if (ev.type === "system" && ev.subtype === "init" && ev.session_id) ctx.sessionId = ev.session_id;
    if (ev.type === "assistant") {
      const text = (ev.message?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
      if (text) out.push(assistant([{ type: "text", text }]));
    }
    return out;
  },
};

export const KIRO_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

export function parseKiroModels(result) {
  const models = result?.models || {};
  return (models.availableModels || []).map((row) => ({
    value: row.modelId, label: row.name || row.modelId, description: row.description || "", group: "kiro",
    isDefault: row.modelId === models.currentModelId, efforts: KIRO_EFFORT_LEVELS.map((v) => effortRow(v)), defaultEffort: "", badges: [],
  })).filter((row) => row.value);
}

agents.kiro = {
  label: "Kiro",
  binary: "kiro-cli",
  effortLevels: KIRO_EFFORT_LEVELS,
  turnArgs({ text, model = "" }) {
    const args = ["chat", "--no-interactive", "--trust-all-tools", "--output-format", "stream-json"];
    if (model) args.push("--model", model);
    args.push(text);
    return args;
  },
  async listModels(run, io) {
    const models = await this.listCatalog({ run, ...io });
    return models.map((m) => ({ value: m.value, displayName: m.label, description: m.description }));
  },
  async listCatalog({ rpc }) {
    if (!rpc) throw new Error("this seat's driver cannot reach kiro-cli acp");
    const opened = await rpc("kiro-cli", ["acp"], async (call) => {
      await call("initialize", { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "hive", title: "Hive", version: "1" } });
      return call("session/new", { cwd: process.cwd(), mcpServers: [] });
    });
    return parseKiroModels(opened);
  },
  async listMcp() {
    return [];
  },
  translate(ev) {
    const out = [];
    const text = typeof ev?.content === "string" ? ev.content : typeof ev?.text === "string" ? ev.text : "";
    if ((ev?.role === "assistant" || ev?.type === "assistant") && text) out.push(assistant([{ type: "text", text }]));
    return out;
  },
};

export const AUTOCOMPACT_AUTO = "auto";
export const AUTOCOMPACT_FLOOR_K = 100;
export const AUTOCOMPACT_CEILING_K = 1000;
const AUTOCOMPACT_SHAPE = /^([1-9]\d*)\s*k$/i;

export function autocompactThousands(asked) {
  const said = AUTOCOMPACT_SHAPE.exec(String(asked ?? "").trim());
  if (!said) return 0;
  const k = Number(said[1]);
  return k >= AUTOCOMPACT_FLOOR_K && k <= AUTOCOMPACT_CEILING_K ? k : 0;
}

export function autocompactTokens(asked) {
  return autocompactThousands(asked) * 1000;
}

export function autocompactFromConfig(config) {
  const k = autocompactThousands(config?.autocompact);
  return k ? `${k}k` : "";
}
