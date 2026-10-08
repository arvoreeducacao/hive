import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { createBroker, devOfHost, guestMay } from "../server.mjs";
import { createRosterStore, fromAllowedSigners, publicView } from "../roster.mjs";
import { createBrokerClient } from "../client.mjs";
import { newIdentity } from "../identity.mjs";
import { seatSockPath } from "../engine/paths.mjs";

const junk = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "hive-convidado-")); junk.push(d); return d; };
const idle = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["pipe", "pipe", "pipe"] });

function fakeSeat(base, name) {
  for (const dir of ["events", "sock", "sessions"]) mkdirSync(join(base, dir), { recursive: true });
  writeFileSync(join(base, "sessions", `${name}.json`), JSON.stringify({ cwd: "/repo" }));
  writeFileSync(join(base, "events", `${name}.ndjson`), "");
  const listening = createServer((live) => {
    live.on("data", () => live.write(JSON.stringify({ ok: true }) + "\n"));
  });
  return {
    up: () => new Promise((d) => listening.listen(seatSockPath(base, name), d)),
    down: () => new Promise((d) => listening.close(d))
  };
}

let mine;
let guest;
let own;
let myMac;

async function stand(name) {
  const home = scratch();
  const probe = createBroker({ home, name, launch: idle });
  await new Promise((d) => probe.http.listen(0, "127.0.0.1", d));
  const port = probe.http.address().port;
  probe.http.close();
  probe.sessions.stop();
  const url = `http://127.0.0.1:${port}`;
  const broker = createBroker({ home, name, publicUrl: url, launch: idle });
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
  assert.equal((await done.json()).paired, true, "pairing did not take");
  return { me, client: createBrokerClient({ url: held.url, identity: me, audience: held.broker.identity.fingerprint }) };
}

const asServer = (from, to) => createBrokerClient({
  url: to.url, identity: from.broker.identity, audience: to.broker.identity.fingerprint
});

before(async () => {
  mine = await stand("jonas");
  guest = await stand("vini");
  own = await stand("jonas pod");
  myMac = await paired(mine, "mac", "jonas mac");

  const forGuest = await myMac.client.post("/api/invites", {});
  const guestMac = await paired(guest, "mac", "vini mac");
  assert.equal((await guestMac.client.post("/api/join", { link: forGuest.body.link, mine: true })).ok, true);

  const forOwn = await myMac.client.post("/api/invites", { mine: true });
  const ownMac = await paired(own, "mac", "jonas pod mac");
  assert.equal((await ownMac.client.post("/api/join", { link: forOwn.body.link, mine: true })).ok, true);
});

after(async () => {
  for (const one of [mine, guest, own]) {
    one?.broker?.peers?.stop?.();
    one?.broker?.sessions?.stop();
    one?.broker?.http?.close();
  }
  for (const d of junk) rmSync(d, { recursive: true, force: true });
});

const ADMIN = [
  ["GET", "/api/devices", null],
  ["GET", "/api/peers", null],
  ["GET", "/api/invites", null],
  ["GET", "/api/grants", null],
  ["POST", "/api/sessions", { name: "assento-de-fora", cwd: "/tmp" }],
  ["POST", "/api/pair/open", { kind: "phone" }],
  ["POST", "/api/invites", {}],
  ["POST", "/api/devices/revoke", { fingerprint: "SHA256:whatever" }],
  ["POST", "/api/peers/forget", { fingerprint: "SHA256:whatever" }],
  ["POST", "/api/grants", { seat: "algum", to: "SHA256:whatever" }]
];

test("a server that came in by invite is refused on every administrative door", async () => {
  const them = asServer(guest, mine);
  for (const [method, path, payload] of ADMIN) {
    const said = method === "GET" ? await them.get(path) : await them.post(path, payload);
    assert.equal(said.ok, false, `${method} ${path} let a guest through`);
    assert.equal(said.status, 403, `${method} ${path} answered ${said.status}`);
  }
});

test("another machine of mine, invited as mine, keeps the run of the house", async () => {
  const me = asServer(own, mine);
  for (const [method, path, payload] of ADMIN) {
    const said = method === "GET" ? await me.get(path) : await me.post(path, payload);
    assert.notEqual(said.status, 403, `${method} ${path} shut the door on my own machine`);
  }
});

test("a guest cannot promote itself: claiming to be mine changes only its own books", async () => {
  const shown = await myMac.client.get("/api/devices");
  const asWritten = shown.body.devices.find((one) => one.fingerprint === guest.broker.identity.fingerprint);
  assert.ok(asWritten, "the guest is not on my roster at all");
  assert.equal(asWritten.kind, "peer", "the guest talked its way into being one of my machines");

  const asMine = shown.body.devices.find((one) => one.fingerprint === own.broker.identity.fingerprint);
  assert.equal(asMine.kind, "mac", "my own machine was filed as a guest");
});

test("what a guest is for still works: panel, message and its own name", async () => {
  const them = asServer(guest, mine);
  assert.equal((await them.get("/api/me")).ok, true, "a guest cannot even read its own name");
  assert.equal((await them.get("/api/board")).ok, true, "a guest cannot see the board");
  assert.equal((await them.post("/api/peer-panel", { panel: { sessions: [] } })).ok, true, "a guest cannot push its panel");
  const said = await them.post("/api/peer-say", { kind: "knock", note: { seat: "algum" } });
  assert.notEqual(said.status, 403, "a guest cannot knock");
});

test("a seat opens to a guest only while the keyboard is lent, and shuts when it is taken back", async () => {
  const seat = fakeSeat(mine.home, "assento-emprestado");
  await seat.up();
  const them = asServer(guest, mine);
  try {
    assert.equal((await myMac.client.get("/api/sessions/assento-emprestado")).ok, true, "the bench never made the seat real");
    assert.equal((await them.get("/api/sessions/assento-emprestado")).status, 403, "the seat was open before any lending");

    const lent = await myMac.client.post("/api/grants", { seat: "assento-emprestado", to: guest.broker.identity.fingerprint });
    assert.equal(lent.ok, true, lent.error);
    assert.equal((await them.get("/api/sessions/assento-emprestado")).ok, true, "the lending did not open the seat");

    const back = await myMac.client.post("/api/grants/take", { seat: "assento-emprestado" });
    assert.equal(back.ok, true, back.error);
    assert.equal((await them.get("/api/sessions/assento-emprestado")).status, 403, "the seat stayed open after the keyboard came back");
  } finally {
    await seat.down();
  }
});

test("the guest door is a list of what opens, not a list of what is shut", () => {
  assert.equal(guestMay("GET", "/api/me"), true);
  assert.equal(guestMay("POST", "/api/me"), false);
  assert.equal(guestMay("GET", "/api/sessions/algum"), true);
  assert.equal(guestMay("POST", "/api/sessions/algum/say"), true);
  assert.equal(guestMay("GET", "/api/sessions"), true, "the fleet card list is what being a peer is for");
  assert.equal(guestMay("POST", "/api/sessions"), false, "listing seats is not opening one");
  assert.equal(guestMay("GET", "/api/anything-invented-tomorrow"), false);
});

test("a guest reads the seat list, which is the fleet card, and never opens a seat with it", async () => {
  const them = asServer(guest, mine);
  assert.equal((await them.get("/api/sessions")).ok, true, "the list a peer is meant to see is shut");
  assert.equal((await them.post("/api/sessions", { name: "assento-de-fora", cwd: "/tmp" })).status, 403);
});

test("the trust file says whose key it is, in either order, and files it on the right side", () => {
  const key = newIdentity("desktop").publicSsh;

  const asWritten = fromAllowedSigners(`jonas ${key}`, { owners: ["jonas"] });
  assert.equal(asWritten[0].kind, "mac", "the owner's own machine was filed as a guest");
  assert.equal(asWritten[0].name, "jonas");

  const byComment = fromAllowedSigners(key, { owners: ["desktop"] });
  assert.equal(byComment[0].kind, "mac", "a key whose comment names the owner was filed as a guest");
  assert.equal(byComment[0].name, "desktop", "the name sat after the key and was thrown away");

  const guest = fromAllowedSigners(`vini ${key}`, { owners: ["jonas"] });
  assert.equal(guest[0].kind, "peer", "someone else's key was filed as a machine of mine");

  const nameless = fromAllowedSigners(newIdentity("").publicSsh, { owners: ["jonas"] });
  assert.equal(nameless[0].kind, "peer", "a key with no name at all cannot be assumed to be mine");
  assert.match(nameless[0].name, /^[A-Za-z0-9+/]/, "a nameless key should show its key, not the word peer");

  const noOwner = fromAllowedSigners(`jonas ${key}`, {});
  assert.equal(noOwner[0].kind, "peer", "with no owner to compare against, nothing is promoted");
});

test("a key already on the roster changes side when the trust file is corrected", () => {
  const key = newIdentity("desktop").publicSsh;
  const fingerprint = fromAllowedSigners(key, {})[0].fingerprint;
  let text = "";
  const store = createRosterStore({ read: () => text, write: (next) => { text = next; }, now: () => 1000 });

  store.adopt(fromAllowedSigners(key, { owners: ["jonas"] }));
  assert.equal(publicView(store.all)[0].kind, "peer");

  store.adopt(fromAllowedSigners(`jonas ${key}`, { owners: ["jonas"] }));
  assert.equal(publicView(store.all)[0].kind, "peer", "adopt alone should not move a key that is already there");

  assert.equal(store.keepKind(fingerprint, "mac").kept, true);
  assert.equal(publicView(store.all)[0].kind, "mac", "the boot never corrected the stale side");
});

test("the pod knows whose it is from its own hostname, so a bad stamp cannot lock the owner out", () => {
  assert.equal(devOfHost("ws-jonas-0"), "jonas");
  assert.equal(devOfHost("ws-jorge-0"), "jorge");
  assert.equal(devOfHost("WS-JONAS-0"), "jonas");
  assert.equal(devOfHost("ws-jonas"), "", "a name with no ordinal is not a pod hostname");
  assert.equal(devOfHost("mac-mini.local"), "");
  assert.equal(devOfHost(""), "");

  const key = newIdentity("desktop").publicSsh;
  const stamped = fromAllowedSigners(`jonas ${key}`, { owners: ["x", devOfHost("ws-jonas-0")] });
  assert.equal(stamped[0].kind, "mac", "a wrong stamp beat the pod's own hostname and locked the owner out");
});

test("the trust file also fixes a stale name, not only a stale side", () => {
  const key = newIdentity("desktop").publicSsh;
  const read = fromAllowedSigners(`jonas ${key}`, { owners: ["jonas"] })[0];
  let text = "";
  const store = createRosterStore({ read: () => text, write: (next) => { text = next; }, now: () => 1000 });

  store.adopt([{ ...read, name: "peer", kind: "peer" }]);
  assert.equal(publicView(store.all)[0].name, "peer");

  store.keepName(read.fingerprint, read.name);
  assert.equal(publicView(store.all)[0].name, "jonas", "the stale name survived the correction");

  assert.equal(store.keepName(read.fingerprint, "").kept, true);
  assert.equal(publicView(store.all)[0].name, "jonas", "an empty name should not erase a good one");
});
