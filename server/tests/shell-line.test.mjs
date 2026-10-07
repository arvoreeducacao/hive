import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SHELL_LINE_MAX, clipOutput, placeToRun, runShellLine, shellLineOf, shellProgram, withoutAnsi } from "../shell-line.mjs";

test("a line that opens with ! is a shell line, and two of them keep it out of the history", () => {
  assert.deepEqual(shellLineOf("!git status"), { command: "git status", quiet: false });
  assert.deepEqual(shellLineOf("!  ls  "), { command: "ls", quiet: false });
  assert.deepEqual(shellLineOf("!!git status"), { command: "git status", quiet: true });
  for (const line of ["git status", "!", "!!", ""]) assert.equal(shellLineOf(line), null, line);
});

test("colour codes are stripped and a long output keeps its head and tail", () => {
  assert.equal(withoutAnsi("\x1b[32mok\x1b[0m \x1b]0;title\x07done"), "ok done");
  const whole = clipOutput("short", 100);
  assert.deepEqual(whole, { output: "short", truncated: false });
  const long = clipOutput(`${"a".repeat(100)}MIDDLE${"z".repeat(100)}`, 40);
  assert.equal(long.truncated, true);
  assert.ok(long.output.startsWith("aaaa"));
  assert.ok(long.output.endsWith("zzzz"));
  assert.ok(!long.output.includes("MIDDLE"));
});

test("the line runs in the chat's folder, or at home when that folder is gone", () => {
  const dir = mkdtempSync(join(tmpdir(), "hive-shell-"));
  try {
    assert.equal(placeToRun(dir, "/fallback"), dir);
    assert.equal(placeToRun(join(dir, "gone"), "/fallback"), "/fallback");
    assert.equal(placeToRun("", "/fallback"), "/fallback");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the shell is the person's own on unix and cmd through the shell flag on windows", () => {
  assert.deepEqual(shellProgram({ platform: "win32", env: {} }), { shell: true, program: "", args: [] });
  const unix = shellProgram({ platform: "linux", env: { SHELL: "/definitely/not/here" } });
  assert.equal(unix.program, "/bin/sh");
  assert.deepEqual(unix.args, ["-lc"]);
});

test("a line runs, its output comes back with the exit code and the time it took", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hive-shell-"));
  try {
    const ran = await runShellLine({ command: "echo hello; echo oops 1>&2; pwd; exit 3", cwd: dir, env: { ...process.env, SHELL: "/bin/sh" } });
    assert.equal(ran.ok, true);
    assert.equal(ran.code, 3);
    assert.equal(ran.cwd, dir);
    assert.ok(ran.output.includes("hello"), ran.output);
    assert.ok(ran.output.includes("oops"), ran.output);
    assert.ok(ran.output.includes(dir), ran.output);
    assert.equal(ran.timedOut, false);
    assert.ok(ran.ms >= 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty or oversized line is refused before any shell starts", async () => {
  assert.equal((await runShellLine({ command: "   " })).ok, false);
  assert.equal((await runShellLine({ command: "x".repeat(SHELL_LINE_MAX + 1) })).ok, false);
});

test("a line that runs too long is stopped and says so", async () => {
  const ran = await runShellLine({ command: "echo before; sleep 5; echo after", timeoutMs: 300, env: { ...process.env, SHELL: "/bin/sh" } });
  assert.equal(ran.ok, true);
  assert.equal(ran.timedOut, true);
  assert.ok(ran.output.includes("before"), ran.output);
  assert.ok(!ran.output.includes("after"), ran.output);
  assert.ok(ran.ms < 3000, `took ${ran.ms}ms`);
});
