#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "./scan.mjs";
import { HUB } from "../lib/env.mjs";

/** @typedef {string | { repo: string, path: string }} Target */
/** @typedef {"*" | Target | Target[]} Scope */

export const MANIFEST_FILE = "hive.json";

export const hubDir = () => process.env.HIVE_HUB || HUB;

/**
 * @param {string} root
 */
export function load(root) {
  const file = join(root, MANIFEST_FILE);
  if (!existsSync(file)) throw new Error(`no ${MANIFEST_FILE} in ${root}`);

  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(manifest.repos)) throw new Error(`${file}: "repos" must be an array`);
  return manifest;
}

const targetsOf = (scope) => (scope === "*" ? [] : Array.isArray(scope) ? scope : [scope]);
const hits = (target, repo) => (typeof target === "string" ? target === repo : target.repo === repo);

export function applies(scope, repo) {
  return scope === "*" || targetsOf(scope).some((target) => hits(target, repo));
}

export function pathFor(scope, repo) {
  for (const target of targetsOf(scope)) {
    if (typeof target !== "string" && target.repo === repo) return target.path;
  }
  return undefined;
}

export const repoName = (entry) => entry.split("/").pop() ?? entry;

const attachmentsIn = (map = {}, repo) =>
  Object.entries(map)
    .filter(([, scope]) => applies(scope, repo))
    .map(([name, scope]) => {
      const path = pathFor(scope, repo);
      return path ? { name, path } : { name };
    });

export function resolve(manifest, repo) {
  return {
    repo,
    declared: manifest.repos.map(repoName).includes(repo),
    skills: attachmentsIn(manifest.skills, repo),
    mcps: attachmentsIn(manifest.mcps, repo),
    envFile: manifest.env?.[repo] ?? ".env",
    integrations: manifest.integrations ?? {},
  };
}

export function reconcile(manifest, onDisk) {
  const declared = manifest.repos.map(repoName);
  const present = new Set(onDisk);
  const listed = new Set(declared);

  return {
    onDisk,
    declared,
    matched: declared.filter((r) => present.has(r)),
    missing: declared.filter((r) => !present.has(r)),
    undeclared: onDisk.filter((r) => !listed.has(r)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hub = hubDir();
  const manifest = load(hub);
  const found = scan(hub);
  const targets = process.argv.slice(2);

  if (!targets.length) {
    const r = reconcile(manifest, found.map((x) => x.name));
    console.log(hub);
    console.log(`disco ${r.onDisk.length} · manifesto ${r.declared.length} · batem ${r.matched.length}`);
    if (r.missing.length) console.log(`sem checkout (${r.missing.length}): ${r.missing.join(", ")}`);
    if (r.undeclared.length) console.log(`fora do manifesto (${r.undeclared.length}): ${r.undeclared.join(", ")}`);
    process.exit(r.missing.length ? 1 : 0);
  }

  const stacks = Object.fromEntries(found.map((x) => [x.name, x.stack]));
  const render = (list) =>
    list.map((i) => (i.path ? `${i.name} (${i.path})` : i.name)).join(", ") || "—";

  for (const target of targets) {
    const r = resolve(manifest, target);
    const stack = stacks[target] ? `[${stacks[target]}]` : "[ausente do disco]";
    console.log(`\n── ${target}  ${stack}${r.declared ? "" : "  ⚠ fora do manifesto"}`);
    console.log(`   skills (${r.skills.length}): ${render(r.skills)}`);
    console.log(`   mcps   (${r.mcps.length}): ${render(r.mcps)}`);
    console.log(`   env      : ${r.envFile}`);
  }
  console.log("");
}
