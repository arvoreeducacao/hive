import { demoMemories, demoStats } from "./memories-demo.mjs";

export const MEMORY_TOKEN_KEY = "MEMORY_MCP_READ_TOKEN";

export const MEMORY_FRESH_MS = 30000;

export const MEMORY_TIMEOUT_MS = 8000;

export const MEMORY_MISSING_MS = 5 * 60 * 1000;

const LIST_KEYS = ["status", "repo", "category", "origin", "q"];

const STATUSES = new Set(["active", "archived"]);

const ORIGINS = new Set(["automatica", "manual"]);

export const MEMORY_CATEGORIES = ["decisions", "conventions", "incidents", "domain", "gotchas"];

const LIMITS = { title: 200, content: 20000, tags: 12, tag: 40 };

export function memoryPatch(asked = {}) {
  const out = {};
  if (typeof asked.title === "string") {
    const title = asked.title.trim().slice(0, LIMITS.title);
    if (!title) return { error: "title" };
    out.title = title;
  }
  if (typeof asked.content === "string") {
    if (!asked.content.trim()) return { error: "content" };
    if (asked.content.length > LIMITS.content) return { error: "content" };
    out.content = asked.content;
  }
  if (asked.category !== undefined) {
    if (!MEMORY_CATEGORIES.includes(asked.category)) return { error: "category" };
    out.category = asked.category;
  }
  if (asked.tags !== undefined) {
    if (!Array.isArray(asked.tags)) return { error: "tags" };
    const tags = [...new Set(asked.tags.map((one) => String(one ?? "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, LIMITS.tag)).filter(Boolean))];
    if (tags.length > LIMITS.tags) return { error: "tags" };
    out.tags = tags;
  }
  return Object.keys(out).length ? { patch: out } : { error: "empty" };
}

function writeAnswer(said) {
  if (said.out) return { state: "out" };
  if (said.status === 403) return { state: "forbidden" };
  if (said.status === 404) return { state: "gone" };
  if (said.status === 400 || said.status === 409 || said.status === 422) return { state: "bad", why: String(said.body?.error_description || said.body?.error || `HTTP ${said.status}`).slice(0, 300) };
  if (!said.ok) return { state: "down", why: String(said.body?.error || `HTTP ${said.status}`).slice(0, 300) };
  return { state: "ok", memory: said.body?.memory || said.body || null };
}

export function memoryListQuery(asked = {}) {
  const out = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = String(asked[key] ?? "").trim().slice(0, 200);
    if (!value) continue;
    if (key === "status" && !STATUSES.has(value)) continue;
    if (key === "origin" && !ORIGINS.has(value)) continue;
    out.set(key, value);
  }
  if (!out.has("status")) out.set("status", "active");
  return out;
}

export const cleanMemoryId = (id) => {
  const value = String(id ?? "").trim();
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : "";
};

export const cleanWeeks = (weeks) => {
  const n = Math.round(Number(weeks));
  return Number.isFinite(n) && n >= 1 && n <= 52 ? n : 12;
};

function demoList(query, now, changed) {
  const status = query.get("status");
  const q = (query.get("q") || "").toLowerCase();
  const memories = demoWith(now, changed)
    .filter((one) => one.status === status)
    .filter((one) => !query.has("repo") || (query.get("repo") === "-" ? one.repo === null : one.repo === query.get("repo")))
    .filter((one) => !query.has("category") || one.category === query.get("category"))
    .filter((one) => !query.has("origin") || one.origin === query.get("origin"))
    .filter((one) => !q || `${one.title} ${one.snippet} ${one.tags.join(" ")}`.toLowerCase().includes(q))
    .map(({ content, ...rest }) => rest);
  return { memories };
}

function demoWith(now, changed) {
  return demoMemories(now).map((one) => (changed.has(one.id) ? { ...one, ...changed.get(one.id) } : one));
}

export function createMemorySource({
  baseUrl = "",
  readToken = () => "",
  demo = false,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  freshFor = MEMORY_FRESH_MS,
  timeout = MEMORY_TIMEOUT_MS,
  missingFor = MEMORY_MISSING_MS,
  login = null,
  demoEmail = "voce@example.com"
} = {}) {
  const addressOf = typeof baseUrl === "function" ? baseUrl : () => baseUrl;
  const fresh = new Map();
  const kept = new Map();
  let missingAt = null;
  const changed = new Map();
  let aimed = null;

  function root() {
    const next = String(addressOf() || "").replace(/\/+$/, "");
    if (aimed !== null && next !== aimed) {
      fresh.clear();
      kept.clear();
      missingAt = null;
    }
    aimed = next;
    return next;
  }

  const missing = () => missingAt !== null && now() - missingAt < missingFor;

  const source = () => root().replace(/^https?:\/\//, "") || "memory";

  async function ask(path) {
    const aimedAt = root();
    const token = String((await readToken()) || "").trim();
    if (root() !== aimedAt) return { kind: "down", why: "the memory address changed" };
    if (!token) return { kind: "no-token" };
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), timeout);
    try {
      const r = await fetchImpl(`${aimedAt}${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: stop.signal });
      if (r.status === 404) return { kind: "missing" };
      if (r.status === 401 || r.status === 403) return { kind: "refused", status: r.status };
      if (!r.ok) return { kind: "down", why: `HTTP ${r.status}` };
      const body = await r.json();
      if (root() !== aimedAt) return { kind: "down", why: "the memory address changed" };
      return { kind: "ok", body };
    } catch (wrong) {
      return { kind: "down", why: wrong?.name === "AbortError" ? "timeout" : String(wrong?.message || wrong) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function through(key, path, fromDemo, shape, { notFound = null } = {}) {
    const at = now();
    if (demo || missing()) return { state: "ok", demo: true, source: source(), at, ...fromDemo(at) };
    if (!root()) return { state: "no-server", demo: false, source: source(), at, key: "HIVE_MEMORY_URL" };
    const hit = fresh.get(key);
    if (hit && at - hit.at < freshFor) return hit.answer;
    const said = await ask(path);
    if (said.kind === "missing" && notFound) return { state: "ok", demo: false, source: source(), at, ...notFound };
    if (said.kind === "missing") {
      missingAt = at;
      return { state: "ok", demo: true, source: source(), at, ...fromDemo(at) };
    }
    if (said.kind === "ok") {
      missingAt = null;
      const answer = { state: "ok", demo: false, source: source(), at, ...shape(said.body) };
      fresh.set(key, { at, answer });
      kept.set(key, answer);
      return answer;
    }
    if (said.kind === "no-token") return { state: "no-token", demo: false, source: source(), at, key: MEMORY_TOKEN_KEY };
    if (said.kind === "refused") return { state: "refused", demo: false, source: source(), at, key: MEMORY_TOKEN_KEY, status: said.status };
    const last = kept.get(key);
    const { state, demo: wasDemo, source: from, at: keptAt, ...payload } = last || {};
    return { state: "down", demo: false, source: source(), at, why: said.why, keptAt: keptAt || null, ...payload };
  }

  const listShape = (body) => ({ memories: Array.isArray(body?.memories) ? body.memories : [] });

  return {
    list(asked) {
      const query = memoryListQuery(asked);
      return through(`list?${query}`, `/api/memories?${query}`, (at) => demoList(query, at, changed), listShape);
    },
    one(id) {
      const clean = cleanMemoryId(id);
      if (!clean) return Promise.resolve({ state: "bad", why: "no such memory" });
      return through(`one:${clean}`, `/api/memories/${encodeURIComponent(clean)}`,
        (at) => ({ memory: demoWith(at, changed).find((one) => one.id === clean) || null }),
        (body) => ({ memory: body?.memory || body || null }),
        { notFound: { memory: null } });
    },
    stats(weeks) {
      const n = cleanWeeks(weeks);
      return through(`stats:${n}`, `/api/stats?weeks=${n}`, (at) => ({ stats: demoStats(at, n) }), (body) => ({ stats: body?.stats || body || null }));
    },
    forget() { fresh.clear(); },
    async write(id, kind, asked = {}) {
      const clean = cleanMemoryId(id);
      if (!clean) return { state: "bad", why: "no such memory" };
      let body;
      if (kind === "edit") {
        const made = memoryPatch(asked);
        if (made.error) return { state: "bad", why: made.error };
        body = made.patch;
      } else if (kind !== "archive" && kind !== "unarchive") {
        return { state: "bad", why: "unknown change" };
      }
      if (demo) {
        const at = now();
        const was = demoWith(at, changed).find((one) => one.id === clean);
        if (!was) return { state: "gone" };
        const stamp = { updated: new Date(at).toISOString(), updated_at: new Date(at).toISOString(), updated_by: demoEmail };
        const next = kind === "edit"
          ? { ...body, ...stamp, snippet: body.content ? body.content.replace(/^#.*\n+/, "").replace(/[*_`#>]/g, "").split("\n").find(Boolean)?.slice(0, 180) || was.snippet : was.snippet }
          : { ...stamp, status: kind === "archive" ? "archived" : "active", archived_reason: kind === "archive" ? "manual" : null };
        changed.set(clean, { ...(changed.get(clean) || {}), ...next });
        fresh.clear();
        return { state: "ok", demo: true, memory: { ...was, ...changed.get(clean) } };
      }
      if (!login || !root()) return { state: "out" };
      const path = `/api/memories/${encodeURIComponent(clean)}${kind === "edit" ? "" : `/${kind}`}`;
      let said;
      try {
        said = await login.call(kind === "edit" ? "PATCH" : "POST", path, kind === "edit" ? body : undefined);
      } catch (wrong) {
        return { state: "down", why: wrong?.name === "AbortError" ? "timeout" : String(wrong?.message || wrong) };
      }
      const answer = said.status === 404 && missingAt !== null ? { state: "unsupported" } : writeAnswer(said);
      if (answer.state === "ok") fresh.clear();
      return answer;
    }
  };
}
