import { readsOnly, wakesTheSeat, answerWhileAsleep } from "../engine/seat-memory.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sayGate, answerHold } from "../engine/protocol.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");

function slice(from, to) {
  const a = driver.indexOf(from);
  const b = driver.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of driver.mjs`);
  return driver.slice(a, b);
}

function bench(session, { gate = sayGate(), reopened = [] } = {}) {
  const source = `
    let currentModel = "";
    let chosenModel = "";
    let effortLevel = "";
    const options = {};
    let sleeping = false;
    let watched = false;
    const backgroundTasks = new Map();
    const armSleep = () => {};
    const sleepAfter = () => 0;
    const sessionRereadsMcp = () => reopened.push("reopened");
    ${slice("function handleCommand(cmd, reply)", "const server = createSeatServer")}
    return { handleCommand };
  `;
  const make = new Function(
    "emit", "gate", "dispatchSay", "sayEvent", "dismissNote", "pendingQuestions", "session", "name", "seq", "sessionId",
    "persistSession", "peerSayText", "expecting", "sessionStore", "side", "ensureAwake",
    "staleInterrupt", "eventsTrouble",
    "readsOnly", "wakesTheSeat", "answerWhileAsleep", "reopened",
    source
  );
  const built = make(
    () => {}, gate, () => {}, () => {}, () => {}, new Map(),
    session, "seat", 0, "", () => {},
    () => "", answerHold({ deliver: () => {} }), { meta: {} }, "local", () => {}, () => false, { broken: false },
    readsOnly, wakesTheSeat, answerWhileAsleep, reopened
  );
  return (cmd) => new Promise((done) => built.handleCommand(cmd, done));
}

const CONNECTED = [{ name: "360dialog", status: "connected", tools: ["get_balance"] }];
const STILL_OUT = [{ name: "360dialog", status: "needs-auth", tools: [] }];

test("the seat reconnects the server that was just authenticated, and answers with what it sees now", async () => {
  const asked = [];
  const ask = bench({
    reconnectMcpServer: async (server) => { asked.push(server); },
    mcpServerStatus: async () => CONNECTED
  });
  const reply = await ask({ type: "control", op: "mcpReconnect", server: "360dialog" });
  assert.deepEqual(asked, ["360dialog"]);
  assert.equal(reply.ok, true);
  assert.equal(reply.data[0].status, "connected");
});

test("a server that comes back still shut out is reported as it is, not as success", async () => {
  const ask = bench({
    reconnectMcpServer: async () => {},
    mcpServerStatus: async () => STILL_OUT
  });
  const reply = await ask({ type: "control", op: "mcpReconnect", server: "360dialog" });
  assert.equal(reply.ok, true);
  assert.equal(reply.data[0].status, "needs-auth");
});

test("a reconnect that throws reaches the person with what it said", async () => {
  const ask = bench({
    reconnectMcpServer: async () => { throw new Error("no MCP server named 360dialog"); },
    mcpServerStatus: async () => CONNECTED
  });
  const reply = await ask({ type: "control", op: "mcpReconnect", server: "360dialog" });
  assert.equal(reply.ok, false);
  assert.match(reply.error, /no MCP server named/);
});

test("reinit stays for what it is for, and never stands in for the reconnect", async () => {
  const done = [];
  const ask = bench({
    reinitialize: async () => { done.push("reinit"); return {}; },
    reconnectMcpServer: async () => { done.push("reconnect"); },
    mcpServerStatus: async () => CONNECTED
  });
  await ask({ type: "control", op: "mcpReconnect", server: "360dialog" });
  assert.deepEqual(done, ["reconnect"]);
});

test("a server the seat never loaded is picked up by reopening the conversation with the tools read again", async () => {
  const reopened = [];
  const ask = bench({ mcpServerStatus: async () => CONNECTED }, { reopened });
  const reply = await ask({ type: "control", op: "mcpReload" });
  assert.deepEqual(reopened, ["reopened"]);
  assert.equal(reply.ok, true);
  assert.equal(reply.data[0].status, "connected");
});

test("a seat mid-turn is not reopened underneath the turn", async () => {
  const reopened = [];
  const gate = sayGate();
  gate.push({ text: "oi", images: [] });
  const ask = bench({ mcpServerStatus: async () => CONNECTED }, { gate, reopened });
  const reply = await ask({ type: "control", op: "mcpReload" });
  assert.equal(reply.ok, false);
  assert.deepEqual(reopened, []);
});
