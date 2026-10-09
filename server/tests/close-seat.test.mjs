import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { closeSeat, hiveDoor } from "../peer/peer.mjs";

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-close-"));
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(join(base, "sessions", "seat.json"), JSON.stringify({ session_id: "s1", cwd: "/w/hub" }));
  return base;
}

async function fakeApp(base, answer = { ok: true }) {
  const seen = [];
  const app = createServer((req, res) => {
    let body = "";
    req.on("data", (piece) => { body += piece; });
    req.on("end", () => {
      seen.push({ path: req.url, body: body ? JSON.parse(body) : null });
      res.statusCode = answer.error ? 403 : 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise((up) => app.listen({ path: hiveDoor(base) }, up));
  return { seen, close: () => new Promise((done) => app.close(done)) };
}

const envOf = (base) => ({ HIVE_SEAT: "seat", HIVE_STATE_DIR: base });

test("closing a chat it opened tells the hive which one, where, and who asks", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  const done = await closeSeat({ seat: { name: "crm-audio-mudo", side: "cloud" }, env: envOf(base) });
  assert.deepEqual(done, { name: "crm-audio-mudo", where: "cloud", itself: false });
  assert.deepEqual(app.seen, [{ path: "/api/kill", body: { name: "crm-audio-mudo", where: "cloud", by: "seat" } }]);
});

test("with no seat named, the chat closes itself", async (t) => {
  const base = await hive();
  const app = await fakeApp(base, { ok: true, leaving: true });
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  const done = await closeSeat({ env: envOf(base) });
  assert.equal(done.itself, true);
  assert.deepEqual(app.seen[0].body, { name: "seat", where: "local", by: "seat" });
});

test("the hive's refusal reaches the chat in its own words", async (t) => {
  const base = await hive();
  const app = await fakeApp(base, { error: "outra was not opened by seat — a chat closes only itself and the chats it opened" });
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  const done = await closeSeat({ seat: { name: "outra", side: "local" }, env: envOf(base) });
  assert.match(done.error, /closes only itself/);
});

test("a session with no seat cannot close anything", async () => {
  const done = await closeSeat({ env: { HIVE_STATE_DIR: "/nowhere" } });
  assert.match(done.error, /no name in the hive/);
});
