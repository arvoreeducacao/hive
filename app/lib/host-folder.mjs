import { posix } from "node:path";

export const FOLDER_PATH_CEILING = 1024;

const CONTROL = /[\u0000-\u001f\u007f]/;

export function hostFolderOf(raw) {
  const said = String(raw ?? "").trim();
  if (!said) return { ok: true, folder: "" };
  if (said.length > FOLDER_PATH_CEILING) return { ok: false, error: "that path is longer than a folder path gets" };
  if (CONTROL.test(said)) return { ok: false, error: "a folder path carries no line breaks or control characters" };
  if (!said.startsWith("/")) return { ok: false, error: "a folder on the host is named by its whole path, starting at /" };
  const clean = posix.normalize(said);
  return { ok: true, folder: clean.length > 1 ? clean.replace(/\/+$/, "") : clean };
}

export function shellOnHost({ cwd = "", ownerCwd = "", kept = "", home = "" } = {}) {
  for (const one of [cwd, ownerCwd, kept, home]) {
    const read = hostFolderOf(one);
    if (read.ok && read.folder) return { cwd: read.folder };
  }
  return {};
}

export function placeOnHost({ ssh = false, folder = "", repo = "", branch = "", kept = "", home = "", hub = false, hubRepo = "" } = {}) {
  if (!ssh) return { repo: repo || hubRepo, branch };
  const asked = hostFolderOf(folder);
  if (asked.ok && asked.folder) return { cwd: asked.folder };
  if (repo) return { repo, branch };
  const saved = hostFolderOf(kept);
  if (saved.ok && saved.folder) return { cwd: saved.folder };
  if (hub) return { repo: hubRepo, branch };
  const base = hostFolderOf(home);
  return base.ok && base.folder ? { cwd: base.folder } : { repo: "", branch };
}
