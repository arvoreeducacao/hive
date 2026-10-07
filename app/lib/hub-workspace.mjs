import { applies, repoName } from "../manifest/resolve.mjs";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const REPO_ENTRY = /^[\w.-]+\/[\w.-]+$/;
const TOP_KEYS = new Set(["$schema", "repos", "skills", "mcps", "env", "integrations"]);

export const MANIFEST_FILE = "hive.json";
export const DEFAULT_GATEWAY_PORT = 4671;
export const HUB_SERVER = "hub";

export function isSafeRepoName(name) {
  return SAFE_NAME.test(String(name || ""));
}

function targetIssue(target) {
  if (typeof target === "string") return target ? null : "a repository name cannot be empty";
  if (!target || typeof target !== "object" || Array.isArray(target)) return "a target is a repository name or {repo, path}";
  const keys = Object.keys(target).sort().join(",");
  if (keys !== "path,repo") return "a target with a path has exactly repo and path";
  if (typeof target.repo !== "string" || !target.repo) return "repo must be a repository name";
  if (typeof target.path !== "string" || !target.path) return "path must be a glob inside the repository";
  return null;
}

function scopeIssue(scope) {
  if (scope === "*") return null;
  if (Array.isArray(scope)) {
    if (!scope.length) return 'an empty list applies nowhere; use "*" or name the repositories';
    for (const target of scope) {
      const bad = targetIssue(target);
      if (bad) return bad;
    }
    return null;
  }
  return targetIssue(scope);
}

function targetNames(scope) {
  if (scope === "*" || scope === undefined || scope === null) return [];
  const list = Array.isArray(scope) ? scope : [scope];
  return list.map((target) => (typeof target === "string" ? target : target?.repo)).filter(Boolean);
}

function mapIssues(key, map, declared, issues) {
  if (map === undefined) return;
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    issues.push({ path: `/${key}`, message: "must map a name to the repositories it applies to" });
    return;
  }
  for (const [name, scope] of Object.entries(map)) {
    const bad = scopeIssue(scope);
    if (bad) {
      issues.push({ path: `/${key}/${name}`, message: bad });
      continue;
    }
    for (const repo of targetNames(scope)) {
      if (!declared.has(repo)) issues.push({ path: `/${key}/${name}`, message: `points at "${repo}", which is not in repos` });
    }
  }
}

export function readManifest(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ""));
  } catch (error) {
    return { state: "unreadable", said: `${MANIFEST_FILE} is not valid JSON: ${String(error?.message || error).split("\n")[0]}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { state: "unreadable", said: `${MANIFEST_FILE} must be an object` };
  }
  if (!Array.isArray(parsed.repos)) {
    return { state: "unreadable", said: `${MANIFEST_FILE}: "repos" must be an array of org/name` };
  }

  const issues = [];
  const seen = new Set();
  parsed.repos.forEach((entry, at) => {
    if (typeof entry !== "string" || !REPO_ENTRY.test(entry)) {
      issues.push({ path: `/repos/${at}`, message: "a repository is written as org/name" });
      return;
    }
    const name = repoName(entry);
    if (seen.has(name)) issues.push({ path: `/repos/${at}`, message: `"${name}" is declared twice` });
    seen.add(name);
  });
  mapIssues("skills", parsed.skills, seen, issues);
  mapIssues("mcps", parsed.mcps, seen, issues);
  for (const key of Object.keys(parsed)) {
    if (!TOP_KEYS.has(key)) issues.push({ path: `/${key}`, message: "not a key hive.json knows" });
  }

  return { state: "read", manifest: parsed, issues };
}

function skillsFor(manifest, repo) {
  return Object.entries(manifest?.skills ?? {})
    .filter(([, scope]) => scope !== "*" && applies(scope, repo))
    .map(([name]) => name)
    .sort();
}

export function reposOf(manifest, onDisk, stacks = {}) {
  const loose = new Map();
  for (const found of onDisk ?? []) {
    const name = String(found?.name || "");
    if (!name || loose.has(name)) continue;
    loose.set(name, found);
  }

  const repos = [];
  const declared = new Set();
  for (const entry of manifest?.repos ?? []) {
    if (typeof entry !== "string") continue;
    const name = repoName(entry);
    if (!name || declared.has(name)) continue;
    declared.add(name);
    const found = loose.get(name);
    if (found) loose.delete(name);
    repos.push({
      name,
      dir: name,
      entry,
      tech: techOf(stacks[name]),
      skills: skillsFor(manifest, name),
      declared: true,
      cloned: Boolean(found),
      ...(found && { branch: found.branch || "", loose: found.loose || 0, ahead: found.ahead || 0 }),
    });
  }

  for (const found of loose.values()) {
    if (!found.top) continue;
    repos.push({
      name: found.name,
      dir: found.name,
      entry: "",
      tech: techOf(stacks[found.name]),
      skills: [],
      declared: false,
      cloned: true,
      branch: found.branch || "",
      loose: found.loose || 0,
      ahead: found.ahead || 0,
    });
  }

  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

function techOf(stack) {
  return stack && stack !== "unknown" ? String(stack) : "";
}

function scopeOf(scope) {
  if (scope === undefined) return { scoped: false, repos: [] };
  const repos = targetNames(scope);
  return { scoped: scope !== "*" && repos.length > 0, repos };
}

export function skillsOf(manifest, onDisk = []) {
  const declared = manifest?.skills && typeof manifest.skills === "object" ? manifest.skills : {};
  const folders = new Set(onDisk);
  const names = new Set([...Object.keys(declared), ...folders]);
  return [...names]
    .sort()
    .map((name) => ({
      name,
      declared: name in declared,
      onDisk: folders.has(name),
      ...scopeOf(declared[name]),
    }));
}

export function mcpsOf(manifest, wired = {}, gateway = [], gatewayPort = DEFAULT_GATEWAY_PORT) {
  const declared = manifest?.mcps && typeof manifest.mcps === "object" ? manifest.mcps : {};
  const servers = wired && typeof wired === "object" ? wired : {};
  const own = `http://127.0.0.1:${gatewayPort}/`;
  const hosted = new Set(gateway);
  const viaHub = typeof servers[HUB_SERVER]?.url === "string" && servers[HUB_SERVER].url === `${own}mcp/${HUB_SERVER}`;
  const listed = Object.keys(servers).filter((name) => !(viaHub && name === HUB_SERVER));
  const names = new Set([...Object.keys(declared), ...listed, ...hosted]);
  return [...names]
    .sort()
    .map((name) => {
      const server = servers[name];
      const url = typeof server?.url === "string" ? server.url : "";
      return {
        name,
        declared: name in declared,
        wired: name in servers || (viaHub && hosted.has(name)),
        gateway: hosted.has(name),
        remote: Boolean(url) && !url.startsWith(own),
        ...scopeOf(declared[name]),
      };
    });
}

function tally(items, first, second) {
  return {
    [first]: items.filter((i) => i[first]).length,
    [second]: items.filter((i) => i[second]).length,
    [`only${cap(first)}`]: items.filter((i) => i[first] && !i[second]).length,
    [`only${cap(second)}`]: items.filter((i) => !i[first] && i[second]).length,
  };
}

const cap = (word) => word[0].toUpperCase() + word.slice(1);

export function workspaceOf(read, onDisk, extras = {}) {
  const { name = "", stacks = {}, mcpJson = null, gateway = [], skillDirs = [], gatewayPort = DEFAULT_GATEWAY_PORT } = extras;
  const diskOnly = reposOf(null, onDisk, stacks);

  if (!read || read.state === "none") {
    return { state: "none", repos: diskOnly, skills: [], mcps: [], issues: [] };
  }

  if (read.state !== "read" || !read.manifest) {
    return {
      state: "unreadable",
      path: read.path || MANIFEST_FILE,
      said: read.said || "",
      repos: diskOnly,
      skills: [],
      mcps: [],
      issues: [],
    };
  }

  const repos = reposOf(read.manifest, onDisk, stacks);
  const skills = skillsOf(read.manifest, skillDirs);
  const mcps = mcpsOf(read.manifest, mcpJson?.mcpServers, gateway, gatewayPort);
  return {
    state: "read",
    name,
    path: read.path || MANIFEST_FILE,
    repos,
    skills,
    mcps,
    issues: (read.issues ?? []).map((i) => ({ path: i.path, message: i.message })),
    counts: {
      declared: repos.filter((r) => r.declared).length,
      cloned: repos.filter((r) => r.cloned).length,
      missing: repos.filter((r) => r.declared && !r.cloned).length,
      undeclared: repos.filter((r) => !r.declared).length,
      skills: tally(skills, "declared", "onDisk"),
      mcps: { ...tally(mcps, "declared", "wired"), gateway: mcps.filter((m) => m.gateway).length },
    },
  };
}

const GITHUB_URL = /^(?:https?:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

export function repoEntryOf(typed) {
  const text = String(typed ?? "").trim();
  if (!text) return { error: "write the repository as org/name" };
  const fromUrl = text.match(GITHUB_URL);
  const [org, name] = fromUrl ? [fromUrl[1], fromUrl[2]] : text.split("/");
  if (!org || !name || text.split("/").length > 2 && !fromUrl) return { error: "write the repository as org/name" };
  if (!isSafeRepoName(org) || !isSafeRepoName(name) || name === ".git" || name.endsWith(".git")) return { error: "that repository name cannot be right" };
  return { entry: `${org}/${name}`, org, name };
}

function repoLineInserted(text, entry) {
  const lines = String(text ?? "").split("\n");
  const open = lines.findIndex((line) => /^\s*"repos"\s*:\s*\[/.test(line));
  if (open < 0) return null;
  if (/\[\s*\]\s*,?\s*$/.test(lines[open])) {
    lines[open] = lines[open].replace(/\[\s*\]/, `[\n    ${JSON.stringify(entry)}\n  ]`);
    return { text: lines.join("\n"), line: open + 2 };
  }
  const close = lines.findIndex((line, at) => at > open && /^\s*\]/.test(line));
  if (close < 0) return null;
  const items = [];
  for (let at = open + 1; at < close; at++) {
    const item = lines[at].match(/^(\s*)"([^"]+)"\s*,?\s*$/);
    if (!item) return null;
    items.push({ at, indent: item[1], entry: item[2] });
  }
  const indent = items[0]?.indent ?? "    ";
  const before = items.filter((item) => item.entry.localeCompare(entry) < 0).length;
  const last = before === items.length;
  if (last && items.length) {
    const tail = items[items.length - 1].at;
    lines[tail] = `${lines[tail].replace(/\s*$/, "")},`;
  }
  const atLine = last ? close : items[before].at;
  lines.splice(atLine, 0, `${indent}${JSON.stringify(entry)}${last ? "" : ","}`);
  return { text: lines.join("\n"), line: atLine + 1 };
}

export function manifestWithRepo(text, entry) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ""));
  } catch {
    return { error: `${MANIFEST_FILE} is not valid JSON` };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.repos)) return { error: `${MANIFEST_FILE} has no "repos" list to write into` };
  const name = repoName(entry);
  if (parsed.repos.some((item) => typeof item === "string" && repoName(item) === name)) return { error: `${name} is already in ${MANIFEST_FILE}`, present: true };
  const lineWise = repoLineInserted(text, entry);
  if (lineWise) return lineWise;
  const repos = [...parsed.repos, entry].sort((a, b) => String(a).localeCompare(String(b)));
  const out = `${JSON.stringify({ ...parsed, repos }, null, 2)}\n`;
  return { text: out, line: out.split("\n").findIndex((line) => line.includes(JSON.stringify(entry))) + 1 };
}

export const MANAGED_BEGIN = "<!-- >>> hive -->";
export const MANAGED_END = "<!-- <<< hive -->";
const REPOS_HEADING = /^##\s+Repositor/i;

export function managedBlockOf(text) {
  const lines = String(text ?? "").split("\n");
  const begin = lines.findIndex((line) => line.trim() === MANAGED_BEGIN);
  const end = begin < 0 ? -1 : lines.findIndex((line, at) => at > begin && line.trim() === MANAGED_END);
  return { lines, begin, end, found: begin >= 0 && end > begin };
}

export function repoLineOf(name, stack = "") {
  const tech = stack && stack !== "unknown" ? ` — ${stack}` : "";
  return `- **./${name}**${tech}`;
}

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function withRepoLine(text, name, stack = "", place = "") {
  const { lines, begin, end, found } = managedBlockOf(text);
  const line = repoLineOf(name, stack);
  const at = lines.findIndex((one) => new RegExp(`^- \\*\\*\\./${escapeRe(name)}\\*\\*`).test(one));
  if (at >= 0) {
    const bare = lines[at].trim() === repoLineOf(name);
    if (!found || at < begin || at > end || !bare || lines[at] === line) return { text: String(text ?? ""), state: "present", at };
    lines[at] = line;
    return { text: lines.join("\n"), state: "updated", at };
  }
  if (found) {
    lines.splice(end, 0, line);
    return { text: lines.join("\n"), state: "added", at: end };
  }
  if (place === "top") {
    const heading = lines.findIndex((one) => REPOS_HEADING.test(one));
    const start = heading >= 0 ? heading + 1 : 0;
    const blank = heading >= 0 && lines[start]?.trim() === "" ? 1 : 0;
    lines.splice(start + blank, 0, MANAGED_BEGIN, line, MANAGED_END, "");
    return { text: lines.join("\n"), state: "added", at: start + blank + 1 };
  }
  if (place === "end") {
    const tail = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    lines.splice(tail, 0, "", MANAGED_BEGIN, line, MANAGED_END);
    return { text: lines.join("\n"), state: "added", at: tail + 2 };
  }
  return { text: String(text ?? ""), state: "no-block", at: -1 };
}

function excerptOf(text, at, plus = true) {
  const lines = String(text ?? "").split("\n");
  const from = Math.max(0, at - 2);
  const to = Math.min(lines.length, at + 3);
  return lines.slice(from, to).map((line, offset) => `${from + offset === at && plus ? "+ " : "  "}${line}`).join("\n");
}

export const MANAGED_FILES = ["CLAUDE.md", "AGENTS.md"];

export function repoPlanOf({ entry, manifestText, files = {}, cloned = false, choices = {} }) {
  const name = repoName(entry);
  const writes = {};
  const plan = [];
  const manifest = manifestWithRepo(manifestText, entry);
  if (manifest.error && !manifest.present) return { error: manifest.error };
  if (manifest.present && cloned) return { error: `${name} is already in ${MANIFEST_FILE} and cloned in ./${name}` };
  if (manifest.present) plan.push({ file: MANIFEST_FILE, verdict: "same", say: "already there" });
  else {
    writes[MANIFEST_FILE] = manifest.text;
    plan.push({ file: MANIFEST_FILE, verdict: "changes", say: "+1 line", excerpt: excerptOf(manifest.text, manifest.line - 1) });
  }
  let asks = false;
  for (const file of MANAGED_FILES) {
    const text = files[file];
    if (text === null || text === undefined) {
      plan.push({ file, verdict: "missing", say: "not in the hub" });
      continue;
    }
    const place = choices[file] || "";
    const written = withRepoLine(text, name, "", place);
    if (written.state === "present") plan.push({ file, verdict: "same", say: "already there" });
    else if (written.state === "no-block") {
      asks = true;
      plan.push({ file, verdict: "no-block", say: place === "skip" ? "left without the block" : "the hive block is missing", asks: place !== "skip" });
    } else {
      writes[file] = written.text;
      plan.push({ file, verdict: "changes", say: place ? "+1 line, in a new hive block" : "+1 line in the hive block", excerpt: excerptOf(written.text, written.at) });
    }
  }
  plan.push(cloned ? { file: `${name}/`, verdict: "same", say: "already cloned" } : { file: `${name}/`, verdict: "new", say: "git clone" });
  return { entry, name, dir: name, clone: !cloned, asks: asks && plan.some((one) => one.asks), files: plan, writes };
}

const MCP_NAME = /^[a-z0-9][a-z0-9._-]{0,60}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{1,60}$/;
const GATEWAY_TOKEN_HEADER = "Bearer ${HIVE_MCP_GATEWAY_TOKEN}";

export function scopeOfTyped(typed, declared = []) {
  const names = String(typed ?? "").split(/[\s,]+/).map((one) => one.trim()).filter(Boolean);
  if (!names.length) return { scope: "*", repos: [] };
  const unknown = names.filter((name) => !declared.includes(name));
  if (unknown.length) return { error: `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in ${MANIFEST_FILE}` };
  return { scope: [...new Set(names)], repos: [...new Set(names)] };
}

export function envNamesOf(typed) {
  const names = String(typed ?? "").split(/[\s,]+/).map((one) => one.trim()).filter(Boolean);
  const bad = names.find((name) => !ENV_NAME.test(name));
  if (bad) return { error: `${bad} is not the name of a variable (UPPER_CASE)` };
  return { names: [...new Set(names)] };
}

export function envKeysOf(envText) {
  const keys = new Set();
  for (const line of String(envText ?? "").split("\n")) {
    const hit = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (hit && hit[2].trim().replace(/^["']|["']$/g, "").trim()) keys.add(hit[1]);
  }
  return keys;
}

export function mcpEntryOf(asked, { declared = [], gatewayPort = DEFAULT_GATEWAY_PORT } = {}) {
  const name = String(asked?.name ?? "").trim();
  if (name === HUB_SERVER) return { error: "the hub MCP name is reserved for the gateway" };
  if (!MCP_NAME.test(name)) return { error: "the name is lower-case letters, digits, dots and dashes" };
  const kind = asked?.kind === "stdio" ? "stdio" : "remote";
  const scoped = scopeOfTyped(asked?.scope, declared);
  if (scoped.error) return { error: scoped.error };
  const env = envNamesOf(asked?.env);
  if (env.error) return { error: env.error };
  if (kind === "remote") {
    const url = String(asked?.url ?? "").trim();
    if (!/^https?:\/\/\S+$/.test(url)) return { error: "a remote server needs an http(s) url" };
    const wired = { type: "http", url };
    if (env.names.length) wired.headers = { Authorization: `Bearer \${${env.names[0]}}` };
    return { name, kind, scope: scoped.scope, repos: scoped.repos, env: env.names, wired, hosted: null };
  }
  const words = String(asked?.command ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { error: "a stdio server needs the command that starts it" };
  const hosted = { command: words[0], args: words.slice(1) };
  if (env.names.length) hosted.env = Object.fromEntries(env.names.map((key) => [key, `\${${key}}`]));
  const wired = { type: "http", url: `http://127.0.0.1:${gatewayPort}/mcp/${HUB_SERVER}`, headers: { Authorization: GATEWAY_TOKEN_HEADER } };
  return { name, kind, scope: scoped.scope, repos: scoped.repos, env: env.names, wired, hosted };
}

function jsonWith(text, root, name, value, fallback) {
  let parsed;
  try {
    parsed = text === null || text === undefined ? fallback : JSON.parse(String(text));
  } catch {
    return { error: "not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object") return { error: "not an object" };
  const map = parsed[root] && typeof parsed[root] === "object" ? parsed[root] : {};
  if (name in map) return { present: true, text: String(text ?? "") };
  const next = { ...parsed, [root]: { ...map, [name]: value } };
  return { text: `${JSON.stringify(next, null, 2)}\n` };
}

export function mcpJsonWith(text, name, wired) {
  return jsonWith(text, "mcpServers", name, wired, { mcpServers: {} });
}

export function serversJsonWith(text, name, hosted) {
  return jsonWith(text, "servers", name, hosted, { servers: {} });
}

function mapCloseLine(lines, open) {
  let depth = 0;
  let quoted = false;
  for (let at = open; at < lines.length; at++) {
    const line = lines[at];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === "\\") i++;
        else if (ch === '"') quoted = false;
        continue;
      }
      if (ch === '"') quoted = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return at;
      }
    }
  }
  return -1;
}

export function manifestWithScope(text, root, name, scope) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ""));
  } catch {
    return { error: `${MANIFEST_FILE} is not valid JSON` };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.repos)) return { error: `${MANIFEST_FILE} has no repos` };
  if (parsed[root] && typeof parsed[root] === "object" && name in parsed[root]) return { present: true, text: String(text) };
  const value = Array.isArray(scope) ? `[${scope.map((one) => JSON.stringify(one)).join(", ")}]` : JSON.stringify(scope);
  const lines = String(text).split("\n");
  const open = lines.findIndex((line) => new RegExp(`^\\s*"${root}"\\s*:\\s*\\{`).test(line));
  const close = open >= 0 ? mapCloseLine(lines, open) : -1;
  if (close > open && /^\s*\}/.test(lines[close])) {
    const last = close - 1;
    const indent = (lines[last].match(/^(\s*)/) || ["", "    "])[1] || "    ";
    if (last > open) lines[last] = `${lines[last].replace(/\s*$/, "")}${/,\s*$/.test(lines[last]) ? "" : ","}`;
    lines.splice(close, 0, `${indent}"${name}": ${value}`);
    return { text: lines.join("\n"), line: close + 1 };
  }
  const next = { ...parsed, [root]: { ...(parsed[root] && typeof parsed[root] === "object" ? parsed[root] : {}), [name]: scope } };
  const out = `${JSON.stringify(next, null, 2)}\n`;
  return { text: out, line: out.split("\n").findIndex((line) => line.includes(`"${name}":`)) + 1 };
}

export function mcpPlanOf({ entry, manifestText, mcpJsonText, serversText, envText }) {
  const writes = {};
  const files = [];
  const scope = manifestWithScope(manifestText, "mcps", entry.name, entry.scope);
  if (scope.error) return { error: scope.error };
  const stdio = entry.kind === "stdio";
  const wiredAs = stdio ? HUB_SERVER : entry.name;
  const wired = mcpJsonWith(mcpJsonText, wiredAs, entry.wired);
  if (stdio && wired.present && JSON.parse(wired.text).mcpServers[HUB_SERVER]?.url !== entry.wired.url) return { error: "the hub MCP name is reserved for the gateway" };
  if (wired.error) return { error: `.mcp.json: ${wired.error}` };
  const hosted = stdio ? serversJsonWith(serversText, entry.name, entry.hosted) : null;
  if (hosted?.error) return { error: `servers.json: ${hosted.error}` };
  if (scope.present && wired.present && (!stdio || hosted.present)) return { error: `${entry.name} is already in ${MANIFEST_FILE} and in ${stdio ? "servers.json" : ".mcp.json"}` };
  if (scope.present) files.push({ file: MANIFEST_FILE, verdict: "same", say: "already there" });
  else {
    writes[MANIFEST_FILE] = scope.text;
    files.push({ file: MANIFEST_FILE, verdict: "changes", say: "+1 line", excerpt: excerptOf(scope.text, scope.line - 1) });
  }
  if (wired.present) files.push({ file: ".mcp.json", verdict: "same", say: stdio ? "served by the hub entry" : "already there" });
  else {
    writes[".mcp.json"] = wired.text;
    files.push({ file: ".mcp.json", verdict: "changes", say: stdio ? "+the hub entry; every command rides on it" : "+1 remote server", excerpt: excerptOf(wired.text, wired.text.split("\n").findIndex((line) => line.includes(`"${wiredAs}":`))) });
  }
  if (stdio) {
    if (hosted.present) files.push({ file: ".mcp-servers/servers.json", verdict: "same", say: "already there" });
    else {
      writes[".mcp-servers/servers.json"] = hosted.text;
      files.push({ file: ".mcp-servers/servers.json", verdict: "changes", say: "+1 command; the gateway reloads", excerpt: excerptOf(hosted.text, hosted.text.split("\n").findIndex((line) => line.includes(`"${entry.name}":`))) });
    }
  }
  const have = envKeysOf(envText);
  const missing = entry.env.filter((key) => !have.has(key));
  files.push(missing.length
    ? { file: ".env", verdict: "missing", say: `${missing.join(", ")} not set; the hive keeps no secret`, missing }
    : { file: ".env", verdict: "same", say: entry.env.length ? "every variable is set" : "nothing needed" });
  return { name: entry.name, kind: entry.kind, repos: entry.repos, missing, files, writes };
}

export function linePlanOf({ root, name, scope, manifestText }) {
  const written = manifestWithScope(manifestText, root, name, scope);
  if (written.error) return { error: written.error };
  if (written.present) return { error: `${name} is already in ${MANIFEST_FILE}` };
  return {
    name,
    files: [{ file: MANIFEST_FILE, verdict: "changes", say: "+1 line", excerpt: excerptOf(written.text, written.line - 1) }],
    writes: { [MANIFEST_FILE]: written.text },
  };
}

const FRONT_MATTER = /^---\s*\n([\s\S]*?)\n---/;

export function skillDescriptionOf(text) {
  const head = String(text ?? "").match(FRONT_MATTER)?.[1] || "";
  const line = head.split("\n").find((one) => /^description\s*:/.test(one));
  const said = line ? line.replace(/^description\s*:\s*/, "").trim().replace(/^["']|["']$/g, "") : "";
  if (said) return said;
  const body = String(text ?? "").replace(FRONT_MATTER, "").split("\n").map((one) => one.trim());
  return body.find((one) => one && !one.startsWith("#") && !one.startsWith("<!--")) || "";
}

export const SKILL_TO_WRITE = "descreva aqui quando esta skill vale";

export const SKILLS_BEGIN = "<!-- >>> hive:skills -->";
export const SKILLS_END = "<!-- <<< hive:skills -->";
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,60}$/;

export function skillEntryOf(asked, { declared = [] } = {}) {
  const name = String(asked?.name ?? "").trim();
  if (!SKILL_NAME.test(name)) return { error: "the name is lower-case letters, digits and dashes" };
  const description = String(asked?.description ?? "").trim().replace(/\s+/g, " ");
  if (!description) return { error: "say in one line when the skill applies" };
  const scoped = scopeOfTyped(asked?.scope, declared);
  if (scoped.error) return { error: scoped.error };
  return { name, description, scope: scoped.scope, repos: scoped.repos };
}

export function skillFileOf(entry) {
  return `---\nname: ${entry.name}\ndescription: ${entry.description}\n---\n\n# ${entry.name}\n\n${entry.description}\n\n## Quando usar\n\n## Como fazer\n`;
}

export function skillIndexLineOf(entry) {
  const where = entry.repos.length ? entry.repos.join(", ") : "todos os repositórios";
  return `- **${entry.name}** — ${entry.description} · vale em: ${where} · \`.claude/skills/${entry.name}/SKILL.md\``;
}

export function withSkillIndexLine(text, entry, place = "") {
  const lines = String(text ?? "").split("\n");
  const begin = lines.findIndex((line) => line.trim() === SKILLS_BEGIN);
  const end = begin < 0 ? -1 : lines.findIndex((line, at) => at > begin && line.trim() === SKILLS_END);
  const found = begin >= 0 && end > begin;
  const line = skillIndexLineOf(entry);
  const at = lines.findIndex((one) => new RegExp(`^- \\*\\*${escapeRe(entry.name)}\\*\\*`).test(one));
  if (at >= 0) return { text: String(text ?? ""), state: "present", at };
  if (found) {
    lines.splice(end, 0, line);
    return { text: lines.join("\n"), state: "added", at: end };
  }
  const block = ["## Skills", "", "Skill é uma pasta em `.claude/skills/<nome>` com um `SKILL.md`. Abra o arquivo quando a tarefa casar com a descrição.", "", SKILLS_BEGIN, line, SKILLS_END];
  if (place === "top") {
    const repos = managedBlockOf(text);
    const start = repos.found ? repos.end + 1 : 0;
    lines.splice(start, 0, "", ...block);
    return { text: lines.join("\n"), state: "added", at: start + block.length - 1 };
  }
  if (place === "end") {
    const tail = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    lines.splice(tail, 0, "", ...block);
    return { text: lines.join("\n"), state: "added", at: tail + block.length - 1 };
  }
  return { text: String(text ?? ""), state: "no-block", at: -1 };
}

export function skillPlanOf({ entry, manifestText, agentsText, exists = false, choices = {} }) {
  const writes = {};
  const files = [];
  const scope = manifestWithScope(manifestText, "skills", entry.name, entry.scope);
  if (scope.error) return { error: scope.error };
  if (scope.present && exists) return { error: `${entry.name} is already in ${MANIFEST_FILE} and has its folder` };
  if (scope.present) files.push({ file: MANIFEST_FILE, verdict: "same", say: "already there" });
  else {
    writes[MANIFEST_FILE] = scope.text;
    files.push({ file: MANIFEST_FILE, verdict: "changes", say: "+1 line", excerpt: excerptOf(scope.text, scope.line - 1) });
  }
  const folder = `.claude/skills/${entry.name}/SKILL.md`;
  if (exists) files.push({ file: folder, verdict: "same", say: "already there" });
  else {
    writes[folder] = skillFileOf(entry);
    files.push({ file: folder, verdict: "new", say: "a SKILL.md to write" });
  }
  let asks = false;
  if (agentsText === null || agentsText === undefined) files.push({ file: "AGENTS.md", verdict: "missing", say: "not in the hub" });
  else {
    const place = choices["AGENTS.md"] || "";
    const written = withSkillIndexLine(agentsText, entry, place);
    if (written.state === "present") files.push({ file: "AGENTS.md", verdict: "same", say: "already there" });
    else if (written.state === "no-block") {
      asks = place !== "skip";
      files.push({ file: "AGENTS.md", verdict: "no-block", say: place === "skip" ? "left without the block" : "the skills block is missing", asks });
    } else {
      writes["AGENTS.md"] = written.text;
      files.push({ file: "AGENTS.md", verdict: "changes", say: place ? "+1 line, in a new skills block" : "+1 line in the skills block", excerpt: excerptOf(written.text, written.at) });
    }
  }
  return { name: entry.name, repos: entry.repos, asks, files, writes };
}
