import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerTaskRoutes } from "../routes/tasks.mjs";
import { readLocalTasks, readSharedTasks } from "../lib/tasks.mjs";

function harness({ me = "rafael", alive = [], pullError = "" } = {}) {
  const routes = new Map();
  const home = mkdtempSync(join(tmpdir(), "hive-task-home-"));
  const shelfHome = mkdtempSync(join(tmpdir(), "hive-task-shelf-"));
  const calls = { pushed: [], said: [], spawned: [], pulls: 0 };
  let clock = 1000;
  const state = { me, alive };

  registerTaskRoutes((method, path, handler) => routes.set(`${method} ${path}`, handler), {
    bodyOf: async (req) => req.body || {},
    home,
    me: () => state.me,
    shelf: {
      home: () => shelfHome,
      turn: (job) => job(),
      pull: async () => { calls.pulls += 1; return pullError ? { error: pullError } : { home: shelfHome }; },
      push: async (message, paths) => { calls.pushed.push({ message, paths }); return { committed: true, pushed: true }; }
    },
    deliverSay: async (seat, from, text) => { calls.said.push({ seat, from, text }); return { ok: true }; },
    spawnSeat: async (asked) => { calls.spawned.push(asked); return { name: "capas", id: "n1" }; },
    liveSeats: () => state.alive,
    readErrands: () => ({}),
    prsOf: () => [],
    now: () => (clock += 1)
  });

  const call = async (method, path, body = {}) => {
    let answer = null;
    const url = new URL(`http://hive${path}`);
    await routes.get(`${method} ${url.pathname}`)({ body }, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };

  return { call, calls, home, shelfHome, state };
}

test("a private task is kept on this machine and never touches the team's repo", async () => {
  const h = harness();
  const made = await h.call("POST", "/api/tasks", { text: "trocar o token do cofre" });
  assert.equal(made.status, 200);
  assert.equal(readLocalTasks(h.home).length, 1);
  assert.equal(h.calls.pushed.length, 0);
  const listed = await h.call("GET", "/api/tasks");
  assert.deepEqual(listed.value.tasks.map((one) => one.text), ["trocar o token do cofre"]);
  assert.equal(listed.value.me, "rafael");
});

test("a team task goes to the shelf, pushed from its own folder", async () => {
  const h = harness();
  const made = await h.call("POST", "/api/tasks", { text: "revisar o RFC", who: "team" });
  assert.equal(made.status, 200);
  assert.equal(readSharedTasks(h.shelfHome).length, 1);
  assert.equal(readLocalTasks(h.home).length, 0);
  assert.deepEqual(h.calls.pushed[0].paths, ["t"]);
  assert.match(h.calls.pushed[0].message, /^tarefas: t-/);
});

test("moving a task from private to the team and back moves the file, not a copy", async () => {
  const h = harness();
  const { value } = await h.call("POST", "/api/tasks", { text: "a" });
  await h.call("POST", "/api/tasks/edit", { id: value.task.id, who: "team" });
  assert.equal(readLocalTasks(h.home).length, 0);
  assert.equal(readSharedTasks(h.shelfHome).length, 1);
  await h.call("POST", "/api/tasks/edit", { id: value.task.id, who: "me" });
  assert.equal(readLocalTasks(h.home).length, 1);
  assert.equal(readSharedTasks(h.shelfHome).length, 0);
});

test("the team's repo out of reach refuses a shared task instead of pretending it was shared", async () => {
  const h = harness({ pullError: "network is down" });
  const made = await h.call("POST", "/api/tasks", { text: "b", who: "team" });
  assert.equal(made.status, 502);
  assert.match(made.value.why, /network is down/);
  assert.equal(readSharedTasks(h.shelfHome).length, 0);
});

test("a teammate comments on a team task but cannot close it", async () => {
  const h = harness();
  const { value } = await h.call("POST", "/api/tasks", { text: "revisar", who: "team" });
  h.state.me = "mari";
  const closed = await h.call("POST", "/api/tasks/edit", { id: value.task.id, done: true });
  assert.equal(closed.status, 403);
  const said = await h.call("POST", "/api/tasks/comment", { id: value.task.id, text: "olhei, faltou o print" });
  assert.equal(said.status, 200);
  assert.equal(readSharedTasks(h.shelfHome)[0].comments[0].who, "mari");
});

test("a private task of someone else is not there to comment on", async () => {
  const h = harness();
  const { value } = await h.call("POST", "/api/tasks", { text: "só minha" });
  h.state.me = "mari";
  const said = await h.call("POST", "/api/tasks/comment", { id: value.task.id, text: "oi" });
  assert.equal(said.status, 403);
});

test("a comment is typed into a chat only when it calls that chat with @", async () => {
  const h = harness({ alive: ["capas"] });
  const { value } = await h.call("POST", "/api/tasks", { text: "subir capas" });
  await h.call("POST", "/api/tasks/comment", { id: value.task.id, text: "lembra do JPG" });
  assert.equal(h.calls.said.length, 0);
  await h.call("POST", "/api/tasks/comment", { id: value.task.id, text: "@capas pode seguir sem a 88" });
  assert.equal(h.calls.said.length, 1);
  assert.equal(h.calls.said[0].seat, "capas");
  await h.call("GET", "/api/tasks");
  assert.equal(h.calls.said.length, 1, "the same comment is never delivered twice");
});

test("starting a chat hands it the task as its mission and links the two", async () => {
  const h = harness();
  const { value } = await h.call("POST", "/api/tasks", { text: "subir as capas" });
  const started = await h.call("POST", "/api/tasks/start", { id: value.task.id });
  assert.equal(started.status, 200);
  assert.equal(h.calls.spawned[0].errand, "subir as capas");
  assert.match(h.calls.spawned[0].prompt, /^subir as capas/);
  assert.equal(readLocalTasks(h.home)[0].seat, "capas");
});

test("handing a task to an open chat tells that chat, and refuses a chat that is not open", async () => {
  const h = harness({ alive: ["capas"] });
  const { value } = await h.call("POST", "/api/tasks", { text: "subir as capas" });
  const refused = await h.call("POST", "/api/tasks/assign", { id: value.task.id, seat: "outro" });
  assert.equal(refused.status, 400);
  const handed = await h.call("POST", "/api/tasks/assign", { id: value.task.id, seat: "capas" });
  assert.equal(handed.status, 200);
  assert.equal(h.calls.said[0].seat, "capas");
  assert.match(h.calls.said[0].text, /subir as capas/);
});

test("a chat writes a task only into the person's own list, marked as coming from it", async () => {
  const h = harness();
  const made = await h.call("POST", "/api/tasks", { text: "pedir o arquivo da doação 88", from: "capas" });
  assert.equal(made.value.task.from, "capas");
  assert.equal(made.value.task.who, "me");
});

test("a group is created on the shelf, and its tasks reach its people", async () => {
  const h = harness();
  const made = await h.call("POST", "/api/tasks/groups", { name: "Leitura", icon: "i-tree", colour: "green", members: ["mari"] });
  assert.equal(made.status, 200);
  assert.deepEqual(made.value.group.members, ["rafael", "mari"]);
  assert.match(h.calls.pushed.at(-1).message, /grupo novo · Leitura/);
  const task = await h.call("POST", "/api/tasks", { text: "revisar o RFC", who: "group", group: made.value.group.id });
  assert.equal(task.status, 200);
  h.state.me = "mari";
  const seen = await h.call("GET", "/api/tasks");
  assert.deepEqual(seen.value.tasks.map((one) => one.text), ["revisar o RFC"]);
  assert.equal(seen.value.groups.length, 1);
  h.state.me = "joao";
  assert.deepEqual((await h.call("GET", "/api/tasks")).value.tasks, []);
});

test("a group picture is kept beside the group and served back, and a data url never lands in the file", async () => {
  const h = harness();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
  const made = await h.call("POST", "/api/tasks/groups", { name: "Hive", imageData: `data:image/png;base64,${png.toString("base64")}` });
  assert.equal(made.status, 200);
  assert.equal(made.value.group.image, `${made.value.group.id}.png`);
  assert.equal(made.value.group.imageData, undefined);
  const refused = await h.call("POST", "/api/tasks/groups", { name: "x", imageData: "data:image/svg+xml;base64,PHN2Zz4=" });
  assert.equal(refused.status, 400);
});

test("someone outside a group cannot rename it", async () => {
  const h = harness();
  const made = await h.call("POST", "/api/tasks/groups", { name: "Leitura" });
  h.state.me = "joao";
  const edited = await h.call("POST", "/api/tasks/groups/edit", { id: made.value.group.id, name: "meu" });
  assert.equal(edited.status, 403);
});
