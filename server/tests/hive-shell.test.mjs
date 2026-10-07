import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hiveShellExec, hiveShellRcDir, writeHiveShellRc } from "../engine/hive-shell.mjs";

test("the rc pack lands in the state dir and covers bash, zsh and starship", () => {
  const dir = mkdtempSync(join(tmpdir(), "hive-shell-"));
  try {
    const rc = writeHiveShellRc(dir);
    assert.equal(rc, join(dir, "shell"));
    const bash = readFileSync(join(dir, "shell", "rc.bash"), "utf8");
    assert.match(bash, /source "\$HOME\/\.bashrc"/);
    assert.match(bash, /STARSHIP_CONFIG=.*starship\.toml/);
    assert.match(bash, /PROMPT_COMMAND=__hive_prompt/);
    assert.match(bash, /_direnv_hook/);
    const zsh = readFileSync(join(dir, "shell", "zsh", ".zshrc"), "utf8");
    assert.match(zsh, /source "\$HOME\/\.zshrc"/);
    assert.match(zsh, /STARSHIP_CONFIG="\$ZDOTDIR\/\.\.\/starship\.toml"/);
    assert.match(zsh, /precmd_functions\+=\(__hive_prompt\)/);
    assert.equal(readFileSync(join(dir, "shell", "zsh", ".zprofile"), "utf8"), '[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile"\n');
    assert.match(readFileSync(join(dir, "shell", "starship.toml"), "utf8"), /custom\.hive/);
    assert.ok(existsSync(join(dir, "shell", "zsh", "..", "starship.toml")), "the zsh rc points at a starship config that exists");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the exec line takes the hive rc when it is there, the plain shell when it is not", () => {
  assert.equal(hiveShellExec("bash", "/home/.hive"),
    "[ -f /home/.hive/shell/rc.bash ] && exec bash --rcfile /home/.hive/shell/rc.bash -i || exec bash -l");
  assert.equal(hiveShellExec("/usr/bin/zsh", "/home/.hive"),
    "[ -d /home/.hive/shell/zsh ] && ZDOTDIR=/home/.hive/shell/zsh exec /usr/bin/zsh -l || exec /usr/bin/zsh -l");
  assert.equal(hiveShellExec("fish", "/home/.hive"), "exec fish -l");
  assert.equal(hiveShellExec("bash", ""), "exec bash -l");
});

test("a state dir with a space or a quote is still one word to the shell", () => {
  assert.equal(hiveShellExec("bash", "/Users/o'brien/my hive"),
    "[ -f '/Users/o'\\''brien/my hive/shell/rc.bash' ] && exec bash --rcfile '/Users/o'\\''brien/my hive/shell/rc.bash' -i || exec bash -l");
});

test("the rc the shell reads is the one the exec line points at", { skip: !process.env.SHELL }, () => {
  const dir = mkdtempSync(join(tmpdir(), "hive-shell-live-"));
  try {
    writeHiveShellRc(dir);
    assert.ok(existsSync(join(hiveShellRcDir(dir), "rc.bash")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
