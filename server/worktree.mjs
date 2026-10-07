import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const SAFE_PART = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/;

export const branchFor = (owner, name) => `${owner || "hive"}/-/${name}`;

export function refuse({ repo, branch, name }) {
  if (!SAFE_PART.test(String(name || ""))) return "that is not a name a seat can have";
  if (!SAFE_PART.test(String(repo || ""))) return "that is not a repository name";
  if (branch && !SAFE_PART.test(String(branch))) return "that is not a branch name";
  for (const part of [repo, branch, name]) if (String(part || "").includes("..")) return "a path may not climb out of the workspace";
  return "";
}

const run = (cmd, args, options) => new Promise((done) => {
  execFile(cmd, args, { timeout: 120000, ...options }, (wrong, out, err) => done({ ok: !wrong, out: out || "", err: String(err || wrong?.message || "") }));
});

export async function prepareWorktree({ root, repo, branch, name, owner, git = run, exists = existsSync, mkdir = mkdirSync }) {
  const wrong = refuse({ repo, branch, name });
  if (wrong) return { error: wrong };

  const source = join(root, "repos", repo);
  if (!exists(join(source, ".git"))) return { error: `there is no ${repo} on this server — clone it into ${join(root, "repos")} first` };

  const at = join(root, "worktrees", repo, name);
  if (exists(at)) return { cwd: at, made: false };

  const head = branch || branchFor(owner, name);
  mkdir(join(root, "worktrees", repo), { recursive: true });

  await git("git", ["-C", source, "fetch", "origin", "-q"]);
  const tries = [
    ["-C", source, "worktree", "add", "-b", head, at, "origin/main", "-q"],
    ["-C", source, "worktree", "add", "-b", head, at, "-q"],
    ["-C", source, "worktree", "add", at, head, "-q"]
  ];
  let last = { err: "" };
  for (const args of tries) {
    last = await git("git", args);
    if (last.ok) return { cwd: at, made: true, branch: head };
  }
  return { error: `could not make a worktree for ${name}: ${last.err.split("\n").filter(Boolean).pop() || "git said nothing"}` };
}
