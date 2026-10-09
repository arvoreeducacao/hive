import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoutineDomain } from "../routes/routines.mjs";
import { readRoutines } from "../lib/routines.mjs";

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

async function harness() {
  const home = await mkdtemp(join(tmpdir(), "hive-routine-routes-"));
  const routes = new Map();
  const calls = { jobs: [], prechecks: [], invalidated: 0, log: [] };
  const state = { now: local(2026, 9, 1, 10, 0), precheck: { ok: true }, ids: 0, openError: "" };
  const domain = createRoutineDomain({
    home,
    openJob: (body) => {
      if (state.openError) throw new Error(state.openError);
      calls.jobs.push(["open", body]);
      return { id: `job-${calls.jobs.length}`, name: body.name };
    },
    runJob: (job, body) => calls.jobs.push(["run", job.id, body.name]),
    precheckRun: async (line, timeout) => { calls.prechecks.push([line, timeout]); return state.precheck; },
    invalidate: () => { calls.invalidated++; },
    newId: () => `r${++state.ids}`,
    now: () => state.now,
    log: (line) => calls.log.push(line)
  });
  domain.register((method, path, handler) => routes.set(`${method || "GET"} ${path}`, handler), async (req) => req.body || {});
  const call = async (method, path, body) => {
    let answer = null;
    await routes.get(`${method} ${path}`)({ body }, {}, new URL(`http://hive${path}`), (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  return { home, routes, calls, state, domain, call, saved: () => readRoutines(home), done: () => rm(home, { recursive: true, force: true }) };
}

const NIGHTLY = { name: "Nightly status", prompt: "summarize today's changes", trigger: "daily", time: "18:00", precheck: "gh pr list -q .[0]" };

test("a routine is created with its next run, edited in place, toggled and removed", async () => {
  const h = await harness();
  const born = await h.call("POST", "/api/routines", NIGHTLY);
  assert.equal(born.status, 200);
  assert.equal(born.value.routine.id, "r1");
  assert.equal(born.value.routine.nextAt, local(2026, 9, 1, 18, 0));
  assert.equal(h.calls.invalidated, 1);

  const bad = await h.call("POST", "/api/routines", { ...NIGHTLY, name: "" });
  assert.equal(bad.status, 400);

  const edited = await h.call("POST", "/api/routines", { ...NIGHTLY, id: "r1", time: "20:00" });
  assert.equal(edited.value.routine.nextAt, local(2026, 9, 1, 20, 0));
  assert.equal(h.saved().length, 1, "editing does not add a second routine");
  assert.equal((await h.call("POST", "/api/routines", { ...NIGHTLY, id: "nope" })).status, 404);

  const off = await h.call("POST", "/api/routines/toggle", { id: "r1", enabled: false });
  assert.equal(off.value.routine.enabled, false);
  assert.equal(h.saved()[0].enabled, false);

  const listed = await h.call("GET", "/api/routines");
  assert.equal(listed.value.routines.length, 1);
  assert.equal(listed.value.now, h.state.now);

  assert.equal((await h.call("POST", "/api/routines/remove", { id: "r1" })).value.ok, true);
  assert.deepEqual(h.saved(), []);
  assert.equal((await h.call("POST", "/api/routines/remove", { id: "r1" })).status, 404);
  await h.done();
});

test("the tick fires what is due, skips when the precheck says no, and marks a missed run when the app was away", async () => {
  const h = await harness();
  await h.call("POST", "/api/routines", NIGHTLY);
  await h.call("POST", "/api/routines", { ...NIGHTLY, name: "Hourly ping", trigger: "hourly", precheck: "" });

  assert.deepEqual(await h.domain.tick(local(2026, 9, 1, 10, 30)), [], "nothing is due yet");

  h.state.precheck = { ok: false, error: "no PRs open\n", code: 1 };
  const atEleven = await h.domain.tick(local(2026, 9, 1, 11, 0));
  assert.deepEqual(atEleven, [{ id: "r2", outcome: "ran", seat: "hourly-ping-1100" }], "the hourly one has no precheck and runs");
  assert.deepEqual(h.calls.jobs.map((one) => one[0]), ["open", "run"]);
  assert.equal(h.calls.jobs[0][1].errand, "Hourly ping");
  assert.equal(h.calls.jobs[0][1].routine, "r2");
  assert.equal(h.saved().find((one) => one.id === "r2").nextAt, local(2026, 9, 1, 12, 0));

  const atSix = await h.domain.tick(local(2026, 9, 1, 18, 0));
  const nightly = atSix.find((one) => one.id === "r1");
  assert.deepEqual(nightly, { id: "r1", outcome: "skipped", why: "no PRs open" });
  assert.deepEqual(h.calls.prechecks[0], ["gh pr list -q .[0]", 60000]);
  assert.equal(h.saved().find((one) => one.id === "r1").nextAt, local(2026, 9, 2, 18, 0), "a skipped run still moves the clock");

  const late = await h.domain.tick(local(2026, 9, 2, 19, 30));
  assert.equal(late.find((one) => one.id === "r1").outcome, "missed");
  assert.match(h.calls.log.join("\n"), /Nightly status: missed/);
  assert.equal(h.calls.prechecks.length, 1, "a missed run does not even ask the precheck");
  await h.done();
});

test("run now fires at once, on demand skips the precheck with force, and keeps the schedule where it was", async () => {
  const h = await harness();
  await h.call("POST", "/api/routines", NIGHTLY);
  h.state.precheck = { ok: false, error: "nothing", code: 1 };

  const skipped = await h.call("POST", "/api/routines/run", { id: "r1" });
  assert.equal(skipped.value.run.outcome, "skipped");
  assert.equal(skipped.value.routine.nextAt, local(2026, 9, 1, 18, 0), "running by hand leaves the next scheduled run alone");
  assert.equal(skipped.value.routine.runs[0].byHand, true);

  const forced = await h.call("POST", "/api/routines/run", { id: "r1", force: true });
  assert.equal(forced.value.run.outcome, "ran");
  assert.equal(forced.value.run.seat, "nightly-status-1000");
  assert.equal(h.calls.jobs.length, 2);

  h.state.openError = "no tmux";
  const broke = await h.call("POST", "/api/routines/run", { id: "r1", force: true });
  assert.deepEqual(broke.value.run, { outcome: "failed", why: "no tmux" });
  assert.equal((await h.call("POST", "/api/routines/run", { id: "zz" })).status, 404);
  await h.done();
});

test("a webhook routine gets its own token, never runs on the clock, and opens a chat with the call quoted in the mission", async () => {
  const h = await harness();
  const born = await h.call("POST", "/api/routines", { name: "PR review", prompt: "revise {{body.pull_request.url}} pedido por {{headers.x-user}} ({{headers.authorization}})", trigger: "webhook" });
  assert.equal(born.status, 200);
  const routine = born.value.routine;
  assert.match(routine.hookToken, /^[0-9a-f]{48}$/);
  assert.equal(routine.nextAt, 0);
  assert.deepEqual(await h.domain.tick(local(2026, 9, 2, 9, 0)), []);
  const wrong = await h.domain.hook({ id: routine.id, token: "nope", body: {} });
  assert.equal(wrong.status, 404);
  const ran = await h.domain.hook({ id: routine.id, token: routine.hookToken, delivery: "d1", body: { pull_request: { url: "https://x/pr/1" } }, headers: { "X-User": "jonas", Authorization: "Bearer s3cret" } });
  assert.equal(ran.status, 202);
  const opened = h.calls.jobs.find((one) => one[0] === "open")[1];
  assert.match(opened.prompt, /revise https:\/\/x\/pr\/1 pedido por jonas \(\[redacted\]\)/);
  assert.doesNotMatch(opened.prompt, /s3cret/);
  const again = await h.domain.hook({ id: routine.id, token: routine.hookToken, delivery: "d1", body: {} });
  assert.deepEqual(again, { status: 200, said: { ok: true, duplicate: true } });
  assert.equal(h.calls.jobs.filter((one) => one[0] === "open").length, 1, "the same delivery opens one chat");
  assert.equal(h.saved()[0].runs[0].byHook, true);
  await h.done();
});

test("a webhook is rate limited per routine", async () => {
  const h = await harness();
  const routine = (await h.call("POST", "/api/routines", { name: "hook", prompt: "x", trigger: "webhook" })).value.routine;
  for (let i = 0; i < 60; i++) assert.equal((await h.domain.hook({ id: routine.id, token: routine.hookToken, body: {} })).status, 202);
  assert.equal((await h.domain.hook({ id: routine.id, token: routine.hookToken, body: {} })).status, 429);
  h.state.now += 61000;
  assert.equal((await h.domain.hook({ id: routine.id, token: routine.hookToken, body: {} })).status, 202);
  await h.done();
});

test("on the server's router, where the first route that matches wins, a POST creates the routine instead of listing them", async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-routine-first-"));
  const routes = [];
  const domain = createRoutineDomain({ home, openJob: () => ({}), runJob: () => {}, precheckRun: async () => ({ ok: true }), newId: () => "r1" });
  domain.register((method, path, fn) => routes.push({ method, path, fn }), async (req) => req.body || {});
  const hit = routes.find((r) => r.path === "/api/routines" && (r.method === null || r.method === "POST"));
  let answer = null;
  await hit.fn({ body: NIGHTLY }, {}, new URL("http://hive/api/routines"), (value, status = 200) => { answer = { value, status }; });
  assert.equal(answer.value.ok, true);
  assert.equal(answer.value.routine.id, "r1");
  await rm(home, { recursive: true, force: true });
});
