import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBroker } from "../server.mjs";
import { createBrokerClient } from "../client.mjs";
import { newIdentity } from "../identity.mjs";
import { readLink } from "../invites.mjs";

const junk = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), "hive-portaria-")); junk.push(d); return d; };

let mine;
let theirs;
let mac;
let phone;

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
  assert.equal((await done.json()).paired, true, "pairing did not take");
  return { me, client: createBrokerClient({ url: held.url, identity: me, audience: held.broker.identity.fingerprint }) };
}

before(async () => {
  mine = await stand("jonas");
  theirs = await stand("vini");
  mac = await paired(mine, "mac", "jonas mac");
  phone = await paired(mine, "mac", "outro mac do jonas");
});

after(async () => {
  for (const one of [mine, theirs]) {
    one?.broker?.peers?.stop?.();
    one?.broker?.sessions?.stop();
    one?.broker?.http?.close();
  }
  for (const d of junk) rmSync(d, { recursive: true, force: true });
});

test("an open invite is listable, and the link it hands back is the one that was minted", async () => {
  const made = await mac.client.post("/api/invites", {});
  assert.equal(made.ok, true, made.error);
  const listed = await mac.client.get("/api/invites");
  assert.equal(listed.ok, true, listed.error);
  assert.equal(listed.body.invites.length, 1);
  const read = readLink(listed.body.invites[0].link);
  assert.equal(read.error, undefined);
  assert.equal(read.fingerprint, mine.broker.identity.fingerprint);
  assert.equal(listed.body.invites[0].link, made.body.link);
});

test("cancelling an invite takes it off the list and nobody can spend it after that", async () => {
  const made = await mac.client.post("/api/invites", {});
  const link = made.body.link;
  const gone = await mac.client.post("/api/invites/cancel", { link });
  assert.equal(gone.ok, true, gone.error);
  const listed = await mac.client.get("/api/invites");
  assert.equal(listed.body.invites.some((one) => one.link === link), false, "the cancelled invite is still listed");

  const guest = await paired(theirs, "mac", "vini mac");
  const tried = await guest.client.post("/api/join", { link });
  assert.equal(tried.ok, false, "a cancelled invite still let someone in");
});

test("cancelling something that was never minted is a 404, not a silent yes", async () => {
  const said = await mac.client.post("/api/invites/cancel", { token: "nope" });
  assert.equal(said.ok, false);
  assert.equal(said.status, 404);
});

test("an invite that is spent moves from open to used, carrying who used it", async () => {
  const before = await mac.client.get("/api/invites");
  const made = await mac.client.post("/api/invites", {});
  const guest = await paired(theirs, "mac", "vini mac 2");
  const joined = await guest.client.post("/api/join", { link: made.body.link });
  assert.equal(joined.ok, true, joined.error);

  const after = await mac.client.get("/api/invites");
  assert.equal(after.body.invites.some((one) => one.link === made.body.link), false, "a spent invite is still open");
  assert.equal(after.body.used.length, before.body.used.length + 1);
  assert.equal(after.body.used.at(-1).by, "vini");
});
