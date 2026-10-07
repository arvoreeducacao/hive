import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const WORKSPACE_DEFAULT = "/workspace";

export function workspaceRoot(env = process.env) {
  return env.HIVE_WORKSPACE || WORKSPACE_DEFAULT;
}

export function hiveRoot(env = process.env) {
  return join(workspaceRoot(env), "hive");
}

export function stateDir(env = process.env) {
  const mounted = hiveRoot(env);
  return env.HIVE_STATE_DIR || env.HIVE_HOME || (existsSync(mounted) ? mounted : join(homedir(), ".hive"));
}

export const LEGACY_BROKER_HOME = ".hive-broker";

export function brokerHome(env = process.env) {
  if (env.HIVE_BROKER_HOME) return env.HIVE_BROKER_HOME;
  const legacy = join(homedir(), LEGACY_BROKER_HOME);
  if (existsSync(join(legacy, "identity.json"))) return legacy;
  return join(stateDir(env), "server");
}

export function allowedSigners(env = process.env) {
  return env.HIVE_ALLOWED_SIGNERS || join(stateDir(env), "allowed_signers");
}

export function hubDir(env = process.env) {
  return env.HIVE_HUB || env.HIVE_MCP_HUB || join(workspaceRoot(env), "repos");
}

export function sideOf(base, env = process.env) {
  return base === hiveRoot(env) ? "cloud" : "local";
}

export function tmuxSession(side) {
  return side === "cloud" ? "hive" : "hive-local";
}

/* a seat's control socket: on win32 there is no filesystem unix-socket support,
   listen() on a plain path fails with EACCES — a named pipe carries no such
   ceiling and both the driver and anything dialing it must agree on the name */
export function seatSockPath(base, name, platform = process.platform) {
  if (platform === "win32") {
    const mark = createHash("sha256").update(join(base, name)).digest("hex").slice(0, 12);
    return `\\\\.\\pipe\\hive-seat-${mark}`;
  }
  return join(base, "sock", `${name}.sock`);
}

export function isSeatNamedPipe(path) {
  return String(path).startsWith("\\\\.\\pipe\\");
}
