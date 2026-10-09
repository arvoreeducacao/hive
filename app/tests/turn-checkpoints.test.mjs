import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTurnCheckpoints } from "../lib/turn-checkpoints.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "ckpt-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "one\n");
  writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "start");
  return dir;
}

test("a turn is kept as a hidden commit, the user's stage is left alone, and a turn with no change keeps nothing new", async () => {
  const dir = repo();
  const ck = createTurnCheckpoints();
  writeFileSync(join(dir, "a.txt"), "one\nstaged\n");
  git(dir, "add", "a.txt");
  const first = await ck.capture("seat-a", dir);
  assert.equal(first.ordinal, 1);
  assert.equal(git(dir, "diff", "--cached", "--name-only").trim(), "a.txt", "what the user staged is still staged");
  assert.equal(git(dir, "for-each-ref", "refs/heads").split("\n").filter(Boolean).length, 1, "no branch was made");
  assert.deepEqual(await ck.capture("seat-a", dir), { same: true, ordinal: 1 });
  writeFileSync(join(dir, "b.txt"), "new file\n");
  writeFileSync(join(dir, "ignored.txt"), "never kept\n");
  const second = await ck.capture("seat-a", dir);
  assert.equal(second.ordinal, 2);
  const turns = await ck.turns("seat-a", dir);
  assert.deepEqual(turns.map((one) => [one.ordinal, one.added, one.removed, one.files]), [[1, 0, 0, 0], [2, 1, 0, 1]]);
  const said = await ck.diff("seat-a", dir, 2);
  assert.match(said.patch, /\+\+\+ b\/b\.txt/);
  assert.doesNotMatch(said.patch, /ignored/);
  assert.ok(readdirSync(join(dir, ".git")).every((name) => !name.startsWith("hive-checkpoint-index")), "the temporary index is gone");
});

test("going back puts the files of that turn back, keeps what was there as a new checkpoint, and leaves ignored files alone", async () => {
  const dir = repo();
  const ck = createTurnCheckpoints();
  await ck.capture("seat-b", dir);
  writeFileSync(join(dir, "a.txt"), "changed\n");
  writeFileSync(join(dir, "c.txt"), "made later\n");
  writeFileSync(join(dir, "ignored.txt"), "keep me\n");
  const back = await ck.restore("seat-b", dir, 1);
  assert.equal(back.ok, true);
  assert.equal(back.kept, 2);
  assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "one\n");
  assert.equal(existsSync(join(dir, "c.txt")), false);
  assert.equal(readFileSync(join(dir, "ignored.txt"), "utf8"), "keep me\n");
  const forward = await ck.restore("seat-b", dir, 2);
  assert.equal(forward.ok, true);
  assert.equal(readFileSync(join(dir, "c.txt"), "utf8"), "made later\n");
});

test("the observer keeps a baseline the first time and a checkpoint when a turn ends", async () => {
  const dir = repo();
  const ck = createTurnCheckpoints();
  const seat = (state) => ({ name: "seat-c", where: "local", state, trees: [{ path: dir }] });
  await ck.observe([seat("idle")]);
  assert.equal((await ck.list("seat-c", dir)).length, 1);
  await ck.observe([seat("working")]);
  writeFileSync(join(dir, "d.txt"), "turn work\n");
  await ck.observe([seat("working")]);
  assert.equal((await ck.list("seat-c", dir)).length, 1, "nothing is kept mid-turn");
  await ck.observe([seat("done")]);
  assert.equal((await ck.list("seat-c", dir)).length, 2);
  await ck.observe([{ ...seat("done"), where: "cloud", name: "other" }]);
  assert.equal((await ck.list("other", dir)).length, 0, "cloud chats are not touched from here");
  await ck.observe([{ name: "on-main", where: "local", state: "idle", trees: [{ path: dir, main: true }] }]);
  assert.equal((await ck.list("on-main", dir)).length, 0, "a main checkout is left alone — only worktrees are kept");
});

test("a bad seat name or a folder outside git keeps nothing", async () => {
  const ck = createTurnCheckpoints();
  assert.ok((await ck.capture("../x", repo())).error);
  assert.ok((await ck.capture("seat-d", mkdtempSync(join(tmpdir(), "nogit-")))).error);
});
