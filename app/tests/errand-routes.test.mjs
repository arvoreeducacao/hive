import test from "node:test";
import assert from "node:assert/strict";
import { registerErrandRoutes } from "../routes/errands.mjs";

function errandHarness() {
  const routes = new Map();
  const calls = { renamed: [], seen: [], read: [], archived: [] };
  let cache = { at: 45, data: {} };
  let renamed = { moved: 2 };
  let seen = { seen: { request: 77 } };
  let errands = {};
  let sessions = [];
  let archiveError = "";

  registerErrandRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    renameErrand: (...args) => { calls.renamed.push(args); return renamed; },
    markSeen: (...args) => { calls.seen.push(args); return seen; },
    HIVE_HOME: "/hive/home",
    invalidateCollectionCache: () => { cache.at = 0; },
    now: () => 77,
    readErrands: (home) => { calls.read.push(home); return errands; },
    liveSessions: () => sessions,
    archiveSeat: async (...args) => {
      if (archiveError) throw new Error(archiveError);
      calls.archived.push(args);
      return { ok: true };
    }
  });

  const call = async (path, body = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}`), json);
    return answers;
  };

  return {
    routes,
    calls,
    get cache() { return cache; },
    call,
    setRenamed: (value) => { renamed = value; },
    setSeen: (value) => { seen = value; },
    setCache: (value) => { cache = value; },
    setErrands: (value) => { errands = value; },
    setSessions: (value) => { sessions = value; },
    setArchiveError: (value) => { archiveError = value; }
  };
}

test("the errand room registers rename and seen as POST routes", () => {
  const { routes } = errandHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/errands/keep", "POST"],
    ["/api/errands/rename", "POST"],
    ["/api/errands/seen", "POST"]
  ]);
});

test("keeping one chat of a race archives the others that are still up, and refuses a stranger", async () => {
  const hive = errandHarness();
  const race = {
    "login-1": { errand: "fix the login", asked: "", at: 1, endedAt: 0, prs: [], race: 3 },
    "login-2": { errand: "fix the login", asked: "", at: 1, endedAt: 0, prs: [], race: 3 },
    "login-3": { errand: "fix the login", asked: "", at: 1, endedAt: 5, prs: [], race: 3 },
    "other": { errand: "another thing", asked: "", at: 1, endedAt: 0, prs: [] }
  };
  hive.setErrands(race);
  hive.setSessions([{ name: "login-1", where: "local" }, { name: "login-2", where: "cloud" }, { name: "other", where: "local" }]);

  const stranger = await hive.call("/api/errands/keep", { errand: "fix the login", seat: "other" });
  assert.deepEqual(stranger, [{ value: { error: "that chat is not part of this request" }, status: 400 }]);
  assert.deepEqual(hive.calls.archived, []);

  const kept = await hive.call("/api/errands/keep", { errand: "fix the login", seat: "login-1" });
  assert.deepEqual(kept, [{ value: { ok: true, kept: "login-1", archived: ["login-2"], failed: [] }, status: 200 }]);
  assert.deepEqual(hive.calls.archived, [["login-2", "cloud"]], "the ended seat and the other request are left alone");
  assert.equal(hive.cache.at, 0);

  hive.setArchiveError("gone already");
  const broken = await hive.call("/api/errands/keep", { errand: "fix the login", seat: "login-1" });
  assert.deepEqual(broken[0].value.failed, [{ name: "login-2", error: "gone already" }]);
});

test("rename preserves validation errors and invalidates collection only after success", async () => {
  const hive = errandHarness();
  hive.setRenamed({ error: "no request" });
  const failed = await hive.call("/api/errands/rename", { from: "old", to: "new" });
  assert.deepEqual(hive.calls.renamed, [["/hive/home", "old", "new"]]);
  assert.deepEqual(failed, [{ value: { error: "no request" }, status: 400 }]);
  assert.equal(hive.cache.at, 45);

  hive.setRenamed({ moved: 3 });
  const moved = await hive.call("/api/errands/rename", { from: "old", to: "new" });
  assert.deepEqual(moved, [{ value: { ok: true, moved: 3 }, status: 200 }]);
  assert.equal(hive.cache.at, 0);
});

test("seen passes the current time and invalidates collection only after success", async () => {
  const hive = errandHarness();
  hive.setSeen({ error: "nothing to mark" });
  const failed = await hive.call("/api/errands/seen", { errand: "" });
  assert.deepEqual(hive.calls.seen, [["/hive/home", "", 77]]);
  assert.deepEqual(failed, [{ value: { error: "nothing to mark" }, status: 400 }]);
  assert.equal(hive.cache.at, 45);

  hive.setSeen({ seen: { request: 77 } });
  const done = await hive.call("/api/errands/seen", { errand: "request" });
  assert.deepEqual(hive.calls.seen[1], ["/hive/home", "request", 77]);
  assert.deepEqual(done, [{ value: { ok: true }, status: 200 }]);
  assert.equal(hive.cache.at, 0);
});

test("successful writes invalidate the current collection cache after it is replaced", async () => {
  const hive = errandHarness();
  const oldCache = hive.cache;
  hive.setCache({ at: 90, data: {} });
  await hive.call("/api/errands/rename", { from: "old", to: "new" });
  assert.equal(oldCache.at, 45);
  assert.equal(hive.cache.at, 0);
});
