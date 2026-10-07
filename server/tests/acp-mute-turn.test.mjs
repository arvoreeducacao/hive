import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const ACP_DRIVERS = ["kimi", "kiro", "cursor"];

function sourceOf(agent) {
  const file = readFileSync(join(HERE, `engine/${agent}-driver.mjs`), "utf8");
  const from = file.indexOf("const SILENCE_IS_A_WEDGE_MS");
  const to = file.indexOf("let interruptAskedAt = 0;");
  assert.ok(from >= 0 && to > from, `${agent}: the silence watch is not where the test looks for it`);
  return file.slice(from, to);
}

function watchdog(agent, { alive = true } = {}) {
  const emitted = [];
  const ended = [];
  const notified = [];
  const closed = [];
  const timers = [];
  const fakeSetTimeout = (fn, ms) => {
    const timer = { fn, ms };
    timers.push(timer);
    return timer;
  };
  const fakeClearTimeout = (timer) => {
    const at = timers.indexOf(timer);
    if (at >= 0) timers.splice(at, 1);
  };
  const client = {
    get alive() { return alive; },
    notify: (method, params) => notified.push({ method, params }),
    close: () => closed.push(true),
  };
  const api = new Function(
    "emit", "endTurn", "finishTurn", "sessionId", "client", "setTimeout", "clearTimeout",
    `let leaving = false;
     let turning = null;
     let ctx = {};
     let awaited = null;
     let silenceTimer = null;
     ${sourceOf(agent)}
     return {
       watchForSilence, heardFromServer, theServerWentMute,
       hold: (promise) => { turning = promise; },
       letGo: () => { turning = null; },
       leave: () => { leaving = true; },
       grace: () => LET_GO_OF_THE_TURN_MS,
     };`
  )(
    (event) => emitted.push(event),
    (events) => ended.push(events),
    (_ctx, _stop, _session, why) => [{ type: "result", subtype: "error", result: why }],
    "s-1",
    client,
    fakeSetTimeout,
    fakeClearTimeout
  );
  const fire = () => {
    const timer = timers.shift();
    assert.ok(timer, "no watch was armed");
    return timer.fn();
  };
  const fireGrace = () => {
    const timer = timers.find((t) => t.ms === api.grace());
    assert.ok(timer, "the agent was never given a grace window to let the turn go");
    fakeClearTimeout(timer);
    timer.fn();
  };
  const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
  return { api, emitted, ended, notified, closed, fire, fireGrace, settle, timers };
}

for (const agent of ACP_DRIVERS) {
  test(`${agent}: a mute turn is cancelled on the agent before the seat calls it over`, async () => {
    const w = watchdog(agent);
    w.api.hold(new Promise(() => {}));
    w.api.watchForSilence({ text: "go" });
    w.fire();
    await w.settle();
    assert.deepEqual(w.notified, [{ method: "session/cancel", params: { sessionId: "s-1" } }]);
    assert.equal(w.ended.length, 0, "the seat closed the turn before the agent was asked to let it go");
    w.fireGrace();
    await w.settle();
  });

  test(`${agent}: an agent that lets the turn go closes it itself, and the seat does not close it twice`, async () => {
    const w = watchdog(agent);
    let release;
    const wedged = new Promise((resolve) => { release = resolve; });
    w.api.hold(wedged);
    w.api.watchForSilence({ text: "go" });
    w.fire();
    await w.settle();
    w.api.letGo();
    release();
    await w.settle();
    assert.equal(w.ended.length, 0, "the turn was closed twice — once by the agent's answer, once by the watchdog");
    assert.equal(w.closed.length, 0, "the connection was dropped even though the agent let the turn go");
  });

  test(`${agent}: an agent that keeps the turn past the grace loses the connection`, async () => {
    const w = watchdog(agent);
    w.api.hold(new Promise(() => {}));
    w.api.watchForSilence({ text: "go" });
    w.fire();
    await w.settle();
    w.fireGrace();
    await w.settle();
    assert.deepEqual(w.closed, [true], "the wedged connection was left open");
    assert.equal(w.ended.length, 0, "the seat closed the turn on its own instead of letting the connection's exit close it");
  });

  test(`${agent}: with the connection already gone, the seat closes the turn itself`, async () => {
    const w = watchdog(agent, { alive: false });
    w.api.hold(new Promise(() => {}));
    w.api.watchForSilence({ text: "go" });
    w.fire();
    await w.settle();
    w.fireGrace();
    await w.settle();
    assert.equal(w.ended.length, 1, "the turn stayed open with nothing left to answer it");
    assert.equal(w.closed.length, 0);
  });

  test(`${agent}: a turn only ends once, and a late answer never ends the turn that replaced it`, () => {
    const file = readFileSync(join(HERE, `engine/${agent}-driver.mjs`), "utf8");
    const guard = file.slice(file.indexOf("function endTurn(events) {"));
    assert.match(guard.slice(0, 120), /if \(!turnLive\) return;\s*\n\s*turnLive = false;/, `${agent}: endTurn can run twice for the same turn`);
    const opens = file.indexOf("function dispatchSay(item) {");
    const dispatch = file.slice(opens, file.indexOf("\n}\n", opens));
    assert.ok(dispatch.includes("const mine = openAcp()"), `${agent}: the turn does not carry its own identity`);
    assert.equal((dispatch.match(/if \(turning !== mine\) return;/g) || []).length, 3, `${agent}: a late answer can still land on the turn that replaced it`);
    assert.ok(dispatch.includes("turnLive = true;"), `${agent}: the turn never declares itself live`);
  });
}
