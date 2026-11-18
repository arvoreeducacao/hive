import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PARK_CHECK_EVERY_MS, PARK_FILE, checksDue, cleanPark, dueParks, readParked, wakeText, withParks, writeParked } from "../lib/parked.mjs";
import { createParkDomain } from "../routes/parked.mjs";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-17T16:00:00-03:00");

const home = () => mkdtempSync(join(tmpdir(), "hive-parked-"));

test("a park needs a date between five minutes and thirty days away, and a task", () => {
  assert.match(cleanPark({ task: "measure" }, NOW).error, /date and time/);
  assert.match(cleanPark({ until: "tomorrow", task: "measure" }, NOW).error, /date and time/);
  assert.match(cleanPark({ until: NOW + 60 * 1000, task: "measure" }, NOW).error, /less than 5 minutes/);
  assert.match(cleanPark({ until: NOW + 31 * 24 * HOUR, task: "measure" }, NOW).error, /more than 30 days/);
  assert.match(cleanPark({ until: "2026-11-19T10:00:00-03:00", task: "   " }, NOW).error, /what you will do/);
  const { park } = cleanPark({ until: "2026-11-19T10:00:00-03:00", task: "  measure the\n old path  ", why: "only six hours of logs", check: " gh pr view 1 " }, NOW);
  assert.deepEqual(park, { until: Date.parse("2026-11-19T13:00:00Z"), task: "measure the old path", why: "only six hours of logs", check: "gh pr view 1", at: NOW, checkedAt: 0 });
});

test("the parked file keeps only well-formed parks of real seat names", () => {
  const dir = home();
  try {
    assert.deepEqual(readParked(dir), {});
    writeFileSync(join(dir, PARK_FILE), JSON.stringify({ ok: { until: NOW, task: "go", at: 1 }, "../x": { until: NOW, task: "go" }, empty: { until: NOW, task: "" }, nodate: { task: "go" } }));
    assert.deepEqual(Object.keys(readParked(dir)), ["ok"]);
    writeFileSync(join(dir, PARK_FILE), "not json");
    assert.deepEqual(readParked(dir), {});
    writeParked(dir, { a: { until: NOW, task: "go", why: "", check: "", at: NOW, checkedAt: 0 } });
    assert.equal(readParked(dir).a.task, "go");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a park is due at its date, and its check is due once an hour before that", () => {
  const parks = {
    late: { until: NOW - 1, task: "a", check: "", at: NOW - 2 * HOUR, checkedAt: 0 },
    soon: { until: NOW + HOUR, task: "b", check: "true", at: NOW - 2 * HOUR, checkedAt: NOW - 10 * 60 * 1000 },
    fresh: { until: NOW + HOUR, task: "c", check: "true", at: NOW - PARK_CHECK_EVERY_MS, checkedAt: 0 },
    quiet: { until: NOW + HOUR, task: "d", check: "", at: 0, checkedAt: 0 }
  };
  assert.deepEqual(dueParks(parks, NOW), ["late"]);
  assert.deepEqual(checksDue(parks, NOW), ["fresh"]);
});

test("the wake-up hands the chat its own task, the reason it waited and how it woke", () => {
  const park = { task: "measure the old path", why: "only six hours of logs", check: "gh pr view 1" };
  const byTime = wakeText(park, "time", "Thu 19 Nov 10:00");
  assert.match(byTime, /^\[hive\] You were parked/);
  assert.match(byTime, /Thu 19 Nov 10:00, the time you parked yourself until/);
  assert.match(byTime, /What you said you would do: measure the old path/);
  assert.match(byTime, /Why you waited: only six hours of logs/);
  assert.match(wakeText(park, "check", "x"), /the check you left passed \(gh pr view 1\)/);
  assert.match(wakeText(park, "person", "x"), /the person woke you/);
});

test("only a local seat carries its park into the session list, without the check line itself", () => {
  const parks = { a: { until: 5, task: "t", why: "w", check: "secret-ish line", at: 1, checkedAt: 0 } };
  const out = withParks([{ name: "a", where: "local" }, { name: "a", where: "cloud" }, { name: "b", where: "local" }], parks);
  assert.deepEqual(out[0].parked, { until: 5, task: "t", why: "w", check: true, at: 1 });
  assert.equal(out[1].parked, undefined);
  assert.equal(out[2].parked, undefined);
});

function domainFor(dir, over = {}) {
  const said = [];
  const checks = [];
  let clock = NOW;
  const seats = over.seats || [{ name: "a", where: "local" }];
  const domain = createParkDomain({
    home: dir,
    deliverSay: async (name, from, text, spoken) => { said.push({ name, spoken }); return over.deliver || { ok: true }; },
    liveSessions: async () => seats,
    knownSeats: () => over.known || [],
    checkRun: async (line) => { checks.push(line); return { ok: over.checkPasses === true }; },
    now: () => clock
  });
  return { domain, said, checks, at: (ms) => { clock = ms; } };
}

test("a parked chat wakes at its date with its task, and the park is gone after", async () => {
  const dir = home();
  try {
    const { domain, said, at } = domainFor(dir);
    const parked = await domain.park("a", { until: NOW + 2 * HOUR, task: "measure" });
    assert.ok(parked.park);
    assert.deepEqual(await domain.tick(NOW + HOUR), []);
    assert.equal(said.length, 0);
    at(NOW + 2 * HOUR);
    assert.deepEqual(await domain.tick(NOW + 2 * HOUR), [{ name: "a", how: "time" }]);
    assert.equal(said[0].name, "a");
    assert.match(said[0].spoken, /What you said you would do: measure/);
    assert.deepEqual(readParked(dir), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a chat that is down at its date keeps its park and wakes once it is back", async () => {
  const dir = home();
  try {
    const seats = [{ name: "a", where: "local" }];
    const { domain, said } = domainFor(dir, { seats, known: ["a"] });
    await domain.park("a", { until: NOW + HOUR, task: "measure" });
    seats.splice(0);
    assert.deepEqual(await domain.tick(NOW + 3 * HOUR), []);
    assert.ok(readParked(dir).a, "the fleet still knows it, so the park waits for it");
    seats.push({ name: "a", where: "local" });
    assert.deepEqual(await domain.tick(NOW + 4 * HOUR), [{ name: "a", how: "time" }]);
    assert.equal(said.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a park whose chat was closed for good is dropped", async () => {
  const dir = home();
  try {
    const seats = [{ name: "a", where: "local" }];
    const { domain } = domainFor(dir, { seats, known: [] });
    await domain.park("a", { until: NOW + HOUR, task: "measure" });
    seats.splice(0);
    await domain.tick(NOW + 10 * 60 * 1000);
    assert.deepEqual(readParked(dir), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a passing check wakes the chat early, and a failing one waits an hour before it runs again", async () => {
  const dir = home();
  try {
    const failing = domainFor(dir);
    await failing.domain.park("a", { until: NOW + 10 * HOUR, task: "ship", check: "gh pr view 7 --json state" });
    assert.deepEqual(await failing.domain.tick(NOW + HOUR), []);
    assert.deepEqual(failing.checks, ["gh pr view 7 --json state"]);
    assert.equal(readParked(dir).a.checkedAt, NOW + HOUR);
    await failing.domain.tick(NOW + HOUR + 30 * 60 * 1000);
    assert.equal(failing.checks.length, 1, "the check runs once an hour, not every tick");
    const passing = domainFor(dir, { checkPasses: true });
    assert.deepEqual(await passing.domain.tick(NOW + 2 * HOUR), [{ name: "a", how: "check" }]);
    assert.match(passing.said[0].spoken, /the check you left passed/);
    assert.deepEqual(readParked(dir), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the person can wake a parked chat now or let it go, and a cloud or missing chat cannot park", async () => {
  const dir = home();
  try {
    const { domain, said } = domainFor(dir, { seats: [{ name: "a", where: "local" }, { name: "c", where: "cloud" }] });
    assert.match((await domain.park("nobody", { until: NOW + HOUR, task: "x" })).error, /not alive/);
    assert.match((await domain.park("c", { until: NOW + HOUR, task: "x" })).error, /only a chat on this machine/);
    await domain.park("a", { until: NOW + HOUR, task: "measure" });
    assert.deepEqual(await domain.wake("a", "person"), { ok: true });
    assert.match(said[0].spoken, /the person woke you/);
    await domain.park("a", { until: NOW + HOUR, task: "measure" });
    assert.deepEqual(domain.unpark("a"), { ok: true });
    assert.deepEqual(readParked(dir), {});
    assert.match(domain.unpark("a").error, /not parked/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a wake-up the chat does not take leaves the park in place for the next tick", async () => {
  const dir = home();
  try {
    const { domain } = domainFor(dir, { deliver: { ok: false, error: "no bridge" } });
    await domain.park("a", { until: NOW + HOUR, task: "measure" });
    assert.deepEqual(await domain.tick(NOW + 2 * HOUR), []);
    assert.ok(readParked(dir).a);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
