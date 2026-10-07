import test from "node:test";
import assert from "node:assert/strict";
import { registerThreadRoutes } from "../routes/threads.mjs";

function threadHarness() {
  const routes = new Map();
  const calls = [];
  const deleted = [];
  const sessions = [{ name: "arventueira", threads: ["https://acme.slack.com/thread"] }];
  let registry = [];
  let file = { ok: true, kind: "image/png", bytes: Buffer.from("image") };

  registerThreadRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    liveSessions: () => sessions,
    threadKey: (link) => String(link || "").includes("slack.com") ? "C01:1000.000001" : "",
    threadCache: { delete: (key) => deleted.push(key) },
    collectThreads: async (...args) => { calls.push(["collect", ...args]); return [{ key: "C01:1000.000001" }]; },
    readThreadRegistry: async () => structuredClone(registry),
    writeThreadRegistry: async (next) => { registry = structuredClone(next); },
    replyOnSlack: async (...args) => { calls.push(["reply", ...args]); return { ok: true, kind: "reply" }; },
    reactOnSlack: async (...args) => { calls.push(["react", ...args]); return { ok: true, kind: "react" }; },
    markOnSlack: async (...args) => { calls.push(["read", ...args]); return { ok: true, kind: "read" }; },
    slackFileOut: async (...args) => { calls.push(["file", ...args]); return file; },
    now: () => new Date("2026-08-31T20:00:00.000Z")
  });

  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const writes = [];
    const ended = [];
    const json = (value, status = 200) => answers.push({ value, status });
    const res = {
      writeHead: (status, headers) => writes.push({ status, headers }),
      end: (value) => ended.push(value)
    };
    await routes.get(path).handler({ body }, res, new URL(`http://hive${path}${query}`), json);
    return { answers, writes, ended };
  };

  return {
    routes,
    calls,
    deleted,
    call,
    registry: () => registry,
    seed: (next) => { registry = structuredClone(next); },
    setFile: (next) => { file = next; }
  };
}

test("the thread room registers every existing path with the same methods", () => {
  const { routes } = threadHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/threads", null],
    ["/api/threads/register", "POST"],
    ["/api/threads/reply", "POST"],
    ["/api/threads/react", "POST"],
    ["/api/threads/read", "POST"],
    ["/api/threads/file", null]
  ]);
});

test("thread collection keeps the live sessions and polling ages", async () => {
  const hive = threadHarness();
  const open = await hive.call("/api/threads");
  const close = await hive.call("/api/threads", { query: "?close=1" });
  assert.deepEqual(open.answers[0].value, { threads: [{ key: "C01:1000.000001" }] });
  assert.deepEqual(close.answers[0].value, { threads: [{ key: "C01:1000.000001" }] });
  assert.deepEqual(hive.calls.map((call) => [call[0], call[2]]), [["collect", 45000], ["collect", 8000]]);
  assert.strictEqual(hive.calls[0][1], hive.calls[1][1]);
});

test("thread registration validates, persists and invalidates exactly once", async () => {
  const hive = threadHarness();
  const invalid = await hive.call("/api/threads/register", { body: { url: "not slack" } });
  assert.deepEqual(invalid.answers, [{ value: { error: "send the link of a Slack thread" }, status: 400 }]);

  const registered = await hive.call("/api/threads/register", { body: { url: "https://acme.slack.com/thread", session: "arventueira" } });
  assert.deepEqual(registered.answers, [{ value: { ok: true, key: "C01:1000.000001" }, status: 200 }]);
  assert.deepEqual(hive.registry(), [{
    key: "C01:1000.000001",
    link: "https://acme.slack.com/thread",
    session: "arventueira",
    at: "2026-08-31T20:00:00.000Z"
  }]);
  assert.deepEqual(hive.deleted, ["C01:1000.000001"]);

  hive.seed([{ key: "C01:1000.000001", link: "old", session: "" }]);
  await hive.call("/api/threads/register", { body: { url: "https://acme.slack.com/new", session: "seat" } });
  assert.deepEqual(hive.registry(), [{ key: "C01:1000.000001", link: "old", session: "seat" }]);
});

test("reply, reaction and read pass the body through unchanged", async () => {
  const hive = threadHarness();
  await hive.call("/api/threads/reply", { body: { key: "thread", text: "hello" } });
  await hive.call("/api/threads/react", { body: { key: "thread", ts: "2", name: "eyes" } });
  await hive.call("/api/threads/react", { body: { key: "thread", ts: "2", name: "eyes", on: false } });
  await hive.call("/api/threads/read", { body: { key: "thread", ts: "3" } });
  assert.deepEqual(hive.calls, [
    ["reply", "thread", "hello"],
    ["react", "thread", "2", "eyes", true],
    ["react", "thread", "2", "eyes", false],
    ["read", "thread", "3"]
  ]);
});

test("thread files keep the binary response and the fixed not-found response", async () => {
  const hive = threadHarness();
  const found = await hive.call("/api/threads/file", { query: "?id=F1&whole=1" });
  assert.deepEqual(hive.calls, [["file", "F1", true]]);
  assert.deepEqual(found.writes, [{ status: 200, headers: { "content-type": "image/png", "cache-control": "private, max-age=600" } }]);
  assert.deepEqual(found.ended, [Buffer.from("image")]);

  hive.setFile({ ok: false, error: "gone" });
  const missing = await hive.call("/api/threads/file", { query: "?id=F2" });
  assert.deepEqual(missing.answers, [{ value: { error: "gone" }, status: 404 }]);
});
