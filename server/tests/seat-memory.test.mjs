import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { READ_OPS, readsOnly, wakesTheSeat, answerWhileAsleep } from "../engine/seat-memory.mjs";

test("only state and the read-only control ops leave a sleeping seat alone", () => {
  assert.equal(wakesTheSeat({ type: "state" }), false);
  for (const op of READ_OPS) assert.equal(wakesTheSeat({ type: "control", op }), false, op);
  for (const op of ["setModel", "setEffort", "setMode", "setAccount", "compact", "mcpReconnect", "reinit", "setTitle", "spendBirth"]) {
    assert.equal(wakesTheSeat({ type: "control", op }), true, op);
  }
  for (const type of ["say", "answer", "interrupt", "expect", "unexpect", "unsay", "saynow"]) assert.equal(wakesTheSeat({ type }), true, type);
  assert.equal(readsOnly({ type: "say" }), false);
});

test("a sleeping seat answers a read from memory, and says so when it has nothing remembered", () => {
  const remembered = new Map([["context", { totalTokens: 12, maxTokens: 200, percentage: 6 }]]);
  assert.deepEqual(answerWhileAsleep({ type: "control", op: "context" }, remembered), {
    ok: true, data: { totalTokens: 12, maxTokens: 200, percentage: 6 }, remembered: true, asleep: true,
  });
  const empty = answerWhileAsleep({ type: "control", op: "catalog" }, remembered);
  assert.equal(empty.ok, false);
  assert.equal(empty.asleep, true);
  assert.match(empty.error, /asleep/);
  assert.equal(answerWhileAsleep({ type: "say", text: "oi" }, remembered), null);
  assert.equal(answerWhileAsleep({ type: "control", op: "setModel" }, remembered), null);
});

test("the claude driver wakes only for what wakesTheSeat says, and answers reads from memory while asleep", () => {
  const driver = readFileSync(new URL("../engine/driver.mjs", import.meta.url), "utf8");
  assert.match(driver, /function handleCommand\(cmd, reply\) \{\s*if \(wakesTheSeat\(cmd\) && sleeping && !query\) \{[\s\S]*?\n  \}\s*if \(wakesTheSeat\(cmd\)\) ensureAwake\(\);\s*if \(sleeping\) \{\s*const fromMemory = answerWhileAsleep\(cmd, remembered\);\s*if \(fromMemory\) return reply\(fromMemory\);\s*\}/);
  assert.match(driver, /asleep: sleeping/);
  assert.match(driver, /remember\("catalog"/);
  assert.match(driver, /remember\("context"/);
});

test("the pane opening or closing does not wake the seat, and the state says who is looking and what runs behind", () => {
  assert.equal(wakesTheSeat({ type: "presence", watched: true }), false);
  assert.equal(wakesTheSeat({ type: "presence", watched: false }), false);
  const driver = readFileSync(new URL("../engine/driver.mjs", import.meta.url), "utf8");
  assert.match(driver, /asleep: sleeping, watched, tasks: backgroundTasks\.size/);
  assert.match(driver, /const sleepAfter = \(\) => sleepAfterMs\(process\.env, \{ watched \}\)/);
  assert.match(driver, /tasks: backgroundTasks\.size,\s*\}\);/);
  assert.match(driver, /noteTasks\(message\);\s*emit\(message\);/);
});
