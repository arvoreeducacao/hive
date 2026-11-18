import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PARK_FILE = "parked.json";
export const PARK_MIN_MS = 5 * 60 * 1000;
export const PARK_MAX_MS = 30 * 24 * 60 * 60 * 1000;
export const PARK_CHECK_EVERY_MS = 60 * 60 * 1000;
export const PARK_CHECK_TIMEOUT_MS = 60 * 1000;
export const PARK_TASK_MAX = 600;
export const PARK_WHY_MAX = 300;
export const PARK_CHECK_MAX = 600;

const SEAT_NAME = /^[a-z0-9][a-z0-9_-]{0,79}$/;

const oneLine = (raw, max) => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function keptPark(one) {
  if (!one || typeof one !== "object" || !Number.isFinite(one.until)) return null;
  const task = oneLine(one.task, PARK_TASK_MAX);
  if (!task) return null;
  return {
    until: one.until,
    task,
    why: oneLine(one.why, PARK_WHY_MAX),
    check: String(one.check || "").trim().slice(0, PARK_CHECK_MAX),
    at: Number.isFinite(one.at) ? one.at : 0,
    checkedAt: Number.isFinite(one.checkedAt) ? one.checkedAt : 0
  };
}

export function readParked(home) {
  let raw;
  try { raw = JSON.parse(readFileSync(join(home, PARK_FILE), "utf8")); } catch { return {}; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const parks = {};
  for (const [name, one] of Object.entries(raw)) {
    const park = SEAT_NAME.test(name) ? keptPark(one) : null;
    if (park) parks[name] = park;
  }
  return parks;
}

export function writeParked(home, parks) {
  mkdirSync(home, { recursive: true });
  const file = join(home, PARK_FILE);
  writeFileSync(`${file}.tmp`, JSON.stringify(parks, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function untilOf(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  const said = String(raw ?? "").trim();
  if (!said) return NaN;
  return Date.parse(said);
}

export function cleanPark(body = {}, now = Date.now()) {
  const until = untilOf(body.until);
  if (!Number.isFinite(until)) return { error: "until needs a date and time, like 2026-11-19T10:00:00-03:00" };
  if (until - now < PARK_MIN_MS) return { error: "until is less than 5 minutes away — wait inside this turn instead of parking" };
  if (until - now > PARK_MAX_MS) return { error: "until is more than 30 days away — pick a nearer date, or leave it as a task for the person" };
  const task = oneLine(body.task, PARK_TASK_MAX);
  if (!task) return { error: "say what you will do when you wake — that line is what wakes you" };
  return {
    park: {
      until,
      task,
      why: oneLine(body.why, PARK_WHY_MAX),
      check: String(body.check || "").trim().slice(0, PARK_CHECK_MAX),
      at: now,
      checkedAt: 0
    }
  };
}

export function dueParks(parks, now = Date.now()) {
  return Object.entries(parks || {}).filter(([, one]) => one.until <= now).map(([name]) => name);
}

export function checksDue(parks, now = Date.now()) {
  return Object.entries(parks || {})
    .filter(([, one]) => one.check && one.until > now && now - Math.max(one.checkedAt || 0, one.at || 0) >= PARK_CHECK_EVERY_MS)
    .map(([name]) => name);
}

export function wakeText(park, how, when) {
  const reason = how === "check"
    ? ` before ${when}, because the check you left passed (${park.check})`
    : how === "person" ? `, because the person woke you before ${when}` : ` — it is ${when}, the time you parked yourself until`;
  const why = park.why ? `\nWhy you waited: ${park.why}` : "";
  return `[hive] You were parked and the hive woke you${reason}.\nWhat you said you would do: ${park.task}${why}\nDo it now. This chat stays off the person's screen while you work and comes back to it when your turn ends, so end with what they need to know.`;
}

export function parkedOf(park) {
  if (!park) return null;
  return { until: park.until, task: park.task, why: park.why, check: !!park.check, at: park.at };
}

export function withParks(sessions, parks) {
  return (sessions || []).map((seat) => {
    const park = seat.where === "local" ? parks?.[seat.name] : null;
    return park ? { ...seat, parked: parkedOf(park) } : seat;
  });
}
