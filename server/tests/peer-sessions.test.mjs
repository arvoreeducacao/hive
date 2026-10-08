import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { createBroker } from "../server.mjs";
import { createBrokerClient, attachStream } from "../client.mjs";
import { newIdentity } from "../identity.mjs";
import { seatSockPath } from "../engine/paths.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const junk = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "hive-ps-")); junk.push(d); return d; };

let theirs;
let mine;
let seat;

function fakeSeat(base, name) {
  for (const dir of ["events", "sock", "sessions"]) mkdirSync(join(base, dir), { recursive: true });
  writeFileSync(join(base, "sessions", `${name}.json`), JSON.stringify({ cwd: "/repo", title: "o assento do outro" }));
  const events = join(base, "events", `${name}.ndjson`);
  writeFileSync(events, "");
  let seq = 0;
  const heard = [];
  const listening = createServer((live) => {
    live.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        heard.push(JSON.parse(line));
        live.write(JSON.stringify({ ok: true }) + "\n");
      }
    });
  });
  return {
    heard,
    emit: (event) => { seq += 1; appendFileSync(events, JSON.stringify({ seq, ...event }) + "\n"); return seq; },
    up: () => new Promise((done) => listening.listen(seatSockPath(base, name), done)),
    down: () => new Promise((done) => listening.close(done))
  };
}

async function stand(name) {
  const home = scratch();
  const probe = createBroker({ home, name, launch: () => { throw new Error("no driver here"); } });
  await new Promise((d) => probe.http.listen(0, "127.0.0.1", d));
  const port = probe.http.address().port;
  probe.http.close();
  probe.sessions.stop();
  const url = `http://127.0.0.1:${port}`;
  const broker = createBroker({ home, name, publicUrl: url, launch: () => { throw new Error("no driver here"); } });
  await new Promise((d) => broker.http.listen(port, "127.0.0.1", d));
  return { home, url, broker };
}

async function paired(held, kind, name) {
  const code = held.broker.roster.open({ kind }).code;
  const me = newIdentity(name);
  const done = await fetch(`${held.url}/api/pair`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name })
  });
  assert.equal((await done.json()).paired, true);
  return { me, client: createBrokerClient({ url: held.url, identity: me, audience: held.broker.identity.fingerprint }) };
}

before(async () => {
  theirs = await stand("vini");
  mine = await stand("jonas");
  seat = fakeSeat(theirs.home, "assento-do-vini");
  await seat.up();

  const owner = await paired(theirs, "mac", "vini mac");
  const guest = await paired(mine, "mac", "jonas mac");
  const invite = await owner.client.post("/api/invites", {});
  const joined = await guest.client.post("/api/join", { link: invite.body.link });
  assert.equal(joined.ok, true, joined.error);

  const lent = await owner.client.post("/api/grants", {
    seat: "assento-do-vini",
    to: mine.broker.identity.fingerprint,
    forMs: 600000
  });
  assert.equal(lent.ok, true, `sem o teclado emprestado nada aqui passa: ${lent.error}`);
});

after(async () => {
  for (const one of [theirs, mine]) {
    one?.broker?.peers?.stop?.();
    one?.broker?.sessions?.stop();
    one?.broker?.http?.close();
  }
  await seat?.down();
  for (const d of junk) rmSync(d, { recursive: true, force: true });
});

test("listing a peer's seats needs no grant — only reaching into one does", async () => {
  const me = await paired(mine, "mac", "jonas listing");
  const there = theirs.broker.identity.fingerprint;
  const said = await me.client.get(`/api/peers/${encodeURIComponent(there)}/sessions`);
  assert.equal(said.ok, true, said.error);
  assert.ok((said.body.sessions || []).some((one) => one.name === "assento-do-vini"), JSON.stringify(said.body));
});

test("the history of a peer's seat comes through my server, not from me reaching over", async () => {
  const me = await paired(mine, "mac", "jonas reading");
  const there = theirs.broker.identity.fingerprint;
  seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "antes" }] } });

  const said = await me.client.get(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vini/events?from=0`);
  assert.equal(said.ok, true, said.error);
  assert.ok((said.body.events || []).some((e) => e.message?.content?.[0]?.text === "antes"), JSON.stringify(said.body).slice(0, 200));
});

test("my say reaches the driver of a seat that is not mine", async () => {
  const me = await paired(mine, "mac", "jonas typing");
  const there = theirs.broker.identity.fingerprint;
  const said = await me.client.post(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vini/say`, { text: "posso mexer?" });
  assert.equal(said.ok, true, said.error);
  assert.ok(seat.heard.some((one) => one.type === "say" && one.text === "posso mexer?"), JSON.stringify(seat.heard));
});

test("an event written on the peer is pushed all the way to my device", async () => {
  const me = await paired(mine, "mac", "jonas watching");
  const there = theirs.broker.identity.fingerprint;

  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(me.client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 100 && !stream.up; round += 1) await wait(20);
    assert.equal(stream.up, true, "my own stream did not open");

    const asked = await me.client.get(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vini`);
    assert.equal(asked.ok, true, asked.error);

    for (let round = 0; round < 100 && !mine.broker.peers.listening(there); round += 1) await wait(30);
    assert.equal(mine.broker.peers.listening(there), true, "my server never opened the stream to the peer");

    seat.emit({ type: "assistant", message: { content: [{ type: "text", text: "empurrado de longe" }] } });

    const pushed = (e) => e.kind === "event" && e.body?.peer && e.body?.event?.message?.content?.[0]?.text === "empurrado de longe";
    for (let round = 0; round < 200 && !heard.some(pushed); round += 1) await wait(30);
    const got = heard.find(pushed);
    assert.ok(got, `only ${JSON.stringify(heard.map((e) => e.body?.event?.message?.content?.[0]?.text || e.kind))} arrived`);
    assert.equal(got.body.peer, there);
    assert.equal(got.body.session, "assento-do-vini");
  } finally {
    stream.stop();
  }
});

test("a server we are not paired with is refused, not proxied", async () => {
  const me = await paired(mine, "mac", "jonas guessing");
  const stranger = newIdentity("de fora").fingerprint;
  const said = await me.client.get(`/api/peers/${encodeURIComponent(stranger)}/sessions`);
  assert.equal(said.status, 404);
  assert.match(said.error, /not paired/);
});

test("a seat name the peer route cannot address is refused before any call", async () => {
  const me = await paired(mine, "mac", "jonas poking");
  const there = theirs.broker.identity.fingerprint;
  const said = await me.client.get(`/api/peers/${encodeURIComponent(there)}/sessions/${encodeURIComponent("não vale")}`);
  assert.equal(said.status, 400);
});

test("forgetting the peer stops the relay", async () => {
  const held = await stand("efemero");
  try {
    const owner = await paired(held, "mac", "dono");
    const guest = await paired(mine, "mac", "jonas dropping");
    const invite = await owner.client.post("/api/invites", {});
    const joined = await guest.client.post("/api/join", { link: invite.body.link });
    assert.equal(joined.ok, true, joined.error);

    const there = held.broker.identity.fingerprint;
    assert.ok(mine.broker.peers.find(there));
    const gone = await guest.client.post("/api/peers/forget", { fingerprint: there });
    assert.equal(gone.ok, true, gone.error);
    assert.equal(mine.broker.peers.find(there), null);

    const after = await guest.client.get(`/api/peers/${encodeURIComponent(there)}/sessions`);
    assert.equal(after.status, 404);
  } finally {
    held.broker.peers.stop();
    held.broker.sessions.stop();
    held.broker.http.close();
  }
});
