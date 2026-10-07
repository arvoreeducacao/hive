import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, openSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEAT_TAG } from "../engine/leftovers.mjs";

export const DEFAULT_PORT = 4671;
export const HUB_SERVER = "hub";
export const PEER_SERVER = "hive";
export const hubUrl = (port = DEFAULT_PORT) => `http://127.0.0.1:${port}/mcp/${HUB_SERVER}`;
export const peerUrl = (port = DEFAULT_PORT) => `http://127.0.0.1:${port}/mcp/${PEER_SERVER}`;
export function gatewayEntries({ servers = [], port, hub = true } = {}) {
  if (!port) return [];
  if (hub) return [{ name: HUB_SERVER, url: hubUrl(port) }];
  return servers.map((name) => ({ name, url: `http://127.0.0.1:${port}/mcp/${name}` }));
}

const WAIT_STEPS = 40;
const WAIT_EVERY_MS = 150;

const HERE = dirname(fileURLToPath(import.meta.url));

export const REPO = resolve(HERE, "..", "..");

export function hubOf(repoDir = REPO, env = process.env) {
  return env.HIVE_MCP_HUB || env.HIVE_HUB || resolve(repoDir, "..");
}

export function hubFor(cwd, env = process.env, there = existsSync, repoDir = REPO) {
  if (env.HIVE_MCP_HUB) return env.HIVE_MCP_HUB;
  if (env.HIVE_HUB) return env.HIVE_HUB;
  let dir = resolve(cwd || ".");
  while (true) {
    if (there(join(dir, ".mcp-servers", "servers.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) return hubOf(repoDir, env);
    dir = up;
  }
}

export function gatewayPaths(hub, gatewayDir = HERE) {
  return {
    script: join(gatewayDir, "gateway.mjs"),
    servers: join(hub, ".mcp-servers", "servers.json"),
    token: join(hub, ".mcp-servers", ".token"),
    modules: join(hub, ".mcp-servers", "node_modules"),
    log: join(hub, ".mcp-servers", "gateway.log"),
  };
}

export function staleGateway(health, script, statImpl = statSync) {
  if (health?.hub !== `/mcp/${HUB_SERVER}`) return "sem a rota hub";
  let current = null;
  try { current = statImpl(script).mtimeMs; } catch { return ""; }
  if (!health.script || !health.scriptMtimeMs) return "nao diz que gateway.mjs roda";
  if (health.script !== script) return `roda ${health.script}, o hive instalado e ${script}`;
  if (health.scriptMtimeMs !== current) return "roda um gateway.mjs anterior ao instalado";
  return "";
}

function pidOnPort(port) {
  try {
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const pid = Number(out.trim().split("\n")[0]);
    if (!Number.isFinite(pid) || pid <= 0) return 0;
    const args = execFileSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return /gateway\/gateway\.mjs/.test(args) ? pid : 0;
  } catch {
    return 0;
  }
}

async function healthy(port, fetchImpl) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1200) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true ? body : null;
  } catch {
    return false;
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureGateway({
  hub = hubOf(),
  port = Number(process.env.HIVE_MCP_GATEWAY_PORT || DEFAULT_PORT),
  env = process.env,
  fetchImpl = fetch,
  spawnImpl = spawn,
  killImpl = (pid) => process.kill(pid, "SIGTERM"),
  pidOfPortImpl = pidOnPort,
  statImpl = statSync,
  steps = WAIT_STEPS,
  everyMs = WAIT_EVERY_MS,
  driverDir = HERE,
} = {}) {
  const { script, servers, token: tokenFile, modules, log: logFile } = gatewayPaths(hub, driverDir);
  const readToken = () =>
    env.HIVE_MCP_GATEWAY_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");

  let current = await healthy(port, fetchImpl);
  let replaced = "";
  const stale = current ? staleGateway(current, script, statImpl) : "";
  if (current && stale && existsSync(script)) {
    const pid = Number(current.pid) || pidOfPortImpl(port);
    if (!pid) return { ok: false, adopted: true, port, reason: `gateway velho na ${port} (${stale}) e sem pid para derrubar — mate o processo que escuta a porta` };
    try { killImpl(pid); } catch {}
    for (let i = 0; i < steps && (await healthy(port, fetchImpl)); i++) await pause(everyMs);
    if (await healthy(port, fetchImpl)) return { ok: false, adopted: true, port, reason: `gateway velho na ${port} (${stale}) nao saiu depois do SIGTERM no pid ${pid}` };
    replaced = stale;
    current = null;
  }
  if (current) {
    const token = readToken();
    if (token) env.HIVE_MCP_GATEWAY_TOKEN = token;
    return token
      ? { ok: true, started: false, adopted: true, port, token, hub: current.hub === `/mcp/${HUB_SERVER}`, peer: current.peer === `/mcp/${PEER_SERVER}` }
      : { ok: false, adopted: true, port, reason: `gateway de pe na ${port}, mas a credencial nao esta em ${tokenFile} — aponte HIVE_HUB para o hub que subiu o gateway` };
  }

  if (!existsSync(servers)) return { ok: false, reason: "este hub nao declara ferramentas locais" };
  if (!existsSync(script)) return { ok: false, reason: "gateway ausente nesta instalacao do hive" };

  if (!existsSync(modules)) {
    return { ok: false, reason: "as ferramentas do hub nao foram instaladas: rode `npm install` em .mcp-servers/", port, missingInstall: true };
  }

  const log = openSync(logFile, "a");
  const { [SEAT_TAG]: _spawningSeat, ...sharedEnv } = env;
  const child = spawnImpl(process.execPath, [script], {
    cwd: hub,
    env: { ...sharedEnv, HIVE_MCP_GATEWAY_PORT: String(port), HIVE_HUB: hub, HIVE_MCP_HUB: hub },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref?.();

  for (let i = 0; i < steps; i++) {
    await pause(everyMs);
    const ready = await healthy(port, fetchImpl);
    if (ready) {
      const token = readToken();
      if (token) env.HIVE_MCP_GATEWAY_TOKEN = token;
      return { ok: true, started: true, port, token, hub: ready.hub === `/mcp/${HUB_SERVER}`, peer: ready.peer === `/mcp/${PEER_SERVER}`, replaced };
    }
  }
  return { ok: false, reason: replaced ? `o gateway velho saiu (${replaced}) mas o novo nao respondeu a tempo` : "o gateway nao respondeu a tempo", port, replaced };
}
