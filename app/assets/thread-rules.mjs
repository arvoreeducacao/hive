const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SNOOZE_UNITS = { minutes: MINUTE, hours: HOUR, days: DAY };
export const SNOOZE_DAYS = ["today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const SNOOZE_OPTIONS_MAX = 8;
export const IDLE_DAYS_CHOICES = [0, 1, 2, 3, 7, 14, 30];
export const SETTLE_COMMAND_MAX = 400;

export const SNOOZE_OPTIONS_DEFAULT = [
  { in: 1, unit: "hours" },
  { day: "today", at: "18:00" },
  { day: "tomorrow", at: "09:00" },
  { day: "monday", at: "09:00" }
];

export const THREADS_DEFAULT = {
  autoSettleIdleDays: 7,
  autoSettleMerged: true,
  keepWithOpenPr: false,
  wakeEarly: true,
  workingSection: true,
  groupByProject: false,
  listClick: "main",
  snoozeOptions: SNOOZE_OPTIONS_DEFAULT,
  stopServersOnSettle: false,
  settleCommands: {}
};

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const REPO = /^[\w.-]{1,100}$/;

export function cleanSnoozeOption(raw) {
  if (!isPlain(raw)) return null;
  if (raw.in !== undefined) {
    const amount = Number(raw.in);
    if (!Number.isInteger(amount) || amount < 1 || amount > 999 || !SNOOZE_UNITS[raw.unit]) return null;
    return { in: amount, unit: raw.unit };
  }
  if (!SNOOZE_DAYS.includes(raw.day) || !CLOCK.test(String(raw.at || ""))) return null;
  return { day: raw.day, at: raw.at };
}

function cleanSettleCommands(raw, where, problems) {
  const commands = {};
  for (const [repo, command] of Object.entries(raw)) {
    const said = typeof command === "string" ? command.trim() : "";
    if (!REPO.test(repo) || !said || said.length > SETTLE_COMMAND_MAX || said.includes("\n")) problems.push(`${where}: threads.settleCommands.${repo} should be one line of shell`);
    else commands[repo] = said;
  }
  return commands;
}

export function cleanThreads(raw, where = "config", problems = [], { partial = false } = {}) {
  const threads = partial ? {} : { ...THREADS_DEFAULT, snoozeOptions: [...SNOOZE_OPTIONS_DEFAULT], settleCommands: {} };
  if (raw === undefined) return threads;
  if (!isPlain(raw)) {
    problems.push(`${where}: threads should be an object`);
    return threads;
  }
  if (raw.autoSettleIdleDays !== undefined) {
    if (IDLE_DAYS_CHOICES.includes(raw.autoSettleIdleDays)) threads.autoSettleIdleDays = raw.autoSettleIdleDays;
    else problems.push(`${where}: threads.autoSettleIdleDays should be one of ${IDLE_DAYS_CHOICES.join(", ")}`);
  }
  for (const flag of ["autoSettleMerged", "keepWithOpenPr", "wakeEarly", "workingSection", "groupByProject", "stopServersOnSettle"]) {
    if (raw[flag] === undefined) continue;
    if (typeof raw[flag] === "boolean") threads[flag] = raw[flag];
    else problems.push(`${where}: threads.${flag} should be true or false`);
  }
  if (raw.listClick !== undefined) {
    if (raw.listClick === "main" || raw.listClick === "beside") threads.listClick = raw.listClick;
    else problems.push(`${where}: threads.listClick should be main or beside`);
  }
  if (raw.snoozeOptions !== undefined) {
    if (!Array.isArray(raw.snoozeOptions)) problems.push(`${where}: threads.snoozeOptions should be a list`);
    else {
      const kept = raw.snoozeOptions.map(cleanSnoozeOption);
      if (kept.some((one) => !one)) problems.push(`${where}: threads.snoozeOptions holds an option that is neither { in, unit } nor { day, at }`);
      threads.snoozeOptions = kept.filter(Boolean).slice(0, SNOOZE_OPTIONS_MAX);
    }
  }
  if (raw.settleCommands !== undefined) {
    if (!isPlain(raw.settleCommands)) problems.push(`${where}: threads.settleCommands should be an object of repo -> command`);
    else threads.settleCommands = cleanSettleCommands(raw.settleCommands, where, problems);
  }
  return threads;
}

function atClock(base, days, at) {
  const [hours, minutes] = at.split(":").map(Number);
  const when = new Date(base);
  when.setDate(when.getDate() + days);
  when.setHours(hours, minutes, 0, 0);
  return when;
}

function daysUntil(day, now) {
  if (day === "today") return 0;
  if (day === "tomorrow") return 1;
  const ahead = (WEEKDAYS.indexOf(day) - now.getDay() + 7) % 7;
  return ahead || 7;
}

export function snoozeUntil(option, now = new Date()) {
  if (option.in !== undefined) return now.getTime() + option.in * SNOOZE_UNITS[option.unit];
  return atClock(now, daysUntil(option.day, now), option.at).getTime();
}

export function snoozeChoices(options = SNOOZE_OPTIONS_DEFAULT, now = new Date()) {
  return options
    .map(cleanSnoozeOption)
    .filter(Boolean)
    .map((option, index) => ({ ...option, id: `o${index}`, until: snoozeUntil(option, now) }))
    .filter((one) => one.until > now.getTime())
    .sort((a, b) => a.until - b.until);
}

const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function customSnoozeUntil(input, now = new Date()) {
  let wake;
  if (input.mode === "duration") {
    const amount = Number(input.amount);
    if (input.amount === "" || !Number.isFinite(amount) || amount <= 0 || !SNOOZE_UNITS[input.unit]) return null;
    wake = new Date(now.getTime() + amount * SNOOZE_UNITS[input.unit]);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || "") || !/^\d{2}:\d{2}$/.test(input.time || "")) return null;
    wake = new Date(`${input.date}T${input.time}:00`);
    if (localDate(wake) !== input.date || localTime(wake) !== input.time) return null;
  }
  return Number.isFinite(wake.getTime()) && wake.getTime() > now.getTime() ? wake.getTime() : null;
}

export const NEEDS_STATES = new Set(["needs"]);
export const BACK_STATES = new Set(["answered", "done"]);
export const BUSY_STATES = new Set(["working", "stalled", "spawning"]);

export function sectionOf(mark = {}, now = Date.now()) {
  if (mark.snoozeUntil && mark.snoozeUntil > now) return "snoozed";
  if (mark.settledAt) return "settled";
  if (mark.pinnedAt) return "pinned";
  return "active";
}

const settledByRule = (mark, now) => {
  mark.settledAt = now;
  mark.autoSettled = true;
  delete mark.pinnedAt;
  delete mark.wokeAt;
  delete mark.wokeEarly;
  delete mark.unread;
};

function autoSettles(seat, mark, rules, now) {
  if (mark.neverSettles || mark.settledAt || (mark.snoozeUntil && mark.snoozeUntil > now)) return false;
  if (!seat.session || NEEDS_STATES.has(seat.state) || BACK_STATES.has(seat.state) || BUSY_STATES.has(seat.state) || seat.live) return false;
  const prs = seat.prs || [];
  if (rules.autoSettleMerged && !mark.stayActive && prs.length && prs.every((pr) => pr.state === "merged")) return true;
  if (!rules.autoSettleIdleDays) return false;
  if (rules.keepWithOpenPr && prs.some((pr) => pr.state === "open" || pr.state === "draft")) return false;
  const since = Math.max(seat.stamp || 0, Number(mark.stayActive) || 0);
  return since > 0 && now - since >= rules.autoSettleIdleDays * DAY;
}

export function sweepMarks(marks, seats, rules = THREADS_DEFAULT, now = Date.now()) {
  const changed = [];
  for (const seat of seats) {
    const mark = marks[seat.key] || {};
    let moved = false;
    if (mark.snoozeUntil && mark.snoozeUntil <= now) {
      delete mark.snoozeUntil;
      delete mark.snoozedAt;
      mark.wokeAt = now;
      moved = true;
    } else if (mark.snoozeUntil && rules.wakeEarly && (NEEDS_STATES.has(seat.state) || seat.failed) && (seat.stamp || 0) > (mark.snoozedAt || mark.at || 0)) {
      delete mark.snoozeUntil;
      delete mark.snoozedAt;
      mark.wokeAt = now;
      mark.wokeEarly = true;
      moved = true;
    }
    if (mark.settledAt && (NEEDS_STATES.has(seat.state) || BACK_STATES.has(seat.state)) && (seat.stamp || 0) > mark.settledAt) {
      delete mark.settledAt;
      delete mark.autoSettled;
      moved = true;
    }
    if (autoSettles(seat, mark, rules, now)) {
      settledByRule(mark, now);
      moved = true;
    }
    if (!moved) continue;
    mark.at = now;
    marks[seat.key] = mark;
    changed.push(seat.key);
  }
  return changed;
}
