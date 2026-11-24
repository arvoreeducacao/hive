import { open, stat } from "node:fs/promises";
import { join } from "node:path";

const SEAT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const CHUNK = 1 << 20;
const MESSAGES_KEPT = 4000;
const TEXT_KEPT = 4000;
const SNIPPET_ROOM = 72;
const WORD_MIN = 2;
const MARKS = /\p{M}/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;

function foldChar(char) {
  const folded = char.normalize("NFD").replace(MARKS, "").toLowerCase();
  if (folded.length === char.length) return folded;
  const lowered = char.toLowerCase();
  return lowered.length === char.length ? lowered : char;
}

export function foldText(text) {
  let out = "";
  for (const char of String(text ?? "")) out += foldChar(char);
  return out;
}

export function queryWords(query) {
  const words = [...new Set(foldText(String(query ?? "")).split(/\s+/).filter(Boolean))];
  const long = words.filter((word) => word.length >= WORD_MIN);
  return long.length ? long : [];
}

const textOf = (content) => (Array.isArray(content)
  ? content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n")
  : typeof content === "string" ? content : "");

export function messageOf(event) {
  if (!event || typeof event !== "object") return null;
  if (event.type === "user" && event.subtype === "say") {
    const text = textOf(event.message?.content);
    return text.trim() ? { role: "user", text: text.slice(0, TEXT_KEPT), at: event.ts || "", uuid: event.uuid || "" } : null;
  }
  if (event.type === "assistant" && !event.parent_tool_use_id) {
    const text = textOf(event.message?.content);
    return text.trim() ? { role: "assistant", text: text.slice(0, TEXT_KEPT), at: event.ts || "", uuid: event.uuid || "" } : null;
  }
  return null;
}

export function snippetAround(text, at, room = SNIPPET_ROOM) {
  const flat = String(text ?? "");
  const from = Math.max(0, at - room / 2);
  const start = from > 0 ? (flat.lastIndexOf(" ", from) + 1 || from) : 0;
  const end = Math.min(flat.length, start + room * 2);
  const stop = end < flat.length ? flat.lastIndexOf(" ", end) : end;
  const body = flat.slice(start, stop > start ? stop : end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "… " : ""}${body}${end < flat.length ? " …" : ""}`;
}

const startsWord = (text, at) => at === 0 || !WORD_CHAR.test(text[at - 1]);

export function matchMessage(text, words) {
  if (!words.length) return null;
  const folded = foldText(text);
  let first = -1;
  let starts = 0;
  for (const word of words) {
    const at = folded.indexOf(word);
    if (at < 0) return null;
    if (startsWord(folded, at)) starts += 1;
    if (first < 0 || at < first) first = at;
  }
  return { first, quality: 0.5 + starts / words.length / 2 };
}

export function createMessageSearch({ eventsDir }) {
  const kept = new Map();

  async function messagesOf(name) {
    const file = join(eventsDir, `${name}.ndjson`);
    let info;
    try { info = await stat(file); } catch { kept.delete(name); return []; }
    let held = kept.get(name);
    if (!held || info.size < held.offset || info.ino !== held.ino) held = { ino: info.ino, offset: 0, rest: "", messages: [] };
    if (info.size > held.offset) {
      const handle = await open(file, "r");
      try {
        const buffer = Buffer.alloc(CHUNK);
        while (held.offset < info.size) {
          const { bytesRead } = await handle.read(buffer, 0, Math.min(CHUNK, info.size - held.offset), held.offset);
          if (!bytesRead) break;
          held.offset += bytesRead;
          const lines = (held.rest + buffer.subarray(0, bytesRead).toString("utf8")).split("\n");
          held.rest = lines.pop() || "";
          for (const line of lines) {
            if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue;
            let event;
            try { event = JSON.parse(line); } catch { continue; }
            const message = messageOf(event);
            if (message) held.messages.push(message);
          }
          if (held.messages.length > MESSAGES_KEPT) held.messages.splice(0, held.messages.length - MESSAGES_KEPT);
        }
      } finally { await handle.close(); }
    }
    kept.set(name, held);
    return held.messages;
  }

  async function search(names, query, { limit = 8 } = {}) {
    const asked = new Set(names.filter((name) => SEAT_NAME.test(name)));
    for (const name of kept.keys()) if (!asked.has(name)) kept.delete(name);
    const words = queryWords(query);
    if (!words.length) return [];
    const found = [];
    for (const name of asked) {
      const messages = await messagesOf(name);
      let hits = 0;
      let best = null;
      for (let at = messages.length - 1; at >= 0; at -= 1) {
        const one = messages[at];
        const match = matchMessage(one.text, words);
        if (!match) continue;
        hits += 1;
        if (!best || match.quality > best.match.quality) best = { one, match };
      }
      if (!best) continue;
      found.push({
        name,
        role: best.one.role,
        at: best.one.at,
        uuid: best.one.uuid,
        snippet: snippetAround(best.one.text, best.match.first),
        text: best.one.text.slice(0, 600),
        hits,
        quality: best.match.quality
      });
    }
    return found
      .sort((a, b) => b.quality - a.quality || (1 + Math.log2(1 + b.hits)) - (1 + Math.log2(1 + a.hits)) || String(b.at).localeCompare(String(a.at)))
      .slice(0, limit);
  }

  return { search, forget: (name) => kept.delete(name), held: () => [...kept.keys()] };
}
