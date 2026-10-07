import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openSeat, hiveDoor } from "../peer/peer.mjs";

async function hive({ structured = false } = {}) {
  const base = await mkdtemp(join(tmpdir(), "hive-spawn-"));
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(join(base, "sessions", "seat.json"), JSON.stringify({ session_id: "s1", cwd: "/w/hub" }));
  if (structured) {
    await mkdir(join(base, "events"), { recursive: true });
    await writeFile(join(base, "events", "seat.ndjson"), "");
  }
  return base;
}

async function fakeApp(base, answer = { ok: true, id: "n3", name: "crm-midia" }) {
  const seen = [];
  const app = createServer((req, res) => {
    let body = "";
    req.on("data", (piece) => { body += piece; });
    req.on("end", () => {
      seen.push({ path: req.url, body: body ? JSON.parse(body) : null });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise((up) => app.listen({ path: hiveDoor(base) }, up));
  return { seen, close: () => new Promise((done) => app.close(done)) };
}

const envOf = (base) => ({ HIVE_SEAT: "seat", HIVE_STATE_DIR: base });

test("a mission opens a seat, and the hive is told where", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  const born = await openSeat({ mission: "descobre por que o áudio do CRM fica mudo", env: envOf(base) });
  assert.equal(born.name, "crm-midia");
  assert.equal(born.where, "local");
  assert.deepEqual(app.seen.map((c) => c.path), ["/api/spawn"]);
  assert.equal(app.seen[0].body.prompt, "descobre por que o áudio do CRM fica mudo");
  assert.equal(app.seen[0].body.where, "local");
});

test("the seat carries the name and the title the caller chose", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({
    mission: "descobre por que o áudio do CRM fica mudo",
    name: "crm-audio-mudo",
    title: "  áudio   mudo no   CRM  ",
    env: envOf(base)
  });
  const body = app.seen[0].body;
  assert.equal(body.name, "crm-audio-mudo");
  assert.equal(body.title, "áudio mudo no CRM", "the title is one tidy line, whatever came in");
});

test("a title longer than the tile is cut, not refused", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "algo", title: "t".repeat(200), env: envOf(base) });
  assert.equal(app.seen[0].body.title.length, 60);
});

test("no title is no title, not an empty line in the tile", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "algo", env: envOf(base) });
  assert.equal(app.seen[0].body.title, "");
});

test("every seat of the same request carries the same line", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  for (const name of ["crm-audio-mudo", "crm-audio-teste"]) {
    await openSeat({ mission: "olha o áudio", name, errand: "  áudio mudo   no CRM ", env: envOf(base) });
  }
  assert.deepEqual(app.seen.map((c) => c.body.errand), ["áudio mudo no CRM", "áudio mudo no CRM"]);
});

test("the chat that opened the seat is part of the birth, without being asked for", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "olha o acervo", env: envOf(base) });
  assert.equal(app.seen[0].body.by, "seat");
});

test("a seat can be opened on another chat program, with the login the person picked", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "olha o frontend", agent: "codex", account: "rafael", where: "local", env: envOf(base) });
  assert.equal(app.seen[0].body.agent, "codex");
  assert.equal(app.seen[0].body.account, "rafael");
});

test("the account stays behind when the seat runs on the server, because the server picks its own", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "olha o acervo", agent: "codex", account: "rafael", where: "cloud", env: envOf(base) });
  assert.equal(app.seen[0].body.agent, "codex");
  assert.equal("account" in app.seen[0].body, false);
});

test("a chat program the hive does not talk to opens nothing, and says which ones it does", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  const said = await openSeat({ mission: "olha isso", agent: "gpt", env: envOf(base) });
  assert.match(said.error, /claude/);
  assert.equal(app.seen.length, 0);
});

test("a seat with no mission is not opened at all", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  for (const mission of ["", "   ", undefined]) {
    const born = await openSeat({ mission, env: envOf(base) });
    assert.match(born.error, /mission/);
  }
  assert.equal(app.seen.length, 0, "nothing should reach the hive");
});

test("a name that is not a seat name is refused before the hive sees it", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  const born = await openSeat({ mission: "olha o PED-42", name: "Não Vale/Isso", env: envOf(base) });
  assert.match(born.error, /lowercase/);
  assert.equal(app.seen.length, 0);
});

test("where only accepts the two places there are", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "roda o load test", where: "cloud", env: envOf(base) });
  await openSeat({ mission: "roda o load test", where: "marte", env: envOf(base) });
  assert.deepEqual(app.seen.map((c) => c.body.where), ["cloud", "local"]);
});

test("a hive that refuses says why, and no seat is claimed", async (t) => {
  const base = await hive();
  const app = await fakeApp(base, { error: "write the mission or give it a name" });
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  const born = await openSeat({ mission: "algo", env: envOf(base) });
  assert.match(born.error, /write the mission/);
  assert.equal(born.name, undefined);
});

test("without a hive on this machine, nothing is opened", async () => {
  const base = await hive();
  const born = await openSeat({ mission: "algo", env: envOf(base) });
  assert.match(born.error, /no hive answering/);
  await rm(base, { recursive: true, force: true });
});

test("a native chat opens a native chat", async (t) => {
  const base = await hive({ structured: true });
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "olha o acervo", env: envOf(base) });
  assert.equal(app.seen[0].body.structured, true);
});

test("a terminal chat opens a terminal chat", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "olha o acervo", env: envOf(base) });
  assert.equal(app.seen[0].body.structured, false);
});

test("with no chat to take after, the seat opens the way the person opens one by hand", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });

  await openSeat({ mission: "olha o acervo", env: { HIVE_STATE_DIR: base } });
  assert.equal(app.seen[0].body.structured, true);
});
