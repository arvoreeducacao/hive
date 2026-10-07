import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { KIMI_CLIENT_ID, KimiSessionGone, dryAccounts, freshKimiToken, kimiFileStore, kimiHosts, kimiLimitsFromUsages, kimiLimitsPerAccount, kimiTokenIsFresh, refreshKimiToken } from "../lib/limits.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

const USAGES = {
  usage: { used: 6100, limit: 10000, resetTime: "2026-09-12T03:00:00Z" },
  limits: [
    { name: "5h", window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" }, detail: { used: 12, limit: 500, resetTime: "2026-09-08T15:00:00Z" } },
    { name: "week", window: { duration: 1, timeUnit: "TIME_UNIT_WEEK" }, detail: { used: "6100", limit: "10000", resetTime: "2026-09-12T03:00:00Z" } },
    { name: "empty", window: { duration: 1, timeUnit: "TIME_UNIT_DAY" }, detail: {} },
  ],
  boosterWallet: null,
};

function memoryFs(files = {}) {
  const dirs = new Set();
  return {
    files, dirs,
    readFileSync: (path) => { if (!(path in files)) throw new Error("ENOENT"); return files[path]; },
    writeFileSync: (path, text) => { files[path] = text; },
    renameSync: (from, to) => { files[to] = files[from]; delete files[from]; },
    unlinkSync: (path) => { delete files[path]; },
    mkdirSync: (path) => { if (dirs.has(path)) throw new Error("EEXIST"); dirs.add(path); },
    statSync: (path) => ({ mtimeMs: dirs.has(path) ? NOW - 1000 : 0 }),
    rmSync: (path) => { dirs.delete(path); },
  };
}

const wire = (extra = {}) => JSON.stringify({ access_token: "old-access", refresh_token: "old-refresh", expires_at: Math.floor(NOW / 1000) - 60, scope: "kimi-code", token_type: "Bearer", expires_in: 3600, ...extra });

test("kimi's windows read as the same rows claude's do, the week from the week and the short one from the minutes", () => {
  assert.deepEqual(kimiLimitsFromUsages(USAGES), [
    { kind: "session", model: "", name: "5h", percent: 3, severity: "normal", resets_at: "2026-09-08T15:00:00Z" },
    { kind: "weekly_all", model: "", name: "week", percent: 61, severity: "normal", resets_at: "2026-09-12T03:00:00Z" },
  ]);
  assert.deepEqual(kimiLimitsFromUsages({ usage: { used: 10000, limit: 10000, resetTime: "2026-09-12T03:00:00Z" } }), [
    { kind: "weekly_all", model: "", name: "", percent: 100, severity: "exceeded", resets_at: "2026-09-12T03:00:00Z" },
  ]);
  assert.deepEqual(kimiLimitsFromUsages(null), []);
  assert.deepEqual(kimiLimitsFromUsages({ limits: [] }), []);
});

test("the plan's own week comes from the summary block, and a window that only says what is left is read from that", () => {
  const said = {
    usage: { limit: "100", used: "2", remaining: "98", resetTime: "2026-09-10T20:38:15Z" },
    limits: [{ window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" }, detail: { limit: "100", remaining: "37", resetTime: "2026-09-08T17:38:15Z" } }],
  };
  assert.deepEqual(kimiLimitsFromUsages(said), [
    { kind: "weekly_all", model: "", name: "", percent: 2, severity: "normal", resets_at: "2026-09-10T20:38:15Z" },
    { kind: "session", model: "", name: "", percent: 63, severity: "normal", resets_at: "2026-09-08T17:38:15Z" },
  ]);
});

test("any use at all shows as at least one percent, the way the CLI's own bar does", () => {
  assert.equal(kimiLimitsFromUsages({ usage: { used: 1, limit: 10000 } })[0].percent, 1);
  assert.equal(kimiLimitsFromUsages({ usage: { used: 0, limit: 10000 } })[0].percent, 0);
});

test("the region file picks the hosts, and an unknown region falls back to the mainland ones", () => {
  assert.equal(kimiHosts("global").baseUrl, "https://api.kimi.ai/coding/v1");
  assert.equal(kimiHosts("mainland-cn").oauthHost, "https://auth.kimi.com");
  assert.equal(kimiHosts("").oauthHost, "https://auth.kimi.com");
});

test("a token within a minute of dying counts as stale, one with no expiry never does", () => {
  const soon = { access_token: "a", expires_at: Math.floor(NOW / 1000) + 30 };
  assert.equal(kimiTokenIsFresh(soon, NOW), false);
  assert.equal(kimiTokenIsFresh({ access_token: "a", expires_at: Math.floor(NOW / 1000) + 3600 }, NOW), true);
  assert.equal(kimiTokenIsFresh({ access_token: "a", expires_at: 0 }, NOW), true);
  assert.equal(kimiTokenIsFresh(null, NOW), false);
});

test("a renewal posts the form the CLI posts, and writes the new token back in the CLI's own file shape", async () => {
  const fs = memoryFs({ "/k/credentials/kimi-code.json": wire() });
  const asked = [];
  const ask = async (url, init) => {
    asked.push([url, init]);
    return { ok: true, status: 200, json: async () => ({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 7200, scope: "kimi-code", token_type: "Bearer" }) };
  };
  const store = kimiFileStore("/k", { fs, now: () => NOW });
  const token = await freshKimiToken(store, { oauthHost: "https://auth.kimi.com", ask, now: NOW });
  assert.equal(token, "new-access");
  assert.equal(asked[0][0], "https://auth.kimi.com/api/oauth/token");
  assert.equal(asked[0][1].method, "POST");
  assert.equal(asked[0][1].body, new URLSearchParams({ client_id: KIMI_CLIENT_ID, grant_type: "refresh_token", refresh_token: "old-refresh" }).toString());
  const saved = JSON.parse(fs.files["/k/credentials/kimi-code.json"]);
  assert.deepEqual(saved, { access_token: "new-access", refresh_token: "new-refresh", expires_at: Math.floor(NOW / 1000) + 7200, scope: "kimi-code", token_type: "Bearer", expires_in: 7200 });
  assert.equal(fs.dirs.has("/k/oauth/kimi-code.lock"), false, "the lock is let go afterwards");
  assert.equal(Object.keys(fs.files).length, 1, "no temp file is left beside it");
});

test("a fresh token is used as it is, without a renewal or a write", async () => {
  const fs = memoryFs({ "/k/credentials/kimi-code.json": wire({ expires_at: Math.floor(NOW / 1000) + 3600 }) });
  const ask = async () => { throw new Error("should not be asked"); };
  assert.equal(await freshKimiToken(kimiFileStore("/k", { fs, now: () => NOW }), { oauthHost: "https://auth.kimi.com", ask, now: NOW }), "old-access");
});

test("a lock the CLI holds right now makes the hive wait its turn, a lock left behind by a dead CLI does not", async () => {
  const fs = memoryFs({ "/k/credentials/kimi-code.json": wire() });
  fs.dirs.add("/k/oauth/kimi-code.lock");
  fs.statSync = () => ({ mtimeMs: NOW - 1000 });
  const ask = async () => ({ ok: true, status: 200, json: async () => ({ access_token: "n", refresh_token: "r", expires_in: 100 }) });
  await assert.rejects(freshKimiToken(kimiFileStore("/k", { fs, now: () => NOW }), { oauthHost: "https://auth.kimi.com", ask, now: NOW }), /another kimi is renewing/);
  fs.statSync = () => ({ mtimeMs: NOW - 60000 });
  assert.equal(await freshKimiToken(kimiFileStore("/k", { fs, now: () => NOW }), { oauthHost: "https://auth.kimi.com", ask, now: NOW }), "n");
});

test("a refresh token the server refuses means the login is gone, and nothing is written over the file", async () => {
  const fs = memoryFs({ "/k/credentials/kimi-code.json": wire() });
  const ask = async () => ({ ok: false, status: 401, json: async () => ({ error: "invalid_grant", error_description: "refresh token revoked" }) });
  await assert.rejects(freshKimiToken(kimiFileStore("/k", { fs, now: () => NOW }), { oauthHost: "https://auth.kimi.com", ask, now: NOW }), KimiSessionGone);
  assert.equal(JSON.parse(fs.files["/k/credentials/kimi-code.json"]).access_token, "old-access");
  await assert.rejects(refreshKimiToken("x", { oauthHost: "https://auth.kimi.com", ask: async () => ({ ok: false, status: 503, json: async () => ({}) }) }), /503/);
});

test("each kimi login is asked on its own hosts with its own token, and a missing file reads as not signed in", async () => {
  const fs = memoryFs({ "/a/credentials/kimi-code.json": wire({ expires_at: Math.floor(NOW / 1000) + 3600 }) });
  const asked = [];
  const ask = async (url, init) => {
    asked.push([url, init.headers?.Authorization || ""]);
    return { ok: true, status: 200, json: async () => USAGES };
  };
  const rows = await kimiLimitsPerAccount({
    accounts: [{ name: "default", root: "/a", region: "global" }, { name: "spare", root: "/b", region: "mainland-cn" }],
    storeFor: (root) => kimiFileStore(root, { fs, now: () => NOW }), ask, now: () => NOW,
  });
  assert.deepEqual(asked, [["https://api.kimi.ai/coding/v1/usages", "Bearer old-access"]]);
  assert.equal(rows[0].provider, "kimi");
  assert.equal(rows[0].limits.length, 2);
  assert.deepEqual(rows[1], { account: "spare", provider: "kimi", signedIn: false, limits: [], error: "not signed in" });
});

test("a usage endpoint that says the session died reports it in words, and a refusal carries its wait", async () => {
  const fs = memoryFs({ "/a/credentials/kimi-code.json": wire({ expires_at: Math.floor(NOW / 1000) + 3600 }) });
  const gone = await kimiLimitsPerAccount({ accounts: [{ name: "default", root: "/a" }], storeFor: (root) => kimiFileStore(root, { fs, now: () => NOW }), ask: async () => ({ ok: false, status: 401, json: async () => ({}) }), now: () => NOW });
  assert.match(gone[0].error, /kimi login/);
  assert.equal(gone[0].signedIn, true);
  const busy = await kimiLimitsPerAccount({ accounts: [{ name: "default", root: "/a" }], storeFor: (root) => kimiFileStore(root, { fs, now: () => NOW }), ask: async () => ({ ok: false, status: 429, headers: { get: () => "30" }, json: async () => ({}) }), now: () => NOW });
  assert.ok(busy[0].until > 0);
  const waited = await kimiLimitsPerAccount({ accounts: [{ name: "default", root: "/a" }], storeFor: (root) => kimiFileStore(root, { fs, now: () => NOW }), ask: async () => { throw new Error("no"); }, now: () => NOW, waiting: () => NOW + 5000 });
  assert.equal(waited[0].until, NOW + 5000);
});

test("a kimi login at the wall is dry until its reset, like the others", () => {
  const rows = [{ account: "default", provider: "kimi", limits: kimiLimitsFromUsages({ usage: { used: 10000, limit: 10000, resetTime: new Date(Date.now() + 3600000).toISOString() } }) }];
  const dry = dryAccounts(rows);
  assert.equal(dry.length, 1);
  assert.match(dry[0].says, /week/);
});

test("the app asks kimi beside claude and codex, on the login's own folder and region, and marks its ledger", () => {
  assert.match(server, /kimiLimitsNow\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(server, /await markSpentAccounts\(rows, "kimi"\)/);
  assert.match(server, /function kimiRootOf\(dir\) \{\n  return dir \? providerEnvDir\("kimi", dir\) : providerHomeOf\(HOME, "kimi"\);/);
  assert.match(server, /region: kimiRegionOf\(root\)/);
  assert.match(server, /waiting: \(account\) => plans\.waiting\("kimi", account\)/);
});
