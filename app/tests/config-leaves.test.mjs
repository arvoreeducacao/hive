import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "jsonc-parser";
import { editLeaves } from "../lib/config-leaves.mjs";

const write = (current, patch) => {
  const text = `// hive settings\n${JSON.stringify(current, null, 2)}\n`;
  return { text: editLeaves(text, patch, current), value: parse(editLeaves(text, patch, current)) };
};

test("turning one chat rule off keeps every other chat rule the file had", () => {
  const { value } = write({ threads: { workingSection: false, groupByProject: true, autoSettleMerged: true } }, { threads: { autoSettleMerged: false } });
  assert.deepEqual(value.threads, { workingSection: false, groupByProject: true, autoSettleMerged: false });
});

test("each chat rule saved on its own adds up instead of wiping the one before", () => {
  const first = write({}, { threads: { workingSection: false } });
  const second = { text: editLeaves(first.text, { threads: { autoSettleMerged: false } }, first.value) };
  assert.deepEqual(parse(second.text).threads, { workingSection: false, autoSettleMerged: false });
});

test("a repository taken out of the settle commands still leaves the file", () => {
  const { value } = write({ threads: { workingSection: false, settleCommands: { "org/a": "rm -rf .next", "org/b": "make clean" } } }, { threads: { settleCommands: { "org/a": "rm -rf .next" } } });
  assert.deepEqual(value.threads, { workingSection: false, settleCommands: { "org/a": "rm -rf .next" } });
});

test("a section saved whole still drops the keys it no longer has", () => {
  const { value } = write({ keys: { close: "ctrl+w", open: "ctrl+o" } }, { keys: { close: "ctrl+w" } });
  assert.deepEqual(value.keys, { close: "ctrl+w" });
});

test("the comments at the top of the file survive a write", () => {
  const { text } = write({ threads: { workingSection: false } }, { threads: { autoSettleMerged: false } });
  assert.match(text, /^\/\/ hive settings/);
});
