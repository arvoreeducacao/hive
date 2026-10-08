import { app as load, state, views } from "./dom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
await views();
const { WT_BEAT, closeWorktrees, openWorktrees, worktreeGroups, worktreesOnScreen } = await load("worktrees");
const { beatOn } = await load("core");
const { openPrs } = await load("thread");
const { openUsage } = await load("usage");
const { openWelcome } = await load("avatars");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const srv = new Function(`
  const WT_IDLE_HOURS = 1;
  const WT_SKIP = new Set([".git", "node_modules"]);
  const statSync = () => ({ mtimeMs: 0 });
  const readFileSync = () => { throw new Error("no file here"); };
  const readdirSync = () => [];
  const join = (...parts) => parts.join("/");
  ${slice(server, "function readWorktreeWalk", "let wtCache =", "server.mjs")}
  return { readWorktreeWalk, readWorktreeStats, worktreeKeep, worktreeRows, worktreeSummary };
`)();

const folders = (windows, seats, trails, saved) => new Function(`
  const HIVE_HOME = "/hive";
  const join = (...parts) => parts.join("/");
  const localWindows = async () => ${JSON.stringify(windows)};
  const fleet = new Map(${JSON.stringify(Object.entries(seats))});
  const seatKey = (where, name) => where + ":" + name;
  const trails = new Map(${JSON.stringify(Object.entries(trails))});
  const saved = ${JSON.stringify(saved)};
  const readFileSync = (path) => {
    if (!(path in saved)) throw new Error("no file here");
    return JSON.stringify(saved[path]);
  };
  ${slice(server, "async function seatFolders", "async function measureWorktrees", "server.mjs")}
  return seatFolders();
`)();

const WALK = [
  "==repo\t/hub/api/.git",
  "worktree /hub/api",
  "HEAD 1b9857c13cdf5ddeafe5274f78a6b00969baf092",
  "branch refs/heads/main",
  "",
  "worktree /tmp/scratch/wt-api",
  "HEAD b4eb8f0e23b5a0b78375634190aa79c0443862b2",
  "branch refs/heads/ViniDev-/-guard",
  "",
  "worktree /tmp/scratch/wt-old",
  "HEAD 05f8ec85cdd7f6a9d36ace9c8650e7831c900102",
  "branch refs/heads/ViniDev-/-old",
  "prunable gitdir file points to non-existent location",
  "",
  "==repo\t/hub/dev-workspaces/.git",
  "worktree /hub/dev-workspaces",
  "HEAD c0f909c0000000000000000000000000000000aa",
  "branch refs/heads/main",
  "",
  "worktree /hub/wt-hive",
  "HEAD 6b9fb170000000000000000000000000000000bb",
  "branch refs/heads/vini-dev/-/mirror",
  "locked somebody is using it",
  ""
].join("\n");

test("the walk keeps the worktrees a repo hangs off, never the repo itself", () => {
  const trees = srv.readWorktreeWalk(WALK);
  assert.deepEqual(trees.map((t) => t.path), ["/tmp/scratch/wt-api", "/tmp/scratch/wt-old", "/hub/wt-hive"]);
  assert.deepEqual(trees.map((t) => t.repo), ["api", "api", "dev-workspaces"]);
  assert.equal(trees[0].main, "/hub/api", "the repo it belongs to is where git has to be told to remove it");
  assert.equal(trees[0].branch, "ViniDev-/-guard");
  assert.equal(trees[0].head, "b4eb8f0e");
  assert.equal(trees[2].locked, true, "a lock somebody put there on purpose survives the walk");
});

test("a walk that says nothing is an empty list, not a crash", () => {
  assert.deepEqual(srv.readWorktreeWalk(""), []);
  assert.deepEqual(srv.readWorktreeWalk(undefined), []);
});

test("the stats line carries what nobody kept", () => {
  const stats = srv.readWorktreeStats("/tmp/a\t3\t0\n/tmp/b\t0\t2\nnonsense\n");
  assert.deepEqual(stats.get("/tmp/a"), { loose: 3, ahead: 0 });
  assert.deepEqual(stats.get("/tmp/b"), { loose: 0, ahead: 2 });
  assert.equal(stats.has("nonsense"), false);
});

test("the four gates: a seat, a file, a commit and a lock each hold a worktree back", () => {
  assert.equal(srv.worktreeKeep({ seat: "shipping", loose: 0, ahead: 0 }), "seat");
  assert.equal(srv.worktreeKeep({ seat: "", loose: 4, ahead: 0 }), "loose");
  assert.equal(srv.worktreeKeep({ seat: "", loose: 0, ahead: 2 }), "ahead");
  assert.equal(srv.worktreeKeep({ seat: "", loose: 0, ahead: 0, locked: true }), "locked");
  assert.equal(srv.worktreeKeep({ seat: "", loose: 0, ahead: 0 }), "");
});

const NOW = 1787340000000;
const HOUR = 3600000;

function tree(over) {
  return { path: "/tmp/wt", repo: "api", main: "/hub/api", branch: "b", seat: "", loose: 0, ahead: 0, locked: false, gone: false, touched: NOW - 2 * HOUR, ...over };
}

test("two hours untouched is idle at one hour and still fresh at three", () => {
  const [after1] = srv.worktreeRows([tree()], { hours: 1, now: NOW });
  const [after3] = srv.worktreeRows([tree()], { hours: 3, now: NOW });
  assert.equal(after1.idle, true);
  assert.equal(after1.sweep, true);
  assert.equal(after3.idle, false, "the hour is the person's to choose");
  assert.equal(after3.sweep, false);
});

test("a seat is credited with the worktree it works in, not only with the folder it was launched from", async () => {
  const rows = await folders(
    [{ name: "hive-latencia" }],
    { "local:hive-latencia": { id: "abc" } },
    { abc: { trees: [{ path: "/tmp/wt/pod-vira-servidor" }, { path: "/tmp/wt/uma-conexao" }] } },
    { "/hive/sessions/hive-latencia.json": { cwd: "/hub" } }
  );
  assert.deepEqual(rows.map((row) => row.cwd), ["/tmp/wt/pod-vira-servidor", "/tmp/wt/uma-conexao", "/hub"],
    "every seat is launched in the hub, so the launch folder alone never names a worktree");
  assert.ok(rows.every((row) => row.name === "hive-latencia"));
});

test("a seat the app has not read yet still says where it was launched", async () => {
  const rows = await folders(
    [{ name: "fresh" }],
    {},
    {},
    { "/hive/sessions/fresh.json": { cwd: "/hub" } }
  );
  assert.deepEqual(rows, [{ name: "fresh", cwd: "/hub" }]);
});

test("a seat sitting in it keeps a worktree alive however old the files are", () => {
  const [row] = srv.worktreeRows([tree({ seat: "shipping", touched: NOW - 40 * HOUR })], { hours: 1, now: NOW });
  assert.equal(row.idle, false);
  assert.equal(row.sweep, false);
  assert.equal(row.keep, "seat");
});

test("work nobody kept is idle on the screen but never swept", () => {
  const [loose] = srv.worktreeRows([tree({ loose: 6 })], { hours: 1, now: NOW });
  const [ahead] = srv.worktreeRows([tree({ ahead: 2 })], { hours: 1, now: NOW });
  for (const row of [loose, ahead]) {
    assert.equal(row.idle, true, "the person still gets to see it");
    assert.equal(row.sweep, false, "the sweep leaves it alone");
  }
});

test("a folder git lost holds no disk and can always go", () => {
  const [row] = srv.worktreeRows([tree({ gone: true, touched: 0 })], { hours: 24, now: NOW });
  assert.equal(row.bytes, 0);
  assert.equal(row.idle, true);
  assert.equal(row.sweep, true);
});

test("a worktree nobody could read the time of is never swept by accident", () => {
  const [row] = srv.worktreeRows([tree({ touched: 0 })], { hours: 1, now: NOW });
  assert.equal(row.idle, false, "no reading is not the same as old");
});

test("the deep read of the files wins over the shallow one", () => {
  const measured = new Map([["/tmp/wt", { bytes: 1024, deep: NOW - 60000 }]]);
  const [row] = srv.worktreeRows([tree()], { hours: 1, measured, now: NOW });
  assert.equal(row.touched, NOW - 60000, "a file written a minute ago beats a folder stamped two hours ago");
  assert.equal(row.idle, false);
  assert.equal(row.bytes, 1024);
});

test("the summary is what the sidebar shows, and it only frees what it may sweep", () => {
  const rows = srv.worktreeRows([
    tree({ path: "/a" }),
    tree({ path: "/b", loose: 3 }),
    tree({ path: "/c", seat: "shipping" })
  ], {
    hours: 1,
    now: NOW,
    measured: new Map([["/a", { bytes: 400 }], ["/b", { bytes: 900 }], ["/c", { bytes: 100 }]])
  });
  const said = srv.worktreeSummary(rows);
  assert.equal(said.count, 3);
  assert.equal(said.idle, 2, "the one with a seat in it is not idle");
  assert.equal(said.sweep, 1, "and the one holding uncommitted work is not swept");
  assert.equal(said.bytes, 1400);
  assert.equal(said.idleBytes, 400, "the number on the button is only what really goes");
  assert.equal(said.sized, true);
});

test("nothing is measured yet, so the sidebar says so instead of showing a zero", () => {
  const said = srv.worktreeSummary(srv.worktreeRows([tree()], { hours: 1, now: NOW }));
  assert.equal(said.sized, false);
  assert.equal(said.bytes, 0);
});

test("the page stacks the worktrees by repo, the heaviest repo first", () => {
  const groups = worktreeGroups([
    { repo: "api", path: "/a", bytes: 100 },
    { repo: "mobile-app", path: "/b", bytes: 5000 },
    { repo: "api", path: "/c", bytes: 900 }
  ]);
  assert.deepEqual(groups.map((g) => g.repo), ["mobile-app", "api"]);
  assert.deepEqual(groups[1].rows.map((r) => r.path), ["/c", "/a"], "the heaviest worktree leads its repo");
  assert.equal(groups[1].bytes, 1000);
});

test("the walk is asked of the hub and the removal is asked of the repo, never of a path someone typed", () => {
  const remove = slice(server, "async function removeWorktree", "async function sweepWorktrees", "server.mjs");
  assert.match(remove, /rows\.find\(\(one\) => one\.path === path\)/, "the path has to be one git itself listed");
  assert.match(remove, /if \(row\.seat\) return \{ error/, "a seat in it stops the removal before git is called");
  assert.match(remove, /if \(!force && row\.keep\) return \{ error/, "and work nobody kept needs the person to insist");
  const drop = slice(server, "async function dropWorktree", "async function removeWorktree", "server.mjs");
  assert.match(drop, /"worktree", "prune"/, "a folder git lost is pruned, not removed");
  assert.match(drop, /"worktree", "remove"/);
  assert.ok(!drop.includes("rmSync"), "nothing here deletes a folder by hand — git does it or it does not happen");
});

test("the sweep walks the idle ones and says what it left behind", () => {
  const sweep = slice(server, "async function sweepWorktrees", "async function insideTheServer", "server.mjs");
  assert.match(sweep, /if \(!row\.idle\) continue/);
  assert.match(sweep, /if \(!row\.sweep\) \{ kept\.push/);
  assert.match(sweep, /freed: removed\.reduce/);
});

test("the branch is never touched — only the folder", () => {
  const block = slice(server, "async function dropWorktree", "async function sweepWorktrees", "server.mjs");
  assert.ok(!/branch"?\s*,?\s*"-D"|branch -D|"-D"/.test(block), "no branch is deleted anywhere in the removal");
});

test("the sidebar carries the count without waiting for git", () => {
  const brief = slice(server, "function worktreeBrief", "async function dropWorktree", "server.mjs");
  assert.ok(!brief.includes("await"), "the row is painted from the cache — the poll never blocks on a walk");
  assert.match(server, /worktrees: worktreeBrief\(\),/, "and it travels with everything else the app polls");
});

test("the rail row opens the page, and the page steps aside for the others", () => {
  assert.match(page, /<button id="rail-wt" class="rail-wt" hidden><\/button>/);
  assert.match(page, /<section id="worktrees" data-t hidden/);
  const was = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rows: [], hub: "/hub", at: Date.now() }) });
  st.wt = { rows: [], hub: "/hub", at: Date.now() };
  const rail = document.getElementById("rail-wt");
  rail.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(worktreesOnScreen(), true, "the rail row opens the page");
  rail.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(worktreesOnScreen(), false, "and closes it again");
  for (const opener of [openPrs, openUsage, openWelcome]) {
    openWorktrees();
    assert.equal(worktreesOnScreen(), true);
    opener();
    assert.equal(worktreesOnScreen(), false, `${opener.name} leaves the worktrees screen behind`);
  }
  closeWorktrees();
  globalThis.fetch = was;
});

test("the page reads itself again on its own, and stops when it is closed", () => {
  const was = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ rows: [], hub: "/hub", at: Date.now() }) });
  openWorktrees();
  assert.equal(beatOn("worktrees"), true);
  closeWorktrees();
  assert.equal(beatOn("worktrees"), false);
  assert.ok(WT_BEAT >= 5000 && WT_BEAT <= 60000, "often enough to be alive, rare enough not to walk the disk all day");
  globalThis.fetch = was;
});
