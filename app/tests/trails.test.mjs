import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TRAILS_KEPT, repoAt, repoRootOf, seatTrees, trailCwds, treesOfSeat } from "../lib/trails.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" });

async function sandbox() {
  return realpathSync(await mkdtemp(join(tmpdir(), "hive-trails-")));
}

async function repo(dir, name) {
  const at = join(dir, name);
  await mkdir(at, { recursive: true });
  git(at, "init", "-q", "-b", "main");
  git(at, "config", "user.email", "t@t.t");
  git(at, "config", "user.name", "t");
  await writeFile(join(at, "readme"), "x");
  git(at, "add", ".");
  git(at, "commit", "-qm", "first");
  return at;
}

test("the root of a folder is the repo it sits in, and a nested repo wins over the one above it", async () => {
  const dir = await sandbox();
  const hub = await repo(dir, "hub");
  const inner = await repo(hub, "api");
  await mkdir(join(inner, "src", "deep"), { recursive: true });
  assert.equal(repoRootOf(join(inner, "src", "deep")), inner);
  assert.equal(repoRootOf(join(hub, "docs")), hub);
  assert.equal(repoRootOf("/definitely/not/here"), "");
  await rm(dir, { recursive: true, force: true });
});

test("a worktree says which repo it belongs to, not what its folder is called", async () => {
  const dir = await sandbox();
  const main = await repo(dir, "dev-workspaces");
  const tree = join(dir, "hive-humor");
  git(main, "worktree", "add", "-q", "-b", "joao/-/humor", tree);

  const it = repoAt(tree);
  assert.equal(it.repo, "dev-workspaces");
  assert.equal(it.branch, "joao/-/humor");
  assert.equal(it.main, false);

  const home = repoAt(main);
  assert.equal(home.repo, "dev-workspaces");
  assert.equal(home.branch, "main");
  assert.equal(home.main, true);
  await rm(dir, { recursive: true, force: true });
});

test("a chat that walked three repos shows the three, newest first", async () => {
  const dir = await sandbox();
  const hub = await repo(dir, "hub");
  const api = await repo(hub, "api-arvore");
  const front = await repo(hub, "frontend");
  const dirs = [hub, api, join(front, "src"), hub, api];

  const trees = seatTrees({ dirs });
  assert.deepEqual(trees.map((t) => t.repo), ["api-arvore", "hub", "frontend"]);
  await rm(dir, { recursive: true, force: true });
});

test("a seat that has a worktree is never credited with the branch someone else left in the shared checkout", async () => {
  const dir = await sandbox();
  const hub = await repo(dir, "hub");
  const main = await repo(dir, "dev-workspaces");
  git(main, "checkout", "-q", "-b", "outra-pessoa/-/a-etiqueta");
  const tree = join(dir, "uma-conexao");
  git(main, "worktree", "add", "-q", "-b", "joao/-/uma-conexao", tree);
  const dirs = [hub, main, tree];

  const trees = seatTrees({ dirs });
  assert.deepEqual(trees.map((t) => t.branch), ["joao/-/uma-conexao"]);
  assert.deepEqual(trees.map((t) => t.path), [tree]);
  await rm(dir, { recursive: true, force: true });
});

test("a seat that never left the shared checkout says which repo, and no branch it does not own", async () => {
  const dir = await sandbox();
  const main = await repo(dir, "dev-workspaces");
  git(main, "checkout", "-q", "-b", "outra-pessoa/-/a-etiqueta");
  const dirs = [join(main, "app")];

  const trees = seatTrees({ dirs });
  assert.deepEqual(trees.map((t) => t.repo), ["dev-workspaces"]);
  assert.deepEqual(trees.map((t) => t.branch), [""]);
  await rm(dir, { recursive: true, force: true });
});

test("the list is capped, so a card never grows a tail of chips", async () => {
  const dir = await sandbox();
  const made = [];
  for (const name of ["a", "b", "c", "d", "e"]) made.push(await repo(dir, name));
  const dirs = [...made];

  const trees = seatTrees({ dirs }, 2);
  assert.deepEqual(trees.map((t) => t.repo), ["e", "d"]);
  await rm(dir, { recursive: true, force: true });
});

test("a seat that never told where it worked still says where it was opened", async () => {
  const dir = await sandbox();
  const hub = await repo(dir, "hub");
  const trees = seatTrees({ cwd: join(hub, "app") });
  assert.deepEqual(trees.map((t) => t.repo), ["hub"]);
  await rm(dir, { recursive: true, force: true });
});

test("a folder that belongs to no repo is not a worktree and is left out", async () => {
  const dir = await sandbox();
  const dirs = [join(dir, "loose")];
  assert.deepEqual(seatTrees({ dirs }), []);
  await rm(dir, { recursive: true, force: true });
});

test("a seat the fleet never named has no trees to show", () => {
  const trails = new Map();
  assert.deepEqual(treesOfSeat(trails, { cwd: "/x" }, ["/x"]), []);
  assert.equal(trails.size, 0);
});

test("a seat still on the screen is never the one dropped when the trails are pruned", async () => {
  const dir = await sandbox();
  const hub = await repo(dir, "hub");
  const dirs = [hub];
  const trails = new Map();
  for (let n = 0; n < TRAILS_KEPT + 20; n++) treesOfSeat(trails, { id: `s${n}`, cwd: hub }, dirs);
  assert.equal(trails.size, TRAILS_KEPT);

  const mine = { id: "s5", cwd: hub };
  treesOfSeat(trails, mine, dirs);
  const before = trails.size;
  treesOfSeat(trails, mine, dirs);
  assert.equal(trails.size, before, "reading the same seat again must not evict a neighbour");
  assert.ok(trails.has("s5"));
  await rm(dir, { recursive: true, force: true });
});

test("the tail of an old transcript still says which folders the chat walked through", () => {
  const raw = ['{"type":"user","cwd":"/a"}', '{"type":"user","cwd":"app"}', '{"type":"user","cwd":"/b"}', '{"type":"user","cwd":"/a"}'].join("\n");
  assert.deepEqual(trailCwds(raw), ["/a", "/b", "/a"]);
  assert.deepEqual(trailCwds(""), []);
});
