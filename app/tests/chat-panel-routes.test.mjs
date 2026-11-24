import { test } from "node:test";
import assert from "node:assert/strict";
import { machineServers, parseListeners, seatServers, stopSeatServer } from "../lib/local-servers.mjs";
import { openCommand, openIn, openersHere } from "../lib/open-in.mjs";
import { registerChatPanelRoutes } from "../routes/chat-panel.mjs";

const LSOF = ["p101", "cnode", "f20", "n*:4173", "f21", "n127.0.0.1:9229", "p202", "cpython3", "n10.0.0.5:8000", "p303", "cnode", "n[::1]:5173", "n[::1]:5173"].join("\n");

test("the listener list keeps the ports a browser on this machine can reach, once each", () => {
  assert.deepEqual(parseListeners(LSOF), [
    { pid: 101, command: "node", port: 4173 },
    { pid: 303, command: "node", port: 5173 },
    { pid: 101, command: "node", port: 9229 }
  ]);
});

const table = async () => [
  { pid: 101, command: "node node_modules/.bin/vite", seat: "lote", hive: "/tmp/hive" },
  { pid: 303, command: "node server.js", seat: "other", hive: "/tmp/hive" },
  { pid: 404, command: "node /x/engine/driver.mjs --name lote", seat: "lote", hive: "/tmp/hive" },
  { pid: 505, command: "node dev.js", seat: "lote", hive: "/tmp/another-hive" }
];

const lsof = (out) => async (cmd, args) => ({ ok: true, out, cmd, args });

test("a chat's servers are the listeners its own processes opened, not another chat's and not the machinery", async () => {
  const calls = [];
  const run = async (cmd, args) => { calls.push([cmd, args]); return { ok: true, out: [LSOF, "p404", "cnode", "n*:7000"].join("\n") }; };
  const found = await seatServers("lote", { hive: "/tmp/hive", platform: "darwin", run, table });
  assert.deepEqual(found.map((one) => [one.pid, one.port]), [[101, 4173], [101, 9229]]);
  assert.equal(found[0].url, "http://localhost:4173");
  assert.equal(calls[0][0], "lsof");
  assert.ok(calls[0][1].includes("-p") && calls[0][1].at(-1) === "101", "lsof is asked only about the chat's own processes");
});

test("a chat with no process of its own has no server, and lsof is not even run", async () => {
  let ran = false;
  const found = await seatServers("nobody", { hive: "/tmp/hive", platform: "darwin", run: async () => { ran = true; return { ok: true, out: LSOF }; }, table });
  assert.deepEqual(found, []);
  assert.equal(ran, false);
});

test("Stop only kills a server this chat started", async () => {
  const killed = [];
  const kill = (pid, signal) => killed.push([pid, signal]);
  const options = { hive: "/tmp/hive", platform: "darwin", run: lsof(LSOF), table, kill };
  assert.deepEqual(await stopSeatServer("lote", 303, options), { error: "that server is not one this chat started" });
  assert.deepEqual(killed, []);
  assert.deepEqual(await stopSeatServer("lote", "101", options), { ok: true });
  assert.deepEqual(killed, [[101, "SIGTERM"]]);
});

test("the machine's servers are the ones that answer HTTP, with the page title", async () => {
  const fetchImpl = async (url) => {
    if (url.includes(":4173")) return { headers: new Map([["content-type", "text/html"]]), text: async () => "<html><title>Lotes</title></html>" };
    throw new Error("refused");
  };
  const found = await machineServers({ platform: "darwin", run: lsof(LSOF), fetchImpl });
  assert.deepEqual(found, [{ pid: 101, port: 4173, command: "node", title: "Lotes", url: "http://localhost:4173" }]);
});

test("only apps from the list can be opened, by their fixed name, with the chat folder as the one argument", () => {
  const exists = (path) => path === "/Applications/Cursor.app" || path === "/usr/local/bin/code";
  assert.deepEqual(openersHere({ platform: "darwin", exists }), [{ id: "cursor", name: "Cursor" }, { id: "finder", name: "Finder" }]);
  assert.deepEqual(openCommand("cursor", "/tmp/repo", { platform: "darwin", exists }), ["open", ["-a", "Cursor", "/tmp/repo"]]);
  assert.deepEqual(openCommand("finder", "/tmp/repo", { platform: "darwin", exists }), ["open", ["/tmp/repo"]]);
  assert.equal(openCommand("vscode", "/tmp/repo", { platform: "darwin", exists }), null, "an app that is not installed is refused");
  assert.equal(openCommand("; rm -rf /", "/tmp/repo", { platform: "darwin", exists }), null);
  assert.deepEqual(openCommand("vscode", "/tmp/repo", { platform: "linux", exists }), ["/usr/local/bin/code", ["/tmp/repo"]]);
});

test("open in refuses a chat without a folder and reports an app that did not open", async () => {
  assert.deepEqual(await openIn("finder", "", { platform: "darwin" }), { error: "this chat has no folder on this machine" });
  assert.deepEqual(await openIn("finder", "/tmp/repo", { platform: "darwin", run: async () => ({ ok: false }) }), { error: "the app did not open" });
});

function routes(seats) {
  const table = [];
  registerChatPanelRoutes((method, path, handler) => table.push({ method, path, handler }), {
    bodyOf: async (req) => req.body,
    isSeatName: (name) => /^[a-z0-9-]+$/.test(String(name || "")),
    seatOf: (name) => seats.find((one) => one.name === name) || null,
    folderOf: async () => "/tmp/repo",
    hive: "/tmp/hive"
  });
  return async (method, path, { query = "", body = null } = {}) => {
    const route = table.find((one) => one.method === method && one.path === path);
    let said = null;
    await route.handler({ body }, null, new URL(`http://hive${path}${query}`), (payload, status = 200) => { said = { payload, status }; });
    return said;
  };
}

test("the routes refuse an unknown chat, a bad name and a chat in the cloud", async () => {
  const call = routes([{ name: "cloudy", where: "cloud" }]);
  assert.equal((await call("POST", "/api/open-in", { body: { name: "../x", app: "finder" } })).status, 400);
  assert.equal((await call("POST", "/api/open-in", { body: { name: "ghost", app: "finder" } })).status, 404);
  assert.equal((await call("POST", "/api/open-in", { body: { name: "cloudy", app: "finder" } })).status, 409);
  assert.deepEqual((await call("GET", "/api/seat/servers", { query: "?name=cloudy" })).payload.servers, []);
  assert.equal((await call("POST", "/api/seat/servers/stop", { body: { name: "cloudy", pid: 1 } })).status, 409);
});
