import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBroker, refusalLine } from "../server.mjs";
import { signedHeaders } from "../client.mjs";
import { newIdentity } from "../identity.mjs";

let home;
let broker;
let url;
const said = [];

before(async () => {
  home = mkdtempSync(join(tmpdir(), "hive-refusal-log-"));
  broker = createBroker({ home, log: (line) => said.push(line) });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${broker.http.address().port}`;
});

after(() => {
  broker.http.close();
  rmSync(home, { recursive: true, force: true });
});

async function pair(kind, name) {
  const code = broker.roster.open({ kind }).code;
  const me = newIdentity(name);
  const done = await fetch(`${url}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name })
  });
  assert.equal((await done.json()).paired, true);
  return me;
}

const signedBy = (me, path) =>
  signedHeaders({ secret: me.secret, fingerprint: me.fingerprint, audience: broker.identity.fingerprint, method: "GET", path, body: "" });

test("a paired device the guard turns away leaves one line saying who, where and why", async () => {
  const me = await pair("mac", "outro mac do jonas");
  const headers = signedBy(me, "/api/me");
  assert.equal((await fetch(`${url}/api/me`, { headers })).status, 200);
  assert.equal(said.filter((one) => one.startsWith("server: refused")).length, 0, "an accepted request is not logged as refused");

  const again = await fetch(`${url}/api/me`, { headers });
  assert.equal(again.status, 401);
  assert.ok(said.includes("server: refused mac outro mac do jonas on GET /api/me — that request was already used once"), said.join("\n"));
});

test("a key nobody paired is named by its fingerprint, and a bare request by its absence", async () => {
  const stranger = newIdentity("stranger");
  assert.equal((await fetch(`${url}/api/me`, { headers: signedBy(stranger, "/api/me") })).status, 401);
  assert.ok(said.includes(`server: refused unknown key ${stranger.fingerprint} on GET /api/me — that key is not on the roster`), said.join("\n"));

  assert.equal((await fetch(`${url}/api/hive`)).status, 401);
  assert.ok(said.some((one) => one.startsWith("server: refused an unsigned request on GET /api/hive — ")), said.join("\n"));
});

test("the line reads the same for every reason the guard has", () => {
  assert.equal(
    refusalLine({ method: "get", path: "/api/hive", who: "phone iphone", error: "that request is 95s off the clock" }),
    "server: refused phone iphone on GET /api/hive — that request is 95s off the clock"
  );
});
