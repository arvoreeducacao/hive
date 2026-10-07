import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const REPO = join(APP, "..");
const { shellPrint, sdkAgreement, SDK_PACKAGE } = createRequire(import.meta.url)("./ota.js");
const RELEASE_NUMBER = join(APP, "..", "infra", "scripts", "release-number.sh");

function git(args) {
  try { return execFileSync("git", ["-C", HERE, ...args], { encoding: "utf8" }).trim(); }
  catch { return ""; }
}

function windowsBash() {
  const named = process.env.HIVE_BASH;
  if (named && existsSync(named)) return named;
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : ""];
  for (const root of roots) {
    if (!root) continue;
    const found = join(root, "Git", "bin", "bash.exe");
    if (existsSync(found)) return found;
  }
  for (const dir of String(process.env.PATH || process.env.Path || "").split(";").filter(Boolean)) {
    if (/[\\/]system32[\\/]?$/i.test(dir)) continue;
    const found = join(dir, "bash.exe");
    if (existsSync(found)) return found;
  }
  return "bash";
}

function releaseNumber() {
  const [exe, args] = process.platform === "win32" ? [windowsBash(), [RELEASE_NUMBER]] : [RELEASE_NUMBER, []];
  try { return Number(execFileSync(exe, args, { encoding: "utf8" }).trim()) || 0; }
  catch { return 0; }
}

const sha = git(["rev-parse", "HEAD"]);

if (!sha) {
  console.error("hive: git will not name the commit under this build — a stamp without one leaves every app unable to tell what it is running, so nothing is written");
  process.exit(1);
}

const sdk = sdkAgreement(REPO, readFileSync);

if (!sdk.agrees) {
  console.error(`hive: server/node_modules carries ${SDK_PACKAGE} ${sdk.shipped || "not at all"} while server/package-lock.json asks for ${sdk.locked || "nothing"} — the bundle would ship a claude its shell print does not describe, so nothing is written; run npm ci in server/ first`);
  process.exit(1);
}

const stamp = {
  sha,
  branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  at: new Date().toISOString(),
  release: releaseNumber(),
  team: process.env.HIVE_RELEASE_TEAM || "",
  shell: shellPrint(REPO, { readdirSync, readFileSync, statSync }),
  sdk: sdk.shipped
};
writeFileSync(join(APP, "build.json"), `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`hive: building from ${stamp.sha.slice(0, 8) || "an unknown commit"}, shell ${stamp.shell}, claude-agent-sdk ${stamp.sdk}`);
