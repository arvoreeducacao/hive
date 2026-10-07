import { test } from "node:test";
import assert from "node:assert/strict";
import { makePerf, perfWanted, watchLongTasks, PERF_FLAG } from "../assets/perf.mjs";

function ticking() {
  let wall = 1_700_000_000_000;
  let cpu = 0;
  const marks = [];
  const perf = makePerf({ now: () => wall, clock: () => cpu, mark: (m) => marks.push(m) });
  return { perf, marks, tick: (ms) => { cpu += ms; }, later: (ms) => { wall += ms; } };
}

test("a render is counted, timed and marked in the minute it happened", () => {
  const { perf, marks, tick } = ticking();
  const from = perf.start("render");
  tick(12);
  assert.equal(perf.end("render", from), 12);
  const [bucket] = Object.values(perf.stats());
  assert.deepEqual([bucket.count, bucket.totalMs, bucket.max, bucket.avgMs], [1, 12, 12, 12]);
  assert.deepEqual(marks, ["render:start", "render:end"]);
});

test("the max keeps the slowest render and the average the whole minute", () => {
  const { perf, tick } = ticking();
  for (const ms of [4, 30, 8]) { const from = perf.start("render"); tick(ms); perf.end("render", from); }
  const [bucket] = Object.values(perf.stats());
  assert.equal(bucket.count, 3);
  assert.equal(bucket.max, 30);
  assert.equal(bucket.avgMs, 14);
});

test("a skipped render is counted by its reason, apart from the ones that ran", () => {
  const { perf } = ticking();
  perf.skip("poll");
  perf.skip("poll");
  perf.skip("threads");
  const [bucket] = Object.values(perf.stats());
  assert.equal(bucket.count, 0);
  assert.deepEqual(bucket.skipped, { poll: 2, threads: 1 });
});

test("each minute gets its own bucket and the old ones fall off", () => {
  const { perf, later } = ticking();
  perf.skip("poll");
  later(60_000);
  perf.skip("poll");
  assert.equal(Object.keys(perf.stats()).length, 2);
  later(60_000 * 40);
  perf.skip("poll");
  assert.equal(Object.keys(perf.stats()).length, 1);
});

test("only a task longer than 50ms counts as a long one", () => {
  const { perf } = ticking();
  perf.longTask(20);
  perf.longTask(50);
  perf.longTask(120);
  assert.equal(perf.now().longTasks, 2);
});

test("the long task observer only wakes up behind the flag", () => {
  const { perf } = ticking();
  const observed = [];
  class Observer {
    constructor(fn) { this.fn = fn; }
    observe(opts) { observed.push(opts); }
  }
  assert.equal(watchLongTasks(perf, { storage: { getItem: () => null }, Observer }), null);
  const on = watchLongTasks(perf, { storage: { getItem: (k) => (k === PERF_FLAG ? "1" : null) }, Observer });
  assert.ok(on instanceof Observer);
  assert.deepEqual(observed, [{ type: "longtask", buffered: true }]);
  on.fn({ getEntries: () => [{ duration: 80 }, { duration: 10 }] });
  assert.equal(perf.now().longTasks, 1);
});

test("without a PerformanceObserver in the room, nothing is armed", () => {
  const { perf } = ticking();
  assert.equal(watchLongTasks(perf, { storage: { getItem: () => "1" }, Observer: null }), null);
});

test("perf is wanted only when the flag is in storage, and a blocked storage counts as no", () => {
  assert.equal(perfWanted({ storage: { getItem: () => null } }), false);
  assert.equal(perfWanted({ storage: { getItem: (key) => (key === PERF_FLAG ? "1" : null) } }), true);
  assert.equal(perfWanted({ storage: { getItem: () => { throw new Error("blocked"); } } }), false);
  assert.equal(perfWanted({ storage: null }), false);
});
