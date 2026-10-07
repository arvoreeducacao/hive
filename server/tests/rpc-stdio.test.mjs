import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRpcClient } from "../engine/rpc-stdio.mjs";

const FAKE_SERVER = `
const lines = [];
let buf = "";
const send = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
process.stdin.on("data", (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === "initialize") { send({ id: m.id, result: { userAgent: "fake" } }); continue; }
    if (m.method === "initialized") { send({ method: "thread/started", params: { thread: { id: "t1" } } }); send({ id: 77, method: "item/tool/requestUserInput", params: { itemId: "q1" } }); continue; }
    if (m.id === 77) { send({ method: "answered", params: m.result }); continue; }
    if (m.method === "refuse") { send({ id: m.id, error: { code: -32600, message: "nope" } }); continue; }
    if (m.method === "slow") { continue; }
    if (m.method === "die") { process.stderr.write("2026-01-01T00:00:00Z ERROR x: it broke\\n"); process.exit(3); }
    send({ id: m.id, result: { echo: m.params } });
  }
});
`;

function fakeServer() {
  return spawn(process.execPath, ["-e", FAKE_SERVER], { stdio: ["pipe", "pipe", "pipe"] });
}

test("rpc-stdio: responses match by id and server requests are answered by the handler", async () => {
  const notes = [];
  const child = fakeServer();
  const client = createRpcClient({
    child,
    onNotification: (method, params) => notes.push({ method, params }),
    onRequest: async (method, params) => ({ answers: { [params.itemId]: { answers: ["Blue"] } } }),
  });
  const init = await client.request("initialize", { clientInfo: { name: "test" } });
  assert.equal(init.userAgent, "fake");
  client.notify("initialized", {});
  const echo = await client.request("ping", { a: 1 });
  assert.deepEqual(echo, { echo: { a: 1 } });
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(notes.some((n) => n.method === "thread/started" && n.params.thread.id === "t1"));
  const answered = notes.find((n) => n.method === "answered");
  assert.deepEqual(answered.params, { answers: { q1: { answers: ["Blue"] } } });
  client.close();
});

test("rpc-stdio: an error reply rejects with the server's message", async () => {
  const child = fakeServer();
  const client = createRpcClient({ child });
  await assert.rejects(client.request("refuse", {}), /nope/);
  client.close();
});

test("rpc-stdio: a request that never gets an answer times out", async () => {
  const child = fakeServer();
  const client = createRpcClient({ child });
  await assert.rejects(client.request("slow", {}, { timeoutMs: 120 }), /no answer/);
  assert.equal(client.pending, 0);
  client.close();
});

test("rpc-stdio: when the process dies the pending requests fail with the last stderr line and onExit fires", async () => {
  const child = fakeServer();
  let exited = null;
  const stderr = [];
  const client = createRpcClient({ child, onExit: (code, signal, said) => { exited = { code, said }; }, onStderr: (l) => stderr.push(l) });
  const hanging = client.request("slow", {}, { timeoutMs: 5000 });
  client.notify("die", {});
  await assert.rejects(hanging, /it broke/);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(exited.code, 3);
  assert.match(exited.said, /it broke/);
  assert.equal(client.alive, false);
  assert.ok(stderr.length >= 1);
  await assert.rejects(client.request("ping", {}), /gone/);
});
