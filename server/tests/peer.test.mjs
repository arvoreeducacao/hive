import { test } from "node:test";
import assert from "node:assert/strict";
import { birthsLeft, peerSayText, sayEvent, seatTitle, seatPreamble, BIRTHS_MAX } from "../engine/protocol.mjs";
import { resolveSeat, readNow, repoOf, seatLine, seatRoster, peerHandle, flatten, sideOf, tmuxSession, askPerson, run, statusWith } from "../peer/peer.mjs";
import { readOutbox } from "../../app/lib/team.mjs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const hive = () => mkdtemp(join(tmpdir(), "hive-peer-"));

const seats = [
  { name: "api-payload", side: "cloud", repo: "api-arvore", model: "opus", state: "working", now: "montando o dto", title: "" },
  { name: "api-webhooks", side: "cloud", repo: "api-arvore", model: "sonnet", state: "idle", now: "", title: "retry do webhook" },
  { name: "checkout", side: "local", repo: "frontend-arvore-nextjs", model: "", state: "needs", now: "", title: "" },
];

test("a whole name wins over a prefix that fits more than one seat", () => {
  assert.equal(resolveSeat(seats, "checkout").seat.name, "checkout");
  assert.equal(resolveSeat(seats, "api-payload").seat.name, "api-payload");
});

test("an ambiguous prefix is refused by name instead of guessed", () => {
  const said = resolveSeat(seats, "api").error;
  assert.match(said, /fits 2 seats/);
  assert.match(said, /api-payload, api-webhooks/);
});

test("a prefix that fits one seat answers, and a title can be searched too", () => {
  assert.equal(resolveSeat(seats, "check").seat.name, "checkout");
  assert.equal(resolveSeat(seats, "retry").seat.name, "api-webhooks");
});

test("a name nobody carries is said out loud", () => {
  assert.match(resolveSeat(seats, "floresta").error, /no seat called/);
  assert.match(resolveSeat(seats, "").error, /no seat named/);
});

/* opening a chat is the expensive thing a chat does to another chat, and it has its own budget */

test("a chat starts the round able to open three, and a written number is kept inside the range", () => {
  assert.equal(birthsLeft(undefined), BIRTHS_MAX);
  assert.equal(birthsLeft("nonsense"), BIRTHS_MAX);
  assert.equal(birthsLeft(2), 2);
  assert.equal(birthsLeft(0), 0);
  assert.equal(birthsLeft(-3), 0);
  assert.equal(birthsLeft(99), BIRTHS_MAX);
});

/* what the seat on the other side actually reads */

test("a peer message arrives named, so it can be answered", () => {
  const said = peerSayText("api-payload", "que shape o form manda?", "cloud");
  assert.match(said, /from seat api-payload \(cloud\)/);
  assert.ok(said.endsWith("que shape o form manda?"));
});

test("the say event carries who sent it and whether an ask already took it", () => {
  const plain = sayEvent("oi");
  assert.equal(plain.from, undefined);
  assert.equal(plain.consumed, undefined);
  const peer = sayEvent("oi", [], "c1", "api-payload", true);
  assert.equal(peer.from, "api-payload");
  assert.equal(peer.consumed, true);
});

/* the handle a mention hands over */

test("the handle names the peer, the way to reach it and who is asking", () => {
  const handle = peerHandle(seats[0], { name: "checkout", side: "local" });
  assert.match(handle, /peer: api-payload · cloud · api-arvore · opus · working · "montando o dto"/);
  assert.match(handle, /message\(seat, text\)/);
  assert.match(handle, /you are: checkout \(local\)/);
});

test("with nobody asking, the handle stops at the peer", () => {
  assert.doesNotMatch(peerHandle(seats[2], null), /you are:/);
});

test("a seat with nothing to say still reads as a line", () => {
  assert.equal(seatLine(seats[2]), "checkout · local · frontend-arvore-nextjs · needs");
});

test("the line carries the title the person reads on the rail, not only the address", () => {
  assert.equal(seatLine(seats[1]), 'api-webhooks "retry do webhook" · cloud · api-arvore · sonnet · idle');
});

test("a title that only repeats the name is not said twice", () => {
  const same = { name: "mockup-glasshouse", side: "local", repo: "", model: "", state: "alive", now: "", title: "mockup glasshouse" };
  assert.equal(seatLine(same), "mockup-glasshouse · local · alive");
});

test("the roster opens with the chats that are open and keeps the dead ones from drowning them", () => {
  const many = [
    { name: "vivo", side: "local", title: "base de dados do mcp", alive: true, state: "working", now: "subindo o postgres", updated: "2026-09-15T20:00" },
    { name: "ontem", side: "local", title: "outra coisa", alive: false, updated: "2026-09-14T10:00" },
    { name: "hoje", side: "local", title: "coisa de hoje", alive: false, updated: "2026-09-15T09:00" },
    { name: "antigo", side: "local", title: "coisa velha", alive: false, updated: "2026-01-01T10:00" },
  ];
  const said = seatRoster(many, 2);
  assert.match(said[0], /^open now \(1\)/);
  assert.match(said[1], /vivo "base de dados do mcp"/, "the title is what lets another chat find this one");
  assert.ok(said.some((l) => /closed, most recent first \(2 of 3\)/.test(l)));
  assert.equal(said.filter((l) => l.startsWith("×")).length, 2);
  assert.match(said[said.length - 1], /1 older chat not listed/);
  assert.ok(!said.join("\n").includes("antigo"), "the oldest chat is the one left out");
});

test("with every chat closed the roster still says so and lists them", () => {
  const said = seatRoster([{ name: "um", side: "local", title: "", alive: false, updated: "" }]);
  assert.equal(said[0], "no other chat is open right now");
  assert.ok(said.some((l) => l.startsWith("× um")));
});

/* the small things the transport leans on */

test("a handle for a terminal seat is flattened, because a newline there sends the message", () => {
  assert.equal(flatten("one\n  two\nthree"), "one · two · three");
  assert.ok(!flatten(peerHandle(seats[0], null)).includes("\n"));
});

test("the status file answers what the seat is doing now", () => {
  const read = readNow(["title: pagamentos", "09:12 [working] montando o dto", "09:40 [blocked] falta o contrato"].join("\n"));
  assert.equal(read.title, "pagamentos");
  assert.equal(read.state, "blocked");
  assert.equal(read.now, "falta o contrato");
});

test("the repo is the folder the worktree hangs from", () => {
  assert.equal(repoOf("/workspace/worktrees/api-arvore/api-payload"), "api-arvore");
  assert.equal(repoOf("/workspace/repos/arvore-hub"), "arvore-hub");
  assert.equal(repoOf(""), "");
});

test("which side a seat is on decides which tmux server holds it", () => {
  assert.equal(sideOf("/workspace/hive"), "cloud");
  assert.equal(tmuxSession(sideOf("/workspace/hive")), "hive");
  assert.equal(tmuxSession(sideOf("/Users/joao/.hive")), "hive-local");
});

/* a command that failed and a command that printed nothing used to look the same */

test("run tells a command that printed nothing apart from one that failed", async () => {
  const quiet = await run(process.execPath, ["-e", ""]);
  assert.deepEqual(quiet, { ok: true, out: "", error: "" });
  const failed = await run(process.execPath, ["-e", "process.exit(3)"]);
  assert.equal(failed.ok, false);
  assert.equal(failed.out, "");
  assert.ok(failed.error);
});

test("run carries the output through and a missing binary reads as an error", async () => {
  const spoke = await run(process.execPath, ["-e", "process.stdout.write('hive')"]);
  assert.deepEqual(spoke, { ok: true, out: "hive", error: "" });
  const missing = await run(join(tmpdir(), `no-such-binary-${Date.now()}`), []);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /ENOENT|no-such-binary/);
});

test("a question for another person is left in the outbox, in the shape their hive can read", async () => {
  const base = await hive();
  try {
    const env = { HIVE_STATE_DIR: base, HIVE_SEAT: "checkout" };
    const sent = await askPerson("Vitor", "  qual é o formato do payload?  ", { env });
    assert.equal(sent.to, "vitor");
    assert.equal(sent.agent, "checkout");
    const files = await readdir(join(base, "outbox"));
    assert.deepEqual(files, [`${sent.id}.json`]);
    const note = await readFile(join(base, "outbox", files[0]), "utf8");
    assert.deepEqual(readOutbox(note), { to: "vitor", agent: "checkout", at: JSON.parse(note).at, id: sent.id, text: "qual é o formato do payload?" });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("a question with nobody to send it to, or nothing to ask, never leaves the machine", async () => {
  const base = await hive();
  try {
    const env = { HIVE_STATE_DIR: base, HIVE_SEAT: "checkout" };
    assert.match((await askPerson("Não Existe!", "e aí?", { env })).error, /not a name I can address/);
    assert.match((await askPerson("vitor", "   ", { env })).error, /nothing to ask/);
    assert.match((await askPerson("vitor", "e aí?", { env: { HIVE_STATE_DIR: base } })).error, /no name in the hive/);
    assert.equal(existsSync(join(base, "outbox")), false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("a title is one line, however the seat typed it", () => {
  assert.equal(seatTitle("  o áudio   mudo\n no CRM "), "o áudio mudo no CRM");
  assert.equal(seatTitle(""), "");
  assert.equal(seatTitle(null), "");
  assert.equal(seatTitle("a".repeat(80)).length, 60);
});

test("a rename replaces the name in the status file and leaves the log under it alone", () => {
  const had = "title: a query lenta\n09:12 [working] lendo o plano de execução\n";
  const held = statusWith(had, { title: "o importer", now: "reescrevendo o lote", clock: "10:04" });
  assert.equal(held, "title: o importer\n09:12 [working] lendo o plano de execução\n10:04 [working] reescrevendo o lote\n");
});

test("a seat with no status file yet is named without inventing a line about what it is doing", () => {
  assert.equal(statusWith("", { title: "o importer", clock: "10:04" }), "title: o importer\n");
  assert.equal(statusWith("", {}), "");
});

test("a seat is told its name, who else is around, and that the chat's name is its own to write", () => {
  const said = seatPreamble("audio-mudo", "local");
  assert.match(said, /You are seat `audio-mudo` in the hive \(local\)/);
  assert.match(said, /peers, message, ask, peek/);
  assert.match(said, /rename/);
  assert.match(said, /start on the work at once/);
  assert.match(said, /only when the subject turns/);
});
