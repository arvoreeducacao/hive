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
const junk = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "hive-note-")); junk.push(d); return d; };

let theirs;
let mine;

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
  const owner = await paired(theirs, "mac", "vini mac");
  const guest = await paired(mine, "mac", "jonas mac");
  const invite = await owner.client.post("/api/invites", {});
  const joined = await guest.client.post("/api/join", { link: invite.body.link });
  assert.equal(joined.ok, true, joined.error);
});

after(async () => {
  for (const one of [theirs, mine]) {
    one?.broker?.peers?.stop?.();
    one?.broker?.sessions?.stop();
    one?.broker?.http?.close();
  }
  for (const d of junk) rmSync(d, { recursive: true, force: true });
});

test("a note addressed by the person's name lands on the mac of that person", async () => {
  const sender = await paired(mine, "mac", "jonas asking");
  const listener = await paired(theirs, "mac", "vini listening");

  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(listener.client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 200 && !stream.up; round += 1) await wait(20);
    assert.equal(stream.up, true, "the listener never opened its stream");

    const sent = await sender.client.post("/api/peer-note", {
      dev: "vini",
      kind: "ask",
      note: { from: "jonas", text: "o deploy pode ir?" }
    });
    assert.equal(sent.ok, true, sent.error);
    assert.equal(sent.body.to, theirs.broker.identity.fingerprint);

    for (let round = 0; round < 200 && !heard.some((e) => e.kind === "ask"); round += 1) await wait(20);
    const got = heard.find((e) => e.kind === "ask");
    assert.ok(got, `only ${JSON.stringify(heard.map((e) => e.kind))} arrived`);
    assert.equal(got.body.text, "o deploy pode ir?");
    assert.equal(got.from, mine.broker.identity.fingerprint);
  } finally {
    stream.stop();
  }
});

test("a note for a person we are not paired with is refused, and one with no kind too", async () => {
  const sender = await paired(mine, "mac", "jonas guessing");
  const nobody = await sender.client.post("/api/peer-note", { dev: "ninguem", kind: "ask", note: {} });
  assert.equal(nobody.status, 404);
  assert.match(nobody.error, /not paired/);

  const bare = await sender.client.post("/api/peer-note", { dev: "vini", note: {} });
  assert.equal(bare.status, 400);
  assert.match(bare.error, /needs a kind/);
});

test("a note waits in the mailbox when nobody is listening, and lands on arrival", async () => {
  const sender = await paired(mine, "mac", "jonas early");
  const later = await paired(theirs, "mac", "vini away");

  const sent = await sender.client.post("/api/peer-note", { dev: "vini", kind: "poke", note: { from: "jonas" } });
  assert.equal(sent.ok, true, sent.error);

  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(later.client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 200 && !heard.some((e) => e.kind === "poke"); round += 1) await wait(20);
    assert.ok(heard.some((e) => e.kind === "poke"), `only ${JSON.stringify(heard.map((e) => e.kind))} arrived`);
  } finally {
    stream.stop();
  }
});

test("only a paired server may push a note in, never a device pretending to be one", async () => {
  const phone = await paired(theirs, "phone", "iphone do vini");
  const said = await phone.client.post("/api/peer-say", { kind: "ask", body: { text: "me deixa entrar" } });
  assert.equal(said.status, 403);
  assert.match(said.error, /only a paired server/);
});
