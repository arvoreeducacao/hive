import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTICE_TITLES, WORKING_EXIT_GRACE_MS, attentionOf, createNoticeGate, mutedBy, observationOf, titleOf, waitsForYou } from "../src/app/notice-gate.js";

const working = { name: "a", raw: "working", state: "working" };
const idle = (over = {}) => ({ name: "a", raw: "idle", state: "answered", finish: { at: "2026-10-29T10:00:00Z", error: false }, ...over });
const asking = (over = {}) => ({ name: "a", raw: "needs", state: "needs", asks: [{ id: "q1", questions: [{ question: "OC ou SKU?" }] }], finish: { at: "2026-10-29T10:00:00Z", error: false }, ...over });

function gate() {
  const said = [];
  const g = createNoticeGate((key, kind, look) => said.push({ key, kind, status: look.status }));
  const see = (seat, at, options = {}) => g.observe(seat.name, observationOf(seat, options.extra), { now: at, muted: !!options.muted });
  return { said, see, g };
}

test("the grace for a finished turn is two seconds", () => {
  assert.equal(WORKING_EXIT_GRACE_MS, 2000);
});

test("a finished turn waits out the grace and speaks once", () => {
  const { said, see } = gate();
  see(working, 0);
  see(working, 2500);
  see(idle(), 5000);
  assert.deepEqual(said, [], "it spoke before the grace");
  see(idle(), 6000);
  assert.deepEqual(said, [], "one second is not the grace");
  see(idle(), 7500);
  assert.deepEqual(said, [{ key: "a", kind: "completion", status: null }]);
  see(idle(), 10000);
  see(idle(), 20000);
  assert.equal(said.length, 1, "the same turn spoke twice");
});

test("a chat that goes back to work inside the grace never says it finished", () => {
  const { said, see } = gate();
  see(working, 0);
  see(working, 2500);
  see(idle(), 5000);
  see(working, 7500);
  see(working, 10000);
  assert.deepEqual(said, []);
  see(idle({ finish: { at: "2026-10-29T10:01:00Z" } }), 12500);
  see(idle({ finish: { at: "2026-10-29T10:01:00Z" } }), 15000);
  assert.deepEqual(said.map((one) => one.kind), ["completion"], "only the real end of the run speaks");
});

test("a turn too short for the poll to see working still speaks, by its new finish", () => {
  const { said, see } = gate();
  see(idle(), 0);
  see(idle({ finish: { at: "2026-10-29T10:05:00Z" } }), 2500);
  see(idle({ finish: { at: "2026-10-29T10:05:00Z" } }), 5000);
  assert.deepEqual(said.map((one) => one.kind), ["completion"]);
});

test("a question speaks at once and takes the place of the end before it", () => {
  const { said, see } = gate();
  see(working, 0);
  see(idle(), 2500);
  see(asking(), 3000);
  assert.deepEqual(said, [{ key: "a", kind: "attention", status: "input" }]);
  see(asking(), 6000);
  see(idle(), 9000);
  see(idle(), 12000);
  assert.equal(said.length, 1, "the end replaced by the question spoke later");
});

test("a first turn that ends in a question and then finishes still says it finished", () => {
  const { said, see } = gate();
  see(working, 0);
  see(asking({ finish: undefined }), 2500);
  see(idle({ finish: { at: "2026-10-29T10:02:00Z" } }), 5000);
  see(idle({ finish: { at: "2026-10-29T10:02:00Z" } }), 7500);
  assert.deepEqual(said.map((one) => one.kind), ["attention", "completion"]);
});

test("a new question after an answered one speaks again, even with no work between the polls", () => {
  const { said, see } = gate();
  see(working, 0);
  see(asking(), 2500);
  see(asking({ asks: [{ id: "q2", questions: [{ question: "e agora?" }] }] }), 5000);
  assert.deepEqual(said.map((one) => one.status), ["input", "input"]);
});

test("the first look after the app opens is silent, whatever the chat is doing", () => {
  const { said, see } = gate();
  see(asking(), 0);
  see(asking(), 2500);
  see(idle(), 5000);
  see(idle(), 7500);
  assert.deepEqual(said, []);
});

test("a chat that was working when the app opened still says when it finishes", () => {
  const { said, see } = gate();
  see(working, 0);
  see(idle(), 2500);
  see(idle(), 5000);
  assert.deepEqual(said.map((one) => one.kind), ["completion"]);
  const terminal = gate();
  terminal.see({ name: "t", raw: "working", state: "working" }, 0);
  terminal.see({ name: "t", raw: "idle", state: "answered" }, 2500);
  terminal.see({ name: "t", raw: "idle", state: "answered" }, 5000);
  assert.deepEqual(terminal.said.map((one) => one.kind), ["completion"], "a terminal chat has no finish to compare, only the work it was seen doing");
});

test("a snoozed or settled chat says nothing, and waking it does not replay what it missed", () => {
  const { said, see } = gate();
  see(working, 0);
  see(working, 2500, { muted: true });
  see(asking(), 3000, { muted: true });
  see(idle(), 5000, { muted: true });
  see(idle(), 9000, { muted: true });
  assert.deepEqual(said, []);
  see(idle(), 11500);
  see(idle(), 14000);
  assert.deepEqual(said, [], "the end it had while muted spoke after");
});

test("muting a chat during the grace drops the end it was about to say", () => {
  const { said, see } = gate();
  see(working, 0);
  see(idle(), 2500);
  see(idle(), 5000, { muted: true });
  see(idle(), 7500);
  assert.deepEqual(said, []);
});

test("a chat that left the hive is forgotten, so coming back is a first look again", () => {
  const { said, see, g } = gate();
  see(working, 0);
  see(idle(), 2500);
  g.retain(new Set());
  assert.equal(g.waiting("a"), false);
  see(idle(), 5000);
  see(idle(), 7500);
  assert.deepEqual(said, []);
});

test("each kind of ask has its own title, and the hive's own secret has one too", () => {
  assert.equal(titleOf("completion", null), "Thread completed");
  assert.equal(titleOf("attention", "input"), "Input needed");
  assert.equal(titleOf("attention", "approval"), "Approval needed");
  assert.equal(titleOf("attention", "limited"), "Usage limit reached");
  assert.equal(titleOf("attention", "failed"), "Thread failed");
  assert.equal(titleOf("attention", "secret"), "Secret needed");
  assert.equal(Object.keys(NOTICE_TITLES).length, 6);
});

test("what the chat waits on decides the kind of ask", () => {
  assert.equal(attentionOf(asking()).status, "input");
  assert.equal(attentionOf({ raw: "needs", state: "needs" }).status, "approval", "a terminal stopped at a dialog asks for approval");
  assert.equal(attentionOf(working, { secret: { id: "s1", seat: "a" } }).status, "secret", "a secret is asked while the turn is still open");
  assert.equal(attentionOf(idle(), { limitedUntil: 99 }).status, "limited");
  assert.equal(attentionOf(working, { limitedUntil: 99 }), null, "a chat that is working again is not at the limit any more");
  assert.equal(attentionOf(idle({ finish: { at: "x", error: true } })).status, "failed");
  assert.equal(attentionOf(idle()), null);
});

test("a failed turn speaks at once instead of saying it completed", () => {
  const { said, see } = gate();
  see(working, 0);
  see(idle({ finish: { at: "2026-10-29T10:09:00Z", error: true } }), 2500);
  see(idle({ finish: { at: "2026-10-29T10:09:00Z", error: true } }), 5000);
  assert.deepEqual(said.map((one) => `${one.kind}:${one.status}`), ["attention:failed"]);
});

test("snoozed until later or settled is muted; a snooze that ran out is not", () => {
  assert.equal(mutedBy({ snoozeUntil: 2000 }, 1000), true);
  assert.equal(mutedBy({ snoozeUntil: 500 }, 1000), false);
  assert.equal(mutedBy({ settledAt: 10 }, 1000), true);
  assert.equal(mutedBy(undefined, 1000), false);
});

test("waiting for you is an ask, an unread end, a chat marked unread or one that woke — never a muted one", () => {
  const ask = observationOf(asking());
  const done = observationOf(idle());
  assert.equal(waitsForYou(ask, {}, 0, false), true);
  assert.equal(waitsForYou(done, {}, 0, true), true);
  assert.equal(waitsForYou(done, {}, 0, false), false, "an end you already read does not wait");
  assert.equal(waitsForYou(done, { unread: true }, 0, false), true);
  assert.equal(waitsForYou(done, { wokeAt: 5 }, 0, false), true);
  assert.equal(waitsForYou(ask, { snoozeUntil: 10 }, 0, false), false);
  assert.equal(waitsForYou(ask, { settledAt: 10 }, 0, true), false);
  assert.equal(waitsForYou(observationOf(idle({ finish: { at: "x", error: true } })), {}, 0, false), false, "a failure you already read stops counting");
});
