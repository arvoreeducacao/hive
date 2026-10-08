import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CHANGES_SCRIPT, DIFF_SCRIPT, DISCARD_SCRIPT, changeSignature, isChangePath, readChanges, readDiff } from "../lib/changes.mjs";
import { registerChangesRoutes } from "../routes/changes.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

const bash = (script, ...args) => {
  try { return execFileSync("bash", ["-c", script, "seat", ...args], { stdio: "pipe" }).toString(); }
  catch (e) { return String(e.stdout || ""); }
};

async function repo() {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "hive-changes-")));
  const at = join(dir, "api");
  await mkdir(join(at, "src"), { recursive: true });
  git(at, "init", "-q", "-b", "main");
  git(at, "config", "user.email", "t@t.t");
  git(at, "config", "user.name", "t");
  await writeFile(join(at, "src", "sum.ts"), "const a = 1;\nconst b = 2;\nexport { a, b };\n");
  await writeFile(join(at, "src", "gone.ts"), "bye\n");
  await writeFile(join(at, "cover.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
  git(at, "add", ".");
  git(at, "commit", "-qm", "first");
  git(at, "branch", "-q", "base-line");
  git(at, "checkout", "-q", "-b", "jonas/-/liquid");
  git(at, "update-ref", "refs/remotes/origin/main", "base-line");
  await writeFile(join(at, "src", "later.ts"), "later\n");
  git(at, "add", ".");
  git(at, "commit", "-qm", "fix(oms): net after the sum");
  return { dir, at };
}

async function dirty(at) {
  await writeFile(join(at, "src", "sum.ts"), "const a = 1;\nconst net = 3;\nconst c = 4;\nexport { a, net, c };\n");
  await writeFile(join(at, "src", "new file.ts"), "one\ntwo\n");
  await rm(join(at, "src", "gone.ts"));
  await writeFile(join(at, "cover.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 9, 9, 9]));
}

function routesOn(at) {
  const routes = [];
  const run = (script, extra = []) => bash(script, at, ...extra);
  registerChangesRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    bodyOf: async (req) => req.body,
    isSeatName: (name) => name === "seat",
    seatChanges: async () => readChanges(run(CHANGES_SCRIPT)),
    seatDiff: async ({ path }) => readDiff(run(DIFF_SCRIPT, [path])),
    discardChange: async ({ path }) => (run(DISCARD_SCRIPT, [path]).includes("#hive:done") ? { ok: true } : { error: "no" }),
    openChange: async () => ({ ok: true })
  });
  return async (path, { method = "GET", body } = {}) => {
    const url = new URL(path, "http://hive");
    const route = routes.find((one) => one.path === url.pathname && (one.method === null || one.method === method));
    let answer = null;
    await route.handler({ method, body }, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
}

test("the changes route lists what the worktree changed, with counts, and the commits ahead of the base", async () => {
  const { dir, at } = await repo();
  await dirty(at);
  const call = routesOn(at);
  const { value, status } = await call("/api/changes?name=seat");
  assert.equal(status, 200);
  assert.equal(value.state, "ok");
  assert.equal(value.repo, "api");
  assert.equal(value.branch, "jonas/-/liquid");
  assert.equal(value.base, "origin/main");
  const byPath = Object.fromEntries(value.files.map((file) => [file.path, file]));
  assert.deepEqual(Object.keys(byPath).sort(), ["cover.png", "src/gone.ts", "src/new file.ts", "src/sum.ts"]);
  assert.deepEqual({ ...byPath["src/sum.ts"] }, { status: "M", path: "src/sum.ts", from: "", untracked: false, added: 3, removed: 2, binary: false });
  assert.deepEqual([byPath["src/new file.ts"].status, byPath["src/new file.ts"].added, byPath["src/new file.ts"].untracked], ["A", 2, true]);
  assert.deepEqual([byPath["src/gone.ts"].status, byPath["src/gone.ts"].removed], ["D", 1]);
  assert.equal(byPath["cover.png"].binary, true);
  assert.equal(value.added, 5);
  assert.equal(value.removed, 3);
  assert.deepEqual(value.ahead.map((one) => one.subject), ["fix(oms): net after the sum"]);
  assert.match(value.ahead[0].sha, /^[0-9a-f]{7,}$/);
  await rm(dir, { recursive: true, force: true });
});

test("the diff route numbers both sides, reads a new file whole and calls a binary a binary", async () => {
  const { dir, at } = await repo();
  await dirty(at);
  const call = routesOn(at);
  const changed = (await call("/api/changes/diff?name=seat&path=src/sum.ts")).value;
  assert.equal(changed.binary, false);
  assert.equal(changed.hunks.length, 1);
  assert.equal(changed.hunks[0].head, "@@ -1,3 +1,4 @@");
  assert.deepEqual(changed.hunks[0].lines.map((line) => [line.kind, line.old, line.new]), [
    ["ctx", 1, 1], ["del", 2, 0], ["del", 3, 0], ["add", 0, 2], ["add", 0, 3], ["add", 0, 4]
  ]);
  assert.equal(changed.hunks[0].lines[3].text, "const net = 3;");

  const fresh = (await call(`/api/changes/diff?name=seat&path=${encodeURIComponent("src/new file.ts")}`)).value;
  assert.deepEqual(fresh.hunks[0].lines.map((line) => [line.kind, line.new, line.text]), [["add", 1, "one"], ["add", 2, "two"]]);

  const picture = (await call("/api/changes/diff?name=seat&path=cover.png")).value;
  assert.equal(picture.binary, true);
  assert.deepEqual([picture.before, picture.after], [7, 8]);
  await rm(dir, { recursive: true, force: true });
});

test("discarding puts a tracked file back and removes a new one, and nothing else moves", async () => {
  const { dir, at } = await repo();
  await dirty(at);
  const call = routesOn(at);
  assert.deepEqual((await call("/api/changes/discard", { method: "POST", body: { name: "seat", path: "src/sum.ts" } })).value, { ok: true });
  assert.equal(readFileSync(join(at, "src", "sum.ts"), "utf8"), "const a = 1;\nconst b = 2;\nexport { a, b };\n");
  assert.deepEqual((await call("/api/changes/discard", { method: "POST", body: { name: "seat", path: "src/new file.ts" } })).value, { ok: true });
  assert.equal(existsSync(join(at, "src", "new file.ts")), false);
  const left = (await call("/api/changes?name=seat")).value.files.map((file) => file.path).sort();
  assert.deepEqual(left, ["cover.png", "src/gone.ts"]);
  await rm(dir, { recursive: true, force: true });
});

test("a clean worktree has nothing to show, and a folder that went away says so", async () => {
  const { dir, at } = await repo();
  const call = routesOn(at);
  const clean = (await call("/api/changes?name=seat")).value;
  assert.deepEqual([clean.state, clean.files.length, clean.added, clean.removed], ["ok", 0, 0, 0]);
  await rm(dir, { recursive: true, force: true });
  assert.equal((await call("/api/changes?name=seat")).value.state, "gone");
  assert.equal((await call("/api/changes/diff?name=seat&path=src/sum.ts")).value.state, "gone");
});

test("a path outside the worktree is refused before it reaches git", () => {
  for (const bad of ["", "/etc/passwd", "../up", "a/../../b", "-rf", "a\\b", "a\nb"]) assert.equal(isChangePath(bad), false, bad);
  for (const good of ["src/a.ts", "README.md", "src/new file.ts", ".github/workflows/ci.yml"]) assert.equal(isChangePath(good), true, good);
});

test("renames land on the new name and the signature changes when the file changes again", () => {
  const read = readChanges([
    "#hive:top", "/w/api", "#hive:branch", "main", "#hive:head", "abc1234", "#hive:base", "origin/main",
    "#hive:status", "R  src/old.ts -> src/new.ts", ' M "src/with space.ts"',
    "#hive:numstat", "1\t1\tsrc/{old.ts => new.ts}", "2\t0\tsrc/with space.ts",
    "#hive:ahead", "#hive:end"
  ].join("\n"));
  assert.deepEqual(read.files.map((file) => [file.status, file.path, file.from, file.added]), [
    ["R", "src/new.ts", "src/old.ts", 1], ["M", "src/with space.ts", "", 2]
  ]);
  assert.notEqual(changeSignature(read.files[1]), changeSignature({ ...read.files[1], added: 3 }));
  assert.equal(readChanges("half an answer").state, "unread");
});

function harness(overrides = {}) {
  const routes = [];
  const calls = [];
  registerChangesRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    bodyOf: async (req) => req.body,
    isSeatName: (name) => name === "seat",
    seatChanges: async (asked) => { calls.push(["seatChanges", asked]); return { state: "ok", files: [], ahead: [] }; },
    seatDiff: async (asked) => { calls.push(["seatDiff", asked]); return { state: "ok", hunks: [] }; },
    discardChange: async (asked) => { calls.push(["discardChange", asked]); return { ok: true }; },
    openChange: async (asked) => { calls.push(["openChange", asked]); return { ok: true, editor: "code" }; },
    ...overrides
  });
  const call = async (path, { method = "GET", body } = {}) => {
    const url = new URL(path, "http://hive");
    const route = routes.find((one) => one.path === url.pathname && (one.method === null || one.method === method));
    let answer = null;
    await route.handler({ method, body }, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  return { routes, calls, call };
}

test("the changes routes are four doors of their own, next to the files", () => {
  assert.deepEqual(harness().routes.map(({ method, path }) => [method, path]), [
    [null, "/api/changes"],
    [null, "/api/changes/diff"],
    ["POST", "/api/changes/discard"],
    ["POST", "/api/changes/open"]
  ]);
});

test("changes validates the seat and the path before git hears of them", async () => {
  const hive = harness();
  assert.deepEqual(await hive.call("/api/changes?name=missing"), { value: { error: "unknown session" }, status: 400 });
  assert.deepEqual(await hive.call("/api/changes/diff?name=seat&path=../etc/passwd"), { value: { error: "that is not a path I will read" }, status: 400 });
  assert.deepEqual(await hive.call("/api/changes/diff?name=seat&path=/etc/passwd"), { value: { error: "that is not a path I will read" }, status: 400 });
  assert.deepEqual(await hive.call("/api/changes/discard", { method: "POST", body: { name: "seat", path: "-rf" } }), { value: { error: "that is not a path I will touch" }, status: 400 });
  assert.equal(hive.calls.length, 0);

  await hive.call("/api/changes?name=seat&where=cloud&tree=/w/api");
  await hive.call("/api/changes/diff?name=seat&path=src/a.ts");
  assert.deepEqual(hive.calls, [
    ["seatChanges", { name: "seat", where: "cloud", tree: "/w/api" }],
    ["seatDiff", { name: "seat", where: "local", tree: "", path: "src/a.ts" }]
  ]);
});

test("opening in the editor is for this machine only, and a refused discard says so", async () => {
  const hive = harness();
  assert.deepEqual(await hive.call("/api/changes/open", { method: "POST", body: { name: "seat", where: "cloud", path: "a.ts" } }), {
    value: { error: "a cloud seat's files are not on this machine" }, status: 409
  });
  assert.deepEqual(await hive.call("/api/changes/open", { method: "POST", body: { name: "seat", path: "a.ts", line: "x" } }), {
    value: { ok: true, editor: "code" }, status: 200
  });
  assert.deepEqual(hive.calls, [["openChange", { name: "seat", where: "local", tree: "", path: "a.ts", line: 1 }]]);

  const stuck = harness({ discardChange: async () => ({ error: "locked" }) });
  assert.deepEqual(await stuck.call("/api/changes/discard", { method: "POST", body: { name: "seat", path: "a.ts" } }), {
    value: { error: "locked" }, status: 409
  });
});

test("the server hands the changes routes their four helpers and serves the view helpers", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /registerChangesRoutes\(on, \{ bodyOf: body, isSeatName, seatChanges, seatDiff, discardChange, openChange \}\);/);
  assert.match(server, /"\/assets\/changes-view\.mjs": \["assets\/changes-view\.mjs", "text\/javascript"\]/);
});
