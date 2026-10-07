import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { branchFor, prepareWorktree, refuse } from "../worktree.mjs";

const stage = ({ has = () => true, gitAnswers = [] } = {}) => {
  const calls = [];
  let at = 0;
  return {
    calls,
    args: {
      root: "/workspace",
      exists: (path) => has(path),
      mkdir: () => {},
      git: async (cmd, args) => {
        calls.push([cmd, ...args].join(" "));
        const answer = gitAnswers[at] ?? { ok: true };
        at += 1;
        return { out: "", err: "", ...answer };
      }
    }
  };
};

test("a branch is named after whoever asked, so two people never collide", () => {
  assert.equal(branchFor("joao", "front"), "joao/-/front");
  assert.equal(branchFor("", "front"), "hive/-/front");
});

test("a name that could climb out of the workspace is refused before git sees it", () => {
  assert.match(refuse({ repo: "arvore-hub", name: "../../etc" }), /name a seat can have|climb out/);
  assert.match(refuse({ repo: "../secrets", name: "front" }), /repository name|climb out/);
  assert.match(refuse({ repo: "arvore-hub", name: "front", branch: "a/../../b" }), /climb out/);
  assert.equal(refuse({ repo: "arvore-hub", name: "front", branch: "joao/-/front" }), "");
});

test("a repository the server does not have is said plainly, not as a git error", async () => {
  const { args } = stage({ has: () => false });
  const said = await prepareWorktree({ ...args, repo: "nao-existe", name: "front" });
  assert.match(said.error, /there is no nao-existe on this server/);
  assert.match(said.error, /clone it into/);
});

test("a worktree that is already there is used, and git is never called", async () => {
  const { args, calls } = stage({ has: () => true });
  const said = await prepareWorktree({ ...args, repo: "arvore-hub", name: "front" });
  assert.deepEqual(said, { cwd: "/workspace/worktrees/arvore-hub/front", made: false });
  assert.deepEqual(calls, [], "it fetched and branched over a worktree that already existed");
});

test("a fresh worktree branches off origin/main", async () => {
  const { args, calls } = stage({ has: (path) => path.endsWith(".git") });
  const said = await prepareWorktree({ ...args, repo: "arvore-hub", name: "front", owner: "joao" });
  assert.equal(said.cwd, "/workspace/worktrees/arvore-hub/front");
  assert.equal(said.branch, "joao/-/front");
  assert.match(calls[0], /fetch origin/);
  assert.match(calls[1], /worktree add -b joao\/-\/front .* origin\/main/);
});

test("a repository with no origin/main still gets a worktree", async () => {
  const { args, calls } = stage({
    has: (path) => path.endsWith(".git"),
    gitAnswers: [{ ok: true }, { ok: false, err: "invalid reference: origin/main" }, { ok: true }]
  });
  const said = await prepareWorktree({ ...args, repo: "solto", name: "front", owner: "joao" });
  assert.equal(said.made, true);
  assert.equal(calls.length, 3, "it gave up instead of trying a branch with no upstream");
});

test("when every way fails, the reason git gave is the one reported", async () => {
  const { args } = stage({
    has: (path) => path.endsWith(".git"),
    gitAnswers: [{ ok: true }, { ok: false, err: "fatal: a\nfatal: bad ref" }, { ok: false, err: "fatal: bad ref" }, { ok: false, err: "fatal: bad ref" }]
  });
  const said = await prepareWorktree({ ...args, repo: "arvore-hub", name: "front" });
  assert.match(said.error, /could not make a worktree for front/);
  assert.match(said.error, /bad ref/);
});

test("the route only prepares a worktree when it was given a repository and no directory", () => {
  const route = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const from = route.indexOf('if (path === "/api/sessions" && method === "POST")');
  const block = route.slice(from, route.indexOf("return asJson(opened)", from));
  assert.match(block, /if \(!cwd && asked\.repo\)/, "a caller that named a directory would have it rewritten under its feet");
  assert.match(block, /root: workspaceRoot\(\)/, "the worktree would land outside the volume the server keeps");
  assert.match(block, /if \(made\.error\) return asJson\(made, 400\)/, "a repository the server does not have would open a seat in nowhere");
});
