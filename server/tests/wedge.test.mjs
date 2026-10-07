import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");

function watchdog({ suspect = false, queued = null } = {}) {
  const source = driver.slice(driver.indexOf("const SILENCE_IS_A_WEDGE_MS"), driver.indexOf("async function deliverMission"));
  const emitted = [];
  const retired = [];
  const sent = [];
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
  const gate = { turnEnded: () => queued };
  let api = null;
  const dispatchSay = (item) => {
    if (!item) return;
    sent.push(item);
    api.watchForSilence(item);
  };
  api = new Function(
    "emit", "retire", "dispatchSay", "gate", "sessionId", "leaving", "startSuspect", "setTimeout", "clearTimeout",
    `let suspect = startSuspect;
     ${source}
     return { watchForSilence, heardFromSession, theSessionWentMute, leash: () => silenceTimer && silenceTimer.ms, waiting: () => awaited };`
  )(
    (event) => emitted.push(event),
    (why) => retired.push(why),
    dispatchSay,
    gate,
    "s-1",
    false,
    suspect,
    fakeSetTimeout,
    fakeClearTimeout
  );
  const fire = () => {
    const timer = timers.shift();
    assert.ok(timer, "no watch was armed");
    timer.fn();
  };
  return { api, emitted, retired, sent, fire, armed: () => timers.length };
}

test("a mute session is put down and the same words are handed to a fresh one", () => {
  const w = watchdog();
  const said = { text: "continue", images: [] };
  w.api.watchForSilence(said);
  w.fire();
  assert.deepEqual(w.retired, ["mute session"], "the dead session was left in place");
  assert.deepEqual(w.sent, [said], "the words the session swallowed were not handed over again");
  assert.equal(w.emitted.filter((e) => e.subtype === "warning").length, 1, "the chat was not told the seat was reopened");
  assert.equal(w.emitted.some((e) => e.type === "result"), false, "a turn that is being retried must not be closed");
});

test("a fresh session that is mute too closes the turn, so the seat stops reading as busy", () => {
  const w = watchdog();
  w.api.watchForSilence({ text: "alo", images: [] });
  w.fire();
  w.fire();
  const result = w.emitted.find((e) => e.type === "result");
  assert.ok(result, "the turn was never closed — this is the seat that stays green forever");
  assert.equal(result.is_error, true);
  assert.equal(result.session_id, "s-1");
  assert.equal(w.sent.length, 1, "the words were handed over twice");
  assert.equal(w.api.waiting(), null, "the seat is still waiting on a message nobody will answer");
});

test("what the person typed while the seat was mute goes out once the turn is closed", () => {
  const queued = { text: "typed while it hung", images: [] };
  const w = watchdog({ queued });
  w.api.watchForSilence({ text: "continue", images: [] });
  w.fire();
  w.fire();
  assert.deepEqual(w.sent.at(-1), queued, "the queue behind the wedged turn was never drained");
});

test("a session that answers clears the watch and the suspicion", () => {
  const w = watchdog({ suspect: true });
  w.api.watchForSilence({ text: "continue", images: [] });
  w.api.heardFromSession();
  assert.equal(w.armed(), 0, "the watch stayed armed on a session that answered");
  w.api.watchForSilence({ text: "next", images: [] });
  assert.equal(w.api.leash(), 180000, "a session that proved itself alive kept the short leash");
});

test("the session that just had a run refused waits seconds, not minutes", () => {
  const refused = watchdog({ suspect: true });
  refused.api.watchForSilence({ text: "continue", images: [] });
  assert.equal(refused.api.leash(), 30000);

  const usual = watchdog();
  usual.api.watchForSilence({ text: "continue", images: [] });
  assert.equal(usual.api.leash(), 180000, "every other session waits out the slowest first word the fleet has ever seen");
});

test("the driver puts a session down through one door only", () => {
  const retires = driver.match(/\n\s*input\.close\(\);/g) || [];
  assert.equal(retires.length, 2, "input.close() should live in retire() and in leave(), nowhere else");
  assert.match(driver.slice(driver.indexOf("function retire(")), /^function retire\(why, idleMs = Date\.now\(\) - lastActivity\) \{\n  if \(sleeping \|\| leaving\) return;/);
});

test("a session that was replaced can never keep consuming, or answer for the seat that replaced it", () => {
  const consume = driver.slice(driver.indexOf("async function runConsume"), driver.indexOf("let startedOver"));
  assert.match(consume, /async function runConsume\(mine = generation\)/);
  assert.match(consume, /if \(mine !== generation\) return;/, "the loop never checks whether its session is still the seat's");
  assert.equal((consume.match(/sleeping \|\| mine !== generation/g) || []).length, 2, "an orphaned loop can still close the seat");
  assert.match(driver.slice(driver.indexOf("function openSession(")), /^function openSession[\s\S]*?generation \+= 1;[\s\S]*?session = query\(/);
});
