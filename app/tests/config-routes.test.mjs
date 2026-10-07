import test from "node:test";
import assert from "node:assert/strict";
import { registerConfigRoutes } from "../routes/config.mjs";

function configHarness() {
  const routes = [];
  const writes = [];
  let reads = 0;
  registerConfigRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    bodyOf: async (req) => req.body,
    readConfig: async () => { reads++; return { config: { language: "en" }, file: "~/.hive/config.jsonc" }; },
    writeConfig: async (patch) => { writes.push(patch); return { config: patch, migrated: "" }; },
    shotsUsage: async () => ({ chats: 2, files: 5, bytes: 1024 })
  });
  const call = async (method, body = {}) => {
    const route = routes.find((one) => one.path === "/api/config" && (one.method === null || one.method === method));
    const answers = [];
    await route.handler({ body }, {}, new URL("http://hive/api/config"), (value, status = 200) => answers.push({ value, status }));
    return answers;
  };
  return { routes, writes, reads: () => reads, call };
}

test("config registers POST before its method-agnostic read route", () => {
  const { routes } = configHarness();
  assert.deepEqual(routes.map(({ method, path }) => ({ method, path })), [
    { method: "POST", path: "/api/config" },
    { method: null, path: "/api/config" },
    { method: null, path: "/api/shots/usage" }
  ]);
});

test("the shots usage route hands over what the server measured", async () => {
  const { routes } = configHarness();
  const route = routes.find((one) => one.path === "/api/shots/usage");
  const answers = [];
  await route.handler({}, {}, new URL("http://hive/api/shots/usage"), (value, status = 200) => answers.push({ value, status }));
  assert.deepEqual(answers, [{ value: { chats: 2, files: 5, bytes: 1024 }, status: 200 }]);
});

test("GET config returns the current configuration", async () => {
  const hive = configHarness();
  assert.deepEqual(await hive.call("GET"), [
    { value: { config: { language: "en" }, file: "~/.hive/config.jsonc" }, status: 200 }
  ]);
  assert.equal(hive.reads(), 1);
  assert.deepEqual(hive.writes, []);
});

test("POST config writes only the config field from the request body", async () => {
  const hive = configHarness();
  const config = { language: "pt-BR", calm: true };
  assert.deepEqual(await hive.call("POST", { config, ignored: true }), [
    { value: { config, migrated: "" }, status: 200 }
  ]);
  assert.deepEqual(hive.writes, [config]);
  assert.equal(hive.reads(), 0);
});
