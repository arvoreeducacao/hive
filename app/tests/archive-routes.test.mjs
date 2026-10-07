import test from "node:test";
import assert from "node:assert/strict";
import { registerArchiveRoutes } from "../routes/archive.mjs";

function archiveHarness() {
  const routes = [];
  const calls = [];
  let suggestion = "pull";
  registerArchiveRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    scanHistory: async (asked) => { calls.push(["scan", asked]); return { sessions: ["one"] }; },
    searchArchive: async (asked) => { calls.push(["search", asked]); return [{ id: "abc", hit: "aquele bug" }]; },
    previewSession: async (asked) => { calls.push(["preview", asked]); return { preview: asked.id }; },
    runSessionSync: async () => ({ ran: true }),
    configureSessionSync: async (asked) => { calls.push(["configure", asked]); return { repo: asked.repo }; },
    bodyOf: async (req) => req.body,
    localSyncState: () => "ready",
    existsSync: (path) => path === "/sync-engine",
    syncEngine: () => "/sync-engine",
    getSyncSuggestion: () => suggestion,
    syncStatus: async () => ({ local: "ready", cloud: "ready" }),
    bringLocal: async (asked) => { calls.push(["bring", asked]); return { brought: asked.id }; },
    reviveSession: async (asked) => {
      calls.push(["revive", asked]);
      if (asked.id === "bad") throw new Error("bad session id");
      return { revived: asked.id };
    }
  });
  const call = async (method, path, { body = {}, query = "" } = {}) => {
    const route = routes.find((candidate) => candidate.method === method && candidate.path === path);
    const answers = [];
    await route.handler({ body }, {}, new URL(`http://hive${path}${query}`), (value, status = 200) => answers.push({ value, status }));
    return answers;
  };
  return { routes, calls, call, setSuggestion: (value) => { suggestion = value; } };
}

test("archive routes keep the original method and path pairs, plus the deep search", () => {
  const { routes } = archiveHarness();
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [
    [null, "/api/archive"],
    [null, "/api/archive/search"],
    [null, "/api/archive/preview"],
    ["POST", "/api/session-sync/run"],
    ["POST", "/api/session-sync"],
    [null, "/api/session-sync"],
    ["POST", "/api/bring-local"],
    ["POST", "/api/revive"]
  ]);
});

test("archive preview and write routes pass the original request shapes", async () => {
  const hive = archiveHarness();
  assert.deepEqual(await hive.call(null, "/api/archive"), [{ value: { sessions: ["one"] }, status: 200 }]);
  assert.deepEqual(await hive.call(null, "/api/archive/preview", { query: "?id=abc&where=cloud" }), [{ value: { preview: "abc" }, status: 200 }]);
  assert.deepEqual(await hive.call(null, "/api/archive/search", { query: "?q=webview" }), [{ value: { found: [{ id: "abc", hit: "aquele bug" }] }, status: 200 }]);
  assert.deepEqual(await hive.call("POST", "/api/session-sync", { body: { repo: "owner/sessions" } }), [{ value: { repo: "owner/sessions" }, status: 200 }]);
  assert.deepEqual(await hive.call("POST", "/api/bring-local", { body: { id: "abc" } }), [{ value: { brought: "abc" }, status: 200 }]);
  assert.deepEqual(hive.calls, [
    ["scan", { fresh: false }],
    ["preview", { id: "abc", where: "cloud" }],
    ["search", "webview"],
    ["configure", { repo: "owner/sessions" }],
    ["bring", { id: "abc" }]
  ]);
});

/* the panel is handed the last snapshot and told a scan is running, which is the
   right trade when it opens. It is the wrong one for the sync button, whose whole
   promise is that the list was rebuilt — so that caller asks for it fresh, and the
   route has to carry the ask through. */
test("the archive can be asked for a scan instead of the snapshot", async () => {
  const hive = archiveHarness();
  await hive.call(null, "/api/archive", { query: "?fresh=1" });
  await hive.call(null, "/api/archive", { query: "?fresh=0" });
  await hive.call(null, "/api/archive");
  assert.deepEqual(hive.calls, [["scan", { fresh: true }], ["scan", { fresh: false }], ["scan", { fresh: false }]]);
});

test("session sync fast state stays live and ordinary state probes both sides", async () => {
  const hive = archiveHarness();
  assert.deepEqual(await hive.call(null, "/api/session-sync", { query: "?fast=1" }), [{
    value: { local: "ready", cloud: "probing", engine: true, suggestion: "pull" },
    status: 200
  }]);
  hive.setSuggestion("push");
  assert.equal((await hive.call(null, "/api/session-sync", { query: "?fast=1" }))[0].value.suggestion, "push");
  assert.deepEqual(await hive.call(null, "/api/session-sync"), [{ value: { local: "ready", cloud: "ready" }, status: 200 }]);
  assert.deepEqual(await hive.call("POST", "/api/session-sync/run"), [{ value: { ran: true }, status: 200 }]);
});

test("archive action failures retain their message and 400 status", async () => {
  const hive = archiveHarness();
  assert.deepEqual(await hive.call("POST", "/api/revive", { body: { id: "bad" } }), [{ value: { error: "bad session id" }, status: 400 }]);
});
