import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linesBackward, seqOf, readHistory } from "../events-tail.mjs";
import { eventLine } from "../engine/protocol.mjs";

function scratch(name, text) {
  const dir = mkdtempSync(join(tmpdir(), "events-tail-"));
  const file = join(dir, name);
  writeFileSync(file, text);
  return { file, gone: () => rmSync(dir, { recursive: true, force: true }) };
}

const say = (seq, text) => eventLine(seq, { type: "user", subtype: "say", message: { role: "user", content: [{ type: "text", text }] } });
const toolResult = (seq) => eventLine(seq, { type: "user", message: { role: "user", content: [{ type: "tool_result", content: 'looks like "type":"user" inside' }] } });
const answer = (seq, text) => eventLine(seq, { type: "assistant", message: { role: "assistant", content: [{ type: "text", text }] } });
const result = (seq) => eventLine(seq, { ttft_ms: 1, type: "result", subtype: "success" });
const stream = (seq) => eventLine(seq, { type: "stream_event", event: { delta: "…" } });

function conversation(turns, { withStream = false, withTools = false } = {}) {
  const lines = [];
  let seq = 0;
  for (let turn = 0; turn < turns; turn++) {
    lines.push(say(++seq, `pergunta ${turn} çãé`));
    if (withStream) lines.push(stream(++seq));
    if (withTools) lines.push(toolResult(++seq));
    lines.push(answer(++seq, `resposta ${turn} `.repeat(20)));
    lines.push(result(++seq));
  }
  return lines;
}

test("linesBackward walks the file from the end, whole lines, across chunk edges and multibyte characters", () => {
  const lines = ["primeira ação", "", "segunda çãé linha bem mais comprida que o bloco", "terceira 🌳"];
  const { file, gone } = scratch("a.ndjson", lines.join("\n") + "\n");
  try {
    for (const chunk of [1, 3, 7, 64, 1 << 20]) {
      assert.deepEqual([...linesBackward(file, chunk)], ["terceira 🌳", "segunda çãé linha bem mais comprida que o bloco", "primeira ação"], `chunk ${chunk}`);
    }
  } finally {
    gone();
  }
  const noTail = scratch("b.ndjson", "só uma\nduas");
  try {
    assert.deepEqual([...linesBackward(noTail.file, 4)], ["duas", "só uma"]);
  } finally {
    noTail.gone();
  }
});

test("seqOf reads the sequence the driver writes first on every line, and nothing else", () => {
  assert.equal(seqOf('{"seq":42,"ts":"x","type":"result"}'), 42);
  assert.equal(seqOf('{"seq":7}'), 7);
  assert.equal(seqOf('{"ts":"x","seq":9}'), null);
  assert.equal(seqOf("garbage"), null);
});

test("readHistory keeps only the tail the window needs and still counts the whole file exactly", () => {
  const lines = conversation(30, { withStream: true, withTools: true });
  const { file, gone } = scratch("c.ndjson", lines.join("\n") + "\n");
  try {
    const desk = readHistory(file, { want: { humanTurns: 11 }, chunkBytes: 512 });
    assert.equal(desk.whole, false, "it stopped before the start of the file");
    assert.equal(desk.rows.filter((row) => row.event.type === "user" && row.event.subtype === "say").length, 11);
    assert.equal(desk.rows[0].event.message.content[0].text, "pergunta 19 çãé");
    assert.equal(desk.rows.at(-1).event.type, "result");
    assert.ok(!desk.rows.some((row) => row.event.type === "stream_event"));
    assert.deepEqual(desk.totals, { rows: 120, humans: 30, results: 30 }, "totals count every row of the file, stream events left out");
    assert.equal(desk.seq, 150);

    const all = readHistory(file, { chunkBytes: 512 });
    assert.equal(all.whole, true);
    assert.equal(all.rows.length, 120);
    assert.deepEqual(all.totals, desk.totals);

    const wider = readHistory(file, { want: { humanTurns: 100 }, chunkBytes: 512 });
    assert.equal(wider.whole, true, "a window wider than the file reads it whole");
    assert.equal(wider.rows.length, 120);
  } finally {
    gone();
  }
});

test("readHistory stops at from, skips from before on, and the phone tail collects floor rows past the earliest result", () => {
  const lines = conversation(40);
  const { file, gone } = scratch("d.ndjson", lines.join("\n") + "\n");
  try {
    const after = readHistory(file, { from: 117, chunkBytes: 256 });
    assert.deepEqual(after.rows.map((row) => row.event.seq), [118, 119, 120]);
    assert.equal(after.seq, 120);

    const page = readHistory(file, { before: 61, want: { humanTurns: 11 }, chunkBytes: 256 });
    assert.ok(page.rows.every((row) => row.event.seq < 61));
    assert.equal(page.rows.filter((row) => row.event.type === "user").length, 11);
    assert.equal(page.totals.humans, 20, "totals are of what lies before the page edge");

    const tail = readHistory(file, { want: { results: 4, floor: 20, weight: 100 }, chunkBytes: 256 });
    assert.equal(tail.whole, false);
    const earliestResult = tail.rows.findIndex((row) => row.event.type === "result");
    const afterIt = tail.rows.length - 1 - earliestResult;
    assert.ok(afterIt >= 20, `at least 20 rows after the earliest result kept, got ${afterIt}`);
    assert.ok(tail.rows.filter((row) => row.event.type === "result").length >= 4);
    assert.deepEqual(tail.totals, { rows: 120, humans: 40, results: 40 });
  } finally {
    gone();
  }
});

test("with a cache, the second read counts only what was appended, and a rewritten file is counted afresh", () => {
  const lines = conversation(30, { withStream: true });
  const { file, gone } = scratch("e.ndjson", lines.join("\n") + "\n");
  try {
    const cache = new Map();
    const first = readHistory(file, { want: { humanTurns: 4 }, chunkBytes: 512, cache });
    assert.deepEqual(first.totals, { rows: 90, humans: 30, results: 30 });
    assert.equal(first.scanned, 120);
    writeFileSync(file, lines.join("\n") + "\n" + [say(121, "nova"), answer(122, "resposta nova"), result(123)].join("\n") + "\n");
    const second = readHistory(file, { want: { humanTurns: 4 }, chunkBytes: 512, cache });
    assert.deepEqual(second.totals, { rows: 93, humans: 31, results: 31 }, "the appended turn is counted on top of what was known");
    assert.equal(second.seq, 123);
    assert.ok(second.scanned < 40, `only the window and the new lines were read, got ${second.scanned}`);
    assert.equal(second.rows.at(-1).event.seq, 123);
    const whole = readHistory(file, { chunkBytes: 512, cache });
    assert.equal(whole.rows.length, 93, "a whole read keeps everything even with the cache warm");
    assert.deepEqual(whole.totals, second.totals);
    writeFileSync(file, conversation(5).join("\n") + "\n" + "x".repeat(60000) + "\n");
    const rewritten = readHistory(file, { want: { humanTurns: 2 }, chunkBytes: 512, cache });
    assert.deepEqual(rewritten.totals, { rows: 15, humans: 5, results: 5 }, "a file that starts over is not trusted to the old count");
    const page = readHistory(file, { before: 10, want: { humanTurns: 2 }, chunkBytes: 512, cache });
    assert.deepEqual(page.totals, { rows: 9, humans: 3, results: 3 }, "a page before an edge never uses the cache");
  } finally {
    gone();
  }
});
