import { test } from "node:test";
import assert from "node:assert/strict";

import { createDesk } from "../lib/seat-desk.mjs";
import { SEAT_KINDS, createRelay } from "../lib/seat-relay.mjs";

const CELULAR = "SHA256:celular";
const ESTRANHO = "SHA256:de-outra-pessoa";

function bench({ events = [], seq = 0, onCommand = async () => ({ ok: true }), allow } = {}) {
  const sent = [];
  const sessions = {
    history: () => (events === null ? { error: "no session by that name" } : { events, seq }),
    command: async (name, cmd) => onCommand(name, cmd)
  };
  const desk = createDesk(sessions);
  const relay = createRelay({ desk, sendTo: (who, kind, body) => sent.push({ who, kind, body }), ...(allow ? { allow } : {}) });
  return { desk, relay, sent };
}

test("the phone asks for a seat of the Mac and gets the conversation that is already there", async () => {
  const it = bench({ events: [{ seq: 1, type: "assistant" }, { seq: 2, type: "result" }], seq: 2 });
  const said = await it.relay.take(CELULAR, "seat-open", { seat: "meu-assento", from: 0 });

  assert.equal(said.ok, true);
  assert.equal(it.sent.length, 1);
  assert.equal(it.sent[0].who, CELULAR);
  assert.equal(it.sent[0].kind, "seat-events");
  assert.deepEqual(it.sent[0].body.events.map((one) => one.seq), [1, 2]);
  assert.equal(it.sent[0].body.seq, 2);
});

test("an open seat keeps arriving: whatever happens next goes up on its own", async () => {
  const it = bench({ events: [], seq: 0 });
  await it.relay.take(CELULAR, "seat-open", { seat: "meu-assento", from: 0 });
  it.sent.length = 0;

  it.desk.deliver("meu-assento", { seq: 3, type: "assistant" });
  it.desk.deliver("outro-assento", { seq: 4, type: "assistant" });

  assert.equal(it.sent.length, 1, "either nothing went up, or an event of a seat nobody asked for did");
  assert.equal(it.sent[0].body.events[0].seq, 3);
});

test("closing the seat stops the sending, and nothing leaks to whoever left the screen", async () => {
  const it = bench();
  await it.relay.take(CELULAR, "seat-open", { seat: "meu-assento", from: 0 });
  await it.relay.take(CELULAR, "seat-close", { seat: "meu-assento" });
  it.sent.length = 0;

  it.desk.deliver("meu-assento", { seq: 5, type: "result" });
  assert.equal(it.sent.length, 0);
  assert.deepEqual(it.relay.watching, []);
});

test("what the phone types reaches the seat, and the answer comes back under the same number", async () => {
  const heard = [];
  const it = bench({ onCommand: async (name, cmd) => { heard.push([name, cmd]); return { ok: true, queued: true }; } });

  await it.relay.take(CELULAR, "seat-command", { seat: "meu-assento", cmd: { type: "say", text: "bom dia", cid: 12 } });

  assert.deepEqual(heard[0][0], "meu-assento");
  assert.equal(heard[0][1].text, "bom dia");
  const back = it.sent.find((one) => one.kind === "seat-reply");
  assert.ok(back, "the answer to the command never came back");
  assert.equal(back.body.cid, 12, "without the number the bubble of the conversation never knows itself");
  assert.equal(back.body.reply.queued, true);
});

test("a seat that does not exist is said out loud, instead of an empty conversation", async () => {
  const it = bench({ events: null });
  const said = await it.relay.take(CELULAR, "seat-open", { seat: "sumido", from: 0 });
  assert.equal(said.ok, false);
  assert.equal(it.sent[0].kind, "seat-gone");
  assert.deepEqual(it.relay.watching, [], "it kept following a seat that does not exist");
});

test("the team sees the seat, but only types in it with the keyboard lent", async () => {
  const it = bench({ events: [{ seq: 1 }], allow: (who, seat, need) => need === "read" || who === CELULAR });

  const leu = await it.relay.take(ESTRANHO, "seat-open", { seat: "meu-assento", from: 0 });
  assert.equal(leu.ok, true, "o time deveria enxergar o assento");
  assert.equal(it.sent.filter((one) => one.kind === "seat-events").length, 1);

  const digitou = await it.relay.take(ESTRANHO, "seat-command", { seat: "meu-assento", cmd: { type: "say", text: "oi" } });
  assert.equal(digitou.ok, false, "whoever did not borrow the keyboard typed anyway");
  assert.match(it.sent.find((one) => one.kind === "seat-reply").body.reply.error, /not lent/);
});

test("a seat closed to reading does not leak even the start of the conversation", async () => {
  const it = bench({ events: [{ seq: 1 }], allow: () => false });
  const negado = await it.relay.take(ESTRANHO, "seat-open", { seat: "meu-assento", from: 0 });
  assert.equal(negado.ok, false);
  assert.equal(it.sent.filter((one) => one.kind === "seat-events").length, 0, "it sent the conversation to somebody who could not read it");
  assert.equal(it.sent[0].kind, "seat-gone", "the refusal was silent, and the other screen would spin forever");
});

test("a note that is not about a seat is not mistaken for one", async () => {
  const it = bench();
  const said = await it.relay.take(CELULAR, "poke", {});
  assert.equal(said.ok, false);
  assert.equal(SEAT_KINDS.has("poke"), false);
  assert.deepEqual([...SEAT_KINDS], ["seat-open", "seat-command", "seat-close", "seat-born"]);
});

test("opening the same seat twice does not double what goes up", async () => {
  const it = bench();
  await it.relay.take(CELULAR, "seat-open", { seat: "meu-assento", from: 0 });
  await it.relay.take(CELULAR, "seat-open", { seat: "meu-assento", from: 0 });
  it.sent.length = 0;

  it.desk.deliver("meu-assento", { seq: 9, type: "result" });
  assert.equal(it.sent.length, 1, "the event went up twice");
});

function birthBench({ openSeat, mine } = {}) {
  const handed = [];
  const desk = createDesk({ history: () => ({ events: [], seq: 0 }), command: async () => ({ ok: true }) });
  const relay = createRelay({
    desk,
    sendTo: () => {},
    ...(mine ? { mine } : {}),
    openSeat,
    handBirth: (id, said) => handed.push([id, said])
  });
  return { relay, handed };
}

test("a new chat asked from the phone is opened here, and the name comes back", async () => {
  const asked = [];
  const it = birthBench({ openSeat: async (mission) => { asked.push(mission); return { id: "n7", name: "a-fresh-seat" }; } });

  const said = await it.relay.take(CELULAR, "seat-born", { id: "new chat-1", mission: { prompt: "fix the door", where: "local" } });
  assert.equal(said.ok, true);
  assert.equal(asked[0].prompt, "fix the door");
  assert.deepEqual(it.handed[0], ["new chat-1", { born: "n7", name: "a-fresh-seat" }]);
});

test("a chat that failed to open says why, so the phone is not left waiting", async () => {
  const it = birthBench({ openSeat: async () => ({ error: "the cluster is not answering" }) });
  const said = await it.relay.take(CELULAR, "seat-born", { id: "new chat-2", mission: { prompt: "x" } });
  assert.equal(said.ok, false);
  assert.equal(it.handed[0][1].error, "the cluster is not answering");
});

test("a machine that blows up opening a chat still answers the ask", async () => {
  const it = birthBench({ openSeat: async () => { throw new Error("no repo by that name"); } });
  const said = await it.relay.take(CELULAR, "seat-born", { id: "new chat-3", mission: {} });
  assert.equal(said.ok, false);
  assert.equal(it.handed[0][1].error, "no repo by that name");
});

test("only your own devices open a chat on your machine", async () => {
  let opened = 0;
  const it = birthBench({ mine: (who) => who === CELULAR, openSeat: async () => { opened += 1; return { name: "x" }; } });
  const said = await it.relay.take(ESTRANHO, "seat-born", { id: "new chat-4", mission: { prompt: "x" } });
  assert.equal(said.ok, false);
  assert.equal(opened, 0, "somebody else's machine opened a chat here");
  assert.match(it.handed[0][1].error, /your own devices/);
});

test("an ask with no id opens nothing", async () => {
  let opened = 0;
  const it = birthBench({ openSeat: async () => { opened += 1; return { name: "x" }; } });
  assert.equal((await it.relay.take(CELULAR, "seat-born", { mission: {} })).ok, false);
  assert.equal(opened, 0);
});

test("the server itself asks for a new chat — it is not a device, and must not be turned away", async () => {
  const SERVER = "SHA256:the-server";
  const handed = [];
  const desk = createDesk({ history: () => ({ events: [], seq: 0 }), command: async () => ({ ok: true }) });
  const relay = createRelay({
    desk,
    sendTo: () => {},
    mine: (who) => who === CELULAR || who === SERVER,
    openSeat: async () => ({ id: "n1", name: "a-seat" }),
    handBirth: (id, said) => handed.push(["born", id, said])
  });

  const born = await relay.take(SERVER, "seat-born", { id: "born-1", mission: { prompt: "x" } });
  assert.equal(born.ok, true, "a new chat was refused to the server that asked on the phone's behalf");
  assert.equal(handed[0][2].name, "a-seat");
});

test("what the phone used to ask through the relay is no longer a note about a seat", async () => {
  const it = bench();
  for (const kind of ["seat-picture", "shot-ask", "shelf-ask"]) {
    assert.equal(SEAT_KINDS.has(kind), false, `${kind} still travels through the relay`);
    assert.equal((await it.relay.take(CELULAR, kind, {})).ok, false);
  }
});
