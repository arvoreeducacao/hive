import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { repoAt } from "./trails.mjs";

export const PROJECT_WORKTREES = ".worktrees";

export const BRANCHES_SHOWN = 200;

const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

const FETCH_WAIT = 15000;

const WORKTREE_WAIT = 60000;

export const isProjectName = (name) => PROJECT_NAME.test(String(name || ""));

export function isBranchName(name) {
  const branch = String(name || "");
  return BRANCH_NAME.test(branch) && !branch.includes("..") && !branch.includes("//") && !/[/.]$/.test(branch) && !branch.endsWith(".lock");
}

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function samePath(a, b) {
  const real = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };
  return real(a) === real(b);
}

export function isProject(hub, name) {
  return !!hub && isProjectName(name) && isDirectory(join(hub, name, ".git"));
}

export function defaultBranchOf(dir) {
  try {
    const said = readFileSync(join(dir, ".git", "refs", "remotes", "origin", "HEAD"), "utf8").trim();
    const found = said.match(/^ref:\s*refs\/remotes\/origin\/(.+)$/);
    if (found) return found[1];
  } catch {}
  return repoAt(dir).branch;
}

export function hubProjects(hub) {
  if (!hub) return [];
  let names = [];
  try { names = readdirSync(hub); } catch { return []; }
  return names
    .filter((name) => isProject(hub, name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const dir = join(hub, name);
      return { name, branch: repoAt(dir).branch, base: defaultBranchOf(dir) };
    });
}

export function branchesFrom(refs, cap = BRANCHES_SHOWN) {
  const seen = new Set();
  const out = [];
  for (const line of String(refs || "").split("\n")) {
    const ref = line.trim();
    const name = ref.startsWith("refs/heads/") ? ref.slice(11) : ref.startsWith("refs/remotes/origin/") ? ref.slice(20) : "";
    if (!name || name === "HEAD" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= cap) break;
  }
  return out;
}

export function worktreePathsFrom(porcelain) {
  return String(porcelain || "").split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9).trim()).filter(Boolean);
}

const lastLine = (text) => String(text || "").trim().split("\n").filter(Boolean).pop() || "";

function freeFolder(home, name) {
  for (let n = 1; ; n++) {
    const path = join(home, n === 1 ? name : `${name}-${n}`);
    if (!existsSync(path)) return path;
  }
}

export function branchOwnerOf(person) {
  return String(person || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

async function ownerOf(dir, git, fallback) {
  const said = await git(dir, ["config", "user.name"]);
  return branchOwnerOf(said.ok ? said.out : "") || branchOwnerOf(fallback);
}

async function freeBranch(dir, name, git, owner = "") {
  const stem = owner ? `${owner}/-/${name}` : name;
  for (let n = 1; ; n++) {
    const branch = n === 1 ? stem : `${stem}-${n}`;
    if (!(await git(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).ok) return branch;
  }
}

export async function projectBranches(hub, project, git) {
  if (!isProject(hub, project)) throw new Error(`there is no project called ${project} in the hub`);
  const dir = join(hub, project);
  const refs = await git(dir, ["for-each-ref", "--sort=-committerdate", "--format=%(refname)", "refs/heads", "refs/remotes/origin"]);
  const branch = repoAt(dir).branch;
  const base = defaultBranchOf(dir);
  const listed = branchesFrom(refs.out);
  const branches = [base, ...listed.filter((one) => one !== base)].filter(Boolean);
  return { project, branch, base, branches };
}

export async function seatFolder({ hub, name, project = "", base = "", worktree = false, tree = "", owner = "", git }) {
  if (!project) return { cwd: hub, made: false };
  if (!isProject(hub, project)) throw new Error(`there is no project called ${project} in the hub`);
  const dir = join(hub, project);
  if (tree) {
    if (samePath(tree, dir)) return { cwd: dir, made: false };
    const listed = await git(dir, ["worktree", "list", "--porcelain"]);
    const known = worktreePathsFrom(listed.out).find((path) => samePath(path, tree));
    if (!known || !isDirectory(known)) throw new Error(`${tree} is not a folder of ${project} any more`);
    return { cwd: known, made: false };
  }
  if (!worktree) return { cwd: dir, made: false };
  if (base && !isBranchName(base)) throw new Error(`${base} is not a branch name`);
  const from = base || defaultBranchOf(dir);
  if (!isBranchName(from)) throw new Error(`${project} has no branch to start a worktree from`);
  await git(dir, ["fetch", "--quiet", "origin", from], FETCH_WAIT);
  const remote = await git(dir, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${from}`]);
  const start = remote.ok ? `origin/${from}` : from;
  const branch = await freeBranch(dir, name, git, await ownerOf(dir, git, owner));
  const home = join(hub, PROJECT_WORKTREES, project);
  mkdirSync(home, { recursive: true });
  const path = freeFolder(home, name);
  const made = await git(dir, ["worktree", "add", "--no-track", "-b", branch, path, start], WORKTREE_WAIT);
  if (!made.ok) throw new Error(`git would not make the worktree: ${lastLine(made.error) || "no reason given"}`);
  return { cwd: path, made: true, project: dir, branch };
}

export async function dropMadeFolder(placed, git) {
  if (!placed?.made) return;
  await git(placed.project, ["worktree", "remove", "--force", placed.cwd], WORKTREE_WAIT);
  await git(placed.project, ["branch", "-D", placed.branch]);
}
