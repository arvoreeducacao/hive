import { test } from "node:test";
import assert from "node:assert/strict";

let onVisibility = () => {};
globalThis.document = {
  hidden: false,
  addEventListener: (name, fn) => { if (name === "visibilitychange") onVisibility = fn; }
};

const { every, stopBeat, beatOn } = await import("../assets/pollers.mjs");

test("a beat fires on its interval under its name", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  every("t1", 5, () => { calls += 1; });
  t.mock.timers.tick(22);
  stopBeat("t1");
  assert.ok(calls >= 2, `expected several beats, got ${calls}`);
  assert.equal(beatOn("t1"), false);
});

test("re-beating the same name replaces the clock instead of stacking a second one", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let slow = 0;
  let fast = 0;
  every("t2", 40, () => { slow += 1; });
  every("t2", 5, () => { fast += 1; });
  t.mock.timers.tick(50);
  stopBeat("t2");
  assert.equal(slow, 0, "the first clock was disarmed by the second before it ever fired");
  assert.ok(fast >= 4, `the replacement kept its own pace, got ${fast}`);
});

test("hiding the window pauses the beats and looking back runs one right away", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  every("t3", 10, () => { calls += 1; });
  t.mock.timers.tick(15);
  const before = calls;
  document.hidden = true;
  onVisibility();
  t.mock.timers.tick(35);
  assert.equal(calls, before, "no beat fires while the window is hidden");
  document.hidden = false;
  onVisibility();
  assert.equal(calls, before + 1, "coming back runs one beat immediately");
  t.mock.timers.tick(25);
  stopBeat("t3");
  assert.ok(calls >= before + 2, "and the interval keeps going after it");
});

test("a background beat never pauses — chimes and terminals live there", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  every("t4", 5, () => { calls += 1; }, { background: true });
  document.hidden = true;
  onVisibility();
  t.mock.timers.tick(20);
  stopBeat("t4");
  document.hidden = false;
  onVisibility();
  assert.ok(calls >= 2, `kept beating while hidden, got ${calls}`);
});

test("stopping what never ran is a no-op", () => {
  stopBeat("never-was");
  assert.equal(beatOn("never-was"), false);
});
