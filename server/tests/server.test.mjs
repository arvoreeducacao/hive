import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { createBroker } from "../server.mjs";
import { createBrokerClient, attachStream } from "../client.mjs";
import { newIdentity } from "../identity.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let home;
let broker;
let url;

before(async () => {
  home = mkdtempSync(join(tmpdir(), "hive-broker-"));
  broker = createBroker({ home });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${broker.http.address().port}`;
});

after(() => {
  broker.http.close();
  rmSync(home, { recursive: true, force: true });
});

async function pair(kind, name) {
  const opened = await fetch(`${url}/api/broker`);
  assert.equal(opened.ok, true);
  const { key: brokerKey, fingerprint: audience } = await opened.json();

  const code = broker.roster.open({ kind }).code;
  const me = newIdentity(name);
  const done = await fetch(`${url}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name })
  });
  const body = await done.json();
  assert.equal(body.paired, true, JSON.stringify(body));
  assert.equal(body.broker, brokerKey);
  return { me, client: createBrokerClient({ url, identity: me, audience }), audience };
}

test("the server names itself without being asked, and that is the only open route", async () => {
  const said = await (await fetch(`${url}/api/broker`)).json();
  assert.match(said.key, /^ssh-ed25519 /);
  assert.match(said.fingerprint, /^SHA256:/);

  const closed = await fetch(`${url}/api/me`);
  assert.equal(closed.status, 401);
  assert.match((await closed.json()).error, /no readable time|not on the roster/);
});

test("pairing carries only the public key, and then the key opens the routes", async () => {
  const { client, me } = await pair("mac", "mac do joao");
  const mine = await client.me();
  assert.equal(mine.ok, true, mine.error);
  assert.equal(mine.body.fingerprint, me.fingerprint);
  assert.equal(mine.body.kind, "mac");
});

test("a wrong code closes the pairing after five tries", async () => {
  broker.roster.open({ kind: "phone" });
  const stranger = newIdentity("intruso");
  for (let round = 0; round < 5; round += 1) {
    const tried = await fetch(`${url}/api/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ERRADO12", key: stranger.publicSsh, name: "intruso" })
    });
    assert.equal(tried.status, 401);
  }
  const after = await fetch(`${url}/api/pair`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "ERRADO12", key: stranger.publicSsh })
  });
  assert.match((await after.json()).error, /nobody is pairing|closed/);
});

test("a key off the roster does not pass, even signing correctly", async () => {
  const audience = broker.identity.fingerprint;
  const stranger = newIdentity("de fora");
  const client = createBrokerClient({ url, identity: stranger, audience });
  const tried = await client.me();
  assert.equal(tried.status, 401);
  assert.match(tried.error, /not on the roster/);
});

test("a message crosses from the mac to the phone, pushed, with nobody asking", async () => {
  const mac = await pair("mac", "mac");
  const phone = await pair("phone", "iphone");

  const heard = [];
  const stream = attachStream({
    open: () => new WebSocket(phone.client.streamUrl()),
    onEnvelope: (envelope) => heard.push(envelope)
  });
  try {
    for (let round = 0; round < 100 && !stream.up; round += 1) await wait(20);
    assert.equal(stream.up, true, "the phone did not connect to the stream");

    const sent = await mac.client.say(phone.me.fingerprint, { text: "acorda" }, "say");
    assert.equal(sent.ok, true, sent.error);
    assert.equal(sent.body.live, true);

    for (let round = 0; round < 100 && !heard.some((e) => e.kind === "say"); round += 1) await wait(20);
    const said = heard.find((e) => e.kind === "say");
    assert.ok(said, `only ${JSON.stringify(heard)} arrived`);
    assert.equal(said.body.text, "acorda");
    assert.equal(said.from, mac.me.fingerprint);
  } finally {
    stream.stop();
  }
});

test("a message for someone offline is held and lands when they come back", async () => {
  const mac = await pair("mac", "mac");
  const phone = await pair("phone", "iphone");

  const sent = await mac.client.say(phone.me.fingerprint, { text: "enquanto você dormia" });
  assert.equal(sent.body.live, false);

  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(phone.client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 100 && !heard.some((e) => e.kind === "say"); round += 1) await wait(20);
    const said = heard.find((e) => e.kind === "say");
    assert.ok(said, `só chegou ${JSON.stringify(heard.map((e) => e.kind))}`);
    assert.equal(said.body.text, "enquanto você dormia");
  } finally {
    stream.stop();
  }
});

test("the team panel is pushed when someone publishes, not polled", async () => {
  const mine = await pair("mac", "eu");
  const colleague = await pair("mac", "colega");

  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(mine.client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 100 && !stream.up; round += 1) await wait(20);

    const put = await colleague.client.panel({ seats: [{ name: "um-assento", state: "working" }] });
    assert.equal(put.ok, true, put.error);

    for (let round = 0; round < 100 && !heard.some((e) => e.kind === "panel"); round += 1) await wait(20);
    assert.ok(heard.some((e) => e.kind === "panel"), "o aviso de painel não chegou");

    const board = await mine.client.board();
    assert.equal(board.ok, true, board.error);
    const row = board.body.board.find((one) => one.fingerprint === colleague.me.fingerprint);
    assert.ok(row, "the teammate did not show up on the board");
    assert.equal(row.panel.seats[0].name, "um-assento");
    assert.equal(row.stale, false);
  } finally {
    stream.stop();
  }
});

test("revoking cuts access and drops whoever was connected", async () => {
  const boss = await pair("mac", "dono");
  const doomed = await pair("phone", "celular perdido");

  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(doomed.client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 100 && !stream.up; round += 1) await wait(20);
    assert.equal((await doomed.client.me()).ok, true);

    const gone = await boss.client.post("/api/devices/revoke", { fingerprint: doomed.me.fingerprint });
    assert.equal(gone.ok, true, gone.error);

    const after = await doomed.client.me();
    assert.equal(after.status, 403);
    assert.match(after.error, /revoked/);
    assert.ok(heard.some((e) => e.kind === "revoked"), "o aparelho revogado não foi avisado");
  } finally {
    stream.stop();
  }
});

test("the same signature does not work twice", async () => {
  const { me, audience } = await pair("mac", "repeteco");
  const { signedHeaders } = await import("../client.mjs");
  const headers = signedHeaders({ secret: me.secret, fingerprint: me.fingerprint, audience, method: "GET", path: "/api/me", body: "" });

  const first = await fetch(`${url}/api/me`, { headers });
  assert.equal(first.status, 200);
  const second = await fetch(`${url}/api/me`, { headers });
  assert.equal(second.status, 401);
  assert.match((await second.json()).error, /already used once/);
});

test("a signature for one route does not hold on another", async () => {
  const { me, audience } = await pair("mac", "troca-rota");
  const { signedHeaders } = await import("../client.mjs");
  const headers = signedHeaders({ secret: me.secret, fingerprint: me.fingerprint, audience, method: "GET", path: "/api/me", body: "" });
  const tried = await fetch(`${url}/api/board`, { headers });
  assert.equal(tried.status, 401);
});

test("the stream refuses the unsigned", async () => {
  const port = broker.http.address().port;
  const refused = await new Promise((done) => {
    const live = new WebSocket(`ws://127.0.0.1:${port}/stream?key=SHA256:nada`);
    live.on("open", () => { live.close(); done(false); });
    live.on("error", () => done(true));
  });
  assert.equal(refused, true);
});

test("a body past the ceiling is refused, not swallowed", async () => {
  const { me, audience } = await pair("mac", "grandao");
  const big = "x".repeat((1 << 20) + 64);
  const answer = await fetch(`${url}/api/say`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await import("../client.mjs")).signedHeaders({ secret: me.secret, fingerprint: me.fingerprint, audience, method: "POST", path: "/api/say", body: big }) },
    body: big
  });
  assert.equal(answer.status, 413);
});

test("the query is part of what the signature covers", async () => {
  const { me, audience } = await pair("mac", "query-assinada");
  const { signedHeaders } = await import("../client.mjs");

  const honest = signedHeaders({ secret: me.secret, fingerprint: me.fingerprint, audience, method: "GET", path: "/api/board?from=0", body: "" });
  assert.equal((await fetch(`${url}/api/board?from=0`, { headers: honest })).status, 200);

  const tampered = signedHeaders({ secret: me.secret, fingerprint: me.fingerprint, audience, method: "GET", path: "/api/board?from=0", body: "" });
  const moved = await fetch(`${url}/api/board?from=999`, { headers: tampered });
  assert.equal(moved.status, 401, "trocar a query no caminho tem que ser recusado");

  const bare = signedHeaders({ secret: me.secret, fingerprint: me.fingerprint, audience, method: "GET", path: "/api/board", body: "" });
  const withQuery = await fetch(`${url}/api/board?from=1`, { headers: bare });
  assert.equal(withQuery.status, 401, "assinar sem query e mandar com query tem que ser recusado");
});

test("the phone asks for the fleet and gets what runs on the pod and what runs on the Mac", async () => {
  const mac = await pair("mac", "mac do joao");
  const phone = await pair("phone", "iPhone");

  const published = await mac.client.panel({
    v: 1,
    dev: "joao",
    at: Date.now(),
    avatar: "cloud/surprised/pink",
    seats: [
      { name: "assento-do-mac", where: "local", state: "working", title: "arrumando a porta" },
      { name: "assento-do-pod", where: "cloud", state: "idle" }
    ]
  });
  assert.equal(published.ok, true, published.error || "the Mac could not publish its panel");

  const fleet = await phone.client.get("/api/hive");
  assert.equal(fleet.ok, true, fleet.error || "the fleet did not answer the phone");

  const seats = fleet.body.sessions || [];
  const fromMac = seats.find((one) => one.name === "assento-do-mac");
  assert.ok(fromMac, "the Mac's seat never reached the phone");
  assert.equal(fromMac.where, "mac");
  assert.equal(fromMac.title, "arrumando a porta");

  assert.ok(!seats.some((one) => one.name === "assento-do-pod"),
    "a seat the Mac only mirrored from the pod got on the list without the pod saying a word");

  assert.equal(fleet.body.bench?.dev, "joao", "the face of the machine at home did not come along");
  assert.equal(fromMac.key, mac.me.fingerprint, "the seat does not say which machine it belongs to, so the phone would not know who to talk to");
});

test("asking for a new chat is answered while the machine is still building it, not held until it is done", async () => {
  const mac = await pair("mac", "mac-que-demora");
  const phone = await pair("phone", "iphone-que-pede");

  const heard = [];
  const stream = attachStream({
    open: () => new WebSocket(mac.client.streamUrl()),
    onEnvelope: (envelope) => heard.push(envelope)
  });
  try {
    for (let round = 0; round < 100 && !stream.up; round += 1) await wait(20);
    await mac.client.panel({ seats: [] });

    const began = Date.now();
    const asked = await phone.client.post("/api/spawn", { prompt: "cuide disso", repo: "arvore-hub", where: "cloud" });

    assert.equal(asked.status, 202, asked.error);
    assert.ok(
      Date.now() - began < 5000,
      "a worktree takes minutes to build, so holding the request buys no name and only makes the person watch a spinner"
    );

    for (let round = 0; round < 100 && !heard.some((e) => e.kind === "seat-born"); round += 1) await wait(20);
    const born = heard.find((e) => e.kind === "seat-born");
    assert.ok(born, "the machine was never actually asked to open the seat");
    await mac.client.post("/api/born", { id: born.body.id, born: "id-da-conversa", name: "assento-novo" });
  } finally {
    stream.stop();
  }
});
