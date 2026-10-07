import test from "node:test";
import assert from "node:assert/strict";
import { registerWorktreeRoutes } from "../routes/worktrees.mjs";

function worktreeHarness(overrides = {}) {
  const routes = [];
  const calls = [];
  const context = {
    bodyOf: async (req) => req.body,
    worktreeReport: async (asked) => {
      calls.push(["worktreeReport", asked]);
      return { worktrees: [] };
    },
    removeWorktree: async (path, force) => {
      calls.push(["removeWorktree", path, force]);
      return { ok: true };
    },
    sweepWorktrees: async (hours) => {
      calls.push(["sweepWorktrees", hours]);
      return { removed: [] };
    },
    idleHours: 1,
    ...overrides
  };
  registerWorktreeRoutes((method, path, handler) => routes.push({ method, path, handler }), context);

  async function call(path, { method = "GET", body } = {}) {
    const url = new URL(path, "http://hive");
    const route = routes.find((candidate) => candidate.path === url.pathname && (candidate.method === null || candidate.method === method));
    const answers = [];
    await route.handler({ method, body }, {}, url, (value, status = 200) => answers.push({ value, status }));
    return answers;
  }

  return { routes, calls, call };
}

test("worktree routes retain one read route and two POST routes", () => {
  const { routes } = worktreeHarness();
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [
    [null, "/api/worktrees"],
    ["POST", "/api/worktrees/remove"],
    ["POST", "/api/worktrees/sweep"]
  ]);
});

test("worktree report preserves force and idle-hour fallbacks", async () => {
  const hive = worktreeHarness();
  assert.deepEqual(await hive.call("/api/worktrees?force=1&hours=12"), [{ value: { worktrees: [] }, status: 200 }]);
  assert.deepEqual(hive.calls.at(-1), ["worktreeReport", { force: true, hours: 12 }]);

  await hive.call("/api/worktrees?hours=0");
  assert.deepEqual(hive.calls.at(-1), ["worktreeReport", { force: false, hours: 1 }]);
});

test("worktree removal coerces its body and uses the operation's error status", async () => {
  const removals = [];
  const hive = worktreeHarness({
    removeWorktree: async (path, force) => {
      removals.push([path, force]);
      return { error: "dirty" };
    }
  });
  assert.deepEqual(await hive.call("/api/worktrees/remove", {
    method: "POST",
    body: { path: null, force: "yes" }
  }), [{ value: { error: "dirty" }, status: 400 }]);
  assert.deepEqual(removals, [["", true]]);
});

test("worktree sweep preserves numeric coercion and the default idle hours", async () => {
  const hive = worktreeHarness();
  assert.deepEqual(await hive.call("/api/worktrees/sweep", { method: "POST", body: { hours: "8" } }), [{
    value: { removed: [] },
    status: 200
  }]);
  assert.deepEqual(hive.calls.at(-1), ["sweepWorktrees", 8]);

  await hive.call("/api/worktrees/sweep", { method: "POST", body: { hours: "nope" } });
  assert.deepEqual(hive.calls.at(-1), ["sweepWorktrees", 1]);
});
