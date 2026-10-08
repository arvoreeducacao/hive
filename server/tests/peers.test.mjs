import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { createBroker } from "../server.mjs";
import { createBrokerClient, attachStream } from "../client.mjs";
import { newIdentity } from "../identity.mjs";
import { linkOf, readLink, mintToken, openInvite, redeemInvite, peerOf, sameToken } from "../invites.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const homes = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "hive-peer-")); homes.push(d); return d; };

let mine;
let theirs;
let mineUrl;
let theirsUrl;

async function stand(name) {
  const home = scratch();
  const held = { home, seat: null };
  held.seat = createBroker({ home, name, publicUrl: "", launch: () => { throw new Error("no driver in this test"); } });
  await new Promise((done) => held.seat.http.listen(0, "127.0.0.1", done));
  held.url = `http://127.0.0.1:${held.seat.http.address().port}`;
  held.seat.http.close();
  held.broker = createBroker({ home, name, publicUrl: held.url, launch: () => { throw new Error("no driver in this test"); } });
  await new Promise((done) => held.broker.http.listen(Number(new URL(held.url).port), "127.0.0.1", done));
  return held;
}

before(async () => {
  mine = await stand("jonas");
  theirs = await stand("vini");
  mineUrl = mine.url;
  theirsUrl = theirs.url;
});

after(() => {
  for (const one of [mine, theirs]) { one?.broker?.sessions?.stop(); one?.broker?.http?.close(); }
  for (const d of homes) rmSync(d, { recursive: true, force: true });
});

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

test("a link carries the address, the key and a one-shot token, and reads back", () => {
  const token = mintToken();
  const link = linkOf({ url: "https://srv.example.com", fingerprint: "SHA256:" + "a".repeat(43), token });
  assert.match(link, /^hive:\/\/join\?/, "the invite has to be a link the hive itself opens");
  const read = readLink(link);
  assert.equal(read.url, "https://srv.example.com");
  assert.equal(read.token, token);
  assert.match(read.fingerprint, /^SHA256:/);

  assert.match(readLink("not a link").error, /not a link/);
  assert.match(readLink("https://x/other?key=a&token=b").error, /does not point at a join/);
  assert.match(readLink("https://x/join?token=b").error, /no readable key/);
  assert.match(readLink(`https://x/join?key=SHA256:${"a".repeat(43)}`).error, /no token/);
});

test("an invite already in the wild, in the old address shape, still opens", () => {
  const token = mintToken();
  const key = "SHA256:" + "a".repeat(43);
  const read = readLink(`https://srv.example.com/join?key=${encodeURIComponent(key)}&token=${token}`);
  assert.equal(read.url, "https://srv.example.com");
  assert.equal(read.token, token);
  assert.equal(read.fingerprint, key);
});

test("a deep link with no server to knock at is refused", () => {
  const key = "SHA256:" + "a".repeat(43);
  assert.match(readLink(`hive://join?key=${encodeURIComponent(key)}&token=t`).error, /no server to knock at/);
  assert.match(readLink(`hive://join?at=not-a-url&key=${encodeURIComponent(key)}&token=t`).error, /no server to knock at/);
  assert.match(readLink(`hive://join?at=file%3A%2F%2F%2Fetc%2Fpasswd&key=${encodeURIComponent(key)}&token=t`).error, /no server to knock at/);
  assert.match(readLink(`hive://shelf/a-page?key=${encodeURIComponent(key)}&token=t`).error, /does not point at a join/);
});

test("an invite burns on first use and cannot be replayed", () => {
  const opened = openInvite([], { url: "https://x", fingerprint: "SHA256:" + "a".repeat(43), now: 1000 });
  const first = redeemInvite(opened.invites, { token: opened.invite.token, now: 1001, by: "vini" });
  assert.ok(!first.error);
  const again = redeemInvite(first.invites, { token: opened.invite.token, now: 1002 });
  assert.match(again.error, /already used/);
});

test("an expired invite is refused, and so is a token nobody minted", () => {
  const opened = openInvite([], { url: "https://x", fingerprint: "SHA256:" + "a".repeat(43), now: 1000, ttlMs: 10 });
  assert.match(redeemInvite(opened.invites, { token: opened.invite.token, now: 5000 }).error, /expired/);
  assert.match(redeemInvite(opened.invites, { token: "nunca-existiu", now: 1001 }).error, /no invite by that token/);
});

test("token comparison does not leak on length or content", () => {
  const token = mintToken();
  assert.equal(sameToken(token, token), true);
  assert.equal(sameToken(token, token.slice(0, -1)), false);
  assert.equal(sameToken("", ""), false);
});

test("a peer needs a readable address and a real key", () => {
  assert.match(peerOf({ url: "não é url", publicSsh: newIdentity().publicSsh }).error, /no address/);
  assert.match(peerOf({ url: "https://x", publicSsh: "ssh-rsa AAAA" }).error, /ed25519/);
  const made = peerOf({ url: "https://x/", publicSsh: newIdentity("vini").publicSsh, name: "vini" });
  assert.equal(made.peer.url, "https://x");
  assert.match(made.peer.fingerprint, /^SHA256:/);
});

test("one link makes both servers know each other, mutually", async () => {
  const owner = await paired(theirs, "mac", "vini's mac");
  const invited = await paired(mine, "mac", "jonas's mac");

  const opened = await owner.client.post("/api/invites", {});
  assert.equal(opened.ok, true, opened.error);
  assert.match(opened.body.link, /^hive:\/\/join\?at=/);

  const joined = await invited.client.post("/api/join", { link: opened.body.link });
  assert.equal(joined.ok, true, joined.error);
  assert.equal(joined.body.peer.fingerprint, theirs.broker.identity.fingerprint);

  assert.ok(mine.broker.peers.find(theirs.broker.identity.fingerprint), "mine does not know theirs");
  assert.ok(theirs.broker.peers.find(mine.broker.identity.fingerprint), "theirs does not know mine");
});

test("a used link cannot bring a second server in", async () => {
  const owner = await paired(theirs, "mac", "vini again");
  const opened = await owner.client.post("/api/invites", {});
  const stranger = await stand("intruso");
  const theirClient = await paired(stranger, "mac", "stranger's mac");

  const first = await theirClient.client.post("/api/join", { link: opened.body.link });
  assert.equal(first.ok, true, first.error);
  const second = await theirClient.client.post("/api/join", { link: opened.body.link });
  assert.equal(second.ok, false);
  assert.match(second.error, /already used/);

  stranger.broker.sessions.stop();
  stranger.broker.http.close();
});

test("the panel a peer pushes lands on the board, marked as a peer's", async () => {
  const theirMac = await paired(theirs, "mac", "vini publishing");
  const myMac = await paired(mine, "mac", "jonas reading");

  const put = await theirMac.client.panel({ seats: [{ name: "assento-do-vini", state: "working" }] });
  assert.equal(put.ok, true, put.error);

  for (let round = 0; round < 60; round += 1) {
    const board = await myMac.client.board();
    const row = (board.body?.board || []).find((one) => one.peer);
    if (row) {
      assert.equal(row.fingerprint, theirs.broker.identity.fingerprint);
      assert.equal(row.panel.seats[0].name, "assento-do-vini");
      assert.equal(row.stale, false);
      return;
    }
    await wait(50);
  }
  assert.fail("the peer's panel never reached the board");
});

test("reading the board never asks the peer — it answers from what already arrived", async () => {
  const myMac = await paired(mine, "mac", "jonas counting");
  const before = theirs.broker.hub.delivered;
  for (let round = 0; round < 5; round += 1) {
    const board = await myMac.client.board();
    assert.equal(board.ok, true, board.error);
  }
  assert.equal(theirs.broker.hub.delivered, before, "reading the board touched the other server");
});

test("a message to a peer's key crosses to the other server and lands on their mac", async () => {
  const theirMac = await paired(theirs, "mac", "vini writing");
  const myMac = await paired(mine, "mac", "jonas writing");
  assert.ok(mine.broker.peers.find(theirs.broker.identity.fingerprint), "the two servers are not paired, so this proves nothing");

  const heard = [];
  const stream = attachStream({ open: () => new WebSocket(theirMac.client.streamUrl()), onEnvelope: (e) => heard.push(e) });
  try {
    for (let round = 0; round < 80 && !stream.up; round += 1) await wait(20);
    assert.equal(stream.up, true);

    const sent = await myMac.client.say(theirs.broker.identity.fingerprint, { text: "atravessou" }, "knock");
    assert.equal(sent.ok, true, sent.error);

    for (let round = 0; round < 100 && !heard.some((e) => e.kind === "knock"); round += 1) await wait(20);
    const took = heard.find((e) => e.kind === "knock");
    assert.ok(took, `nothing with that kind reached the other side — only ${heard.map((e) => e.kind).join(", ") || "silence"}`);
    assert.equal(took.body?.text, "atravessou");
  } finally {
    stream.stop();
  }
});

test("a peer's key is answered by the peer road, never by the local mailbox it also sits in", async () => {
  const target = theirs.broker.identity.fingerprint;
  assert.ok(mine.broker.roster.find(target), "the peer stopped being on the roster, and this guard is about that overlap");
  const myMac = await paired(mine, "mac", "jonas routing");

  const before = mine.broker.hub.waiting(target);
  const sent = await myMac.client.say(target, { text: "nao fica em casa" }, "knock");
  assert.equal(sent.ok, true, sent.error);
  assert.equal(mine.broker.hub.waiting(target), before, "the envelope was parked in a mailbox on my own server instead of crossing");
});

test("only a paired server may push a peer panel", async () => {
  const notAPeer = await paired(mine, "mac", "just a mac");
  const tried = await notAPeer.client.post("/api/peer-panel", { panel: { seats: [] } });
  assert.equal(tried.status, 403);
  assert.match(tried.error, /only a paired server/);
});

test("forgetting a peer drops it and its panel", async () => {
  const myMac = await paired(mine, "mac", "jonas forgetting");
  const target = theirs.broker.identity.fingerprint;
  if (!mine.broker.peers.find(target)) return;

  const gone = await myMac.client.post("/api/peers/forget", { fingerprint: target });
  assert.equal(gone.ok, true, gone.error);
  assert.equal(mine.broker.peers.find(target), null);

  const board = await myMac.client.board();
  assert.ok(!(board.body?.board || []).some((one) => one.fingerprint === target && one.peer));
});
