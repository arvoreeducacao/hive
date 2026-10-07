import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export const DEFAULT_ACCOUNT = "default";
export const DEFAULT_PROVIDER = "claude";
const ACCOUNT_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;
export const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
export const KEYCHAIN_SERVICE = "Claude Code-credentials";
const SECURITY = "/usr/bin/security";

export const keychainService = (configDir) =>
  configDir ? `${KEYCHAIN_SERVICE}-${createHash("sha256").update(configDir).digest("hex").slice(0, 8)}` : KEYCHAIN_SERVICE;

export async function accountsOnThisMachine(home, { list = readdir } = {}) {
  let named = [];
  try {
    named = (await list(join(home, "accounts"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && ACCOUNT_NAME.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {}
  return [DEFAULT_ACCOUNT, ...named];
}

export const accountConfigDir = (home, account) =>
  !account || account === DEFAULT_ACCOUNT ? "" : join(home, "accounts", account);

export const credentialsFile = (configDir, claudeHome) => join(configDir || claudeHome, ".credentials.json");

async function fromKeychain(service) {
  const { stdout } = await runFile(SECURITY, ["find-generic-password", "-s", service, "-w"], { timeout: 5000 });
  return stdout;
}

export async function readToken(configDir, { claudeHome = "", platform = process.platform, keychain = fromKeychain, readText = (path) => readFile(path, "utf8") } = {}) {
  const tries = platform === "darwin"
    ? [() => keychain(keychainService(configDir)), () => readText(credentialsFile(configDir, claudeHome))]
    : [() => readText(credentialsFile(configDir, claudeHome))];
  for (const get of tries) {
    try {
      const token = JSON.parse(await get())?.claudeAiOauth?.accessToken;
      if (token) return String(token);
    } catch {}
  }
  return "";
}

export function limitsFromUsage(said) {
  return (said?.limits || [])
    .filter((one) => one?.kind)
    .map((one) => ({
      kind: String(one.kind),
      model: String(one.scope?.model?.display_name || ""),
      percent: Math.round(Number(one.percent) || 0),
      severity: String(one.severity || "normal"),
      resets_at: String(one.resets_at || "")
    }));
}

export const REFUSED_WAIT = 15 * 60 * 1000;

const REFUSALS = new Set([429, 503, 529]);

export function waitUntil(said, now = Date.now()) {
  const header = String(said?.headers?.get?.("retry-after") || "").trim();
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000;
  const at = header ? Date.parse(header) : NaN;
  return Number.isNaN(at) ? now + REFUSED_WAIT : at;
}

export async function askUsage(token, { ask = fetch, url = USAGE_URL, timeoutMs = 10000, now = Date.now() } = {}) {
  const said = await ask(url, {
    headers: { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!said.ok) {
    const wrong = new Error(`the usage endpoint answered ${said.status}`);
    if (REFUSALS.has(said.status)) wrong.until = waitUntil(said, now);
    throw wrong;
  }
  return limitsFromUsage(await said.json());
}

export async function limitsPerAccount({ home = "", claudeHome = "", accounts = null, waiting = () => 0, ...how } = {}) {
  const held = accounts || await accountsOnThisMachine(home, how);
  return Promise.all(held.map(async (account) => {
    const token = await readToken(accountConfigDir(home, account), { claudeHome, ...how });
    if (!token) return { account, signedIn: false, limits: [], error: "not signed in" };
    const until = waiting(account);
    if (until) return { account, signedIn: true, limits: [], until, error: "" };
    try {
      return { account, signedIn: true, limits: await askUsage(token, how) };
    } catch (wrong) {
      return { account, signedIn: true, limits: [], until: wrong?.until || 0, error: String(wrong?.message || wrong).slice(0, 140) };
    }
  }));
}

export function createPlanMemory({ now = () => Date.now() } = {}) {
  const seen = new Map();
  const keyOf = (row) => `${row.provider || DEFAULT_PROVIDER}/${row.account}`;
  return {
    waiting(provider, account) {
      const until = seen.get(`${provider}/${account}`)?.until || 0;
      return until > now() ? until : 0;
    },
    remember(rows) {
      return rows.map((row) => {
        const key = keyOf(row);
        if (row.signedIn === false) {
          seen.delete(key);
          return row;
        }
        const held = seen.get(key) || {};
        if (row.limits.length) {
          seen.set(key, { limits: row.limits, at: now(), until: 0 });
          return row;
        }
        seen.set(key, { ...held, until: row.until || held.until || 0 });
        return held.limits?.length ? { ...row, limits: held.limits, stale: held.at } : row;
      });
    }
  };
}

export const FULL = 100;

const WINDOW_NAME = { session: "five-hour window", weekly_all: "week", monthly: "month" };

export function dryAccounts(rows, { now = Date.now() } = {}) {
  const dry = [];
  for (const row of rows || []) {
    const full = (row.limits || []).filter((one) => one.kind !== "weekly_scoped" && one.percent >= FULL);
    if (!full.length) continue;
    const backAt = full.map((one) => Date.parse(one.resets_at) || 0);
    const until = backAt.some((one) => !one) ? 0 : Math.max(...backAt);
    if (until && until <= now) continue;
    const which = full.map((one) => WINDOW_NAME[one.kind] || one.kind).join(" and its ");
    dry.push({ account: row.account, until, says: `the plan says this login is out of its ${which}` });
  }
  return dry;
}

export const limitOf = (row, kind) => (row?.limits || []).find((one) => one.kind === kind) || null;

export const roomLeft = (row) => 100 - Math.max(0, ...(row?.limits || []).filter((one) => one.kind !== "weekly_scoped").map((one) => one.percent));

export function tightestAccount(rows) {
  const signed = (rows || []).filter((row) => (row.limits || []).length);
  if (!signed.length) return null;
  return signed.slice().sort((a, b) => roomLeft(a) - roomLeft(b) || String(a.account).localeCompare(String(b.account)))[0];
}

/* codex says its windows through its own app-server: one percentage per window,
   the reset as epoch seconds. Shaped like the claude rows so the chip, the ledger
   and the providers screen read both the same way. */
export function codexLimitsFromRateLimits(said) {
  const held = said?.rateLimits || said || {};
  const rows = [];
  for (const [name, window] of [["primary", held.primary], ["secondary", held.secondary]]) {
    if (!window || !Number.isFinite(Number(window.usedPercent))) continue;
    const minutes = Number(window.windowDurationMins) || 0;
    const percent = Math.round(Number(window.usedPercent));
    rows.push({
      kind: minutes >= 7 * 24 * 60 ? "weekly_all" : "session",
      model: "",
      percent,
      severity: percent >= 100 ? "exceeded" : percent >= 80 ? "warning" : "normal",
      resets_at: window.resetsAt ? new Date(Number(window.resetsAt) * 1000).toISOString() : "",
      window: name,
    });
  }
  return rows;
}

export async function codexLimitsPerAccount({ accounts = [], rpc } = {}) {
  return Promise.all(accounts.map(async ({ name, env }) => {
    try {
      const said = await rpc("codex", ["app-server"], async (call) => {
        await call("initialize", { clientInfo: { name: "hive", title: "Hive", version: "1" }, capabilities: { experimentalApi: true } });
        return call("account/rateLimits/read", {});
      }, env);
      return { account: name, provider: "codex", signedIn: true, limits: codexLimitsFromRateLimits(said) };
    } catch (wrong) {
      return { account: name, provider: "codex", signedIn: true, limits: [], error: String(wrong?.message || wrong).slice(0, 140) };
    }
  }));
}

export const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";

export const KIMI_REGIONS = {
  "mainland-cn": { oauthHost: "https://auth.kimi.com", baseUrl: "https://api.kimi.com/coding/v1" },
  global: { oauthHost: "https://auth.kimi.ai", baseUrl: "https://api.kimi.ai/coding/v1" },
};

export const kimiHosts = (region) => KIMI_REGIONS[String(region || "").trim()] || KIMI_REGIONS["mainland-cn"];

export const kimiCredentialsFile = (root) => join(root, "credentials", "kimi-code.json");

const KIMI_REFRESH_AHEAD = 60;
const KIMI_LOCK_STALE = 20000;

const toInt = (value) => {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const KIMI_UNIT_MINUTES = { TIME_UNIT_MINUTE: 1, TIME_UNIT_HOUR: 60, TIME_UNIT_DAY: 24 * 60, TIME_UNIT_WEEK: 7 * 24 * 60 };

function kimiWindowMinutes(window) {
  const duration = toInt(window?.duration);
  const unit = KIMI_UNIT_MINUTES[window?.timeUnit];
  return duration && unit ? duration * unit : 0;
}

function kimiUsed(detail, limit) {
  const used = toInt(detail?.used);
  if (used !== null) return used;
  const remaining = toInt(detail?.remaining);
  return remaining !== null && limit !== null ? Math.max(0, limit - remaining) : null;
}

function kimiRow(detail, minutes, name) {
  const limit = toInt(detail?.limit);
  const used = kimiUsed(detail, limit);
  if (used === null && limit === null) return null;
  const percent = limit > 0 ? Math.min(100, Math.max(0, Math.ceil(((used || 0) / limit) * 100))) : 0;
  return {
    kind: minutes >= 7 * 24 * 60 ? "weekly_all" : "session",
    model: "",
    name: String(name || ""),
    percent,
    severity: percent >= 100 ? "exceeded" : percent >= 80 ? "warning" : "normal",
    resets_at: typeof detail?.resetTime === "string" ? detail.resetTime : "",
  };
}

export function kimiLimitsFromUsages(payload) {
  if (!payload || typeof payload !== "object") return [];
  const rows = [];
  for (const item of Array.isArray(payload.limits) ? payload.limits : []) {
    const row = item && typeof item === "object" ? kimiRow(item.detail, kimiWindowMinutes(item.window), item.name) : null;
    if (row) rows.push(row);
  }
  const summary = rows.some((one) => one.kind === "weekly_all") ? null : kimiRow(payload.usage, 7 * 24 * 60, payload.usage?.name);
  return summary ? [summary, ...rows] : rows;
}

export function kimiTokenFromWire(wire) {
  if (!wire || typeof wire !== "object") return null;
  const token = {
    access_token: String(wire.access_token || ""),
    refresh_token: String(wire.refresh_token || ""),
    expires_at: typeof wire.expires_at === "number" ? wire.expires_at : 0,
    scope: String(wire.scope || ""),
    token_type: String(wire.token_type || ""),
    expires_in: typeof wire.expires_in === "number" ? wire.expires_in : 0,
  };
  return token.access_token ? token : null;
}

export const kimiTokenIsFresh = (token, now = Date.now()) =>
  !!token?.access_token && (token.expires_at === 0 || token.expires_at - Math.floor(now / 1000) >= KIMI_REFRESH_AHEAD);

export function kimiTokenFromRefresh(said, now = Date.now()) {
  const expiresIn = Number(said?.expires_in);
  if (typeof said?.access_token !== "string" || !said.access_token || typeof said?.refresh_token !== "string" || !said.refresh_token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("kimi answered the refresh without a usable token");
  }
  return {
    access_token: said.access_token,
    refresh_token: said.refresh_token,
    expires_at: Math.floor(now / 1000) + expiresIn,
    scope: typeof said.scope === "string" ? said.scope : "",
    token_type: typeof said.token_type === "string" ? said.token_type : "Bearer",
    expires_in: expiresIn,
  };
}

export class KimiSessionGone extends Error {}

export async function refreshKimiToken(refreshToken, { oauthHost, ask = fetch, now = Date.now(), timeoutMs = 10000 } = {}) {
  const body = new URLSearchParams({ client_id: KIMI_CLIENT_ID, grant_type: "refresh_token", refresh_token: refreshToken }).toString();
  const said = await ask(`${String(oauthHost).replace(/\/$/, "")}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = {};
  try { data = await said.json(); } catch {}
  if (said.status === 400 || said.status === 401) throw new KimiSessionGone(String(data?.error_description || data?.error || "the kimi session expired — run kimi login"));
  if (!said.ok) throw new Error(`kimi answered the refresh with ${said.status}`);
  return kimiTokenFromRefresh(data, now);
}

export async function askKimiUsage(token, { baseUrl, ask = fetch, timeoutMs = 10000 } = {}) {
  const said = await ask(`${String(baseUrl).replace(/\/+$/, "")}/usages`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (said.status === 401) throw new KimiSessionGone("the kimi session expired — run kimi login");
  if (!said.ok) {
    const wrong = new Error(`the kimi usage endpoint answered ${said.status}`);
    if (REFUSALS.has(said.status)) wrong.until = waitUntil(said);
    throw wrong;
  }
  return kimiLimitsFromUsages(await said.json());
}

export function kimiFileStore(root, { fs, now = Date.now } = {}) {
  const file = kimiCredentialsFile(root);
  const lock = join(root, "oauth", "kimi-code.lock");
  return {
    read() {
      try { return kimiTokenFromWire(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return null; }
    },
    write(token) {
      const tmp = `${file}.tmp.${process.pid}.${Math.random().toString(16).slice(2, 10)}`;
      fs.writeFileSync(tmp, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
      try { fs.renameSync(tmp, file); } catch (wrong) { try { fs.unlinkSync(tmp); } catch {} throw wrong; }
    },
    lock() {
      try { fs.mkdirSync(lock, { recursive: false }); return true; } catch {}
      let age = 0;
      try { age = now() - fs.statSync(lock).mtimeMs; } catch { return false; }
      if (age < KIMI_LOCK_STALE) return false;
      try { fs.rmSync(lock, { recursive: true, force: true }); fs.mkdirSync(lock, { recursive: false }); return true; } catch { return false; }
    },
    unlock() {
      try { fs.rmSync(lock, { recursive: true, force: true }); } catch {}
    },
  };
}

export async function freshKimiToken(store, { oauthHost, ask, now = Date.now() } = {}) {
  const held = store.read();
  if (!held) return "";
  if (kimiTokenIsFresh(held, now)) return held.access_token;
  if (!held.refresh_token) throw new KimiSessionGone("the kimi login has no refresh token — run kimi login");
  if (!store.lock()) throw new Error("another kimi is renewing this login");
  try {
    const again = store.read();
    if (again && kimiTokenIsFresh(again, now)) return again.access_token;
    const renewed = await refreshKimiToken((again || held).refresh_token, { oauthHost, ask, now });
    store.write(renewed);
    return renewed.access_token;
  } finally {
    store.unlock();
  }
}

export async function kimiLimitsPerAccount({ accounts = [], storeFor, ask = fetch, now = Date.now, waiting = () => 0 } = {}) {
  return Promise.all(accounts.map(async ({ name, root, region }) => {
    const hosts = kimiHosts(region);
    const store = storeFor(root);
    let token = "";
    try {
      token = await freshKimiToken(store, { oauthHost: hosts.oauthHost, ask, now: now() });
    } catch (wrong) {
      if (wrong instanceof KimiSessionGone) return { account: name, provider: "kimi", signedIn: true, limits: [], error: String(wrong.message).slice(0, 140) };
      return { account: name, provider: "kimi", signedIn: true, limits: [], error: String(wrong?.message || wrong).slice(0, 140) };
    }
    if (!token) return { account: name, provider: "kimi", signedIn: false, limits: [], error: "not signed in" };
    const until = waiting(name);
    if (until) return { account: name, provider: "kimi", signedIn: true, limits: [], until, error: "" };
    try {
      return { account: name, provider: "kimi", signedIn: true, limits: await askKimiUsage(token, { baseUrl: hosts.baseUrl, ask }) };
    } catch (wrong) {
      return { account: name, provider: "kimi", signedIn: true, limits: [], until: wrong?.until || 0, error: String(wrong?.message || wrong).slice(0, 140) };
    }
  }));
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

const KIRO_HEADER = /Estimated Usage\s*\|\s*resets on\s+(\d{4}-\d{2}-\d{2})(?:\s*\|\s*([^\n|]+))?/;
const KIRO_BUCKET = /^\s*(.+?)\s+\(([\d.]+) of ([\d.]+) covered in plan\)[^\n]*$/;

export function kiroLimitsFromUsageText(text) {
  const clean = String(text || "").replace(ANSI, "");
  const header = KIRO_HEADER.exec(clean);
  if (!header) return { plan: "", limits: [] };
  const resets_at = `${header[1]}T00:00:00.000Z`;
  const limits = [];
  for (const line of clean.split("\n")) {
    const bucket = KIRO_BUCKET.exec(line);
    if (!bucket) continue;
    const used = Number(bucket[2]);
    const limit = Number(bucket[3]);
    if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) continue;
    const percent = Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
    const name = bucket[1].trim();
    limits.push({
      kind: "monthly",
      model: /^credits$/i.test(name) ? "" : name,
      percent,
      severity: percent >= 100 ? "exceeded" : percent >= 80 ? "warning" : "normal",
      resets_at,
      used,
      limit,
    });
  }
  return { plan: String(header[2] || "").trim(), limits };
}

/* --classic is kiro-cli's --legacy-ui, and the v2 engine it now runs by default
   refuses to start beside it, so asking that way prints a flag conflict and no
   usage at all. The v2 panel also writes the percentage after the bucket, on the
   same line, where the old one drew it on a bar underneath. */
export const KIRO_USAGE_ARGS = ["chat", "--no-interactive", "/usage"];

export async function kiroLimitsPerAccount({ accounts = [], run } = {}) {
  return Promise.all(accounts.map(async ({ name, env }) => {
    try {
      const said = await run(KIRO_USAGE_ARGS, env);
      const { plan, limits } = kiroLimitsFromUsageText(said);
      if (!limits.length) throw new Error(String(said || "").replace(ANSI, "").trim().split("\n").filter(Boolean).pop() || "kiro printed no usage");
      return { account: name, provider: "kiro", signedIn: true, plan, limits };
    } catch (wrong) {
      return { account: name, provider: "kiro", signedIn: true, limits: [], error: String(wrong?.message || wrong).slice(0, 140) };
    }
  }));
}
