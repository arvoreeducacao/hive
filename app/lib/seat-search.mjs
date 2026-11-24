import { open } from "node:fs/promises";
import { join } from "node:path";
import { foldText, holdsEvery, wordsOf } from "../assets/archive-search.mjs";

export const TAIL_BYTES = 2 * 1024 * 1024;
export const SEARCH_BYTES = 48 * 1024 * 1024;
export const SNIPPET = 90;
export const SEATS_MAX = 200;

const SEAT_NAME = /^[A-Za-z0-9][\w.-]*$/;

export const searchableName = (name) => SEAT_NAME.test(String(name || "")) && !String(name).includes("..");

async function tailOf(file, bytes = TAIL_BYTES) {
  let handle = null;
  try {
    handle = await open(file, "r");
    const size = (await handle.stat()).size;
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle?.close().catch(() => {});
  }
}

function textOf(event) {
  if (event?.type !== "user" && event?.type !== "assistant") return null;
  const content = event.message?.content;
  const parts = typeof content === "string" ? [content] : Array.isArray(content) ? content.filter((one) => one?.type === "text").map((one) => one.text) : [];
  const text = parts.join("\n").trim();
  if (!text || (event.type === "user" && event.subtype !== "say")) return null;
  return { who: event.type === "user" ? "you" : "agent", text };
}

export function snippetAround(text, words, width = SNIPPET) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  const at = foldText(flat).indexOf(words[0] || "");
  if (at < 0 || flat.length <= width) return flat.slice(0, width);
  const start = Math.max(0, at - Math.floor(width / 3));
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + width).trim()}${start + width < flat.length ? "…" : ""}`;
}

export function findInSeat(raw, words) {
  const lines = String(raw || "").split("\n");
  for (let at = lines.length - 1; at >= 0; at--) {
    let event;
    try { event = JSON.parse(lines[at]); } catch { continue; }
    const said = textOf(event);
    if (said && holdsEvery(said.text, words)) return { who: said.who, text: snippetAround(said.text, words) };
  }
  return null;
}

export async function searchSeats({ eventsDir, names, asked, read = tailOf, budget = SEARCH_BYTES }) {
  const words = wordsOf(asked);
  if (!words.length || !words.some((word) => word.length >= 3)) return [];
  const found = [];
  let left = budget;
  for (const name of names.filter(searchableName).slice(0, SEATS_MAX)) {
    if (left <= 0) break;
    const raw = String(await read(join(eventsDir, `${name}.ndjson`), Math.min(TAIL_BYTES, left)) || "");
    left -= Buffer.byteLength(raw);
    const hit = findInSeat(raw, words);
    if (hit) found.push({ name, ...hit });
  }
  return found;
}
