import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { accessSync, constants as fsConstants, chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";

const PACKAGE = "@anthropic-ai/claude-agent-sdk";
const APPIMAGE_MOUNT = /^\/tmp\/\.mount_[^/]+(\/|$)/;
const STAGING = ".staging-";

export const STAGING_GRACE_MS = 3600000;

export function prefersMusl(platform = process.platform, report = process.report) {
  if (platform !== "linux") return false;
  const header = typeof report?.getReport === "function" ? report.getReport()?.header : null;
  return !!header && header.glibcVersionRuntime === undefined;
}

export function nativeBinaryNames({ platform = process.platform, arch = process.arch, musl } = {}) {
  const wanted = musl === undefined ? prefersMusl(platform) : musl;
  const suffix = platform === "win32" ? ".exe" : "";
  const folders = platform === "android"
    ? [`${PACKAGE}-linux-${arch}-android`]
    : platform === "linux"
      ? (wanted ? [`${PACKAGE}-linux-${arch}-musl`, `${PACKAGE}-linux-${arch}`] : [`${PACKAGE}-linux-${arch}`, `${PACKAGE}-linux-${arch}-musl`])
      : [`${PACKAGE}-${platform}-${arch}`];
  return folders.map((folder) => `${folder}/claude${suffix}`);
}

export function builtinClaudePath({ resolve = createRequire(import.meta.url).resolve, names = nativeBinaryNames(), exists = existsSync } = {}) {
  for (const name of names) {
    try {
      const found = resolve(name);
      if (exists(found)) return found;
    } catch {}
  }
  return "";
}

export function unmountable(path, env = process.env) {
  const where = String(path || "");
  if (!where) return false;
  if (APPIMAGE_MOUNT.test(where)) return true;
  const appdir = String(env.APPDIR || "");
  return !!appdir && where.startsWith(`${appdir}/`);
}

export function cacheRootOf(env = process.env, home = homedir()) {
  if (env.HIVE_CLAUDE_CACHE) return env.HIVE_CLAUDE_CACHE;
  return join(env.XDG_CACHE_HOME || join(home, ".cache"), "hive", "claude");
}

export function copyKeyOf(source, size, version) {
  const folder = basename(dirname(source));
  return `${folder}-${version || "unversioned"}-${size}`;
}

export function versionBeside(source, read = readFileSync) {
  try {
    return String(JSON.parse(read(join(dirname(source), "package.json"), "utf8")).version || "");
  } catch {
    return "";
  }
}

export function keyOfHeldPath(root, path) {
  const prefix = `${root}/`;
  if (!String(path).startsWith(prefix)) return "";
  return String(path).slice(prefix.length).split("/")[0];
}

export function heldKeys(root, { procRoot = "/proc", entries = readdirSync, link = readlinkSync } = {}) {
  const held = new Set();
  let listed = [];
  try { listed = entries(procRoot); } catch { return held; }
  for (const entry of listed) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const key = keyOfHeldPath(root, link(join(procRoot, entry, "exe")));
      if (key) held.add(key);
    } catch {}
  }
  return held;
}

export function unusedCopies(entries, keep, held, now = Date.now()) {
  return entries
    .filter((entry) => entry.name !== keep)
    .filter((entry) => !held.has(entry.name))
    .filter((entry) => !entry.name.startsWith(STAGING) || now - entry.mtimeMs > STAGING_GRACE_MS)
    .map((entry) => entry.name);
}

let staged = 0;

function copyBeside(source, root, size, version) {
  const key = copyKeyOf(source, size, version);
  const home = join(root, key);
  const copy = join(home, "claude");
  if (existsSync(copy) && statSync(copy).size === size) return copy;
  rmSync(home, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  staged += 1;
  const staging = join(root, `${STAGING}${process.pid}-${staged}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    copyFileSync(source, join(staging, "claude"));
    chmodSync(join(staging, "claude"), 0o755);
    renameSync(staging, home);
  } catch (raced) {
    rmSync(staging, { recursive: true, force: true });
    if (!(existsSync(copy) && statSync(copy).size === size)) throw raced;
  }
  return copy;
}

export function stableClaudePath({ env = process.env, builtin = builtinClaudePath(), root = cacheRootOf(env) } = {}) {
  if (!builtin || !unmountable(builtin, env)) return builtin;
  try {
    return copyBeside(builtin, root, statSync(builtin).size, versionBeside(builtin));
  } catch {
    return builtin;
  }
}

export function forgetUnusedCopies({ env = process.env, root = cacheRootOf(env), keep = "", now = Date.now() } = {}) {
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, mtimeMs: statSync(join(root, entry.name)).mtimeMs }));
  } catch {
    return [];
  }
  const forgotten = [];
  for (const name of unusedCopies(entries, keep, heldKeys(root), now)) {
    try {
      rmSync(join(root, name), { recursive: true, force: true });
      forgotten.push(name);
    } catch {}
  }
  return forgotten;
}

export function warmClaudeBinary({ env = process.env } = {}) {
  const builtin = builtinClaudePath();
  if (!builtin || !unmountable(builtin, env)) return { path: builtin, copied: false, forgotten: [] };
  const root = cacheRootOf(env);
  const path = stableClaudePath({ env, builtin, root });
  const copied = path !== builtin;
  return { path, copied, forgotten: copied ? forgetUnusedCopies({ env, root, keep: basename(dirname(path)) }) : [] };
}

export function compareVersions(a, b) {
  const partsOf = (v) => String(v || "").replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [partsOf(a), partsOf(b)];
  for (let at = 0; at < 3; at += 1) {
    if ((x[at] || 0) !== (y[at] || 0)) return (x[at] || 0) < (y[at] || 0) ? -1 : 1;
  }
  return 0;
}

export function bundledClaudeVersion(builtin, read = readFileSync) {
  if (!builtin) return "";
  try {
    const sdk = JSON.parse(read(join(dirname(dirname(builtin)), "claude-agent-sdk", "package.json"), "utf8"));
    return String(sdk.claudeCodeVersion || "");
  } catch {
    return "";
  }
}

function runnable(path) {
  try {
    accessSync(path, fsConstants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function claudeOnPath({ env = process.env, platform = process.platform, home = homedir(), can = runnable } = {}) {
  const name = platform === "win32" ? "claude.exe" : "claude";
  const listed = String(env.PATH || env.Path || "").split(delimiter).filter(Boolean);
  const places = [...listed, join(home, ".local", "bin")];
  for (const place of places) {
    if (place.includes("node_modules")) continue;
    const found = join(place, name);
    if (can(found)) return found;
  }
  return "";
}

export function claudeVersionOf(path, run = spawnSync) {
  if (!path) return "";
  try {
    const said = run(path, ["--version"], { encoding: "utf8", timeout: 5000 });
    return /(\d+\.\d+\.\d+)/.exec(`${said.stdout || ""}`)?.[1] || "";
  } catch {
    return "";
  }
}

export function pickClaude({ bundled, bundledVersion, machine, machineVersion, prefer = "" }) {
  const own = { path: bundled, from: "bundled", version: bundledVersion };
  if (prefer === "bundled" && bundled) return own;
  if (!machine || !machineVersion) return bundled ? own : { path: machine, from: "machine", version: machineVersion };
  if (!bundled || !bundledVersion || compareVersions(machineVersion, bundledVersion) >= 0) return { path: machine, from: "machine", version: machineVersion };
  return own;
}

export function chosenClaude({ env = process.env, builtin = builtinClaudePath(), machine = claudeOnPath({ env }), versionOf = claudeVersionOf } = {}) {
  return pickClaude({
    bundled: builtin ? stableClaudePath({ env, builtin }) : "",
    bundledVersion: bundledClaudeVersion(builtin),
    machine,
    machineVersion: versionOf(machine),
    prefer: env.HIVE_CLAUDE === "bundled" ? "bundled" : "",
  });
}
