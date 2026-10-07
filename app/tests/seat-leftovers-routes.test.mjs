import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSeatRoutes, worktreesToDrop } from "../routes/seats.mjs";

function harness() {
  const routes = new Map();
  const calls = [];
  const spawning = new Map([["n1", { id: "n1", name: "alpha", where: "local", settled: true }]]);
  registerSeatRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    isSeatName: (name) => /^[a-z0-9-]+$/.test(String(name || "")),
    killSeatWindow: async (name, where) => { calls.push(["kill", name, where]); return { ok: true }; },
    seatLeftovers: async (name) => { calls.push(["leftovers", name]); return { processes: [{ pid: 7, command: "next dev", etime: "10:00", cpu: "0:01.00" }], worktrees: [{ path: "/w/a", held: "" }] }; },
    removeWorktree: async (path, force) => { calls.push(["drop", path, force]); return path === "/w/locked" ? { error: "it still holds work nobody kept" } : { ok: true, path }; },
    historyClosedSeat: (where, name) => calls.push(["history", where, name]),
    forgetSeat: (where, name) => calls.push(["forget", where, name]),
    forgetShots: async (name) => calls.push(["shots", name]),
    spawning,
    invalidateFleetCache: () => calls.push(["invalidate"])
  });
  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}${query}`), json);
    return answers[0];
  };
  return { call, calls, spawning };
}

test("the dialog asks the server what a seat would leave behind, by name, and the route is a POST like the rest of the seat room", async () => {
  const { call, calls } = harness();
  const said = await call("/api/seat/leftovers", { body: { name: "alpha" } });
  assert.equal(said.status, 200);
  assert.equal(said.value.processes[0].command, "next dev");
  assert.deepEqual(calls, [["leftovers", "alpha"]]);
  assert.equal((await call("/api/seat/leftovers", { body: { name: "../x" } })).status, 400);
});

test("closing a seat drops the worktrees the dialog agreed to, after the window is gone, and says which ones refused", async () => {
  const { call, calls, spawning } = harness();
  const said = await call("/api/kill", { body: { name: "alpha", where: "local", dropWorktrees: [{ path: "/w/a" }, { path: "/w/locked", force: false }, "/w/b", "relative", 5] } });
  assert.equal(said.status, 200);
  assert.deepEqual(said.value.worktrees, [
    { path: "/w/a", ok: true, error: "" },
    { path: "/w/locked", ok: false, error: "it still holds work nobody kept" },
    { path: "/w/b", ok: true, error: "" }
  ]);
  assert.deepEqual(calls[0], ["kill", "alpha", "local"]);
  assert.equal(spawning.size, 0, "the closed chat came back as an opening card that no close could take down");
  assert.ok(calls.findIndex((one) => one[0] === "drop") > calls.findIndex((one) => one[0] === "invalidate"), "the worktrees go after the seat is closed and forgotten");
  assert.deepEqual(calls.filter((one) => one[0] === "drop"), [["drop", "/w/a", false], ["drop", "/w/locked", false], ["drop", "/w/b", false]]);
});

test("a cloud seat never drops a worktree on this machine, and a close with nothing to drop answers exactly as before", async () => {
  const { call, calls } = harness();
  const cloud = await call("/api/kill", { body: { name: "alpha", where: "cloud", dropWorktrees: [{ path: "/w/a" }] } });
  assert.deepEqual(cloud.value, { ok: true });
  assert.equal(calls.some((one) => one[0] === "drop"), false);
  const plain = await call("/api/kill", { body: { name: "beta", where: "local" } });
  assert.deepEqual(plain.value, { ok: true }, "a close with nothing to drop answers exactly as before");
});

test("only absolute paths are taken, and force is a boolean the caller has to mean", () => {
  assert.deepEqual(worktreesToDrop([{ path: "/w/a", force: "yes" }, "/w/b", { path: "w/c" }, null, { force: true }]), [{ path: "/w/a", force: true }, { path: "/w/b", force: false }]);
  assert.deepEqual(worktreesToDrop("nope"), []);
});
