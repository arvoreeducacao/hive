import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createBroker } from "../server.mjs";
import { createBrokerClient } from "../client.mjs";
import { newIdentity } from "../identity.mjs";
import { driverArgs } from "../sessions.mjs";

let home = "";
let broker = null;
let url = "";
let asked = [];

before(async () => {
  home = mkdtempSync(join(tmpdir(), "seat-birth-"));
  broker = createBroker({
    home,
    stateDir: home,
    name: "prova",
    driverPath: "/fake/server/engine/driver.mjs",
    launch: (args) => {
      asked.push(args);
      return { pid: 1, on() {}, kill() {}, stdout: { on() {} }, stderr: { on() {} } };
    }
  });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${broker.http.address().port}`;
});

after(() => {
  broker.sessions.stop();
  broker.http.close();
  rmSync(home, { recursive: true, force: true });
});

async function paired(name) {
  const audience = broker.identity.fingerprint;
  const code = broker.roster.open({ kind: "mac" }).code;
  const me = newIdentity(name);
  const done = await fetch(`${url}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, key: me.publicSsh, name })
  });
  assert.equal((await done.json()).paired, true);
  return createBrokerClient({ url, identity: me, audience });
}

test("the id the app picks for a seat that never ran names the conversation, it does not resume one", async () => {
  const client = await paired("desktop");
  asked = [];
  const born = await client.post("/api/sessions", {
    name: "nasce-com-id",
    cwd: home,
    sessionId: "3cb41ff4-8aef-4c0b-b6c8-7c416741e6ca"
  });
  assert.equal(born.ok, true, born.error);
  assert.equal(asked.length, 1, "the server did not start anything");
  const line = asked[0];
  assert.ok(line.includes("--session-id"), "the fresh id never reached the driver");
  assert.equal(line[line.indexOf("--session-id") + 1], "3cb41ff4-8aef-4c0b-b6c8-7c416741e6ca");
  assert.ok(!line.includes("--resume-id"), "a seat that never ran was asked to resume, and Claude Code has nothing to resume");
});

test("a seat that already has a conversation is resumed, and the fresh id stays out of the way", async () => {
  const client = await paired("desktop-2");
  asked = [];
  const back = await client.post("/api/sessions", {
    name: "volta-do-resume",
    cwd: home,
    resumeId: "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb",
    sessionId: "cccccccc-4444-5555-6666-dddddddddddd"
  });
  assert.equal(back.ok, true, back.error);
  const line = asked[0];
  assert.ok(line.includes("--resume-id"), "the resume id never reached the driver");
  assert.ok(!line.includes("--session-id"), "the driver was handed both, and Claude Code refuses that");
});

test("the command line carries one of the two ids, never both", () => {
  assert.deepEqual(driverArgs({ name: "um", sessionId: "s1" }), ["--name", "um", "--session-id", "s1"]);
  assert.deepEqual(driverArgs({ name: "um", resumeId: "r1" }), ["--name", "um", "--resume-id", "r1"]);
  assert.deepEqual(driverArgs({ name: "um", resumeId: "r1", sessionId: "s1" }), ["--name", "um", "--resume-id", "r1"]);
});
