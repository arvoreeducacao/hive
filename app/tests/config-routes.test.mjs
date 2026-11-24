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
    { method: null, path: "/api/shots/usage" },
    { method: "POST", path: "/api/themes/agent" },
    { method: null, path: "/api/themes/agent" }
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

function agentHarness(config) {
  const routes = [];
  const writes = [];
  registerConfigRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    bodyOf: async (req) => req.body,
    readConfig: async () => ({ config }),
    writeConfig: async (patch) => { writes.push(patch); return { config: { ...config, ...patch } }; },
    shotsUsage: async () => ({})
  });
  const call = async (method, body) => {
    const route = routes.find((one) => one.path === "/api/themes/agent" && (one.method === null || one.method === method));
    const answers = [];
    await route.handler({ body }, {}, new URL("http://hive/api/themes/agent"), (value) => answers.push(value));
    return answers[0];
  };
  return { writes, call };
}

test("an agent's theme is saved with the others and worn at once", async () => {
  const hive = agentHarness({ theme: "Nord", appearance: "fixed", themeLight: "Bonsai Light", themes: { Mine: { ui: { bg: "#101010" }, terminal: {} } } });
  const said = await hive.call("POST", { name: "Nightfall", canvas: "#1A1B26", accent: "#7AA2F7", css: ".sv-user { border-radius: 2px; }" });
  assert.equal(said.ok, true);
  assert.equal(said.wearing, "Nightfall");
  assert.equal(hive.writes.length, 1);
  assert.deepEqual(Object.keys(hive.writes[0].themes), ["Mine", "Nightfall"]);
  assert.equal(hive.writes[0].themes.Nightfall.by, "agent");
  assert.equal(hive.writes[0].themes.Nightfall.css, ".sv-user { border-radius: 2px; }");
  assert.equal(hive.writes[0].theme, "Nightfall");
});

test("a theme whose css would load a file is refused and nothing is written", async () => {
  const hive = agentHarness({ theme: "Hive", themes: {} });
  const said = await hive.call("POST", { name: "Leaky", canvas: "#000000", accent: "#FF0000", css: "[data-x] { background: url(https://example.com/x) }" });
  assert.match(said.error, /url\(\)/);
  assert.deepEqual(hive.writes, []);
});

test("the agent reads the guide and the themes before it restyles", async () => {
  const hive = agentHarness({ theme: "Hive", appearance: "fixed", themes: { Nightfall: { ui: { bg: "#1A1B26" }, terminal: {}, css: "a{}", by: "agent" } } });
  const said = await hive.call("GET");
  assert.equal(said.current.theme, "Hive");
  assert.ok(said.builtIn.includes("Hive"));
  assert.deepEqual(said.yours, [{ name: "Nightfall", by: "agent", hasCss: true, light: false }]);
  assert.ok(said.selectors.some((line) => line.startsWith("#rail")));
  assert.ok(said.rules.some((line) => line.includes("data:")));
});
