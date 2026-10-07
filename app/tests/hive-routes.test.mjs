import test from "node:test";
import assert from "node:assert/strict";
import { registerHiveRoutes } from "../routes/hive.mjs";

test("the hive route returns the collected fleet for every method", async () => {
  const routes = [];
  const seen = { sessions: [{ name: "cedro" }], at: "now" };
  let collections = 0;
  registerHiveRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    collect: async () => { collections++; return seen; }
  });

  assert.deepEqual(routes.map(({ method, path }) => ({ method, path })), [{ method: null, path: "/api/hive" }]);
  const answers = [];
  await routes[0].handler({}, {}, new URL("http://hive/api/hive"), (value, status = 200) => answers.push({ value, status }));

  assert.equal(collections, 1);
  assert.deepEqual(answers, [{ value: seen, status: 200 }]);
});
