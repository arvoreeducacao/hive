import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanRoutine, cleanTime, dueRoutines, editRoutine, missedRoutine, newRoutine, nextRunAt, parseCron, readRoutines, recordRun, scheduleSay, seatNameFor, spawnBodyOf, writeRoutines, RUNS_KEPT } from "../lib/routines.mjs";

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const tuesday = local(2026, 9, 1, 10, 17);

test("a routine needs a name, a prompt and a trigger it knows", () => {
  assert.match(cleanRoutine({ prompt: "x", trigger: "daily" }).error, /name/);
  assert.match(cleanRoutine({ name: "x", trigger: "daily" }).error, /what the chat should do/);
  assert.match(cleanRoutine({ name: "x", prompt: "y", trigger: "sometimes" }).error, /pick when/);
  assert.match(cleanRoutine({ name: "x", prompt: "y", trigger: "daily", time: "25:00" }).error, /HH:MM/);
  assert.match(cleanRoutine({ name: "x", prompt: "y", trigger: "cron", cron: "* *" }).error, /five fields/);
  const ok = cleanRoutine({ name: "  Weekday   triage ", prompt: " triage the issues ", trigger: "weekdays", time: "9:05", where: "cloud", precheck: "gh issue list -q .[0]", agent: "codex" });
  assert.deepEqual(ok, {
    name: "Weekday triage", prompt: "triage the issues", trigger: "weekdays", time: "09:05", cron: "", weekday: 0, where: "cloud",
    precheck: "gh issue list -q .[0]", repo: "", model: "", agent: "codex", structured: true, enabled: true
  });
  assert.equal(cleanTime("7:3"), "");
  assert.equal(cleanTime("07:30"), "07:30");
});

test("a cron line is read field by field, with steps, ranges and lists", () => {
  const cron = parseCron("*/15 9-17 * * 1-5");
  assert.deepEqual([...cron.minute], [0, 15, 30, 45]);
  assert.deepEqual([...cron.hour], [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual([...cron.weekday], [1, 2, 3, 4, 5]);
  assert.equal(parseCron("0 9 * * 7").weekday.has(0), true, "7 is sunday too");
  assert.equal(parseCron("60 * * * *"), null);
  assert.equal(parseCron("a b c d e"), null);
  assert.equal(parseCron("0 18 * * 1,3,5").weekday.size, 3);
});

test("the next run of each trigger lands where a person would expect", () => {
  assert.equal(nextRunAt({ trigger: "hourly" }, tuesday), local(2026, 9, 1, 11, 0));
  assert.equal(nextRunAt({ trigger: "daily", time: "09:00" }, tuesday), local(2026, 9, 2, 9, 0), "09:00 already went by today");
  assert.equal(nextRunAt({ trigger: "daily", time: "18:30" }, tuesday), local(2026, 9, 1, 18, 30));
  const friday = local(2026, 9, 4, 18, 0);
  assert.equal(nextRunAt({ trigger: "weekdays", time: "09:00" }, friday), local(2026, 9, 7, 9, 0), "friday evening skips the weekend");
  assert.equal(nextRunAt({ trigger: "weekly", time: "09:00", weekday: 1 }, tuesday), local(2026, 9, 7, 9, 0));
  assert.equal(nextRunAt({ trigger: "cron", cron: "0 18 * * 1-5" }, tuesday), local(2026, 9, 1, 18, 0));
  assert.equal(nextRunAt({ trigger: "cron", cron: "30 8 * * 0" }, tuesday), local(2026, 9, 6, 8, 30));
  assert.equal(nextRunAt({ trigger: "cron", cron: "0 12 1 * *" }, tuesday), local(2026, 9, 1, 12, 0), "the first of the month is today, and noon is still ahead");
  assert.equal(nextRunAt({ trigger: "cron", cron: "0 12 1 * *" }, local(2026, 9, 1, 13, 0)), local(2026, 10, 1, 12, 0));
  assert.equal(nextRunAt({ trigger: "cron", cron: "nope" }, tuesday), 0);
});

test("the schedule reads as words", () => {
  assert.equal(scheduleSay({ trigger: "hourly" }), "every hour, on the hour");
  assert.equal(scheduleSay({ trigger: "weekdays", time: "09:00" }), "weekdays at 09:00");
  assert.equal(scheduleSay({ trigger: "weekly", time: "08:00", weekday: 5 }), "every friday at 08:00");
  assert.equal(scheduleSay({ trigger: "cron", cron: "0 18 * * 1-5" }), "cron 0 18 * * 1-5");
});

test("a routine is born with its next run, runs when due, and moves on after a run", () => {
  const clean = cleanRoutine({ name: "Nightly status", prompt: "summarize today", trigger: "daily", time: "18:00" });
  const born = newRoutine(clean, { id: "r1", now: tuesday });
  assert.equal(born.nextAt, local(2026, 9, 1, 18, 0));
  assert.deepEqual(born.runs, []);

  assert.deepEqual(dueRoutines([born], local(2026, 9, 1, 17, 59)), []);
  assert.deepEqual(dueRoutines([born], local(2026, 9, 1, 18, 0)).map((one) => one.id), ["r1"]);
  assert.deepEqual(dueRoutines([{ ...born, enabled: false }], local(2026, 9, 1, 18, 0)), [], "a routine turned off never runs");

  assert.equal(missedRoutine(born, local(2026, 9, 1, 18, 20)), false);
  assert.equal(missedRoutine(born, local(2026, 9, 1, 19, 0)), true, "half an hour late is a missed run, not a late one");

  const ran = recordRun(born, { outcome: "ran", seat: "nightly-status-1800" }, { now: local(2026, 9, 1, 18, 0) });
  assert.equal(ran.nextAt, local(2026, 9, 2, 18, 0));
  assert.equal(ran.runs[0].outcome, "ran");
  assert.equal(ran.lastRunAt, local(2026, 9, 1, 18, 0));

  const many = Array.from({ length: RUNS_KEPT + 5 }, () => ({ outcome: "skipped" })).reduce((one, run) => recordRun(one, run, { now: tuesday }), born);
  assert.equal(many.runs.length, RUNS_KEPT);

  const edited = editRoutine(ran, cleanRoutine({ ...clean, time: "20:00" }), { now: local(2026, 9, 1, 18, 5) });
  assert.equal(edited.nextAt, local(2026, 9, 1, 20, 0));
  assert.equal(edited.runs.length, 1, "editing keeps the history");
});

test("the chat a routine opens is named after it with the clock, and carries the routine as its errand", () => {
  const routine = { id: "r1", name: "Nightly status", prompt: "summarize today", where: "cloud", repo: "hive", agent: "codex", structured: true };
  assert.equal(seatNameFor(routine, local(2026, 9, 1, 18, 5)), "nightly-status-1805");
  assert.deepEqual(spawnBodyOf(routine, local(2026, 9, 1, 18, 5)), {
    prompt: "summarize today", name: "nightly-status-1805", title: "Nightly status", errand: "Nightly status",
    where: "cloud", repo: "hive", model: "", agent: "codex", structured: true, routine: "r1"
  });
});

test("the routines file round-trips and an empty or broken one reads as no routines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hive-routines-"));
  assert.deepEqual(readRoutines(dir), []);
  writeRoutines(dir, [{ id: "r1", name: "x" }, { broken: true }]);
  assert.deepEqual(readRoutines(dir), [{ id: "r1", name: "x" }]);
  await rm(dir, { recursive: true, force: true });
});

test("a routine runs on any agent the hive opens, and the form offers the same list", async () => {
  const { readFileSync } = await import("node:fs");
  const { ROUTINE_AGENTS } = await import("../lib/routines.mjs");
  assert.deepEqual(ROUTINE_AGENTS, ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]);
  for (const agent of ROUTINE_AGENTS) assert.equal(cleanRoutine({ name: "n", prompt: "p", trigger: "hourly", agent }).agent, agent, `${agent} was downgraded to claude`);
  assert.equal(cleanRoutine({ name: "n", prompt: "p", trigger: "hourly", agent: "pi" }).agent, "claude");
  const view = readFileSync(new URL("../src/app/routines.js", import.meta.url), "utf8");
  assert.match(view, /const ROUTINE_AGENTS = \["claude", "codex", "kimi", "kiro", "cursor", "opencode"\];/, "the form offers a different list than the server accepts");
});
