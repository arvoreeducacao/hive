import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { createBroker, refusalHead } from "../server.mjs";
import { signedQuery } from "../client.mjs";
import { newIdentity } from "../identity.mjs";

let home;
let broker;
let url;

before(async () => {
  home = mkdtempSync(join(tmpdir(), "hive-refusal-"));
  broker = createBroker({ home });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `127.0.0.1:${broker.http.address().port}`;
});

after(() => {
  broker.http.close();
  rmSync(home, { recursive: true, force: true });
});

function dialStream(identity) {
  const query = signedQuery({ secret: identity.secret, fingerprint: identity.fingerprint, audience: broker.identity.fingerprint });
  const socket = new WebSocket(`ws://${url}/stream?${query}`);
  socket.on("error", () => {});
  return socket;
}

function refusalOf(socket) {
  return new Promise((done, wrong) => {
    const timer = setTimeout(() => wrong(new Error("the door never answered")), 8000);
    socket.on("unexpected-response", (asked, said) => {
      let held = "";
      said.on("data", (chunk) => { held += String(chunk); });
      said.once("end", () => {
        clearTimeout(timer);
        said.destroy();
        asked.destroy();
        done({ status: said.statusCode, type: said.headers["content-type"], body: held });
      });
    });
    socket.on("open", () => { clearTimeout(timer); socket.close(); wrong(new Error("the door let a stranger in")); });
  });
}

test("a stranger turned away at the stream is told why, not just refused", async () => {
  const stranger = newIdentity("stranger");
  const socket = dialStream(stranger);
  try {
    const said = await refusalOf(socket);
    assert.equal(said.status, 401);
    assert.match(said.type || "", /application\/json/);
    assert.equal(JSON.parse(said.body).error, "that key is not on the roster");
  } finally {
    try { socket.terminate(); } catch {}
  }
});

test("a revoked key is told it was revoked, with the status that says so", async () => {
  const gone = newIdentity("was here");
  broker.roster.adopt([{
    fingerprint: gone.fingerprint,
    publicSsh: gone.publicSsh,
    name: "was here",
    kind: "mac",
    pairedAt: 0,
    lastSeen: 0,
    revokedAt: 0
  }]);
  broker.roster.revoke(gone.fingerprint);

  const socket = dialStream(gone);
  try {
    const said = await refusalOf(socket);
    assert.equal(said.status, 403);
    assert.equal(JSON.parse(said.body).error, "that key was revoked");
  } finally {
    try { socket.terminate(); } catch {}
  }
});

test("the refusal head carries a body the other side can read", () => {
  const head = refusalHead({ status: 401, error: "that key is not on the roster" });
  const [line, ...rest] = head.split("\r\n");
  assert.equal(line, "HTTP/1.1 401 Unauthorized");
  const body = rest[rest.indexOf("") + 1];
  assert.equal(JSON.parse(body).error, "that key is not on the roster");
  assert.match(head, /content-length: 41/);
  assert.equal(Buffer.byteLength(body), 41);
});

test("the refusal head does not call every status Unauthorized", () => {
  assert.match(refusalHead({ status: 403, error: "that key was revoked" }), /^HTTP\/1\.1 403 Forbidden\r\n/);
});
