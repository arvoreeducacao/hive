import { closeSync, fstatSync, openSync, readSync, statSync } from "node:fs";
import { isHumanTurn } from "./bridge.mjs";

export const CHUNK_BYTES = 1 << 20;

const NEWLINE = 10;

export function* linesBackwardAt(file, chunkBytes = CHUNK_BYTES) {
  const fd = openSync(file, "r");
  try {
    let at = fstatSync(fd).size;
    let carry = Buffer.alloc(0);
    while (at > 0) {
      const size = Math.min(chunkBytes, at);
      at -= size;
      const chunk = Buffer.alloc(size);
      readSync(fd, chunk, 0, size, at);
      const data = carry.length ? Buffer.concat([chunk, carry]) : chunk;
      let end = data.length;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i] !== NEWLINE) continue;
        if (i + 1 < end) yield [data.toString("utf8", i + 1, end), at + i + 1];
        end = i;
      }
      carry = Buffer.from(data.subarray(0, end));
    }
    if (carry.length) yield [carry.toString("utf8"), 0];
  } finally {
    closeSync(fd);
  }
}

export function* linesBackward(file, chunkBytes = CHUNK_BYTES) {
  for (const [line] of linesBackwardAt(file, chunkBytes)) yield line;
}

const SEQ_AT_START = /^\{"seq":(\d+)[,}]/;

export function seqOf(line) {
  const hit = SEQ_AT_START.exec(line);
  return hit ? Number(hit[1]) : null;
}

const mentions = (line, type) => line.includes(`"type":"${type}"`);

function parsed(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function countsAs(line) {
  const stream = mentions(line, "stream_event") && parsed(line)?.type === "stream_event";
  if (stream) return { row: false, human: false, result: false };
  const human = mentions(line, "user") && !line.includes('"tool_result"') && isHumanTurn(parsed(line));
  const result = mentions(line, "result") && parsed(line)?.type === "result";
  return { row: true, human, result };
}

function enough(want, tally) {
  if (!want) return false;
  if (want.humanTurns) return tally.humans >= want.humanTurns;
  return tally.results >= want.results && tally.earliestResultAt >= want.floor && tally.weight >= want.weight;
}

export function readHistory(file, { from = 0, before = 0, want = null, chunkBytes = CHUNK_BYTES, cache = null } = {}) {
  const kept = [];
  const tally = { humans: 0, results: 0, weight: 0, earliestResultAt: -1 };
  const totals = { rows: 0, humans: 0, results: 0 };
  const cacheable = cache && from === 0 && before === 0;
  const size = cacheable ? statSync(file).size : 0;
  const known = cacheable ? cache.get(file) : null;
  const counted = known && known.bytes <= size ? known : null;
  let seq = 0;
  let collecting = true;
  let scanned = 0;
  let tailEnd = size;
  let lastLine = true;
  let seqUnchecked = true;
  let countedStillHolds = !!counted;
  for (const [line, start] of linesBackwardAt(file, chunkBytes)) {
    if (!line.trim()) continue;
    scanned += 1;
    const at = seqOf(line);
    if (at !== null) seq = Math.max(seq, at);
    if (lastLine) {
      lastLine = false;
      if (!parsed(line)) tailEnd = start;
    }
    if (seqUnchecked && at !== null) {
      seqUnchecked = false;
      if (counted && at < counted.lastSeq) countedStillHolds = false;
    }
    if (from > 0 && at !== null && at <= from) break;
    if (before > 0 && at !== null && at >= before) continue;
    const alreadyCounted = countedStillHolds && start < counted.bytes;
    if (!collecting && alreadyCounted) break;
    if (collecting) {
      const event = parsed(line);
      if (!event) continue;
      if (event.type === "stream_event") continue;
      const human = isHumanTurn(event);
      const result = event.type === "result";
      if (!alreadyCounted) {
        totals.rows += 1;
        if (human) totals.humans += 1;
        if (result) totals.results += 1;
      }
      if (human) tally.humans += 1;
      if (result) {
        tally.results += 1;
        tally.earliestResultAt = kept.length;
      }
      tally.weight += line.length + 1;
      kept.push({ line, event });
      if (enough(want, tally)) collecting = false;
      continue;
    }
    const seen = countsAs(line);
    if (!seen.row) continue;
    totals.rows += 1;
    if (seen.human) totals.humans += 1;
    if (seen.result) totals.results += 1;
  }
  if (countedStillHolds) {
    totals.rows += counted.totals.rows;
    totals.humans += counted.totals.humans;
    totals.results += counted.totals.results;
  }
  if (cacheable) cache.set(file, { bytes: tailEnd, lastSeq: seq, totals: { ...totals } });
  kept.reverse();
  return { rows: kept, seq, totals, whole: collecting, scanned };
}
