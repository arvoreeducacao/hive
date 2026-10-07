import { open, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sayTextOf } from "./own-history.mjs";

export const DIARY_DAYS_DEFAULT = 30;
export const DIARY_DAYS_OFF = 0;
export const DIARY_DAYS_RANGE = [1, 365];

const DAY_MS = 24 * 60 * 60 * 1000;
const SYNCED_SESSION = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(?:\.part-0001)?$/;
const FIRST_SAY_WINDOW = 262144;
const REBUILT_FROM_TRANSCRIPT = new Set(["claude"]);
const REBUILT_FROM_OWN_HISTORY = new Set(["codex"]);

export function cleanDiaryDays(raw, where, problems) {
  if (raw === undefined || raw === null || raw === "") return DIARY_DAYS_DEFAULT;
  if (raw === DIARY_DAYS_OFF || raw === false) return DIARY_DAYS_OFF;
  const [low, high] = DIARY_DAYS_RANGE;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= low && raw <= high) return raw;
  problems.push(`${where}: pruneDiariesAfterDays should be 0 to never prune, or a whole number of days from ${low} to ${high}`);
  return DIARY_DAYS_DEFAULT;
}

export function syncedSessionIds(listing) {
  const ids = new Set();
  for (const line of String(listing || "").split("\n")) {
    const found = SYNCED_SESSION.exec(line.trim());
    if (found) ids.add(found[1]);
  }
  return ids;
}

export const agentOf = (meta) => String(meta?.agent || "claude");

export function diariesToPrune({ diaries, open: openSeats, metaOf, synced, days, now }) {
  if (!days) return [];
  const cutoff = now - days * DAY_MS;
  return (diaries || []).filter(({ name, touchedAt }) => {
    if (openSeats.has(name)) return false;
    if (!(Number.isFinite(touchedAt) && touchedAt > 0 && touchedAt < cutoff)) return false;
    const meta = metaOf(name);
    if (!meta) return false;
    const agent = agentOf(meta);
    if (REBUILT_FROM_OWN_HISTORY.has(agent)) return true;
    return REBUILT_FROM_TRANSCRIPT.has(agent) && synced.has(String(meta.session_id || ""));
  });
}

async function firstSayIn(diary) {
  let file;
  try { file = await open(diary, "r"); } catch { return ""; }
  try {
    const held = Buffer.alloc(FIRST_SAY_WINDOW);
    const { bytesRead } = await file.read(held, 0, FIRST_SAY_WINDOW, 0);
    const line = held.subarray(0, bytesRead).toString("utf8").split("\n").find((one) => one.includes(`"type":"user"`));
    return line ? sayTextOf(line) : "";
  } catch {
    return "";
  } finally {
    await file.close();
  }
}

export async function readDiaries(eventsDir) {
  let names = [];
  try { names = await readdir(eventsDir); } catch { return []; }
  const diaries = [];
  for (const file of names.filter((one) => one.endsWith(".ndjson"))) {
    try {
      diaries.push({ name: file.slice(0, -".ndjson".length), touchedAt: (await stat(join(eventsDir, file))).mtimeMs });
    } catch {}
  }
  return diaries;
}

export async function readSeatMeta(sessionsDir, name) {
  try { return JSON.parse(await readFile(join(sessionsDir, `${name}.json`), "utf8")); } catch { return null; }
}

export async function pruneDiary({ eventsDir, sessionsDir, name, meta, touchedAt }) {
  const diary = join(eventsDir, `${name}.ndjson`);
  if (agentOf(meta) !== "claude") {
    const said = meta.said || await firstSayIn(diary);
    const kept = { ...meta, updated: meta.updated || new Date(touchedAt).toISOString(), ...(said ? { said } : {}) };
    await writeFile(join(sessionsDir, `${name}.json`), JSON.stringify(kept, null, 2));
  }
  await unlink(diary);
}
