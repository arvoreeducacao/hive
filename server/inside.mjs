import { readdir, readFile, stat } from "node:fs/promises";
import { statfs } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { workspaceRoot } from "./engine/paths.mjs";

export const WORKSPACE = workspaceRoot();
export const CREDENTIAL = join(WORKSPACE, "home", ".claude", ".credentials.json");

export function readDisk(stats) {
  if (!stats) return null;
  const total = stats.blocks * stats.bsize;
  const free = stats.bavail * stats.bsize;
  if (!total) return null;
  return { total, used: total - free, free, percent: Math.round(((total - free) / total) * 100) };
}

export async function diskOf(path = WORKSPACE, ask = statfs) {
  return new Promise((done) => ask(path, (wrong, stats) => done(wrong ? null : readDisk(stats))));
}

export async function credentialOf(file = CREDENTIAL) {
  try {
    const [stats, text] = await Promise.all([stat(file), readFile(file, "utf8")]);
    const held = JSON.parse(text).claudeAiOauth || {};
    return { at: stats.mtimeMs, plan: held.subscriptionType || "", expires: held.expiresAt || 0 };
  } catch {
    return { at: 0, plan: "", expires: 0 };
  }
}

export async function reposOf(dir = `${WORKSPACE}/repos`) {
  try {
    return (await readdir(dir)).filter(Boolean).sort();
  } catch {
    return [];
  }
}

export async function worktreesOf(dir = `${WORKSPACE}/worktrees`) {
  try {
    const owners = await readdir(dir, { withFileTypes: true });
    const counted = await Promise.all(
      owners.filter((one) => one.isDirectory()).map(async (one) => {
        try { return (await readdir(`${dir}/${one.name}`, { withFileTypes: true })).filter((two) => two.isDirectory()).length; }
        catch { return 0; }
      })
    );
    return counted.reduce((held, one) => held + one, 0);
  } catch {
    return 0;
  }
}

export function remoteControlUp(run = execFile) {
  return new Promise((done) => {
    run("tmux", ["has-session", "-t", "rc"], { timeout: 5000 }, (wrong) => done(!wrong));
  });
}

export const SEAT_AGENT_BINARIES = { codex: "codex", kimi: "kimi", kiro: "kiro-cli", cursor: "cursor-agent", opencode: "opencode" };

/* the box signs in to Claude through the hive; the other agents sign in by their own
   means, so the most the box can report is which of them are installed at all. */
export function agentsOf(run = execFile) {
  return Promise.all(Object.entries(SEAT_AGENT_BINARIES).map(([agent, binary]) => new Promise((done) => {
    run("/bin/sh", ["-c", `command -v ${binary}`], { timeout: 5000 }, (wrong, out) => done([agent, wrong ? "" : String(out || "").trim()]));
  }))).then((pairs) => Object.fromEntries(pairs.filter(([, path]) => path)));
}

export async function insideOf(parts = {}) {
  const [disk, claude, repos, worktrees, remoteControl, agents] = await Promise.all([
    parts.disk ? parts.disk() : diskOf(),
    parts.claude ? parts.claude() : credentialOf(),
    parts.repos ? parts.repos() : reposOf(),
    parts.worktrees ? parts.worktrees() : worktreesOf(),
    parts.remoteControl ? parts.remoteControl() : remoteControlUp(),
    parts.agents ? parts.agents() : agentsOf()
  ]);
  return {
    disk,
    claude: { loggedIn: !!claude.at, plan: claude.plan || "", credentialAt: claude.at || 0 },
    agents,
    repos,
    worktrees,
    remoteControl
  };
}
