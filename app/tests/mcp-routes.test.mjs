import test from "node:test";
import assert from "node:assert/strict";
import { registerMcpRoutes } from "../routes/mcp.mjs";

function mcpHarness() {
  const routes = [];
  const mcpLogins = new Map();
  const starts = [];
  const serverCalls = [];
  registerMcpRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    bodyOf: async (req) => req.body,
    isSeatName: (name) => name === "cedro",
    mcpLogins,
    onTheServer: async (...args) => { serverCalls.push(args); return { ok: true }; },
    startMcpLogin: (...args) => { starts.push(args); return { state: "running", url: "" }; }
  });
  const call = async (method, body = {}, query = "") => {
    const route = routes.find((one) => one.path === "/api/mcp/login" && (one.method === null || one.method === method));
    const answers = [];
    await route.handler({ body }, {}, new URL(`http://hive/api/mcp/login${query}`), (value, status = 200) => answers.push({ value, status }));
    return answers;
  };
  return { routes, mcpLogins, starts, serverCalls, call };
}

test("MCP login registers POST before the method-agnostic status route", () => {
  const { routes } = mcpHarness();
  assert.deepEqual(routes.map(({ method, path }) => ({ method, path })), [
    { method: "POST", path: "/api/mcp/login" },
    { method: null, path: "/api/mcp/login" }
  ]);
});

test("MCP login validates the seat and server before starting on the requested side", async () => {
  const hive = mcpHarness();
  assert.deepEqual(await hive.call("POST", { name: "unknown", server: "figma" }), [
    { value: { error: "missing seat or server" }, status: 400 }
  ]);
  assert.deepEqual(await hive.call("POST", { name: "cedro", server: "figma", where: "cloud" }), [
    { value: { state: "running", url: "" }, status: 200 }
  ]);
  assert.deepEqual(await hive.call("POST", { name: "cedro", server: "linear", where: "somewhere" }), [
    { value: { state: "running", url: "" }, status: 200 }
  ]);
  assert.deepEqual(hive.starts, [
    ["cedro", "figma", "cloud"],
    ["cedro", "linear", "local"]
  ]);
});

test("a local MCP redirect is trimmed, capped and written into the running terminal", async () => {
  const hive = mcpHarness();
  const writes = [];
  hive.mcpLogins.set("cedro|figma", { state: "running", where: "local", child: { write: (value) => writes.push(value) } });
  const redirect = `  ${"x".repeat(2100)}  `;

  assert.deepEqual(await hive.call("POST", { name: "cedro", server: "figma", redirect }), [
    { value: { ok: true }, status: 200 }
  ]);
  assert.deepEqual(writes, [`${"x".repeat(2000)}\r`]);
});

test("a cloud MCP redirect is sent to its tmux auth session", async () => {
  const hive = mcpHarness();
  hive.mcpLogins.set("cedro|figma", { state: "running", where: "cloud" });

  assert.deepEqual(await hive.call("POST", { name: "cedro", server: "figma", redirect: " https://callback " }), [
    { value: { ok: true }, status: 200 }
  ]);
  assert.deepEqual(hive.serverCalls, [[
    'tmux send-keys -t "mcp-auth-$1" -l "$2"; tmux send-keys -t "mcp-auth-$1" Enter',
    ["cedro", "https://callback"],
    { timeout: 12000 }
  ]]);
});

test("MCP redirects require a running job and surface local terminal write errors", async () => {
  const hive = mcpHarness();
  assert.deepEqual(await hive.call("POST", { name: "cedro", server: "figma", redirect: "https://callback" }), [
    { value: { error: "no login waiting for a redirect url" }, status: 400 }
  ]);

  hive.mcpLogins.set("cedro|figma", { state: "running", where: "local", child: { write: () => { throw new Error("terminal closed"); } } });
  assert.deepEqual(await hive.call("POST", { name: "cedro", server: "figma", redirect: "https://callback" }), [
    { value: { error: "terminal closed" }, status: 500 }
  ]);
});

test("MCP status exposes only state, url and error, or none when absent", async () => {
  const hive = mcpHarness();
  hive.mcpLogins.set("cedro|figma", { state: "done", url: "https://login", error: "", child: "private", where: "local" });

  assert.deepEqual(await hive.call("GET", {}, "?name=cedro&server=figma"), [
    { value: { state: "done", url: "https://login", error: "" }, status: 200 }
  ]);
  assert.deepEqual(await hive.call("GET", {}, "?name=cedro&server=linear"), [
    { value: { state: "none" }, status: 200 }
  ]);
});
