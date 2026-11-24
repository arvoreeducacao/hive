import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const APP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const APP_DOCUMENT_MAX_BYTES = 5 << 20;
const APP_RESULT_MAX_CHARS = 2_000_000;
const APP_CAPTURE_MS = 20000;
const RESOURCE_URI_MAX = 4096;
const DOMAINS_MAX = 32;
const DOMAIN = /^(?:https|wss):\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::\d{1,5})?$/i;
const PERMISSIONS = ["camera", "microphone", "geolocation", "clipboardWrite"];
const OWN_SERVER = "hive";

const toolPart = (text) => String(text).replace(/[^a-zA-Z0-9_-]/g, "_");

export const toolPrefixOf = (server) => `mcp__${toolPart(server)}__`;

export const claudeToolName = (server, tool) => `${toolPrefixOf(server)}${toolPart(tool)}`;

export const mightCarryApp = (toolName) => {
  const name = String(toolName || "");
  return name.startsWith("mcp__") && !name.startsWith(toolPrefixOf(OWN_SERVER));
};

function prefixesOverlap(statuses, server) {
  const mine = toolPrefixOf(server);
  return statuses.some((status) => {
    if (status.name === server) return false;
    const other = toolPrefixOf(status.name);
    return other.startsWith(mine) || mine.startsWith(other);
  });
}

export function findAppTool(statuses, toolName) {
  const list = Array.isArray(statuses) ? statuses : [];
  const matches = list
    .filter((status) => status?.status === "connected" && String(toolName).startsWith(toolPrefixOf(status.name)))
    .flatMap((status) => (status.tools || [])
      .filter((tool) => claudeToolName(status.name, tool.name) === toolName)
      .map((tool) => ({ server: status.name, tool })));
  if (matches.length !== 1 || prefixesOverlap(list, matches[0].server)) return null;
  return matches[0];
}

export function appResourceUri(meta) {
  const uri = meta?.ui?.resourceUri ?? meta?.["ui/resourceUri"];
  return typeof uri === "string" && uri.startsWith("ui://") && uri.length <= RESOURCE_URI_MAX ? uri : "";
}

export const toolIsReadOnly = (tool) => tool?.annotations?.readOnly === true || tool?.annotations?.readOnlyHint === true;

export function appMayCall(tool) {
  const visibility = tool?._meta?.ui?.visibility;
  return !Array.isArray(visibility) || visibility.includes("app");
}

function domainsOf(value) {
  if (!Array.isArray(value)) return undefined;
  const domains = value.filter((one) => typeof one === "string" && one.length <= 256 && DOMAIN.test(one)).slice(0, DOMAINS_MAX);
  return domains.length ? domains : undefined;
}

export function appCspOf(value) {
  if (!value || typeof value !== "object") return undefined;
  const csp = {};
  for (const key of ["connectDomains", "resourceDomains"]) {
    const domains = domainsOf(value[key]);
    if (domains) csp[key] = domains;
  }
  return Object.keys(csp).length ? csp : undefined;
}

export function appPermissionsOf(value) {
  if (!value || typeof value !== "object") return undefined;
  const asked = PERMISSIONS.filter((key) => value[key] && typeof value[key] === "object");
  return asked.length ? Object.fromEntries(asked.map((key) => [key, {}])) : undefined;
}

export function appDocumentOf(contents) {
  const html = (Array.isArray(contents) ? contents : []).find((one) => typeof one?.mimeType === "string" && /^text\/html/i.test(one.mimeType));
  if (!html) return null;
  const text = typeof html.text === "string" ? html.text : typeof html.blob === "string" ? Buffer.from(html.blob, "base64").toString("utf8") : "";
  if (!text.trim() || Buffer.byteLength(text, "utf8") > APP_DOCUMENT_MAX_BYTES) return null;
  const ui = html._meta?.ui || {};
  return { html: text, csp: appCspOf(ui.csp), permissions: appPermissionsOf(ui.permissions), prefersBorder: ui.prefersBorder === true };
}

export function callResultOf(message, block) {
  const raw = message?.tool_use_result;
  if (raw && typeof raw === "object" && Array.isArray(raw.content)) {
    return { content: raw.content, ...(raw.structuredContent && typeof raw.structuredContent === "object" ? { structuredContent: raw.structuredContent } : {}), ...(block?.is_error ? { isError: true } : {}) };
  }
  const content = typeof block?.content === "string" ? [{ type: "text", text: block.content }] : Array.isArray(block?.content) ? block.content : [];
  return { content, ...(block?.is_error ? { isError: true } : {}) };
}

export const documentTitleOf = (html) => {
  const said = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(String(html || ""));
  return said ? said[1].replace(/\s+/g, " ").trim() : "";
};

const bounded = (value) => {
  const text = JSON.stringify(value ?? null);
  return text.length <= APP_RESULT_MAX_CHARS ? value : { content: [{ type: "text", text: "the result was too big to keep for the app" }], isError: true };
};

const appDir = (base, seat) => join(base, "mcp-apps", seat);

export async function readAppMeta(base, seat, id) {
  if (!APP_ID.test(String(id || ""))) throw new Error("that is not an app of this chat");
  try {
    return JSON.parse(await readFile(join(appDir(base, seat), `${id}.json`), "utf8"));
  } catch {
    throw new Error("this app is no longer on disk");
  }
}

function withTimeout(work, ms) {
  let timer;
  const late = new Promise((_, fail) => { timer = setTimeout(() => fail(new Error("the app took too long to load")), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

export async function captureMcpApp({ session, base, seat, toolUse, result, ms = APP_CAPTURE_MS }) {
  if (!session || !mightCarryApp(toolUse?.name)) return null;
  return withTimeout((async () => {
    const match = findAppTool(await session.mcpServerStatus(), toolUse.name);
    const resourceUri = appResourceUri(match?.tool?._meta);
    if (!resourceUri) return null;
    const read = await session.readMcpResource(match.server, resourceUri);
    const document = appDocumentOf(read?.contents);
    if (!document) return null;
    const id = randomUUID();
    const title = String(match.tool.title || match.tool.annotations?.title || documentTitleOf(document.html) || match.tool.name).slice(0, 200);
    const meta = {
      id, server: match.server, tool: match.tool.name, title, resourceUri,
      csp: document.csp, permissions: document.permissions, prefersBorder: document.prefersBorder,
      toolUseId: String(toolUse.id || ""), input: bounded(toolUse.input || {}), result: bounded(result)
    };
    await mkdir(appDir(base, seat), { recursive: true });
    await writeFile(join(appDir(base, seat), `${id}.html`), document.html);
    await writeFile(join(appDir(base, seat), `${id}.json`), JSON.stringify(meta));
    return { type: "driver", subtype: "mcp_app", tool_use_id: meta.toolUseId, app: { id, server: meta.server, tool: meta.tool, title, prefersBorder: meta.prefersBorder } };
  })(), ms);
}

const STATUS_WAIT_MS = 15000;

async function serverStatus(session, server, waitMs) {
  const until = Date.now() + waitMs;
  for (;;) {
    const status = (await session.mcpServerStatus()).find((one) => one.name === server);
    if (status?.status !== "pending" || Date.now() >= until) return status;
    await new Promise((done) => setTimeout(done, 300));
  }
}

async function appTool(session, meta, name, waitMs = STATUS_WAIT_MS) {
  const status = await serverStatus(session, meta.server, waitMs);
  if (!status || status.status !== "connected") throw new Error(`the ${meta.server} server is not connected in this chat`);
  const tools = status.tools || [];
  const tool = tools.find((one) => one.name === name);
  if (!tool) throw new Error(`${meta.server} has no tool called ${name}`);
  if (tools.filter((one) => claudeToolName(meta.server, one.name) === claudeToolName(meta.server, name)).length > 1) {
    throw new Error(`another tool of ${meta.server} reaches the agent under the same name as ${name}, so it was not called`);
  }
  return tool;
}

export function mcpAppOps({ session, base, seat, waitMs = STATUS_WAIT_MS }) {
  const live = () => {
    if (!session()) throw new Error("this chat is not running — send it a message, then use the app again");
    return session();
  };
  return {
    mcpAppTool: async (cmd) => {
      const meta = await readAppMeta(base, seat, cmd.app);
      const tool = await appTool(live(), meta, String(cmd.tool || ""), waitMs);
      return { server: meta.server, tool: tool.name, title: String(tool.title || tool.annotations?.title || tool.name), readOnly: toolIsReadOnly(tool), callable: appMayCall(tool) };
    },
    mcpAppCall: async (cmd) => {
      const meta = await readAppMeta(base, seat, cmd.app);
      const query = live();
      const tool = await appTool(query, meta, String(cmd.tool || ""), waitMs);
      if (!appMayCall(tool)) throw new Error(`${meta.server} does not let its app call ${tool.name}`);
      const args = cmd.arguments && typeof cmd.arguments === "object" && !Array.isArray(cmd.arguments) ? cmd.arguments : {};
      const said = await query.request({ subtype: "mcp_call", tool: claudeToolName(meta.server, tool.name), arguments: args, result_not_for_model: true });
      return said?.response ?? said;
    },
    mcpAppRead: async (cmd) => {
      const meta = await readAppMeta(base, seat, cmd.app);
      const uri = String(cmd.uri || "");
      if (!uri || uri.length > RESOURCE_URI_MAX) throw new Error("resources/read needs a uri");
      return live().readMcpResource(meta.server, uri);
    }
  };
}
