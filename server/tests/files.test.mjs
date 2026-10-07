import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFiles, askedPath, allowedToRead, allowedToWrite, rootsOf } from "../files.mjs";

function workspace() {
  const base = mkdtempSync(join(tmpdir(), "hive-files-"));
  for (const one of ["repos", "worktrees", "hive", "home"]) mkdirSync(join(base, one), { recursive: true });
  mkdirSync(join(base, "repos", "a-repo"), { recursive: true });
  writeFileSync(join(base, "repos", "a-repo", "read-me.txt"), "what the seat wrote");
  return base;
}

const filesOf = (base, extra = {}) => createFiles({ roots: ["repos", "worktrees", "hive", "home"].map((one) => join(base, one)), ...extra });

test("a whole path is required, and nothing relative is a path", () => {
  assert.equal(askedPath("repos/a-repo/x"), "");
  assert.equal(askedPath(""), "");
  assert.equal(askedPath("/workspace/repos/./a/../b"), "/workspace/repos/b");
});

test("a file inside the workspace comes back, and its bytes are the bytes on disk", () => {
  const base = workspace();
  const said = filesOf(base).read(join(base, "repos", "a-repo", "read-me.txt"));
  assert.equal(said.error, undefined);
  assert.equal(Buffer.from(said.data, "base64").toString(), "what the seat wrote");
  assert.equal(said.bytes, "what the seat wrote".length);
});

test("a file that is not there says so instead of stumbling", () => {
  const base = workspace();
  assert.match(filesOf(base).read(join(base, "repos", "a-repo", "nothing.txt")).error, /no such file/);
});

test("nothing outside the workspace is readable, however the path is spelled", () => {
  const base = workspace();
  const files = filesOf(base);
  for (const path of ["/etc/passwd", join(base, "repos", "..", "..", "etc", "passwd"), join(base, "secret.txt")]) {
    assert.match(files.read(path).error, /outside what this server holds|no such file/, path);
  }
});

test("a symlink pointing out of the workspace does not become a way out", () => {
  const base = workspace();
  const outside = mkdtempSync(join(tmpdir(), "hive-elsewhere-"));
  writeFileSync(join(outside, "prize.txt"), "not yours");
  symlinkSync(join(outside, "prize.txt"), join(base, "repos", "a-repo", "shortcut.txt"));
  assert.match(filesOf(base).read(join(base, "repos", "a-repo", "shortcut.txt")).error, /outside what this server holds/);
});

test("a write lands, and makes the folders it needs on the way", () => {
  const base = workspace();
  const at = join(base, "worktrees", "mine", "deep", "new.txt");
  const said = filesOf(base).write(at, Buffer.from("landed").toString("base64"));
  assert.equal(said.error, undefined);
  assert.equal(readFileSync(at, "utf8"), "landed");
});

test("a write outside the workspace is refused before a single folder is made", () => {
  const base = workspace();
  const outside = mkdtempSync(join(tmpdir(), "hive-elsewhere-"));
  const at = join(outside, "made", "up", "tree.txt");
  const said = filesOf(base).write(at, Buffer.from("no").toString("base64"));
  assert.match(said.error, /outside what this server holds/);
  assert.equal(existsSync(join(outside, "made")), false, "the folder was created before the path was judged");
  assert.equal(existsSync(at), false);
});

test("a write through a symlinked folder that leaves the workspace is refused", () => {
  const base = workspace();
  const outside = mkdtempSync(join(tmpdir(), "hive-elsewhere-"));
  symlinkSync(outside, join(base, "repos", "away"));
  const said = filesOf(base).write(join(base, "repos", "away", "taken.txt"), Buffer.from("no").toString("base64"));
  assert.match(said.error, /outside what this server holds/);
  assert.equal(existsSync(join(outside, "taken.txt")), false);
});

test("a body past the ceiling is refused, reading and writing alike", () => {
  const base = workspace();
  const files = filesOf(base, { ceiling: 8 });
  assert.match(files.write(join(base, "hive", "big.bin"), Buffer.alloc(9).toString("base64")).error, /past what one answer carries/);
  writeFileSync(join(base, "hive", "already-big.bin"), Buffer.alloc(64));
  assert.match(files.read(join(base, "hive", "already-big.bin")).error, /past what one answer carries/);
});

test("the roots are worked out from the workspace, and are the four folders a seat lives in", () => {
  assert.deepEqual(rootsOf({ HIVE_WORKSPACE: "/w" }), ["/w/repos", "/w/worktrees", "/w/hive", "/w/home"]);
});

test("what may be read and what may be written answer separately", () => {
  const base = workspace();
  const roots = ["repos", "worktrees", "hive", "home"].map((one) => join(base, one));
  assert.equal(allowedToRead(join(base, "repos", "a-repo", "read-me.txt"), roots), true);
  assert.equal(allowedToRead(join(base, "repos", "a-repo", "not-there.txt"), roots), false, "reading needs the file to be there");
  assert.equal(allowedToWrite(join(base, "repos", "a-repo", "not-there.txt"), roots), true, "writing only needs a home for it");
  assert.equal(allowedToWrite("/etc/passwd", roots), false);
});
