import test from "node:test";
import assert from "node:assert/strict";
import { cleanQuietDays, seatsGoneQuiet, quietReason, QUIET_DAYS_OFF } from "../lib/quiet-seats.mjs";
import { cleanPatch } from "../lib/config.mjs";
import { archiveEntry, seatFromArchive } from "../lib/fleet.mjs";
import { app, state, views } from "./dom.mjs";

await state();
await views();
const { $ } = await app("core");
const { adoptQuietDays, quietDays, setQuietDays } = await app("pure-helpers");
await app("themes");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 12);

const sent = [];
globalThis.fetch = async (path, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : null;
  sent.push({ path, body });
  return { ok: true, json: async () => ({ config: body?.config || {} }) };
};

const seat = (name, more = {}) => ({ name, where: "local", id: "11111111-2222-3333-4444-555555555555", ...more });

const quietFor = (lastActive, { sessions = [], days = 7, held } = {}) => seatsGoneQuiet({
  seats: Object.keys(lastActive).map((name) => seat(name)),
  sessions,
  lastActiveAt: (one) => lastActive[one.name],
  days,
  now: NOW,
  held
}).map((one) => one.name);

test("an empty or zero setting means chats are never closed", () => {
  const problems = [];
  assert.equal(cleanQuietDays(undefined, "file", problems), QUIET_DAYS_OFF);
  assert.equal(cleanQuietDays(0, "file", problems), QUIET_DAYS_OFF);
  assert.equal(cleanQuietDays("", "file", problems), QUIET_DAYS_OFF);
  assert.deepEqual(problems, []);
});

test("a whole number of days from 1 to 90 is kept and anything else is refused out loud", () => {
  const problems = [];
  assert.equal(cleanQuietDays(7, "file", problems), 7);
  assert.equal(cleanQuietDays(90, "file", problems), 90);
  assert.equal(cleanQuietDays(91, "file", problems), QUIET_DAYS_OFF);
  assert.equal(cleanQuietDays(2.5, "file", problems), QUIET_DAYS_OFF);
  assert.equal(cleanQuietDays("7", "file", problems), QUIET_DAYS_OFF);
  assert.equal(problems.length, 3);
});

test("the settings patch carries the number of days through to the file", () => {
  assert.deepEqual(cleanPatch({ closeQuietAfterDays: 14 }), { clean: { closeQuietAfterDays: 14 }, problems: [] });
  assert.equal(cleanPatch({ closeQuietAfterDays: -1 }).problems.length, 1);
});

test("with the setting off nothing is closed, however old the chat", () => {
  assert.deepEqual(quietFor({ old: NOW - 400 * DAY }, { days: 0 }), []);
});

test("only chats quiet for longer than the setting are closed", () => {
  assert.deepEqual(quietFor({ stale: NOW - 8 * DAY, fresh: NOW - 2 * DAY }), ["stale"]);
});

test("a chat that is working, waiting for an answer or running a task in the background stays open", () => {
  const sessions = [
    { name: "working", where: "local", state: "working" },
    { name: "asking", where: "local", state: "needs" },
    { name: "background", where: "local", state: "idle", live: [{ id: "t1" }] },
    { name: "idle", where: "local", state: "idle", live: [] }
  ];
  const lastActive = Object.fromEntries(sessions.map((one) => [one.name, NOW - 30 * DAY]));
  assert.deepEqual(quietFor(lastActive, { sessions }), ["idle"]);
});

test("a chat whose last activity cannot be read is left alone", () => {
  assert.deepEqual(quietFor({ unknown: 0, broken: Number.NaN }), []);
});

test("a chat being opened or closed right now is left alone", () => {
  assert.deepEqual(quietFor({ closing: NOW - 30 * DAY, other: NOW - 30 * DAY }, { held: new Set(["closing"]) }), ["other"]);
});

test("cloud chats are never closed from this machine", () => {
  const closed = seatsGoneQuiet({
    seats: [seat("far", { where: "cloud" })],
    sessions: [],
    lastActiveAt: () => NOW - 30 * DAY,
    days: 7,
    now: NOW
  });
  assert.deepEqual(closed, []);
});

test("the archive says why the chat was closed", () => {
  assert.equal(quietReason(1), "closed after a day without activity");
  assert.equal(quietReason(7), "closed after 7 days without activity");
});

test("a chat brought back from the archive counts its quiet time from the moment it came back", () => {
  const parked = archiveEntry(seat("back", { openedAt: NOW - 60 * DAY }), NOW, quietReason(7));
  assert.equal(parked.openedAt, undefined);
  assert.equal(seatFromArchive(parked).openedAt, undefined);
});

test("the conversation settings have a field for the days, and empty reads as never", () => {
  const field = $("f-quiet-days");
  assert.ok(field, "there is no field for the days");
  assert.equal(field.getAttribute("placeholder"), "never");
  adoptQuietDays({ config: { closeQuietAfterDays: 0 } });
  assert.equal(field.value, "");
  adoptQuietDays({ config: { closeQuietAfterDays: 10 } });
  assert.equal(field.value, "10");
});

test("what the person types is saved as days, and anything out of range turns the closing off", async () => {
  assert.equal(quietDays(" 5 "), 5);
  assert.equal(quietDays("0"), 0);
  assert.equal(quietDays("120"), 0);
  assert.equal(quietDays("abc"), 0);
  sent.length = 0;
  setQuietDays("12");
  setQuietDays("");
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(sent.map((one) => one.body), [{ config: { closeQuietAfterDays: 12 } }, { config: { closeQuietAfterDays: 0 } }]);
});

test("changing the field saves it", async () => {
  sent.length = 0;
  const field = $("f-quiet-days");
  field.value = "3";
  field.dispatchEvent(new Event("change"));
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(sent.at(-1)?.body, { config: { closeQuietAfterDays: 3 } });
});
