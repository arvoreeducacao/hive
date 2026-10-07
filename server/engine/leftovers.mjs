import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

export const SEAT_TAG = "HIVE_SEAT";
export const GRACE_MS = 3000;
const POLL_MS = 150;

const TAG = new RegExp(`(?:^|[\\s\\0])${SEAT_TAG}=([^\\s\\0]+)`);
const ENV_TOKEN = /^[A-Z_][A-Z0-9_]*=/;
const MACHINERY = /engine\/[a-z-]*driver\.mjs|claude-agent-sdk|\/claude(?:\.exe)?(?:\s|$)|codex-app-server|(?:^|\/)codex(?:\s|$)|kimi-acp|kiro-acp|opencode-server|mcp-server|\.mcp-servers\/|peer-module\.mjs|npm exec(?:\s|$)|(?:^|\/)npx(?:\s|$)|gateway\/gateway\.mjs|hive-shell/;

export function headOf(command) {
  const tokens = String(command || "").trim().split(/\s+/);
  const script = tokens.slice(1).find((token) => !token.startsWith("-")) || "";
  return script ? `${tokens[0]} ${script}` : tokens[0] || "";
}

export function tagOf(envText) {
  const found = TAG.exec(String(envText || ""));
  return found ? found[1] : "";
}

export function commandOf(commandAndEnv) {
  const tokens = String(commandAndEnv || "").trim().split(/\s+/);
  const cut = tokens.findIndex((token, i) => i > 0 && ENV_TOKEN.test(token));
  return (cut > 0 ? tokens.slice(0, cut) : tokens).join(" ");
}

export function parseRows(text, { withEnv = true } = {}) {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    const found = /^\s*(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!found) continue;
    const rest = found[4];
    rows.push({ pid: Number(found[1]), etime: found[2], cpu: found[3], command: withEnv ? commandOf(rest) : rest.trim(), seat: withEnv ? tagOf(rest) : "" });
  }
  return rows;
}

const PS_COLUMNS = ["pid=", "etime=", "time="];

function psArgs(platform, withEnv) {
  if (platform === "darwin") return [...(withEnv ? ["-Eww"] : ["-ww"]), "-axo", [...PS_COLUMNS, "command="].join(",")];
  return ["-ww", "-eo", [...PS_COLUMNS, "args="].join(",")];
}

function environOf(pid, procRoot) {
  try { return readFileSync(`${procRoot}/${pid}/environ`, "latin1"); } catch { return ""; }
}

export function exec(cmd, args, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 << 20 }, (err, out) => resolve({ ok: !err, out: String(out || "") }));
  });
}

export async function readTable({ platform = process.platform, run = exec, procRoot = "/proc", environ = environOf } = {}) {
  if (platform === "win32") return [];
  const darwin = platform === "darwin";
  const said = await run("ps", psArgs(platform, darwin));
  if (!said.ok && !said.out) return [];
  const rows = parseRows(said.out, { withEnv: darwin });
  if (darwin) return rows;
  for (const row of rows) row.seat = tagOf(environ(row.pid, procRoot));
  return rows;
}

export const isMachinery = (command) => MACHINERY.test(headOf(command));

export function leftoversOf(seat, rows, { self = process.pid } = {}) {
  if (!seat) return [];
  return rows
    .filter((row) => row.seat === seat && row.pid !== self)
    .map((row) => ({ ...row, machinery: isMachinery(row.command) }));
}

const DRIVER_NAME = /engine\/[a-z-]*driver\.mjs\b.*?--name\s+([A-Za-z0-9._-]+)/;

export function seatsWithADriver(rows) {
  const seats = new Set();
  for (const row of rows) {
    const found = DRIVER_NAME.exec(String(row.command || ""));
    if (found) seats.add(found[1]);
  }
  return seats;
}

export function strays(rows, liveSeats, { self = process.pid } = {}) {
  const live = new Set([...(liveSeats || []), ...seatsWithADriver(rows)]);
  return rows.filter((row) => row.seat && !live.has(row.seat) && row.pid !== self);
}

function stillThere(pid, kill) {
  try { kill(pid, 0); return true; } catch (wrong) { return wrong?.code === "EPERM"; }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function reap(pids, { kill = process.kill, grace = GRACE_MS, sleep = pause, now = Date.now } = {}) {
  const wanted = [...new Set(pids.map(Number).filter((pid) => Number.isInteger(pid) && pid > 1))];
  for (const pid of wanted) { try { kill(pid, "SIGTERM"); } catch {} }
  const started = now();
  let left = wanted.filter((pid) => stillThere(pid, kill));
  while (left.length && now() - started < grace) {
    await sleep(POLL_MS);
    left = left.filter((pid) => stillThere(pid, kill));
  }
  for (const pid of left) { try { kill(pid, "SIGKILL"); } catch {} }
  return { asked: wanted, forced: left };
}

export async function reapSeat(seat, options = {}) {
  const rows = leftoversOf(seat, await readTable(options), options);
  if (!rows.length) return { asked: [], forced: [], rows };
  const said = await reap(rows.map((row) => row.pid), options);
  return { ...said, rows };
}
