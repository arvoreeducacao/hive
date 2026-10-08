import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemorySource, memoryListQuery, memoryPatch, cleanMemoryId, cleanWeeks, MEMORY_TOKEN_KEY } from "../lib/memories.mjs";
import { createDemoLogin, createMemoryLogin, memoryClientStore } from "../lib/memory-login.mjs";
import { memoryVault } from "../lib/memory-vault.mjs";
import { registerMemoryRoutes } from "../routes/memories.mjs";

const LIST = { memories: [{ id: "m1", title: "Deploy da API só dispara por push na main", repo: "api", origin: "automatica", retrieved_count: 23 }] };

function upstream(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init?.headers?.authorization || "" });
    const next = script.length > 1 ? script.shift() : script[0];
    if (next instanceof Error) throw next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { calls, fetchImpl };
}

function clock(start = 1_790_000_000_000) {
  const box = { at: start };
  return { now: () => box.at, step: (ms) => { box.at += ms; } };
}

test("the list goes to the memory server with the read token as a bearer, and comes back shaped", async () => {
  const { calls, fetchImpl } = upstream([{ status: 200, body: LIST }]);
  const source = createMemorySource({ baseUrl: "https://memory.example/", readToken: () => "read-only-token", fetchImpl });
  const said = await source.list({ status: "active", repo: "api", q: "deploy" });
  assert.equal(said.state, "ok");
  assert.equal(said.demo, false);
  assert.equal(said.source, "memory.example");
  assert.deepEqual(said.memories, LIST.memories);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://memory.example/api/memories?status=active&repo=api&q=deploy");
  assert.equal(calls[0].auth, "Bearer read-only-token");
});

test("with no token the server is never asked, and the panel learns which key is missing", async () => {
  const { calls, fetchImpl } = upstream([{ status: 200, body: LIST }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: async () => "", fetchImpl });
  const said = await source.list({});
  assert.equal(said.state, "no-token");
  assert.equal(said.key, MEMORY_TOKEN_KEY);
  assert.equal(said.memories, undefined);
  assert.equal(calls.length, 0);
});

test("a refused token reads as refused, not as a server that is down", async () => {
  const { fetchImpl } = upstream([{ status: 401, body: {} }]);
  const said = await createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "old", fetchImpl }).list({});
  assert.equal(said.state, "refused");
});

test("an answer is reused for a short while, then asked again", async () => {
  const time = clock();
  const { calls, fetchImpl } = upstream([{ status: 200, body: LIST }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "t", fetchImpl, now: time.now, freshFor: 30000 });
  await source.list({ status: "active" });
  await source.list({ status: "active" });
  assert.equal(calls.length, 1, "the second ask inside the window is served from the cache");
  time.step(30001);
  await source.list({ status: "active" });
  assert.equal(calls.length, 2);
  source.forget();
  await source.list({ status: "active" });
  assert.equal(calls.length, 3, "forget drops the cache for a retry");
});

test("when the server stops answering, the last list it gave is handed back with its time", async () => {
  const time = clock();
  const { fetchImpl } = upstream([{ status: 200, body: LIST }, new Error("connect ECONNREFUSED"), { status: 502, body: {} }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "t", fetchImpl, now: time.now, freshFor: 0 });
  const first = await source.list({ status: "active" });
  time.step(60000);
  const down = await source.list({ status: "active" });
  assert.equal(down.state, "down");
  assert.equal(down.keptAt, first.at);
  assert.deepEqual(down.memories, LIST.memories);
  assert.match(down.why, /ECONNREFUSED/);
  const again = await source.list({ status: "active" });
  assert.equal(again.state, "down");
  assert.equal(again.why, "HTTP 502");
  const other = await source.list({ status: "archived" });
  assert.equal(other.state, "down");
  assert.equal(other.memories, undefined, "a list never fetched has nothing kept to show");
  assert.equal(other.keptAt, null);
});

test("routes the memory server does not have yet fall back to sample data, and say so", async () => {
  const { calls, fetchImpl } = upstream([{ status: 404, body: {} }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "t", fetchImpl });
  const list = await source.list({ status: "active" });
  assert.equal(list.state, "ok");
  assert.equal(list.demo, true);
  assert.ok(list.memories.length > 10);
  assert.ok(list.memories.every((one) => one.status === "active" && !("content" in one)), "the list carries no body, like the real one");
  const stats = await source.stats(12);
  assert.equal(stats.demo, true);
  assert.equal(stats.stats.weekly.length, 12);
  assert.equal(calls.length, 1, "once the routes are known to be missing, nobody asks again");
});

test("a missing route is asked again after five minutes, and a real answer leaves the sample", async () => {
  const time = clock();
  const { calls, fetchImpl } = upstream([{ status: 404, body: {} }, { status: 200, body: LIST }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "t", fetchImpl, now: time.now });
  assert.equal((await source.list({ status: "active" })).demo, true);
  time.step(4 * 60 * 1000);
  assert.equal((await source.list({ status: "active" })).demo, true);
  assert.equal(calls.length, 1);
  time.step(60 * 1000);
  const back = await source.list({ status: "active" });
  assert.equal(back.demo, false);
  assert.deepEqual(back.memories, LIST.memories);
  assert.equal(calls.length, 2);
});

test("a signed-in write never lands in the sample, and a missing write route is an error", async () => {
  const { fetchImpl } = upstream([{ status: 404, body: {} }]);
  const { calls, login } = writer([{ status: 404, body: {} }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "t", fetchImpl, login });
  const list = await source.list({ status: "active" });
  assert.equal(list.demo, true);
  const id = list.memories[0].id;
  const said = await source.write(id, "edit", { title: "Título novo" });
  assert.deepEqual(said, { state: "unsupported" });
  assert.equal(calls.length, 1, "the write went to the real server");
  assert.notEqual((await source.list({ status: "active" })).memories.find((one) => one.id === id).title, "Título novo", "the sample did not change");
});

test("HIVE_MEMORY_DEMO answers from the fixture without a token or a network", async () => {
  const { calls, fetchImpl } = upstream([{ status: 500, body: {} }]);
  const source = createMemorySource({ demo: true, readToken: () => "", fetchImpl });
  const archived = await source.list({ status: "archived" });
  assert.equal(archived.demo, true);
  assert.ok(archived.memories.length > 0 && archived.memories.every((one) => one.status === "archived"));
  const one = await source.one(archived.memories[0].id);
  assert.ok(one.memory.content.length > 0);
  assert.equal(calls.length, 0);
});

test("one memory that does not exist is a missing memory, not a missing route", async () => {
  const { calls, fetchImpl } = upstream([{ status: 404, body: {} }, { status: 200, body: LIST }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "t", fetchImpl });
  const one = await source.one("gone");
  assert.equal(one.state, "ok");
  assert.equal(one.memory, null);
  assert.equal(one.demo, false);
  const list = await source.list({});
  assert.equal(list.demo, false);
  assert.equal(calls[0].url, "https://memory.example.dev/api/memories/gone");
  assert.equal((await source.one("../etc/passwd")).state, "bad");
});

test("only the filters of the contract travel, cleaned", () => {
  assert.equal(String(memoryListQuery({ status: "deleted", origin: "robot", repo: " acme ", evil: "1" })), "repo=acme&status=active");
  assert.equal(String(memoryListQuery({ status: "archived", origin: "manual" })), "status=archived&origin=manual");
  assert.equal(cleanMemoryId("abc-123"), "abc-123");
  assert.equal(cleanMemoryId("a/b"), "");
  assert.equal(cleanWeeks("8"), 8);
  assert.equal(cleanWeeks("900"), 12);
});

test("the hive routes proxy list, one and stats, and refuse to write without a login", async () => {
  const routes = new Map();
  const asked = [];
  const memories = {
    list: async (q) => { asked.push(["list", q]); return { state: "ok", memories: [] }; },
    one: async (id) => (id ? { state: "ok", memory: { id } } : { state: "bad" }),
    stats: async (weeks) => { asked.push(["stats", weeks]); return { state: "ok", stats: {} }; },
    forget: () => asked.push(["forget"])
  };
  registerMemoryRoutes((method, path, fn) => routes.set(`${method} ${path}`, fn), { memories });
  const call = async (method, path) => {
    const url = new URL(`http://hive${path}`);
    let answer = null;
    await routes.get(`${method} ${url.pathname}`)({}, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  assert.equal((await call("GET", "/api/memories?status=archived&fresh=1")).value.state, "ok");
  assert.deepEqual(asked.slice(0, 2), [["forget"], ["list", { status: "archived", fresh: "1" }]]);
  assert.equal((await call("GET", "/api/memories/one?id=m1")).value.memory.id, "m1");
  assert.equal((await call("GET", "/api/memories/one")).status, 400);
  await call("GET", "/api/memories/stats?weeks=8");
  assert.deepEqual(asked.at(-1), ["stats", "8"]);
  const archive = await call("POST", "/api/memories/archive");
  assert.equal(archive.status, 401);
  assert.equal(archive.value.state, "out");
});

function writer(answers) {
  const calls = [];
  return {
    calls,
    login: {
      async access() { return "person"; },
      async call(method, path, body) {
        calls.push({ method, path, body });
        const next = answers.shift();
        return { status: next.status, ok: next.status >= 200 && next.status < 300, out: next.out, body: next.body || {} };
      }
    }
  };
}

test("an edit goes as a PATCH with the person's token, only with the fields of the contract, and drops the cached lists", async () => {
  const { calls: listed, fetchImpl } = upstream([{ status: 200, body: LIST }]);
  const { calls, login } = writer([{ status: 200, body: { id: "m1", title: "Novo", updated_by: "ana@example.com" } }]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "read", fetchImpl, login });
  await source.list({ status: "active" });
  const said = await source.write("m1", "edit", { id: "m1", title: "  Novo  ", tags: ["Deploy", "deploy", "github actions"], category: "gotchas", evil: "x" });
  assert.equal(said.state, "ok");
  assert.equal(said.memory.updated_by, "ana@example.com");
  assert.deepEqual(calls[0], { method: "PATCH", path: "/api/memories/m1", body: { title: "Novo", category: "gotchas", tags: ["deploy", "github-actions"] } });
  await source.list({ status: "active" });
  assert.equal(listed.length, 2, "the list is asked again after a write");
});

test("archive and unarchive go to their own routes, and refusals keep their meaning", async () => {
  const { calls, login } = writer([
    { status: 200, body: { id: "m1", status: "archived" } },
    { status: 200, body: { id: "m1", status: "active" } },
    { status: 401, out: true },
    { status: 403, body: { error: "forbidden" } },
    { status: 404, body: { error: "not_found" } },
    { status: 400, body: { error: "invalid_body", error_description: "title cannot be blank" } },
    { status: 500, body: {} }
  ]);
  const source = createMemorySource({ baseUrl: "https://memory.example.dev", readToken: () => "read", login });
  assert.equal((await source.write("m1", "archive")).state, "ok");
  assert.equal((await source.write("m1", "unarchive")).state, "ok");
  assert.deepEqual(calls.slice(0, 2).map((one) => [one.method, one.path, one.body]), [["POST", "/api/memories/m1/archive", undefined], ["POST", "/api/memories/m1/unarchive", undefined]]);
  assert.equal((await source.write("m1", "archive")).state, "out");
  assert.equal((await source.write("m1", "archive")).state, "forbidden");
  assert.equal((await source.write("m1", "archive")).state, "gone");
  assert.deepEqual(await source.write("m1", "edit", { title: "x" }), { state: "bad", why: "title cannot be blank" });
  assert.equal((await source.write("m1", "archive")).state, "down");
  assert.equal((await source.write("../x", "archive")).state, "bad");
  assert.equal((await source.write("m1", "delete")).state, "bad");
  assert.equal(calls.length, 7, "nothing invalid reaches the server");
});

test("an edit with nothing to change, a blank title or an unknown kind never leaves the Hive", () => {
  assert.equal(memoryPatch({}).error, "empty");
  assert.equal(memoryPatch({ title: "   " }).error, "title");
  assert.equal(memoryPatch({ content: " \n " }).error, "content");
  assert.equal(memoryPatch({ category: "how-to" }).error, "category");
  assert.equal(memoryPatch({ tags: "a,b" }).error, "tags");
  assert.deepEqual(memoryPatch({ content: "# T\n\ncorpo" }).patch, { content: "# T\n\ncorpo" });
});

test("in sample mode an edit and an archive change the sample memories, stamped with the sample account", async () => {
  const source = createMemorySource({ demo: true, demoEmail: "voce@example.com" });
  const before = await source.list({ status: "active" });
  const id = before.memories[0].id;
  const edited = await source.write(id, "edit", { title: "Título novo", content: "Linha nova" });
  assert.equal(edited.state, "ok");
  assert.equal(edited.memory.updated_by, "voce@example.com");
  assert.equal((await source.one(id)).memory.title, "Título novo");
  await source.write(id, "archive");
  assert.ok((await source.list({ status: "archived" })).memories.some((one) => one.id === id));
  await source.write(id, "unarchive");
  assert.ok((await source.list({ status: "active" })).memories.some((one) => one.id === id));
});

test("the login routes say where signing in works, and the pod gets no button", async () => {
  const routes = new Map();
  const memories = { list: async () => ({}), one: async () => ({}), stats: async () => ({}), forget: () => {}, write: async (id, kind) => ({ state: "ok", memory: { id, kind } }) };
  const login = createDemoLogin();
  const vault = { available: async () => true };
  registerMemoryRoutes((method, path, fn) => routes.set(`${method} ${path}`, fn), { memories, login, vault, bodyOf: async (req) => req.body || {}, env: {} });
  const call = async (method, path, req = {}) => {
    const url = new URL(`http://hive${path}`);
    let answer = null;
    await routes.get(`${method} ${url.pathname}`)({ headers: { host: "127.0.0.1:8796" }, ...req }, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  assert.equal((await call("GET", "/api/memories/login")).value.reach, "here");
  const pod = await call("POST", "/api/memories/login", { headers: { host: "hive.someone.example.dev" } });
  assert.equal(pod.status, 409);
  assert.equal(pod.value.reach, "pod");
  assert.equal((await call("POST", "/api/memories/edit", { body: { id: "m1", title: "x" } })).status, 401);
  const inside = await call("POST", "/api/memories/login");
  assert.equal(inside.value.state, "in");
  const edited = await call("POST", "/api/memories/edit", { body: { id: "m1", title: "x" } });
  assert.equal(edited.status, 200);
  assert.equal(edited.value.memory.kind, "edit");
  assert.equal((await call("POST", "/api/memories/logout")).value.state, "out");
});

test("with no memory server configured, nothing is asked and the panel learns which setting is missing", async () => {
  const { calls, fetchImpl } = upstream([{ status: 200, body: LIST }]);
  const source = createMemorySource({ readToken: () => "t", fetchImpl });
  const said = await source.list({});
  assert.equal(said.state, "no-server");
  assert.equal(said.key, "HIVE_MEMORY_URL");
  assert.equal(calls.length, 0);
  assert.equal((await source.write("m1", "archive")).state, "out");
});

test("with no memory address the login route says it is not configured, and a click answers why", async () => {
  const routes = new Map();
  const memories = { list: async () => ({}), one: async () => ({}), stats: async () => ({}), forget: () => {}, write: async () => ({ state: "out" }) };
  let address = "";
  const login = createMemoryLogin({ baseUrl: () => address, vault: memoryVault(), clients: memoryClientStore(), fetchImpl: async () => { throw new Error("never asked"); }, open: () => {} });
  registerMemoryRoutes((method, path, fn) => routes.set(`${method} ${path}`, fn), { memories, login, vault: { available: async () => true }, env: {} });
  const call = async (method, path) => {
    let answer = null;
    await routes.get(`${method} ${path}`)({ headers: { host: "127.0.0.1:8796" } }, {}, new URL(`http://hive${path}`), (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  const asked = await call("GET", "/api/memories/login");
  assert.equal(asked.value.configured, false);
  assert.equal(asked.value.state, "out");
  const clicked = await call("POST", "/api/memories/login");
  assert.equal(clicked.status, 502);
  assert.equal(clicked.value.why, "HIVE_MEMORY_URL is not set");
  assert.equal(clicked.value.configured, false);
  address = "https://memory.example";
  assert.equal((await call("GET", "/api/memories/login")).value.configured, true, "a reloaded config reaches the login without reopening the Hive");
});

test("the memory source reads its address late, so a reloaded config stops answering no-server", async () => {
  let address = "";
  const { calls, fetchImpl } = upstream([{ status: 200, body: LIST }]);
  const source = createMemorySource({ baseUrl: () => address, readToken: () => "t", fetchImpl });
  assert.equal((await source.list({})).state, "no-server");
  address = "https://memory.example/";
  const said = await source.list({});
  assert.equal(said.state, "ok");
  assert.equal(said.source, "memory.example");
  assert.match(calls[0].url, /^https:\/\/memory\.example\/api\/memories/);
});

test("a token read while the address changes is never sent to the new address", async () => {
  let address = "https://memory-a.example";
  const { calls, fetchImpl } = upstream([{ status: 200, body: LIST }]);
  const source = createMemorySource({ baseUrl: () => address, readToken: async () => { address = "https://memory-b.example"; return "token-of-a"; }, fetchImpl });
  const said = await source.list({});
  assert.notEqual(said.state, "ok");
  assert.deepEqual(calls, []);
});
