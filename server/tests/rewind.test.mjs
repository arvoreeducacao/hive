import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chainUuidOf, forkAliases, forkCut, forkSessionAt, rewindCut, rowsOf, rowsText, withUuids } from "../engine/rewind.mjs";
import { importSdk } from "../engine/sdk-module.mjs";
import { glanceAt, stateOfSeat } from "../sessions.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const line = (event) => JSON.stringify(event);
const say = (seq, text, extra = {}) => ({ seq, ts: `2026-10-29T10:00:${String(seq).padStart(2, "0")}.000Z`, type: "user", subtype: "say", cid: null, images: [], message: { role: "user", content: [{ type: "text", text }] }, parent_tool_use_id: null, ...extra });
const answer = (seq, uuid, text = "ok") => ({ seq, type: "assistant", uuid, message: { content: [{ type: "text", text }] }, parent_tool_use_id: null });
const toolBack = (seq, uuid) => ({ seq, type: "user", uuid, message: { content: [{ type: "tool_result", tool_use_id: "t", content: "done" }] }, parent_tool_use_id: null });
const result = (seq) => ({ seq, type: "result", subtype: "success", uuid: id(900 + seq) });
const file = (...events) => events.map(line).join("\n") + "\n";

const TWO_TURNS = file(
  say(1, "first"),
  { seq: 2, type: "driver", subtype: "started" },
  { seq: 3, type: "stream_event", event: {} },
  answer(4, id(4)),
  { seq: 5, type: "assistant", uuid: id(5), parent_tool_use_id: "sub", message: { content: [] } },
  toolBack(6, id(6)),
  answer(7, id(7), "first answer"),
  result(8),
  say(9, "look [Image #1] here", { cid: "c1-aa", images: ["/tmp/shot.png"] }),
  { seq: 10, type: "driver", subtype: "dispatched", cid: "c1-aa", ts: "2026-10-29T10:00:10.000Z" },
  answer(11, id(11), "second answer"),
  result(12)
);

test("only what the model keeps in its own chain counts as a place to cut", () => {
  assert.equal(chainUuidOf(answer(1, id(1))), id(1));
  assert.equal(chainUuidOf(toolBack(1, id(1))), id(1));
  assert.equal(chainUuidOf(say(1, "hi", { uuid: id(1) })), "", "the hive's own record of a message is not in the transcript");
  assert.equal(chainUuidOf({ ...answer(1, id(1)), parent_tool_use_id: "sub" }), "", "a subagent lives in its own file");
  assert.equal(chainUuidOf(result(1)), "");
  assert.equal(chainUuidOf(answer(1, "not-a-uuid")), "");
});

test("going back to a message keeps everything before it and gives its words and pictures back", () => {
  const cut = rewindCut(rowsOf(TWO_TURNS), 9);
  assert.equal(cut.upTo, id(7), "the copy ends on the last answer of the turn before");
  assert.deepEqual(cut.keep.map((row) => row.event.seq), [1, 2, 4, 5, 6, 7, 8], "streaming deltas are dropped and nothing of the message or after it is kept");
  assert.equal(cut.text, "look [Image #1] here");
  assert.deepEqual(cut.images, ["/tmp/shot.png"]);
  assert.equal(cut.at, Date.parse("2026-10-29T10:00:10.000Z"), "the files are judged by when the message reached the model");
});

test("going back to the first message leaves nothing to resume", () => {
  const cut = rewindCut(rowsOf(TWO_TURNS), 1);
  assert.equal(cut.upTo, "");
  assert.deepEqual(cut.keep, []);
  assert.equal(cut.text, "first");
});

test("a message typed while the turn before it ran leaves that turn whole", () => {
  const rows = rowsOf(file(
    say(1, "first"),
    answer(2, id(2)),
    say(3, "typed meanwhile", { cid: "c2-bb" }),
    toolBack(4, id(4)),
    answer(5, id(5), "done"),
    result(6),
    { seq: 7, type: "driver", subtype: "dispatched", cid: "c2-bb" },
    answer(8, id(8)),
    result(9)
  ));
  const cut = rewindCut(rows, 3);
  assert.equal(cut.upTo, id(5));
  assert.deepEqual(cut.keep.map((row) => row.event.seq), [1, 2, 4, 5, 6]);
});

test("a message from another chat, a picture alone and a seq that is no message are refused or cleaned", () => {
  const rows = rowsOf(file(say(1, "from a peer", { from: "other" }), say(2, "(image)", { images: ["/tmp/a.png"] }), answer(3, id(3))));
  assert.match(rewindCut(rows, 1).error, /not one this chat can go back to/);
  assert.match(rewindCut(rows, 3).error, /not one this chat can go back to/);
  assert.equal(rewindCut(rows, 2).text, "", "the placeholder the driver writes for a picture is not put back in the box");
});

test("a fork keeps the turn of the answer whole and nothing typed for the turns after it", () => {
  const rows = rowsOf(file(
    say(1, "first"),
    answer(2, id(2), "thinking out loud"),
    say(3, "queued", { cid: "c3-cc" }),
    toolBack(4, id(4)),
    answer(5, id(5), "the answer"),
    result(6),
    { seq: 7, type: "driver", subtype: "dispatched", cid: "c3-cc" },
    answer(8, id(8)),
    result(9)
  ));
  const cut = forkCut(rows, 5);
  assert.equal(cut.upTo, id(5));
  assert.equal(cut.last, 6);
  assert.deepEqual(cut.keep.map((row) => row.event.seq), [1, 2, 4, 5, 6]);
  assert.equal(forkCut(rows, 2).upTo, id(5), "any line of the turn forks from its end");
  assert.match(forkCut(rowsOf(file(say(1, "x"), answer(2, id(2)))), 2).error, /still being written/);
  assert.match(forkCut(rows, 99).error, /not in this chat/);
});

test("the copy's own uuids replace the old ones, and only on the model's chain", () => {
  const transcript = [
    line({ type: "user", uuid: id(101), forkedFrom: { sessionId: "s", messageUuid: id(4) } }),
    line({ type: "assistant", uuid: id(102), forkedFrom: { sessionId: "s", messageUuid: id(7) } }),
    line({ type: "custom-title", customTitle: "x" }),
    "not json"
  ].join("\n");
  const aliases = forkAliases(transcript);
  assert.equal(aliases.get(id(4)), id(101));
  assert.equal(aliases.size, 2);
  const rows = rowsOf(file(answer(4, id(4)), say(5, "hi", { uuid: id(7) }), answer(7, id(7))));
  const moved = withUuids(rows, aliases);
  assert.equal(moved[0].event.uuid, id(101));
  assert.equal(JSON.parse(moved[0].line).uuid, id(101));
  assert.equal(moved[1], rows[1], "a line off the chain is left as it was");
  assert.equal(moved[2].event.uuid, id(102));
  assert.equal(withUuids(rows, new Map()), rows);
  assert.equal(rowsText(rows).split("\n").length, 4);
});

test("the session is forked up to the cut, looked for anywhere when the folder moved, and its uuids read back", async () => {
  const asked = [];
  const fork = async (sessionId, options) => {
    asked.push({ sessionId, ...options });
    if (options.dir) throw new Error(`Session ${sessionId} not found in project directory for ${options.dir}`);
    return { sessionId: id(500) };
  };
  const forked = await forkSessionAt({ fork, sessionId: id(1), dir: "/repo", upTo: id(7), title: "chat", read: async (which) => (which === id(500) ? line({ uuid: id(501), forkedFrom: { messageUuid: id(7) } }) : "") });
  assert.equal(forked.sessionId, id(500));
  assert.equal(forked.aliases.get(id(7)), id(501));
  assert.deepEqual(asked, [
    { sessionId: id(1), upToMessageId: id(7), title: "chat", dir: "/repo" },
    { sessionId: id(1), upToMessageId: id(7), title: "chat" }
  ]);
  await assert.rejects(forkSessionAt({ fork, sessionId: "", upTo: id(7) }), /no conversation on record/);
  await assert.rejects(forkSessionAt({ fork: async () => { throw new Error("disk full"); }, sessionId: id(1), dir: "/repo", upTo: id(7) }), /disk full/);
});

test("the sdk's own fork copies the transcript up to the cut and says where every entry came from", async () => {
  const home = mkdtempSync(join(tmpdir(), "rw-sdk-"));
  const was = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = home;
  try {
    const { forkSession } = await importSdk();
    const source = id(1000);
    const projects = join(home, "projects");
    mkdirSync(join(projects, "-hub"), { recursive: true });
    const entry = (n, type, parent) => ({ type, uuid: id(n), parentUuid: parent ? id(parent) : null, sessionId: source, isSidechain: false, cwd: "/hub", timestamp: `2026-10-29T10:00:0${n}.000Z`, message: type === "user" ? { role: "user", content: `ask ${n}` } : { role: "assistant", content: [{ type: "text", text: `answer ${n}` }] } });
    writeFileSync(join(projects, "-hub", `${source}.jsonl`), [entry(1, "user"), entry(2, "assistant", 1), entry(3, "user", 2), entry(4, "assistant", 3)].map(line).join("\n") + "\n");
    const read = async (which) => readFileSync(readdirSync(projects).map((dir) => join(projects, dir, `${which}.jsonl`)).find((path) => existsSync(path)), "utf8");
    const forked = await forkSessionAt({ fork: forkSession, sessionId: source, dir: "/somewhere/else", upTo: id(2), title: "chat fork", read });
    assert.notEqual(forked.sessionId, source);
    assert.equal(forked.aliases.size, 2, "the entries after the cut are not in the copy");
    const copy = (await read(forked.sessionId)).trim().split("\n").map((one) => JSON.parse(one));
    assert.equal(copy.find((one) => one.uuid === forked.aliases.get(id(2)))?.message.content[0].text, "answer 2");
    assert.equal(copy.at(-1).customTitle, "chat fork");
  } finally {
    if (was === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = was;
    rmSync(home, { recursive: true, force: true });
  }
});

test("a message that went into a turn still running is not a place to go back to", () => {
  const rows = rowsOf(file(
    say(1, "first"),
    answer(2, id(2), "working on it"),
    say(3, "and also this", { cid: "c2-bb" }),
    { seq: 4, type: "driver", subtype: "dispatched", cid: "c2-bb" },
    { seq: 5, type: "driver", subtype: "said_now", cid: "c2-bb" },
    answer(6, id(6), "done"),
    result(7)
  ));
  assert.match(rewindCut(rows, 3).error, /still running/);
  assert.ok(rewindCut(rows, 1).keep, "the message that started the turn still goes back");
});

test("a fork that just opened, or a chat that only changed its mode, is not working", () => {
  for (const note of ["forked", "claude_binary", "mode_changed"]) {
    const { last } = glanceAt(file(say(1, "oi"), answer(2, id(2)), result(3), { seq: 4, type: "driver", subtype: note }));
    assert.equal(stateOfSeat({ alive: true, lastEvent: last }), "idle", note);
  }
});
