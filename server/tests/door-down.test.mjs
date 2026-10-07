import { test } from "node:test";
import assert from "node:assert/strict";

import { DOOR_IS_DOWN, WHY_CEILING, createBrokerClient, whyOf } from "../client.mjs";
import { newIdentity } from "../identity.mjs";

const PAGE_503 = `<html>
<head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
</body>
</html>`;

test("the load balancer's error page never becomes the text of the conversation", () => {
  for (const status of DOOR_IS_DOWN) {
    const why = whyOf({ ok: false, status }, null, PAGE_503);
    assert.ok(!why.includes("<"), `the raw html leaked to the screen on ${status}: ${why}`);
    assert.match(why, /restarting or down/);
    assert.match(why, new RegExp(String(status)));
  }
});

test("html under any other status says whoever answered was not the server", () => {
  const why = whyOf({ ok: false, status: 404 }, null, "<html><body>nginx</body></html>");
  assert.equal(why, "whoever answered 404 was not the server");
});

test("when the server speaks, its own words are what shows", () => {
  assert.equal(whyOf({ ok: false, status: 409 }, { error: "that session is not listening" }, "{}"),
    "that session is not listening");
});

test("a good answer carries no error at all", () => {
  assert.equal(whyOf({ ok: true, status: 200 }, { ok: true }, "{}"), "");
});

test("an empty body does not become silence", () => {
  assert.match(whyOf({ ok: false, status: 502 }, null, ""), /502 and said nothing else/);
  assert.match(whyOf({ ok: false, status: 418 }, null, "   "), /418 and said nothing else/);
});

test("plain text from the server goes through, but never the whole page", () => {
  const long = "x".repeat(WHY_CEILING * 3);
  assert.equal(whyOf({ ok: false, status: 400 }, null, long).length, WHY_CEILING);
  assert.equal(whyOf({ ok: false, status: 400 }, null, "the name is missing"), "the name is missing");
});

test("a seat asking a door that is down gets a sentence, not html", async () => {
  const me = newIdentity("mac");
  const client = createBrokerClient({
    url: "https://hive-ada.hive.example",
    identity: me,
    audience: "SHA256:whatever",
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => PAGE_503 })
  });

  const said = await client.get("/api/sessions/a-seat/events?from=0");
  assert.equal(said.ok, false);
  assert.equal(said.status, 503);
  assert.ok(!said.error.includes("<html"), `html reached the screen: ${said.error}`);
  assert.match(said.error, /the server did not answer \(503\)/);
});

test("pairing hands back the SERVER's key, which is the one the device pins", async () => {
  const { createBroker } = await import("../server.mjs");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const home = mkdtempSync(join(tmpdir(), "hive-pairing-"));
  const broker = createBroker({ home });
  await new Promise((done) => broker.http.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${broker.http.address().port}`;

  try {
    const me = newIdentity("iPhone");
    const code = broker.roster.open({ kind: "phone" }).code;
    const said = await (await fetch(`${url}/api/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, key: me.publicSsh, name: "iPhone" })
    })).json();

    assert.equal(said.paired, true, said.error || "pairing did not take");
    assert.equal(said.fingerprint, broker.identity.fingerprint,
      "the device pins this as who it talks to: hand it its own key and every signed call is refused, and the app reads that as a revoked pairing");
    assert.equal(said.device, me.fingerprint, "whoever paired has to recognise itself in the answer too");

    const client = createBrokerClient({ url, identity: me, audience: said.fingerprint });
    const mine = await client.get("/api/me");
    assert.equal(mine.ok, true, mine.error || "the first signed call after pairing was refused");
    assert.equal(mine.body.fingerprint, me.fingerprint);
  } finally {
    broker.sessions.stop();
    broker.http.close();
    rmSync(home, { recursive: true, force: true });
  }
});

/* a call that hands the server its own deadline — a history scan, a session sync —
   was still cut off here at the client's flat minute, so the answer it was waiting
   for came back as "the server did not answer in time" while the work went on over
   there, and the archive fell back to the pod rows it already had. */
test("a call carries its own deadline, and everything else keeps the minute", async () => {
  const asked = [];
  const client = createBrokerClient({
    url: "https://door.example",
    identity: newIdentity(),
    audience: "cloud",
    fetchImpl: async (url, init) => {
      asked.push(init.signal);
      return { ok: true, status: 200, text: async () => "{}" };
    }
  });

  await client.post("/api/run", { script: "scan" }, { timeoutMs: 130000 });
  await client.post("/api/run", { script: "scan" });
  await client.get("/api/me");

  assert.equal(asked.length, 3);
  for (const signal of asked) assert.ok(signal, "a call went out with no deadline at all");
  assert.notEqual(asked[0], asked[1], "the long call reused the default deadline");
});

/* the signal AbortSignal.timeout hands out is backed by an unref'd timer, so a
   test whose only pending work is waiting for it drains the loop and dies under
   --test-force-exit. The interval holds the loop open for as long as the wait. */
test("a server that does not answer inside the deadline is reported as one that ran out", async () => {
  let held = null;
  const client = createBrokerClient({
    url: "https://door.example",
    identity: newIdentity(),
    audience: "cloud",
    fetchImpl: (url, init) => new Promise((_, no) => {
      held = init.signal;
      init.signal.addEventListener("abort", () => no(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
    })
  });

  const awake = setInterval(() => {}, 5);
  try {
    const said = await client.post("/api/run", { script: "slow" }, { timeoutMs: 60 });
    assert.ok(held, "the fetch never saw a signal");
    assert.equal(said.ok, false);
    assert.equal(said.error, "the server did not answer in time");
  } finally {
    clearInterval(awake);
  }
});
