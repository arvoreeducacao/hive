import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { KEYCHAIN_SERVICE, REFUSED_WAIT, accountConfigDir, accountsOnThisMachine, createPlanMemory, dryAccounts, askUsage, credentialsFile, keychainService, limitsFromUsage, limitsPerAccount, readToken, tightestAccount, waitUntil } from "../lib/limits.mjs";

const HIVE = "/home/someone/.hive";
const CLAUDE = "/home/someone/.claude";

const credentials = (token) => JSON.stringify({ claudeAiOauth: { accessToken: token } });

const answer = (limits) => ({
  ok: true,
  json: async () => ({ limits })
});

test("the default account keeps the plain keychain name and a named one is hashed by its config dir", () => {
  const dir = join(HIVE, "accounts", "acme");
  assert.equal(keychainService(""), KEYCHAIN_SERVICE);
  assert.equal(keychainService(dir), `${KEYCHAIN_SERVICE}-${createHash("sha256").update(dir).digest("hex").slice(0, 8)}`);
  assert.equal(accountConfigDir(HIVE, "default"), "");
  assert.equal(accountConfigDir(HIVE, "acme"), dir);
  assert.equal(credentialsFile("", CLAUDE), join(CLAUDE, ".credentials.json"));
  assert.equal(credentialsFile(join(HIVE, "accounts", "acme"), CLAUDE), join(HIVE, "accounts", "acme", ".credentials.json"));
});

test("the machine's accounts are the default one plus every folder under the hive, and a machine with none still has the default", async () => {
  const entries = [
    { name: "acme", isDirectory: () => true },
    { name: "spent.json", isDirectory: () => false },
    { name: "Not A Name", isDirectory: () => true }
  ];
  assert.deepEqual(await accountsOnThisMachine(HIVE, { list: async () => entries }), ["default", "acme"]);
  assert.deepEqual(await accountsOnThisMachine(HIVE, { list: async () => { throw new Error("no folder"); } }), ["default"]);
});

test("on a mac the token comes out of the keychain, which is the only place claude code writes it", async () => {
  const asked = [];
  const token = await readToken("", {
    claudeHome: CLAUDE,
    platform: "darwin",
    keychain: (service) => { asked.push(service); return credentials("from-the-keychain"); },
    readText: async () => { throw new Error("there is no file on a mac"); }
  });
  assert.equal(token, "from-the-keychain");
  assert.deepEqual(asked, [KEYCHAIN_SERVICE]);
});

test("a mac with no keychain entry still reads the file, and a machine that is not a mac never asks the keychain", async () => {
  let keychainAsked = 0;
  const fell = await readToken("", {
    claudeHome: CLAUDE,
    platform: "darwin",
    keychain: async () => { keychainAsked++; throw new Error("no such entry"); },
    readText: async (path) => (path === join(CLAUDE, ".credentials.json") ? credentials("from-the-file") : "")
  });
  assert.equal(fell, "from-the-file");
  assert.equal(keychainAsked, 1);

  const onLinux = await readToken("", {
    claudeHome: CLAUDE,
    platform: "linux",
    keychain: async () => { keychainAsked++; return credentials("never"); },
    readText: async () => credentials("from-the-file")
  });
  assert.equal(onLinux, "from-the-file");
  assert.equal(keychainAsked, 1);
});

test("a login that is not there comes back empty instead of throwing", async () => {
  const token = await readToken("", {
    claudeHome: CLAUDE,
    platform: "darwin",
    keychain: async () => { throw new Error("no such entry"); },
    readText: async () => { throw new Error("no such file"); }
  });
  assert.equal(token, "");
});

test("the three limits anthropic answers with keep their kind, their percent and the model they are scoped to", () => {
  const said = limitsFromUsage({
    limits: [
      { kind: "session", percent: 26.6, severity: "normal", resets_at: "2026-08-29T05:00:00Z", scope: null },
      { kind: "weekly_all", percent: 55, severity: "warning", resets_at: "2026-09-01T17:00:00Z", scope: null },
      { kind: "weekly_scoped", percent: 23, severity: "normal", resets_at: "", scope: { model: { display_name: "Fable" } } },
      { percent: 9 }
    ]
  });
  assert.deepEqual(said, [
    { kind: "session", model: "", percent: 27, severity: "normal", resets_at: "2026-08-29T05:00:00Z" },
    { kind: "weekly_all", model: "", percent: 55, severity: "warning", resets_at: "2026-09-01T17:00:00Z" },
    { kind: "weekly_scoped", model: "Fable", percent: 23, severity: "normal", resets_at: "" }
  ]);
  assert.deepEqual(limitsFromUsage(null), []);
});

test("the request carries the oauth bearer and the beta header, and a refusal is an error, not an empty list", async () => {
  const seen = [];
  const limits = await askUsage("a-token", {
    ask: async (url, how) => { seen.push([url, how.headers]); return answer([{ kind: "session", percent: 40 }]); }
  });
  assert.equal(limits.length, 1);
  assert.equal(seen[0][1].authorization, "Bearer a-token");
  assert.equal(seen[0][1]["anthropic-beta"], "oauth-2025-04-20");

  await assert.rejects(
    () => askUsage("a-token", { ask: async () => ({ ok: false, status: 401 }) }),
    /401/
  );
});

test("every account on the machine is asked, and one that fails does not take the others with it", async () => {
  const rows = await limitsPerAccount({
    home: HIVE,
    claudeHome: CLAUDE,
    accounts: ["default", "acme", "never-signed-in"],
    platform: "darwin",
    keychain: async (service) => {
      if (service === KEYCHAIN_SERVICE) return credentials("default-token");
      if (service === keychainService(join(HIVE, "accounts", "acme"))) return credentials("acme-token");
      throw new Error("no such entry");
    },
    readText: async () => { throw new Error("no file"); },
    ask: async (url, how) =>
      how.headers.authorization === "Bearer default-token"
        ? answer([{ kind: "session", percent: 27 }, { kind: "weekly_all", percent: 55 }])
        : { ok: false, status: 500 }
  });

  assert.deepEqual(rows.map((row) => row.account), ["default", "acme", "never-signed-in"]);
  assert.equal(rows[0].limits.length, 2);
  assert.deepEqual(rows[1].limits, []);
  assert.match(rows[1].error, /500/);
  assert.equal(rows[2].error, "not signed in");
});

test("the account with the least room comes first, and the model-scoped limit never decides it", () => {
  const roomy = { account: "default", limits: [{ kind: "session", percent: 27 }, { kind: "weekly_all", percent: 55 }] };
  const dry = { account: "acme", limits: [{ kind: "session", percent: 100 }, { kind: "weekly_all", percent: 77 }] };
  const scoped = { account: "third", limits: [{ kind: "session", percent: 10 }, { kind: "weekly_scoped", percent: 99, model: "Fable" }] };
  assert.equal(tightestAccount([roomy, dry, scoped]).account, "acme");
  assert.equal(tightestAccount([roomy, scoped]).account, "default");
  assert.equal(tightestAccount([{ account: "nobody", limits: [] }]), null);
  assert.equal(tightestAccount([]), null);
});

test("an account at 100% is handed to the rotation with the hour it comes back", () => {
  const now = Date.parse("2026-08-28T22:00:00Z");
  const dry = dryAccounts([
    { account: "default", limits: [{ kind: "session", percent: 34, resets_at: "2026-08-29T05:00:00Z" }] },
    { account: "acme", limits: [
      { kind: "session", percent: 100, resets_at: "2026-08-29T04:00:00Z" },
      { kind: "weekly_all", percent: 77, resets_at: "2026-08-30T17:00:00Z" }
    ] }
  ], { now });
  assert.deepEqual(dry.map((one) => one.account), ["acme"]);
  assert.equal(dry[0].until, Date.parse("2026-08-29T04:00:00Z"));
  assert.match(dry[0].says, /five-hour window/);
});

test("a login out of both windows only comes back when the later one does", () => {
  const now = Date.parse("2026-08-28T22:00:00Z");
  const [dry] = dryAccounts([
    { account: "acme", limits: [
      { kind: "session", percent: 100, resets_at: "2026-08-29T04:00:00Z" },
      { kind: "weekly_all", percent: 100, resets_at: "2026-08-30T17:00:00Z" }
    ] }
  ], { now });
  assert.equal(dry.until, Date.parse("2026-08-30T17:00:00Z"));
  assert.match(dry.says, /five-hour window and its week/);
});

test("an hour that has already passed is not handed over, so nobody parks the fleet on a login that is back", () => {
  const now = Date.parse("2026-08-29T06:00:00Z");
  assert.deepEqual(dryAccounts([
    { account: "acme", limits: [{ kind: "session", percent: 100, resets_at: "2026-08-29T04:00:00Z" }] }
  ], { now }), []);
});

test("a full window with no hour on it is still handed over, and the rotation waits for a real refusal", () => {
  const [dry] = dryAccounts([
    { account: "acme", limits: [{ kind: "session", percent: 100, resets_at: "" }] }
  ]);
  assert.equal(dry.until, 0);
});

test("the model-scoped week never dries an account, and 99% is not dry", () => {
  assert.deepEqual(dryAccounts([
    { account: "acme", limits: [
      { kind: "session", percent: 99, resets_at: "2026-08-29T04:00:00Z" },
      { kind: "weekly_scoped", percent: 100, model: "Fable", resets_at: "2026-08-30T17:00:00Z" }
    ] }
  ]), []);
});


const refusal = (status, retryAfter = "") => ({
  ok: false, status,
  headers: { get: (name) => (name.toLowerCase() === "retry-after" ? retryAfter : null) },
  json: async () => ({})
});

test("a refused ask carries the moment the endpoint said to come back", async () => {
  const now = Date.parse("2026-08-29T10:00:00Z");
  await assert.rejects(
    () => askUsage("t", { ask: async () => refusal(429, "3280"), now }),
    (wrong) => wrong.until === now + 3280 * 1000 && /answered 429/.test(wrong.message)
  );
});

test("a refusal with no retry-after still waits, and an ordinary failure does not", async () => {
  const now = Date.parse("2026-08-29T10:00:00Z");
  await assert.rejects(() => askUsage("t", { ask: async () => refusal(503), now }), (wrong) => wrong.until === now + REFUSED_WAIT);
  await assert.rejects(() => askUsage("t", { ask: async () => refusal(401), now }), (wrong) => !wrong.until);
  assert.equal(waitUntil({ headers: { get: () => "Sat, 29 Aug 2026 11:00:00 GMT" } }, now), Date.parse("2026-08-29T11:00:00Z"));
});

test("a login inside its wait is not asked at all, so the app stops feeding the refusal", async () => {
  let asked = 0;
  const how = {
    home: "/h", claudeHome: "/h/.claude", accounts: ["default", "acme"],
    platform: "linux", readText: async () => JSON.stringify({ claudeAiOauth: { accessToken: "t" } }),
    ask: async () => { asked += 1; return { ok: true, status: 200, json: async () => ({ limits: [{ kind: "session", percent: 4 }] }) }; },
    waiting: (account) => (account === "acme" ? Date.parse("2026-08-29T11:00:00Z") : 0)
  };
  const rows = await limitsPerAccount(how);
  assert.equal(asked, 1, "only the login that is not waiting is asked");
  assert.deepEqual(rows[1], { account: "acme", signedIn: true, limits: [], until: Date.parse("2026-08-29T11:00:00Z"), error: "" });
  assert.equal(rows[0].signedIn, true);
});

test("a login nobody signed into is marked as such instead of looking like a failure", async () => {
  const rows = await limitsPerAccount({
    home: "/h", claudeHome: "/h/.claude", accounts: ["default"],
    platform: "linux", readText: async () => { throw new Error("no file"); }
  });
  assert.deepEqual(rows, [{ account: "default", signedIn: false, limits: [], error: "not signed in" }]);
});

test("a login that goes quiet keeps the numbers it last gave, stamped with when they were read", () => {
  let wall = Date.parse("2026-08-29T10:00:00Z");
  const plans = createPlanMemory({ now: () => wall });
  const answered = [{ provider: "claude", account: "acme", signedIn: true, limits: [{ kind: "session", percent: 12 }] }];
  assert.deepEqual(plans.remember(answered), answered, "a fresh answer passes straight through");

  wall += 60000;
  const quiet = plans.remember([{ provider: "claude", account: "acme", signedIn: true, limits: [], until: wall + 3600000 }]);
  assert.deepEqual(quiet[0].limits, [{ kind: "session", percent: 12 }]);
  assert.equal(quiet[0].stale, Date.parse("2026-08-29T10:00:00Z"));
  assert.equal(plans.waiting("claude", "acme"), wall + 3600000);
});

test("the wait is over once its moment passes, and a login that signs out is forgotten", () => {
  let wall = Date.parse("2026-08-29T10:00:00Z");
  const plans = createPlanMemory({ now: () => wall });
  plans.remember([{ provider: "claude", account: "acme", signedIn: true, limits: [{ kind: "session", percent: 12 }] }]);
  plans.remember([{ provider: "claude", account: "acme", signedIn: true, limits: [], until: wall + 1000 }]);
  assert.equal(plans.waiting("claude", "acme"), wall + 1000);
  wall += 2000;
  assert.equal(plans.waiting("claude", "acme"), 0);

  const out = plans.remember([{ provider: "claude", account: "acme", signedIn: false, limits: [], error: "not signed in" }]);
  assert.deepEqual(out[0].limits, [], "nothing is remembered for a login that is gone");
  const back = plans.remember([{ provider: "claude", account: "acme", signedIn: true, limits: [] }]);
  assert.deepEqual(back[0].limits, []);
});

test("two agents with a login of the same name are remembered apart", () => {
  const plans = createPlanMemory();
  plans.remember([
    { provider: "claude", account: "default", signedIn: true, limits: [{ kind: "session", percent: 5 }] },
    { provider: "codex", account: "default", signedIn: true, limits: [{ kind: "weekly_all", percent: 60 }] }
  ]);
  const quiet = plans.remember([
    { provider: "claude", account: "default", signedIn: true, limits: [] },
    { provider: "codex", account: "default", signedIn: true, limits: [] }
  ]);
  assert.deepEqual(quiet.map((row) => row.limits[0].percent), [5, 60]);
});
