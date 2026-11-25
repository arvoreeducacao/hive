import { test } from "node:test";
import assert from "node:assert/strict";
import { closeLeftovers } from "../lib/settle-terminals.mjs";

const seat = { name: "lote", where: "local", trees: [] };

function world({ foreground = {}, servers = [], refused = [] } = {}) {
  const calls = { closed: [], stopped: [] };
  return {
    calls,
    deps: {
      tiedShells: (chat) => (chat === "lote" ? [{ name: "sh-a", where: "local", of: "lote" }, { name: "sh-b", where: "local", of: "lote" }, { name: "sh-c", where: "local", of: "lote" }] : []),
      foregroundOf: async (name) => (name in foreground ? { known: true, program: foreground[name] } : { known: false, program: "" }),
      closeShell: async (shell) => { calls.closed.push(shell.name); },
      seatServers: async () => servers,
      stopServer: async (chat, pid) => { calls.stopped.push([chat, pid]); return refused.includes(pid) ? { error: "no" } : { ok: true }; }
    }
  };
}

test("a settled chat closes the terminals waiting at the prompt and leaves the ones running a program", async () => {
  const { calls, deps } = world({ foreground: { "sh-a": "", "sh-b": "node" }, servers: [{ pid: 7, port: 4173 }] });
  const said = await closeLeftovers(seat, deps);
  assert.deepEqual(said, { closed: ["sh-a"], stopped: [] });
  assert.deepEqual(calls.closed, ["sh-a"], "a terminal the tmux could not read (sh-c) is left alone");
  assert.deepEqual(calls.stopped, [], "the servers keep running with the setting off");
});

test("with the setting on, the terminals running a program close and the chat's servers stop", async () => {
  const { calls, deps } = world({ foreground: { "sh-a": "", "sh-b": "node" }, servers: [{ pid: 7, port: 4173 }, { pid: 8, port: 5173 }], refused: [8] });
  const said = await closeLeftovers(seat, { ...deps, stopRunning: true });
  assert.deepEqual(calls.closed, ["sh-a", "sh-b"]);
  assert.deepEqual(calls.stopped, [["lote", 7], ["lote", 8]]);
  assert.deepEqual(said.stopped, [4173], "only the server that stopped is counted");
});

test("a chat on the server or without a name is left alone", async () => {
  const { calls, deps } = world({ foreground: { "sh-a": "" } });
  assert.deepEqual(await closeLeftovers({ ...seat, where: "cloud" }, { ...deps, stopRunning: true }), { closed: [], stopped: [] });
  assert.deepEqual(await closeLeftovers({}, deps), { closed: [], stopped: [] });
  assert.deepEqual(calls.closed, []);
});
