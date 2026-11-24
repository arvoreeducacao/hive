import { test } from "node:test";
import assert from "node:assert/strict";
import { SNOOZE_OPTIONS_DEFAULT, THREADS_DEFAULT, cleanThreads, customSnoozeUntil, sectionOf, snoozeChoices, snoozeUntil, sweepMarks } from "../assets/thread-rules.mjs";

const DAY = 24 * 3600000;

test("a chat is snoozed until its time, then settled, then pinned, else active", () => {
  const now = 1000;
  assert.equal(sectionOf({ snoozeUntil: 2000, pinnedAt: 1 }, now), "snoozed");
  assert.equal(sectionOf({ snoozeUntil: 500 }, now), "active");
  assert.equal(sectionOf({ settledAt: 1, pinnedAt: 1 }, now), "settled");
  assert.equal(sectionOf({ pinnedAt: 1 }, now), "pinned");
  assert.equal(sectionOf(undefined, now), "active");
});

test("the rules come with the defaults, and a patch carries only what it changes", () => {
  assert.deepEqual(cleanThreads(undefined), { ...THREADS_DEFAULT, snoozeOptions: SNOOZE_OPTIONS_DEFAULT, settleCommands: {} });
  assert.deepEqual(cleanThreads({ wakeEarly: false }, "patch", [], { partial: true }), { wakeEarly: false });
  const problems = [];
  const said = cleanThreads({ autoSettleIdleDays: 5, keepWithOpenPr: "yes", snoozeOptions: [{ in: 2, unit: "hours" }, { day: "someday", at: "9" }], settleCommands: { "oms-web": "rm -rf .next", "../x": "ls", api: "a\nb" } }, "cfg", problems);
  assert.equal(said.autoSettleIdleDays, THREADS_DEFAULT.autoSettleIdleDays, "only the offered day counts are taken");
  assert.equal(said.keepWithOpenPr, false);
  assert.deepEqual(said.snoozeOptions, [{ in: 2, unit: "hours" }]);
  assert.deepEqual(said.settleCommands, { "oms-web": "rm -rf .next" }, "a repo name with a path or a command with a new line is refused");
  assert.equal(problems.length, 5);
});

test("the snooze menu lists its options soonest first and hides a today option whose time passed", () => {
  const wednesday = new Date(2026, 10, 18, 14, 0);
  const choices = snoozeChoices(SNOOZE_OPTIONS_DEFAULT, wednesday);
  assert.deepEqual(choices.map((one) => one.until), [
    new Date(2026, 10, 18, 15, 0).getTime(),
    new Date(2026, 10, 18, 18, 0).getTime(),
    new Date(2026, 10, 19, 9, 0).getTime(),
    new Date(2026, 10, 23, 9, 0).getTime()
  ]);
  const evening = new Date(2026, 10, 18, 19, 0);
  assert.equal(snoozeChoices(SNOOZE_OPTIONS_DEFAULT, evening).some((one) => one.day === "today"), false);
  const monday = new Date(2026, 10, 23, 8, 0);
  assert.equal(snoozeUntil({ day: "monday", at: "09:00" }, monday), new Date(2026, 10, 30, 9, 0).getTime(), "a weekday means the next one after today");
});

test("a custom snooze takes a date and time in the future, or a positive duration", () => {
  const now = new Date(2026, 9, 21, 14, 0);
  assert.equal(customSnoozeUntil({ mode: "duration", amount: "2", unit: "hours" }, now), now.getTime() + 2 * 3600000);
  assert.equal(customSnoozeUntil({ mode: "duration", amount: "1.5", unit: "days" }, now), now.getTime() + 36 * 3600000);
  for (const amount of ["0", "-1", "", "abc"]) assert.equal(customSnoozeUntil({ mode: "duration", amount, unit: "hours" }, now), null, amount);
  assert.equal(customSnoozeUntil({ mode: "date", date: "2026-10-23", time: "08:15" }, now), new Date(2026, 9, 23, 8, 15).getTime());
  assert.equal(customSnoozeUntil({ mode: "date", date: "2026-10-21", time: "13:59" }, now), null, "the past is refused");
  assert.equal(customSnoozeUntil({ mode: "date", date: "2026-02-30", time: "10:00" }, now), null, "a date that rolls over is refused");
});

const seat = (key, extra = {}) => ({ key, session: true, state: "idle", stamp: 0, prs: [], ...extra });

test("a snooze that ran out wakes the chat, and a new answer from a settled chat brings it back", () => {
  const marks = { a: { snoozeUntil: 900, snoozedAt: 100, at: 1 }, b: { settledAt: 4000, at: 1 } };
  const changed = sweepMarks(marks, [seat("a"), seat("b", { state: "needs", stamp: 5000 })], { ...THREADS_DEFAULT, autoSettleIdleDays: 0 }, 1000);
  assert.deepEqual(changed, ["a", "b"]);
  assert.deepEqual(marks, { a: { wokeAt: 1000, at: 1000 }, b: { at: 1000 } }, "each change carries its moment, so a stale copy cannot undo it");
});

test("a snoozed chat comes back early only for something new that needs you", () => {
  const rules = { ...THREADS_DEFAULT, autoSettleIdleDays: 0 };
  const marks = { old: { snoozeUntil: 9000, snoozedAt: 500, at: 500 }, fresh: { snoozeUntil: 9000, snoozedAt: 500, at: 500 }, broke: { snoozeUntil: 9000, snoozedAt: 500, at: 500 } };
  const seats = [seat("old", { state: "needs", stamp: 400 }), seat("fresh", { state: "needs", stamp: 600 }), seat("broke", { failed: true, stamp: 700 })];
  assert.deepEqual(sweepMarks(marks, seats, rules, 1000), ["fresh", "broke"]);
  assert.ok(marks.old.snoozeUntil, "the question it was snoozed with waits for the wake time");
  assert.deepEqual(marks.fresh, { wokeAt: 1000, wokeEarly: true, at: 1000 });
  const off = { late: { snoozeUntil: 9000, snoozedAt: 500, at: 500 } };
  assert.deepEqual(sweepMarks(off, [seat("late", { state: "needs", stamp: 600 })], { ...rules, wakeEarly: false }, 1000), []);
});

test("a chat settles on its own when its PRs all merged or it sat idle for the days set, and never while it is busy or waiting", () => {
  const now = 30 * DAY;
  const marks = {};
  const seats = [
    seat("merged", { stamp: now - DAY, prs: [{ state: "merged" }, { state: "merged" }] }),
    seat("half", { stamp: now - DAY, prs: [{ state: "merged" }, { state: "open" }] }),
    seat("idle", { stamp: now - 8 * DAY }),
    seat("recent", { stamp: now - 2 * DAY }),
    seat("asks", { state: "needs", stamp: now - 9 * DAY }),
    seat("answered", { state: "answered", stamp: now - 9 * DAY, prs: [{ state: "merged" }] }),
    seat("busy", { state: "working", stamp: now - 9 * DAY }),
    seat("running", { stamp: now - 9 * DAY, live: true })
  ];
  assert.deepEqual(sweepMarks(marks, seats, THREADS_DEFAULT, now), ["merged", "idle"]);
  assert.deepEqual(marks.merged, { settledAt: now, autoSettled: true, at: now });
});

test("an open PR holds a chat only when asked, Never keeps it out, and giving a chat back resets its idle clock", () => {
  const now = 30 * DAY;
  const openPr = { "held": {} };
  assert.deepEqual(sweepMarks(openPr, [seat("held", { stamp: now - 9 * DAY, prs: [{ state: "open" }] })], { ...THREADS_DEFAULT, keepWithOpenPr: true }, now), []);
  const never = { kept: { neverSettles: true, at: 1 } };
  assert.deepEqual(sweepMarks(never, [seat("kept", { stamp: now - 9 * DAY, prs: [{ state: "merged" }] })], THREADS_DEFAULT, now), []);
  const back = { reopened: { stayActive: now - DAY, at: now - DAY } };
  const seats = [seat("reopened", { stamp: now - 9 * DAY, prs: [{ state: "merged" }] })];
  assert.deepEqual(sweepMarks(back, seats, THREADS_DEFAULT, now), [], "a merged PR does not settle a chat given back, and its idle days count from then");
  assert.deepEqual(sweepMarks(back, seats, THREADS_DEFAULT, now + 7 * DAY), ["reopened"]);
});
