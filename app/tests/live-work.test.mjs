import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zonesOf } from "../lib/errands.mjs";
import { panelOf, readPanel } from "../lib/team.mjs";
import { fleetOf } from "../../server/fleet.mjs";
import { app } from "./dom.mjs";

const APP = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(APP, "server.mjs"), "utf8");
const { liveBadge, liveTitle, stateOf } = await app("leader-key");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${what} out`);
  return text.slice(a, b);
}

const readTail = new Function(
  "prettyModel",
  "PR_LINK",
  slice(server, "const FINISH_WORDS", "function structuredStateOf", "parseStructuredTail")
    + "return parseStructuredTail;"
)((m) => String(m || ""), /https:\/\/github\.com\/\S+\/pull\/\d+/g);

const line = (event) => JSON.stringify(event);
const changed = (tasks, ts) => line({ type: "system", subtype: "background_tasks_changed", tasks, ts });
const task = (id, kind, said) => ({ task_id: id, task_type: kind, description: said });

test("the seat carries whatever the harness says is still alive", () => {
  const info = readTail([
    line({ type: "driver", subtype: "started" }),
    changed([task("a1", "local_bash", "eas build --profile internal")], "2026-08-29T10:00:00.000Z"),
    line({ type: "result", seq: 4 })
  ].join("\n"));
  assert.equal(info.live.length, 1);
  assert.deepEqual(info.live[0], { id: "a1", kind: "local_bash", said: "eas build --profile internal" });
  assert.equal(info.liveSince, "2026-08-29T10:00:00.000Z");
});

test("a monitor the seat is sitting on counts as live work", () => {
  const info = readTail(changed([task("m1", "monitor_ws", "logs do engine")], "2026-08-29T10:00:00.000Z"));
  assert.deepEqual(info.live.map((one) => one.kind), ["monitor_ws"]);
});

test("the list replaces, it does not accumulate", () => {
  const info = readTail([
    changed([task("a1", "local_bash", "one")], "2026-08-29T10:00:00.000Z"),
    changed([task("a1", "local_bash", "one"), task("a2", "local_agent", "two")], "2026-08-29T10:05:00.000Z"),
    changed([task("a2", "local_agent", "two")], "2026-08-29T10:09:00.000Z")
  ].join("\n"));
  assert.deepEqual(info.live.map((one) => one.id), ["a2"]);
  assert.equal(info.liveSince, "2026-08-29T10:00:00.000Z", "the clock counts the run, not the last change");
});

test("an empty list puts the clock out", () => {
  const info = readTail([
    changed([task("a1", "local_bash", "one")], "2026-08-29T10:00:00.000Z"),
    changed([], "2026-08-29T10:07:00.000Z")
  ].join("\n"));
  assert.deepEqual(info.live, []);
  assert.equal(info.liveSince, "");
});

test("a seat whose process restarted starts from nothing running", () => {
  const info = readTail([
    changed([task("a1", "local_bash", "from the life before")], "2026-08-29T09:00:00.000Z"),
    line({ type: "driver", subtype: "started" })
  ].join("\n"));
  assert.deepEqual(info.live, [], "the level signal is per-process: a restart says nothing is alive");
});

test("a seat that died reports nothing alive", () => {
  const info = readTail([
    changed([task("a1", "local_bash", "one")], "2026-08-29T10:00:00.000Z"),
    line({ type: "driver", subtype: "exit" })
  ].join("\n"));
  assert.deepEqual(info.live, []);
});

test("a tail that never mentions tasks says so, so the poll can keep what it knew", () => {
  const quiet = readTail(line({ type: "result", seq: 2 }));
  assert.equal(quiet.sawLive, false);
  const loud = readTail(changed([], "2026-08-29T10:00:00.000Z"));
  assert.equal(loud.sawLive, true);
});

test("a seat with work alive is never called stalled", () => {
  const seat = { name: "mobi-release-ios", raw: "working", state: "working", summary: "subindo", live: [] };
  stateOf(seat);
  const asleep = { ...seat, raw: "idle", state: "idle", live: [{ id: "a1", kind: "local_bash", said: "eas build" }] };
  const before = Date.now;
  Date.now = () => before() + 11 * 60 * 1000;
  try {
    assert.equal(stateOf(asleep), "idle", "the stall clock stops while something is running");
    assert.equal(stateOf({ ...asleep, live: [] }), "stalled", "with nothing alive it still goes stalled");
  } finally {
    Date.now = before;
  }
});

test("the badge says how many and since when", () => {
  const seat = { name: "x", live: [{ id: "a1", kind: "local_bash", said: "eas build" }], liveSince: new Date(Date.now() - 8 * 60 * 1000).toISOString() };
  assert.equal(liveBadge(seat), "1 · 8 min");
  assert.equal(liveBadge({ name: "y", live: [] }), "");
  assert.equal(liveBadge({ name: "z", live: seat.live }), "1", "with no clock it is only the tally");
  assert.equal(liveTitle(seat), "eas build");
  assert.equal(liveTitle({ name: "y", live: [] }), "");
});

test("an errand still running has not come back", () => {
  const running = {
    name: "mobi-release-ios", state: "idle", errand: "release interno do iOS", at: 10,
    live: [{ id: "a1", kind: "local_bash", said: "eas build" }]
  };
  const zones = zonesOf({ sessions: [running], prsOf: () => ["https://github.com/arvoreeducacao/dev-workspaces/pull/628"], seen: {} });
  assert.equal(zones.cameBack.length, 0, "a seat with work alive must not be offered as came back");
  assert.equal(zones.onTheWay.length, 1);

  const done = { ...running, live: [] };
  const after = zonesOf({ sessions: [done], prsOf: () => ["https://github.com/arvoreeducacao/dev-workspaces/pull/628"], seen: {} });
  assert.equal(after.cameBack.length, 1, "with nothing alive it comes back as before");
});

test("the panel the team reads carries the live work", () => {
  const panel = panelOf([{
    name: "mobi-release-ios", title: "release interno do iOS", where: "local", state: "idle",
    live: [{ id: "a1", kind: "local_bash", said: "eas build --profile internal" }],
    liveSince: "2026-08-29T10:00:00.000Z"
  }], "joao", 1000);
  const read = readPanel(JSON.stringify(panel), 1000);
  assert.deepEqual(read.seats[0].live.map((one) => one.id), ["a1"]);
  assert.equal(read.seats[0].liveSince, "2026-08-29T10:00:00.000Z");
});

test("the fleet the phone reads carries it too", () => {
  const fleet = fleetOf({
    sessions: [{
      name: "mobi-release-ios", title: "release interno do iOS", state: "idle",
      live: [{ id: "a1", kind: "local_bash", said: "eas build" }], liveSince: "2026-08-29T10:00:00.000Z"
    }],
    at: 1000
  });
  assert.deepEqual(fleet.sessions[0].live.map((one) => one.id), ["a1"]);
  assert.equal(fleet.sessions[0].liveSince, "2026-08-29T10:00:00.000Z");
});
