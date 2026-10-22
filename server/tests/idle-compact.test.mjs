import test from "node:test";
import assert from "node:assert/strict";
import { idleCompactSettings, idleCompactVerdict, noteForIdleCompact, idleTagged, cacheTtlOf, contextTokensOf, IDLE_COMPACT_MIN_TOKENS, CACHE_TTL_MS, COLD_MARGIN_MS } from "../idle-compact.mjs";

const HOUR = CACHE_TTL_MS["1h"];
const settings = { on: true, minTokens: IDLE_COMPACT_MIN_TOKENS, afterMs: 0 };
const mark = { session: "abc", turn_at: 1000, tokens: 300000, ttl: "1h", worked: true };
const base = { now: 1000 + HOUR * 0.9, settings, mark, sessionId: "abc" };

const usage = (read, made, ttl = "1h") => ({
  input_tokens: 2,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: made,
  cache_creation: { ephemeral_1h_input_tokens: ttl === "1h" ? made : 0, ephemeral_5m_input_tokens: ttl === "5m" ? made : 0 },
});
const answer = (u, extra = {}) => ({ type: "assistant", parent_tool_use_id: null, message: { model: "claude-opus-5-5", usage: u }, ...extra });

test("compacts once the conversation has sat for nine tenths of the hour the cache lives", () => {
  const v = idleCompactVerdict(base);
  assert.equal(v.fire, true);
  assert.equal(v.tokens, 300000);
});

test("before that it says how long to wait", () => {
  const v = idleCompactVerdict({ ...base, now: 1000 + HOUR * 0.5 });
  assert.equal(v.fire, false);
  assert.equal(v.inMs, HOUR * 0.4);
});

test("a cache that already went cold is left alone: compacting it would pay the full read it was meant to save", () => {
  for (const now of [1000 + HOUR - COLD_MARGIN_MS, 1000 + HOUR * 3]) {
    const v = idleCompactVerdict({ ...base, now });
    assert.equal(v.fire, false);
    assert.match(v.why, /cold/);
    assert.equal(v.inMs, undefined);
  }
});

test("a conversation under the floor is not worth losing detail for", () => {
  const v = idleCompactVerdict({ ...base, mark: { ...mark, tokens: IDLE_COMPACT_MIN_TOKENS - 1 } });
  assert.equal(v.fire, false);
  assert.match(v.why, /small/);
});

test("the same quiet is compacted at most once, even when that try failed", () => {
  const v = idleCompactVerdict({ ...base, mark: { ...mark, tried_for: mark.turn_at } });
  assert.equal(v.fire, false);
  assert.match(v.why, /already/);
  assert.equal(v.inMs, undefined, "nothing to come back for until a new turn moves turn_at");
});

test("nothing new since the last compaction means no second one", () => {
  const v = idleCompactVerdict({ ...base, mark: { ...mark, worked: false } });
  assert.equal(v.fire, false);
  assert.match(v.why, /nothing new/);
});

test("only the one-hour cache: with five minutes there is no quiet worth compacting for", () => {
  assert.equal(idleCompactVerdict({ ...base, mark: { ...mark, ttl: "5m" } }).fire, false);
  assert.equal(idleCompactVerdict({ ...base, mark: { ...mark, ttl: "" } }).fire, false);
});

test("a mark from another conversation, or no session at all, never fires", () => {
  assert.equal(idleCompactVerdict({ ...base, sessionId: "other" }).fire, false);
  assert.equal(idleCompactVerdict({ ...base, sessionId: "" }).fire, false);
  assert.equal(idleCompactVerdict({ ...base, mark: { ...mark, turn_at: 0 } }).fire, false);
});

test("a busy seat waits a minute and tries again, while the cache still has time", () => {
  for (const busy of [{ busy: true }, { queued: 1 }, { questions: 1 }, { tasks: 1 }]) {
    const v = idleCompactVerdict({ ...base, ...busy });
    assert.equal(v.fire, false, JSON.stringify(busy));
    assert.equal(v.inMs, 60000);
  }
  const late = idleCompactVerdict({ ...base, now: 1000 + HOUR - COLD_MARGIN_MS - 30000, busy: true });
  assert.equal(late.fire, false);
  assert.equal(late.inMs, undefined, "no retry that would land after the cache is cold");
});

test("off, leaving and the env knobs", () => {
  assert.equal(idleCompactVerdict({ ...base, settings: { ...settings, on: false } }).why, "off");
  assert.equal(idleCompactVerdict({ ...base, leaving: true }).fire, false);
  assert.deepEqual(idleCompactSettings({}), { on: true, minTokens: IDLE_COMPACT_MIN_TOKENS, afterMs: 0 });
  assert.equal(idleCompactSettings({ HIVE_IDLE_COMPACT: "0" }).on, false);
  assert.equal(idleCompactSettings({ HIVE_IDLE_COMPACT_MIN_TOKENS: "5000" }).minTokens, 5000);
  assert.equal(idleCompactSettings({ HIVE_IDLE_COMPACT_MIN_TOKENS: "abacaxi" }).minTokens, IDLE_COMPACT_MIN_TOKENS);
  assert.equal(idleCompactSettings({ HIVE_IDLE_COMPACT_AFTER_MS: "20000" }).afterMs, 20000);
  const soon = idleCompactVerdict({ ...base, now: 1000 + 20000, settings: { ...settings, afterMs: 20000 } });
  assert.equal(soon.fire, true, "the delay knob moves when it fires, the cache still decides when it is too late");
});

test("the context and the cache kind come off the usage of the last main-thread answer", () => {
  assert.equal(contextTokensOf(usage(456343, 6920)), 2 + 456343 + 6920);
  assert.equal(cacheTtlOf(usage(1, 10)), "1h");
  assert.equal(cacheTtlOf(usage(1, 10, "5m")), "5m");
  assert.equal(cacheTtlOf(usage(1, 0)), "");
  const after = noteForIdleCompact({}, answer(usage(300000, 500)));
  assert.equal(after.worked, true);
  assert.equal(after.tokens, 300502);
  assert.equal(after.ttl, "1h");
  const allRead = noteForIdleCompact(after, answer(usage(310000, 0)));
  assert.equal(allRead.ttl, "1h", "an answer read whole from the cache keeps the kind already seen");
});

test("a subagent's answer and the synthetic answer of a compaction are not work in the main conversation", () => {
  const sub = noteForIdleCompact({ worked: false, tokens: 10 }, answer(usage(900000, 1), { parent_tool_use_id: "toolu_1" }));
  assert.deepEqual(sub, { worked: false, tokens: 10 });
  const synthetic = { type: "assistant", parent_tool_use_id: null, message: { model: "<synthetic>", usage: usage(0, 0) } };
  assert.deepEqual(noteForIdleCompact({ worked: false, tokens: 10 }, synthetic), { worked: false, tokens: 10 });
});

test("any compaction clears the work and takes the size it left", () => {
  const boundary = { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 467494, post_tokens: 12169 } };
  const after = noteForIdleCompact(mark, boundary);
  assert.equal(after.worked, false);
  assert.equal(after.tokens, 12169);
});

test("a real turn ending moves turn_at; the idle compaction ending does not", () => {
  const result = { type: "result", session_id: "abc" };
  assert.equal(noteForIdleCompact({ ...mark, session: "" }, result, { now: 5000 }).turn_at, 5000);
  assert.equal(noteForIdleCompact({ ...mark, session: "" }, result, { now: 5000 }).session, "abc");
  assert.equal(noteForIdleCompact(mark, result, { now: 5000, idle: true }).turn_at, mark.turn_at);
});

test("a whole quiet compacts once: after the idle compaction nothing fires again until real work", () => {
  let m = noteForIdleCompact({}, answer(usage(300000, 500)));
  m = noteForIdleCompact(m, { type: "result", session_id: "abc" }, { now: 1000 });
  const first = idleCompactVerdict({ ...base, mark: m });
  assert.equal(first.fire, true);
  m = { ...m, tried_for: m.turn_at };
  m = noteForIdleCompact(m, { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 300502, post_tokens: 400000 } }, { idle: true });
  m = noteForIdleCompact(m, { type: "result", session_id: "abc" }, { now: 1000 + HOUR * 0.91, idle: true });
  assert.equal(idleCompactVerdict({ ...base, now: 1000 + HOUR * 0.95, mark: m }).fire, false, "even a summary still past the floor is not compacted twice");
  m = noteForIdleCompact(m, answer(usage(390000, 20000)));
  m = noteForIdleCompact(m, { type: "result", session_id: "abc" }, { now: 1000 + HOUR * 2 });
  assert.equal(idleCompactVerdict({ ...base, now: 1000 + HOUR * 2.9, mark: m }).fire, true, "new work opens a new quiet");
});

test("the boundary of an idle compaction reads as idle and its result says it was no answer", () => {
  const boundary = { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 1, post_tokens: 1 } };
  assert.equal(idleTagged(boundary).compact_metadata.trigger, "idle");
  assert.equal(boundary.compact_metadata.trigger, "manual", "the original is not mutated");
  assert.equal(idleTagged({ type: "result", num_turns: 0 }).idle_compact, true);
  const other = { type: "user", message: {} };
  assert.equal(idleTagged(other), other);
});
