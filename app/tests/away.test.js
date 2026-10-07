const { test } = require("node:test");
const assert = require("node:assert");
const { AWAY_AFTER_S, AWAY_LOOK_MS, awayFrom, watchAway } = require("../main/away.js");

function fakePower(state = "active") {
  const heard = new Map();
  const asked = [];
  return {
    state,
    asked,
    on(name, fn) { heard.set(name, fn); },
    fire(name) { heard.get(name)(); },
    getSystemIdleState(threshold) { asked.push(threshold); return this.state; }
  };
}

function start(power) {
  const told = [];
  let tick = null;
  const watch = watchAway({ power, tell: (away) => told.push(away), every: (fn, ms) => { tick = { fn, ms }; return 7; }, halt: () => {} });
  return { told, watch, tick: () => tick.fn(), every: () => tick.ms };
}

test("only a machine nobody touched, or a locked one, counts as away", () => {
  assert.equal(awayFrom("active"), false);
  assert.equal(awayFrom("unknown"), false);
  assert.equal(awayFrom("idle"), true);
  assert.equal(awayFrom("locked"), true);
});

test("the machine is asked every ten seconds whether anyone touched it in the last two minutes", () => {
  const power = fakePower();
  const run = start(power);
  assert.equal(run.every(), AWAY_LOOK_MS);
  assert.equal(AWAY_LOOK_MS, 10000);
  assert.deepEqual(power.asked, [AWAY_AFTER_S]);
  assert.equal(AWAY_AFTER_S, 120);
});

test("the windows hear a change, not every look", () => {
  const power = fakePower();
  const run = start(power);
  run.tick();
  assert.deepEqual(run.told, [], "active and still active says nothing");
  power.state = "idle";
  run.tick();
  run.tick();
  assert.deepEqual(run.told, [true]);
  assert.equal(run.watch.away(), true);
  power.state = "active";
  run.tick();
  assert.deepEqual(run.told, [true, false]);
});

test("locking the screen or putting the machine to sleep is away at once, without waiting for the next look", () => {
  const power = fakePower();
  const run = start(power);
  power.fire("lock-screen");
  assert.deepEqual(run.told, [true]);
  power.fire("unlock-screen");
  assert.deepEqual(run.told, [true, false], "unlocking looks again, and an active machine is back");
  power.fire("suspend");
  power.state = "locked";
  power.fire("resume");
  assert.deepEqual(run.told, [true, false, true], "waking into a locked screen stays away");
});

test("a machine already idle when the app opens is away from the first look", () => {
  const run = start(fakePower("idle"));
  assert.deepEqual(run.told, [true]);
});
