import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LEAF_SCOPES } from "../lib/leaf-link.mjs";
import { NO_LEAF } from "../lib/leaf-link.mjs";
import { NOT_LINKED, heldFile, keepHeld, leafReady, metadataOf, readHeld, refreshed } from "../lib/leaf-held.mjs";

const META = {
  issuer: "https://leaf.example",
  authorization_endpoint: "https://leaf.example/api/auth/oauth2/authorize",
  token_endpoint: "https://leaf.example/api/auth/oauth2/token",
  registration_endpoint: "https://leaf.example/api/auth/oauth2/register"
};

const answering = (body, { status = 200 } = {}) => ({
  ok: status < 400,
  status,
  headers: { get: () => null },
  text: async () => JSON.stringify(body)
});

function sandbox() {
  return { HIVE_HOME: mkdtempSync(join(tmpdir(), "hive-leaf-")), HIVE_LEAF_URL: "https://leaf.example" };
}

test("the token file is written where only its owner can read it", () => {
  const env = sandbox();
  keepHeld({ access: "a", refresh: "r", scopes: LEAF_SCOPES, expiresAt: 1 }, env);
  assert.equal(statSync(heldFile(env)).mode & 0o777, 0o600);
  assert.equal(readHeld(env).refresh, "r");
  assert.equal(JSON.parse(readFileSync(heldFile(env), "utf8")).access, "a");
});

test("a hive that never logged in is told to log in, not handed an empty token", async () => {
  const env = sandbox();
  assert.equal((await leafReady({ env, call: async () => answering({}) })).error, NOT_LINKED);
  assert.equal(readHeld(env).access, undefined);
});

test("a token still good is used as it is, without touching the network", async () => {
  const env = sandbox();
  keepHeld({ clientId: "c", access: "good", refresh: "r", scopes: LEAF_SCOPES, expiresAt: 10_000_000 }, env);
  const ready = await leafReady({
    env,
    now: 1000,
    call: async () => { throw new Error("should not have been called"); }
  });
  assert.equal(ready.error, undefined);
  assert.equal(ready.held.access, "good");
  assert.ok(ready.session);
});

test("a stale token is renewed and the new one is kept on disk", async () => {
  const env = sandbox();
  keepHeld({ clientId: "c", access: "old", refresh: "r1", scopes: LEAF_SCOPES, expiresAt: 0 }, env);
  const seen = [];
  const call = async (url, asked) => {
    seen.push(url);
    if (url.includes(".well-known")) return answering(META);
    assert.match(String(asked.body), /grant_type=refresh_token/);
    return answering({ access_token: "new", expires_in: 900, scope: LEAF_SCOPES });
  };
  const ready = await leafReady({ env, now: 1000, call, write: true });
  assert.equal(ready.error, undefined);
  assert.equal(ready.held.access, "new");
  assert.equal(readHeld(env).access, "new");
  assert.equal(readHeld(env).refresh, "r1");
  assert.equal(readHeld(env).clientId, "c");
  assert.equal(seen.length, 2);
});

test("a refresh the leaf rejects says to log in again, and does not erase what we hold", async () => {
  const env = sandbox();
  keepHeld({ clientId: "c", access: "old", refresh: "r1", scopes: LEAF_SCOPES, expiresAt: 0 }, env);
  const call = async (url) =>
    url.includes(".well-known")
      ? answering(META)
      : answering({ error: "invalid_grant", error_description: "expired" }, { status: 400 });
  const ready = await leafReady({ env, now: 1000, call });
  assert.match(ready.error, /leaf-login/);
  assert.match(ready.error, /expired/);
  assert.equal(readHeld(env).refresh, "r1");
});

test("a read-only token is refused before the first write, not during it", async () => {
  const env = sandbox();
  keepHeld({ clientId: "c", access: "good", refresh: "r", scopes: "leaf:read", expiresAt: 10_000_000 }, env);
  const asked = await leafReady({ env, now: 1000, write: true, call: async () => answering(META) });
  assert.match(asked.error, /only read/);
  assert.equal((await leafReady({ env, now: 1000, call: async () => answering(META) })).error, undefined);
});

test("a leaf that cannot be reached is a sentence with the address in it", async () => {
  const asked = await metadataOf("https://leaf.example", async () => { throw new Error("dns"); });
  assert.match(asked.error, /could not reach https:\/\/leaf.example/);
  assert.match((await metadataOf("https://leaf.example", async () => answering({}, { status: 502 }))).error, /answered 502/);
});

test("renewing without ever having logged in is refused before any request", async () => {
  const asked = await refreshed({ was: {}, endpoints: { token: META.token_endpoint }, base: "https://leaf.example" });
  assert.equal(asked.error, NOT_LINKED);
});

test("a hive with no leaf address is told to point at one, before anything else", async () => {
  const asked = await leafReady({ env: { HIVE_HOME: mkdtempSync(join(tmpdir(), "hive-leaf-")) } });
  assert.equal(asked.error, NO_LEAF);
});
