import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanPatch, cleanTerminalShell } from "../lib/config.mjs";
import { pickTerminalShell, runnableFile } from "../lib/shell-window.mjs";
import { hiveShellExec } from "../../server/engine/hive-shell.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

test("nobody's choice is the login shell, and a name or a full path is kept", () => {
  const problems = [];
  assert.equal(cleanTerminalShell(undefined, "x", problems), "");
  assert.equal(cleanTerminalShell("", "x", problems), "");
  assert.equal(cleanTerminalShell("  fish ", "x", problems), "fish");
  assert.equal(cleanTerminalShell("/opt/homebrew/bin/fish", "x", problems), "/opt/homebrew/bin/fish");
  assert.equal(cleanTerminalShell("/Applications/My Shell/bin/zsh", "x", problems), "/Applications/My Shell/bin/zsh");
  assert.deepEqual(problems, []);
});

test("a choice that could reach the command line as code is refused and the login shell stays", () => {
  for (const bad of ["$(rm -rf ~)", "zsh; id", "`id`", "fish\"", "it's", "~/bin/zsh", "zsh|cat", 42, "x".repeat(201)]) {
    const problems = [];
    assert.equal(cleanTerminalShell(bad, "x", problems), "", String(bad));
    assert.equal(problems.length, 1, String(bad));
  }
});

test("the settings write the shell through the config patch", () => {
  assert.deepEqual(cleanPatch({ terminalShell: "zsh" }), { clean: { terminalShell: "zsh" }, problems: [] });
  assert.equal(cleanPatch({ terminalShell: "$(id)" }).problems.length, 1);
});

test("a name is looked up on the PATH, a path must run, and anything else falls back to the login shell", () => {
  const files = new Set(["/opt/homebrew/bin/fish", "/bin/zsh"]);
  const runnable = (path) => files.has(path);
  const paths = ["/usr/bin", "/opt/homebrew/bin/", ""];
  assert.equal(pickTerminalShell("", { login: "/bin/zsh", paths, runnable }), "/bin/zsh");
  assert.equal(pickTerminalShell("fish", { login: "/bin/zsh", paths, runnable }), "/opt/homebrew/bin/fish");
  assert.equal(pickTerminalShell("/opt/homebrew/bin/fish", { login: "/bin/zsh", paths, runnable }), "/opt/homebrew/bin/fish");
  assert.equal(pickTerminalShell("nushell", { login: "/bin/zsh", paths, runnable }), "/bin/zsh", "not on the PATH");
  assert.equal(pickTerminalShell("/usr/local/bin/gone", { login: "/bin/zsh", paths, runnable }), "/bin/zsh", "a path that does not run");
  assert.equal(pickTerminalShell("bin/fish", { login: "/bin/zsh", paths, runnable }), "/bin/zsh", "a relative path is not a shell");
});

test("only an executable file counts as a shell", () => {
  const stat = (path) => ({ isFile: () => path !== "/bin" });
  const access = (path) => { if (path === "/etc/passwd") throw new Error("EACCES"); };
  assert.equal(runnableFile("/bin/zsh", { stat, access, executable: 1 }), true);
  assert.equal(runnableFile("/bin", { stat, access, executable: 1 }), false);
  assert.equal(runnableFile("/etc/passwd", { stat, access, executable: 1 }), false);
  assert.equal(runnableFile("/missing", { stat: () => { throw new Error("ENOENT"); }, access, executable: 1 }), false);
});

test("a path with a space reaches tmux as one word", () => {
  assert.match(hiveShellExec("/Applications/My Shell/bin/fish", "/home/dev/.hive"), /^exec '\/Applications\/My Shell\/bin\/fish' -l$/);
});

test("the server reads the choice, says the login shell, and opens and brings back terminals with it", () => {
  assert.ok(server.includes("terminalShell: cleanTerminalShell(raw.terminalShell"), "the config read keeps the choice");
  assert.match(server, /defaults: \{ font: FONT_DEFAULTS, terminalShell: loginShell\(\) \}/, "the settings can show the login shell");
  const open = server.slice(server.indexOf("async function openShell("), server.indexOf("const inFleet ="));
  assert.match(open, /hiveShellExec\(await terminalShell\(\), HIVE_HOME\)/, "a new terminal opens the chosen shell");
  assert.ok(!/process\.env\.SHELL \|\| "bash", HIVE_HOME/.test(server), "no terminal opens the login shell behind the choice");
  assert.equal((server.match(/shell: await terminalShell\(\),/g) || []).length, 2, "both ways a shell comes back use the choice");
});
