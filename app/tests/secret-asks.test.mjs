import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSecretAsks, SECRET_TTL_MS } from "../lib/secret-asks.mjs";

const fresh = (clock = { t: 1000 }) => {
  const dir = join(mkdtempSync(join(tmpdir(), "secrets-")), "secrets");
  let n = 0;
  return { dir, clock, asks: createSecretAsks({ dir, now: () => clock.t, token: () => `id${++n}` }) };
};

test("a seat opens a request, the person answers, and the value lands in a private file the seat gets the path of", () => {
  const { asks, dir } = fresh();
  const opened = asks.open({ seat: "crm-audio", label: "  token do  GitHub ", why: "abrir o PR" });
  assert.deepEqual(opened.ask, { id: "id1", seat: "crm-audio", label: "token do GitHub", why: "abrir o PR", state: "pending", at: 1000 });
  assert.deepEqual(asks.pending().map((one) => one.id), ["id1"]);
  assert.equal(asks.status({ id: "id1", seat: "crm-audio" }).ask.path, "");
  const saved = asks.answer({ id: "id1", value: "ghp_secret" });
  assert.equal(saved.ask.state, "saved");
  assert.equal("path" in saved.ask, false, "the answer never echoes where the value went");
  const seen = asks.status({ id: "id1", seat: "crm-audio" }).ask;
  assert.equal(seen.path, join(dir, "crm-audio-id1"));
  assert.equal(readFileSync(seen.path, "utf8"), "ghp_secret");
  assert.equal(statSync(seen.path).mode & 0o777, 0o600);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.deepEqual(asks.pending(), []);
  assert.match(asks.answer({ id: "id1", value: "again" }).error, /already saved/);
});

test("another seat cannot read a request it did not open", () => {
  const { asks } = fresh();
  asks.open({ seat: "a", label: "x" });
  assert.ok(asks.status({ id: "id1", seat: "b" }).error);
  assert.ok(asks.cancel({ id: "id1", seat: "b" }).error);
});

test("a request is refused without a seat or a label, and an empty value saves nothing", () => {
  const { asks } = fresh();
  assert.ok(asks.open({ seat: "", label: "x" }).error);
  assert.ok(asks.open({ seat: "../etc", label: "x" }).error);
  assert.ok(asks.open({ seat: "a", label: "   " }).error);
  asks.open({ seat: "a", label: "x" });
  assert.ok(asks.answer({ id: "id1", value: "" }).error);
  assert.equal(asks.status({ id: "id1", seat: "a" }).ask.state, "pending");
});

test("the person can decline, and the seat can give up waiting", () => {
  const { asks } = fresh();
  asks.open({ seat: "a", label: "x" });
  assert.equal(asks.decline({ id: "id1" }).ask.state, "declined");
  asks.open({ seat: "a", label: "y" });
  assert.equal(asks.cancel({ id: "id2", seat: "a" }).ask.state, "cancelled");
  assert.deepEqual(asks.pending(), []);
});

test("after a day the sweep forgets the request and deletes the file", () => {
  const clock = { t: 1000 };
  const { asks } = fresh(clock);
  asks.open({ seat: "a", label: "x" });
  asks.answer({ id: "id1", value: "v" });
  const path = asks.status({ id: "id1", seat: "a" }).ask.path;
  const old = (Date.now() - SECRET_TTL_MS - 60000) / 1000;
  utimesSync(path, old, old);
  clock.t = Date.now();
  assert.equal(asks.sweep(), 1);
  assert.equal(existsSync(path), false);
  assert.ok(asks.status({ id: "id1", seat: "a" }).error);
});
