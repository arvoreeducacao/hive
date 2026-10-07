import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { SELECTION_SETTLE_MS, clipboardFromSession, copyOnSelect } = await app("terminal-pool");

const clipped = [];
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: async (text) => { clipped.push(text); } },
  configurable: true
});

const settle = () => new Promise((done) => setImmediate(done));

function clock() {
  clipped.length = 0;
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  return {
    tick: (ms) => mock.timers.tick(ms),
    stop: () => mock.timers.reset()
  };
}

function fakeTerm() {
  let onChange = () => {};
  let selection = "";
  return {
    onSelectionChange: (fn) => { onChange = fn; },
    getSelection: () => selection,
    select: (text) => { selection = text; onChange(); }
  };
}

test("the same clipboard arriving from two mirrors is written once", async () => {
  const time = clock();
  clipboardFromSession("two mirrors");
  time.tick(3);
  clipboardFromSession("two mirrors");
  time.stop();
  await settle();
  assert.deepEqual(clipped, ["two mirrors"]);
});

test("three mirrors still write it once", async () => {
  const time = clock();
  for (let i = 0; i < 3; i += 1) { clipboardFromSession("three mirrors"); time.tick(2); }
  time.stop();
  await settle();
  assert.deepEqual(clipped, ["three mirrors"]);
});

test("copying different text is never swallowed", async () => {
  const time = clock();
  clipboardFromSession("one");
  time.tick(3);
  clipboardFromSession("two");
  time.stop();
  await settle();
  assert.deepEqual(clipped, ["one", "two"]);
});

test("the same text copied again after the echo window goes in again", async () => {
  const time = clock();
  clipboardFromSession("again later");
  time.tick(1600);
  clipboardFromSession("again later");
  time.stop();
  await settle();
  assert.deepEqual(clipped, ["again later", "again later"]);
});

test("a burst of echoes does not push the window forward forever", async () => {
  const time = clock();
  clipboardFromSession("burst");
  for (let i = 0; i < 5; i += 1) { time.tick(400); clipboardFromSession("burst"); }
  time.stop();
  await settle();
  assert.deepEqual(clipped, ["burst", "burst"]);
});

test("a drag across the terminal copies only the final selection", async () => {
  const time = clock();
  const term = fakeTerm();
  copyOnSelect(term);
  for (const step of ["h", "he", "hel", "hello"]) term.select(step);
  time.tick(SELECTION_SETTLE_MS);
  time.stop();
  await settle();
  assert.deepEqual(clipped, ["hello"]);
});

test("clearing the selection writes nothing to the clipboard", async () => {
  const time = clock();
  const term = fakeTerm();
  copyOnSelect(term);
  term.select("hello again");
  time.tick(SELECTION_SETTLE_MS);
  term.select("");
  time.tick(SELECTION_SETTLE_MS);
  time.stop();
  await settle();
  assert.deepEqual(clipped, ["hello again"]);
});
