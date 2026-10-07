import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const HELD_BACK = new Set(["main", "master", "develop"]);

export const EVERY_MS = 120000;

export function rootsOf({ hub = "", workspace = "/workspace" } = {}) {
  if (existsSync(join(workspace, "repos"))) return [join(workspace, "repos"), join(workspace, "worktrees")];
  if (!hub) return [];
  return [hub, join(hub, ".worktrees")];
}

function foldersIn(root) {
  try {
    return readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(root, e.name));
  } catch {
    return [];
  }
}

export function checkoutsUnder(root) {
  const found = [];
  for (const one of foldersIn(root)) {
    if (existsSync(join(one, ".git"))) found.push(one);
    for (const two of foldersIn(one)) if (existsSync(join(two, ".git"))) found.push(two);
  }
  return found;
}

export function readState(file) {
  const held = new Map();
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const [dir, sha] = line.split("\t");
      if (dir && sha) held.set(dir, sha);
    }
  } catch {}
  return held;
}

export function writeState(file, held) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, [...held].map(([dir, sha]) => `${dir}\t${sha}`).join("\n") + (held.size ? "\n" : ""));
}

const git = (dir, args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function onePass({ roots, state, say = () => {}, at = new Date() }) {
  const held = readState(state);
  const clock = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  let seen = 0;
  let moved = 0;
  for (const root of roots) {
    for (const dir of checkoutsUnder(root)) {
      let branch = "";
      let sha = "";
      try {
        branch = git(dir, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
        sha = git(dir, ["rev-parse", "HEAD"]);
      } catch {
        continue;
      }
      if (!branch || HELD_BACK.has(branch)) continue;
      seen += 1;
      if (held.get(dir) === sha) continue;
      let said = "";
      try {
        said = execFileSync("git", ["-C", dir, "push", "--set-upstream", "origin", branch], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        continue;
      }
      held.set(dir, sha);
      if (!/Everything up-to-date/.test(said)) {
        moved += 1;
        say(`${clock} pushed ${branch}  ${basename(dir)}`);
      }
    }
  }
  writeState(state, held);
  if (!moved) say(`${clock} nothing new in ${seen} branches`);
  return { seen, moved };
}

export function keepPushing({ roots, state, say = () => {}, every = EVERY_MS, wait = setInterval } = {}) {
  if (!roots.length) return null;
  const pass = () => { try { onePass({ roots, state, say }); } catch (wrong) { say(`autopush stumbled: ${String(wrong?.message || wrong)}`); } };
  pass();
  const timer = wait(pass, every);
  timer?.unref?.();
  return timer;
}
