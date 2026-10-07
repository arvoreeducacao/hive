import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBroker } from "../server.mjs";
import { createBrokerClient } from "../client.mjs";
import { newIdentity } from "../identity.mjs";
import { createGrants, grantFor, grantOf, liveGrants, withGrant, withoutGrant, GRANT_MS } from "../grants.mjs";
import { seatSockPath } from "../engine/paths.mjs";

const junk = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "hive-gr-")); junk.push(d); return d; };

test("a grant is for one seat and one key, and it expires", () => {
  const grant = grantOf({ seat: "meu-assento", to: "SHA256:x", now: 1000, forMs: 500 });
  assert.equal(grant.until, 1500);
  assert.equal(liveGrants([grant], 1400).length, 1);
  assert.equal(liveGrants([grant], 1600).length, 0);
  assert.ok(grantFor([grant], "meu-assento", "SHA256:x", 1200));
  assert.equal(grantFor([grant], "outro", "SHA256:x", 1200), null);
  assert.equal(grantFor([grant], "meu-assento", "SHA256:y", 1200), null);
});

test("lending the same seat to the same key twice replaces instead of piling up", () => {
  const first = grantOf({ seat: "um", to: "SHA256:a", now: 1000 });
  const second = grantOf({ seat: "um", to: "SHA256:a", now: 2000 });
  const held = withGrant(withGrant([], first, 1000), second, 2000);
  assert.equal(held.length, 1);
  assert.equal(held[0].at, 2000);
});

test("taking a seat back drops every key when no key is named", () => {
  const held = [
    grantOf({ seat: "um", to: "SHA256:a", now: 1000 }),
    grantOf({ seat: "um", to: "SHA256:b", now: 1000 }),
    grantOf({ seat: "dois", to: "SHA256:a", now: 1000 })
  ];
  assert.equal(withoutGrant(held, "um", "", 1100).length, 1);
  assert.equal(withoutGrant(held, "um", "SHA256:a", 1100).length, 2);
});

test("a grant survives a restart because it is written down", () => {
  const home = scratch();
  const file = join(home, "grants.json");
  let text = "";
  const make = () => createGrants({ read: () => text, write: (next) => { text = next; }, now: () => 1000 });
  const first = make();
  first.lend("um", "SHA256:a");
  assert.equal(make().allows("um", "SHA256:a"), true);
  assert.equal(make().allows("um", "SHA256:b"), false);
  rmSync(file, { force: true });
});

let owner;
let guest;
let seat;

function fakeSeat(base, name) {
  for (const dir of ["events", "sock", "sessions"]) mkdirSync(join(base, dir), { recursive: true });
  writeFileSync(join(base, "sessions", `${name}.json`), JSON.stringify({ cwd: "/repo" }));
  writeFileSync(join(base, "events", `${name}.ndjson`), "");
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
    emit: (event) => { seq += 1; appendFileSync(join(base, "events", `${name}.ndjson`), JSON.stringify({ seq, ...event }) + "\n"); },
    up: () => new Promise((d) => listening.listen(seatSockPath(base, name), d)),
    down: () => new Promise((d) => listening.close(d))
  };
}

async function stand(name) {
  const home = scratch();
  const probe = createBroker({ home, name, launch: () => { throw new Error("no driver"); } });
  await new Promise((d) => probe.http.listen(0, "127.0.0.1", d));
  const port = probe.http.address().port;
  probe.http.close();
  probe.sessions.stop();
  const url = `http://127.0.0.1:${port}`;
  const broker = createBroker({ home, name, publicUrl: url, launch: () => { throw new Error("no driver") } });
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
  owner = await stand("vitor");
  guest = await stand("joao");
  seat = fakeSeat(owner.home, "assento-do-vitor");
  await seat.up();
  const theirs = await paired(owner, "mac", "vitor mac");
  const mine = await paired(guest, "mac", "joao mac");
  const invite = await theirs.client.post("/api/invites", {});
  const joined = await mine.client.post("/api/join", { link: invite.body.link });
  assert.equal(joined.ok, true, joined.error);
});

after(async () => {
  for (const one of [owner, guest]) {
    one?.broker?.peers?.stop?.();
    one?.broker?.sessions?.stop();
    one?.broker?.http?.close();
  }
  await seat?.down();
  for (const d of junk) rmSync(d, { recursive: true, force: true });
});

test("being paired is not permission to type in someone's seat", async () => {
  const mine = await paired(guest, "mac", "joao trying");
  const there = owner.broker.identity.fingerprint;
  const said = await mine.client.post(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vitor/say`, { text: "posso?" });
  assert.equal(said.status, 403, JSON.stringify(said));
  assert.match(said.error, /not lent to you/);
  assert.ok(!seat.heard.some((one) => one.text === "posso?"), "o say passou sem empréstimo");
});

test("with the keyboard lent, the same say goes through", async () => {
  const theirs = await paired(owner, "mac", "vitor lending");
  const mine = await paired(guest, "mac", "joao typing");
  const there = owner.broker.identity.fingerprint;
  const meThere = guest.broker.identity.fingerprint;

  const lent = await theirs.client.post("/api/grants", { seat: "assento-do-vitor", to: meThere });
  assert.equal(lent.ok, true, lent.error);

  const said = await mine.client.post(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vitor/say`, { text: "obrigado" });
  assert.equal(said.ok, true, said.error);
  assert.ok(seat.heard.some((one) => one.type === "say" && one.text === "obrigado"));
});

test("taking the keyboard back closes the door again", async () => {
  const theirs = await paired(owner, "mac", "vitor taking back");
  const mine = await paired(guest, "mac", "joao losing it");
  const there = owner.broker.identity.fingerprint;
  const meThere = guest.broker.identity.fingerprint;

  await theirs.client.post("/api/grants", { seat: "assento-do-vitor", to: meThere });
  const took = await theirs.client.post("/api/grants/take", { seat: "assento-do-vitor" });
  assert.equal(took.ok, true, took.error);

  const after = await mine.client.post(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vitor/say`, { text: "e agora" });
  assert.equal(after.status, 403);
});

test("a peer cannot lend itself a keyboard on someone else's server", async () => {
  const asPeer = createBrokerClient({
    url: owner.url,
    identity: guest.broker.identity,
    audience: owner.broker.identity.fingerprint
  });
  const tried = await asPeer.post("/api/grants", { seat: "assento-do-vitor", to: guest.broker.identity.fingerprint });
  assert.equal(tried.status, 403, JSON.stringify(tried));
  assert.match(tried.error, /does not lend keyboards|only while its keyboard is lent/);
});

test("a peer cannot take a keyboard back either", async () => {
  const asPeer = createBrokerClient({
    url: owner.url,
    identity: guest.broker.identity,
    audience: owner.broker.identity.fingerprint
  });
  const tried = await asPeer.post("/api/grants/take", { seat: "assento-do-vitor" });
  assert.equal(tried.status, 403);
});

test("the owner's own devices never need a grant", async () => {
  const theirs = await paired(owner, "mac", "vitor himself");
  const said = await theirs.client.post("/api/sessions/assento-do-vitor/say", { text: "é meu" });
  assert.equal(said.ok, true, said.error);
  assert.ok(seat.heard.some((one) => one.text === "é meu"));
});

test("lending to a key nobody knows is refused", async () => {
  const theirs = await paired(owner, "mac", "vitor careless");
  const said = await theirs.client.post("/api/grants", { seat: "assento-do-vitor", to: newIdentity("ninguém").fingerprint });
  assert.equal(said.status, 404);
  assert.match(said.error, /nobody we know/);
});

test("the grant list shows what is lent, and only what is still alive", async () => {
  const theirs = await paired(owner, "mac", "vitor listing");
  const meThere = guest.broker.identity.fingerprint;
  await theirs.client.post("/api/grants", { seat: "assento-do-vitor", to: meThere, forMs: 60000 });
  const said = await theirs.client.get("/api/grants");
  assert.equal(said.ok, true, said.error);
  assert.equal(said.body.forMs, GRANT_MS);
  assert.ok(said.body.grants.some((one) => one.seat === "assento-do-vitor" && one.to === meThere));
});

test("a lent keyboard types but does not administer", async () => {
  const theirs = await paired(owner, "mac", "vitor lending admin");
  const mine = await paired(guest, "mac", "joao poking admin");
  const there = owner.broker.identity.fingerprint;
  await theirs.client.post("/api/grants", { seat: "assento-do-vitor", to: guest.broker.identity.fingerprint });

  const typed = await mine.client.post(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vitor/command`, { type: "say", text: "digitando" });
  assert.equal(typed.ok, true, typed.error);

  const administered = await mine.client.post(`/api/peers/${encodeURIComponent(there)}/sessions/assento-do-vitor/command`, { type: "control", op: "context" });
  assert.equal(administered.status, 403, JSON.stringify(administered));
  assert.match(administered.error, /does not "control"/);
});

test("the owner's own device may administer its own seat", async () => {
  const theirs = await paired(owner, "mac", "vitor administering");
  const said = await theirs.client.post("/api/sessions/assento-do-vitor/command", { type: "control", op: "context" });
  assert.equal(said.ok, true, said.error);
  assert.ok(seat.heard.some((one) => one.type === "control"));
});
