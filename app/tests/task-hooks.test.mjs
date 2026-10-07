import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTaskRoutes } from "../routes/tasks.mjs";
import { createRegistry } from "../lib/extensions.mjs";
import { readLocalTasks } from "../lib/tasks.mjs";

function harness({ read = async () => {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), "hive-task-hooks-"));
  const routes = new Map();
  const changes = [];
  const reads = [];
  let clock = 1000;
  registerTaskRoutes((method, path, handler) => routes.set(`${method} ${path}`, handler), {
    bodyOf: async (req) => req.body || {},
    home,
    me: () => "mateus",
    shelf: { home: () => "", turn: (job) => job(), pull: async () => ({ error: "no shelf repo" }), push: async () => ({ committed: true }) },
    now: () => (clock += 1),
    taskHooks: {
      read: async (asked) => { reads.push(asked); await read(asked); },
      changed: async (asked) => { changes.push(asked); }
    }
  });
  const call = async (method, path, body = {}) => {
    let answer = null;
    const url = new URL(`http://hive${path}`);
    await routes.get(`${method} ${url.pathname}`)({ body }, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  return { call, settle, changes, reads, home };
}

test("tasks.read runs when the tasks are opened, not on the quiet poll", async () => {
  const h = harness();
  await h.call("GET", "/api/tasks");
  assert.equal(h.reads.length, 0);
  await h.call("GET", "/api/tasks?fresh=1");
  assert.equal(h.reads.length, 1);
});

test("what tasks.read writes is in the list it answers, and never comes back as a change", async () => {
  const h = harness({
    read: async ({ tasks }) => {
      const made = tasks.add({ text: "veio de fora" });
      tasks.edit(made.task.id, { text: "veio de fora, editada" });
      tasks.add({ text: "já feita", done: true });
    }
  });
  const listed = await h.call("GET", "/api/tasks?fresh=1");
  await h.settle();
  assert.deepEqual(listed.value.tasks.map((one) => one.text).sort(), ["já feita", "veio de fora, editada"]);
  assert.equal(readLocalTasks(h.home).find((one) => one.text === "já feita").done, true);
  assert.equal(h.changes.length, 0);
});

test("tasks.read sees the person's private tasks and cannot touch one it does not have", async () => {
  let seen = null;
  const h = harness({ read: async ({ tasks }) => {
    seen = { texts: tasks.list().map((one) => one.text), edit: tasks.edit("t-0000000000", { text: "x" }).error, remove: tasks.remove("t-0000000000").error };
  } });
  await h.call("POST", "/api/tasks", { text: "minha" });
  await h.call("GET", "/api/tasks?fresh=1");
  assert.deepEqual(seen.texts, ["minha"]);
  assert.ok(seen.edit);
  assert.ok(seen.remove);
});

test("writing, editing and removing a task from the hive tells tasks.changed, with how it was before", async () => {
  const h = harness();
  const made = await h.call("POST", "/api/tasks", { text: "revisar PR" });
  const id = made.value.task.id;
  await h.call("POST", "/api/tasks/edit", { id, done: true });
  await h.call("POST", "/api/tasks/remove", { id });
  await h.settle();
  assert.deepEqual(h.changes.map((one) => one.change), ["added", "edited", "removed"]);
  assert.equal(h.changes[1].before.done, false);
  assert.equal(h.changes[1].task.done, true);
});

test("a tasks.read that fails leaves the list answered", async () => {
  const h = harness({ read: async () => { throw new Error("down"); } });
  await h.call("POST", "/api/tasks", { text: "continua" });
  const listed = await h.call("GET", "/api/tasks?fresh=1");
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.value.tasks.map((one) => one.text), ["continua"]);
});

test("the registry hands tasks.read and tasks.changed the extension's settings, and only once a required one is set", async () => {
  const calls = [];
  const files = {
    "/b/todo/extension.json": JSON.stringify({ name: "todo", version: "1.0.0", hooks: ["tasks.read", "tasks.changed"], settings: { token: { type: "password", required: true } } }),
    "/b/todo/index.mjs": "x"
  };
  const fs = {
    exists: (path) => path === "/b" || path === "/b/todo" || path in files,
    list: (dir) => (dir === "/b" ? ["todo"] : []),
    isDir: (path) => path === "/b/todo",
    read: (path) => files[path]
  };
  const registry = await createRegistry({
    roots: [{ origin: "built-in", dir: "/b" }],
    fs,
    importModule: async () => ({ default: (hive) => {
      hive.on("tasks.read", async ({ tasks, settings }) => calls.push(["read", tasks.name, settings.token]));
      hive.on("tasks.changed", async ({ change, task, settings }) => calls.push(["changed", change, task.id, settings.token]));
    } })
  }).load();
  await registry.tasksRead({ tasks: { name: "handle" } });
  assert.deepEqual(calls, []);
  registry.setSecrets("todo", { token: "tok" });
  await registry.tasksRead({ tasks: { name: "handle" } });
  await registry.tasksChanged({ change: "added", task: { id: "t-1" } });
  assert.deepEqual(calls, [["read", "handle", "tok"], ["changed", "added", "t-1", "tok"]]);
});

test("a tasks.read past its budget lets the list go out without it", async () => {
  const files = {
    "/b/slow/extension.json": JSON.stringify({ name: "slow", version: "1.0.0", hooks: ["tasks.read"] }),
    "/b/slow/index.mjs": "x"
  };
  const fs = {
    exists: (path) => path === "/b" || path === "/b/slow" || path in files,
    list: (dir) => (dir === "/b" ? ["slow"] : []),
    isDir: (path) => path === "/b/slow",
    read: (path) => files[path]
  };
  const registry = await createRegistry({
    roots: [{ origin: "built-in", dir: "/b" }],
    fs,
    tasksReadBudgetMs: 20,
    importModule: async () => ({ default: (hive) => { hive.on("tasks.read", () => new Promise((resolve) => setTimeout(resolve, 200))); } })
  }).load();
  const started = Date.now();
  await registry.tasksRead({ tasks: {} });
  assert.ok(Date.now() - started < 150);
  assert.match(registry.list()[0].problems.join(" "), /tasks\.read took longer/);
});
