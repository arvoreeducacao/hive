import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DRAFT_CEILING = 20000;
export const DRAFTS_KEPT = 300;

export const draftsFile = (home) => join(home, "drafts.json");

const held = new Map();

const clean = (text) => String(text ?? "").slice(0, DRAFT_CEILING);

const IMAGES_KEPT = 16;
const QUOTES_KEPT = 20;
const FILES_KEPT = 100;

const cleanImages = (list) => (Array.isArray(list) ? list : [])
  .filter((one) => Array.isArray(one) && Number(one[0]) > 0 && typeof one[1] === "string" && one[1])
  .slice(0, IMAGES_KEPT)
  .map(([n, path]) => [Number(n), path]);

const cleanQuotes = (list) => (Array.isArray(list) ? list : [])
  .filter((one) => one && typeof one.said === "string" && one.said.trim())
  .slice(0, QUOTES_KEPT)
  .map((one) => ({ said: clean(one.said), kind: String(one.kind || "").slice(0, 200), comment: clean(one.comment) }));

const cleanFiles = (list) => (Array.isArray(list) ? list : [])
  .filter((one) => Array.isArray(one) && Number(one[0]) > 0 && typeof one[1]?.path === "string" && one[1].path)
  .slice(0, FILES_KEPT)
  .map(([n, file]) => [Number(n), { path: file.path, name: String(file.name || "").slice(0, 300), size: Number(file.size) || 0, type: String(file.type || "").slice(0, 120) }]);

function draftEntry(text, at, extras = {}) {
  const entry = { text: clean(text), at };
  const images = cleanImages(extras.images);
  const quotes = cleanQuotes(extras.quotes);
  const files = cleanFiles(extras.files);
  if (images.length) entry.images = images;
  if (quotes.length) entry.quotes = quotes;
  if (files.length) entry.files = files;
  return entry;
}

const isEmpty = (entry) => !entry.text && !entry.images && !entry.quotes && !entry.files;

const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function load(home) {
  const file = draftsFile(home);
  if (held.has(file)) return held.get(file);
  let kept = {};
  if (existsSync(file)) {
    try {
      const read = JSON.parse(readFileSync(file, "utf8"));
      for (const [seat, one] of Object.entries(read?.drafts && typeof read.drafts === "object" ? read.drafts : {})) {
        const entry = draftEntry(one?.text, Number(one?.at) || 0, one || {});
        if (!isEmpty(entry)) kept[seat] = entry;
      }
    } catch {}
  }
  held.set(file, kept);
  return kept;
}

function keep(home, kept) {
  const file = draftsFile(home);
  held.set(file, kept);
  const seats = Object.keys(kept);
  if (seats.length > DRAFTS_KEPT) {
    for (const seat of seats.sort((a, b) => (kept[a].at || 0) - (kept[b].at || 0)).slice(0, seats.length - DRAFTS_KEPT)) delete kept[seat];
  }
  try {
    mkdirSync(dirname(file), { recursive: true });
    const step = `${file}.${process.pid}.tmp`;
    writeFileSync(step, JSON.stringify({ drafts: kept }, null, 2));
    renameSync(step, file);
  } catch {}
  return kept;
}

export function readDrafts(home) {
  return { ...load(home) };
}

export function draftOf(home, seat) {
  return load(home)[seat] || null;
}

export function keepDraft(home, seat, text, at = Date.now(), extras = {}) {
  const kept = load(home);
  const when = Number(at) || Date.now();
  const entry = draftEntry(text, when, extras);
  const had = kept[seat];
  if (had && when < had.at) return { draft: had, older: true };
  if (isEmpty(entry)) {
    if (!had) return { draft: null };
    delete kept[seat];
    keep(home, kept);
    return { draft: null };
  }
  if (had && sameDraft(had, entry)) return { draft: had };
  kept[seat] = entry;
  keep(home, kept);
  return { draft: kept[seat] };
}

export function dropGoneDrafts(home, alive) {
  const kept = load(home);
  const gone = Object.keys(kept).filter((seat) => !alive.has(seat));
  if (!gone.length) return 0;
  for (const seat of gone) delete kept[seat];
  keep(home, kept);
  return gone.length;
}

export function forgetDraftCache() {
  held.clear();
}
