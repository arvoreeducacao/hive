import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./dom.mjs";

const { svAlreadyPainted } = await app("chat-and-panes");

const SRC = fileURLToPath(new URL("../src/app/", import.meta.url));
const sources = readdirSync(SRC).filter((one) => one.endsWith(".js")).map((one) => readFileSync(join(SRC, one), "utf8"));

const chat = () => ({ lastSeq: 0 });

test("an event the chat already painted is refused", () => {
  const e = chat();
  assert.equal(svAlreadyPainted(e, { seq: 715, subtype: "question" }), false);
  assert.equal(svAlreadyPainted(e, { seq: 715, subtype: "question" }), true);
  assert.equal(e.lastSeq, 715);
});

test("a second feed of the same seat paints nothing twice", () => {
  const e = chat();
  const one = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
  const took = [];
  for (const ev of [...one, ...one]) if (!svAlreadyPainted(e, ev)) took.push(ev.seq);
  assert.deepEqual(took, [1, 2, 3]);
});

test("what the driver says about itself carries no seq, and always gets through", () => {
  const e = chat();
  svAlreadyPainted(e, { seq: 9 });
  for (const note of ["rewound", "warning", "windowed"]) {
    assert.equal(svAlreadyPainted(e, { type: "driver", subtype: note }), false, `the chat swallowed "${note}"`);
  }
});

test("a chat that was emptied paints the conversation again", () => {
  const e = chat();
  svAlreadyPainted(e, { seq: 40 });
  e.lastSeq = 0;
  assert.equal(svAlreadyPainted(e, { seq: 12 }), false);
});

test("the rule lives in one place: nobody else decides what was already painted", () => {
  const declarations = sources.reduce((count, one) => count + one.split("function svAlreadyPainted(").length - 1, 0);
  assert.equal(declarations, 1);
  assert.equal(sources.filter((one) => /for \(const ev of events\) svEvent\(e, ev\);/.test(one)).length, 1);
  for (const one of sources) assert.doesNotMatch(one, /<= \(e\.lastSeq \|\| 0\)\) continue/, "someone else still keeps a rule of its own");
});
