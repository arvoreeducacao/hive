import { test } from "node:test";
import assert from "node:assert/strict";

import { catchUp, oneAtATime, sendToShelf } from "../lib/shelf.mjs";

function fakeGit(script) {
  const seen = [];
  const answers = { ...script };
  return {
    seen,
    git: async (args) => {
      const call = args.join(" ");
      seen.push(call);
      const key = Object.keys(answers).find((k) => call.startsWith(k));
      const answer = key ? answers[key] : { ok: true };
      if (Array.isArray(answer)) return answer.length > 1 ? answer.shift() : answer[0];
      return answer;
    }
  };
}

const ran = (seen, what) => seen.filter((call) => call.startsWith(what)).length;

test("a page nobody raced for is pushed once", async () => {
  const { git, seen } = fakeGit({ "diff --cached": { ok: false } });
  const sent = await sendToShelf({ git, message: "estante: uma-pagina" });
  assert.deepEqual({ committed: sent.committed, pushed: sent.pushed, rounds: sent.rounds }, { committed: true, pushed: true, rounds: 1 });
  assert.equal(ran(seen, "push"), 1);
  assert.equal(ran(seen, "fetch"), 0);
});

test("someone publishing first is caught up with, not given up on", async () => {
  const { git, seen } = fakeGit({
    "diff --cached": { ok: false },
    push: [{ ok: false, error: "rejected: non-fast-forward" }, { ok: true }]
  });
  const sent = await sendToShelf({ git, message: "estante: uma-pagina" });
  assert.equal(sent.pushed, true);
  assert.equal(sent.rounds, 2);
  assert.equal(ran(seen, "fetch"), 1, "it has to fetch before trying again");
  assert.equal(ran(seen, "push"), 2);
});

test("a shelf that keeps moving stops being pushed to, and says so", async () => {
  const { git, seen } = fakeGit({
    "diff --cached": { ok: false },
    push: [{ ok: false, error: "rejected: non-fast-forward" }]
  });
  const sent = await sendToShelf({ git, message: "estante: uma-pagina", tries: 3 });
  assert.equal(sent.pushed, false);
  assert.equal(sent.rounds, 3);
  assert.match(sent.error, /rejected/);
  assert.equal(ran(seen, "push"), 3);
});

test("a page that cannot be reconciled stops there instead of pushing over the team", async () => {
  const { git, seen } = fakeGit({
    "diff --cached": { ok: false },
    push: [{ ok: false, error: "rejected" }],
    "merge --ff-only": { ok: false },
    rebase: [{ ok: false, error: "conflict in a/uma-pagina/documento.v2.html" }, { ok: true }]
  });
  const sent = await sendToShelf({ git, message: "estante: uma-pagina" });
  assert.equal(sent.pushed, false);
  assert.match(sent.error, /conflict/);
  assert.equal(ran(seen, "rebase --abort"), 1, "a half-done rebase would break every publish after this one");
  assert.equal(ran(seen, "push"), 1, "no second push after giving up");
});

test("nothing to commit is not a failure", async () => {
  const { git, seen } = fakeGit({ "diff --cached": { ok: true } });
  const sent = await sendToShelf({ git, message: "estante: uma-pagina" });
  assert.deepEqual(sent, { committed: false, pushed: false });
  assert.equal(ran(seen, "commit"), 0);
  assert.equal(ran(seen, "push"), 0);
});

test("catching up prefers fast-forward and only then rebases", async () => {
  const straight = fakeGit({});
  assert.deepEqual(await catchUp({ git: straight.git }), { ok: true, how: "fast-forward" });
  assert.equal(ran(straight.seen, "rebase"), 0);

  const ours = fakeGit({ "merge --ff-only": { ok: false } });
  assert.deepEqual(await catchUp({ git: ours.git }), { ok: true, how: "rebase" });
  assert.equal(ran(ours.seen, "rebase"), 1);
});

test("two seats on one machine take turns instead of writing over each other", async () => {
  const turn = oneAtATime();
  const order = [];
  const job = (name, ms) => () => new Promise((done) => {
    order.push(`${name} in`);
    setTimeout(() => { order.push(`${name} out`); done(name); }, ms);
  });
  const both = Promise.all([turn(job("slow", 20)), turn(job("quick", 1))]);
  assert.deepEqual(await both, ["slow", "quick"]);
  assert.deepEqual(order, ["slow in", "slow out", "quick in", "quick out"]);
});

test("a seat that blows up does not hold the queue shut", async () => {
  const turn = oneAtATime();
  await assert.rejects(turn(async () => { throw new Error("the page was gone"); }));
  assert.equal(await turn(async () => "still publishing"), "still publishing");
});

test("pages stage only the pages folder, and the team's tasks stage only theirs", async () => {
  const pages = fakeGit({ "diff --cached": { ok: false } });
  await sendToShelf({ git: pages.git, message: "estante: uma-pagina" });
  assert.equal(pages.seen[0], "add -A a");
  const tasks = fakeGit({ "diff --cached": { ok: false } });
  await sendToShelf({ git: tasks.git, message: "tarefas: t-0123456789 · nova", paths: ["t"] });
  assert.equal(tasks.seen[0], "add -A t");
});
