import test from "node:test";
import assert from "node:assert/strict";
import { registerAccountRoutes } from "../routes/accounts.mjs";

function accountHarness() {
  const routes = new Map();
  const calls = [];
  let effort = async () => "high";
  let catalog = async (agent) => [`${agent}-model`];
  let accounts = async () => [{ name: "default", loggedIn: true }, { name: "second", loggedIn: false }];
  let ledger = async () => ({ default: { cost: 7 } });
  let account = async (action, data) => ({ ok: true, action, name: data.name });

  registerAccountRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    settingsEffort: () => effort(),
    agentCatalog: (agent) => catalog(agent),
    readAccounts: () => accounts(),
    readLedger: (home) => { calls.push(["ledger", home]); return ledger(home); },
    hiveHome: "/home/dev/.hive",
    noteBack: (home, name) => { calls.push(["back", home, name]); return Promise.resolve(); },
    invalidateAccountCache: () => calls.push(["invalidate"]),
    runAccount: (action, data) => { calls.push(["account", action, data]); return account(action, data); }
  });

  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}${query}`), json);
    return answers;
  };

  return {
    routes,
    calls,
    call,
    setEffort: (next) => { effort = next; },
    setCatalog: (next) => { catalog = next; },
    setAccounts: (next) => { accounts = next; },
    setLedger: (next) => { ledger = next; },
    setAccount: (next) => { account = next; }
  };
}

test("the account room registers its four existing paths and methods", () => {
  const { routes } = accountHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/effort", null],
    ["/api/catalog", null],
    ["/api/accounts", null],
    ["/api/account", "POST"]
  ]);
});

test("effort and catalog keep their success and fallback payloads", async () => {
  const hive = accountHarness();
  assert.deepEqual(await hive.call("/api/effort"), [{ value: { effort: "high" }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/catalog", { query: "?agent=codex" }), [{ value: { agent: "codex", models: ["codex-model"] }, status: 200 }]);

  hive.setEffort(async () => { throw new Error("settings unavailable"); });
  hive.setCatalog(async () => { throw "driver unavailable"; });
  assert.deepEqual(await hive.call("/api/effort"), [{ value: { effort: "", error: "settings unavailable" }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/catalog"), [{ value: { agent: "claude", models: [], error: "driver unavailable" }, status: 200 }]);
});

test("accounts join spending in parallel and tolerate an unreadable ledger", async () => {
  const hive = accountHarness();
  const listed = await hive.call("/api/accounts");
  assert.deepEqual(listed, [{ value: {
    accounts: [
      { name: "default", loggedIn: true, spent: { cost: 7 } },
      { name: "second", loggedIn: false, spent: null }
    ],
    oldCli: false
  }, status: 200 }]);
  assert.deepEqual(hive.calls, [["ledger", "/home/dev/.hive"]]);

  hive.setAccounts(async () => []);
  hive.setLedger(async () => { throw new Error("missing ledger"); });
  assert.deepEqual(await hive.call("/api/accounts"), [{ value: { accounts: [], oldCli: true }, status: 200 }]);
});

test("a login mark on an account that answers signed in is dropped, not painted", async () => {
  const hive = accountHarness();
  hive.setAccounts(async () => [{ name: "default", loggedIn: true }, { name: "second", loggedIn: false }]);
  hive.setLedger(async () => ({ default: { until: 0, why: "login" }, second: { until: 0, why: "login" } }));
  const listed = await hive.call("/api/accounts");
  assert.deepEqual(listed[0].value.accounts, [
    { name: "default", loggedIn: true, spent: null },
    { name: "second", loggedIn: false, spent: { until: 0, why: "login" } }
  ]);
  assert.deepEqual(hive.calls, [["ledger", "/home/dev/.hive"], ["back", "/home/dev/.hive", "default"]]);
});

test("a mark that is not about the login survives an account that is signed in", async () => {
  const hive = accountHarness();
  const until = Date.now() + 60 * 60 * 1000;
  hive.setAccounts(async () => [{ name: "default", loggedIn: true }]);
  hive.setLedger(async () => ({ default: { until, why: "limit" } }));
  const listed = await hive.call("/api/accounts");
  assert.deepEqual(listed[0].value.accounts, [{ name: "default", loggedIn: true, spent: { until, why: "limit" } }]);
  assert.deepEqual(hive.calls, [["ledger", "/home/dev/.hive"]]);
});

test("account actions invalidate first and preserve errors and action coercion", async () => {
  const hive = accountHarness();
  const body = { action: 12, name: "second" };
  assert.deepEqual(await hive.call("/api/account", { body }), [{ value: { ok: true, action: "12", name: "second" }, status: 200 }]);
  assert.deepEqual(hive.calls, [["invalidate"], ["account", "12", body]]);

  hive.setAccount(async () => { throw new Error("x".repeat(220)); });
  const failed = await hive.call("/api/account", { body: {} });
  assert.equal(failed[0].status, 400);
  assert.equal(failed[0].value.error, "x".repeat(200));
  assert.deepEqual(hive.calls.slice(-2).map((call) => call.slice(0, 2)), [["invalidate"], ["account", ""]]);
});
