import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync, symlinkSync } from "node:fs";
import { mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FILE_SHOWN, TREES_KEPT, TREE_SCRIPT, createProjectFiles, findPaths, isProjectPath, listDir, readTree, treeIndex } from "../lib/project-files.mjs";
import { registerProjectFileRoutes } from "../routes/project-files.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

async function project() {
  const base = realpathSync(await mkdtemp(join(tmpdir(), "hive-project-files-")));
  const root = join(base, "repo");
  await mkdir(join(root, "src", "deep", "only", "here"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t.t");
  git(root, "config", "user.name", "t");
  await writeFile(join(root, ".gitignore"), "node_modules/\n.env\n");
  await writeFile(join(root, ".env"), "TOKEN=secret\n");
  await writeFile(join(root, "README.md"), "# Lote\n\n```mermaid\ngraph TD; A-->B\n```\n");
  await writeFile(join(root, "src", "lote.ts"), "export const a = '<b>';\nexport const b = 2;\n");
  await writeFile(join(root, "src", "deep", "only", "here", "leaf.ts"), "leaf\n");
  await writeFile(join(root, "src", "gone.ts"), "bye\n");
  await writeFile(join(root, "node_modules", "left-pad", "index.js"), "x\n");
  await writeFile(join(root, "cover.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 0]));
  git(root, "add", ".");
  git(root, "commit", "-qm", "first");
  await unlink(join(root, "src", "gone.ts"));
  await writeFile(join(root, "docs", "new note.md"), "new\n");
  await writeFile(join(base, "outside.txt"), "not yours\n");
  symlinkSync(join(base, "outside.txt"), join(root, "docs", "escape.md"));
  symlinkSync(join(root, "README.md"), join(root, "docs", "readme-link.md"));
  const nested = join(root, "vendor-repo");
  await mkdir(join(nested, "lib"), { recursive: true });
  git(nested, "init", "-q", "-b", "main");
  await writeFile(join(nested, "lib", "inner.ex"), "defmodule Inner do end\n");
  return { base, root, done: () => rm(base, { recursive: true, force: true }) };
}

const bashIn = (dir) => async (asked, script, extra = []) => {
  try {
    return { ok: true, out: execFileSync("bash", ["-c", script, asked.name, dir, ...extra], { stdio: "pipe", maxBuffer: 8 << 20 }).toString(), error: "", dir };
  } catch (wrong) {
    return { ok: false, out: String(wrong.stdout || ""), error: String(wrong.stderr || ""), dir };
  }
};

function routesFor(dir, overrides = {}) {
  const routes = [];
  const files = createProjectFiles({ run: bashIn(dir), ...overrides });
  registerProjectFileRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    isSeatName: (name) => name === "seat",
    projectFiles: files,
    languageOf: (path) => (path.endsWith(".ts") ? "typescript" : ""),
    paintLines: (text, language) => text.split("\n").map((line) => `${language ? "<span class=\"hl\">" : ""}${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}${language ? "</span>" : ""}`)
  });
  return async (path) => {
    const url = new URL(path, "http://hive");
    const route = routes.find((one) => one.path === url.pathname);
    let answer = null;
    await route.handler({ method: "GET" }, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
}

test("a path that could leave the chat's folder is never asked for", () => {
  for (const good of ["src/lote.ts", "docs/new note.md", ".github/workflows/ci.yml", "a"]) assert.ok(isProjectPath(good), good);
  for (const bad of ["", "/etc/passwd", "../outside.txt", "src/../../x", "-rf", "src\\lote.ts", "a\nb", "./src", "src//lote.ts", "a\0b"]) assert.ok(!isProjectPath(bad), JSON.stringify(bad));
});

test("the tree lists what git lists: tracked, new and not ignored, minus what was deleted", async () => {
  const { root, done } = await project();
  try {
    const raw = execFileSync("bash", ["-c", TREE_SCRIPT, "seat", root, ""]).toString();
    const tree = readTree(raw);
    assert.equal(tree.state, "ok");
    assert.equal(tree.git, true);
    assert.ok(tree.files.includes("src/lote.ts"));
    assert.ok(tree.files.includes("docs/new note.md"), "a new file shows up before it is committed");
    assert.ok(!tree.files.includes(".env"), "an ignored file stays out");
    assert.ok(!tree.files.some((path) => path.startsWith("node_modules/")));
    assert.ok(!tree.files.includes("src/gone.ts"), "a deleted file is not offered");
    assert.deepEqual(tree.nested, ["vendor-repo"]);
  } finally { await done(); }
});

test("a folder opens one level at a time, and a chain of lone folders reads as one row", () => {
  const index = treeIndex(["README.md", "src/lote.ts", "src/deep/only/here/leaf.ts", "src/a10.ts", "src/a9.ts", "docs/x.md"], ["vendor-repo"]);
  const top = listDir(index, "");
  assert.deepEqual(top.dirs.map((one) => one.name), ["docs", "src", "vendor-repo"]);
  assert.equal(top.dirs.find((one) => one.name === "vendor-repo").nested, true);
  assert.deepEqual(top.files.map((one) => one.path), ["README.md"]);
  const src = listDir(index, "src");
  assert.deepEqual(src.dirs, [{ name: "deep/only/here", path: "src/deep/only/here", nested: false }]);
  assert.deepEqual(src.files.map((one) => one.name), ["a9.ts", "a10.ts", "lote.ts"]);
  assert.equal(listDir(index, "nowhere").missing, true);
});

test("the filter ranks the name over the path and stops at a cap", () => {
  const files = ["src/lote.ts", "src/lote/index.ts", "docs/sobre-lote.md", "lotes.json", "other.ts"];
  assert.deepEqual(findPaths(files, "lote").paths, ["lotes.json", "src/lote.ts", "docs/sobre-lote.md", "src/lote/index.ts"]);
  const many = Array.from({ length: 500 }, (_, at) => `f/${at}.ts`);
  const found = findPaths(many, "ts", 200);
  assert.equal(found.paths.length, 200);
  assert.equal(found.total, 500);
  assert.deepEqual(findPaths(files, "  ").paths, []);
});

test("the tree route lists a folder, filters by name and opens a nested repository on demand", async () => {
  const { root, done } = await project();
  try {
    const call = routesFor(root);
    const top = (await call("/api/tree?name=seat")).value;
    assert.equal(top.state, "ok");
    assert.equal(top.root, root);
    assert.deepEqual(top.listing.dirs.map((one) => one.name), ["docs", "src", "vendor-repo"]);
    assert.deepEqual(top.listing.files.map((one) => one.name), [".gitignore", "cover.png", "README.md"]);
    const found = (await call("/api/tree?name=seat&q=leaf")).value;
    assert.deepEqual(found.matches, ["src/deep/only/here/leaf.ts"]);
    const inner = (await call("/api/tree?name=seat&dir=vendor-repo")).value;
    assert.deepEqual(inner.listing.dirs, [{ name: "lib", path: "vendor-repo/lib", nested: false }]);
    const deeper = (await call("/api/tree?name=seat&dir=vendor-repo/lib")).value;
    assert.deepEqual(deeper.listing.files, [{ name: "inner.ex", path: "vendor-repo/lib/inner.ex" }]);
    assert.deepEqual((await call("/api/tree?name=seat&q=inner")).value.matches, ["vendor-repo/lib/inner.ex"], "an opened nested repository joins the filter");
    assert.equal((await call("/api/tree?name=seat&dir=../")).status, 400);
    assert.equal((await call("/api/tree?name=other")).status, 400);
  } finally { await done(); }
});

test("the file route reads text, refuses to leave the folder and names binary and huge files", async () => {
  const { base, root, done } = await project();
  try {
    const call = routesFor(root);
    const text = (await call("/api/tree/file?name=seat&path=src/lote.ts")).value;
    assert.equal(text.state, "ok");
    assert.equal(text.text, "export const a = '<b>';\nexport const b = 2;\n");
    assert.equal(text.language, "typescript");
    assert.equal(text.lines[0], "<span class=\"hl\">export const a = '&lt;b&gt;';</span>");
    assert.equal((await call(`/api/tree/file?name=seat&path=${encodeURIComponent("docs/new note.md")}`)).value.text, "new\n");
    assert.equal((await call("/api/tree/file?name=seat&path=docs/readme-link.md")).value.state, "ok", "a link that stays inside is fine");
    assert.equal((await call("/api/tree/file?name=seat&path=docs/escape.md")).value.state, "outside");
    assert.equal((await call("/api/tree/file?name=seat&path=../outside.txt")).status, 400);
    assert.equal((await call(`/api/tree/file?name=seat&path=${encodeURIComponent(join(base, "outside.txt"))}`)).status, 400);
    assert.equal((await call("/api/tree/file?name=seat&path=cover.png")).value.state, "binary");
    assert.equal((await call("/api/tree/file?name=seat&path=src/gone.ts")).value.state, "missing");
    assert.equal((await call("/api/tree/file?name=seat&path=src")).value.state, "folder");
    await writeFile(join(root, "huge.txt"), "x".repeat(FILE_SHOWN + 10));
    const huge = (await call("/api/tree/file?name=seat&path=huge.txt")).value;
    assert.equal(huge.state, "big");
    assert.equal(huge.size, FILE_SHOWN + 10);
  } finally { await done(); }
});

test("a folder that is not a repository is still listed, without what is usually generated", async () => {
  const base = realpathSync(await mkdtemp(join(tmpdir(), "hive-project-plain-")));
  try {
    await mkdir(join(base, "node_modules", "x"), { recursive: true });
    await mkdir(join(base, "notes"), { recursive: true });
    await writeFile(join(base, "node_modules", "x", "i.js"), "x");
    await writeFile(join(base, "notes", "a.md"), "a");
    const top = (await routesFor(base)("/api/tree?name=seat")).value;
    assert.equal(top.git, false);
    assert.deepEqual(top.listing.dirs.map((one) => one.name), ["notes"]);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("the listing is kept for a moment and asked again when forced", async () => {
  const { root, done } = await project();
  try {
    let runs = 0;
    const run = bashIn(root);
    let clock = 1000;
    const files = createProjectFiles({ run: (...args) => { runs += 1; return run(...args); }, now: () => clock });
    await files.tree({ name: "seat", where: "local" });
    await files.tree({ name: "seat", where: "local", dir: "src" });
    assert.equal(runs, 1);
    await files.tree({ name: "seat", where: "local", force: true });
    assert.equal(runs, 2);
    clock += 60000;
    await files.tree({ name: "seat", where: "local" });
    assert.equal(runs, 3);
  } finally { await done(); }
});

test("only the latest listings stay in memory", async () => {
  let runs = 0;
  const files = createProjectFiles({ run: async () => { runs += 1; return { out: "#hive:files\na.md\n#hive:end\n", dir: "/x" }; } });
  for (let at = 0; at <= TREES_KEPT; at += 1) await files.tree({ name: `seat-${at}`, where: "local" });
  assert.equal(runs, TREES_KEPT + 1);
  await files.tree({ name: `seat-${TREES_KEPT}`, where: "local" });
  assert.equal(runs, TREES_KEPT + 1, "the newest is still kept");
  await files.tree({ name: "seat-0", where: "local" });
  assert.equal(runs, TREES_KEPT + 2, "the oldest was let go");
});

test("a folder that is gone says so instead of listing nothing", async () => {
  const call = routesFor(join(tmpdir(), "hive-no-such-folder-here"));
  assert.equal((await call("/api/tree?name=seat")).value.state, "gone");
  assert.equal((await call("/api/tree/file?name=seat&path=a.md")).value.state, "gone");
});
