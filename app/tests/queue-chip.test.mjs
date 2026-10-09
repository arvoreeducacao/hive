import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

const { svConvFlushAll } = await app("conversation-model");

await views();

const { svDequeue, svDequeuedEarly, svQueueRefused, svWasDequeuedEarly } = await app("structured-seats");
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");

const HERE = fileURLToPath(new URL("../src/app", import.meta.url));
const stretches = readFileSync(join(HERE, "chat-stretches.js"), "utf8");
const panes = readFileSync(join(HERE, "chat-and-panes.js"), "utf8");

const slice = (text, from, to, what) => {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
};

function chip(text, cid) {
  const el = document.createElement("span");
  el.className = "sv-q";
  el.dataset.text = text;
  el.dataset.cid = cid;
  return el;
}

let seq = 0;

function seatWith(...chips) {
  const e = getStructured({ name: `queue-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  e.queuedEls = [...chips];
  for (const one of chips) tray(e).appendChild(one);
  return e;
}

const tray = (e) => (svConvFlushAll(), e.host).querySelector(".sv-queue");
const lines = (e) => [...(svConvFlushAll(), e.scroll).children];

test("with no chip named, the oldest one leaves — the driver dequeues in the same order", () => {
  const [first, second] = [chip("first", "c1-aa"), chip("second", "c2-aa")];
  const e = seatWith(first, second);
  svDequeue(e);
  assert.equal(first.isConnected, false);
  assert.deepEqual(e.queuedEls, [second]);
  assert.equal(tray(e).classList.contains("on"), true);
  assert.equal(lines(e).at(-1).textContent, "first");
});

test("the chip the driver dispatched leaves, even when it is not the oldest", () => {
  const [first, second] = [chip("first", "c1-aa"), chip("second", "c2-aa")];
  const e = seatWith(first, second);
  svDequeue(e, second);
  assert.equal(second.isConnected, false);
  assert.equal(first.isConnected, true);
  assert.deepEqual(e.queuedEls, [first]);
});

test("a chip that left is marked, so a reply that lands later paints nothing twice", () => {
  const one = chip("only", "c1-aa");
  const e = seatWith(one);
  svDequeue(e, one);
  assert.equal(one.dataset.gone, "1");
  assert.equal(tray(e).classList.contains("on"), false);
});

test("a refused queue button says why, and stays quiet when there was nothing to say", () => {
  const e = seatWith();
  svQueueRefused(e, { ok: false, error: "not in the queue — already dispatched or unknown" });
  assert.equal(lines(e).at(-1).textContent, "not in the queue — already dispatched or unknown");
  assert.equal(lines(e).at(-1).className, "sv-meta warn");
  svQueueRefused(e, { ok: false, silent: true, error: "the driver did not answer" });
  svQueueRefused(e, null);
  assert.equal(lines(e).length, 1);
});

test("the queue is drawn from the driver's answer, not from what the panel guesses", () => {
  const deliver = slice(stretches, "svCmd(e, sending.length ?", "const dropFromTray", "chat-stretches.js");
  assert.match(deliver, /const wentIn = svWasDequeuedEarly\(e, r\.cid\);/);
  assert.match(deliver, /if \(!wentIn && \(r\.queued \?\? \(e\.turnOpen && !r\.dismissed\)\)\)/);
});

test("a message the driver dispatched before its own reply came back is a line in the chat, never a chip", () => {
  const e = seatWith();
  e.turnOpen = true;
  svEvent(e, { type: "driver", subtype: "dispatched", cid: "c3-aa", seq: 1 });
  assert.equal(svWasDequeuedEarly(e, "c3-aa"), true, "the panel remembers the cid that left before the chip existed");
  assert.equal(svWasDequeuedEarly(e, "c3-aa"), false, "and only once — the next say with that cid is a different message");
});

test("the panel forgets nothing it is still holding — a chip that is there leaves instead of being remembered", () => {
  const one = chip("held", "c4-aa");
  const e = seatWith(one);
  svEvent(e, { type: "driver", subtype: "dispatched", cid: "c4-aa", seq: 1 });
  assert.equal(one.isConnected, false);
  assert.equal(svWasDequeuedEarly(e, "c4-aa"), false);
});

test("what the panel remembers has a floor to stand on — old cids fall off", () => {
  const e = seatWith();
  for (let i = 0; i < 60; i += 1) svDequeuedEarly(e, `c${i}-aa`);
  assert.equal(e.dequeued.size, 40);
  assert.equal(svWasDequeuedEarly(e, "c0-aa"), false);
  assert.equal(svWasDequeuedEarly(e, "c59-aa"), true);
});

test("take back on a message already in the turn puts it in the chat instead of leaving the chip dead", () => {
  const buttons = slice(stretches, "const takeBack = (item)", "const say = () =>", "chat-stretches.js");
  assert.match(buttons, /if \(r\?\.gone\) svDequeue\(e, item\);/);
});

test("both queue buttons hand a refusal to the chat instead of dropping it", () => {
  const buttons = slice(stretches, "const sendNow = (item)", "const say = () =>", "chat-stretches.js");
  assert.equal((buttons.match(/svQueueRefused\(e, r\)/g) || []).length, 2, "send now and take back both answer");
  assert.equal(/if \(!r\?\.ok\) return;/.test(buttons), false, "a silent return is a button that reads as broken");
});

test("the chip leaves on the driver's word, and the init fallback stands down once it hears it", () => {
  const [first, second] = [chip("first", "c1-aa"), chip("second", "c2-aa")];
  const e = seatWith(first, second);
  svEvent(e, { type: "driver", subtype: "dispatched", cid: "c2-aa", seq: 1 });
  assert.equal(e.driverDequeues, true);
  assert.equal(second.isConnected, false);
  assert.equal(first.isConnected, true);
  svEvent(e, { type: "system", subtype: "init", working: true, seq: 2 });
  assert.equal(first.isConnected, true);
  assert.deepEqual(e.queuedEls, [first]);
});
