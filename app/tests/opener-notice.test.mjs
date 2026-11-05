import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { childrenWaited, freshTalk, hearEvent, noticeText, openerNotice, someoneWaits, NOTICE_REPLY_CHARS } from "../lib/opener-notice.mjs";
import { markTold, noteErrand, readErrands } from "../lib/errands.mjs";

const LONG_AGO = "2026-11-04T10:00:00.000Z";
const NOW = Date.parse("2026-11-04T10:05:00.000Z");

const said = (seq, text) => ({ seq, type: "assistant", message: { content: [{ type: "text", text }] }, parent_tool_use_id: null });
const sub = (seq, text) => ({ seq, type: "assistant", message: { content: [{ type: "text", text }] }, parent_tool_use_id: "toolu_1" });
const result = (seq, extra = {}) => ({ seq, type: "result", ts: LONG_AGO, ...extra });
const say = (seq, from, extra = {}) => ({ seq, type: "user", subtype: "say", from, message: { content: [{ type: "text", text: "oi" }] }, ...extra });
const wrote = (seq, name, seat) => ({ seq, type: "assistant", message: { content: [{ type: "tool_use", name, input: { seat, text: "pronto" } }] }, parent_tool_use_id: null });

function talkOf(events) {
  const talk = freshTalk();
  for (const e of events) hearEvent(talk, e);
  return talk;
}

const finishOf = (talk, extra = {}) => ({ seq: talk.final.seq, at: LONG_AGO, ...extra });

function notice(events, record = { by: "lead", told: -1 }, extra = {}) {
  const talk = talkOf(events);
  return openerNotice({ seat: "council-gpt", record, state: "done", finish: finishOf(talk), talk, now: NOW, ...extra });
}

test("the mission's turn ends, and the opener gets the last reply", () => {
  const got = notice([said(1, "olhando"), said(2, "nota 8/10, falta teste"), result(3)]);
  assert.equal(got.opener, "lead");
  assert.equal(got.told, 3);
  assert.match(got.text, /finished the turn you were waiting on/);
  assert.match(got.text, /nota 8\/10, falta teste$/);
});

test("the reply the result carries wins over the last text seen", () => {
  const got = notice([said(1, "rascunho"), result(2, { result: "a resposta final" })]);
  assert.match(got.text, /a resposta final$/);
});

test("text from a subagent inside the turn is not the chat's reply", () => {
  const got = notice([said(1, "o veredito"), sub(2, "achado do subagente"), result(3)]);
  assert.match(got.text, /o veredito$/);
});

test("a chat still working, or waiting on the person, tells nobody yet", () => {
  const talk = talkOf([said(1, "x"), result(2)]);
  for (const state of ["working", "needs"]) {
    assert.equal(openerNotice({ seat: "council-gpt", record: { by: "lead", told: -1 }, state, finish: finishOf(talk), talk, now: NOW }), null);
  }
});

test("a turn that just ended waits a moment, so a queued message can start the next one", () => {
  const talk = talkOf([said(1, "x"), result(2)]);
  const fresh = { seq: 2, at: new Date(NOW - 1000).toISOString() };
  assert.equal(openerNotice({ seat: "council-gpt", record: { by: "lead", told: -1 }, state: "done", finish: fresh, talk, now: NOW }), null);
});

test("once told, the same turn is never told again", () => {
  assert.equal(notice([said(1, "x"), result(2)], { by: "lead", told: 2 }), null);
});

test("after the first answer, only a new message from the opener makes another one owed", () => {
  const byThePerson = [said(1, "x"), result(2), say(3, null), said(4, "y"), result(5)];
  assert.equal(notice(byThePerson, { by: "lead", told: 2 }), null, "a turn the person drove does not ping the opener");
  const byTheOpener = [said(1, "x"), result(2), say(3, "lead"), said(4, "segunda rodada: 9/10"), result(5)];
  const got = notice(byTheOpener, { by: "lead", told: 2 });
  assert.equal(got.told, 5);
  assert.match(got.text, /segunda rodada: 9\/10$/);
});

test("an answer the chat's own ask took in does not count as a new request", () => {
  const events = [said(1, "x"), result(2), say(3, "lead", { consumed: true }), said(4, "y"), result(5)];
  assert.equal(notice(events, { by: "lead", told: 2 }), null);
});

test("a chat that already messaged its opener is not repeated, but the turn is marked told", () => {
  for (const name of ["mcp__hive__message", "message", "hive_message"]) {
    const got = notice([said(1, "x"), wrote(2, name, "lea"), result(3)]);
    assert.deepEqual(got, { opener: "lead", told: 3, text: "" }, name);
  }
});

test("a message to some other seat, or another tool called message, still leaves the opener owed", () => {
  assert.ok(notice([said(1, "x"), wrote(2, "mcp__hive__message", "outro"), result(3)]).text);
  const slack = { seq: 2, type: "assistant", message: { content: [{ type: "tool_use", name: "send_message", input: { channel: "C1", text: "oi" } }] }, parent_tool_use_id: null };
  assert.ok(notice([said(1, "x"), slack, result(3)]).text);
});

test("a chat nobody opened, or one that opened itself, has no one to tell", () => {
  assert.equal(notice([said(1, "x"), result(2)], { told: -1 }), null);
  assert.equal(notice([said(1, "x"), result(2)], { by: "council-gpt", told: -1 }), null);
});

test("a chat opened before the hive kept count is never told, so an update does not flood its opener", () => {
  assert.equal(notice([said(1, "x"), result(2)], { by: "lead" }), null);
});

test("a turn the person stopped says so instead of calling it finished", () => {
  const got = notice([said(1, "metade"), result(2, { subtype: "interrupted" })]);
  assert.match(got.text, /its turn was stopped before the end/);
});

test("a claude turn stopped by hand ends as an error, and the notice still calls it stopped", () => {
  const talk = talkOf([said(1, "metade"), { seq: 2, type: "driver", subtype: "interrupted" }, result(3, { subtype: "error_during_execution", is_error: true })]);
  const got = openerNotice({ seat: "council-gpt", record: { by: "lead", told: -1 }, state: "done", finish: { seq: 3, at: LONG_AGO, error: true }, talk, now: NOW });
  assert.match(got.text, /its turn was stopped before the end/);
  const next = talkOf([said(1, "x"), { seq: 2, type: "driver", subtype: "interrupted" }, result(3), said(4, "y"), result(5)]);
  assert.equal(next.final.stopped, false, "the stop belongs to the turn it happened in");
});

test("an idle compaction is not a turn the opener waited on", () => {
  const talk = talkOf([said(1, "x"), result(2), result(3, { idle_compact: true })]);
  assert.equal(talk.final.seq, 2);
});

test("an empty reply and an error say so instead of sending nothing", () => {
  assert.match(noticeText("council-gpt", { reply: "" }), /without a written reply — peek it/);
  assert.match(noticeText("council-gpt", { reply: "quebrou" }, true), /its turn ended in an error/);
});

test("a long reply is cut and says where the rest is", () => {
  const talk = talkOf([said(1, "a".repeat(NOTICE_REPLY_CHARS + 50)), result(2)]);
  assert.equal(talk.final.clipped, true);
  assert.match(noticeText("council-gpt", talk.final), /ask council-gpt for the rest\)$/);
});

test("the app only keeps looking while a chat opened by a chat is still around", () => {
  assert.equal(someoneWaits({}), false);
  assert.equal(someoneWaits({ "by-hand": { errand: "x", endedAt: 0 } }), false, "a chat the person opened owes nobody");
  assert.equal(someoneWaits({ old: { by: "lead", endedAt: 0 } }), false, "a chat from before the count never sends");
  assert.equal(someoneWaits({ gone: { by: "lead", told: 4, endedAt: 99 } }), false, "a closed chat has nothing left to say");
  assert.equal(someoneWaits({ live: { by: "lead", told: -1, endedAt: 0 } }), true);
  assert.deepEqual([...childrenWaited({ live: { by: "lead", told: 3, endedAt: 0 }, "by-hand": { errand: "x", endedAt: 0 } })], ["live"], "only the children are read twice, never every chat");
});

test("the told mark lands on the errand and survives the next read", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "hive-told-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  noteErrand(home, { seat: "council-gpt", errand: "council", by: "lead", at: 1 });
  assert.equal(readErrands(home)["council-gpt"].told, -1, "a chat born from a chat owes its opener the mission");
  noteErrand(home, { seat: "by-hand", errand: "algo", at: 1 });
  assert.equal("told" in readErrands(home)["by-hand"], false, "a chat the person opened owes nobody");
  markTold(home, "council-gpt", 7);
  const one = readErrands(home)["council-gpt"];
  assert.equal(one.told, 7);
  assert.equal(one.by, "lead");
  assert.ok(markTold(home, "nobody", 1).error);
});
