import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";

const PLAN_FILE_CEILING = 512 * 1024;

export function planFileTarget(cwd, path) {
  const asked = String(path || "").trim();
  if (!cwd || !isAbsolute(cwd)) return { error: "this chat has no folder to save into" };
  if (!asked || isAbsolute(asked) || asked.includes("\0")) return { error: "write a path inside the chat's folder" };
  if (!/\.md$/i.test(asked)) return { error: "a plan is saved as a .md file" };
  const full = normalize(join(cwd, asked));
  const inside = relative(cwd, full);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return { error: "write a path inside the chat's folder" };
  return { full, path: inside };
}

function nearestFolder(dir) {
  let at = dir;
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  return at;
}

function insideRoot(root, dir) {
  const rel = relative(root, realpathSync(dir));
  return !rel.startsWith("..") && !isAbsolute(rel);
}

function isLink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

export function seatFolder(home, name, fallback) {
  try {
    const cwd = JSON.parse(readFileSync(join(home, "sessions", `${name}.json`), "utf8")).cwd || "";
    if (cwd && existsSync(cwd)) return cwd;
  } catch {}
  return fallback;
}

export function savePlanFile({ cwd, path, text }) {
  if (typeof text !== "string" || !text.trim()) return { error: "there is no plan to save" };
  if (text.length > PLAN_FILE_CEILING) return { error: "the plan is too big to save" };
  const target = planFileTarget(cwd, path);
  if (target.error) return target;
  try {
    const root = realpathSync(cwd);
    if (!insideRoot(root, nearestFolder(dirname(target.full)))) return { error: "write a path inside the chat's folder" };
    mkdirSync(dirname(target.full), { recursive: true });
    if (!insideRoot(root, dirname(target.full)) || isLink(target.full)) return { error: "write a path inside the chat's folder" };
    writeFileSync(target.full, text, "utf8");
    return { ok: true, path: target.path };
  } catch (wrong) {
    return { error: String(wrong?.message || wrong).slice(0, 160) };
  }
}
