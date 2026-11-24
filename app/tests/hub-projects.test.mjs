import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { branchOwnerOf, branchesFrom, dropMadeFolder, hubProjects, isBranchName, isProjectName, projectBranches, seatFolder, worktreePathsFrom } from "../lib/hub-projects.mjs";
import { registerProjectRoutes } from "../routes/projects.mjs";

const HUB = realpathSync(mkdtempSync(join(tmpdir(), "hive-projects-")));
after(() => rmSync(HUB, { recursive: true, force: true }));

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const run = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { env: ENV, stdio: "pipe" }).toString();
const tried = (dir, ...args) => { try { return run(dir, ...args); } catch { return ""; } };

function repo(name, branches = []) {
  const dir = join(HUB, name);
  mkdirSync(dir, { recursive: true });
  run(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), name);
  run(dir, "add", "-A");
  run(dir, "commit", "-q", "-m", "first");
  for (const branch of branches) run(dir, "branch", branch);
  return dir;
}

const git = (dir, args, timeout = 8000) => new Promise((done) => execFile("git", ["-C", dir, ...args], { env: ENV, timeout }, (wrong, out, err) => done({ ok: !wrong, out: out || "", error: wrong ? String(err || wrong.message) : "" })));

const api = repo("api-acme", ["develop", "staging"]);
repo("lead-engine", ["812-retry"]);
mkdirSync(join(HUB, "notes"));
mkdirSync(join(HUB, ".hidden-repo", ".git"), { recursive: true });
run(join(HUB, "lead-engine"), "worktree", "add", "-q", join(HUB, "lead-engine-wt-retry"), "812-retry");

test("the projects are the hub's own checkouts, never a worktree, a hidden folder or a plain folder", () => {
  assert.deepEqual(hubProjects(HUB), [
    { name: "api-acme", branch: "main", base: "main" },
    { name: "lead-engine", branch: "main", base: "main" }
  ]);
  assert.deepEqual(hubProjects(""), []);
  assert.deepEqual(hubProjects(join(HUB, "nowhere")), []);
});

test("a project name is a single folder and a branch name cannot climb out of refs", () => {
  assert.ok(isProjectName("frontend-acme-nextjs"));
  for (const bad of ["", "..", "../etc", "a/b", ".worktrees", "-rf"]) assert.ok(!isProjectName(bad), bad);
  assert.ok(isBranchName("jonas/-/chat-novo"));
  for (const bad of ["", "-x", "a..b", "a//b", "a/", "x.lock", "a b", "$(rm)"]) assert.ok(!isBranchName(bad), bad);
});

test("the branch list puts local and origin branches once, newest first, without HEAD", () => {
  const refs = ["refs/heads/main", "refs/remotes/origin/HEAD", "refs/remotes/origin/main", "refs/remotes/origin/feat", "refs/heads/feat", "refs/tags/v1", "refs/remotes/upstream/other"].join("\n");
  assert.deepEqual(branchesFrom(refs), ["main", "feat"]);
  assert.deepEqual(branchesFrom("refs/heads/a\nrefs/heads/b\nrefs/heads/c", 2), ["a", "b"]);
  assert.deepEqual(worktreePathsFrom("worktree /a\nHEAD x\nbranch refs/heads/main\n\nworktree /b\n"), ["/a", "/b"]);
});

test("a project's branches start with its default one", async () => {
  const said = await projectBranches(HUB, "api-acme", git);
  assert.equal(said.base, "main");
  assert.equal(said.branches[0], "main");
  assert.deepEqual([...said.branches].sort(), ["develop", "main", "staging"]);
  await assert.rejects(projectBranches(HUB, "../etc", git), /no project called/);
});

test("with no project the chat is born in the hub, and with one it is born in the project's checkout", async () => {
  assert.deepEqual(await seatFolder({ hub: HUB, name: "x", git }), { cwd: HUB, made: false });
  assert.deepEqual(await seatFolder({ hub: HUB, name: "x", project: "api-acme", git }), { cwd: api, made: false });
  await assert.rejects(seatFolder({ hub: HUB, name: "x", project: "notes", git }), /no project called notes/);
  await assert.rejects(seatFolder({ hub: HUB, name: "x", project: "../..", git }), /no project called/);
});

test("on the same branch the chat shares the folder of a worktree the project really has, and nothing else", async () => {
  const tree = join(HUB, "lead-engine-wt-retry");
  assert.deepEqual(await seatFolder({ hub: HUB, name: "x", project: "lead-engine", tree, git }), { cwd: tree, made: false });
  assert.deepEqual(await seatFolder({ hub: HUB, name: "x", project: "lead-engine", tree: join(HUB, "lead-engine"), git }), { cwd: join(HUB, "lead-engine"), made: false });
  await assert.rejects(seatFolder({ hub: HUB, name: "x", project: "lead-engine", tree: "/etc", git }), /is not a folder of lead-engine/);
  await assert.rejects(seatFolder({ hub: HUB, name: "x", project: "api-acme", tree, git }), /is not a folder of api-acme/);
});

test("a new worktree starts from the chosen branch, on the person's branch named after the chat, and goes away if the chat never opens", async () => {
  run(api, "config", "user.name", "Maria Ândrade");
  run(api, "commit", "-q", "--allow-empty", "-m", "main moves ahead of develop", "--no-verify");
  const placed = await seatFolder({ hub: HUB, name: "conserta-login", project: "api-acme", base: "develop", worktree: true, git });
  assert.equal(placed.made, true);
  assert.equal(placed.cwd, join(HUB, ".worktrees", "api-acme", "conserta-login"));
  assert.equal(run(placed.cwd, "rev-parse", "--abbrev-ref", "HEAD").trim(), "maria-andrade/-/conserta-login");
  assert.equal(run(placed.cwd, "rev-parse", "HEAD").trim(), run(api, "rev-parse", "develop").trim());
  assert.notEqual(run(placed.cwd, "rev-parse", "HEAD").trim(), run(api, "rev-parse", "main").trim());
  assert.equal(tried(placed.cwd, "config", "--get", "branch.maria-andrade/-/conserta-login.merge").trim(), "", "the new branch must not track the base, or a plain push lands on it");
  const again = await seatFolder({ hub: HUB, name: "conserta-login", project: "api-acme", worktree: true, git });
  assert.equal(again.cwd, join(HUB, ".worktrees", "api-acme", "conserta-login-2"));
  assert.equal(again.branch, "maria-andrade/-/conserta-login-2");
  await dropMadeFolder(again, git);
  assert.ok(!existsSync(again.cwd));
  assert.equal(run(api, "branch", "--list", "maria-andrade/-/conserta-login-2").trim(), "");
  await assert.rejects(seatFolder({ hub: HUB, name: "x", project: "api-acme", base: "a..b", worktree: true, git }), /is not a branch name/);
  await assert.rejects(seatFolder({ hub: HUB, name: "y", project: "api-acme", base: "nope", worktree: true, git }), /git would not make the worktree/);
});

test("the routes answer the list and refuse a project the hub does not have", async () => {
  const routes = new Map();
  registerProjectRoutes((method, path, fn) => routes.set(`${method} ${path}`, fn), {
    hubFolder: () => "hub",
    hubProjects: () => [{ name: "api-acme", branch: "main", base: "main" }],
    projectBranches: async (project) => {
      if (project !== "api-acme") throw new Error(`there is no project called ${project} in the hub`);
      return { project, branch: "main", base: "main", branches: ["main"] };
    }
  });
  const call = async (key, query = "") => {
    let said = null;
    await routes.get(key)({}, {}, new URL(`http://hive/x${query}`), (value, status = 200) => { said = { value, status }; });
    return said;
  };
  assert.deepEqual(await call("GET /api/projects"), { value: { hub: "hub", projects: [{ name: "api-acme", branch: "main", base: "main" }] }, status: 200 });
  assert.equal((await call("GET /api/projects/branches", "?project=api-acme")).value.branches[0], "main");
  assert.deepEqual(await call("GET /api/projects/branches", "?project=etc"), { value: { error: "there is no project called etc in the hub" }, status: 404 });
});

test("a local chat is born in the folder its project asks for, and a worktree made for a chat that never opened is taken back", async () => {
  const { readFileSync } = await import("node:fs");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const from = server.indexOf("async function newChat({");
  const birth = server.slice(from, server.indexOf("async function bindSeatSession(", from));
  assert.match(birth, /project = "", base = "", worktree = false, tree = ""/);
  assert.match(birth, /assertSpawnArgs\(\{ name, model, repo, branch, account, agent, effort, project, base \}\)/);
  assert.match(birth, /anon \|\| where === "cloud" \? null : await seatFolder\(\{ hub: HUB, name, project, base, worktree: !!worktree, tree, owner: DEV, git: gitIn \}\)/);
  assert.match(birth, /: \{ cwd: seatCwd \};/, "the local window opens in the chosen folder");
  assert.match(birth, /await dropMadeFolder\(placed, gitIn\)/);
  assert.match(server, /registerProjectRoutes\(on, \{ hubFolder: \(\) => HUB_FOLDER, hubProjects: \(\) => hubProjects\(HUB\), projectBranches: \(project\) => projectBranches\(HUB, project, gitIn\) \}\)/);
});

test("the branch prefix is the person's git name, and the hive name when git has none", async () => {
  assert.equal(branchOwnerOf("Jonas Costa"), "jonas-costa");
  assert.equal(branchOwnerOf("  Ana  María O'Brien\n"), "ana-maria-o-brien");
  assert.equal(branchOwnerOf(""), "");
  const sdr = join(HUB, "lead-engine");
  run(sdr, "config", "user.name", "");
  const placed = await seatFolder({ hub: HUB, name: "sem-nome", project: "lead-engine", worktree: true, owner: "jonas", git });
  assert.equal(placed.branch, "jonas/-/sem-nome");
  await dropMadeFolder(placed, git);
});
