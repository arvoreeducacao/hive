import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";

import { grounded, withinRoots } from "./roots.mjs";
import { workspaceRoot } from "./engine/paths.mjs";

export const FILE_CEILING = 24 * 1024 * 1024;

export function rootsOf(env = process.env) {
  const workspace = workspaceRoot(env);
  return ["repos", "worktrees", "hive", "home"].map((one) => join(workspace, one));
}

export function askedPath(raw) {
  const said = String(raw || "");
  if (!said || !isAbsolute(said) || said.includes("\0")) return "";
  return normalize(said);
}

export function underLexically(path, roots) {
  return roots.some((root) => {
    const ground = normalize(root);
    return path === ground || path.startsWith(ground.endsWith(sep) ? ground : ground + sep);
  });
}

export function nearestThatExists(path) {
  let at = path;
  for (let step = 0; step < 64; step += 1) {
    const real = grounded(at);
    if (real) return real;
    const up = dirname(at);
    if (up === at) return "";
    at = up;
  }
  return "";
}

export function allowedToRead(path, roots) {
  return underLexically(path, roots) && withinRoots(path, roots);
}

export function allowedToWrite(path, roots) {
  if (!underLexically(path, roots)) return false;
  const standing = nearestThatExists(dirname(path));
  return !!standing && withinRoots(standing, roots);
}

export function createFiles({
  roots = rootsOf(),
  ceiling = FILE_CEILING,
  read = readFileSync,
  write = writeFileSync,
  size = statSync,
  makeDir = mkdirSync
} = {}) {
  return {
    roots,

    read(raw) {
      const path = askedPath(raw);
      if (!path) return { error: "a file is asked for by its whole path" };
      if (!underLexically(path, roots)) return { error: "that path is outside what this server holds" };
      let bytes = 0;
      try { bytes = size(path).size; } catch { return { error: "no such file here" }; }
      if (!withinRoots(path, roots)) return { error: "that path is outside what this server holds" };
      if (bytes > ceiling) return { error: `that file is ${Math.round(bytes / 1048576)}MB, past what one answer carries` };
      try { return { path, bytes, data: read(path).toString("base64") }; }
      catch (wrong) { return { error: String(wrong?.message || wrong).slice(0, 200) }; }
    },

    write(raw, encoded) {
      const path = askedPath(raw);
      if (!path) return { error: "a file is written by its whole path" };
      let body;
      try { body = Buffer.from(String(encoded || ""), "base64"); }
      catch { return { error: "that body is not base64" }; }
      if (body.length > ceiling) return { error: `that is ${Math.round(body.length / 1048576)}MB, past what one answer carries` };
      if (!allowedToWrite(path, roots)) return { error: "that path is outside what this server holds" };
      try { makeDir(dirname(path), { recursive: true }); } catch {}
      if (!allowedToWrite(path, roots)) return { error: "that path is outside what this server holds" };
      try { write(path, body); return { path, bytes: body.length }; }
      catch (wrong) { return { error: String(wrong?.message || wrong).slice(0, 200) }; }
    }
  };
}
