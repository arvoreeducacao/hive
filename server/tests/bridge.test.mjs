import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, appendFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { followEvents, heartbeat, oneshot, slimEvent, tailWindow, PING_LINE } from "../bridge.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function collectUntil(lines, count, ms = 3000) {
  const t0 = Date.now();
  while (lines.length < count && Date.now() - t0 < ms) await wait(50);
  return lines;
}

test("followEvents skips what the client already has and follows appends", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const file = join(dir, "seat.ndjson");
  await writeFile(file, '{"seq":1,"a":1}\n{"seq":2,"a":2}\n{"seq":3,"a":3}\n');
  const lines = [];
  const follower = followEvents(file, 2, (l) => lines.push(JSON.parse(l).seq), { intervalMs: 60 });
  await collectUntil(lines, 1);
  assert.deepEqual(lines, [3]);
  await appendFile(file, '{"seq":4,"a":4}\nnot json\n{"seq":5,"a":5}\n');
  await collectUntil(lines, 3);
  follower.stop();
  assert.deepEqual(lines, [3, 4, 5]);
});

test("followEvents tolerates the file not existing yet", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const file = join(dir, "late.ndjson");
  const lines = [];
  const follower = followEvents(file, 0, (l) => lines.push(JSON.parse(l).seq), { intervalMs: 60 });
  await wait(150);
  assert.deepEqual(lines, []);
  await writeFile(file, '{"seq":1}\n');
  await collectUntil(lines, 1);
  follower.stop();
  assert.deepEqual(lines, [1]);
});

test("oneshot sends one command and reads one reply", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const sockFile = join(dir, "s.sock");
  const server = createServer((conn) => {
    conn.on("data", (d) => {
      const cmd = JSON.parse(String(d).trim());
      conn.write(JSON.stringify({ ok: true, echo: cmd.type }) + "\n");
    });
  });
  await new Promise((r) => server.listen(sockFile, r));
  const reply = await oneshot(sockFile, { type: "state" });
  assert.deepEqual(reply, { ok: true, echo: "state" });
  server.close();
});

test("oneshot fails soft when nobody listens", async () => {
  const reply = await oneshot(join(tmpdir(), "nowhere.sock"), { type: "state" }, { timeoutMs: 500 });
  assert.equal(reply.ok, false);
  assert.match(reply.error, /socket|answer/);
});

test("the heartbeat keeps the flow warm until it is told to stop", async () => {
  const beats = [];
  const stop = heartbeat((line) => beats.push(line), 20);
  await wait(90);
  stop();
  const sofar = beats.length;
  assert.ok(sofar >= 3, `expected the bridge to speak up, got ${sofar}`);
  assert.ok(beats.every((b) => b === PING_LINE));
  await wait(60);
  assert.equal(beats.length, sofar, "and to go quiet once stopped");
});

test("a heartbeat is one line of json the other end can tell apart", () => {
  assert.equal(PING_LINE.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(PING_LINE), { hive_ping: 1 });
  assert.equal(JSON.parse(PING_LINE).seq, undefined, "it must never look like an event");
});

const turn = (seq, extra = {}) => JSON.stringify({ seq, type: "assistant", message: { role: "assistant", content: [{ type: "text", text: `t${seq}` }] }, ...extra });
const closed = (seq) => JSON.stringify({ seq, type: "result", subtype: "success" });

test("slimEvent drops the duplicated result and the base64 the screen never reads", () => {
  const fat = {
    seq: 9, type: "user",
    tool_use_result: { file: "x".repeat(5000) },
    message: { role: "user", content: [{
      type: "tool_result", tool_use_id: "t1",
      content: [{ type: "text", text: "ok" }, { type: "image", source: { type: "base64", data: "A".repeat(900000) } }]
    }] }
  };
  const slim = slimEvent(fat);
  assert.equal(slim.tool_use_result, undefined);
  assert.deepEqual(slim.message.content[0].content, [{ type: "text", text: "ok" }, { type: "image" }]);
  assert.equal(slim.message.content[0].tool_use_id, "t1", "the card is found by this id — it must survive");
  assert.equal(slim.seq, 9, "the whole incremental protocol hangs off the sequence");
  assert.ok(JSON.stringify(slim).length < 200);
  assert.equal(fat.message.content[0].content[1].source.data.length, 900000, "the original event is left alone");
});

test("the path of a shot the driver already wrote survives the trip", () => {
  const withPath = {
    seq: 10, type: "user",
    message: { role: "user", content: [{
      type: "tool_result", tool_use_id: "t2",
      content: [{ type: "image", media_type: "image/png", path: "/workspace/hive/shots/seat/t2-0.png" }]
    }] }
  };
  assert.equal(slimEvent(withPath), withPath, "there is nothing to cut, so nothing is copied");
});

test("slimEvent hands back an event that carries no dead weight", () => {
  const lean = { seq: 1, type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } };
  assert.equal(slimEvent(lean), lean);
  assert.equal(slimEvent({ seq: 2, type: "system", subtype: "init" }).subtype, "init");
});

test("tailWindow cuts on a finished turn, never inside one", () => {
  const rows = [];
  for (let t = 0; t < 6; t++) {
    rows.push({ line: turn(t * 2 + 1), event: JSON.parse(turn(t * 2 + 1)) });
    rows.push({ line: closed(t * 2 + 2), event: JSON.parse(closed(t * 2 + 2)) });
  }
  const cut = tailWindow(rows, { turns: 2, floor: 0, ceiling: Infinity });
  assert.equal(cut.total, 6);
  assert.equal(cut.shown, 2);
  assert.equal(rows[cut.start - 1].event.type, "result", "the line before the window closes a turn");
  assert.equal(rows.slice(cut.start).filter((r) => r.event.type === "result").length, 2);
});

test("tailWindow keeps an unfinished turn whole, so a pending question keeps its buttons", () => {
  const rows = [turn(1), closed(2), turn(3), closed(4), turn(5), turn(6)]
    .map((line) => ({ line, event: JSON.parse(line) }));
  const cut = tailWindow(rows, { turns: 1, floor: 0, ceiling: Infinity });
  assert.deepEqual(rows.slice(cut.start).map((r) => r.event.seq), [3, 4, 5, 6],
    "the open turn comes along whole, on top of the last finished one");
});

test("tailWindow shows the whole chat when there is no turn to hide behind", () => {
  const rows = [{ line: turn(1), event: JSON.parse(turn(1)) }, { line: turn(2), event: JSON.parse(turn(2)) }];
  assert.equal(tailWindow(rows).start, 0);
});

test("tailWindow widens for a thin tail and narrows for a fat one", () => {
  const rows = [];
  for (let t = 0; t < 8; t++) {
    rows.push({ line: turn(t * 2 + 1), event: JSON.parse(turn(t * 2 + 1)) });
    rows.push({ line: closed(t * 2 + 2), event: JSON.parse(closed(t * 2 + 2)) });
  }
  assert.equal(tailWindow(rows, { turns: 1, floor: 6, ceiling: Infinity }).shown, 3, "the floor pulls more turns in");
  assert.equal(tailWindow(rows, { turns: 6, floor: 0, ceiling: 200 }).shown < 6, true, "the ceiling pushes them back out");
  const squeezed = tailWindow(rows, { turns: 6, floor: 0, ceiling: 1 });
  assert.equal(squeezed.shown, 0, "a ceiling under one turn stops counting turns and cuts by weight instead");
  assert.equal(squeezed.total, 8, "and still says how many turns the conversation has, so the note can explain the cut");
  assert.ok(squeezed.start > 0, "a turn too fat for the ceiling is cut, never shipped whole");
});

test("a replay opens at the end and says how much it left behind", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const file = join(dir, "long.ndjson");
  const rows = [];
  for (let t = 0; t < 10; t++) { rows.push(turn(t * 2 + 1)); rows.push(closed(t * 2 + 2)); }
  await writeFile(file, rows.join("\n") + "\n");
  const seen = [];
  const follower = followEvents(file, 0, (l) => seen.push(JSON.parse(l)), { intervalMs: 60, window: { turns: 3, floor: 0 } });
  await collectUntil(seen, 7);
  follower.stop();
  const note = seen[0];
  assert.equal(note.subtype, "windowed");
  assert.equal(note.turnsTotal, 10);
  assert.equal(note.turns, 3);
  assert.equal(note.seq, undefined, "the note must not move the client's counter");
  assert.equal(seen.filter((e) => e.type === "result").length, 3);
  assert.equal(seen.at(-1).seq, 20, "and the window ends at the newest event");
});

test("a replay drops the letter-by-letter stream, a live turn still streams", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const file = join(dir, "stream.ndjson");
  await writeFile(file, [
    JSON.stringify({ seq: 1, type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "h" } } }),
    turn(2),
    closed(3)
  ].join("\n") + "\n");
  const seen = [];
  const follower = followEvents(file, 0, (l) => seen.push(JSON.parse(l)), { intervalMs: 60, window: "tail" });
  await collectUntil(seen, 2);
  assert.deepEqual(seen.map((e) => e.seq), [2, 3], "the replayed stream is dead weight — the finished message replaces it");
  await appendFile(file, JSON.stringify({ seq: 4, type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "i" } } }) + "\n");
  await collectUntil(seen, 3);
  follower.stop();
  assert.equal(seen.at(-1).seq, 4, "but a live one has to arrive, or the text stops appearing as it is written");
});

test("a reconnect resumes where it stopped instead of opening at the end again", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const file = join(dir, "back.ndjson");
  const rows = [];
  for (let t = 0; t < 10; t++) { rows.push(turn(t * 2 + 1)); rows.push(closed(t * 2 + 2)); }
  await writeFile(file, rows.join("\n") + "\n");
  const seen = [];
  const follower = followEvents(file, 16, (l) => seen.push(JSON.parse(l)), { intervalMs: 60, window: "tail" });
  await collectUntil(seen, 4);
  follower.stop();
  assert.equal(seen.some((e) => e.subtype === "windowed"), false, "someone reattaching has the earlier turns on screen already");
  assert.deepEqual(seen.map((e) => e.seq), [17, 18, 19, 20]);
});

test("a mirror replaced under the reader is read from the top, and says so first", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const file = join(dir, "seat.ndjson");
  await writeFile(file, '{"seq":8,"a":8}\n{"seq":9,"a":9}\n');
  const seen = [];
  const follower = followEvents(file, 0, (l) => seen.push(JSON.parse(l)), { intervalMs: 60 });
  await collectUntil(seen, 2);
  assert.deepEqual(seen.map((e) => e.seq), [8, 9]);

  const swap = join(dir, "seat.ndjson.tmp");
  await writeFile(swap, '{"seq":1,"a":1}\n{"seq":8,"a":8}\n{"seq":9,"a":9}\n');
  await rename(swap, file);
  await collectUntil(seen, 6);
  follower.stop();

  assert.equal(seen[2]?.subtype, "rewound", "the reader has to say the file changed under it, or the client doubles every turn");
  assert.deepEqual(seen.slice(3).map((e) => e.seq), [1, 8, 9], "a bigger file at the same path is not an append");
});

test("a mirror that only grows is still an append, and is not read twice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bridge-"));
  const file = join(dir, "seat.ndjson");
  await writeFile(file, '{"seq":1,"a":1}\n');
  const seen = [];
  const follower = followEvents(file, 0, (l) => seen.push(JSON.parse(l)), { intervalMs: 60 });
  await collectUntil(seen, 1);
  await appendFile(file, '{"seq":2,"a":2}\n');
  await collectUntil(seen, 2);
  await wait(200);
  follower.stop();
  assert.deepEqual(seen.map((e) => e.seq), [1, 2]);
  assert.ok(!seen.some((e) => e.subtype === "rewound"));
});

test("a turn that never ends still gets cut, because the ceiling is a ceiling", () => {
  const rows = Array.from({ length: 400 }, (_, at) => ({
    line: JSON.stringify({ seq: at, type: "assistant", text: "x".repeat(900) }),
    event: { seq: at, type: "assistant" }
  }));
  const cut = tailWindow(rows, { turns: 3, floor: 60, ceiling: 60000 });

  assert.ok(cut.start > 0, "no seat has a turn boundary to cut on here, and the whole thing must not go up anyway");
  assert.equal(cut.total, 0, "there is no completed turn to count");
  let weight = 0;
  for (let at = cut.start; at < rows.length; at++) weight += rows[at].line.length + 1;
  assert.ok(weight <= 60000, `the window weighs ${weight}, past the ceiling it was given`);
  assert.ok(rows.length - cut.start >= 60, "and it still shows at least the floor it was given");
});

test("one enormous finished turn does not slip past the ceiling either", () => {
  const rows = Array.from({ length: 300 }, (_, at) => ({
    line: JSON.stringify({ seq: at, type: "assistant", text: "x".repeat(900) }),
    event: { seq: at, type: at === 4 ? "result" : "assistant" }
  }));
  const cut = tailWindow(rows, { turns: 3, floor: 60, ceiling: 60000 });

  let weight = 0;
  for (let at = cut.start; at < rows.length; at++) weight += rows[at].line.length + 1;
  assert.ok(weight <= 60000, `a single turn after the last result weighed ${weight} and went up whole`);
});

test("a conversation that fits under the ceiling is never cut", () => {
  const rows = Array.from({ length: 10 }, (_, at) => ({
    line: JSON.stringify({ seq: at, type: "assistant" }),
    event: { seq: at, type: "assistant" }
  }));
  assert.equal(tailWindow(rows, { turns: 3, floor: 60, ceiling: 60000 }).start, 0);
});
