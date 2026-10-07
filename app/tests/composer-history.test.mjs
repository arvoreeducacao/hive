import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./dom.mjs";

const { rememberSent, stepHistory } = await app("chat-stretches");

const HERE = fileURLToPath(new URL("../src/app", import.meta.url));
const stretches = readFileSync(join(HERE, "chat-stretches.js"), "utf8");
const panes = readFileSync(join(HERE, "chat-and-panes.js"), "utf8");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const seatWith = (sent = [], sentSeqs = []) => ({ sent: [...sent], sentSeqs: new Set(sentSeqs) });

test("the transcript is the memory — a replayed message seeds the history once", () => {
  const e = seatWith();
  rememberSent(e, "hello there", 41);
  rememberSent(e, "hello there", 41);
  assert.deepEqual(e.sent, ["hello there"]);
});

test("fresh sends from before the rebuild come back in order", () => {
  const e = seatWith();
  rememberSent(e, "first", 10);
  rememberSent(e, "second", 11);
  rememberSent(e, "third", 12);
  assert.deepEqual(e.sent, ["first", "second", "third"]);
  assert.deepEqual(stepHistory(e.sent, null, -1), { idx: 2, text: "third" });
});

test("an echo of what the box just sent does not double it", () => {
  const e = seatWith(["queued one"]);
  rememberSent(e, "queued one", 77);
  assert.deepEqual(e.sent, ["queued one"]);
});

test("what another chat wrote here never enters the box's memory", () => {
  const say = slice(panes, 'if (ev.subtype === "say") {', "svPeerFrom(e, ev.from", "chat-and-panes.js");
  const seed = say.indexOf("rememberSent(e, text, ev.seq)");
  assert.ok(seed >= 0, "the say event seeds the history");
  assert.match(say.slice(0, seed), /!ev\.from/, "peer messages are not yours to recall");
  assert.ok(say.indexOf("e.said?.has(ev.cid)") > seed, "seeding happens before the echo of our own send is skipped");
});

test("native commands and mirror sends, which never echo, are remembered on the spot", () => {
  const deliver = slice(stretches, "const deliver = (text, sending, fromDraft) => {", "const dropFromTray =", "chat-stretches.js");
  assert.match(deliver, /if \(e\.mirror\) \{[^`]*?rememberSent\(e, text\)/s);
  assert.match(deliver, /rememberSent\(e, text\);\n\s*runNativeCommand/);
  const serverPath = deliver.slice(deliver.indexOf("svCmd(e,"));
  assert.doesNotMatch(serverPath, /rememberSent/, "a real say seeds from the transcript echo, not twice");
});

const sent = ["first", "second", "third"];

test("with nothing sent there is nothing to cycle", () => {
  assert.equal(stepHistory([], null, -1), null);
});

test("the first up lands on the newest message", () => {
  assert.deepEqual(stepHistory(sent, null, -1), { idx: 2, text: "third" });
});

test("up walks back one at a time and holds on the oldest", () => {
  assert.deepEqual(stepHistory(sent, 2, -1), { idx: 1, text: "second" });
  assert.deepEqual(stepHistory(sent, 1, -1), { idx: 0, text: "first" });
  assert.deepEqual(stepHistory(sent, 0, -1), { idx: 0, text: "first" });
});

test("down walks forward and past the newest the box is empty again", () => {
  assert.deepEqual(stepHistory(sent, 0, 1), { idx: 1, text: "second" });
  assert.deepEqual(stepHistory(sent, 2, 1), { idx: null, text: "" });
  assert.deepEqual(stepHistory(sent, null, 1), { idx: null, text: "" });
});

test("the queue keeps its arrow — history only opens when nothing is queued", () => {
  const keys = slice(stretches, 'textarea.addEventListener("keydown"', 'textarea.addEventListener("input"', "chat-stretches.js");
  const queueBranch = keys.indexOf("takeBack(e.queuedEls[e.queuedEls.length - 1])");
  const historyBranch = keys.indexOf("stepHistory(e.sent, e.histIdx, -1)");
  assert.ok(queueBranch >= 0 && historyBranch > queueBranch, "the take-back branch wins while there is a queue");
  assert.match(keys, /kev\.key === "ArrowUp"[^}]*!textarea\.value\) \{\n\s*const step = stepHistory/);
});

test("down only means history while a recall is showing", () => {
  const keys = slice(stretches, 'textarea.addEventListener("keydown"', 'textarea.addEventListener("input"', "chat-stretches.js");
  assert.match(keys, /kev\.key === "ArrowDown"[^)]*e\.histIdx != null/);
});

test("typing again lets the cycling go", () => {
  const input = slice(stretches, 'textarea.addEventListener("input"', 'textarea.addEventListener("blur"', "chat-stretches.js");
  assert.match(input, /e\.histIdx = null;/);
});

test("everything the box sends is remembered once, consecutive repeats included only once", () => {
  const deliver = slice(stretches, "const deliver = (text, sending, fromDraft) => {", "const dropFromTray =", "chat-stretches.js");
  assert.match(deliver, /e\.histIdx = null;/);
  const e = seatWith();
  rememberSent(e, "again");
  rememberSent(e, "again");
  rememberSent(e, "again");
  assert.deepEqual(e.sent, ["again"]);
  rememberSent(e, "else");
  rememberSent(e, "again");
  assert.deepEqual(e.sent, ["again", "else", "again"]);
});

test("the memory holds two hundred messages and lets the oldest go", () => {
  const e = seatWith();
  for (let i = 0; i < 210; i++) rememberSent(e, `message ${i}`, i);
  assert.equal(e.sent.length, 200);
  assert.equal(e.sent.at(-1), "message 209");
});
