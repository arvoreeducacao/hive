import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = readFileSync(join(HERE, "server.mjs"), "utf8");
const SEAT_ROUTES = readFileSync(join(HERE, "routes/seats.mjs"), "utf8");

function cut(name) {
  const at = SERVER.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} is gone`);
  return SERVER.slice(at, SERVER.indexOf("\n}", at) + 2);
}

function running(state) {
  const seatKey = (where, seat) => `${where}:${seat}`;
  const kept = [];
  const call = new Function("histCache", "fleet", "seatKey", "keepArchive",
    `${cut("historyStamp")}\n${cut("historyClosedSeat")}\nreturn historyClosedSeat;`);
  const close = call(state.histCache, state.fleet, seatKey, async (data) => { kept.push(JSON.parse(JSON.stringify(data))); });
  close.kept = kept;
  return close;
}

const snapshot = () => ({
  histCache: {
    at: Date.now(),
    data: {
      sessions: [
        { id: "aaa", where: "local", at: Date.parse("2026-09-01T10:00:00Z"), title: "older" },
        { id: "bbb", where: "local", at: Date.parse("2026-09-01T09:00:00Z"), title: "the one closing" }
      ]
    }
  },
  fleet: new Map([["local:limpar-header", { id: "bbb", where: "local", cwd: "/repos/hub" }]])
});

test("closing a seat drops the archive's freshness, so the next reader rescans", () => {
  const state = snapshot();
  running(state)("local", "limpar-header");
  assert.equal(state.histCache.at, 0, "the archive still counts as fresh for up to a minute");
});

test("the closed chat rises to the top of the archive at once, not after the scan", () => {
  const state = snapshot();
  const before = Date.now();
  running(state)("local", "limpar-header");
  const rows = state.histCache.data.sessions;
  assert.equal(rows[0].id, "bbb", "the chat just closed is not the most recent one");
  assert.ok(rows[0].at >= before, "its row still carries the timestamp of the last scan");
  assert.equal(rows[0].seat, "limpar-header", "the row lost the seat name, so it loses its title too");
});

test("a chat the archive never saw is written into it, not dropped", () => {
  const state = snapshot();
  state.fleet.set("local:limpar-header", { id: "zzz", where: "local", cwd: "/repos/hub" });
  const before = Date.now();
  running(state)("local", "limpar-header");
  assert.equal(state.histCache.at, 0);
  const top = state.histCache.data.sessions[0];
  assert.equal(top.id, "zzz", "the chat just closed is still missing from the archive");
  assert.equal(top.where, "local");
  assert.equal(top.seat, "limpar-header", "the row carries no seat name, so it cannot pick up its title");
  assert.equal(top.cwd, "/repos/hub", "the row lost the folder it ran in");
  assert.ok(top.at >= before);
  assert.equal(state.histCache.data.sessions.length, 3, "writing the row lost or duplicated another");
});

test("the written row names the agent only when it is not claude", () => {
  const state = snapshot();
  state.fleet.set("local:limpar-header", { id: "zzz", where: "local", agent: "claude" });
  running(state)("local", "limpar-header");
  assert.ok(!("agent" in state.histCache.data.sessions[0]), "a claude row carries a redundant agent");

  const other = snapshot();
  other.fleet.set("local:limpar-header", { id: "zzz", where: "local", agent: "codex" });
  running(other)("local", "limpar-header");
  assert.equal(other.histCache.data.sessions[0].agent, "codex", "the row forgot which agent ran it");
});

test("a seat with no id at all is still not written", () => {
  const state = snapshot();
  state.fleet.set("local:limpar-header", { where: "local" });
  running(state)("local", "limpar-header");
  assert.equal(state.histCache.data.sessions.length, 2, "a seat with no session id became a row");
  assert.equal(state.histCache.at, 0);
});

test("nothing scanned yet is not a crash", () => {
  const state = { histCache: { at: 5, data: null }, fleet: new Map() };
  assert.doesNotThrow(() => running(state)("local", "whoever"));
  assert.equal(state.histCache.at, 0);
});

test("both ways a seat leaves fix the archive, and both do it before the fleet forgets", () => {
  const ways = {
    archiveSeat: cut("archiveSeat"),
    "/api/kill": SEAT_ROUTES.slice(
      SEAT_ROUTES.indexOf('on("POST", "/api/kill"'),
      SEAT_ROUTES.indexOf('on("POST", "/api/seat/archive"')
    )
  };
  for (const [leaving, body] of Object.entries(ways)) {
    assert.ok(body.length > 40, `could not cut ${leaving} out — it moved`);
    const fixed = body.indexOf("historyClosedSeat(");
    const forgot = body.indexOf("forgetSeat(");
    assert.ok(fixed > 0, `${leaving} leaves the archive stale`);
    assert.ok(forgot > 0 && fixed < forgot, `${leaving} corrects the archive after the fleet already forgot the seat's id`);
  }
});

test("the repair reaches the route that closes a seat", () => {
  assert.match(SEAT_ROUTES, /^\s+historyClosedSeat,$/m, "routes/seats.mjs never takes historyClosedSeat from its context");
  assert.match(SERVER, /killSeatWindow, historyClosedSeat, forgetSeat/, "server.mjs never hands historyClosedSeat to registerSeatRoutes");
});

test("a chat that moved sides is rewritten, not twinned", () => {
  const state = snapshot();
  state.histCache.data.sessions.push({ id: "ccc", where: "cloud", at: Date.parse("2026-09-01T08:00:00Z"), title: "no servidor", prompt: "oi" });
  state.fleet.set("local:limpar-header", { id: "ccc", where: "local", cwd: "/repos/hub" });
  running(state)("local", "limpar-header");
  const found = state.histCache.data.sessions.filter((row) => row.id === "ccc");
  assert.equal(found.length, 1, "the row it came from is still standing next to the new one");
  assert.equal(found[0].where, "local", "the row still claims the side the chat left");
  assert.equal(found[0].prompt, "oi", "what the row already knew was thrown away");
});

test("the stamp is written through to the file, not only to memory", () => {
  const state = snapshot();
  const close = running(state);
  close("local", "limpar-header");
  assert.equal(close.kept.length, 1, "a restart before the next scan loses the chat that just closed");
  assert.equal(close.kept[0].sessions[0].id, "bbb");
});

test("moving sides drops the mirror badge, which only described the side it left", () => {
  const state = snapshot();
  state.histCache.data.sessions.push({ id: "ccc", where: "cloud", at: 1, sync: "behind" });
  state.fleet.set("local:limpar-header", { id: "ccc", where: "local", cwd: "/repos/hub" });
  running(state)("local", "limpar-header");
  assert.equal(state.histCache.data.sessions.find((row) => row.id === "ccc").sync, undefined);
});

test("closing on the side it was already on keeps the badge", () => {
  const state = snapshot();
  state.histCache.data.sessions.push({ id: "ccc", where: "local", at: 1, sync: "ok" });
  state.fleet.set("local:limpar-header", { id: "ccc", where: "local", cwd: "/repos/hub" });
  running(state)("local", "limpar-header");
  assert.equal(state.histCache.data.sessions.find((row) => row.id === "ccc").sync, "ok");
});

test("a seat with no session writes nothing at all to the file", () => {
  const state = snapshot();
  state.fleet.set("local:limpar-header", { where: "local" });
  const close = running(state);
  close("local", "limpar-header");
  assert.equal(close.kept.length, 0, "a seat with no session id wrote a row about nothing");
});
