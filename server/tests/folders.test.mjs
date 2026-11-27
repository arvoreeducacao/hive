import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFolders, folderAsked } from "../folders.mjs";

function home() {
  const at = mkdtempSync(join(tmpdir(), "hive-folders-"));
  mkdirSync(join(at, "Projects", "hub", ".git"), { recursive: true });
  mkdirSync(join(at, "Projects", "notes"), { recursive: true });
  mkdirSync(join(at, "Documents"));
  mkdirSync(join(at, ".config"));
  writeFileSync(join(at, "readme.txt"), "a file is not a folder");
  symlinkSync(join(at, "Projects"), join(at, "work"));
  symlinkSync(join(at, "readme.txt"), join(at, "note"));
  return at;
}

test("a folder is asked for from the root or from ~, and nothing else is a path", () => {
  assert.equal(folderAsked("", "/home/ana"), "/home/ana");
  assert.equal(folderAsked("~", "/home/ana"), "/home/ana");
  assert.equal(folderAsked("~/Projects/", "/home/ana"), "/home/ana/Projects");
  assert.equal(folderAsked("/srv//app/../hub/", "/home/ana"), "/srv/hub");
  assert.equal(folderAsked("/", "/home/ana"), "/");
  assert.equal(folderAsked("Projects", "/home/ana"), "");
  assert.equal(folderAsked("/srv/\0x", "/home/ana"), "");
});

test("the home folder lists its folders by name, with the files and the hidden ones left out", () => {
  const at = home();
  try {
    const said = createFolders({ home: at }).list("");
    assert.equal(said.path, at);
    assert.equal(said.home, at);
    assert.deepEqual(said.folders.map((one) => one.name), ["Documents", "Projects", "work"]);
    assert.equal(said.more, 0);
    assert.ok(said.parent && said.parent !== at);
    const all = createFolders({ home: at }).list("~", { hidden: true });
    assert.ok(all.folders.some((one) => one.name === ".config"));
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test("a folder that holds a git repository says so, on the row and on the folder itself", () => {
  const at = home();
  try {
    const folders = createFolders({ home: at });
    const projects = folders.list("~/Projects");
    assert.deepEqual(projects.folders, [{ name: "hub", git: true }, { name: "notes", git: false }]);
    assert.equal(projects.git, false);
    assert.equal(folders.list(join(at, "Projects", "hub")).git, true);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test("what is not there, or is a file, is said in words the person can act on", () => {
  const at = home();
  try {
    const folders = createFolders({ home: at });
    assert.match(folders.list(join(at, "nowhere")).error, /is not a folder on this server/);
    assert.match(folders.list(join(at, "readme.txt")).error, /is a file, not a folder/);
    assert.match(folders.list("Projects").error, /whole path/);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test("a folder with more rows than one answer carries says how many it left out, and the root has no parent", () => {
  const rows = ["c", "a", "b"].map((name) => ({ name, isDirectory: () => true, isSymbolicLink: () => false }));
  const folders = createFolders({ home: "/home/ana", list: () => rows, exists: () => false, ceiling: 2 });
  const said = folders.list("/");
  assert.deepEqual(said.folders.map((one) => one.name), ["a", "b"]);
  assert.equal(said.more, 1);
  assert.equal(said.parent, "");
});
