import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSecretAsks, secretUrlOf, SECRET_TTL_MS } from "../lib/secret-asks.mjs";

const fresh = (clock = { t: 1000 }, keep = null) => {
  const dir = join(mkdtempSync(join(tmpdir(), "secrets-")), "secrets");
  let n = 0;
  return { dir, clock, asks: createSecretAsks({ dir, keep, now: () => clock.t, token: () => `id${++n}` }) };
};

test("a seat opens a request, the person answers, and the value lands in a private file the seat gets the path of", async () => {
  const { asks, dir } = fresh();
  const opened = asks.open({ seat: "crm-audio", label: "  token do  GitHub ", why: "abrir o PR" });
  assert.deepEqual(opened.ask, { id: "id1", seat: "crm-audio", label: "token do GitHub", why: "abrir o PR", state: "pending", at: 1000 });
  assert.deepEqual(asks.pending().map((one) => one.id), ["id1"]);
  assert.equal(asks.status({ id: "id1", seat: "crm-audio" }).ask.path, "");
  const saved = await asks.answer({ id: "id1", value: "ghp_secret" });
  assert.equal(saved.ask.state, "saved");
  assert.equal("path" in saved.ask, false, "the answer never echoes where the value went");
  const seen = asks.status({ id: "id1", seat: "crm-audio" }).ask;
  assert.equal(seen.path, join(dir, "crm-audio-id1"));
  assert.equal(readFileSync(seen.path, "utf8"), "ghp_secret");
  assert.equal(statSync(seen.path).mode & 0o777, 0o600);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.deepEqual(asks.pending(), []);
  assert.match((await asks.answer({ id: "id1", value: "again" })).error, /already saved/);
});

test("another seat cannot read a request it did not open", () => {
  const { asks } = fresh();
  asks.open({ seat: "a", label: "x" });
  assert.ok(asks.status({ id: "id1", seat: "b" }).error);
  assert.ok(asks.cancel({ id: "id1", seat: "b" }).error);
});

test("a request is refused without a seat or a label, and an empty value saves nothing", async () => {
  const { asks } = fresh();
  assert.ok(asks.open({ seat: "", label: "x" }).error);
  assert.ok(asks.open({ seat: "../etc", label: "x" }).error);
  assert.ok(asks.open({ seat: "a", label: "   " }).error);
  asks.open({ seat: "a", label: "x" });
  assert.ok((await asks.answer({ id: "id1", value: "" })).error);
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

test("after a day the sweep forgets the request and deletes the file", async () => {
  const clock = { t: 1000 };
  const { asks } = fresh(clock);
  asks.open({ seat: "a", label: "x" });
  await asks.answer({ id: "id1", value: "v" });
  const path = asks.status({ id: "id1", seat: "a" }).ask.path;
  const old = (Date.now() - SECRET_TTL_MS - 60000) / 1000;
  utimesSync(path, old, old);
  clock.t = Date.now();
  assert.equal(asks.sweep(), 1);
  assert.equal(existsSync(path), false);
  assert.ok(asks.status({ id: "id1", seat: "a" }).error);
});

test("a request can carry the page where the value is made, and only an http address is taken", () => {
  const { asks } = fresh();
  assert.equal(asks.open({ seat: "a", label: "x", url: " https://github.com/settings/tokens " }).ask.url, "https://github.com/settings/tokens");
  assert.match(asks.open({ seat: "a", label: "x", url: "javascript:alert(1)" }).error, /http\(s\) address/);
  assert.match(asks.open({ seat: "a", label: "x", url: "not a link" }).error, /http\(s\) address/);
  assert.equal(secretUrlOf("file:///etc/passwd"), "");
  assert.equal(secretUrlOf(`https://example.com/${"a".repeat(3000)}`), "");
  assert.equal("url" in asks.open({ seat: "a", label: "x" }).ask, false);
});

test("a credential of the hub goes to the hub through the hive: the seat gets the key and no path", async () => {
  const kept = [];
  const { asks, dir } = fresh({ t: 1000 }, async (asked) => { kept.push(asked); return { ok: true, kept: "file", reloaded: true }; });
  const opened = asks.open({ seat: "a", label: "tracker token", envKey: "TRACKER_TOKEN", place: { replaces: true, vault: false } });
  assert.deepEqual(opened.ask, { id: "id1", seat: "a", label: "tracker token", why: "", state: "pending", at: 1000, envKey: "TRACKER_TOKEN", replaces: true, vault: false });
  const saved = await asks.answer({ id: "id1", value: "  tok_123  " });
  assert.equal(saved.ask.state, "saved");
  assert.deepEqual(kept, [{ key: "TRACKER_TOKEN", value: "tok_123", vault: false }]);
  const seen = asks.status({ id: "id1", seat: "a" }).ask;
  assert.equal(seen.path, "");
  assert.equal(seen.kept, "file");
  assert.equal(seen.reloaded, true);
  assert.equal(existsSync(dir), false, "nothing is written under the secrets folder");
  assert.doesNotMatch(JSON.stringify([saved, seen]), /tok_123/);
});

test("the vault is the default when the hub already uses it, and the person can turn it off", async () => {
  const kept = [];
  const { asks } = fresh({ t: 1000 }, async (asked) => { kept.push(asked.vault); return { ok: true, kept: asked.vault ? "vault" : "file", reloaded: false }; });
  asks.open({ seat: "a", label: "x", envKey: "ONE_TOKEN", place: { replaces: false, vault: true } });
  asks.open({ seat: "a", label: "y", envKey: "TWO_TOKEN", place: { replaces: false, vault: true } });
  await asks.answer({ id: "id1", value: "v" });
  await asks.answer({ id: "id2", value: "v", vault: false });
  assert.deepEqual(kept, [true, false]);
  assert.equal(asks.status({ id: "id1", seat: "a" }).ask.kept, "vault");
});

test("a save the hub refuses leaves the card open to try again, and a second click waits for the first", async () => {
  let fail = true;
  let release;
  const { asks } = fresh({ t: 1000 }, (asked) => new Promise((done) => { release = () => done(fail ? { ok: false, error: "1Password did not answer" } : { ok: true, kept: "file", reloaded: true }); }));
  asks.open({ seat: "a", label: "x", envKey: "SOME_TOKEN" });
  const first = asks.answer({ id: "id1", value: "v" });
  assert.match((await asks.answer({ id: "id1", value: "v" })).error, /being saved/);
  release();
  assert.equal((await first).error, "1Password did not answer");
  assert.equal(asks.status({ id: "id1", seat: "a" }).ask.state, "pending");
  fail = false;
  const second = asks.answer({ id: "id1", value: "v" });
  release();
  assert.equal((await second).ask.state, "saved");
});

test("a hub credential is one line under a key of the hub, never a key of the hive itself", async () => {
  const { asks } = fresh({ t: 1000 }, async () => ({ ok: true, kept: "file", reloaded: true }));
  assert.match(asks.open({ seat: "a", label: "x", envKey: "1BAD" }).error, /\.env key/);
  assert.match(asks.open({ seat: "a", label: "x", envKey: "A B" }).error, /\.env key/);
  assert.match(asks.open({ seat: "a", label: "x", envKey: "HIVE_MCP_GATEWAY_TOKEN" }).error, /belongs to the hive/);
  asks.open({ seat: "a", label: "x", envKey: "SOME_TOKEN" });
  assert.match((await asks.answer({ id: "id1", value: "line one\nline two" })).error, /single line/);
  assert.equal(asks.status({ id: "id1", seat: "a" }).ask.state, "pending");
  const bare = fresh();
  assert.match(bare.asks.open({ seat: "a", label: "x", envKey: "SOME_TOKEN" }).error, /cannot write the hub \.env/);
});
