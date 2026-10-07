import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FAILURE_IGNORED_FOR = 7 * 24 * 60 * 60 * 1000;

export const ignoredFile = (home) => join(home, "doctor-ignored.json");

function load(home) {
  const file = ignoredFile(home);
  if (!existsSync(file)) return {};
  try {
    const read = JSON.parse(readFileSync(file, "utf8"));
    const kept = {};
    for (const [id, until] of Object.entries(read?.ignored && typeof read.ignored === "object" ? read.ignored : {})) {
      if (typeof id === "string" && id && Number.isFinite(until) && until >= 0) kept[id] = until;
    }
    return kept;
  } catch {
    return {};
  }
}

function keep(home, ignored) {
  const file = ignoredFile(home);
  mkdirSync(dirname(file), { recursive: true });
  const step = `${file}.${process.pid}.tmp`;
  writeFileSync(step, JSON.stringify({ ignored }, null, 2));
  renameSync(step, file);
}

const stillOn = (until, now) => until === 0 || until > now;

export function readIgnored(home, now = Date.now()) {
  return Object.fromEntries(Object.entries(load(home)).filter(([, until]) => stillOn(until, now)));
}

export function ignoreCheck(home, ids, state, now = Date.now()) {
  const until = state === "fail" ? now + FAILURE_IGNORED_FOR : 0;
  const ignored = readIgnored(home, now);
  for (const id of ids) ignored[id] = until;
  keep(home, ignored);
  return ignored;
}

export function forgetIgnored(home, ids, now = Date.now()) {
  const ignored = readIgnored(home, now);
  for (const id of ids) delete ignored[id];
  keep(home, ignored);
  return ignored;
}
