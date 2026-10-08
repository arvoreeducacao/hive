import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { actionOf, fixOutcome, readReport } from "../doctor/doctor-core.mjs";
import { fixArgv } from "../doctor/fix-shell.mjs";
import { AWS_PROFILE } from "./env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DOCTOR = process.env.HIVE_DOCTOR || join(HERE, "../doctor/doctor.mjs");

export const FRESH_FOR = 15000;
export const DIAGNOSIS_TIMEOUT = 30000;
export const FIX_TIMEOUT = 180000;
export const INVESTIGATION_LIMIT = 8000;
export const HEAL_RETRY_AFTER = 30 * 60 * 1000;

let cache = { at: 0, report: null, running: null };
const healTries = new Map();

function call(cmd, args, timeout) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 << 20, env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE || AWS_PROFILE } },
      (err, stdout, stderr) => resolve({ ok: !err, out: stdout || "", raw: String(stderr || ""), err: err ? String(stderr || err.message || "").trim() : "" }));
  });
}

export async function readDoctor(force) {
  if (!force && cache.report && Date.now() - cache.at < FRESH_FOR) return withAutomatic(cache.report);
  if (cache.running) return cache.running;
  cache.running = (async () => {
    try {
      const report = await healAfter(await diagnoseNow());
      cache = { at: Date.now(), report, running: null };
      return withAutomatic(report);
    } catch (e) {
      cache = { ...cache, running: null };
      const detail = e.message;
      if (cache.report) return { ...withAutomatic(cache.report), error: detail };
      return { dev: "", pod: "", generatedAt: new Date().toISOString(), items: [], automatic: [], error: detail };
    }
  })();
  return cache.running;
}

async function diagnoseNow() {
  const r = await call(process.execPath, [DOCTOR, "--json"], DIAGNOSIS_TIMEOUT);
  try {
    return readReport(r.out);
  } catch (e) {
    throw new Error(r.err.split("\n").filter(Boolean).pop() || e.message);
  }
}

function healsItself(item) {
  if (item.state !== "warn" || !item.fix?.heals || actionOf(item) !== "fix") return false;
  const tried = healTries.get(item.id);
  return !tried || Date.now() - tried >= HEAL_RETRY_AFTER;
}

async function healAfter(report) {
  const due = report.items.filter(healsItself);
  if (!due.length) return { ...report, healed: [] };
  const ran = [];
  for (const item of due) {
    healTries.set(item.id, Date.now());
    const r = await runFix(item);
    ran.push({ id: item.id, label: item.fix.label, ok: r.ok, error: r.ok ? "" : r.err.split("\n").filter(Boolean).pop() || `${item.fix.label} failed` });
  }
  const after = await diagnoseNow();
  const healed = ran.map((attempt) => {
    if (!attempt.ok) return attempt;
    const outcome = fixOutcome(attempt.id, after);
    if (outcome.ok) healTries.delete(attempt.id);
    return outcome.ok ? attempt : { ...attempt, ok: false, error: outcome.note };
  });
  return { ...after, healed };
}

let onTheServer = null;

export function runFixesOnTheServer(run) {
  onTheServer = run;
}

async function overTheDoor(script) {
  const r = await onTheServer(script);
  return { ok: !!r.ok, out: r.out || "", raw: r.err || "", err: r.ok ? "" : String(r.error || r.err || "the server would not run it").trim() };
}

function runFix(item) {
  if (item.fix.podScript && onTheServer) return overTheDoor(item.fix.podScript);
  const how = fixArgv(item.fix);
  if (how.error) return Promise.resolve({ ok: false, out: "", raw: "", err: how.error });
  return call(how.exe, how.args, FIX_TIMEOUT);
}

function withKind(item) {
  if (!item?.fix) return item;
  return { ...item, fix: { ...item.fix, kind: actionOf(item) } };
}

function withAutomatic(report) {
  const items = report.items.map(withKind);
  return { ...report, items, automatic: items.filter((item) => item.fix && item.fix.kind !== "copy").map((item) => item.id) };
}

export async function applyFix(id) {
  const report = await readDoctor(false);
  const item = report.items.find((i) => i.id === id);
  if (!item || !item.fix) {
    const outcome = fixOutcome(id, await readDoctor(true));
    if (outcome.ok) return { ok: true, id, label: item?.title || id, output: "already resolved on re-check" };
    return { error: item ? "that check has no fix" : "I do not know that check", id };
  }
  const kind = item.fix.kind;
  if (kind === "copy") return { error: `that fix needs you at the keyboard: ${item.fix.command}`, id, kind, command: item.fix.command };
  const how = item.fix.podScript && onTheServer ? {} : fixArgv(item.fix);
  if (how.error) return { error: how.error, id, kind };
  const r = await runFix(item);
  if (!r.ok) return { error: r.err.split("\n").filter(Boolean).pop() || `${item.fix.label} failed`, id, kind };
  if (kind === "investigate") {
    return {
      ok: true, id, kind, label: item.fix.label,
      output: (r.out || r.raw).slice(0, INVESTIGATION_LIMIT),
      state: item.state, detail: item.detail
    };
  }
  cache.at = 0;
  const outcome = fixOutcome(id, await readDoctor(true));
  if (!outcome.ok) return { error: outcome.note, id, kind };
  return { ok: true, id, kind, label: item.fix.label, output: r.out.split("\n").filter(Boolean).slice(-2).join(" ") };
}

export function invalidateDoctor() {
  cache.at = 0;
}
