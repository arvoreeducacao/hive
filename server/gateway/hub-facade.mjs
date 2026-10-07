import { readFileSync, statSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { HUB_SERVER } from "./mcp-gateway.mjs";

const SEARCH_LIMIT = 20;
const LISTED_TOOLS = 6;

const HUB_TOOLS = [
  {
    name: "mcp_list",
    description: "Lista os servidores MCP do hub: nome, quantas ferramentas, onde vale e as primeiras ferramentas. Bancos de dados, Slack, métricas, tickets e afins vivem atrás do hub, não como tools soltas. Passe repo pra ver primeiro os que valem no repositório em que você está. Não liga servidor nenhum.",
    inputSchema: { type: "object", properties: { repo: { type: "string", description: "nome do repositório, como no hive.json" } } },
  },
  {
    name: "mcp_search",
    description: "Antes de dizer que não tem ferramenta para algo, procure aqui: acha ferramentas por palavra no nome e na descrição, no catálogo do hub, sem ligar nenhum servidor. Se mcp_list indicar sem catálogo, passe server para catalogar somente esse servidor. Devolve os schemas para mcp_call.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "palavras; todas precisam casar" }, limit: { type: "integer", minimum: 1, maximum: 20 }, server: { type: "string", description: "servidor de mcp_list; cataloga se necessário" } }, required: ["query"] },
  },
  {
    name: "mcp_call",
    description: "Chama uma ferramenta de um servidor do hub, ligando o servidor na hora se preciso. server e tool vêm do mcp_search.",
    inputSchema: { type: "object", properties: { server: { type: "string" }, tool: { type: "string" }, arguments: { type: "object" } }, required: ["server", "tool"] },
  },
];

export function hubToolsBehind(servers) {
  if (!servers.length) return HUB_TOOLS;
  const behind = ` Servidores atrás do hub: ${servers.join(", ")}.`;
  return HUB_TOOLS.map((tool) => (tool.name === "mcp_call" ? tool : { ...tool, description: tool.description + behind }));
}

export function reachesRepo(scope, repo) {
  if (scope === "*") return true;
  if (!repo) return false;
  const targets = Array.isArray(scope) ? scope : [scope];
  return targets.some((target) => (typeof target === "string" ? target : target?.repo) === repo);
}

export function searchTools(catalog, query, limit = SEARCH_LIMIT) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const hits = [];
  for (const [server, manifest] of Object.entries(catalog)) {
    for (const tool of manifest?.tools || []) {
      const hay = `${server} ${tool.name} ${tool.description || ""}`.toLowerCase();
      if (!words.every((word) => hay.includes(word))) continue;
      const score = words.filter((word) => tool.name.toLowerCase().includes(word)).length * 2 + words.filter((word) => server.toLowerCase().includes(word)).length;
      hits.push({ score, server, tool: tool.name, description: tool.description || "", inputSchema: tool.inputSchema });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return { total: hits.length, tools: hits.slice(0, Number.isInteger(limit) ? Math.max(1, Math.min(SEARCH_LIMIT, limit)) : SEARCH_LIMIT).map(({ score, ...hit }) => hit) };
}

export function hubFacade({ manifestFile, names, readManifest, missingByServer, harvest, ensureUpstream }) {
  let scopeStamp = null;
  let scopes = {};

  function scopesOf() {
    let stamp = "";
    try {
      const info = statSync(manifestFile);
      stamp = `${info.mtimeMs}:${info.size}`;
    } catch {}
    if (stamp === scopeStamp) return scopes;
    scopeStamp = stamp;
    try {
      const parsed = JSON.parse(readFileSync(manifestFile, "utf8"));
      scopes = parsed?.mcps && typeof parsed.mcps === "object" ? parsed.mcps : {};
    } catch {
      scopes = {};
    }
    return scopes;
  }

  function rankOf(name, repo) {
    const scope = scopesOf()[name];
    if (scope === "*") return 0;
    return reachesRepo(scope, repo) ? 1 : 2;
  }

  function serverLines(repo) {
    const missing = missingByServer();
    const ordered = names()
      .map((name, at) => ({ name, at, rank: rankOf(name, repo) }))
      .sort((a, b) => a.rank - b.rank || a.at - b.at);
    return ordered.map(({ name, rank }) => {
      const faltando = missing[name] || [];
      const semCredencial = faltando.length ? `falta ${faltando.join(", ")} no .env do hub` : "";
      const manifest = readManifest(name);
      if (!manifest) return [`${name} · sem catálogo; use mcp_search com server="${name}"`, semCredencial].filter(Boolean).join(" · ");
      const tools = manifest.tools.map((tool) => tool.name);
      const shown = tools.slice(0, LISTED_TOOLS).join(", ") + (tools.length > LISTED_TOOLS ? `, +${tools.length - LISTED_TOOLS}` : "");
      const onde = rank === 0 ? "vale em todo repositório" : rank === 1 ? `vale em ${repo}` : "";
      return [`${name} · ${tools.length} ${tools.length === 1 ? "ferramenta" : "ferramentas"}`, onde, shown, semCredencial].filter(Boolean).join(" · ");
    });
  }

  function catalog() {
    const out = {};
    for (const name of names()) {
      const manifest = readManifest(name);
      if (manifest) out[name] = manifest;
    }
    return out;
  }

  async function search(args) {
    if (typeof args.query !== "string") return refused("query deve ser texto; use vazio para listar as ferramentas");
    const target = args.server;
    if (target !== undefined && (typeof target !== "string" || !names().includes(target))) return refused("servidor nao existe no hub; veja mcp_list");
    try {
      const indexed = target ? { [target]: await harvest(target) } : catalog();
      return said({ ...searchTools(indexed, args.query, args.limit), uncatalogued: names().filter((name) => !readManifest(name)) });
    } catch (error) {
      return refused(`${target} nao foi catalogado: ${error?.message || error}`);
    }
  }

  const said = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
  const refused = (message) => ({ content: [{ type: "text", text: message }], isError: true });

  async function callThrough(args) {
    const target = String(args.server || "");
    const tool = String(args.tool || "");
    if (!names().includes(target)) return refused(`servidor ${target || "?"} nao existe no hub; veja mcp_list`);
    if (!tool) return refused("tool deve ser o nome de uma ferramenta de mcp_search");
    if (args.arguments !== undefined && (!args.arguments || typeof args.arguments !== "object" || Array.isArray(args.arguments))) return refused("arguments deve ser um objeto");
    try {
      const manifest = await harvest(target);
      if (!manifest.tools.some((one) => one.name === tool)) return refused(`${target} nao tem a ferramenta ${tool}; veja mcp_search`);
      const client = await ensureUpstream(target);
      return await client.callTool({ name: tool, arguments: args.arguments || {} });
    } catch (error) {
      return refused(`${target}/${tool} falhou: ${error?.message || error}`);
    }
  }

  return function buildHubFacade() {
    const server = new Server({ name: `${HUB_SERVER} (hive)`, version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: hubToolsBehind(names()) }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      if (name === "mcp_list") return said(serverLines(args.repo ? String(args.repo) : "").join("\n") || "nenhum servidor no hub");
      if (name === "mcp_search") return search(args);
      if (name === "mcp_call") return callThrough(args);
      return refused(`ferramenta ${name} nao existe; as do hub sao mcp_list, mcp_search e mcp_call`);
    });
    return server;
  };
}
