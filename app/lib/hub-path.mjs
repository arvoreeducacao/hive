import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

export const NOT_ABSOLUTE = "use the whole path, starting at / or ~";
export const NO_HUB_YET = "type the folder that holds your repositories, or a new one for the hive to make";
export const NOT_THERE = "that folder does not exist yet";
export const HUB_MARKERS = ["hub.yaml", "CLAUDE.md", "AGENTS.md"];

export const STARTER_AGENTS = `# AGENTS.md

This folder is a hive hub: the place your chats open in.

Put the repositories you work on next to this file, one folder each, and describe them below.
Every agent reads this file before it starts, so write here what a new teammate would need:
what each repository is, how to run and test it, and the rules your team works by.

## Repositories

## How we work
`;

export function hubPathFrom(text, home) {
  const typed = String(text || "").trim();
  if (!typed) return { path: "", why: "" };
  const expanded = typed === "~" ? home : /^~[\\/]/.test(typed) ? join(home, typed.slice(2)) : typed;
  if (!isAbsolute(expanded)) return { path: "", why: NOT_ABSOLUTE };
  return { path: normalize(expanded).replace(/(.)[\\/]+$/, "$1"), why: "" };
}

export function cloudRepoOfTheHub(hub, folder, exists = existsSync) {
  if (!hub || !folder) return "";
  return exists(join(hub, ".git")) ? folder : "";
}

export function hubLookOf(text, home, exists = existsSync) {
  if (!String(text || "").trim()) return { ok: false, why: NO_HUB_YET };
  const { path: folder, why } = hubPathFrom(text, home);
  if (why) return { ok: false, why };
  if (!folder || !exists(folder)) return { ok: false, why: NOT_THERE, missing: true };
  return { ok: true, instructions: HUB_MARKERS.some((file) => exists(join(folder, file))), env: exists(join(folder, ".env")) };
}

export function makeHub(text, home, { exists = existsSync, mkdir = mkdirSync, write = writeFileSync } = {}) {
  const { path: folder, why } = hubPathFrom(text, home);
  if (!folder) return { error: why || NO_HUB_YET };
  mkdir(folder, { recursive: true });
  const marked = HUB_MARKERS.some((file) => exists(join(folder, file)));
  if (!marked) {
    write(join(folder, "AGENTS.md"), STARTER_AGENTS, { flag: "wx" });
    write(join(folder, "CLAUDE.md"), "@AGENTS.md\n", { flag: "wx" });
    if (!exists(join(folder, ".gitignore"))) write(join(folder, ".gitignore"), ".hive/\n.env\n", { flag: "wx" });
  }
  return { ok: true, path: folder, wrote: !marked };
}
