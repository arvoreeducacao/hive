import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gatewayPaths, PEER_SERVER } from "../gateway/mcp-gateway.mjs";

export const DIRENV_SUFFIX = "-direnv";

export function claudeConfigPath(configDir = "") {
  return join(configDir || homedir(), ".claude.json");
}

export function readClaudeConfig(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return {}; }
}

export function hubServers(hub) {
  try { return Object.keys(JSON.parse(readFileSync(gatewayPaths(hub).servers, "utf8")).servers || {}); } catch { return []; }
}

export function stdioServersFor(config, cwd) {
  const scopes = [config?.mcpServers, config?.projects?.[cwd]?.mcpServers];
  const out = {};
  for (const scope of scopes) {
    for (const [name, server] of Object.entries(scope || {})) {
      if (server && (!server.type || server.type === "stdio") && typeof server.command === "string") out[name] = server;
    }
  }
  return out;
}

export function gatewayNameFor(name, served) {
  if (served.includes(name)) return name;
  const bare = name.endsWith(DIRENV_SUFFIX) ? name.slice(0, -DIRENV_SUFFIX.length) : "";
  return bare && served.includes(bare) ? bare : "";
}

export function routedThroughGateway({ config, cwd, served, port, token }) {
  const routed = {};
  const kept = [];
  for (const name of Object.keys(stdioServersFor(config, cwd))) {
    const upstream = gatewayNameFor(name, served);
    if (!upstream) {
      kept.push(name);
      continue;
    }
    routed[name] = {
      type: "http",
      url: `http://127.0.0.1:${port}/mcp/${upstream}`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }
  return { routed, kept };
}

export function peerServerFor({ seat, side, home, entry, execPath = process.execPath, gateway = null }) {
  if (gateway?.ok && gateway.peer && gateway.token) {
    return {
      type: "http",
      url: `http://127.0.0.1:${gateway.port}/mcp/${PEER_SERVER}`,
      headers: { Authorization: `Bearer ${gateway.token}`, "X-Hive-Seat": seat, "X-Hive-Side": side, "X-Hive-State-Dir": home },
    };
  }
  return {
    type: "stdio",
    command: execPath,
    args: [entry],
    env: { HIVE_SEAT: seat, HIVE_SIDE: side, HIVE_STATE_DIR: home },
  };
}
