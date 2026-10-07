import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutsUnder, keepPushing, onePass, rootsOf } from "../autopush.mjs";

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });

function checkout(root, name, branch) {
  const remote = join(root, `${name}.git`);
  mkdirSync(remote, { recursive: true });
  execFileSync("git", ["init", "--bare", "-q", remote], { stdio: "ignore" });
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", dir], { stdio: "ignore" });
  git(dir, "config", "user.email", "seat@hive");
  git(dir, "config", "user.name", "seat");
  git(dir, "remote", "add", "origin", remote);
  writeFileSync(join(dir, "a.txt"), "one");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "one");
  if (branch !== "main") git(dir, "checkout", "-qb", branch);
  return dir;
}

test("a branch that is not main travels once, and stays quiet until it moves", () => {
  const root = mkdtempSync(join(tmpdir(), "hive-autopush-"));
  const dir = checkout(root, "repo", "joao/-/work");
  const state = join(root, "state");
  const said = [];
  const first = onePass({ roots: [root], state, say: (l) => said.push(l) });
  assert.equal(first.moved, 1, said.join(" | "));
  assert.match(said[0], /pushed joao\/-\/work {2}repo/);

  said.length = 0;
  const again = onePass({ roots: [root], state, say: (l) => said.push(l) });
  assert.equal(again.moved, 0, "the same commit was pushed twice");
  assert.match(said[0], /nothing new in 1 branches/);

  writeFileSync(join(dir, "a.txt"), "two");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "two");
  said.length = 0;
  assert.equal(onePass({ roots: [root], state, say: (l) => said.push(l) }).moved, 1, "a new commit stayed behind");
});

test("main is never pushed by itself, and a checkout one folder deeper is still found", () => {
  const root = mkdtempSync(join(tmpdir(), "hive-autopush-"));
  checkout(root, "on-main", "main");
  const nested = join(root, "worktrees");
  mkdirSync(nested, { recursive: true });
  checkout(nested, "deep", "joao/-/deep");
  const said = [];
  const pass = onePass({ roots: [root], state: join(root, "state"), say: (l) => said.push(l) });
  assert.equal(pass.seen, 1, "main was counted as a branch to push");
  assert.equal(pass.moved, 1);
  assert.ok(checkoutsUnder(root).some((d) => d.endsWith("deep")), "a checkout two levels down was never looked at");
});

test("a box keeps pushing on its own clock, and one pass that throws does not stop the next", () => {
  const root = mkdtempSync(join(tmpdir(), "hive-autopush-"));
  const dir = checkout(root, "repo", "joao/-/work");
  const state = join(root, "state");
  const said = [];
  let tick = null;
  const timer = keepPushing({ roots: [root], state, say: (l) => said.push(l), wait: (fn) => { tick = fn; return { unref() {} }; } });
  assert.ok(timer, "nothing was scheduled, so the box would push once and never again");
  assert.match(said.join(" | "), /pushed joao\/-\/work/, "the first pass never ran");

  said.length = 0;
  writeFileSync(join(dir, "a.txt"), "two");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "two");
  tick();
  assert.match(said.join(" | "), /pushed joao\/-\/work/, "the scheduled pass never pushed what moved");

  said.length = 0;
  const brokenPass = keepPushing({ roots: ["/nowhere at all"], state: "/nowhere at all/state", say: (l) => said.push(l), wait: () => ({ unref() {} }) });
  assert.ok(brokenPass, "a root that cannot be read stopped the box from ever trying again");
  assert.match(said.join(" | "), /autopush stumbled|nothing new/);
});

test("a box names its own roots, and a machine with no hub has nothing to push", () => {
  assert.deepEqual(rootsOf({ workspace: "/nowhere", hub: "" }), []);
  assert.deepEqual(rootsOf({ workspace: "/nowhere", hub: "/h" }), ["/h", "/h/.worktrees"]);
});
