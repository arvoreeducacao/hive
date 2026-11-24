import { exec, leftoversOf, readTable } from "../../server/engine/leftovers.mjs";

const QUIET_COMMANDS = /^(rapportd|ControlCe|AirPlayXP|sharingd|identitys|remoted|launchd|mDNSRespo|Spotify|Dropbox|OneDrive|Google|Electron|Hive|Slack|Discord|zoom\.us|Docker|com\.docke|postgres|mysqld|redis-ser|mongod)/i;
const PROBE_MS = 600;
const MACHINE_CAP = 6;
const OWN_TITLE = /^hive$/i;

function portOf(name) {
  const found = /:(\d+)$/.exec(String(name || "").replace(/->.*$/, ""));
  const port = found ? Number(found[1]) : 0;
  return port > 0 && port < 65536 ? port : 0;
}

function hostOf(name) {
  const raw = String(name || "").replace(/->.*$/, "");
  const at = raw.lastIndexOf(":");
  return at < 0 ? "" : raw.slice(0, at);
}

const LOCAL_HOSTS = new Set(["*", "127.0.0.1", "[::1]", "localhost", "0.0.0.0", "[::]"]);

const reachable = (host) => LOCAL_HOSTS.has(host);

export function parseListeners(text) {
  const seen = new Set();
  const out = [];
  let pid = 0;
  let command = "";
  for (const line of String(text || "").split("\n")) {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === "p") { pid = Number(value) || 0; command = ""; }
    else if (tag === "c") command = value;
    else if (tag === "n") {
      const port = portOf(value);
      const host = hostOf(value);
      if (!pid || !port || !reachable(host) || seen.has(`${pid}:${port}`)) continue;
      seen.add(`${pid}:${port}`);
      out.push({ pid, command, port });
    }
  }
  return out.sort((a, b) => a.port - b.port || a.pid - b.pid);
}

async function listeners(run, pids) {
  const args = ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-Fpcn"];
  if (pids?.length) args.push("-p", pids.join(","));
  const said = await run("lsof", args);
  return parseListeners(said.out);
}

export async function seatServers(seat, { hive = "", self = process.pid, platform = process.platform, run = exec, table = readTable } = {}) {
  if (!seat || platform === "win32") return [];
  const rows = leftoversOf(seat, await table({ platform, run }), { self, hive }).filter((row) => !row.machinery);
  if (!rows.length) return [];
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  return (await listeners(run, [...byPid.keys()]))
    .filter((one) => byPid.has(one.pid))
    .map((one) => ({ pid: one.pid, port: one.port, command: byPid.get(one.pid).command || one.command, url: `http://localhost:${one.port}` }));
}

export async function stopSeatServer(seat, pid, { kill = process.kill, ...options } = {}) {
  const wanted = Number(pid);
  const servers = await seatServers(seat, options);
  if (!servers.some((one) => one.pid === wanted)) return { error: "that server is not one this chat started" };
  try { kill(wanted, "SIGTERM"); } catch (wrong) { return { error: String(wrong?.message || wrong) }; }
  return { ok: true };
}

async function answersHttp(port, fetchImpl) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), PROBE_MS);
  try {
    const answer = await fetchImpl(`http://127.0.0.1:${port}/`, { method: "GET", redirect: "manual", signal: stop.signal });
    const type = String(answer.headers.get("content-type") || "");
    const body = type.includes("html") ? await answer.text() : "";
    const title = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(body)?.[1]?.trim() || "";
    return { ok: true, title };
  } catch { return { ok: false, title: "" }; }
  finally { clearTimeout(timer); }
}

export async function machineServers({ platform = process.platform, run = exec, fetchImpl = fetch, skipPorts = [] } = {}) {
  if (platform === "win32") return [];
  const skip = new Set(skipPorts.map(Number));
  const found = (await listeners(run)).filter((one) => one.port >= 1024 && !skip.has(one.port) && !QUIET_COMMANDS.test(one.command));
  const unique = [...new Map(found.map((one) => [one.port, one])).values()].slice(0, MACHINE_CAP * 2);
  const probed = await Promise.all(unique.map(async (one) => ({ ...one, probe: await answersHttp(one.port, fetchImpl) })));
  return probed.filter((one) => one.probe.ok && !OWN_TITLE.test(one.probe.title)).slice(0, MACHINE_CAP).map((one) => ({ pid: one.pid, port: one.port, command: one.command, title: one.probe.title, url: `http://localhost:${one.port}` }));
}

