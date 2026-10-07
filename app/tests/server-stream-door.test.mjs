import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBroker } from "../../server/server.mjs";
import { newIdentity } from "../../server/identity.mjs";
import { attachServerStream } from "../lib/server-stream.mjs";

let home;
let broker;
let url;

before(async () => {
  home = mkdtempSync(join(tmpdir(), "hive-door-"));
  broker = createBroker({ home });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${broker.http.address().port}`;
});

after(() => {
  broker.http.close();
  rmSync(home, { recursive: true, force: true });
});

function until(is, ms = 5000) {
  const stop = Date.now() + ms;
  return new Promise((done, wrong) => {
    const look = () => {
      if (is()) return done();
      if (Date.now() > stop) return wrong(new Error("waited too long"));
      setTimeout(look, 10);
    };
    look();
  });
}

test("the reason a key is refused survives the trip from the door to the log", async () => {
  const heard = [];
  const stream = attachServerStream({
    identity: newIdentity("desktop"),
    audience: broker.identity.fingerprint,
    url,
    warn: (why) => heard.push(why),
    turnedAwayStep: 60000,
    turnedAwayCap: 60000
  });
  try {
    await until(() => heard.length > 0);
    assert.deepEqual(heard, ["that key is not on the roster"]);
    assert.equal(stream.up, false);
  } finally {
    stream.stop();
  }
});

test("the connection a door refused behind a proxy is not left behind for the network to reset", async () => {
  const open = new Set();
  const proxy = createServer((asked, said) => {
    said.writeHead(401, { "content-type": "application/json", connection: "keep-alive" });
    said.end(JSON.stringify({ error: "that key is not on the roster" }));
  });
  proxy.on("connection", (socket) => {
    open.add(socket);
    socket.once("close", () => open.delete(socket));
  });
  await new Promise((done) => proxy.listen(0, "127.0.0.1", done));

  const heard = [];
  const stream = attachServerStream({
    identity: newIdentity("desktop"),
    audience: broker.identity.fingerprint,
    url: `http://127.0.0.1:${proxy.address().port}`,
    warn: (why) => heard.push(why),
    turnedAwayStep: 60000,
    turnedAwayCap: 60000
  });
  try {
    await until(() => heard.length > 0);
    assert.deepEqual(heard, ["that key is not on the roster"]);
    await until(() => open.size === 0);
  } finally {
    stream.stop();
    proxy.close();
  }
});

test("a key the door knows still gets a stream, and says nothing at all", async () => {
  const me = newIdentity("desktop");
  broker.roster.adopt([{
    fingerprint: me.fingerprint,
    publicSsh: me.publicSsh,
    name: "desktop",
    kind: "mac",
    pairedAt: 0,
    lastSeen: 0,
    revokedAt: 0
  }]);

  const heard = [];
  const welcomed = [];
  const stream = attachServerStream({
    identity: me,
    audience: broker.identity.fingerprint,
    url,
    warn: (why) => heard.push(why)
  });
  try {
    stream.follow("anything", (envelope) => welcomed.push(envelope));
    await until(() => stream.up);
    assert.deepEqual(heard, []);
    assert.equal(stream.refusal, "");
    await until(() => welcomed.some((one) => one.kind === "welcome"));
  } finally {
    stream.stop();
  }
});
