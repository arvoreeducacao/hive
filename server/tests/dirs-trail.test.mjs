import { test } from "node:test";
import assert from "node:assert/strict";

import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DIRS_KEPT, inputDirs, makeDirsTrail, toolDirs, workedIn } from "../engine/seat-core.mjs";
import { itemDirs } from "../engine/codex-app-server.mjs";

test("a folder worked in again moves to the end instead of showing twice", () => {
  assert.deepEqual(workedIn(["/a", "/b", "/c"], "/a"), ["/b", "/c", "/a"]);
});

test("staying in the same folder leaves the very same list, so nothing is written", () => {
  const dirs = ["/a", "/b"];
  assert.equal(workedIn(dirs, "/b"), dirs);
});

test("a folder that is not an absolute path is not a place anyone can point at", () => {
  const dirs = ["/a"];
  assert.equal(workedIn(dirs, "app"), dirs);
  assert.equal(workedIn(dirs, undefined), dirs);
});

test("the list keeps only the most recent folders", () => {
  let dirs = [];
  for (let n = 0; n < DIRS_KEPT + 5; n++) dirs = workedIn(dirs, `/d${n}`);
  assert.equal(dirs.length, DIRS_KEPT);
  assert.equal(dirs[0], "/d5");
  assert.equal(dirs.at(-1), `/d${DIRS_KEPT + 4}`);
});

test("the trail is written to the session only when the folder changes", () => {
  const written = [];
  const trail = makeDirsTrail(["/a"], (patch) => written.push(patch));
  trail.note("/a");
  trail.note("/b");
  trail.note("/b");
  trail.note("/a");
  assert.deepEqual(written, [{ dirs: ["/a", "/b"] }, { dirs: ["/b", "/a"] }]);
  assert.deepEqual(trail.dirs, ["/b", "/a"]);
});

test("a session file that holds no trail, or a broken one, starts an empty trail", () => {
  assert.deepEqual(makeDirsTrail(undefined, () => {}).dirs, []);
  assert.deepEqual(makeDirsTrail(["/a", 3, null], () => {}).dirs, ["/a"]);
});

const toolCall = (name, input) => ({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name, input }] } });

test("a file an agent reads or edits puts its folder on the trail, relative paths read from where the seat opened", () => {
  assert.deepEqual(toolDirs(toolCall("edit", { file_path: "src/a.js" }), "/repo"), ["/repo/src"]);
  assert.deepEqual(toolDirs(toolCall("read", { filePath: "/wt/app/b.js" }), "/repo"), ["/wt/app"]);
});

test("a tool that names the folder it runs in puts that folder on the trail", () => {
  assert.deepEqual(toolDirs(toolCall("bash", { command: "npm test", workdir: "/wt" }), "/repo"), ["/wt"]);
});

test("a path that is a folder stays that folder instead of its parent", async () => {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "hive-dirs-")));
  await mkdir(join(dir, "wt"));
  assert.deepEqual(toolDirs(toolCall("glob", { path: join(dir, "wt") }), "/repo"), [join(dir, "wt")]);
  await rm(dir, { recursive: true, force: true });
});

test("a shell command, a text reply and a multi-line value say nothing about where the seat is", () => {
  assert.deepEqual(toolDirs(toolCall("shell", { command: "cd /elsewhere && ls" }), "/repo"), []);
  assert.deepEqual(toolDirs({ type: "assistant", message: { content: [{ type: "text", text: "/repo/x" }] } }, "/repo"), []);
  assert.deepEqual(toolDirs(toolCall("edit", { file_path: "a\nb" }), "/repo"), []);
  assert.deepEqual(toolDirs({ type: "user", message: { content: [] } }, "/repo"), []);
});

test("codex says the folder of every command it runs and of every file it changes", () => {
  assert.deepEqual(itemDirs({ type: "commandExecution", command: "pwd", cwd: "/wt" }, "/repo"), ["/wt"]);
  assert.deepEqual(itemDirs({ type: "fileChange", changes: [{ path: "/wt/a/b.js", kind: "update" }, { path: "c.js" }] }, "/repo"), ["/wt/a", "/repo"]);
  assert.deepEqual(itemDirs({ type: "agentMessage", text: "hi" }, "/repo"), []);
});

test("several folders from one tool call land in one write", () => {
  const written = [];
  const trail = makeDirsTrail([], (patch) => written.push(patch));
  trail.note("/a", "/b", "/a");
  assert.deepEqual(written, [{ dirs: ["/b", "/a"] }]);
});

test("what the claude hook hands over is read the same way as any other agent's tool call", () => {
  assert.deepEqual(inputDirs({ file_path: "/wt/app/a.mjs" }, "/repo"), ["/wt/app"]);
  assert.deepEqual(inputDirs({ command: "ls" }, "/repo"), []);
  assert.deepEqual(inputDirs(undefined, "/repo"), []);
});

test("a path that ends in a slash is a folder without anyone asking the disk", () => {
  assert.deepEqual(inputDirs({ path: "/nowhere/at/all/" }, "/repo"), ["/nowhere/at/all"]);
});
