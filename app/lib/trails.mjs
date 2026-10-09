import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const TREES_SHOWN = 4;

const HOPS = 24;

const lastName = (path) => String(path).split("/").filter(Boolean).pop() || String(path);

export function repoRootOf(dir) {
  let at = String(dir || "");
  for (let hop = 0; at.startsWith("/") && at !== "/" && hop < HOPS; hop++) {
    if (existsSync(join(at, ".git"))) return at;
    at = dirname(at);
  }
  return "";
}

/* a worktree keeps a .git file pointing at <main>/.git/worktrees/<name>, and that is the only
   place the repo it belongs to is written down — the folder name says nothing. */
export function repoAt(root) {
  const dot = join(root, ".git");
  let head = join(dot, "HEAD");
  let main = root;
  try {
    if (!statSync(dot).isDirectory()) {
      const gitdir = readFileSync(dot, "utf8").replace(/^gitdir:\s*/, "").trim();
      head = join(gitdir, "HEAD");
      main = gitdir.replace(/\/worktrees\/[^/]+\/?$/, "").replace(/\/?\.git\/?$/, "");
    }
  } catch {}
  let branch = "";
  try {
    const said = readFileSync(head, "utf8").trim();
    branch = said.startsWith("ref:") ? said.replace(/^ref:\s*refs\/heads\//, "") : said.slice(0, 8);
  } catch {}
  return { repo: lastName(main), branch, path: root, main: root === main };
}

const TRUNK = /^(main|master)$/;

export function seatTrees({ dirs = [], cwd = "" } = {}, cap = TREES_SHOWN) {
  const walkedIn = dirs.length ? dirs : (cwd ? [cwd] : []);
  const roots = new Set();
  for (const dir of walkedIn) {
    const root = repoRootOf(dir);
    if (!root) continue;
    roots.delete(root);
    roots.add(root);
  }
  const walked = [...roots].reverse().map(repoAt);
  const apart = walked.filter((one) => !one.main);
  const shown = apart.length ? apart : walked.map((one) => ({ ...one, branch: TRUNK.test(one.branch) ? one.branch : "" }));
  return shown.slice(0, cap);
}

const CWD = /"cwd":"((?:[^"\\]|\\.)*)"/g;

export function trailCwds(raw) {
  const dirs = [];
  for (const found of String(raw || "").matchAll(CWD)) {
    let dir = "";
    try { dir = JSON.parse(`"${found[1]}"`); } catch { continue; }
    if (dir.startsWith("/")) dirs.push(dir);
  }
  return dirs;
}

export const TRAILS_KEPT = 200;

export function treesOfSeat(trails, seat, dirs = []) {
  if (!seat?.id) return [];
  const trees = seatTrees({ dirs, cwd: seat.cwd || "" });
  if (!trails.has(seat.id) && trails.size >= TRAILS_KEPT) trails.delete(trails.keys().next().value);
  trails.delete(seat.id);
  trails.set(seat.id, { trees });
  return trees;
}
