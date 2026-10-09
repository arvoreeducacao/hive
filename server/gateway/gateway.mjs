import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readlinkSync, chmodSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { HUB_SERVER, PEER_SERVER } from "./mcp-gateway.mjs";
import { hubFacade } from "./hub-facade.mjs";
import { ceilingOf, peerCalls, toolsFor } from "../peer/peer-tools.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const SELF_MTIME_MS = (() => { try { return statSync(SELF).mtimeMs; } catch { return 0; } })();
const DEFAULT_PORT = 4671;
const DEFAULT_IDLE_MS = 10 * 60 * 1000;
const REAP_EVERY_MS = 60 * 1000;

export function hubOf(driverDir = HERE, env = process.env) {
  return env.HIVE_HUB || env.HIVE_MCP_HUB || resolve(driverDir, "..", "..");
}

export function loadDotEnv(path, into, { override = false } = {}) {
  if (!existsSync(path)) return into;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim();
    if (!override && into[key] !== undefined) continue;
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    into[key] = value;
  }
  return into;
}

const ENV_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function expandEnv(spec, source) {
  const out = {};
  for (const [key, value] of Object.entries(spec || {})) {
    out[key] = String(value).replace(ENV_REF, (_, name) => source[name] ?? "");
  }
  return out;
}

export function envRefs(spec) {
  const names = new Set();
  for (const value of Object.values(spec || {})) {
    for (const [, name] of String(value).matchAll(ENV_REF)) names.add(name);
  }
  return [...names];
}

export function missingEnvKeys(definition, source) {
  const refs = new Set([...envRefs(definition.env), ...envRefs(definition.headers)]);
  const optional = new Set(definition.optionalEnv || []);
  return [...refs].filter((name) => !optional.has(name) && !String(source[name] ?? "").trim());
}

export function packageVersionOf(definition, hub) {
  const entry = (definition.args || []).find((a) => typeof a === "string" && a.includes("node_modules"));
  if (!entry) return "";
  try {
    const absolute = resolve(hub, entry);
    const target = resolve(dirname(absolute), readlinkSync(absolute));
    const marker = `${target.split("node_modules")[0]}node_modules`;
    const relative = target.slice(marker.length + 1).split("/");
    const scoped = relative[0].startsWith("@") ? relative.slice(0, 2) : relative.slice(0, 1);
    return JSON.parse(readFileSync(join(marker, ...scoped, "package.json"), "utf8")).version || "";
  } catch {
    return "";
  }
}

export function manifestKey(definition, hub) {
  const stamp = JSON.stringify(definition) + "@" + packageVersionOf(definition, hub);
  return createHash("sha1").update(stamp).digest("hex").slice(0, 16);
}

export function resolveToken({ env, tokenFile }) {
  if (env.HIVE_MCP_GATEWAY_TOKEN) return env.HIVE_MCP_GATEWAY_TOKEN;
  if (existsSync(tokenFile)) {
    const saved = readFileSync(tokenFile, "utf8").trim();
    if (saved) return saved;
  }
  const minted = randomBytes(24).toString("hex");
  mkdirSync(dirname(tokenFile), { recursive: true });
  writeFileSync(tokenFile, minted + "\n", { mode: 0o600 });
  chmodSync(tokenFile, 0o600);
  return minted;
}

export function authorize(req, token) {
  if (req.headers.origin) return "origem de navegador recusada";
  const header = req.headers.authorization || "";
  const offered = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!offered || offered !== token) return "credencial invalida";
  return null;
}

export function seatEnvFrom(headers, env) {
  const seat = String(headers["x-hive-seat"] || "").trim();
  if (!seat) return { error: "sem assento: a rota do peer precisa do cabecalho X-Hive-Seat" };
  const home = String(headers["x-hive-state-dir"] || env.HIVE_STATE_DIR || "").trim();
  if (!home) return { error: "sem estado do hive: mande X-Hive-State-Dir ou suba o gateway com HIVE_STATE_DIR" };
  return { env: { ...env, HIVE_SEAT: seat, HIVE_SIDE: String(headers["x-hive-side"] || "local").trim(), HIVE_STATE_DIR: home } };
}

export function buildPeerFacade(seatEnv) {
  const calls = peerCalls(seatEnv);
  const server = new Server({ name: "hive", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolsFor(ceilingOf(seatEnv)) }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const call = calls[request.params.name];
    if (!call) throw new Error(`unknown tool ${request.params.name}`);
    return call(request.params.arguments || {});
  });
  return server;
}

export function createGateway(options = {}) {
  const hub = options.hub || hubOf();
  const envFile = options.envFile || join(hub, ".env");
  const baseEnv = { ...process.env, ...(options.env || {}) };
  let envStamp = "";
  let env = baseEnv;

  function envFileStamp() {
    try {
      const info = statSync(envFile);
      return `${info.mtimeMs}:${info.size}`;
    } catch {
      return "";
    }
  }

  function refreshEnv() {
    const stamp = envFileStamp();
    if (stamp === envStamp) return false;
    envStamp = stamp;
    env = loadDotEnv(envFile, { ...baseEnv }, { override: true });
    return true;
  }

  refreshEnv();
  const serversFile = options.serversFile || env.HIVE_MCP_SERVERS_FILE || join(hub, ".mcp-servers", "servers.json");
  let definitions = options.definitions || JSON.parse(readFileSync(serversFile, "utf8")).servers;
  const injected = Boolean(options.definitions);

  function reloadDefinitions() {
    if (injected) return { novos: [], removidos: [], mudados: [] };
    let fresh;
    try {
      fresh = JSON.parse(readFileSync(serversFile, "utf8")).servers || {};
    } catch {
      return { novos: [], removidos: [], mudados: [] };
    }
    const before = definitions;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const novos = Object.keys(fresh).filter((name) => !(name in before));
    const removidos = Object.keys(before).filter((name) => !(name in fresh));
    const mudados = Object.keys(fresh).filter((name) => name in before && !same(before[name], fresh[name]));
    definitions = fresh;
    for (const name of [...removidos, ...mudados]) manifests.delete(name);
    return { novos, removidos, mudados };
  }
  const manifestDir = options.manifestDir || join(hub, ".mcp-servers", ".manifest");
  const token = options.token || resolveToken({ env, tokenFile: join(hub, ".mcp-servers", ".token") });
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const log = options.log || ((...a) => console.error("[mcp-gateway]", ...a));

  const manifestFile = options.manifestFile || join(hub, "hive.json");
  const upstreams = new Map();
  const manifests = new Map();
  const starting = new Map();

  function manifestPath(name) {
    return join(manifestDir, `${name}.${manifestKey(definitions[name], hub)}.json`);
  }

  function readManifest(name) {
    if (manifests.has(name)) return manifests.get(name);
    const path = manifestPath(name);
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      manifests.set(name, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  function writeManifest(name, manifest) {
    manifests.set(name, manifest);
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(manifestPath(name), JSON.stringify(manifest, null, 2) + "\n");
  }

  function transportFor(definition) {
    if (definition.url) {
      return new StreamableHTTPClientTransport(new URL(definition.url), {
        requestInit: { headers: expandEnv(definition.headers, env) },
      });
    }
    return new StdioClientTransport({
      command: definition.command,
      args: definition.args || [],
      env: { ...env, ...expandEnv(definition.env, env) },
      cwd: hub,
      stderr: "ignore",
    });
  }

  function missingByServer() {
    refreshEnv();
    const out = {};
    for (const [nome, definition] of Object.entries(definitions)) {
      const keys = missingEnvKeys(definition, env);
      if (keys.length) out[nome] = keys;
    }
    return out;
  }

  async function connectUpstream(name) {
    refreshEnv();
    const definition = definitions[name];
    const faltando = missingEnvKeys(definition, env);
    if (faltando.length) {
      const aviso = `${name} sem credencial: defina ${faltando.join(", ")} em ${envFile}`;
      if (definition.url) throw new Error(aviso);
      log(aviso);
    }
    const client = new Client({ name: "hive-gateway", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transportFor(definition));
    return client;
  }

  async function ensureUpstream(name) {
    const live = upstreams.get(name);
    if (live) {
      live.lastUsed = Date.now();
      return live.client;
    }
    if (starting.has(name)) return starting.get(name);
    const attempt = (async () => {
      const client = await connectUpstream(name);
      upstreams.set(name, { client, lastUsed: Date.now() });
      log(`subiu ${name}`);
      scheduleReap();
      return client;
    })();
    starting.set(name, attempt);
    try {
      return await attempt;
    } finally {
      starting.delete(name);
    }
  }

  async function harvest(name) {
    const cached = readManifest(name);
    if (cached) return cached;
    const client = await ensureUpstream(name);
    const capabilities = client.getServerCapabilities() || {};
    const manifest = {
      serverInfo: client.getServerVersion() || { name, version: "0.0.0" },
      capabilities,
      tools: capabilities.tools ? (await client.listTools()).tools : [],
      prompts: capabilities.prompts ? (await client.listPrompts()).prompts : [],
      resources: capabilities.resources ? (await client.listResources()).resources : [],
    };
    writeManifest(name, manifest);
    log(`catalogou ${name}: ${manifest.tools.length} ferramentas`);
    return manifest;
  }

  async function closeUpstream(name) {
    const live = upstreams.get(name);
    if (!live) return;
    upstreams.delete(name);
    try {
      await live.client.close();
    } catch {}
    log(`dormiu ${name}`);
  }

  let reapTimer = null;

  async function reap(now = Date.now()) {
    for (const [name, live] of [...upstreams]) {
      if (now - live.lastUsed >= idleMs) await closeUpstream(name);
    }
  }

  function scheduleReap() {
    if (reapTimer || !upstreams.size) return;
    reapTimer = setTimeout(async () => {
      reapTimer = null;
      await reap().catch(() => {});
      scheduleReap();
    }, Math.max(1000, Math.min(idleMs, REAP_EVERY_MS)));
    reapTimer.unref?.();
  }

  function buildFacade(name, manifest) {
    const declared = {};
    if (manifest.capabilities.tools || manifest.tools.length) declared.tools = {};
    if (manifest.capabilities.prompts) declared.prompts = {};
    if (manifest.capabilities.resources) declared.resources = {};
    const server = new Server(
      { name: `${manifest.serverInfo.name} (hub)`, version: manifest.serverInfo.version },
      { capabilities: declared },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: manifest.tools }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const client = await ensureUpstream(name);
      return client.callTool(request.params);
    });
    if (declared.prompts) {
      server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: manifest.prompts }));
      server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const client = await ensureUpstream(name);
        return client.getPrompt(request.params);
      });
    }
    if (declared.resources) {
      server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: manifest.resources }));
      server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const client = await ensureUpstream(name);
        return client.readResource(request.params);
      });
    }
    return server;
  }

  const buildHubFacade = hubFacade({ manifestFile, names: () => Object.keys(definitions), readManifest, missingByServer, harvest, ensureUpstream });

  function reply(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (!chunks.length) return undefined;
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  const http = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/health") {
      return reply(res, 200, {
        ok: true,
        configurados: Object.keys(definitions).length,
        acordados: [...upstreams.keys()],
        catalogados: Object.keys(definitions).filter((n) => Boolean(readManifest(n))).length,
        hub: `/mcp/${HUB_SERVER}`,
        peer: `/mcp/${PEER_SERVER}`,
        pid: process.pid,
        script: SELF,
        scriptMtimeMs: SELF_MTIME_MS,
        envFile,
        faltando: missingByServer(),
      });
    }
    const denied = authorize(req, token);
    if (denied) return reply(res, 401, { error: denied });
    if (url.pathname === "/reload") {
      const trocou = refreshEnv();
      const servidores = reloadDefinitions();
      const dormem = trocou ? [...upstreams.keys()] : [...servidores.removidos, ...servidores.mudados].filter((name) => upstreams.has(name));
      await Promise.all(dormem.map(closeUpstream));
      return reply(res, 200, { ok: true, recarregado: trocou, servidores, envFile, faltando: missingByServer() });
    }
    const match = /^\/mcp\/([A-Za-z0-9_.-]+)$/.exec(url.pathname);
    if (!match) return reply(res, 404, { error: "rota desconhecida" });
    const name = match[1];
    const viaHub = name === HUB_SERVER;
    const viaPeer = name === PEER_SERVER;
    if (!viaHub && !viaPeer && !definitions[name]) return reply(res, 404, { error: `servidor ${name} nao existe` });
    const seat = viaPeer ? seatEnvFrom(req.headers, env) : null;
    if (seat?.error) return reply(res, 400, { error: seat.error });
    try {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const facade = viaHub ? buildHubFacade() : viaPeer ? buildPeerFacade(seat.env) : buildFacade(name, await harvest(name));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close().catch(() => {});
        facade.close().catch(() => {});
      });
      await facade.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      log(`falhou ${name}: ${error?.message || error}`);
      if (!res.headersSent) reply(res, 500, { error: String(error?.message || error) });
    }
  });

  return {
    token,
    get names() {
      return Object.keys(definitions);
    },
    upstreams,
    envFile,
    currentEnv: () => env,
    missingByServer,
    async reloadEnv() {
      const trocou = refreshEnv();
      if (trocou) await Promise.all([...upstreams.keys()].map(closeUpstream));
      return trocou;
    },
    async reloadDefinitions() {
      const servidores = reloadDefinitions();
      await Promise.all([...servidores.removidos, ...servidores.mudados].filter((name) => upstreams.has(name)).map(closeUpstream));
      return servidores;
    },
    harvest,
    reap,
    ensureUpstream,
    closeUpstream,
    reapArmed: () => reapTimer !== null,
    async warmMissing() {
      const faltando = Object.keys(definitions).filter((nome) => !readManifest(nome));
      for (const nome of faltando) {
        try {
          await harvest(nome);
        } catch (erro) {
          log(`nao catalogou ${nome}: ${erro?.message || erro}`);
        }
        await closeUpstream(nome);
      }
      return { catalogados: faltando.length };
    },
    async listen(port = DEFAULT_PORT, host = "127.0.0.1") {
      await new Promise((done, fail) => {
        http.once("error", fail);
        http.listen(port, host, () => {
          http.removeListener("error", fail);
          done();
        });
      });
      return http.address();
    },
    async close() {
      if (reapTimer) clearTimeout(reapTimer);
      reapTimer = null;
      await Promise.all([...upstreams.keys()].map(closeUpstream));
      await new Promise((done) => http.close(done));
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.HIVE_MCP_GATEWAY_PORT || DEFAULT_PORT);
  const gateway = createGateway();
  const address = await gateway.listen(port);
  console.error(`[mcp-gateway] 127.0.0.1:${address.port} · ${gateway.names.length} servidores sob demanda · hub ${hubOf()}`);
  gateway
    .warmMissing()
    .then(({ catalogados }) => catalogados && console.error(`[mcp-gateway] catalogo completado em segundo plano: ${catalogados}`))
    .catch(() => {});
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      gateway.close().finally(() => process.exit(0));
    });
  }
}
