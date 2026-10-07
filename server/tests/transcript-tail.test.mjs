import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcriptTail } from "../engine/protocol.mjs";

const turn = (type, n, more = {}) => JSON.stringify({ type, message: { role: type, content: `turn ${n}` }, ...more });

function transcript(lines) {
  const file = join(mkdtempSync(join(tmpdir(), "transcript-tail-")), "t.jsonl");
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

test("the replay keeps the last turns and counts all of them, reading the file in pieces", async () => {
  const lines = Array.from({ length: 1000 }, (_, n) => turn(n % 2 ? "assistant" : "user", n));
  const { tail, total } = await transcriptTail(transcript(lines), 400);
  assert.equal(total, 1000);
  assert.equal(tail.length, 400);
  assert.equal(tail[0].message.content, "turn 600");
  assert.equal(tail.at(-1).message.content, "turn 999");
  assert.ok(tail.every((event) => event.replayed && event.parent_tool_use_id === null));
});

test("side chains, meta lines, other entries and broken lines stay out of the replay", async () => {
  const lines = [
    turn("user", 1),
    turn("assistant", 2, { isSidechain: true }),
    turn("user", 3, { isMeta: true }),
    JSON.stringify({ type: "summary", summary: "x" }),
    "not json",
    turn("assistant", 4)
  ];
  const { tail, total } = await transcriptTail(transcript(lines));
  assert.equal(total, 2);
  assert.deepEqual(tail.map((event) => event.message.content), ["turn 1", "turn 4"]);
});

test("a line separator inside a message does not break the turn in two", async () => {
  const { tail } = await transcriptTail(transcript([turn("user", "a b")]));
  assert.equal(tail.length, 1);
  assert.equal(tail[0].message.content, "turn a b");
});
