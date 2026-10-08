import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, "..", "server.mjs"), "utf8");
const seatRoutes = readFileSync(join(HERE, "..", "routes", "seats.mjs"), "utf8");

const slice = (from, to) => {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${from} is gone from server.mjs`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `${to} is gone from server.mjs`);
  return source.slice(start, end);
};

test("the local fleet the panel paints is the list of tmux windows", () => {
  const collect = slice("async function collect()", "const alive = new Set(");
  assert.match(collect, /localWindows\(\)/, "the fleet stopped coming from the windows");
  assert.match(slice("async function localWindows()", "async function podUp("), /list-windows/);
});

test("a seat is born where the fleet is read, and nothing returns from newChat before that", () => {
  const birth = slice("async function newChat({", "  rememberSeat({");
  assert.match(birth, /seatInATmuxWindow\(/, "a local seat is no longer opened through the windows the fleet is read from");
  const opening = slice("async function seatInATmuxWindow(", "async function newChat({");
  assert.match(opening, /"new-window", "-t", `\${LOCAL_SESSION}:`/, "the seat opens somewhere the panel does not look");
  assert.doesNotMatch(birth, /\n {4}return;/, "newChat leaves before the seat exists, and a seat the fleet never lists keeps the card spawning forever");
});

test("closing a seat closes its window, so a seat without one cannot be closed", () => {
  const start = seatRoutes.indexOf('on("POST", "/api/kill"');
  const end = seatRoutes.indexOf('on("POST", "/api/seat/archive"', start);
  assert.ok(start >= 0 && end > start, "could not cut /api/kill out of routes/seats.mjs");
  assert.match(seatRoutes.slice(start, end), /killSeatWindow\(/);
  assert.match(slice("async function killSeatWindow(", "async function archiveSeat("), /kill-window/);
});

test("archiving keeps the record fleet closing throws away, and leaves the fleet file alone", () => {
  const park = slice("async function archiveSeat(", "async function reviveArchivedSeat(");
  assert.match(park, /killSeatWindow\(name, where\)/, "an archived seat kept its window and its slot");
  assert.match(park, /archivedSeats\.set\(/, "archiving forgot the record, which is the whole point");
  assert.match(park, /forgetSeat\(where, name\)/, "the record stayed in the fleet, and the reconciler will bring it back on the next boot");
  const back = slice("async function reviveArchivedSeat(", "async function fleetAsWritten(");
  assert.match(back, /freeName\(asked, where\)/, "reviving would collide with a seat already answering to that name");
  assert.match(back, /rememberSeat\(back\)/, "the revived seat never returned to the fleet");
});

test("closing a seat closes every window with its name, not the first one tmux finds", () => {
  assert.match(slice("async function killSeatWindow(", "async function killEveryWindowNamed("), /killEveryWindowNamed\(name\)/);
  const sweep = slice("async function killEveryWindowNamed(", "async function reapSeatLeftovers(");
  assert.match(sweep, /"list-windows", "-t", LOCAL_SESSION, "-F", "#\{window_id\} #W"/, "the windows are no longer looked up by id");
  assert.match(sweep, /for \(const id of ids\) await sh\(TMUX, \["kill-window", "-t", id\]/, "only one of the copies goes, and the tile stays");
});

test("closing a seat stops only the processes this hive started, never a chat of the same name in another hive on the machine", () => {
  const reaping = slice("async function reapSeatLeftovers(", "async function closeEndedSeat(");
  const calls = reaping.match(/leftoversOf\(name, [^\n]*\)/g) || [];
  assert.equal(calls.length, 2, "the reaper and the panel that lists what a seat left behind both read the process table");
  for (const call of calls) assert.match(call, /hive: HIVE_HOME/, "without the hive, the other hive's chat with the same name loses its processes");
});

test("the local session is only dead when tmux says so twice", () => {
  const reconcile = slice("async function reconcileLocalFleet()", "function tellSeatsNobodyLooksYet()");
  assert.match(reconcile, /await localSessionSeenTwice\(\)/, "one 'no server running' around a wake restores every seat on top of its living window");
  const twice = slice("async function localSessionSeenTwice()", "async function reconcileLocalFleet()");
  assert.match(twice, /NO_TMUX_SESSION\.test\(first\.error\)/);
  assert.match(twice, /setTimeout\(resolve, 3000\)/);
});
