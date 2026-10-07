import test from "node:test";
import assert from "node:assert/strict";
import { registerFilesRoutes } from "../routes/files.mjs";

function filesHarness(overrides = {}) {
  const routes = [];
  const calls = [];
  const context = {
    bodyOf: async (req) => req.body,
    isSeatName: (name) => name === "seat",
    seatFiles: async (name, where) => {
      calls.push(["seatFiles", name, where]);
      return ["src/alpha.mjs", "README.md"];
    },
    rankFiles: (files, query) => {
      calls.push(["rankFiles", files, query]);
      return files.slice(0, 1);
    },
    fileIndex: async (where, force) => {
      calls.push(["fileIndex", where, force]);
      return [{ repo: "repo", path: "src/alpha.mjs" }];
    },
    indexCache: new Map([["cloud", { at: 42 }]]),
    rankIndex: (rows, query, limit) => {
      calls.push(["rankIndex", rows, query, limit]);
      return rows;
    },
    searchCode: async (asked) => {
      calls.push(["searchCode", asked]);
      return { hits: [{ repo: "repo", path: "src/alpha.mjs", line: 2 }], total: 1 };
    },
    writeRepoFile: async (asked) => {
      calls.push(["writeRepoFile", asked]);
      return { ok: true };
    },
    readRepoFile: async (asked) => {
      calls.push(["readRepoFile", asked]);
      return { text: "one\ntwo" };
    },
    languageOf: (path) => path.endsWith(".mjs") ? "javascript" : "",
    paintLines: (text, language) => [`${language}:${text}`],
    now: (() => {
      const times = [100, 125];
      return () => times.shift();
    })(),
    ...overrides
  };
  registerFilesRoutes((method, path, handler) => routes.push({ method, path, handler }), context);

  async function call(path, { method = "GET", body } = {}) {
    const url = new URL(path, "http://hive");
    const route = routes.find((candidate) => candidate.path === url.pathname && (candidate.method === null || candidate.method === method));
    const answers = [];
    await route.handler({ method, body }, {}, url, (value, status = 200) => answers.push({ value, status }));
    return answers;
  }

  return { routes, calls, call };
}

test("file routes keep the server's methods and POST ordering", () => {
  const { routes } = filesHarness();
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [
    [null, "/api/files"],
    [null, "/api/index"],
    [null, "/api/code"],
    ["POST", "/api/file"],
    [null, "/api/file"]
  ]);
});

test("files validates the seat, normalizes the machine, ranks, and contains lookup failures", async () => {
  const hive = filesHarness();
  assert.deepEqual(await hive.call("/api/files?name=missing"), [{ value: { error: "unknown session" }, status: 400 }]);

  assert.deepEqual(await hive.call("/api/files?name=seat&where=cloud&q=alpha"), [{
    value: { files: ["src/alpha.mjs"] },
    status: 200
  }]);
  assert.deepEqual(hive.calls, [
    ["seatFiles", "seat", "cloud"],
    ["rankFiles", ["src/alpha.mjs", "README.md"], "alpha"]
  ]);

  const failed = filesHarness({ seatFiles: async () => { throw new Error("x".repeat(200)); } });
  const [{ value }] = await failed.call("/api/files?name=seat");
  assert.deepEqual(value.files, []);
  assert.equal(value.error.length, 160);
});

test("index and code retain query coercion, timing, cache stamp, and machine tags", async () => {
  const hive = filesHarness();
  assert.deepEqual(await hive.call("/api/index?where=cloud&force=1&limit=100&q=alpha"), [{
    value: {
      where: "cloud",
      total: 1,
      at: 42,
      files: [{ repo: "repo", path: "src/alpha.mjs", where: "cloud" }]
    },
    status: 200
  }]);
  assert.deepEqual(hive.calls.slice(0, 2), [
    ["fileIndex", "cloud", true],
    ["rankIndex", [{ repo: "repo", path: "src/alpha.mjs" }], "alpha", 60]
  ]);

  assert.deepEqual(await hive.call("/api/code?where=elsewhere&q=Alpha&glob=*.mjs"), [{
    value: {
      hits: [{ repo: "repo", path: "src/alpha.mjs", line: 2, where: "local" }],
      total: 1,
      where: "local",
      ms: 25
    },
    status: 200
  }]);
  assert.deepEqual(hive.calls.at(-1), ["searchCode", { q: "Alpha", where: "local", glob: "*.mjs" }]);
});

test("POST file rejects oversized bodies and preserves write arguments and status", async () => {
  const hive = filesHarness();
  assert.deepEqual(await hive.call("/api/file", { method: "POST", body: { oversized: true } }), [{
    value: { error: "too big to save" },
    status: 413
  }]);
  assert.equal(hive.calls.length, 0);

  const writes = [];
  const refused = filesHarness({
    writeRepoFile: async (asked) => {
      writes.push(asked);
      return { error: "no" };
    }
  });
  assert.deepEqual(await refused.call("/api/file", {
    method: "POST",
    body: { repo: 7, path: null, where: "cloud", text: "hello" }
  }), [{ value: { error: "no" }, status: 400 }]);
  assert.deepEqual(writes, [{ repo: "7", path: "", where: "cloud", text: "hello" }]);
});

test("GET file preserves errors, metadata, and the highlighted preview window", async () => {
  const missing = filesHarness({ readRepoFile: async () => ({ error: "gone" }) });
  assert.deepEqual(await missing.call("/api/file?repo=repo&path=gone.mjs"), [{ value: { error: "gone" }, status: 404 }]);

  const hive = filesHarness();
  assert.deepEqual(await hive.call("/api/file?where=cloud&repo=repo&path=src/a.mjs&at=10&preview=1"), [{
    value: {
      text: "",
      language: "javascript",
      lines: 2,
      size: 7,
      from: 2,
      preview: ["javascript:two"]
    },
    status: 200
  }]);
  assert.deepEqual(hive.calls.at(-1), ["readRepoFile", { repo: "repo", path: "src/a.mjs", where: "cloud" }]);
});
