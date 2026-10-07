import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { createBroker, doorOf, listenOn } from "../server.mjs";
import { createBrokerClient, attachStream } from "../client.mjs";
import { createSessions, driverArgs, glanceAt, seatsToReconnect, stateOfSeat } from "../sessions.mjs";
import { fleetOf } from "../fleet.mjs";
import { newIdentity } from "../identity.mjs";
import { seatSockPath } from "../engine/paths.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("a session's state comes off its last event, not a guess", () => {
  assert.equal(stateOfSeat({ alive: false, lastEvent: null }), "closed");
  assert.equal(stateOfSeat({ alive: true, lastEvent: null }), "starting");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "result" } }), "idle");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "driver", subtype: "question" } }), "asking");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "driver", subtype: "plan", id: "p1" } }), "asking");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "driver", subtype: "todo" } }), "working", "a checklist another agent published is not a chat waiting on the person");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "assistant" } }), "working");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "driver", subtype: "slept" } }), "idle");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "driver", subtype: "woke" } }), "working");
});

test("a hook, a command list refresh or a rate limit note after the result does not wake an idle seat", () => {
  const lines = [
    { seq: 1, type: "assistant" },
    { seq: 2, type: "result" },
    { seq: 3, type: "system", subtype: "hook_started" },
    { seq: 4, type: "system", subtype: "hook_response" },
    { seq: 5, type: "system", subtype: "commands_changed" },
    { seq: 6, type: "rate_limit_event" }
  ].map((e) => JSON.stringify(e)).join("\n");
  const seen = glanceAt(lines);
  assert.equal(seen.seq, 6, "the seq still counts every event");
  assert.equal(stateOfSeat({ alive: true, lastEvent: seen.last }), "idle");
  const onlyNoise = glanceAt([{ seq: 1, type: "system", subtype: "init" }].map((e) => JSON.stringify(e)).join("\n"));
  assert.equal(stateOfSeat({ alive: true, lastEvent: onlyNoise.last }), "working", "a seat that only said init is still booting its first turn");
});

test("the driver's command line carries only what was asked for", () => {
  assert.deepEqual(driverArgs({ name: "um" }), ["--name", "um"]);
  assert.deepEqual(
    driverArgs({ name: "um", cwd: "/repo", model: "opus", resumeId: "abc" }),
    ["--name", "um", "--cwd", "/repo", "--model", "opus", "--resume-id", "abc"]
  );
});

function fakeSeat(base, name) {
  mkdirSync(join(base, "events"), { recursive: true });
  mkdirSync(join(base, "sessions"), { recursive: true });
  mkdirSync(join(base, "sock"), { recursive: true });
  writeFileSync(join(base, "sessions", `${name}.json`), JSON.stringify({ cwd: "/repo", model: "opus", title: "um assento" }));

  const events = join(base, "events", `${name}.ndjson`);
  writeFileSync(events, "");
  let seq = 0;
  const emit = (event) => { seq += 1; appendFileSync(events, JSON.stringify({ seq, ...event }) + "\n"); return seq; };

  const heard = [];
  const sock = seatSockPath(base, name);
  const listening = createServer((live) => {
    live.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        const cmd = JSON.parse(line);
        heard.push(cmd);
        live.write(JSON.stringify({ ok: true, echoed: cmd.type }) + "\n");
      }
    });
  });
  return {
    emit,
    heard,
    up: () => new Promise((done) => listening.listen(sock, done)),
    down: () => new Promise((done) => listening.close(done))
  };
}

test("a live session shows up in the list with its state and title", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "meu-assento");
  await seat.up();
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    seat.emit({ type: "assistant", message: { content: [] } });
    const all = await sessions.list();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, "meu-assento");
    assert.equal(all[0].alive, true);
    assert.equal(all[0].title, "um assento");
    assert.equal(all[0].model, "opus");
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

test("say and answer reach the seat's socket as commands", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "conversa");
  await seat.up();
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    const said = await sessions.command("conversa", { type: "say", text: "oi" });
    assert.equal(said.ok, true);
    await sessions.command("conversa", { type: "answer", text: "sim" });
    assert.deepEqual(seat.heard.map((c) => c.type), ["say", "answer"]);
    assert.equal(seat.heard[0].text, "oi");
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

const until = async (check, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("waited too long");
    await wait(25);
  }
};

test("a ! line runs in the chat's folder and is recorded through the seat, never spoken to it", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "shell-aqui");
  writeFileSync(join(base, "sessions", "shell-aqui.json"), JSON.stringify({ cwd: base, model: "opus" }));
  await seat.up();
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    const said = await sessions.command("shell-aqui", { type: "shell", command: "pwd; echo done", cid: "s1-x" });
    assert.equal(said.ok, true);
    assert.equal(said.cid, "s1-x");
    await until(() => seat.heard.some((c) => c.type === "record"));
    const record = seat.heard.find((c) => c.type === "record");
    assert.equal(record.event.type, "driver");
    assert.equal(record.event.subtype, "shell");
    assert.equal(record.event.cid, "s1-x");
    assert.equal(record.event.command, "pwd; echo done");
    assert.equal(record.event.code, 0);
    assert.ok(record.event.output.includes(base), record.event.output);
    assert.ok(record.event.output.includes("done"), record.event.output);
    assert.ok(!seat.heard.some((c) => c.type === "say"), "the line never became a message to the model");
    assert.equal((await sessions.command("shell-aqui", { type: "shell", command: "   " })).ok, false);
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a !! line runs and reaches the screen, but is never written into the chat's history", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "shell-quieto");
  writeFileSync(join(base, "sessions", "shell-quieto.json"), JSON.stringify({ cwd: base }));
  await seat.up();
  const seen = [];
  const sessions = createSessions({ base, driver: "/nao/vou/rodar", onEvent: (name, event) => seen.push(event) });
  try {
    const said = await sessions.command("shell-quieto", { type: "shell", command: "echo hush", cid: "s3-x", quiet: true });
    assert.equal(said.ok, true);
    assert.equal(said.quiet, true);
    await until(() => seen.some((one) => one.subtype === "shell"));
    const shown = seen.find((one) => one.subtype === "shell");
    assert.equal(shown.quiet, true);
    assert.equal(shown.cid, "s3-x");
    assert.ok(shown.output.includes("hush"));
    await wait(100);
    assert.ok(!seat.heard.some((c) => c.type === "record"), "a quiet line is never handed to the seat to write down");
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a ! line on a chat whose driver is not listening still reaches the screen, marked as not recorded", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  fakeSeat(base, "shell-sozinho");
  writeFileSync(join(base, "sessions", "shell-sozinho.json"), JSON.stringify({ cwd: base }));
  const seen = [];
  const sessions = createSessions({ base, driver: "/nao/vou/rodar", onEvent: (name, event) => seen.push({ name, event }) });
  try {
    const said = await sessions.command("shell-sozinho", { type: "shell", command: "echo alone", cid: "s2-x" });
    assert.equal(said.ok, true);
    await until(() => seen.some((one) => one.event.subtype === "shell"));
    const shown = seen.find((one) => one.event.subtype === "shell");
    assert.equal(shown.name, "shell-sozinho");
    assert.equal(shown.event.unrecorded, true);
    assert.ok(shown.event.output.includes("alone"));
    assert.equal(stateOfSeat({ alive: true, lastEvent: shown.event }), "working", "a shell note alone never decides the state");
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a gateway swap tells the awake seats to reconnect the hub and leaves the sleeping ones alone", () => {
  const meta = { acordado: {}, dormindo: { asleep: true }, "quem-trocou": {} };
  assert.deepEqual(
    seatsToReconnect(Object.keys(meta), (name) => meta[name], "quem-trocou"),
    { sent: ["acordado"], skipped: ["dormindo"] }
  );
});

test("reconnectMcp sends the control command only to awake seats other than the one that swapped", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const acordado = fakeSeat(base, "acordado");
  const dormindo = fakeSeat(base, "dormindo");
  const trocou = fakeSeat(base, "quem-trocou");
  writeFileSync(join(base, "sessions", "dormindo.json"), JSON.stringify({ cwd: "/repo", asleep: true }));
  await Promise.all([acordado.up(), dormindo.up(), trocou.up()]);
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    const done = await sessions.reconnectMcp("hub", { except: "quem-trocou" });
    assert.deepEqual(done, { reconnected: ["acordado"], failed: [], asleep: ["dormindo"] });
    assert.deepEqual(acordado.heard.map((c) => [c.type, c.op, c.server]), [["control", "mcpReconnect", "hub"]]);
    assert.equal(dormindo.heard.length, 0, "a control command would wake the sleeping seat");
    assert.equal(trocou.heard.length, 0, "the seat that swapped already talks to the new gateway");
  } finally {
    sessions.stop();
    await Promise.all([acordado.down(), dormindo.down(), trocou.down()]);
    rmSync(base, { recursive: true, force: true });
  }
});

test("history comes back from a seq and skips the raw stream", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "historia");
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "um" }] } });
    seat.emit({ type: "stream_event", delta: "ruído" });
    seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "dois" }] } });
    seat.emit({ type: "result" });

    const tudo = sessions.history("historia", 0);
    assert.equal(tudo.seq, 4);
    assert.equal(tudo.events.length, 3);
    assert.ok(!tudo.events.some((e) => e.type === "stream_event"));

    const depois = sessions.history("historia", 2);
    assert.deepEqual(depois.events.map((e) => e.seq), [3, 4]);
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("opening a session launches the driver with the right arguments", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const launched = [];
  const sessions = createSessions({
    base,
    driver: "/caminho/do/driver.mjs",
    launch: (args, options) => {
      launched.push({ args, cwd: options.cwd, stateDir: options.env.HIVE_STATE_DIR });
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    }
  });
  try {
    const opened = await sessions.open({ name: "nova", cwd: "/repo", model: "sonnet" });
    assert.deepEqual(opened, { name: "nova", started: true });
    assert.deepEqual(launched[0].args, ["--name", "nova", "--cwd", "/repo", "--model", "sonnet"]);
    assert.equal(launched[0].stateDir, base, "o driver tem que escrever no estado do servidor");

    const recusada = await sessions.open({ name: "NÃO VALE" });
    assert.match(recusada.error, /name a seat can have/);
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

let home;
let broker;
let url;
let seat;

before(async () => {
  home = mkdtempSync(join(tmpdir(), "hive-broker-sess-"));
  seat = fakeSeat(home, "ao-vivo");
  await seat.up();
  broker = createBroker({ home, launch: () => { throw new Error("este teste não lança driver"); } });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${broker.http.address().port}`;
});

after(async () => {
  broker.sessions.stop();
  broker.http.close();
  await seat.down();
  rmSync(home, { recursive: true, force: true });
});

async function paired(name) {
  const audience = broker.identity.fingerprint;
  const code = broker.roster.open({ kind: "mac" }).code;
  const me = newIdentity(name);
  const done = await fetch(`${url}/api/pair`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name })
  });
  assert.equal((await done.json()).paired, true);
  return { me, client: createBrokerClient({ url, identity: me, audience }) };
}

test("the session routes demand a signature like everything else", async () => {
  const nua = await fetch(`${url}/api/sessions`);
  assert.equal(nua.status, 401);
});

test("a session's list and conversation arrive over signed HTTP", async () => {
  const { client } = await paired("desktop");
  const all = await client.get("/api/sessions");
  assert.equal(all.ok, true, all.error);
  assert.ok(all.body.sessions.some((s) => s.name === "ao-vivo"));

  const um = await client.get("/api/sessions/ao-vivo");
  assert.equal(um.ok, true, um.error);
  assert.equal(um.body.alive, true);

  const falou = await client.post("/api/sessions/ao-vivo/say", { text: "bom dia" });
  assert.equal(falou.ok, true, falou.error);
  assert.ok(seat.heard.some((c) => c.type === "say" && c.text === "bom dia"));
});

test("a new session event is pushed down the stream to whoever follows it", async () => {
  const { client } = await paired("desktop-que-assiste");
  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 100 && !stream.up; round += 1) await wait(20);
    assert.equal(stream.up, true);

    const um = await client.get("/api/sessions/ao-vivo");
    assert.equal(um.ok, true, um.error);

    seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "empurrado" }] } });

    for (let round = 0; round < 150 && !heard.some((e) => e.kind === "event"); round += 1) await wait(20);
    const event = heard.find((e) => e.kind === "event");
    assert.ok(event, `só chegou ${JSON.stringify(heard.map((e) => e.kind))}`);
    assert.equal(event.body.session, "ao-vivo");
    assert.equal(event.body.event.message.content[0].text, "empurrado");
  } finally {
    stream.stop();
  }
});

test("the server opens on a file socket, which is how the app embeds it", async () => {
  const spot = mkdtempSync(join(tmpdir(), "hive-door-"));
  const socket = join(spot, "hive.sock");
  const mine = createBroker({ home: mkdtempSync(join(tmpdir(), "hive-broker-sock-")) });
  try {
    const door = doorOf({ HIVE_BROKER_SOCKET: socket });
    assert.equal(door.kind, "socket");
    await listenOn(mine.http, door);

    const said = await new Promise((done) => {
      const request = { socketPath: socket, path: "/health", method: "GET" };
      import("node:http").then(({ request: ask }) => {
        const live = ask(request, (answer) => {
          let text = "";
          answer.on("data", (c) => { text += c; });
          answer.on("end", () => done(text));
        });
        live.end();
      });
    });
    assert.match(said, /"ok":true/);
  } finally {
    mine.sessions.stop();
    mine.http.close();
    rmSync(spot, { recursive: true, force: true });
  }
});

test("doorOf picks a port when nobody asks for a socket", () => {
  assert.deepEqual(doorOf({}), { kind: "port", port: 8791, host: "127.0.0.1" },
    "the default has to stay loopback: behind this port is a shell with no approval prompts");
  assert.deepEqual(doorOf({ HIVE_BROKER_BIND: "0.0.0.0" }), { kind: "port", port: 8791, host: "0.0.0.0" });
  assert.deepEqual(doorOf({ PORT: "9000", HIVE_BROKER_BIND: "127.0.0.1" }), { kind: "port", port: 9000, host: "127.0.0.1" });
});

test("listing the fleet does not read a whole conversation, and a seat nobody runs reads as closed", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "meu-assento");
  await seat.up();
  const dead = fakeSeat(base, "assento-morto");
  const replayed = [];
  const sessions = createSessions({ base, driver: "/nao/vou/rodar", onEvent: (name) => replayed.push(name) });
  try {
    for (let turn = 0; turn < 40; turn++) {
      seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "x".repeat(4000) }] } });
      seat.emit({ type: "result" });
      dead.emit({ type: "assistant", message: { content: [] } });
    }
    const all = (await sessions.list()).sort((a, b) => a.name.localeCompare(b.name));

    assert.deepEqual(all.map((one) => [one.name, one.state]), [
      ["assento-morto", "closed"],
      ["meu-assento", "idle"]
    ], "the state of a seat has to survive not following its events");
    assert.equal(all[1].seq, 80, "the tail read has to give the same sequence a full read would");
    assert.deepEqual(sessions.watching, ["meu-assento"], "only a seat someone is running is worth following");

    await wait(60);
    assert.deepEqual(replayed, [], "following a seat must not replay the conversation that is already on the screen");
    seat.emit({ type: "result" });
    await wait(600);
    assert.deepEqual(replayed, ["meu-assento"], "what happens after the fleet is read still has to arrive");
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a closed seat never reaches the phone's fleet", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  fakeSeat(base, "assento-morto");
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    const list = await sessions.list();
    assert.equal(list.length, 1, "the seat is still known, it just is not running");
    assert.deepEqual(fleetOf({ sessions: list, rows: [] }).sessions, [], "a fleet that counts the dead lies about how many chats there are");
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("the phone can ask for the tail of a conversation instead of all of it", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "conversa-longa");
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    for (let turn = 0; turn < 140; turn++) {
      seat.emit({ type: "user", subtype: "say", message: { content: [{ type: "text", text: `turn ${turn}` }] } });
      seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "x".repeat(400) }] } });
      seat.emit({ type: "result" });
    }
    const whole = sessions.history("conversa-longa", 0);
    const tail = sessions.history("conversa-longa", 0, { window: "tail" });

    assert.equal(whole.events.length, 420);
    assert.ok(tail.events.length < whole.events.length, "the tail has to be shorter than the whole thing");
    assert.equal(tail.events[0].subtype, "windowed", "a cut conversation has to say it was cut");
    assert.equal(tail.events[0].turnsTotal, 140);
    assert.equal(tail.seq, whole.seq, "cutting what is shown must not lose where the conversation is");
    assert.equal(
      sessions.history("conversa-longa", 0, { window: "all" }).events.length,
      whole.events.length,
      "only a seat that asked for the tail gets a cut one"
    );
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a short conversation is never cut, so the phone never offers to see what came before", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "conversa-curta");
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    seat.emit({ type: "user", subtype: "say", message: { content: [{ type: "text", text: "oi" }] } });
    seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "olá" }] } });
    seat.emit({ type: "result" });
    const tail = sessions.history("conversa-curta", 0, { window: "tail" });
    assert.equal(tail.events.length, 3);
    assert.ok(!tail.events.some((one) => one.subtype === "windowed"), "nothing was cut, so nothing may claim it was");
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("the desk can ask for the last turns of a conversation, whole events kept, and then page backwards", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "conversa-paginada");
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    for (let turn = 0; turn < 25; turn++) {
      seat.emit({ type: "user", subtype: "say", message: { content: [{ type: "text", text: `turn ${turn}` }] } });
      seat.emit({ type: "assistant", message: { content: [{ type: "text", text: `answer ${turn}` }] } });
      seat.emit({ type: "result" });
    }
    const tail = sessions.history("conversa-paginada", 0, { window: "turns", turns: 10 });
    assert.equal(tail.events[0].subtype, "windowed");
    assert.deepEqual([tail.events[0].turns, tail.events[0].turnsTotal], [10, 25]);
    assert.equal(tail.events.length, 1 + 30, "ten turns of three events each, behind the marker");
    assert.equal(tail.events[1].message.content[0].text, "turn 15");
    assert.equal(tail.earlier, true);
    assert.equal(tail.first, tail.events[1].seq);

    const page = sessions.history("conversa-paginada", 0, { before: tail.first, turns: 10 });
    assert.ok(!page.events.some((ev) => ev.subtype === "windowed"), "a page carries no marker — the answer says whether there is more");
    assert.equal(page.events.length, 30);
    assert.equal(page.events[0].message.content[0].text, "turn 5");
    assert.equal(page.events.at(-1).type, "result");
    assert.ok(page.events.every((ev) => ev.seq < tail.first), "a page ends right before what is already shown");
    assert.equal(page.earlier, true);

    const last = sessions.history("conversa-paginada", 0, { before: page.first, turns: 10 });
    assert.equal(last.events.length, 15);
    assert.equal(last.events[0].message.content[0].text, "turn 0");
    assert.equal(last.earlier, false, "the first page of all says there is nothing before it");

    const whole = sessions.history("conversa-paginada", 0, { window: "turns", turns: 100 });
    assert.ok(!whole.events.some((ev) => ev.subtype === "windowed"), "a window wider than the chat cuts nothing");
    assert.equal(whole.earlier, false);
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("plumbing before the first turn is not something to page to", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "conversa-novinha");
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    seat.emit({ type: "driver", subtype: "started" });
    seat.emit({ type: "system", subtype: "init" });
    seat.emit({ type: "user", subtype: "say", message: { content: [{ type: "text", text: "bom dia" }] } });
    seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "bom dia!" }] } });
    seat.emit({ type: "result" });
    const tail = sessions.history("conversa-novinha", 0, { window: "turns", turns: 10 });
    assert.ok(!tail.events.some((ev) => ev.subtype === "windowed"), "every turn is on screen, so there is nothing earlier to offer");
    assert.equal(tail.earlier, false);

    for (let turn = 0; turn < 12; turn++) {
      seat.emit({ type: "user", subtype: "say", message: { content: [{ type: "text", text: `turn ${turn}` }] } });
      seat.emit({ type: "assistant", message: { content: [{ type: "text", text: `answer ${turn}` }] } });
      seat.emit({ type: "result" });
    }
    const cut = sessions.history("conversa-novinha", 0, { window: "turns", turns: 10 });
    assert.equal(cut.events[0].subtype, "windowed", "once turns fall out of the window, the marker is back");
    assert.equal(cut.earlier, true);
    const last = sessions.history("conversa-novinha", 0, { before: cut.first, turns: 10 });
    assert.equal(last.earlier, false, "the page holding the first turn ends the paging, plumbing or not");
  } finally {
    sessions.stop();
    rmSync(base, { recursive: true, force: true });
  }
});

test("the fleet can ask whether a seat still answers on its socket, window or no window", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-sess-"));
  const seat = fakeSeat(base, "meu-assento");
  await seat.up();
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    assert.equal(await sessions.alive("meu-assento"), true);
    assert.equal(await sessions.alive("ninguem"), false);
  } finally {
    sessions.stop();
    await seat.down();
  }
});

test("a provider change caught before its ready result leaves the chat idle", () => {
  const chunk = [
    JSON.stringify({ type: "result", is_error: false, seq: 3 }),
    JSON.stringify({ type: "driver", subtype: "provider_changed", agent: "codex", model: "gpt", seq: 4 })
  ].join("\n");
  const glanced = glanceAt(chunk);
  assert.equal(glanced.seq, 4);
  assert.equal(stateOfSeat({ alive: true, lastEvent: glanced.last }), "idle");
});

test("a chat that fell asleep stays idle through the notes its driver writes on the way back", () => {
  const chunk = [
    JSON.stringify({ type: "result", is_error: false, seq: 10 }),
    JSON.stringify({ type: "driver", subtype: "slept", reason: "idle", seq: 11 }),
    JSON.stringify({ type: "driver", subtype: "mcp_gateway", ok: true, seq: 12 }),
    JSON.stringify({ type: "driver", subtype: "mcp_peer", via: "gateway", seq: 13 }),
    JSON.stringify({ type: "driver", subtype: "mcp_routed", servers: [], seq: 14 }),
    JSON.stringify({ type: "driver", subtype: "started", asleep: true, seq: 15 }),
    JSON.stringify({ type: "driver", subtype: "presence", watched: true, seq: 16 })
  ].join("\n");
  const glanced = glanceAt(chunk);
  assert.equal(glanced.seq, 16);
  assert.equal(stateOfSeat({ alive: true, lastEvent: glanced.last }), "idle");
});
