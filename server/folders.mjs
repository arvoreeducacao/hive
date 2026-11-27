import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize } from "node:path";

export const FOLDER_CEILING = 500;

const trimmed = (path) => (path.length > 1 ? path.replace(/\/+$/, "") || "/" : path);

export function folderAsked(raw, home = homedir()) {
  const said = String(raw ?? "").trim();
  if (said.includes("\0")) return "";
  if (!said || said === "~") return trimmed(normalize(home));
  if (said.startsWith("~/")) return trimmed(normalize(join(home, said.slice(2))));
  return isAbsolute(said) ? trimmed(normalize(said)) : "";
}

function whyNot(wrong, path) {
  if (wrong?.code === "ENOENT") return `${path} is not a folder on this server`;
  if (wrong?.code === "ENOTDIR") return `${path} is a file, not a folder`;
  if (wrong?.code === "EACCES" || wrong?.code === "EPERM") return `this server may not look inside ${path}`;
  return String(wrong?.message || wrong).slice(0, 200);
}

export function createFolders({ home = homedir(), list = readdirSync, stat = statSync, exists = existsSync, ceiling = FOLDER_CEILING } = {}) {
  const isFolder = (path, row) => {
    if (row.isDirectory()) return true;
    if (!row.isSymbolicLink()) return false;
    try { return stat(join(path, row.name)).isDirectory(); } catch { return false; }
  };

  return {
    home,

    list(raw, { hidden = false } = {}) {
      const path = folderAsked(raw, home);
      if (!path) return { error: "a folder is asked for by its whole path, or from ~" };
      let rows = [];
      try { rows = list(path, { withFileTypes: true }); } catch (wrong) { return { error: whyNot(wrong, path) }; }
      const names = rows
        .filter((row) => (hidden || !row.name.startsWith(".")) && isFolder(path, row))
        .map((row) => row.name)
        .sort((a, b) => a.localeCompare(b));
      const up = dirname(path);
      return {
        path,
        home: trimmed(normalize(home)),
        parent: up === path ? "" : up,
        git: exists(join(path, ".git")),
        folders: names.slice(0, ceiling).map((name) => ({ name, git: exists(join(path, name, ".git")) })),
        more: Math.max(0, names.length - ceiling)
      };
    }
  };
}
