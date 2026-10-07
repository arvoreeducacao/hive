import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir, hostname } from "node:os";
import { join, basename, dirname } from "node:path";

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");
const HIVE_ROOT = process.env.HIVE_HOME || join(homedir(), ".hive");
const OWN_AGENT = /^(codex|kimi|kiro|cursor|opencode)$/;
const BUCKET_MS = 60_000;

const RE_TIMESTAMP = /"timestamp":"([^"]{20,30})"/;

const OPENED_BY_HAND = ['"entrypoint":"cli"', '"entrypoint":"sdk-ts"', '"entrypoint":"claude-desktop"'];

function minuteOf(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor(t / BUCKET_MS);
}

function dayOf(minute) {
  return new Date(minute * BUCKET_MS).toISOString().slice(0, 10);
}

function tokensOf(u) {
  if (!u) return null;
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_write: u.cache_creation_input_tokens ?? 0,
  };
}

function zeroTokens() {
  return { input: 0, output: 0, cache_read: 0, cache_write: 0 };
}

function add(target, part) {
  for (const k of Object.keys(target)) target[k] += part[k] ?? 0;
}

function totalOf(t) {
  return t.input + t.output + t.cache_read + t.cache_write;
}

async function listSessions(root) {
  const projects = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return projects;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const projectDir = join(root, e.name);
    const files = await readdir(projectDir, { withFileTypes: true });
    for (const f of files) {
      if (f.isFile() && f.name.endsWith(".jsonl")) {
        projects.push({ project: e.name, session: f.name.replace(/\.jsonl$/, ""), path: join(projectDir, f.name) });
      }
    }
  }
  return projects;
}

async function countSubagents(jsonlPath) {
  const sideDir = jsonlPath.replace(/\.jsonl$/, "");
  try {
    const files = await readdir(join(sideDir, "subagents"));
    const metas = files.filter((f) => f.endsWith(".meta.json"));
    const kinds = {};
    for (const m of metas) {
      try {
        const o = JSON.parse(await readFile(join(sideDir, "subagents", m), "utf8"));
        const t = o.agentType || "unknown";
        kinds[t] = (kinds[t] ?? 0) + 1;
      } catch {
        kinds.unreadable = (kinds.unreadable ?? 0) + 1;
      }
    }
    return { total: metas.length, kinds };
  } catch {
    return { total: 0, kinds: {} };
  }
}

/* the other agents keep no transcript under ~/.claude; what the hive holds for them is the
   record their driver writes and the events file, which carries every turn, every reply's
   usage and every tool call — enough to count them the way a Claude session is counted. */
async function listOwnSessions(root) {
  const found = [];
  let files;
  try {
    files = await readdir(join(root, "sessions"), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const f of files) {
    if (!f.isFile() || !f.name.endsWith(".json")) continue;
    let meta;
    try {
      meta = JSON.parse(await readFile(join(root, "sessions", f.name), "utf8"));
    } catch {
      continue;
    }
    const agent = String(meta?.agent || "");
    if (!OWN_AGENT.test(agent)) continue;
    const name = f.name.replace(/\.json$/, "");
    found.push({ session: String(meta.session_id || name), project: "hive", path: join(root, "events", `${name}.ndjson`), agent, meta });
  }
  return found;
}

async function readOwnSession(item) {
  const s = {
    session: item.session,
    project: item.project,
    path: item.path,
    agent: item.agent,
    title: item.meta.title || null,
    cwds: new Set(item.meta.cwd ? [item.meta.cwd] : []),
    branches: new Set(),
    models: new Map(),
    tools: new Map(),
    prs: new Set(),
    human_turns: 0,
    replies: 0,
    interruptions: 0,
    api_errors: 0,
    lines: 0,
    interactive: true,
    minutes: new Set(),
    first: null,
    last: null,
    tokens: zeroTokens(),
    subagents: { total: 0, kinds: {} },
  };
  let model = item.meta.model || "";
  let stream;
  try {
    stream = createReadStream(item.path, { encoding: "utf8" });
  } catch {
    return s;
  }
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of reader) {
      if (line.length < 2) continue;
      s.lines += 1;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (o.replayed || o.type === "stream_event") continue;
      const min = minuteOf(o.ts || "");
      if (min !== null && (o.type === "user" || o.type === "assistant" || o.type === "result")) {
        s.minutes.add(min);
        if (s.first === null || min < s.first) s.first = min;
        if (s.last === null || min > s.last) s.last = min;
      }
      if (o.type === "system" && o.subtype === "init" && o.model) model = o.model;
      if (o.type === "user" && o.subtype === "say") s.human_turns += 1;
      if (o.type === "assistant" && Array.isArray(o.message?.content)) {
        for (const chunk of o.message.content) {
          if (chunk && chunk.type === "tool_use" && chunk.name) s.tools.set(chunk.name, (s.tools.get(chunk.name) ?? 0) + 1);
        }
      }
      if (o.type === "result") {
        s.replies += 1;
        if (o.subtype === "interrupted") s.interruptions += 1;
        if (o.is_error) s.api_errors += 1;
        const usage = tokensOf(o.usage);
        if (usage) {
          add(s.tokens, usage);
          s.models.set(model || "unknown", (s.models.get(model || "unknown") ?? 0) + 1);
        }
      }
    }
  } catch {
    return s;
  }
  return s;
}

async function readSession(item) {
  const s = {
    session: item.session,
    project: item.project,
    path: item.path,
    agent: "claude",
    title: null,
    cwds: new Set(),
    branches: new Set(),
    models: new Map(),
    tools: new Map(),
    prs: new Set(),
    human_turns: 0,
    replies: 0,
    interruptions: 0,
    api_errors: 0,
    lines: 0,
    interactive: false,
    minutes: new Set(),
    first: null,
    last: null,
    tokens: zeroTokens(),
  };

  const usageByRequest = new Map();
  const stream = createReadStream(item.path, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    if (line.length < 2) continue;
    s.lines += 1;

    const mt = RE_TIMESTAMP.exec(line);
    if (mt) {
      const min = minuteOf(mt[1]);
      if (min !== null) {
        s.minutes.add(min);
        if (s.first === null || min < s.first) s.first = min;
        if (s.last === null || min > s.last) s.last = min;
      }
    }

    if (!s.interactive && OPENED_BY_HAND.some((mark) => line.includes(mark))) s.interactive = true;

    const isAssistant = line.includes('"type":"assistant"');
    const isTitle = line.includes('"type":"ai-title"');
    const isPr = line.includes('"type":"pr-link"');
    const isTurn = line.includes('"promptSource":"typed"') || line.includes('"origin":{"kind":"human"');
    const hasInterruption = line.includes('"interruptedMessageId"');

    if (!isAssistant && !isTitle && !isPr && !isTurn && !hasInterruption) continue;

    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }

    if (o.cwd) s.cwds.add(o.cwd);
    if (o.gitBranch) s.branches.add(o.gitBranch);

    if (o.type === "ai-title" && o.aiTitle && !s.title) s.title = o.aiTitle;
    if (o.type === "pr-link" && o.prUrl) s.prs.add(o.prUrl);
    if (o.type === "user") {
      if ((o.promptSource === "typed" || o.origin?.kind === "human") && !o.isMeta) s.human_turns += 1;
      if (o.interruptedMessageId) s.interruptions += 1;
    }

    if (o.type !== "assistant") continue;

    if (o.isApiErrorMessage) s.api_errors += 1;
    const msg = o.message ?? {};
    const key = o.requestId || o.uuid;
    const usage = tokensOf(msg.usage);

    if (usage && key) {
      const previous = usageByRequest.get(key);
      const current = { usage, model: msg.model ?? "unknown" };
      if (!previous || totalOf(usage) > totalOf(previous.usage)) usageByRequest.set(key, current);
    }

    if (Array.isArray(msg.content)) {
      for (const chunk of msg.content) {
        if (chunk && chunk.type === "tool_use" && chunk.name) {
          s.tools.set(chunk.name, (s.tools.get(chunk.name) ?? 0) + 1);
        }
      }
    }
  }

  s.replies = usageByRequest.size;
  for (const { usage, model } of usageByRequest.values()) {
    add(s.tokens, usage);
    s.models.set(model, (s.models.get(model) ?? 0) + 1);
  }

  s.subagents = await countSubagents(item.path);
  return s;
}

function longestStreak(days) {
  const sorted = [...days].sort();
  let best = 0;
  let current = 0;
  let previous = null;
  for (const d of sorted) {
    const today = Date.parse(`${d}T00:00:00Z`);
    current = previous !== null && today - previous === 86_400_000 ? current + 1 : 1;
    if (current > best) best = current;
    previous = today;
  }
  return best;
}

function currentStreak(days, today) {
  const set = new Set(days);
  let n = 0;
  let cursor = Date.parse(`${today}T00:00:00Z`);
  if (!set.has(new Date(cursor).toISOString().slice(0, 10))) cursor -= 86_400_000;
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    n += 1;
    cursor -= 86_400_000;
  }
  return n;
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, times]) => ({ name, times }));
}

function aggregateConcurrency(sessions) {
  const byMinute = new Map();
  for (const s of sessions) {
    for (const min of s.minutes) {
      let set = byMinute.get(min);
      if (!set) {
        set = new Set();
        byMinute.set(min, set);
      }
      set.add(s.session);
    }
  }

  const distribution = new Map();
  const byDay = new Map();
  let peak = 0;
  let at = null;
  let concurrencySum = 0;

  for (const [min, set] of byMinute) {
    const c = set.size;
    concurrencySum += c;
    distribution.set(c, (distribution.get(c) ?? 0) + 1);
    if (c > peak) {
      peak = c;
      at = new Date(min * BUCKET_MS).toISOString();
    }
    const day = dayOf(min);
    let d = byDay.get(day);
    if (!d) {
      d = { date: day, active_minutes: 0, sum: 0, peak: 0, sessions: new Set() };
      byDay.set(day, d);
    }
    d.active_minutes += 1;
    d.sum += c;
    if (c > d.peak) d.peak = c;
    for (const id of set) d.sessions.add(id);
  }

  const activeMinutes = byMinute.size;
  return {
    byMinute,
    byDay,
    summary: {
      bucket_minutes: BUCKET_MS / 60_000,
      active_minutes: activeMinutes,
      peak,
      at,
      mean_when_active: activeMinutes ? Number((concurrencySum / activeMinutes).toFixed(2)) : 0,
      distribution: Object.fromEntries([...distribution.entries()].sort((a, b) => a[0] - b[0])),
      minutes_with_2_plus: [...distribution.entries()].reduce((acc, [c, m]) => (c >= 2 ? acc + m : acc), 0),
    },
  };
}

const INSIGHT_WINDOW_HOURS = 24;
const INSIGHT_MIN_PERCENT = 10;
const INSIGHT_OVERSIZED_BYTES = 209_715_200;
const CACHE_MISS_TOKENS = 100_000;
const LONG_CONTEXT_TOKENS = 150_000;
const PARALLEL_BUCKET_MS = 300_000;
const PARALLEL_FROM = 4;
const SUBAGENT_REQUESTS_FROM = 3;
const SUBAGENT_COST_SHARE = 0.5;
const CRON_HOURS_FROM = 8;

const RE_I_SESSION = /"session_?[iI]d":"([^"]+)"/;
const RE_I_MODEL = /"model":"([^"]+)"/;
const RE_I_REQUEST = /"requestId":"([^"]+)"/;
const RE_I_MSGID = /"id":"(msg_[^"]+)"/;
const RE_I_UUID = /"uuid":"([^"]+)"/;
const RE_I_INPUT = /"input_tokens":(\d+)/;
const RE_I_OUTPUT = /"output_tokens":(\d+)/;
const RE_I_CACHE_W = /"cache_creation_input_tokens":(\d+)/;
const RE_I_CACHE_R = /"cache_read_input_tokens":(\d+)/;
const RE_I_SKILL = /"attributionSkill":"([^"]+)"/;
const RE_I_MCP = /"attributionMcpServer":"([^"]+)"/;

function modelTierOf(model) {
  const m = model.toLowerCase();
  if (m.includes("opus")) return 5;
  if (m.includes("haiku")) return 1;
  return 3;
}

function insightCostOf(r) {
  return (r.cached + r.uncached * 10 + r.cacheCreate * 12.5 + r.output * 50) * r.tier;
}

async function listInsightFiles(root, cutoffMs) {
  const found = [];
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    const projectDir = join(root, p.name);
    let entries;
    try {
      entries = await readdir(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".jsonl")) {
        found.push(join(projectDir, e.name));
      } else if (e.isDirectory()) {
        const subRoot = join(projectDir, e.name, "subagents");
        try {
          for (const f of await readdir(subRoot, { recursive: true })) {
            if (String(f).endsWith(".jsonl")) found.push(join(subRoot, String(f)));
          }
        } catch {}
      }
    }
  }
  const kept = [];
  for (const path of found) {
    try {
      const info = await stat(path);
      if (info.isFile() && info.mtimeMs >= cutoffMs && info.size <= INSIGHT_OVERSIZED_BYTES) kept.push(path);
    } catch {}
  }
  return kept;
}

async function readInsightRecords(path, cutoffMs) {
  const records = [];
  const stream = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.includes('"type":"assistant"') || !line.includes('"usage":{')) continue;
    const ts = Date.parse(RE_TIMESTAMP.exec(line)?.[1] ?? "");
    if (Number.isNaN(ts) || ts < cutoffMs) continue;
    const uncached = Number(RE_I_INPUT.exec(line)?.[1] ?? 0);
    const output = Number(RE_I_OUTPUT.exec(line)?.[1] ?? 0);
    const cacheCreate = Number(RE_I_CACHE_W.exec(line)?.[1] ?? 0);
    const cached = Number(RE_I_CACHE_R.exec(line)?.[1] ?? 0);
    if (uncached + output + cacheCreate + cached === 0) continue;
    records.push({
      ts,
      sessionId: RE_I_SESSION.exec(line)?.[1] ?? basename(path, ".jsonl"),
      uncached,
      output,
      cacheCreate,
      cached,
      isSubagent: line.includes('"isSidechain":true') || line.includes('"isSidechain": true'),
      tier: modelTierOf(RE_I_MODEL.exec(line)?.[1] ?? ""),
      key: RE_I_REQUEST.exec(line)?.[1] ?? RE_I_MSGID.exec(line)?.[1] ?? RE_I_UUID.exec(line)?.[1] ?? "",
      skill: RE_I_SKILL.exec(line)?.[1] ?? null,
      mcp: RE_I_MCP.exec(line)?.[1] ?? null,
    });
  }
  return records;
}

async function limitsInsights(root) {
  const cutoffMs = Date.now() - INSIGHT_WINDOW_HOURS * 3_600_000;
  const files = await listInsightFiles(root, cutoffMs);

  const seen = new Set();
  let total = 0;
  let cacheMiss = 0;
  let longContext = 0;
  const bySession = new Map();
  const byBucket = new Map();
  const bySkill = new Map();
  const byServer = new Map();

  for (const path of files) {
    let records;
    try {
      records = await readInsightRecords(path, cutoffMs);
    } catch {
      continue;
    }
    for (const r of records) {
      if (r.key) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
      }
      const cost = insightCostOf(r);
      total += cost;
      if (r.uncached > CACHE_MISS_TOKENS) cacheMiss += cost;
      if (r.cached + r.cacheCreate + r.uncached > LONG_CONTEXT_TOKENS) longContext += cost;

      let session = bySession.get(r.sessionId);
      if (!session) {
        session = { cost: 0, subCost: 0, subCount: 0, hours: new Set() };
        bySession.set(r.sessionId, session);
      }
      session.cost += cost;
      if (r.isSubagent) {
        session.subCost += cost;
        session.subCount += 1;
      }
      session.hours.add(Math.floor(r.ts / 3_600_000));

      const bucketKey = Math.floor(r.ts / PARALLEL_BUCKET_MS);
      let bucket = byBucket.get(bucketKey);
      if (!bucket) {
        bucket = { sids: new Set(), cost: 0 };
        byBucket.set(bucketKey, bucket);
      }
      bucket.sids.add(r.sessionId);
      bucket.cost += cost;

      if (r.skill) bySkill.set(r.skill, (bySkill.get(r.skill) ?? 0) + cost);
      if (r.mcp) byServer.set(r.mcp, (byServer.get(r.mcp) ?? 0) + cost);
    }
  }

  if (!total) return null;

  let highParallel = 0;
  for (const bucket of byBucket.values()) if (bucket.sids.size >= PARALLEL_FROM) highParallel += bucket.cost;

  let subagentHeavy = 0;
  let cron = 0;
  for (const session of bySession.values()) {
    if (session.subCount >= SUBAGENT_REQUESTS_FROM || (session.cost > 0 && session.subCost / session.cost > SUBAGENT_COST_SHARE)) subagentHeavy += session.cost;
    if (session.hours.size >= CRON_HOURS_FROM) cron += session.cost;
  }

  const pct = (cost) => Math.round((cost / total) * 100);
  const items = [
    { kind: "cache_miss", percent: pct(cacheMiss) },
    { kind: "long_context", percent: pct(longContext) },
    { kind: "subagent_heavy", percent: pct(subagentHeavy) },
    { kind: "high_parallel", percent: pct(highParallel) },
    { kind: "cron", percent: pct(cron) },
    ...[...bySkill.entries()].map(([name, cost]) => ({ kind: "skill", name, percent: pct(cost) })),
    ...[...byServer.entries()].map(([name, cost]) => ({ kind: "mcp", name, percent: pct(cost) })),
  ]
    .filter((i) => i.percent >= INSIGHT_MIN_PERCENT)
    .sort((a, b) => b.percent - a.percent);
  return items.length ? { window_hours: INSIGHT_WINDOW_HOURS, items } : null;
}

function hourProfile(byMinute) {
  const hours = Array.from({ length: 24 }, () => ({ active_minutes: 0, concurrency_sum: 0 }));
  for (const [min, set] of byMinute) {
    const h = new Date(min * BUCKET_MS).getUTCHours();
    hours[h].active_minutes += 1;
    hours[h].concurrency_sum += set.size;
  }
  return hours.map((h, i) => ({
    hour_utc: i,
    active_minutes: h.active_minutes,
    mean_concurrency: h.active_minutes ? Number((h.concurrency_sum / h.active_minutes).toFixed(2)) : 0,
  }));
}

function defaultPerson() {
  return (process.env.HIVE_PERSON || basename(homedir()) || "unknown")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
  const options = { since: null, out: null, person: defaultPerson(), sessions: false, limit: 0, hiveRoot: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--since") options.since = argv[++i];
    else if (a === "--out") options.out = argv[++i];
    else if (a === "--person") options.person = argv[++i];
    else if (a === "--limit") options.limit = Number(argv[++i]);
    else if (a === "--hive") options.hiveRoot = argv[++i];
    else if (a === "--sessions") options.sessions = true;
  }
  return options;
}

export async function extract({ since = null, person = defaultPerson(), limit = 0, root = PROJECTS_ROOT, hiveRoot = null } = {}) {
  const items = await listSessions(root);
  const own = hiveRoot ? await listOwnSessions(hiveRoot) : [];
  const cutoff = since ? Date.parse(`${since}T00:00:00Z`) : null;

  const candidates = [];
  for (const item of [...items, ...own]) {
    if (cutoff !== null) {
      let info;
      try {
        info = await stat(item.path);
      } catch {
        continue;
      }
      if (info.mtimeMs < cutoff) continue;
    }
    candidates.push(item);
  }
  const targets = limit > 0 ? candidates.slice(0, limit) : candidates;

  const sessions = [];
  for (const item of targets) {
    try {
      sessions.push(item.agent ? await readOwnSession(item) : await readSession(item));
    } catch (error) {
      process.stderr.write(`failed ${item.session}: ${error.message}\n`);
    }
  }

  const active = sessions.filter((s) => s.minutes.size > 0);
  const withActivity = active.filter((s) => s.interactive);
  const automated = active.filter((s) => !s.interactive);
  const { byMinute, byDay, summary } = aggregateConcurrency(withActivity);

  const automationTokens = zeroTokens();
  let automationMinutes = 0;
  for (const s of automated) {
    add(automationTokens, s.tokens);
    automationMinutes += s.minutes.size;
  }

  const tokens = zeroTokens();
  const models = new Map();
  const tools = new Map();
  const prs = new Set();
  const agents = new Map();
  let turns = 0;
  let replies = 0;
  let interruptions = 0;
  let apiErrors = 0;
  let subagents = 0;
  const subagentKinds = new Map();

  for (const s of withActivity) {
    add(tokens, s.tokens);
    agents.set(s.agent, (agents.get(s.agent) ?? 0) + 1);
    for (const [m, n] of s.models) models.set(m, (models.get(m) ?? 0) + n);
    for (const [f, n] of s.tools) tools.set(f, (tools.get(f) ?? 0) + n);
    for (const p of s.prs) prs.add(p);
    turns += s.human_turns;
    replies += s.replies;
    interruptions += s.interruptions;
    apiErrors += s.api_errors;
    subagents += s.subagents.total;
    for (const [t, n] of Object.entries(s.subagents.kinds)) subagentKinds.set(t, (subagentKinds.get(t) ?? 0) + n);
  }

  const tokensByDay = new Map();
  for (const s of withActivity) {
    const sessionTotal = totalOf(s.tokens);
    if (sessionTotal === 0 || s.minutes.size === 0) continue;
    const perMinute = sessionTotal / s.minutes.size;
    for (const min of s.minutes) {
      const day = dayOf(min);
      tokensByDay.set(day, (tokensByDay.get(day) ?? 0) + perMinute);
    }
  }

  const heatmap = [...byDay.values()]
    .map((d) => ({
      date: d.date,
      active_minutes: d.active_minutes,
      sessions: d.sessions.size,
      peak_concurrency: d.peak,
      mean_concurrency: Number((d.sum / d.active_minutes).toFixed(2)),
      estimated_tokens: Math.round(tokensByDay.get(d.date) ?? 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const days = heatmap.map((d) => d.date);
  const today = new Date().toISOString().slice(0, 10);
  const busiestDay = [...heatmap].sort((a, b) => b.active_minutes - a.active_minutes)[0] ?? null;
  const longest = [...withActivity].sort((a, b) => b.minutes.size - a.minutes.size)[0] ?? null;
  const windowDays = days.length ? Math.round((Date.parse(days.at(-1)) - Date.parse(days[0])) / 86_400_000) + 1 : 0;

  return {
    generated_at: new Date().toISOString(),
    machine: hostname(),
    person,
    source: root,
    hive: hiveRoot,
    window: { from: days[0] ?? null, to: days.at(-1) ?? null, calendar_days: windowDays },
    totals: {
      sessions_read: sessions.length,
      sessions_with_activity: withActivity.length,
      automation: {
        runs: automated.length,
        session_minutes: automationMinutes,
        tokens: { ...automationTokens, total: totalOf(automationTokens) },
      },
      active_minutes: summary.active_minutes,
      active_hours: Number((summary.active_minutes / 60).toFixed(1)),
      active_days: days.length,
      human_turns: turns,
      model_replies: replies,
      interruptions,
      api_errors: apiErrors,
      subagents_spawned: subagents,
      subagent_kinds: Object.fromEntries([...subagentKinds.entries()].sort((a, b) => b[1] - a[1])),
      prs_touched: prs.size,
      tokens: { ...tokens, total: totalOf(tokens) },
      agents: Object.fromEntries([...agents.entries()].sort((a, b) => b[1] - a[1])),
      top_model: topN(models, 1)[0]?.name ?? null,
      models: Object.fromEntries([...models.entries()].sort((a, b) => b[1] - a[1])),
      top_tools: topN(tools, 12),
      longest_streak_days: longestStreak(days),
      current_streak_days: currentStreak(days, today),
      busiest_day: busiestDay,
      longest_session: longest
        ? {
            session: longest.session,
            title: longest.title,
            active_minutes: longest.minutes.size,
            span_minutes: longest.last - longest.first + 1,
          }
        : null,
    },
    concurrency: summary,
    limits_insights: await limitsInsights(root),
    heatmap,
    hour_of_day: hourProfile(byMinute),
    sessions: withActivity
      .map((s) => ({
        session: s.session,
        project: s.project,
        agent: s.agent,
        title: s.title,
        start: new Date(s.first * BUCKET_MS).toISOString(),
        end: new Date(s.last * BUCKET_MS).toISOString(),
        active_minutes: s.minutes.size,
        span_minutes: s.last - s.first + 1,
        occupancy: Number((s.minutes.size / (s.last - s.first + 1)).toFixed(3)),
        human_turns: s.human_turns,
        replies: s.replies,
        tokens: { ...s.tokens, total: totalOf(s.tokens) },
        models: Object.fromEntries(s.models),
        subagents: s.subagents.total,
        prs: [...s.prs],
        branches: [...s.branches],
        cwds: [...s.cwds],
        transcript_lines: s.lines,
      }))
      .sort((a, b) => a.start.localeCompare(b.start)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const start = Date.now();
  const data = await extract({ ...options, hiveRoot: options.hiveRoot || HIVE_ROOT });
  if (!options.sessions) delete data.sessions;
  const text = JSON.stringify(data, null, 2);
  if (options.out) {
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${text}\n`);
    process.stderr.write(`${options.out} — ${data.totals.sessions_with_activity} sessions in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
  } else {
    process.stdout.write(`${text}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exit(1);
  });
}
