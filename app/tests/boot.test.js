const { test } = require("node:test");
const assert = require("node:assert");
const { initial, reduce, shouldSwitchToBase, steps, screen } = require("../main/boot.js");

test("starts by looking for node", () => {
  const state = initial();
  assert.equal(state.step, "node");
  assert.equal(state.error, "");
  assert.deepEqual(steps(state).map((s) => s.situation), ["now", "waiting", "waiting"]);
});

test("walks the steps in order and marks the earlier ones done", () => {
  let state = initial();
  state = reduce(state, { type: "step", step: "server" });
  assert.deepEqual(steps(state).map((s) => s.situation), ["done", "now", "waiting"]);
  state = reduce(state, { type: "step", step: "pod" });
  assert.deepEqual(steps(state).map((s) => s.situation), ["done", "done", "now"]);
});

test("an unknown step leaves the state alone", () => {
  const state = reduce(initial(), { type: "step", step: "banana" });
  assert.equal(state.step, "node");
});

test("every step has a name of its own", () => {
  assert.deepEqual(steps(initial()).map((s) => s.label), ["looking for node", "starting server", "connecting to the pod"]);
});

test("switches to BASE only once ready", () => {
  let state = initial();
  assert.equal(shouldSwitchToBase(state), false);
  state = reduce(state, { type: "step", step: "server" });
  assert.equal(shouldSwitchToBase(state), false);
  state = reduce(state, { type: "ready" });
  assert.equal(shouldSwitchToBase(state), true);
  assert.deepEqual(steps(state).map((s) => s.situation), ["done", "done", "done"]);
});

test("a failure takes the reason from the current step and never switches to BASE", () => {
  const noNode = reduce(initial(), { type: "failed" });
  assert.equal(noNode.error, "could not find node");
  assert.equal(shouldSwitchToBase(noNode), false);
  assert.deepEqual(steps(noNode).map((s) => s.situation), ["failed", "waiting", "waiting"]);

  const noServer = reduce(reduce(initial(), { type: "step", step: "server" }), { type: "failed" });
  assert.equal(noServer.error, "the server did not start");
  assert.deepEqual(steps(noServer).map((s) => s.situation), ["done", "failed", "waiting"]);
});

test("a failure accepts an explicit reason", () => {
  const state = reduce(initial(), { type: "failed", reason: "the server died (code 1)" });
  assert.equal(state.error, "the server died (code 1)");
});

test("a timeout says how long it waited", () => {
  const state = reduce(reduce(initial(), { type: "step", step: "server" }), { type: "timeout", limit: 12000 });
  assert.equal(state.error, "the server did not start within 12s");
  assert.equal(shouldSwitchToBase(state), false);
});

test("an error freezes the state: nothing after it moves", () => {
  const stuck = reduce(initial(), { type: "failed" });
  assert.deepEqual(reduce(stuck, { type: "step", step: "pod" }), stuck);
  assert.deepEqual(reduce(stuck, { type: "ready" }), stuck);
  assert.equal(shouldSwitchToBase(reduce(stuck, { type: "ready" })), false);
});

test("an unknown event leaves the state alone", () => {
  const state = initial();
  assert.deepEqual(reduce(state, { type: "other" }), state);
});

test("screen carries the steps and the error to the window", () => {
  const state = reduce(initial(), { type: "failed" });
  const view = screen(state);
  assert.equal(view.error, "could not find node");
  assert.equal(view.steps.length, 3);
  assert.deepEqual(screen(initial()).error, "");
});
