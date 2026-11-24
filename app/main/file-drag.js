const { existsSync, readFileSync, realpathSync } = require("node:fs");
const { dirname, isAbsolute, join, resolve, sep } = require("node:path");
const { homedir } = require("node:os");

const SEAT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

const PATH_MAX = 4096;

function hubOf(env, home) {
  if (env.HIVE_HUB) return env.HIVE_HUB;
  let text = "";
  try { text = readFileSync(join(home, "config"), "utf8"); } catch { return ""; }
  const line = text.split("\n").map((one) => one.match(/^\s*HIVE_HUB=(.*)$/)).find(Boolean);
  return line ? line[1].replace(/^["']|["']$/g, "").trim() : "";
}

function chatFolderOf(home, name) {
  if (!SEAT_NAME.test(String(name || ""))) return "";
  try { return String(JSON.parse(readFileSync(join(home, "sessions", `${name}.json`), "utf8")).cwd || ""); } catch { return ""; }
}

function realOf(path) {
  if (!path) return "";
  try { return realpathSync(path); } catch { return ""; }
}

const inside = (path, root) => !!root && (path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`));

function gitTopOf(folder) {
  for (let dir = folder; dir; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return "";
  }
  return "";
}

function draggableFile(ask, { home, hub, userHome = homedir() }) {
  const asked = String(ask?.path || "").trim();
  if (!asked || asked.length > PATH_MAX || asked.includes("\0")) return null;
  const folder = realOf(chatFolderOf(home, ask?.name));
  if (!folder) return null;
  const roots = [folder, realOf(hub)].filter(Boolean);
  const wanted = asked.startsWith("~/") ? join(userHome, asked.slice(2)) : asked;
  const bases = isAbsolute(wanted) ? [""] : [folder, gitTopOf(folder)].filter(Boolean);
  for (const base of bases) {
    const real = realOf(base ? resolve(base, wanted) : wanted);
    if (real && roots.some((root) => inside(real, root))) return real;
  }
  return null;
}

function fileDragHandler({ home, hub, isHiveWindow, iconOf }) {
  return async (event, ask) => {
    if (!event?.sender || !isHiveWindow(event.sender)) return { ok: false, error: "only a Hive window drags files out" };
    const file = draggableFile(ask, { home, hub: typeof hub === "function" ? hub() : hub });
    if (!file) return { ok: false, error: "that file is not in this chat's folder on this machine" };
    try {
      const icon = await iconOf(file);
      event.sender.startDrag({ file, icon });
      return { ok: true, file };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  };
}

module.exports = { SEAT_NAME, chatFolderOf, draggableFile, fileDragHandler, gitTopOf, hubOf };
