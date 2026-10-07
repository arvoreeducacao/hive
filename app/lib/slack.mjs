import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { HUB } from "./env.mjs";

const SLACK_LINK = /https:\/\/[\w.-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d{16}(?:\?[\w=&.%-]*)?/g;

function threadKey(link) {
  const m = /slack\.com\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/.exec(String(link || ""));
  if (!m) return "";
  const parent = /[?&]thread_ts=(\d{10}\.\d{6})/.exec(String(link));
  return `${m[1]}:${parent ? parent[1] : `${m[2]}.${m[3]}`}`;
}

const THREADS_FILE = join(HUB, ".hive/threads.json");
const threadCache = new Map();
const slackPeople = new Map();
const slackChannels = new Map();
const slackRead = new Map();
const slackFiles = new Map();
let slackToken = null;
let slackWho = null;
let storingThreads = false;

async function tokenForSlack() {
  if (slackToken !== null) return slackToken;
  slackToken = String(process.env.SLACK_USER_TOKEN || "").trim();
  if (!slackToken) {
    try {
      const env = await readFile(join(HUB, ".env"), "utf8");
      const line = env.split("\n").find((l) => l.trim().startsWith("SLACK_USER_TOKEN="));
      slackToken = (line || "").split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    } catch { slackToken = ""; }
  }
  return slackToken;
}

function slackRefused(answer) {
  const wrong = new Error(answer?.error || "slack refused");
  wrong.slack = answer?.error || "";
  return wrong;
}

async function askSlack(method, params) {
  const token = await tokenForSlack();
  if (!token) throw new Error("no SLACK_USER_TOKEN — put it in the hub .env");
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  const d = await r.json();
  if (!d.ok) throw slackRefused(d);
  return d;
}

async function tellSlack(method, payload) {
  const token = await tokenForSlack();
  if (!token) throw new Error("no SLACK_USER_TOKEN — put it in the hub .env");
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const d = await r.json();
  if (!d.ok) throw slackRefused(d);
  return d;
}

const slackWhy = (wrong) => String(wrong?.slack || wrong?.message || wrong || "slack refused").slice(0, 120);

async function whoOnSlack() {
  if (slackWho) return slackWho;
  const token = await tokenForSlack();
  if (!token) return { ok: false, why: "no SLACK_USER_TOKEN in the hub .env" };
  try {
    const r = await fetch("https://slack.com/api/auth.test", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    const scopes = String(r.headers.get("x-oauth-scopes") || "").split(",").map((s) => s.trim());
    const d = await r.json();
    if (!d.ok) return { ok: false, why: d.error || "slack refused the token" };
    slackWho = {
      ok: true, id: d.user_id, name: d.user,
      canPost: scopes.includes("chat:write"),
      canReact: scopes.includes("reactions:write"),
      canMark: scopes.includes("channels:write") || scopes.includes("groups:write")
    };
  } catch (wrong) {
    return { ok: false, why: slackWhy(wrong) };
  }
  return slackWho;
}

async function personOnSlack(id) {
  if (!id) return { name: "app", avatar: "", role: "", isApp: true };
  if (slackPeople.has(id)) return slackPeople.get(id);
  let person = { name: id, avatar: "", role: "", isApp: false };
  try {
    const who = (await askSlack("users.info", { user: id })).user;
    const face = who?.profile || {};
    person = {
      name: face.display_name || who?.real_name || who?.name || id,
      avatar: face.image_48 || "",
      role: face.title || "",
      isApp: !!who?.is_bot
    };
  } catch {}
  slackPeople.set(id, person);
  return person;
}

const DIRECTORY_FRESH = 6 * 60 * 60 * 1000;
const DIRECTORY_PAGES = 12;
const slackFaces = new Map();
let slackDirectory = { at: 0, byHandle: new Map() };

const handleOfEmail = (email) => String(email || "").trim().toLowerCase().split("@")[0];

function nameFromEmail(email) {
  const said = handleOfEmail(email)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return said || String(email || "");
}

async function directoryOnSlack() {
  if (slackDirectory.at && Date.now() - slackDirectory.at < DIRECTORY_FRESH) return slackDirectory.byHandle;
  const byHandle = new Map();
  let cursor = "";
  for (let page = 0; page < DIRECTORY_PAGES; page++) {
    const answer = await askSlack("users.list", cursor ? { limit: 500, cursor } : { limit: 500 });
    for (const who of answer.members || []) {
      if (!who || who.deleted || who.is_bot) continue;
      const face = who.profile || {};
      const person = { name: face.real_name || who.real_name || who.name || "", avatar: face.image_48 || "" };
      for (const handle of [who.name, face.display_name]) {
        const key = String(handle || "").trim().toLowerCase();
        if (key && !byHandle.has(key)) byHandle.set(key, person);
      }
    }
    cursor = answer.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  slackDirectory = { at: Date.now(), byHandle };
  return byHandle;
}

async function facesOnSlack(emails) {
  const wanted = [...new Set((emails || []).map((one) => String(one || "").trim().toLowerCase()).filter(Boolean))];
  const missing = wanted.filter((email) => !slackFaces.has(email));
  if (missing.length) {
    try {
      const directory = await directoryOnSlack();
      for (const email of missing) {
        const found = directory.get(handleOfEmail(email));
        slackFaces.set(email, { email, name: found?.name || nameFromEmail(email), avatar: found?.avatar || "" });
      }
    } catch {}
  }
  const faces = new Map();
  for (const email of wanted) faces.set(email, slackFaces.get(email) || { email, name: nameFromEmail(email), avatar: "" });
  return faces;
}

async function channelOnSlack(id) {
  if (slackChannels.has(id)) return slackChannels.get(id);
  let chan = { name: id, private: false };
  try {
    const c = (await askSlack("conversations.info", { channel: id })).channel;
    chan = c?.is_im
      ? { name: (await personOnSlack(c.user)).name, private: true }
      : { name: c?.name || id, private: !!c?.is_private };
    slackRead.set(id, { at: Date.now(), ts: c?.last_read || "" });
  } catch {}
  slackChannels.set(id, chan);
  return chan;
}

async function lastReadOf(id) {
  const saved = slackRead.get(id);
  if (saved && Date.now() - saved.at < 30000) return saved.ts;
  let ts = saved?.ts || "";
  try { ts = (await askSlack("conversations.info", { channel: id })).channel?.last_read || ts; } catch {}
  slackRead.set(id, { at: Date.now(), ts });
  return ts;
}

const AT_USER = /<@([A-Z0-9]+)>/g;
const AT_CHANNEL = /<#([A-Z0-9]+)(?:\|[^>]*)?>/g;

function idsInside(node, found) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const one of node) idsInside(one, found);
    return found;
  }
  if (node.type === "user" && node.user_id) found.users.add(node.user_id);
  if (node.type === "channel" && node.channel_id) found.channels.add(node.channel_id);
  for (const value of Object.values(node)) if (value && typeof value === "object") idsInside(value, found);
  return found;
}

async function namesInside(messages) {
  const found = { users: new Set(), channels: new Set() };
  for (const m of messages) {
    for (const hit of String(m.text || "").matchAll(AT_USER)) found.users.add(hit[1]);
    for (const hit of String(m.text || "").matchAll(AT_CHANNEL)) found.channels.add(hit[1]);
    idsInside(m.blocks || [], found);
  }
  const names = { users: {}, channels: {} };
  for (const id of [...found.users].slice(0, 24)) names.users[id] = (await personOnSlack(id)).name;
  for (const id of [...found.channels].slice(0, 8)) names.channels[id] = (await channelOnSlack(id)).name;
  return names;
}

const atSecond = (ts) => new Date(Number(String(ts).split(".")[0]) * 1000).toISOString();

function keepFiles(m) {
  return (m.files || []).filter((f) => f && f.id).map((f) => {
    const kind = String(f.mimetype || "");
    slackFiles.set(f.id, { thumb: f.thumb_480 || f.thumb_360 || f.url_private, url: f.url_private, kind, name: f.name || "file" });
    return {
      id: f.id, name: f.name || "file", kind,
      image: kind.startsWith("image/"),
      w: f.thumb_480_w || f.thumb_360_w || 0,
      h: f.thumb_480_h || f.thumb_360_h || 0,
      size: f.size || 0,
      link: f.permalink || ""
    };
  });
}

async function oneSaid(m, me) {
  const person = m.user
    ? await personOnSlack(m.user)
    : { name: m.username || "app", avatar: m.icons?.image_48 || "", role: "", isApp: true };
  return {
    ts: m.ts,
    at: atSecond(m.ts),
    who: person.name,
    avatar: person.avatar,
    role: person.role,
    isApp: !!(person.isApp || m.bot_id),
    mine: !!(me.ok && m.user && m.user === me.id),
    edited: !!m.edited,
    text: m.text || "",
    blocks: (m.blocks || []).filter((b) => b && b.type === "rich_text"),
    files: keepFiles(m),
    reactions: (m.reactions || []).map((r) => ({
      name: r.name, count: r.count, mine: !!(me.ok && (r.users || []).includes(me.id))
    }))
  };
}

async function threadData(key, link, maxAge = 45000) {
  const saved = threadCache.get(key);
  if (saved && Date.now() - saved.at < maxAge) return saved.data;
  const [channel, ts] = key.split(":");
  try {
    const me = await whoOnSlack();
    const [answer, chan, lastRead] = await Promise.all([
      askSlack("conversations.replies", { channel, ts, limit: "60" }),
      channelOnSlack(channel),
      lastReadOf(channel)
    ]);
    const raw = (answer.messages || []).filter((m) => m && m.ts);
    const said = [];
    for (const m of raw) said.push(await oneSaid(m, me));
    const first = said[0] || null;
    const last = said.length > 1 ? said[said.length - 1] : null;
    const unread = lastRead ? said.filter((m) => !m.mine && Number(m.ts) > Number(lastRead)) : [];
    const data = {
      key, link,
      channel: chan.name, private: chan.private,
      opener: first?.who || "",
      ask: first ? { text: first.text, files: first.files } : null,
      last: last ? { who: last.who, text: last.text, files: last.files, at: last.at } : null,
      replies: Math.max(0, said.length - 1),
      newCount: unread.length,
      newFrom: unread[0]?.ts || "",
      newest: said[said.length - 1]?.ts || "",
      said,
      names: await namesInside(raw),
      can: { post: !!me.canPost, react: !!me.canReact, mark: !!me.canMark, why: me.ok ? "" : me.why }
    };
    threadCache.set(key, { at: Date.now(), data });
    return data;
  } catch (wrong) {
    const why = slackWhy(wrong).slice(0, 90);
    const data = saved?.data
      ? { ...saved.data, stale: why }
      : { key, link, channel, private: false, error: why, said: [], names: { users: {}, channels: {} }, replies: 0, newCount: 0, can: {} };
    threadCache.set(key, { at: Date.now() - 20000, data });
    return data;
  }
}

async function readThreadRegistry() {
  try {
    const raw = JSON.parse(await readFile(THREADS_FILE, "utf8"));
    return Array.isArray(raw) ? raw.filter((t) => t && t.key) : [];
  } catch { return []; }
}

async function writeThreadRegistry(list) {
  await mkdir(join(HUB, ".hive"), { recursive: true });
  await writeFile(THREADS_FILE, JSON.stringify(list.slice(-120), null, 2));
}

async function storeSessionThreads(sessions) {
  if (storingThreads) return;
  const seen = sessions.flatMap((s) => (s.threads || []).map((link) => ({ key: threadKey(link), link, session: s.name }))).filter((t) => t.key);
  if (!seen.length) return;
  storingThreads = true;
  try {
    const registry = await readThreadRegistry();
    let changed = false;
    for (const t of seen) {
      const old = registry.find((r) => r.key === t.key);
      if (!old) { registry.push({ ...t, at: new Date().toISOString() }); changed = true; }
      else if (!old.session && t.session) { old.session = t.session; changed = true; }
    }
    if (changed) await writeThreadRegistry(registry);
  } catch {} finally { storingThreads = false; }
}

async function collectThreads(sessions, maxAge = 45000) {
  const registry = await readThreadRegistry();
  const mine = new Map();
  for (const t of registry) mine.set(t.key, { link: t.link, session: t.session || "" });
  for (const s of sessions) {
    for (const link of s.threads || []) {
      const key = threadKey(link);
      if (key && !mine.has(key)) mine.set(key, { link, session: s.name });
    }
  }
  const live = new Set(sessions.map((s) => s.name));
  const wanted = [...mine.entries()].filter(([, t]) => live.has(t.session));
  return Promise.all(wanted.map(async ([key, t]) => ({ ...(await threadData(key, t.link, maxAge)), session: t.session })));
}

async function replyOnSlack(key, text) {
  const say = String(text || "").trim();
  if (!say) return { error: "there is nothing to send" };
  const [channel, ts] = String(key || "").split(":");
  if (!channel || !ts) return { error: "which thread?" };
  try {
    await tellSlack("chat.postMessage", { channel, thread_ts: ts, text: say });
    threadCache.delete(key);
    return { ok: true };
  } catch (wrong) {
    const why = String(wrong?.slack || "");
    if (why === "missing_scope") return { error: "the Slack app cannot write: add chat:write to the user token, authorize again and paste the new SLACK_USER_TOKEN in the hub .env" };
    return { error: slackWhy(wrong) };
  }
}

async function reactOnSlack(key, ts, name, on) {
  const [channel] = String(key || "").split(":");
  if (!channel || !ts || !name) return { error: "which message?" };
  try {
    await tellSlack(on ? "reactions.add" : "reactions.remove", { channel, timestamp: ts, name });
    threadCache.delete(key);
    return { ok: true };
  } catch (wrong) {
    const why = String(wrong?.slack || "");
    if (why === "already_reacted" || why === "no_reaction") return { ok: true };
    if (why === "missing_scope") {
      slackWho = slackWho ? { ...slackWho, canReact: false } : slackWho;
      return { error: "this Slack app has no reactions:write — add it in api.slack.com → OAuth & Permissions (user token scopes), authorize again and paste the new SLACK_USER_TOKEN in the hub .env", scope: true };
    }
    return { error: slackWhy(wrong) };
  }
}

async function markOnSlack(key, ts) {
  const [channel] = String(key || "").split(":");
  if (!channel || !ts) return { error: "which thread?" };
  try {
    await tellSlack("conversations.mark", { channel, ts });
    slackRead.set(channel, { at: Date.now(), ts });
    threadCache.delete(key);
    return { ok: true };
  } catch (wrong) {
    const why = String(wrong?.slack || "");
    if (why === "missing_scope") return { error: "marking as read needs channels:write (and groups:write for private channels) on the user token" };
    return { error: slackWhy(wrong) };
  }
}

async function slackFileOut(id, whole) {
  const found = slackFiles.get(String(id || ""));
  if (!found) return { error: "that file is not in any thread the hive read" };
  const token = await tokenForSlack();
  if (!token) return { error: "no SLACK_USER_TOKEN in the hub .env" };
  const want = whole ? found.url : (found.thumb || found.url);
  if (!/^https:\/\/files\.slack\.com\//.test(String(want))) return { error: "that file does not live on slack" };
  const r = await fetch(want, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return { error: `slack answered ${r.status}` };
  return { ok: true, kind: r.headers.get("content-type") || found.kind || "application/octet-stream", bytes: Buffer.from(await r.arrayBuffer()) };
}

export {
  SLACK_LINK,
  threadKey,
  threadCache,
  storeSessionThreads,
  collectThreads,
  readThreadRegistry,
  writeThreadRegistry,
  replyOnSlack,
  reactOnSlack,
  markOnSlack,
  slackFileOut,
  facesOnSlack,
  nameFromEmail
};
