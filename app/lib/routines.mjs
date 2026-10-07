import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { slug } from "./naming.mjs";

export const TRIGGERS = ["hourly", "daily", "weekdays", "weekly", "cron"];
export const ROUTINE_NAME_MAX = 60;
export const PROMPT_MAX = 8000;
export const PRECHECK_MAX = 600;
export const RUNS_KEPT = 20;
export const MISSED_GRACE_MS = 30 * 60 * 1000;
const CRON_SCAN_MINUTES = 60 * 24 * 60;
const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const routinesFile = (home) => join(home, "routines.json");

export function readRoutines(home) {
  try {
    if (!existsSync(routinesFile(home))) return [];
    const said = JSON.parse(readFileSync(routinesFile(home), "utf8"));
    return Array.isArray(said) ? said.filter((one) => one && one.id) : [];
  } catch { return []; }
}

export function writeRoutines(home, list) {
  mkdirSync(dirname(routinesFile(home)), { recursive: true });
  writeFileSync(routinesFile(home), `${JSON.stringify(list, null, 2)}\n`);
}

const oneLine = (text, max) => String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

export function cleanTime(text) {
  const m = String(text || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function cronField(text, low, high) {
  const out = new Set();
  for (const part of String(text).split(",")) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!m) return null;
    const step = m[3] ? Number(m[3]) : 1;
    if (!step) return null;
    let from = m[1] === "*" ? low : Number(m[1]);
    let to = m[1] === "*" ? high : (m[2] !== undefined ? Number(m[2]) : from);
    if (m[1] === "*" && m[2] !== undefined) return null;
    if (from < low || to > high || from > to) return null;
    for (let n = from; n <= to; n += step) out.add(n);
  }
  return out;
}

export function parseCron(text) {
  const parts = String(text || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minute = cronField(parts[0], 0, 59);
  const hour = cronField(parts[1], 0, 23);
  const day = cronField(parts[2], 1, 31);
  const month = cronField(parts[3], 1, 12);
  const weekday = cronField(parts[4].replace(/\b7\b/g, "0"), 0, 6);
  if (!minute || !hour || !day || !month || !weekday) return null;
  return { minute, hour, day, month, weekday, dayStar: parts[2] === "*", weekdayStar: parts[4] === "*" };
}

export const ROUTINE_AGENTS = ["claude", "codex", "kimi", "kiro", "cursor", "opencode"];

export function cleanRoutine(body = {}) {
  const name = oneLine(body.name, ROUTINE_NAME_MAX);
  const prompt = String(body.prompt || "").trim().slice(0, PROMPT_MAX);
  const trigger = TRIGGERS.includes(body.trigger) ? body.trigger : "";
  if (!name) return { error: "give the routine a name — it is what the chat will be called" };
  if (!prompt) return { error: "write what the chat should do when it opens" };
  if (!trigger) return { error: "pick when it runs: hourly, daily, weekdays, weekly or a cron line" };
  const time = trigger === "hourly" ? "" : cleanTime(body.time || "09:00");
  if (trigger !== "hourly" && trigger !== "cron" && !time) return { error: "the time reads HH:MM, like 09:00" };
  const cron = trigger === "cron" ? String(body.cron || "").trim() : "";
  if (trigger === "cron" && !parseCron(cron)) return { error: "a cron line is five fields: minute hour day month weekday" };
  const weekday = trigger === "weekly" ? Math.min(6, Math.max(0, Math.floor(Number(body.weekday ?? 1)) || 0)) : 0;
  const where = body.where === "cloud" ? "cloud" : "local";
  const agent = ROUTINE_AGENTS.includes(body.agent) ? body.agent : "claude";
  return {
    name, prompt, trigger, time, cron, weekday, where,
    precheck: String(body.precheck || "").trim().slice(0, PRECHECK_MAX),
    repo: oneLine(body.repo, 120),
    model: oneLine(body.model, 80),
    agent,
    structured: body.structured !== false,
    enabled: body.enabled !== false
  };
}

const atClock = (date, time) => {
  const [h, m] = time.split(":").map(Number);
  const out = new Date(date);
  out.setHours(h, m, 0, 0);
  return out;
};

export function nextRunAt(routine, from = Date.now()) {
  const start = new Date(from);
  if (routine.trigger === "hourly") {
    const next = new Date(start);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.getTime();
  }
  if (routine.trigger === "cron") {
    const cron = parseCron(routine.cron);
    if (!cron) return 0;
    const cursor = new Date(start);
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);
    for (let i = 0; i < CRON_SCAN_MINUTES; i++) {
      const dayOk = cron.dayStar && cron.weekdayStar ? true
        : cron.dayStar ? cron.weekday.has(cursor.getDay())
          : cron.weekdayStar ? cron.day.has(cursor.getDate())
            : cron.day.has(cursor.getDate()) || cron.weekday.has(cursor.getDay());
      if (cron.month.has(cursor.getMonth() + 1) && dayOk && cron.hour.has(cursor.getHours()) && cron.minute.has(cursor.getMinutes())) return cursor.getTime();
      cursor.setMinutes(cursor.getMinutes() + 1);
    }
    return 0;
  }
  const time = cleanTime(routine.time) || "09:00";
  for (let d = 0; d < 8; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const at = atClock(day, time);
    if (at.getTime() <= start.getTime()) continue;
    if (routine.trigger === "weekdays" && (at.getDay() === 0 || at.getDay() === 6)) continue;
    if (routine.trigger === "weekly" && at.getDay() !== (routine.weekday ?? 1)) continue;
    return at.getTime();
  }
  return 0;
}

export function scheduleSay(routine) {
  const time = routine.time || "";
  if (routine.trigger === "hourly") return "every hour, on the hour";
  if (routine.trigger === "daily") return `every day at ${time}`;
  if (routine.trigger === "weekdays") return `weekdays at ${time}`;
  if (routine.trigger === "weekly") return `every ${WEEKDAY_NAMES[routine.weekday ?? 1]} at ${time}`;
  if (routine.trigger === "cron") return `cron ${routine.cron}`;
  return "";
}

export function newRoutine(clean, { id, now }) {
  return { id, ...clean, createdAt: now, updatedAt: now, nextAt: nextRunAt(clean, now), runs: [] };
}

export function editRoutine(routine, clean, { now }) {
  const next = { ...routine, ...clean, updatedAt: now };
  next.nextAt = nextRunAt(next, now);
  return next;
}

export function dueRoutines(list, now = Date.now()) {
  return (list || []).filter((one) => one.enabled && one.nextAt && one.nextAt <= now);
}

export function missedRoutine(routine, now = Date.now()) {
  return !!routine.nextAt && now - routine.nextAt > MISSED_GRACE_MS;
}

export function recordRun(routine, run, { now }) {
  const runs = [{ at: now, ...run }, ...(routine.runs || [])].slice(0, RUNS_KEPT);
  return { ...routine, runs, lastRunAt: now, nextAt: nextRunAt(routine, now) };
}

export function seatNameFor(routine, now = Date.now()) {
  const stamp = new Date(now);
  const clock = `${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}`;
  return `${slug(routine.name).slice(0, 28) || "routine"}-${clock}`;
}

export function spawnBodyOf(routine, now = Date.now()) {
  return {
    prompt: routine.prompt,
    name: seatNameFor(routine, now),
    title: routine.name,
    errand: routine.name,
    where: routine.where || "local",
    repo: routine.repo || "",
    model: routine.model || "",
    agent: routine.agent || "claude",
    structured: routine.structured !== false,
    routine: routine.id
  };
}
