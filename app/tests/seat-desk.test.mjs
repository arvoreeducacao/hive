import { test } from "node:test";
import assert from "node:assert/strict";

import { createDesk } from "../lib/seat-desk.mjs";
import { attachSeat } from "../lib/seat-link.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeSessions({ history = { events: [], seq: 0 }, onCommand = async () => ({ ok: true }) } = {}) {
  const asked = [];
  return {
    asked,
    history: (name, from) => { asked.push(["history", name, from]); return history; },
    command: async (name, cmd) => { asked.push(["command", name, cmd]); return onCommand(name, cmd); }
  };
}

test("the desk hands over the seat's history without going through any server", async () => {
  const sessions = fakeSessions({ history: { events: [{ seq: 1, type: "assistant" }], seq: 1 } });
  const desk = createDesk(sessions);

  const said = await desk.client.get("/api/sessions/meu-assento/events?from=0");
  assert.equal(said.ok, true);
  assert.deepEqual(said.body.events, [{ seq: 1, type: "assistant" }]);
  assert.deepEqual(sessions.asked[0], ["history", "meu-assento", 0]);
});

test("the desk carries the command to the seat and hands back what it answered", async () => {
  const sessions = fakeSessions({ onCommand: async () => ({ ok: true, queued: true }) });
  const desk = createDesk(sessions);

  const said = await desk.client.post("/api/sessions/meu-assento/command", { type: "say", text: "bom dia" });
  assert.equal(said.ok, true);
  assert.equal(said.body.queued, true);
  assert.deepEqual(sessions.asked[0], ["command", "meu-assento", { type: "say", text: "bom dia" }]);
});

test("a seat that will not take the command becomes an error, not silence", async () => {
  const desk = createDesk(fakeSessions({ onCommand: async () => ({ ok: false, error: "that seat is not listening" }) }));
  const said = await desk.client.post("/api/sessions/mudo/command", { type: "say" });
  assert.equal(said.ok, false);
  assert.equal(said.error, "that seat is not listening");
});

test("a path that is not a seat's is not answered by the desk", async () => {
  const desk = createDesk(fakeSessions());
  assert.equal((await desk.client.get("/api/board")).ok, false);
  assert.equal((await desk.client.post("/api/panel", {})).ok, false);
});

test("a new event reaches whoever follows that seat, and only that one", () => {
  const desk = createDesk(fakeSessions());
  const meu = [];
  const outro = [];
  const held = desk.stream.follow("meu-assento", (envelope) => meu.push(envelope));
  desk.stream.follow("outro-assento", (envelope) => outro.push(envelope));

  desk.deliver("meu-assento", { seq: 2, type: "result" });
  assert.equal(meu.length, 1);
  assert.equal(meu[0].body.session, "meu-assento");
  assert.equal(outro.length, 0);

  held.stop();
  desk.deliver("meu-assento", { seq: 3, type: "result" });
  assert.equal(meu.length, 1, "quem largou o assento continuou recebendo");
});

test("the tile opens through the desk: history first, live event after, without repeating", async () => {
  const sessions = fakeSessions({ history: { events: [{ seq: 1, type: "assistant" }], seq: 1 } });
  const desk = createDesk(sessions);
  const sent = [];

  const seat = attachSeat({ client: desk.client, stream: desk.stream, name: "meu-assento", from: 0, send: (line) => sent.push(line) });
  for (let round = 0; round < 40 && !sent.length; round += 1) await wait(10);

  desk.deliver("meu-assento", { seq: 1, type: "assistant" });
  desk.deliver("meu-assento", { seq: 2, type: "result" });

  assert.deepEqual(sent.map((line) => JSON.parse(line).seq), [1, 2], "the event that had already landed came back again");
  seat.stop();
});

test("the phone's picture is kept on the machine that runs the seat, and travels as a say", async () => {
  const sessions = fakeSessions();
  const guardadas = [];
  const desk = createDesk(sessions, {
    base: "/casa",
    now: () => 111,
    keep: (base, seat, image, opts) => { guardadas.push([base, seat, image, opts]); return { path: "/casa/shots/meu-assento/celular-111.jpg" }; }
  });

  const said = await desk.client.post("/api/sessions/meu-assento/picture", { image: "data:image/jpeg;base64,QQ==", text: "olha isso" });
  assert.equal(said.ok, true);
  assert.equal(said.body.path, "/casa/shots/meu-assento/celular-111.jpg");
  assert.deepEqual(guardadas[0].slice(0, 2), ["/casa", "meu-assento"]);

  const [, , cmd] = sessions.asked.find(([what]) => what === "command");
  assert.equal(cmd.type, "say");
  assert.equal(cmd.text, "olha isso /casa/shots/meu-assento/celular-111.jpg");
});

test("a picture that cannot be read is refused before it becomes a say", async () => {
  const desk = createDesk(fakeSessions(), { base: "/casa", keep: () => ({ error: "essa foto chegou vazia" }) });
  const said = await desk.client.post("/api/sessions/meu-assento/picture", { image: "" });
  assert.equal(said.ok, false);
  assert.equal(said.error, "essa foto chegou vazia");
});

test("the desk tells the seat when the first pane opens on it and when the last one closes", async () => {
  const sessions = fakeSessions();
  const desk = createDesk(sessions);
  const presence = () => sessions.asked.filter(([what, , cmd]) => what === "command" && cmd.type === "presence").map(([, name, cmd]) => [name, cmd.watched]);

  const first = desk.stream.follow("meu-assento", () => {});
  desk.stream.follow("outro-assento", () => {});
  const second = desk.stream.follow("meu-assento", () => {});
  await wait(0);
  assert.deepEqual(presence(), [["meu-assento", true], ["outro-assento", true]], "the second pane on the same seat adds nothing");

  first.stop();
  first.stop();
  await wait(0);
  assert.equal(presence().length, 2, "one pane still open: nothing to say");

  second.stop();
  await wait(0);
  assert.deepEqual(presence().at(-1), ["meu-assento", false]);
});

test("a driver that starts over under an open pane hears again that somebody is looking", async () => {
  const sessions = fakeSessions();
  const desk = createDesk(sessions);
  const presence = () => sessions.asked.filter(([what, , cmd]) => what === "command" && cmd.type === "presence").map(([, name, cmd]) => [name, cmd.watched]);

  desk.deliver("meu-assento", { type: "driver", subtype: "started" });
  await wait(0);
  assert.deepEqual(presence(), [], "nobody looks: nothing to tell");

  const held = desk.stream.follow("meu-assento", () => {});
  desk.deliver("meu-assento", { type: "driver", subtype: "started" });
  desk.deliver("meu-assento", { type: "result" });
  await wait(0);
  assert.deepEqual(presence(), [["meu-assento", true], ["meu-assento", true]]);
  held.stop();
});
