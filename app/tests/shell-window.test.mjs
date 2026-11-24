import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dropQueue, foregroundProgram, restoredShellWindow, shellFolderUsable, shellHome, stillToRestore, tiedShellWindow } from "../lib/shell-window.mjs";

const argsTmuxSees = (line) => execFileSync("bash", ["-c", `tmux() { printf '%s\\0' "$@"; }\n${line}`], { encoding: "utf8" }).split("\0").slice(0, -1);

test("a chat folder with shell metacharacters reaches tmux as a plain folder, never as code", () => {
  for (const home of ["/tmp/a$(printf INJECTED)b", "/tmp/it's", "/tmp/x`id`y", "/tmp/a\"; id; \"b", "/tmp/a b/$HOME"]) {
    const line = tiedShellWindow({ session: "hive-local", seat: "ada-terminal", home, exec: "exec bash -l" });
    const args = argsTmuxSees(line);
    assert.deepEqual(args, ["new-window", "-d", "-t", "hive-local", "-n", "ada-terminal", "-c", home, "exec bash -l"], `for ${home}`);
  }
});

test("the shell starts in the chat's folder on Windows paths too, and never in a folder with control characters", () => {
  const posix = (path) => path.startsWith("/");
  const windows = (path) => /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/");
  const dirs = new Set(["/repo/chat", "C:\\repo\\chat", "C:/repo/chat", "/repo/owner"]);
  const isDir = (path) => dirs.has(path);
  assert.equal(shellHome({ cwd: "/repo/chat", ownerCwd: "/repo/owner", hub: "/hub", isAbsolute: posix, isDir }), "/repo/chat");
  assert.equal(shellHome({ cwd: "C:\\repo\\chat", ownerCwd: "", hub: "C:/hub", isAbsolute: windows, isDir }), "C:\\repo\\chat");
  assert.equal(shellHome({ cwd: "C:/repo/chat", ownerCwd: "", hub: "C:/hub", isAbsolute: windows, isDir }), "C:/repo/chat");
  assert.equal(shellHome({ cwd: "relative/chat", ownerCwd: "/repo/owner", hub: "/hub", isAbsolute: posix, isDir }), "/repo/owner", "a relative folder falls back to the owner's");
  assert.equal(shellHome({ cwd: "/repo/chat\n", ownerCwd: "", hub: "/hub", isAbsolute: posix, isDir: () => true }), "/hub", "a control character falls back to the hub");
  assert.equal(shellHome({ cwd: "/gone", ownerCwd: "/also-gone", hub: "/hub", isAbsolute: posix, isDir }), "/hub");
});

test("a shell whose chat left the fleet is not brought back, and neither is one the sweep already closed", () => {
  const fleet = new Set(["local:ada", "local:ada-terminal", "local:bea-terminal"]);
  const inFleet = (where, name) => fleet.has(`${where}:${name}`);
  assert.equal(stillToRestore({ where: "local", name: "ada-terminal", of: "ada" }, inFleet), true);
  assert.equal(stillToRestore({ where: "local", name: "bea-terminal", of: "bea" }, inFleet), false, "its chat is gone");
  assert.equal(stillToRestore({ where: "local", name: "cid-terminal", of: "ada" }, inFleet), false, "it was swept out of the fleet");
  assert.equal(stillToRestore({ where: "local", name: "ada" }, inFleet), true, "a chat with no owner is judged on its own");
});

test("a restored shell starts in its folder when it still exists, with spaces or metacharacters taken as plain text, else in the hub", async () => {
  const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const base = mkdtempSync(join(tmpdir(), "hive-shell-"));
  try {
    for (const leaf of ["chat com espaco", "a$(printf INJECTED)b", "it's"]) {
      const home = join(base, leaf);
      mkdirSync(home);
      const line = restoredShellWindow({ session: "hive-local", seat: "ada-terminal", home, hub: "/hub", exec: "exec bash -l" });
      assert.deepEqual(argsTmuxSees(line), ["new-window", "-d", "-t", "hive-local", "-n", "ada-terminal", "-c", home, "exec bash -l"], `for ${leaf}`);
    }
    const gone = restoredShellWindow({ session: "hive-local", seat: "ada-terminal", home: join(base, "gone"), hub: "/hub", exec: "exec bash -l" });
    assert.equal(argsTmuxSees(gone)[7], "/hub", "a folder that is gone falls back to the hub");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  assert.equal(shellFolderUsable("/tmp/chat com espaco"), true);
  assert.equal(shellFolderUsable("C:\\repo\\chat"), true);
  assert.equal(shellFolderUsable("relative/chat"), false);
  assert.equal(shellFolderUsable("/tmp/a\nb"), false);
});

test("shells to drop are killed until the kill is confirmed, with one retry timer at a time", async () => {
  const timers = [];
  const forgotten = [];
  const tries = new Map();
  const failFor = new Map([["ada-terminal", 3], ["bea-terminal", 1]]);
  const queue = dropQueue({
    kill: (seat) => {
      tries.set(seat.name, (tries.get(seat.name) || 0) + 1);
      return tries.get(seat.name) > (failFor.get(seat.name) || 0) ? { ok: true } : { ok: false, error: "no" };
    },
    forget: (seat) => forgotten.push(seat.name),
    setTimer: (run) => { timers.push(run); return timers.length; }
  });
  await queue.retire({ name: "ada-terminal", where: "local" });
  await queue.retire({ name: "bea-terminal", where: "local" });
  assert.deepEqual(forgotten, [], "nothing is forgotten while its kill fails");
  assert.equal(timers.length, 1, "two failing shells share one retry timer");
  assert.equal(queue.size, 2);
  await timers.shift()();
  assert.deepEqual(forgotten, ["bea-terminal"], "a confirmed kill forgets the shell");
  assert.equal(timers.length, 1, "the one still alive gets one more timer");
  await timers.shift()();
  assert.deepEqual(forgotten, ["bea-terminal", "ada-terminal"]);
  assert.equal(timers.length, 0, "and with nothing left, no timer");
  assert.equal(queue.size, 0);
});

test("a kill that throws counts as not done", async () => {
  const timers = [];
  const forgotten = [];
  const queue = dropQueue({ kill: () => { throw new Error("tmux hung"); }, forget: (seat) => forgotten.push(seat.name), setTimer: (run) => { timers.push(run); return 1; } });
  await queue.retire({ name: "ada-terminal", where: "local" });
  assert.deepEqual(forgotten, []);
  assert.equal(timers.length, 1);
  assert.ok(queue.has({ name: "ada-terminal", where: "local" }));
});

test("a shell waiting at its prompt runs nothing; any other program in front of it is what the terminal runs", () => {
  for (const idle of ["zsh", "-zsh", "bash", "/bin/sh", "fish", "login", "", undefined]) assert.equal(foregroundProgram(idle), "", `${idle} is a prompt`);
  assert.equal(foregroundProgram("node"), "node");
  assert.equal(foregroundProgram("/usr/local/bin/vite"), "vite");
  assert.equal(foregroundProgram("bad\u0007name"), "", "a name with control characters is never shown");
});
