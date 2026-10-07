import test from "node:test";
import assert from "node:assert/strict";
import { MEETING_SAMPLE_RATE, createChunker, quietestCut, rmsOf } from "../assets/meeting-chunks.mjs";

const tone = (seconds, loud = 0.2) => Float32Array.from({ length: Math.round(seconds * MEETING_SAMPLE_RATE) }, (_, at) => loud * Math.sin(at / 5));

test("a piece is cut where the talking pauses, not in the middle of a word", () => {
  const pcm = tone(10);
  const from = Math.round(8 * MEETING_SAMPLE_RATE);
  pcm.fill(0, from, from + Math.round(0.4 * MEETING_SAMPLE_RATE));
  const cut = quietestCut(pcm);
  assert.ok(cut > from && cut < from + 0.4 * MEETING_SAMPLE_RATE, `cut at ${cut / MEETING_SAMPLE_RATE}s`);
});

test("thirty seconds of talk leave as one piece, and the clock of the next one carries on", () => {
  const chunker = createChunker({ seconds: 30 });
  let first = null;
  for (let at = 0; at < 31 && !first; at++) first = chunker.push(tone(1));
  assert.ok(first, "a piece should have left by now");
  assert.equal(first.at, 0);
  assert.equal(first.said, true);
  const length = first.pcm.length / MEETING_SAMPLE_RATE;
  assert.ok(length > 26 && length <= 30, `the piece was ${length}s`);
  const rest = chunker.flush();
  assert.ok(Math.abs(rest.at - length) < 0.001);
  assert.ok(Math.abs(rest.at + rest.pcm.length / MEETING_SAMPLE_RATE - 30) < 0.001, "no sample is lost or doubled");
  assert.equal(chunker.flush(), null);
});

test("silence is marked so it never reaches the model, which invents words for it", () => {
  const chunker = createChunker({ seconds: 2 });
  chunker.push(new Float32Array(MEETING_SAMPLE_RATE));
  const piece = chunker.push(new Float32Array(MEETING_SAMPLE_RATE));
  assert.equal(piece.said, false);
  assert.equal(rmsOf(piece.pcm), 0);
  assert.equal(chunker.push(new Float32Array(0)), null);
});
