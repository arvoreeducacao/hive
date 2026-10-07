import test from "node:test";
import assert from "node:assert/strict";
import { registerUsageRoutes } from "../routes/usage.mjs";

function usageHarness() {
  const routes = new Map();
  const forcedLimits = [];
  let invalidations = 0;
  let usage = { total: 12 };
  let accounts = [{ account: "default" }, { account: "tight" }];
  let tightest = accounts[1];
  registerUsageRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    invalidateUsage: () => { invalidations++; },
    readUsage: async () => usage,
    readClaudeLimits: async (force) => { forcedLimits.push(force); return accounts; },
    tightestAccount: () => tightest
  });
  const call = async (path, query = "") => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({}, {}, new URL(`http://hive${path}${query}`), json);
    return answers;
  };
  return {
    routes,
    forcedLimits,
    call,
    invalidations: () => invalidations,
    setUsage: (value) => { usage = value; },
    setAccounts: (value) => { accounts = value; },
    setTightest: (value) => { tightest = value; }
  };
}

test("usage routes keep their paths and read-only methods", () => {
  const { routes } = usageHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/usage", null],
    ["/api/limits", null]
  ]);
});

test("usage invalidates only when force is present and returns the reader result", async () => {
  const hive = usageHarness();
  hive.setUsage({ total: 20, computing: false });
  assert.deepEqual(await hive.call("/api/usage"), [{ value: { total: 20, computing: false }, status: 200 }]);
  assert.equal(hive.invalidations(), 0);
  await hive.call("/api/usage", "?force=1");
  assert.equal(hive.invalidations(), 1);
});

test("limits passes the force flag through and names the tightest account", async () => {
  const hive = usageHarness();
  assert.deepEqual(await hive.call("/api/limits", "?force=1"), [{
    value: { accounts: [{ account: "default" }, { account: "tight" }], tightest: "tight" },
    status: 200
  }]);
  assert.deepEqual(hive.forcedLimits, [true]);

  hive.setAccounts([]);
  hive.setTightest(null);
  assert.deepEqual(await hive.call("/api/limits"), [{ value: { accounts: [], tightest: "" }, status: 200 }]);
  assert.deepEqual(hive.forcedLimits, [true, false]);
});
