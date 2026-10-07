const SEAT_NAME = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const isSeatName = (name) => SEAT_NAME.test(String(name || ""));

/* codex and kiro name a session with a uuid, kimi with `session_<uuid>` — one shell word either way */
export const OWN_SESSION_ID = /^[A-Za-z0-9._-]{8,80}$/;

export const OWN_HISTORY_AGENT = /^(codex|kimi|kiro|cursor|opencode)$/;

const HIVE_SESSION_BLOCK = /==J==([^\n]+)\n([\s\S]*?)\n==JT==([^\n]*)\n==JP==([^\n]*)\n+==\/J==/g;

const textOfContent = (content) => String(typeof content === "string" ? content
  : Array.isArray(content) ? content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "").trim();

export function sayTextOf(line) {
  let event;
  try { event = JSON.parse(String(line || "")); } catch { return ""; }
  return textOfContent(event?.message?.content).replace(/^\[hive\][^\n]*\n+/, "").slice(0, 600);
}

/* the other agents keep no transcript under ~/.claude: what they leave behind is the record
   their driver writes in the hive's sessions folder, plus the events file. That is enough for
   a row — the id the agent named, the folder, the title, the first thing the person said. */
export function hiveSessionRow(name, meta, stamp, firstSay, where) {
  const agent = String(meta?.agent || "");
  const id = String(meta?.session_id || "");
  if (!OWN_HISTORY_AGENT.test(agent) || !OWN_SESSION_ID.test(id) || !isSeatName(name)) return null;
  const at = Number(stamp) * 1000 || Date.parse(meta.updated || "") || 0;
  if (!at) return null;
  const prompt = sayTextOf(firstSay) || String(meta.said || "");
  const cwd = String(meta.cwd || "");
  const title = String(meta.title || "").trim() || prompt.slice(0, 90) || cwd.split("/").pop() || name;
  return { id, where, at, cwd, prompt, title, seat: name, agent, model: String(meta.model || ""), ...(meta.title ? { custom: String(meta.title) } : {}) };
}

export function parseHiveSessions(raw, where, into = []) {
  for (const found of String(raw || "").matchAll(HIVE_SESSION_BLOCK)) {
    const [, name, body, stamp, firstSay] = found;
    let meta;
    try { meta = JSON.parse(body); } catch { continue; }
    const row = hiveSessionRow(name, meta, stamp, firstSay, where);
    if (row) into.push(row);
  }
  return into;
}

export function hiveEventMessages(raw, cap = 40) {
  const out = [];
  for (const line of String(raw || "").split("\n")) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== "user" && event.type !== "assistant") continue;
    const text = textOfContent(event.message?.content);
    if (!text) continue;
    const before = out[out.length - 1];
    if (before && before.role === event.type) {
      before.text = `${before.text}\n${text}`.slice(0, 4000);
      continue;
    }
    out.push({ role: event.type, text: text.slice(0, 4000), at: event.ts || "" });
  }
  return out.slice(-cap);
}
