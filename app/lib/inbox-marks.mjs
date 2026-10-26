import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MARKS_KEPT = 1000;
export const UNMARKED_KEPT_MS = 7 * 24 * 3600 * 1000;
export const MARK_FIELDS = ["pinnedAt", "snoozeUntil", "wokeAt", "settledAt", "stayActive", "unread"];

export const marksFile = (home) => join(home, "inbox-marks.json");

const held = new Map();

const KEY_CEILING = 200;

function cleanMark(raw) {
  if (!raw || typeof raw !== "object") return null;
  const mark = {};
  for (const field of MARK_FIELDS) {
    const value = raw[field];
    if (value === true) mark[field] = true;
    else if (typeof value === "number" && value > 0) mark[field] = value;
  }
  mark.at = Number(raw.at) || 0;
  return mark;
}

const flagged = (mark) => Object.keys(mark).some((field) => field !== "at");

function load(home) {
  const file = marksFile(home);
  if (held.has(file)) return held.get(file);
  const kept = {};
  if (existsSync(file)) {
    try {
      const read = JSON.parse(readFileSync(file, "utf8"));
      for (const [key, one] of Object.entries(read?.marks && typeof read.marks === "object" ? read.marks : {})) {
        const mark = cleanMark(one);
        if (mark) kept[key] = mark;
      }
    } catch {}
  }
  held.set(file, kept);
  return kept;
}

function keep(home, kept, now) {
  const file = marksFile(home);
  for (const [key, mark] of Object.entries(kept)) if (!flagged(mark) && now - mark.at > UNMARKED_KEPT_MS) delete kept[key];
  const keys = Object.keys(kept);
  if (keys.length > MARKS_KEPT) {
    for (const key of keys.sort((a, b) => kept[a].at - kept[b].at).slice(0, keys.length - MARKS_KEPT)) delete kept[key];
  }
  held.set(file, kept);
  try {
    mkdirSync(dirname(file), { recursive: true });
    const step = `${file}.${process.pid}.tmp`;
    writeFileSync(step, JSON.stringify({ marks: kept }, null, 2));
    renameSync(step, file);
  } catch {}
  return kept;
}

export function readMarks(home) {
  return Object.fromEntries(Object.entries(load(home)).map(([key, mark]) => [key, { ...mark }]));
}

export function keepMarks(home, changes, { now = Date.now(), moving = false } = {}) {
  const kept = load(home);
  const taken = [];
  for (const [key, raw] of Object.entries(changes && typeof changes === "object" ? changes : {})) {
    if (!key || key.length > KEY_CEILING) continue;
    const mark = cleanMark(raw);
    if (!mark) continue;
    if (moving) {
      if (kept[key] || !flagged(mark)) continue;
      mark.at = now;
    } else {
      if (!mark.at) mark.at = now;
      if (kept[key] && mark.at < kept[key].at) continue;
    }
    kept[key] = mark;
    taken.push(key);
  }
  if (taken.length) keep(home, kept, now);
  return { taken, marks: readMarks(home) };
}

export function forgetMarksCache() {
  held.clear();
}
