import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DRAFT_CEILING = 20000;
export const DRAFTS_KEPT = 300;

export const draftsFile = (home) => join(home, "drafts.json");

const held = new Map();

const clean = (text) => String(text ?? "").slice(0, DRAFT_CEILING);

function load(home) {
  const file = draftsFile(home);
  if (held.has(file)) return held.get(file);
  let kept = {};
  if (existsSync(file)) {
    try {
      const read = JSON.parse(readFileSync(file, "utf8"));
      for (const [seat, one] of Object.entries(read?.drafts && typeof read.drafts === "object" ? read.drafts : {})) {
        const text = clean(one?.text);
        const at = Number(one?.at) || 0;
        if (text) kept[seat] = { text, at };
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

export function keepDraft(home, seat, text, at = Date.now()) {
  const kept = load(home);
  const said = clean(text);
  const when = Number(at) || Date.now();
  const had = kept[seat];
  if (had && when < had.at) return { draft: had, older: true };
  if (!said) {
    if (!had) return { draft: null };
    delete kept[seat];
    keep(home, kept);
    return { draft: null };
  }
  if (had && had.text === said && had.at === when) return { draft: had };
  kept[seat] = { text: said, at: when };
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
